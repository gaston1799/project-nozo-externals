/* AutoPlace parity module for NozoNext.
   KBI-assisted place scoring with trap-aware branches and conditional runtime gating. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const state = {
        enabled: true,
        active: false,
        lastTick: 0,
        lastReason: null,
        lastPlace: null
    };

    function _tick() {
        return (Nozo.state && typeof Nozo.state.tick === "number") ? Nozo.state.tick : 0;
    }

    function _dist(a, b) {
        if (!a || !b) return Infinity;
        const ax = typeof a.x2 === "number" ? a.x2 : a.x;
        const ay = typeof a.y2 === "number" ? a.y2 : a.y;
        const bx = typeof b.x2 === "number" ? b.x2 : b.x;
        const by = typeof b.y2 === "number" ? b.y2 : b.y;
        if (![ax, ay, bx, by].every(Number.isFinite)) return Infinity;
        const dx = bx - ax;
        const dy = by - ay;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function _dir(a, b) {
        if (!a || !b) return null;
        const ax = typeof a.x2 === "number" ? a.x2 : a.x;
        const ay = typeof a.y2 === "number" ? a.y2 : a.y;
        const bx = typeof b.x2 === "number" ? b.x2 : b.x;
        const by = typeof b.y2 === "number" ? b.y2 : b.y;
        if (![ax, ay, bx, by].every(Number.isFinite)) return null;
        return Math.atan2(by - ay, bx - ax);
    }

    function _resolvePlayer(ctx) {
        return (ctx && ctx.player) || (Nozo.state && Nozo.state.player) || null;
    }

    function _resolveEnemy(ctx) {
        const e = (ctx && ctx.enemy) || (Nozo.state && Nozo.state.enemy) || null;
        if (!e) return null;
        return Array.isArray(e) ? (e[0] || null) : e;
    }

    function _resolveObjects(ctx) {
        const liz = (ctx && Array.isArray(ctx.liztobj)) ? ctx.liztobj
            : (Nozo.state && Array.isArray(Nozo.state.liztobj)) ? Nozo.state.liztobj : [];
        const all = (ctx && Array.isArray(ctx.gameObjects)) ? ctx.gameObjects
            : (Nozo.state && Array.isArray(Nozo.state.gameObjects)) ? Nozo.state.gameObjects : [];
        return liz.length ? liz : all;
    }

    function _resolvePlaceItem(player, preferredItem, mode) {
        if (typeof preferredItem === "number") return preferredItem;
        if (!player || !Array.isArray(player.items)) return null;
        // parity target: spikes/traps first for replacer/preplacer, fallback generic place slot
        if (mode === "spike" && typeof player.items[2] === "number") return player.items[2];
        if (mode === "trap" && typeof player.items[4] === "number") return player.items[4];
        if (typeof player.items[2] === "number") return player.items[2];
        return null;
    }

    function _canPlace(context) {
        const ctx = context || {};
        const player = _resolvePlayer(ctx);
        if (!player) return { ok: false, reason: "noPlayer" };
        if (!Nozo.combat || typeof Nozo.combat.canSwing !== "function") return { ok: false, reason: "noCombat" };
        const gate = Nozo.combat.canSwing({ player: player });
        if (!gate.ok) return { ok: false, reason: gate.reason || "blocked" };
        return { ok: true, player: player };
    }

    function _kbiScoreAngle(player, enemy, objects, angle) {
        const kb = Nozo.kbSimulator;
        if (!kb || typeof kb.spikeKB !== "function") return { score: -Infinity, data: { dmg: 0, trap: 0, tp: 0 } };
        const start = {
            x: typeof enemy.x2 === "number" ? enemy.x2 : enemy.x,
            y: typeof enemy.y2 === "number" ? enemy.y2 : enemy.y,
            scale: typeof enemy.scale === "number" ? enemy.scale : 35,
            vel: { x: Math.cos(angle) * 1.5, y: Math.sin(angle) * 1.5 },
            tmpObj: enemy
        };
        const hit = {
            x: typeof player.x2 === "number" ? player.x2 : player.x,
            y: typeof player.y2 === "number" ? player.y2 : player.y,
            scale: typeof player.scale === "number" ? player.scale : 35,
            dmg: 35
        };
        // run deterministic sim without animation side effects
        const out = kb.spikeKB(start, hit, true);
        const events = (out && Array.isArray(out.data)) ? out.data : [];
        let dmg = 0, trap = 0, tp = 0;
        for (let i = 0; i < events.length; i++) {
            if (events[i].id === "spiek") dmg++;
            else if (events[i].id === "trap") trap++;
            else if (events[i].id === "tp") tp++;
        }
        const align = _dir(player, enemy);
        const spreadPenalty = (align == null) ? 0 : Math.abs(Math.atan2(Math.sin(angle - align), Math.cos(angle - align))) / Math.PI;
        const score = (dmg * 4.5) + (trap * 26) - (tp * 22) - (spreadPenalty * 5);
        return { score: score, data: { dmg: dmg, trap: trap, tp: tp } };
    }

    function _buildAngleFan(base, start, end, step) {
        const out = [];
        const s = Math.max(0.0001, Math.abs(step || (Math.PI / 24)));
        out.push(base);
        for (let off = s; off <= end + 1e-9; off += s) out.push(base + off);
        for (let off2 = s; off2 <= Math.abs(start) + 1e-9; off2 += s) out.push(base - off2);
        return out;
    }

    function _pickBest(player, enemy, objects, baseAim, range, step) {
        const fan = _buildAngleFan(baseAim, -range, range, step);
        let best = null;
        for (let i = 0; i < fan.length; i++) {
            const ang = fan[i];
            const s = _kbiScoreAngle(player, enemy, objects, ang);
            if (!best || s.score > best.score) best = { angle: ang, score: s.score, data: s.data };
        }
        return best;
    }

    function requestPlace(opts) {
        const o = opts || {};
        const angle = Number(o.angle);
        if (!isFinite(angle)) return { ok: false, reason: "invalidAngle" };
        if (!Nozo.packet || typeof Nozo.packet.sendSelectItem !== "function" || typeof Nozo.packet.sendPlace !== "function") {
            if (Nozo.log) Nozo.log("error:autoPlace:noPacketModule", { angle: angle });
            return { ok: false, reason: "noPacketModule" };
        }

        const gate = _canPlace(o.context || null);
        if (!gate.ok) return { ok: false, reason: gate.reason };
        const player = gate.player;
        const item = _resolvePlaceItem(player, o.item, o.mode);
        if (item == null) return { ok: false, reason: "noPlaceItem" };

        const selected = Nozo.packet.sendSelectItem(item, false);
        const placed = Nozo.packet.sendPlace(1, angle);
        state.lastPlace = {
            tick: _tick(),
            angle: angle,
            item: item,
            mode: o.mode || "default",
            selected: !!selected,
            placed: !!placed,
            tag: o.tag || "autoPlace"
        };
        state.lastReason = placed ? "placed" : "sendFail";
        if (Nozo.log) Nozo.log("autoPlace:requestPlace", state.lastPlace);
        return { ok: !!placed, reason: placed ? null : "sendFail", detail: state.lastPlace };
    }

    function step(context) {
        const ctx = context || {};
        state.lastTick = _tick();
        if (!state.enabled) return { ok: false, reason: "disabled" };

        const player = _resolvePlayer(ctx);
        const enemy = _resolveEnemy(ctx);
        if (!player || !enemy) {
            if (Nozo.instaKill && typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            state.active = false;
            state.lastReason = "noPlayerEnemy";
            return { ok: false, reason: "noPlayerEnemy" };
        }

        const gate = _canPlace(ctx);
        if (!gate.ok) {
            if (Nozo.instaKill && typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            state.active = false;
            state.lastReason = gate.reason;
            return { ok: false, reason: gate.reason };
        }

        const objects = _resolveObjects(ctx);
        const trapsState = ctx.traps || (Nozo.state && Nozo.state.traps) || null;
        const inTrap = !!(trapsState && trapsState.inTrap);
        const d = _dist(player, enemy);
        if (!isFinite(d) || d > 500) {
            if (Nozo.instaKill && typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            state.active = false;
            state.lastReason = "enemyFar";
            return { ok: false, reason: "enemyFar" };
        }

        const baseAim = (Nozo.combat && Nozo.combat.calculateAim) ? Nozo.combat.calculateAim(ctx) : null;
        const base = (baseAim && baseAim.ok && isFinite(baseAim.angle)) ? baseAim.angle : _dir(player, enemy);
        if (base == null) {
            if (Nozo.instaKill && typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            state.active = false;
            state.lastReason = "noAim";
            return { ok: false, reason: "noAim" };
        }

        // conditional-on model:
        // - in trap -> tighter fan around aim
        // - near threat -> wider fan
        const range = inTrap ? (Math.PI / 2) : (Math.PI * 2);
        const step = inTrap ? (Math.PI / 32) : (Math.PI / 24);
        const best = _pickBest(player, enemy, objects, base, range, step);
        if (!best || !isFinite(best.angle)) {
            if (Nozo.instaKill && typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            state.active = false;
            state.lastReason = "noCandidate";
            return { ok: false, reason: "noCandidate" };
        }

        // Wiring-only parity: mirror legacy instaC readiness flips from KBI/place context.
        if (Nozo.instaKill) {
            const canSpikeTick = !!(best.data && best.data.trap > 0);
            if (typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(canSpikeTick);
            if (typeof Nozo.instaKill.setPending === "function") {
                Nozo.instaKill.setPending(canSpikeTick, "kbi.instaThem", enemy && enemy.sid != null ? enemy.sid : null);
            }
            if (Nozo.instaKill.state) Nozo.instaKill.state.canSpikeTick = canSpikeTick;
        }

        const mode = (best.data && best.data.trap > 0) ? "trap" : "spike";
        const placed = requestPlace({
            angle: best.angle,
            mode: mode,
            tag: "autoPlace.step",
            context: ctx
        });
        state.active = !!placed.ok;
        state.lastReason = placed.ok ? "placed" : placed.reason;
        return placed;
    }

    const api = {
        state: state,
        setEnabled: function setEnabled(flag) {
            state.enabled = !!flag;
            if (Nozo.log) Nozo.log("autoPlace:setEnabled", { enabled: state.enabled });
        },
        requestPlace: requestPlace,
        step: step,
        scoreAngle: _kbiScoreAngle
    };

    Nozo.autoPlace = api;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.autoPlace = api;
})();
