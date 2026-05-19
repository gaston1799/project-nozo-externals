/* Movement/pathfinding foundation for NozoNext. Sends only via Nozo.packet.sendMove. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const maxHistory = (Nozo.constants && Nozo.constants.MAX_LOG) || 64;
    const _history = [];

    function _record(kind, detail) {
        _history.push({ kind: kind, detail: detail || null, t: Date.now() });
        if (_history.length > maxHistory) _history.shift();
    }

    function _currentTick() {
        return (Nozo.state && typeof Nozo.state.tick === "number") ? Nozo.state.tick : 0;
    }

    // Movement state — separate from combat/traps/autoBreak state.
    const state = {
        enabled:       false,  // off by default; toggled via html menu
        target:        null,   // { x, y } world position
        path:          null,   // array of { x, y } waypoints
        lastMoveDir:   null,   // last angle sent (radians)
        lastMoveTick:  null,   // game tick of last send
        lastMoveTime:  null,   // Date.now() of last send
        blockedReason: null,   // reason string when step() was blocked
        strategy:      "direct", // active strategy name
        active:        false   // true while a target or path is set
    };

    function setEnabled(flag) {
        state.enabled = !!flag;
        if (Nozo.log) Nozo.log("movement:setEnabled", { enabled: state.enabled });
    }

    // --- strategy registry -----------------------------------------------

    const _strategies = {};

    function setStrategy(name, impl) {
        if (!name || typeof name !== "string" || typeof impl !== "function") return;
        _strategies[name] = impl;
    }

    // Default: straight-line angle from player to current target.
    setStrategy("direct", function directStrategy(context) {
        const player = (context && context.player) || (Nozo.state && Nozo.state.player) || null;
        const target = (context && context.target) || state.target;
        if (!player || !target) return null;
        if (typeof player.x !== "number" || typeof player.y !== "number") return null;
        if (typeof target.x !== "number" || typeof target.y !== "number") return null;
        return Math.atan2(target.y - player.y, target.x - player.x);
    });

    function computePath(context) {
        const stratName = state.strategy || "direct";
        const strat = _strategies[stratName] || _strategies["direct"] || null;
        if (typeof strat !== "function") return null;
        return strat(context || {});
    }

    // --- target/path management ------------------------------------------

    function setTarget(target) {
        if (!target || typeof target.x !== "number" || typeof target.y !== "number") {
            state.blockedReason = "invalid-target";
            return { ok: false, reason: "invalid-target" };
        }
        state.target = { x: target.x, y: target.y };
        state.active = true;
        _record("target:set", { x: target.x, y: target.y });
        if (Nozo.log) Nozo.log("movement:target:set", { x: target.x, y: target.y });
        return { ok: true };
    }

    function clearTarget(reason) {
        const prev = state.target;
        state.target = null;
        if (!state.path || !state.path.length) state.active = false;
        _record("target:clear", { reason: reason || null, was: prev });
        if (Nozo.log) Nozo.log("movement:target:clear", { reason: reason || null });
    }

    function setPath(path) {
        if (!Array.isArray(path)) return { ok: false, reason: "invalid-path" };
        state.path = path.slice();
        state.active = state.path.length > 0;
        _record("path:set", { length: state.path.length });
        if (Nozo.log) Nozo.log("movement:path:set", { length: state.path.length });
        return { ok: true };
    }

    function clearPath(reason) {
        const prevLen = state.path ? state.path.length : 0;
        state.path = null;
        if (!state.target) state.active = false;
        _record("path:clear", { reason: reason || null, was: prevLen });
        if (Nozo.log) Nozo.log("movement:path:clear", { reason: reason || null });
    }

    // --- gating ----------------------------------------------------------

    function canMove(context) {
        const ctx = context || {};
        const tick = _currentTick();
        const player = ctx.player || (Nozo.state && Nozo.state.player) || null;

        if (!player) {
            return { ok: false, reason: "no-player", debug: { tick: tick } };
        }

        const hasTarget = !!state.target;
        const hasPath = !!(state.path && state.path.length);
        if (!hasTarget && !hasPath) {
            return { ok: false, reason: "no-target", debug: { tick: tick } };
        }

        if (!Nozo.packet) {
            return { ok: false, reason: "no-packet-module", debug: { tick: tick } };
        }

        const ws = typeof Nozo.packet.getSocket === "function" ? Nozo.packet.getSocket() : null;
        if (!ws || ws.readyState !== 1) {
            return { ok: false, reason: "socket", debug: { readyState: ws ? ws.readyState : -1, tick: tick } };
        }

        // Respect manual override gate from context.
        if (ctx.manualOverride === true) {
            return { ok: false, reason: "manual-override", debug: { tick: tick } };
        }

        return { ok: true, reason: null, debug: { tick: tick } };
    }

    // --- direction computation -------------------------------------------

    function computeMoveDir(context) {
        const ctx = context || {};

        // Follow the leading path waypoint when a path exists.
        if (state.path && state.path.length > 0) {
            const player = ctx.player || (Nozo.state && Nozo.state.player) || null;
            const waypoint = state.path[0];
            if (player && waypoint &&
                typeof player.x === "number" && typeof player.y === "number" &&
                typeof waypoint.x === "number" && typeof waypoint.y === "number") {
                return Math.atan2(waypoint.y - player.y, waypoint.x - player.x);
            }
        }

        // Fall through to the active strategy (default: direct).
        return computePath(ctx);
    }

    // --- movement send ---------------------------------------------------

    function sendMove(angle, context) {
        if (typeof angle !== "number" || !isFinite(angle)) {
            _record("move:blocked", { reason: "invalid-angle", angle: angle });
            return { ok: false, reason: "invalid-angle" };
        }
        if (!Nozo.packet || typeof Nozo.packet.sendMove !== "function") {
            _record("move:blocked", { reason: "no-packet-module" });
            return { ok: false, reason: "no-packet-module" };
        }
        const sent = Nozo.packet.sendMove(angle, 1);
        const tick = _currentTick();
        state.lastMoveDir  = angle;
        state.lastMoveTick = tick;
        state.lastMoveTime = Date.now();
        _record("move:send", { angle: angle, sent: !!sent, tick: tick });
        if (Nozo.log) Nozo.log("movement:send", { angle: angle, sent: !!sent, tick: tick });
        return { ok: true, sent: !!sent };
    }

    // --- tick step -------------------------------------------------------

    function step(context) {
        const ctx = context || {};

        if (!state.enabled) {
            state.blockedReason = "disabled";
            return { ok: false, reason: "disabled" };
        }

        const gate = canMove(ctx);
        if (!gate.ok) {
            state.blockedReason = gate.reason;
            _record("step:blocked", { reason: gate.reason });
            return { ok: false, reason: gate.reason, debug: gate.debug };
        }

        const angle = computeMoveDir(ctx);
        if (angle === null || angle === undefined || !isFinite(angle)) {
            state.blockedReason = "no-dir";
            _record("step:blocked", { reason: "no-dir" });
            return { ok: false, reason: "no-dir" };
        }

        state.blockedReason = null;
        return sendMove(angle, ctx);
    }

    // --- debug / history -------------------------------------------------

    function getDebugState() {
        return {
            state:      Object.assign({}, state),
            strategies: Object.keys(_strategies),
            tick:       _currentTick(),
            time:       Date.now()
        };
    }

    function getHistory() {
        return _history.slice();
    }

    // --- public API ------------------------------------------------------

    const movement = {
        state:         state,
        setEnabled:    setEnabled,
        setTarget:     setTarget,
        clearTarget:   clearTarget,
        setPath:       setPath,
        clearPath:     clearPath,
        step:          step,
        canMove:       canMove,
        computeMoveDir: computeMoveDir,
        sendMove:      sendMove,
        setStrategy:   setStrategy,
        computePath:   computePath,
        getDebugState: getDebugState,
        getHistory:    getHistory
    };

    Nozo.movement = movement;
    Nozo.state = Nozo.state || {};
    Nozo.state.movement = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.movement = movement;
})();
