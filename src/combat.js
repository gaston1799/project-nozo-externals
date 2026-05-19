/* Combat/aim foundation for NozoNext. All D and K packet sends go through this module. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const maxHistory = (Nozo.constants && Nozo.constants.MAX_LOG) || 64;
    const _history = [];

    // Approximate weapon ranges in world units. Index = weaponIndex from player updates.
    // Values are intentionally conservative; actual ranges vary by weapon variant.
    const _weaponRanges = {
        0: 35, 1: 35, 2: 110, 3: 140, 4: 170,
        5: 130, 6: 140, 7: 160, 8: 180, 9: 130,
        10: 115, 11: 130, 12: 130, 13: 130, 14: 130
    };

    function getWeaponRange(weaponIndex) {
        // Try parsed catalog from initData (populated by net-events A handler).
        const s = Nozo.state;
        if (s && s.itemsData && Array.isArray(s.itemsData.list) && weaponIndex != null) {
            const entry = s.itemsData.list[weaponIndex];
            if (entry && typeof entry.range === "number" && entry.range > 0) {
                return entry.range;
            }
        }
        if (weaponIndex != null && _weaponRanges[weaponIndex] != null) {
            return _weaponRanges[weaponIndex];
        }
        return 35;
    }

    function _record(kind, detail) {
        _history.push({ kind: kind, detail: detail || null, t: Date.now() });
        if (_history.length > maxHistory) _history.shift();
    }

    function _currentTick() {
        return (Nozo.state && typeof Nozo.state.tick === "number") ? Nozo.state.tick
            : (Nozo.state && Nozo.state.game && typeof Nozo.state.game.tick === "number") ? Nozo.state.game.tick
            : 0;
    }

    // Live combat state — reachable at Nozo.state.combat and Nozo.combat.state.
    const state = {
        lastDirAngle:    null,
        lastDirTag:      null,
        lastDirTick:     null,
        lastDirTime:     null,
        lastGatherTag:   null,
        lastGatherTick:  null,
        lastGatherTime:  null,
        lastBlockReason: null,
        weaponRange:     35,
        aimAngle:        null,
        aimSource:       null,
        reloadGate:      null,
        lastSwingAt:     null
    };

    function updateWeaponRange(context) {
        const ctx = context || {};
        const player = ctx.player || (Nozo.state && Nozo.state.player) || null;
        if (!player) return;
        const wi = player.weaponIndex;
        if (wi != null) state.weaponRange = getWeaponRange(wi);
    }

    // --- aim lock --------------------------------------------------------

    let _aimLock = null;

    function setAimLock(angle, tag, ticksOrExpireTick) {
        if (typeof angle !== "number" || !isFinite(angle)) return;
        const tick = _currentTick();
        let expireTick;
        if (typeof ticksOrExpireTick === "number" && ticksOrExpireTick > tick) {
            expireTick = ticksOrExpireTick;
        } else {
            expireTick = tick + (typeof ticksOrExpireTick === "number" ? ticksOrExpireTick : 1);
        }
        _aimLock = { angle: angle, tag: tag || "lock", expireTick: expireTick, t: Date.now() };
        _record("aimLock:set", { angle: angle, tag: _aimLock.tag, expireTick: expireTick });
        if (Nozo.log) Nozo.log("combat:aimLock:set", { angle: angle, tag: _aimLock.tag, expireTick: expireTick });
    }

    function clearAimLock(tag) {
        if (_aimLock && (!tag || _aimLock.tag === tag)) {
            const prev = _aimLock;
            _aimLock = null;
            _record("aimLock:clear", { tag: tag || null });
            if (Nozo.log) Nozo.log("combat:aimLock:clear", { tag: tag || null, was: prev.tag });
        }
    }

    function getActiveAim(context) {
        if (!_aimLock) return null;
        const tick = _currentTick();
        if (tick > _aimLock.expireTick) {
            _record("aimLock:expired", { tag: _aimLock.tag, tick: tick, expireTick: _aimLock.expireTick });
            _aimLock = null;
            return null;
        }
        return _aimLock;
    }

    // --- aim resolver ----------------------------------------------------
    // Priority: aimLock → context.aim → traps.aim → autoBreak.aim →
    //           enemy position → mouse fallback → blocked

    function calculateAim(context) {
        const ctx = context || {};
        const dbg = { sources: [] };

        // 1. active aim lock
        const lock = getActiveAim(ctx);
        if (lock) {
            dbg.sources.push("aimLock");
            return { ok: true, angle: lock.angle, source: "aimLock", tag: lock.tag, debug: dbg };
        }

        // 2. explicit context.aim
        if (typeof ctx.aim === "number" && isFinite(ctx.aim)) {
            dbg.sources.push("context.aim");
            return { ok: true, angle: ctx.aim, source: "context.aim", debug: dbg };
        }

        // 3. traps.aim
        const trapsState = ctx.traps || (Nozo.state && Nozo.state.traps) || null;
        if (trapsState && typeof trapsState.aim === "number" && isFinite(trapsState.aim)) {
            dbg.sources.push("traps.aim");
            return { ok: true, angle: trapsState.aim, source: "traps.aim", debug: dbg };
        }

        // 4. autoBreak.aim
        const abState = ctx.autoBreak || (Nozo.state && Nozo.state.autoBreak) || null;
        if (abState && typeof abState.aim === "number" && isFinite(abState.aim)) {
            dbg.sources.push("autoBreak.aim");
            return { ok: true, angle: abState.aim, source: "autoBreak.aim", debug: dbg };
        }

        // 5. enemy direction from player/enemy positions
        const player = ctx.player || (Nozo.state && Nozo.state.player) || null;
        const enemy = ctx.enemy || (Nozo.state && Nozo.state.enemy) || null;
        if (player && enemy) {
            const target = Array.isArray(enemy) ? (enemy.length ? enemy[0] : null) : enemy;
            if (target &&
                typeof target.x === "number" && typeof target.y === "number" &&
                typeof player.x === "number" && typeof player.y === "number") {
                const angle = Math.atan2(target.y - player.y, target.x - player.x);
                dbg.sources.push("enemy.position");
                return { ok: true, angle: angle, source: "enemy.position", debug: dbg };
            }
        }

        // 6. mouse fallback from Nozo.input.getMouse()
        if (Nozo.input && typeof Nozo.input.getMouse === "function") {
            const mouse = Nozo.input.getMouse();
            if (player &&
                typeof player.screenX === "number" && typeof player.screenY === "number") {
                const angle = Math.atan2(mouse.y - player.screenY, mouse.x - player.screenX);
                dbg.sources.push("mouse.fromPlayer");
                return { ok: true, angle: angle, source: "mouse.fromPlayer", debug: dbg };
            }
            const cx = typeof ctx.canvasWidth === "number" ? ctx.canvasWidth / 2
                : (root.innerWidth || 800) / 2;
            const cy = typeof ctx.canvasHeight === "number" ? ctx.canvasHeight / 2
                : (root.innerHeight || 600) / 2;
            const angle = Math.atan2(mouse.y - cy, mouse.x - cx);
            dbg.sources.push("mouse.fromCenter");
            return { ok: true, angle: angle, source: "mouse.fromCenter", debug: dbg };
        }

        // 7. blocked — no aim data available
        dbg.sources.push("blocked");
        return { ok: false, angle: null, source: "none", reason: "noAimData", debug: dbg };
    }

    // --- reload gate -----------------------------------------------------

    function _resolveReloadState(context) {
        const ctx = context || {};
        const player = ctx.player || (Nozo.state && Nozo.state.player) || null;

        let weapon = ctx.weapon;
        if (weapon === undefined && player) {
            weapon = player.weaponIndex;
        }

        let reload = ctx.reload;
        if (reload === undefined && player && player.reloads && weapon !== undefined) {
            reload = Number(player.reloads[weapon]) || 0;
        }

        const pingTime = ctx.pingTime !== undefined ? ctx.pingTime
            : (Nozo.state && Nozo.state.pingTime !== undefined) ? Nozo.state.pingTime
            : 0;

        return { weapon: weapon, reload: reload, pingTime: pingTime };
    }

    function canSwing(context) {
        const ctx = context || {};
        const tick = _currentTick();
        const time = Date.now();

        if (ctx.macro === true && ctx.allowMacro !== true) {
            return { ok: false, reason: "macro",
                debug: { macro: true, tick: tick, time: time } };
        }

        if (!Nozo.packet) {
            return { ok: false, reason: "noPacketModule",
                debug: { tick: tick, time: time } };
        }

        const ws = typeof Nozo.packet.getSocket === "function" ? Nozo.packet.getSocket() : null;
        if (!ws || ws.readyState !== 1) {
            return { ok: false, reason: "socketNotReady",
                debug: { readyState: ws ? ws.readyState : -1, tick: tick, time: time } };
        }

        const rs = _resolveReloadState(ctx);
        const weapon = rs.weapon;
        const reload = rs.reload;
        const pingTime = rs.pingTime;

        if (weapon === undefined || weapon === null) {
            return { ok: false, reason: "noWeapon",
                debug: { weapon: weapon, reload: reload, pingTime: pingTime, tick: tick, time: time, source: "canSwing" } };
        }

        // Reload ready when reload <= pingTime or reload <= 0 (legacy bug-fix rule).
        if (reload !== undefined && reload > Math.max(pingTime, 0)) {
            return { ok: false, reason: "reload",
                debug: { weapon: weapon, reload: reload, pingTime: pingTime, tick: tick, time: time, source: "canSwing" } };
        }

        return { ok: true, reason: null,
            debug: { weapon: weapon, reload: reload, pingTime: pingTime, tick: tick, time: time, source: "canSwing" } };
    }

    // --- packet senders --------------------------------------------------
    // sendDirection is the ONLY D-packet sender in this pipeline.
    // sendGather is the ONLY auto-gather swing sender.
    // Direct F attack packets are intentionally unsupported in this pipeline.

    function sendDirection(angle, tag, context) {
        if (typeof angle !== "number" || !isFinite(angle)) {
            const detail = { blocked: true, reason: "invalidAngle", angle: angle, tag: tag || null };
            _record("D:blocked", detail);
            return { ok: false, reason: "invalidAngle" };
        }
        if (!Nozo.packet || typeof Nozo.packet.sendDirection !== "function") {
            const detail = { blocked: true, reason: "noPacketModule", angle: angle, tag: tag || null };
            _record("D:blocked", detail);
            return { ok: false, reason: "noPacketModule" };
        }
        const sent = Nozo.packet.sendDirection(angle, tag);
        const detail = { angle: angle, tag: tag || null, sent: !!sent, t: Date.now() };
        _record("D:send", detail);
        state.lastDirAngle = angle;
        state.lastDirTag = tag || null;
        state.lastDirTick = _currentTick();
        state.lastDirTime = Date.now();
        state.aimAngle = angle;
        state.aimSource = tag || null;
        return { ok: true, sent: !!sent };
    }

    function sendGather(tag, context) {
        if (!Nozo.packet || typeof Nozo.packet.sendGather !== "function") {
            const detail = { blocked: true, reason: "noPacketModule", tag: tag || null };
            _record("K:blocked", detail);
            return { ok: false, reason: "noPacketModule" };
        }
        const sent = Nozo.packet.sendGather();
        const detail = { tag: tag || null, sent: !!sent, t: Date.now() };
        _record("K:send", detail);
        state.lastGatherTag = tag || null;
        state.lastGatherTick = _currentTick();
        state.lastGatherTime = Date.now();
        return { ok: true, sent: !!sent };
    }

    // swingAt: reload check → sendDirection → sendGather.
    function swingAt(angle, tag, context) {
        const ctx = context || {};

        const swingCheck = canSwing(ctx);
        if (!swingCheck.ok) {
            const detail = { blocked: true, reason: swingCheck.reason, angle: angle, tag: tag || null, debug: swingCheck.debug };
            _record("swing:blocked", detail);
            state.lastBlockReason = swingCheck.reason;
            if (Nozo.log) Nozo.log("combat:swing:blocked", detail);
            return { ok: false, reason: swingCheck.reason, debug: swingCheck.debug };
        }

        const dirResult = sendDirection(angle, tag, ctx);
        if (!dirResult.ok) {
            const detail = { blocked: true, reason: dirResult.reason, angle: angle, tag: tag || null };
            _record("swing:blocked", detail);
            state.lastBlockReason = dirResult.reason;
            if (Nozo.log) Nozo.log("combat:swing:blocked", detail);
            return { ok: false, reason: dirResult.reason };
        }

        const gatherResult = sendGather(tag, ctx);
        const detail = { angle: angle, tag: tag || null, dirSent: dirResult.sent, gatherSent: gatherResult.ok };
        _record("swing:sent", detail);
        state.lastBlockReason = null;
        state.lastSwingAt = Date.now();
        state.reloadGate = null;
        if (Nozo.log) Nozo.log("combat:swing:sent", detail);
        return { ok: true, dir: dirResult, gather: gatherResult };
    }

    // --- manual swing ----------------------------------------------------

    function manualSwing(reason, context) {
        const ctx = context || {};
        const aimResult = calculateAim(ctx);

        _record("manualSwing", { reason: reason || "manual", aim: aimResult });
        if (Nozo.log) Nozo.log("combat:manualSwing", { reason: reason || "manual", aim: aimResult });

        if (!aimResult.ok) {
            state.lastBlockReason = "noAim:" + (aimResult.reason || "none");
            return { ok: false, reason: "noAim", detail: aimResult };
        }

        return swingAt(aimResult.angle, reason || "manual", ctx);
    }

    // --- input wiring ----------------------------------------------------
    // wireInput registers a callback so left/right manual swing events enter manualSwing.
    // Does not auto-attach to canvas; does not send packets directly from input callbacks.

    function wireInput(inputModule) {
        if (!inputModule || typeof inputModule.onManualSwing !== "function") {
            if (Nozo.log) Nozo.log("combat:wireInput:blocked", { reason: "no valid input module" });
            return { ok: false, reason: "no valid input module" };
        }
        inputModule.onManualSwing(function onSwingFromInput(snapshot) {
            manualSwing(snapshot && snapshot.reason ? snapshot.reason : "manual", snapshot || {});
        });
        _record("wireInput", { ok: true });
        if (Nozo.log) Nozo.log("combat:wireInput", { ok: true });
        return { ok: true };
    }

    // --- public API ------------------------------------------------------

    function getHistory() {
        return _history.slice();
    }

    function getDebugState() {
        return {
            aimLock: _aimLock ? Object.assign({}, _aimLock) : null,
            state:   Object.assign({}, state),
            tick:    _currentTick(),
            time:    Date.now()
        };
    }

    const combat = {
        state:              state,
        setAimLock:         setAimLock,
        clearAimLock:       clearAimLock,
        getActiveAim:       getActiveAim,
        calculateAim:       calculateAim,
        canSwing:           canSwing,
        sendDirection:      sendDirection,
        sendGather:         sendGather,
        swingAt:            swingAt,
        manualSwing:        manualSwing,
        wireInput:          wireInput,
        getHistory:         getHistory,
        getDebugState:      getDebugState,
        getWeaponRange:     getWeaponRange,
        updateWeaponRange:  updateWeaponRange
    };

    Nozo.combat = combat;
    Nozo.state = Nozo.state || {};
    Nozo.state.combat = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.combat = combat;
})();
