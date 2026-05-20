/* Preplacer parity module for NozoNext.
   Predictive placement around active enemy windows with conditional trigger gating. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const state = {
        enabled: true,
        intervalTicks: 3,
        lastTick: -999,
        lastReason: null
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

    function _resolveEnemy(ctx) {
        const e = (ctx && ctx.enemy) || (Nozo.state && Nozo.state.enemy) || null;
        if (!e) return null;
        return Array.isArray(e) ? (e[0] || null) : e;
    }

    function step(context) {
        if (!state.enabled) return { ok: false, reason: "disabled" };
        const tick = _tick();
        if ((tick - state.lastTick) < state.intervalTicks) return { ok: false, reason: "interval" };
        state.lastTick = tick;

        const ctx = context || {};
        const player = ctx.player || (Nozo.state && Nozo.state.player) || null;
        const enemy = _resolveEnemy(ctx);
        if (!player || !enemy) {
            state.lastReason = "noPlayerEnemy";
            return { ok: false, reason: "noPlayerEnemy" };
        }
        const d = _dist(player, enemy);
        if (!isFinite(d) || d > 500) {
            state.lastReason = "enemyFar";
            return { ok: false, reason: "enemyFar" };
        }
        if (!Nozo.autoPlace || typeof Nozo.autoPlace.requestPlace !== "function" || typeof Nozo.autoPlace.step !== "function") {
            state.lastReason = "noAutoPlace";
            return { ok: false, reason: "noAutoPlace" };
        }

        const trapsState = (ctx && ctx.traps) || (Nozo.state && Nozo.state.traps) || null;
        const inTrap = !!(trapsState && trapsState.inTrap);
        const baseAim = (Nozo.combat && Nozo.combat.calculateAim) ? Nozo.combat.calculateAim(ctx) : null;
        const aim = (baseAim && baseAim.ok && isFinite(baseAim.angle)) ? baseAim.angle : Math.atan2((enemy.y2 ?? enemy.y) - (player.y2 ?? player.y), (enemy.x2 ?? enemy.x) - (player.x2 ?? player.x));

        // conditional-on: only preplace if threat window is actionable
        if (inTrap || d <= 260) {
            const placed = Nozo.autoPlace.requestPlace({
                angle: aim,
                mode: "spike",
                tag: "preplacer",
                context: ctx
            });
            state.lastReason = placed.ok ? "placed" : placed.reason;
            if (Nozo.log) Nozo.log("preplacer:step", { ok: placed.ok, reason: state.lastReason, dist: d, inTrap: inTrap });
            return placed;
        }

        state.lastReason = "windowClosed";
        return { ok: false, reason: "windowClosed" };
    }

    const api = {
        state: state,
        setEnabled: function setEnabled(flag) {
            state.enabled = !!flag;
            if (Nozo.log) Nozo.log("preplacer:setEnabled", { enabled: state.enabled });
        },
        step: step
    };

    Nozo.preplacer = api;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.preplacer = api;
})();
