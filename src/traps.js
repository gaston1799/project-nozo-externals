/* Traps target and aim module for NozoNext. Detects enemy traps near the player,
   computes an aim angle, and stores it for Nozo.combat.calculateAim.
   No packet sends. No placement logic. */
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
        return (Nozo.state && typeof Nozo.state.tick === "number") ? Nozo.state.tick
            : (Nozo.state && Nozo.state.game && typeof Nozo.state.game.tick === "number") ? Nozo.state.game.tick
            : 0;
    }

    // Lazy-initialized Utils instance — prefer Nozo.createUtils() then Nozo.Utils.
    let _utils = null;
    function _getUtils() {
        if (_utils) return _utils;
        try {
            if (typeof Nozo.createUtils === "function") { _utils = Nozo.createUtils(); return _utils; }
            if (typeof Nozo.Utils === "function") { _utils = new Nozo.Utils(); return _utils; }
        } catch (e) {}
        return null;
    }

    // Distance between two objects using x2/y2 then x/y coords.
    // Uses Nozo.Utils.getDistance when available, otherwise local math.
    function _dist(a, b) {
        if (!a || !b) return Infinity;
        const ax = typeof a.x2 === "number" && isFinite(a.x2) ? a.x2 : (typeof a.x === "number" ? a.x : NaN);
        const ay = typeof a.y2 === "number" && isFinite(a.y2) ? a.y2 : (typeof a.y === "number" ? a.y : NaN);
        const bx = typeof b.x2 === "number" && isFinite(b.x2) ? b.x2 : (typeof b.x === "number" ? b.x : NaN);
        const by = typeof b.y2 === "number" && isFinite(b.y2) ? b.y2 : (typeof b.y === "number" ? b.y : NaN);
        if (!isFinite(ax) || !isFinite(ay) || !isFinite(bx) || !isFinite(by)) return Infinity;
        const u = _getUtils();
        if (u && typeof u.getDistance === "function") return u.getDistance(ax, ay, bx, by);
        const dx = bx - ax, dy = by - ay;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Direction from a to b (radians).
    function _dir(a, b) {
        if (!a || !b) return null;
        const ax = typeof a.x2 === "number" && isFinite(a.x2) ? a.x2 : (typeof a.x === "number" ? a.x : NaN);
        const ay = typeof a.y2 === "number" && isFinite(a.y2) ? a.y2 : (typeof a.y === "number" ? a.y : NaN);
        const bx = typeof b.x2 === "number" && isFinite(b.x2) ? b.x2 : (typeof b.x === "number" ? b.x : NaN);
        const by = typeof b.y2 === "number" && isFinite(b.y2) ? b.y2 : (typeof b.y === "number" ? b.y : NaN);
        if (!isFinite(ax) || !isFinite(ay) || !isFinite(bx) || !isFinite(by)) return null;
        const angle = Math.atan2(by - ay, bx - ax);
        return isFinite(angle) ? angle : null;
    }

    function _getObjScale(obj) {
        try { if (typeof obj.getScale === "function") return obj.getScale() || obj.scale || 0; } catch (e) {}
        return (obj && obj.scale) || 0;
    }

    // Conservative team-object check: try obj.isTeamObject first, then owner/team fallback.
    function _isTeamObject(obj, player) {
        if (!obj || !player) return false;
        try { if (typeof obj.isTeamObject === "function") return !!obj.isTeamObject(player); } catch (e) {}
        if (obj.owner && player.sid != null && obj.owner.sid === player.sid) return true;
        if (obj.team != null && player.team != null && obj.team === player.team) return true;
        return false;
    }

    // Resolve object lists: prefer context fields, fall back to Nozo.state.
    // closeObjects is treated as a liztobj fallback per Phase 7 design decision.
    function _resolveObjects(ctx) {
        const gameObjects = (ctx && Array.isArray(ctx.gameObjects)) ? ctx.gameObjects
            : (Nozo.state && Array.isArray(Nozo.state.gameObjects)) ? Nozo.state.gameObjects
            : [];

        let liztobj = (ctx && Array.isArray(ctx.liztobj) && ctx.liztobj.length) ? ctx.liztobj
            : (Nozo.state && Array.isArray(Nozo.state.liztobj) && Nozo.state.liztobj.length) ? Nozo.state.liztobj
            : null;

        if (!liztobj) {
            liztobj = (ctx && Array.isArray(ctx.closeObjects) && ctx.closeObjects.length) ? ctx.closeObjects
                : (Nozo.state && Array.isArray(Nozo.state.closeObjects) && Nozo.state.closeObjects.length) ? Nozo.state.closeObjects
                : [];
        }

        return { gameObjects: gameObjects, liztobj: liztobj };
    }

    function _resolvePlayer(ctx) {
        return (ctx && ctx.player) || (Nozo.state && Nozo.state.player) || null;
    }

    function _resolveEnemy(ctx) {
        const e = (ctx && ctx.enemy) || (Nozo.state && Nozo.state.enemy) || null;
        if (!e) return null;
        if (Array.isArray(e)) return e.length ? e[0] : null;
        return e;
    }

    function _pickViaAutoBreakCalc(player, checkList, targets) {
        const calc = Nozo.autoBreak && Nozo.autoBreak.calc;
        if (!calc || typeof calc.pickBestAim !== "function") return null;
        if (!Array.isArray(targets) || !targets.length) return null;
        const out = calc.pickBestAim(targets, player, checkList, null, 1);
        if (!out || typeof out.aim !== "number" || !isFinite(out.aim)) return null;
        return out;
    }

    // --- live state ----------------------------------------------------------

    const state = {
        enabled:    true,
        inTrap:     false,
        aim:        null,
        target:     null,
        lastScan:   null,
        lastReason: null,
        debug:      null
    };

    function setEnabled(flag) {
        state.enabled = !!flag;
        if (!state.enabled) clearAim("disabled");
        if (Nozo.log) Nozo.log("traps:setEnabled", { enabled: state.enabled });
    }

    let _aimEntry = null;

    function setAim(angle, tag, expireTick) {
        if (typeof angle !== "number" || !isFinite(angle)) return;
        const tick = _currentTick();
        const expire = (typeof expireTick === "number" && expireTick > tick)
            ? expireTick
            : tick + (typeof expireTick === "number" ? expireTick : 2);
        _aimEntry = { angle: angle, tag: tag || "traps", expireTick: expire, t: Date.now() };
        state.aim = angle;
        _record("traps:aim:set", { angle: angle, tag: _aimEntry.tag, expireTick: expire });
    }

    function clearAim(reason) {
        const prev = _aimEntry;
        _aimEntry = null;
        state.aim = null;
        _record("traps:aim:clear", { reason: reason || null, was: prev ? prev.tag : null });
    }

    function getAim(context) {
        if (!_aimEntry) return null;
        const tick = _currentTick();
        if (tick > _aimEntry.expireTick) {
            _record("traps:aim:expired", { tag: _aimEntry.tag, tick: tick });
            _aimEntry = null;
            state.aim = null;
            return null;
        }
        return { angle: _aimEntry.angle, tag: _aimEntry.tag, expireTick: _aimEntry.expireTick };
    }

    // --- scan ----------------------------------------------------------------

    function scan(context) {
        const ctx = context || {};
        const tick = _currentTick();

        if (!state.enabled) {
            _record("traps:scan:skip", { reason: "disabled" });
            return { ok: false, aim: null, target: null, reason: "disabled", debug: { tick: tick } };
        }

        const player = _resolvePlayer(ctx);
        const dbg = { tick: tick, sources: [], objectsChecked: 0, inTrap: false };

        if (!player) {
            state.inTrap = false;
            state.lastScan = tick;
            state.lastReason = "noPlayer";
            state.debug = dbg;
            _record("traps:scan:skip", { reason: "noPlayer" });
            return { ok: false, aim: null, target: null, reason: "noPlayer", debug: dbg };
        }

        const playerScale = (typeof player.scale === "number") ? player.scale : 35;
        const { gameObjects, liztobj } = _resolveObjects(ctx);

        // Use liztobj (close objects) as the primary scan list; fall back to all gameObjects.
        const checkList = liztobj.length ? liztobj : gameObjects;
        dbg.objectsChecked = checkList.length;
        dbg.sources.push(liztobj.length ? "liztobj" : "gameObjects");

        // Find the closest enemy trap that the player is in or very near.
        let closestTrap = null;
        let closestTrapDist = Infinity;

        for (let i = 0; i < checkList.length; i++) {
            const obj = checkList[i];
            if (!obj || !obj.active || !obj.trap) continue;
            if (_isTeamObject(obj, player)) continue;

            const objScale = _getObjScale(obj);
            const d = _dist(player, obj);
            const threshold = playerScale + objScale + 15;

            if (d <= threshold && d < closestTrapDist) {
                closestTrapDist = d;
                closestTrap = obj;
            }
        }

        const inTrap = !!closestTrap;
        state.inTrap = inTrap;
        dbg.inTrap = inTrap;

        // Determine aim.
        let aimAngle = null;
        let aimTarget = null;
        let aimReason = null;

        if (inTrap) {
            const enemy = _resolveEnemy(ctx);
            const preferredTargets = [];
            if (enemy) preferredTargets.push(enemy);
            if (closestTrap) preferredTargets.push(closestTrap);

            const picked = _pickViaAutoBreakCalc(player, checkList, preferredTargets);
            if (picked) {
                aimAngle = picked.aim;
                aimTarget = picked.target || preferredTargets[0] || null;
                aimReason = "calc.inTrap";
            } else {
                if (enemy) {
                    const a = _dir(player, enemy);
                    if (a !== null) { aimAngle = a; aimTarget = enemy; aimReason = "enemy.whileInTrap"; }
                }
                if (aimAngle === null) {
                    const a = _dir(player, closestTrap);
                    if (a !== null) { aimAngle = a; aimTarget = closestTrap; aimReason = "trap.direct"; }
                }
            }
        } else {
            // Not in a trap, but check for nearby threatening enemy traps so we can
            // supply an early aim hint to combat if needed.
            let nearestThreat = null;
            let nearestThreatDist = Infinity;
            for (let i = 0; i < checkList.length; i++) {
                const obj = checkList[i];
                if (!obj || !obj.active || !obj.trap) continue;
                if (_isTeamObject(obj, player)) continue;
                const d = _dist(player, obj);
                if (d < 200 && d < nearestThreatDist) {
                    nearestThreatDist = d;
                    nearestThreat = obj;
                }
            }
            if (nearestThreat) {
                const enemy = _resolveEnemy(ctx);
                const preferredTargets = [];
                if (enemy) preferredTargets.push(enemy);
                preferredTargets.push(nearestThreat);

                const picked = _pickViaAutoBreakCalc(player, checkList, preferredTargets);
                if (picked) {
                    aimAngle = picked.aim;
                    aimTarget = picked.target || preferredTargets[0] || null;
                    aimReason = "calc.nearThreat";
                } else {
                    const target = enemy || nearestThreat;
                    const a = _dir(player, target);
                    if (a !== null) {
                        aimAngle = a;
                        aimTarget = target;
                        aimReason = "trap.nearThreat";
                    }
                }
            }
        }

        if (aimAngle !== null) {
            setAim(aimAngle, aimReason, tick + 2);
            state.target = aimTarget ? {
                x: aimTarget.x, y: aimTarget.y,
                sid: aimTarget.sid || null,
                trap: !!aimTarget.trap
            } : null;
        } else {
            if (_aimEntry) clearAim("noTrapTarget");
            state.aim = null;
            state.target = null;
            aimReason = "noTrapDetected";
        }

        state.lastScan = tick;
        state.lastReason = aimReason;
        state.debug = dbg;

        const result = {
            ok: aimAngle !== null,
            aim: aimAngle,
            target: state.target,
            inTrap: inTrap,
            reason: aimReason || "noTrapDetected",
            debug: dbg
        };

        _record("traps:scan", { ok: result.ok, inTrap: inTrap, reason: result.reason });
        if (Nozo.log) Nozo.log("traps:scan", result);
        return result;
    }

    // --- debug / history -----------------------------------------------------

    function getDebugState() {
        return {
            aimEntry: _aimEntry ? Object.assign({}, _aimEntry) : null,
            state:    Object.assign({}, state),
            tick:     _currentTick(),
            time:     Date.now()
        };
    }

    function getHistory() {
        return _history.slice();
    }

    // --- public API ----------------------------------------------------------

    const traps = {
        state:         state,
        setEnabled:    setEnabled,
        scan:          scan,
        setAim:        setAim,
        clearAim:      clearAim,
        getAim:        getAim,
        getDebugState: getDebugState,
        getHistory:    getHistory
    };

    Nozo.traps = traps;
    Nozo.state = Nozo.state || {};
    Nozo.state.traps = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.traps = traps;
})();
