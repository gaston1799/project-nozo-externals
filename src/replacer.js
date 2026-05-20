/* Replacer parity module for NozoNext.
   Consumes destroyed-object queue and conditionally performs replacement placement. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const state = {
        enabled: true,
        queue: [],
        cooldownTicks: 2,
        lastPlaceTick: -999,
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

    function enqueueSid(sid) {
        if (sid == null) return false;
        if (state.queue.indexOf(sid) !== -1) return false;
        state.queue.push(sid);
        return true;
    }

    function syncFromState() {
        const src = Nozo.state && Nozo.state.traps && Array.isArray(Nozo.state.traps.replaceSids)
            ? Nozo.state.traps.replaceSids
            : Nozo.state && Array.isArray(Nozo.state.replaceSids)
                ? Nozo.state.replaceSids
                : null;
        if (!src || !src.length) return;
        for (let i = 0; i < src.length; i++) enqueueSid(src[i]);
        src.length = 0;
    }

    function _findObjectBySid(list, sid) {
        if (!Array.isArray(list)) return null;
        for (let i = 0; i < list.length; i++) {
            const o = list[i];
            if (o && o.sid === sid) return o;
        }
        return null;
    }

    function step(context) {
        syncFromState();
        if (!state.enabled) return { ok: false, reason: "disabled" };
        if (!state.queue.length) return { ok: false, reason: "emptyQueue" };
        const tick = _tick();
        if ((tick - state.lastPlaceTick) < state.cooldownTicks) return { ok: false, reason: "cooldown" };
        if (!Nozo.autoPlace || typeof Nozo.autoPlace.requestPlace !== "function" || typeof Nozo.autoPlace.step !== "function") {
            return { ok: false, reason: "noAutoPlace" };
        }

        const ctx = context || {};
        const player = ctx.player || (Nozo.state && Nozo.state.player) || null;
        const enemy = Array.isArray(ctx.enemy) ? ctx.enemy[0] : (ctx.enemy || null);
        if (!player || !enemy) {
            state.lastReason = "noPlayerEnemy";
            return { ok: false, reason: "noPlayerEnemy" };
        }
        const d = _dist(player, enemy);
        if (!isFinite(d) || d > 300) {
            state.lastReason = "enemyFar";
            return { ok: false, reason: "enemyFar" };
        }

        const sid = state.queue.shift();
        const sourceList = (ctx && Array.isArray(ctx.gameObjects)) ? ctx.gameObjects
            : (Nozo.state && Array.isArray(Nozo.state.gameObjects)) ? Nozo.state.gameObjects : [];
        const targetObj = _findObjectBySid(sourceList, sid);
        const aim = targetObj && Nozo.autoPlace.scoreAngle
            ? Math.atan2((targetObj.y2 ?? targetObj.y) - (player.y2 ?? player.y), (targetObj.x2 ?? targetObj.x) - (player.x2 ?? player.x))
            : null;

        const placed = (aim != null && isFinite(aim))
            ? Nozo.autoPlace.requestPlace({ angle: aim, mode: "spike", tag: "replacer", context: ctx })
            : Nozo.autoPlace.step(ctx);

        if (placed.ok) state.lastPlaceTick = tick;
        state.lastReason = placed.ok ? "placed" : placed.reason;
        if (Nozo.log) Nozo.log("replacer:step", {
            sid: sid,
            ok: placed.ok,
            reason: state.lastReason,
            queue: state.queue.length
        });
        return placed;
    }

    const api = {
        state: state,
        setEnabled: function setEnabled(flag) {
            state.enabled = !!flag;
            if (Nozo.log) Nozo.log("replacer:setEnabled", { enabled: state.enabled });
        },
        enqueueSid: enqueueSid,
        syncFromState: syncFromState,
        step: step
    };

    Nozo.replacer = api;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.replacer = api;
})();
