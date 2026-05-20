/* AutoBreak target and aim module for NozoNext. Scans for breakable objects near
   the player, computes the best aim angle, and stores it for Nozo.combat.calculateAim.
   No direct packet sends. To trigger a swing, call requestBreak with context.send === true,
   which routes through Nozo.combat.swingAt. */
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

    // Distance helper: prefer Utils.getDistance, fall back to local math.
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

    // Angle distance helper (symmetric, range [0, π]).
    function _angleDist(a, b) {
        const u = _getUtils();
        if (u && typeof u.getAngleDist === "function") return u.getAngleDist(a, b);
        const p = Math.abs(b - a) % (Math.PI * 2);
        return p > Math.PI ? (Math.PI * 2) - p : p;
    }

    function _getObjScale(obj) {
        const om = Nozo.objectModel;
        if (om) return om.getScale(obj);
        try { if (typeof obj.getScale === "function") return obj.getScale() || obj.scale || 0; } catch (e) {}
        return (obj && obj.scale) || 0;
    }

    // Team-object check via objectModel canonical helper.
    function _isTeamObject(obj, player) {
        if (!obj || !player) return false;
        const om = Nozo.objectModel;
        if (!om || typeof om.isTeamObject !== "function") return false;
        return om.isTeamObject(obj, player);
    }

    // Resolve object lists: prefer context fields, fall back to Nozo.state.
    // closeObjects is treated as a liztobj fallback per Phase 7 design decision.
    function _resolveObjects(ctx) {
        let liztobj = (ctx && Array.isArray(ctx.liztobj) && ctx.liztobj.length) ? ctx.liztobj
            : (Nozo.state && Array.isArray(Nozo.state.liztobj) && Nozo.state.liztobj.length) ? Nozo.state.liztobj
            : null;

        if (!liztobj) {
            liztobj = (ctx && Array.isArray(ctx.closeObjects) && ctx.closeObjects.length) ? ctx.closeObjects
                : (Nozo.state && Array.isArray(Nozo.state.closeObjects) && Nozo.state.closeObjects.length) ? Nozo.state.closeObjects
                : [];
        }

        const gameObjects = (ctx && Array.isArray(ctx.gameObjects)) ? ctx.gameObjects
            : (Nozo.state && Array.isArray(Nozo.state.gameObjects)) ? Nozo.state.gameObjects
            : [];

        return { liztobj: liztobj, gameObjects: gameObjects };
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

    function _resolveTrapsState(ctx) {
        return (ctx && ctx.traps) || (Nozo.state && Nozo.state.traps) || null;
    }

    // --- live state ----------------------------------------------------------

    const state = {
        enabled:    true,
        active:     false,
        aim:        null,
        target:     null,
        lastScan:   null,
        lastReason: null,
        debug:      null
    };

    function setEnabled(flag) {
        state.enabled = !!flag;
        if (!state.enabled) clearAim("disabled");
        if (Nozo.log) Nozo.log("autoBreak:setEnabled", { enabled: state.enabled });
    }

    let _aimEntry = null;

    function setAim(angle, tag, expireTick) {
        if (typeof angle !== "number" || !isFinite(angle)) return;
        const tick = _currentTick();
        const expire = (typeof expireTick === "number" && expireTick > tick)
            ? expireTick
            : tick + (typeof expireTick === "number" ? expireTick : 2);
        _aimEntry = { angle: angle, tag: tag || "autoBreak", expireTick: expire, t: Date.now() };
        state.aim = angle;
        state.active = true;
        _record("autoBreak:aim:set", { angle: angle, tag: _aimEntry.tag, expireTick: expire });
    }

    function clearAim(reason) {
        const prev = _aimEntry;
        _aimEntry = null;
        state.aim = null;
        state.active = false;
        state.target = null;
        _record("autoBreak:aim:clear", { reason: reason || null, was: prev ? prev.tag : null });
    }

    function getAim(context) {
        if (!_aimEntry) return null;
        const tick = _currentTick();
        if (tick > _aimEntry.expireTick) {
            _record("autoBreak:aim:expired", { tag: _aimEntry.tag, tick: tick });
            _aimEntry = null;
            state.aim = null;
            state.active = false;
            return null;
        }
        return { angle: _aimEntry.angle, tag: _aimEntry.tag, expireTick: _aimEntry.expireTick };
    }

    // Returns objects from list that would be hit by a swing at aim angle.
    // Uses π/2.6 sweep half-angle, matching the original AutoBreaker.
    function _objectsHit(aim, player, list) {
        if (!isFinite(aim)) return [];
        const SWEEP = Math.PI / 2.6;
        const results = [];
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!e || !e.active) continue;
            const d = _dist(player, e);
            if (d === Infinity) continue;
            const toObj = _dir(player, e);
            if (toObj === null) continue;
            if (_angleDist(toObj, aim) <= SWEEP) results.push(e);
        }
        return results;
    }

    // Score an aim angle based on what it would hit.
    // level 3 (break-all) inverts scoring of team objects.
    function _scoreAim(aim, player, list, trapsState, level) {
        const hit = _objectsHit(aim, player, list);
        let reward = 0;
        for (let i = 0; i < hit.length; i++) {
            const obj = hit[i];
            const isTeam = _isTeamObject(obj, player);
            if (isTeam) {
                const inTrapSid = trapsState && trapsState.target && trapsState.target.sid;
                if (inTrapSid != null && obj.sid === inTrapSid) {
                    reward -= level !== 3 ? 50 : -50;
                } else if (obj.dmg || obj.trap) {
                    reward -= level !== 3 ? 30 : -50;
                } else {
                    reward -= level !== 3 ? 10 : -50;
                }
            } else {
                if (obj.dmg) reward += 70;
                else if (obj.trap) reward += 60;
                else reward += 50;
            }
        }
        return reward;
    }

    // Pick the best aim and target from a list of target objects.
    // Returns { aim, target } or null.
    function _pickBestAim(targets, player, list, trapsState, level) {
        const valid = [];
        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (!t || !t.active) continue;
            const d = _dir(player, t);
            if (d === null) continue;
            valid.push({ obj: t, dir: d });
        }
        if (!valid.length) return null;

        const seen = new Set();
        const candidates = [];

        // Mid-angles between each pair of targets.
        for (let i = 0; i < valid.length; i++) {
            for (let j = i + 1; j < valid.length; j++) {
                const a = valid[i].dir < 0 ? valid[i].dir + 2 * Math.PI : valid[i].dir;
                const b = valid[j].dir < 0 ? valid[j].dir + 2 * Math.PI : valid[j].dir;
                let avg = (a + b) / 2;
                if (Math.abs(a - b) > Math.PI) avg += Math.PI;
                avg = avg % (2 * Math.PI);
                if (avg > Math.PI) avg -= 2 * Math.PI;
                if (!isFinite(avg) || seen.has(avg)) continue;
                seen.add(avg);
                candidates.push(avg);
            }
        }

        // Direct aim at each target.
        for (let i = 0; i < valid.length; i++) {
            const d = valid[i].dir;
            if (!seen.has(d)) { seen.add(d); candidates.push(d); }
        }

        // For single target also try safer side offsets.
        if (valid.length === 1) {
            const base = valid[0].dir;
            const OFFSETS = [Math.PI / 2.6 / 3, Math.PI / 2.6 / 2, Math.PI / 2.6 - 0.1];
            for (let k = 0; k < OFFSETS.length; k++) {
                const p = base + OFFSETS[k];
                const m = base - OFFSETS[k];
                if (!seen.has(p)) { seen.add(p); candidates.push(p); }
                if (!seen.has(m)) { seen.add(m); candidates.push(m); }
            }
        }

        // Score and pick the highest-reward angle.
        let bestAngle = null;
        let bestReward = -Infinity;
        for (let i = 0; i < candidates.length; i++) {
            const a = candidates[i];
            if (!isFinite(a)) continue;
            const r = _scoreAim(a, player, list, trapsState, level);
            if (r > bestReward) { bestReward = r; bestAngle = a; }
        }

        if (bestAngle === null) return null;

        // Pick the closest hittable target for state.target.
        let bestTarget = null;
        let bestDist = Infinity;
        for (let i = 0; i < valid.length; i++) {
            const d = _dist(player, valid[i].obj);
            if (d < bestDist) { bestDist = d; bestTarget = valid[i].obj; }
        }

        return { aim: bestAngle, target: bestTarget };
    }

    // --- scan ----------------------------------------------------------------

    function scan(context) {
        const ctx = context || {};
        const tick = _currentTick();

        if (!state.enabled) {
            if (Nozo.instaKill && typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            _record("autoBreak:scan:skip", { reason: "disabled" });
            return { ok: false, aim: null, target: null, reason: "disabled", debug: { tick: tick } };
        }

        const player = _resolvePlayer(ctx);
        const dbg = { tick: tick, sources: [], level: -1, candidates: 0 };

        if (!player) {
            if (Nozo.instaKill && typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            clearAim("noPlayer");
            state.lastScan = tick;
            state.lastReason = "noPlayer";
            state.debug = dbg;
            _record("autoBreak:scan:skip", { reason: "noPlayer" });
            return { ok: false, aim: null, target: null, reason: "noPlayer", debug: dbg };
        }

        const { liztobj, gameObjects } = _resolveObjects(ctx);
        const checkList = liztobj.length ? liztobj : gameObjects;
        const trapsState = _resolveTrapsState(ctx);
        const enemy = _resolveEnemy(ctx);

        dbg.sources.push(liztobj.length ? "liztobj" : "gameObjects");
        dbg.candidates = checkList.length;

        // Close enemy spikes (≤ 169px), sorted nearest first.
        const closeSpikes = [];
        for (let i = 0; i < checkList.length; i++) {
            const e = checkList[i];
            if (!e || !e.active || !e.dmg) continue;
            if (_isTeamObject(e, player)) continue;
            if (_dist(player, e) <= 169) closeSpikes.push(e);
        }
        closeSpikes.sort(function (a, b) { return _dist(player, a) - _dist(player, b); });

        // Priority tier construction mirrors original AutoBreaker.priority population.
        // Tier 0: inTrap → closest spikes + the trap object the player is inside.
        // Tier 1: all close spikes.
        // Tier 2: enemy turrets / teleporters / blockers.
        // Tier 3: all enemy non-type-null objects (break-all).
        const priority = [[], [], [], []];

        if (trapsState && trapsState.inTrap) {
            if (closeSpikes[0]) priority[0].push(closeSpikes[0]);
            const ti = trapsState.target;
            if (ti && typeof ti === "object") {
                let trapObj = null;
                if (ti.sid != null) {
                    for (let i = 0; i < checkList.length; i++) {
                        if (checkList[i] && checkList[i].sid === ti.sid) { trapObj = checkList[i]; break; }
                    }
                }
                const candidate = trapObj || ti;
                if (candidate && !priority[0].includes(candidate)) priority[0].push(candidate);
            }
            if (closeSpikes[1] && !priority[0].includes(closeSpikes[1])) priority[0].push(closeSpikes[1]);
        }

        for (let i = 0; i < closeSpikes.length; i++) {
            if (!priority[1].includes(closeSpikes[i])) priority[1].push(closeSpikes[i]);
        }

        for (let i = 0; i < checkList.length; i++) {
            const e = checkList[i];
            if (!e || !e.active || _isTeamObject(e, player)) continue;
            // Use objectModel flags (set by decorateObject) instead of name-string comparisons.
            if (e.turret || e.teleport || e.blocker) {
                if (!priority[2].includes(e)) priority[2].push(e);
            }
        }

        for (let i = 0; i < checkList.length; i++) {
            const e = checkList[i];
            if (!e || !e.active || _isTeamObject(e, player)) continue;
            if (e.type != null) continue;
            if (!priority[3].includes(e)) priority[3].push(e);
        }

        for (let level = 0; level < priority.length; level++) {
            const targets = priority[level].filter(function (o) { return o && o.active; });

            // Level 3 (break-all): bail when an enemy player is close.
            if (level === 3 && enemy && _dist(player, enemy) <= 569) {
                clearAim("enemyNear.breakAll");
                state.lastScan = tick;
                state.lastReason = "enemyNear.breakAll";
                state.debug = dbg;
                return { ok: false, aim: null, target: null, reason: "enemyNear.breakAll", debug: dbg };
            }

            if (!targets.length) continue;

            dbg.level = level;
            const result = _pickBestAim(targets, player, checkList, trapsState, level);
            if (!result) continue;

            setAim(result.aim, "autoBreak:L" + level, tick + 2);
            state.target = result.target ? {
                x:    result.target.x,
                y:    result.target.y,
                sid:  result.target.sid || null,
                dmg:  !!result.target.dmg,
                trap: !!result.target.trap
            } : null;

            state.lastScan = tick;
            state.lastReason = "level:" + level;
            state.debug = dbg;

            const out = {
                ok:     true,
                aim:    result.aim,
                target: state.target,
                level:  level,
                reason: "level:" + level,
                debug:  dbg
            };
            if (Nozo.instaKill) {
                if (typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(level <= 1);
                if (typeof Nozo.instaKill.setPending === "function") {
                    Nozo.instaKill.setPending(level <= 1, "autoBreak:L" + level, state.target && state.target.sid != null ? state.target.sid : null);
                }
            }
            _record("autoBreak:scan", { ok: true, level: level, aim: result.aim });
            if (Nozo.log) Nozo.log("autoBreak:scan", out);
            return out;
        }

        clearAim("noTargets");
        if (Nozo.instaKill) {
            if (typeof Nozo.instaKill.setCan === "function") Nozo.instaKill.setCan(false);
            if (typeof Nozo.instaKill.setPending === "function") Nozo.instaKill.setPending(false, "autoBreak.clear", null);
        }
        state.lastScan = tick;
        state.lastReason = "noTargets";
        state.debug = dbg;
        _record("autoBreak:scan", { ok: false, reason: "noTargets" });
        return { ok: false, aim: null, target: null, reason: "noTargets", debug: dbg };
    }

    // --- requestBreak --------------------------------------------------------
    // Default: scan/aim only. Only sends a swing if context.send === true.
    // Routing goes through Nozo.combat.swingAt — no direct packet sends.

    function requestBreak(target, context) {
        const ctx = context || {};

        const scanResult = scan(ctx);

        if (ctx.send !== true) {
            return {
                ok:     scanResult.ok,
                aim:    state.aim,
                target: state.target,
                sent:   false,
                reason: scanResult.reason
            };
        }

        if (!scanResult.ok || state.aim === null) {
            return { ok: false, aim: null, target: null, sent: false, reason: "noAim" };
        }

        if (!Nozo.combat || typeof Nozo.combat.swingAt !== "function") {
            return { ok: false, aim: state.aim, target: state.target, sent: false, reason: "noCombatModule" };
        }

        const swingResult = Nozo.combat.swingAt(state.aim, "autoBreak", ctx);
        return {
            ok:     swingResult.ok,
            aim:    state.aim,
            target: state.target,
            sent:   swingResult.ok,
            reason: swingResult.reason || null
        };
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

    const autoBreak = {
        state:         state,
        setEnabled:    setEnabled,
        calc: {
            dist: _dist,
            dir: _dir,
            angleDist: _angleDist,
            objectsHit: _objectsHit,
            scoreAim: _scoreAim,
            pickBestAim: _pickBestAim
        },
        scan:          scan,
        setAim:        setAim,
        clearAim:      clearAim,
        getAim:        getAim,
        requestBreak:  requestBreak,
        getDebugState: getDebugState,
        getHistory:    getHistory
    };

    Nozo.autoBreak = autoBreak;
    Nozo.state = Nozo.state || {};
    Nozo.state.autoBreak = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.autoBreak = autoBreak;
})();
