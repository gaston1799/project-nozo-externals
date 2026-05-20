/* Network event dispatcher for NozoNext websocket packets. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    // One global router — never recreated per message.
    const handlers = {
        A: null, // setInitData
        C: null, // setupGame
        D: null, // addPlayer
        E: null, // removePlayer
        a: null, // updatePlayers
        G: null, // updateLeaderboard
        H: null, // loadGameObject
        I: null, // loadAI
        J: null, // animateAI
        K: null, // gatherAnimation
        L: null, // wiggleGameObject
        M: null, // shootTurret
        N: null, // updatePlayerValue
        O: null, // updateHealth
        P: null, // killPlayer
        Q: null, // killObject
        R: null, // killObjects
        S: null, // updateItemCounts
        T: null, // updateAge
        U: null, // updateUpgrades
        V: null, // updateItems
        X: null, // addProjectile
        Y: null, // remProjectile
        0: null, // addAlliance
        1: null, // deleteAlliance
        2: null, // allianceNotification
        3: null, // setPlayerTeam
        4: null, // setAlliancePlayers
        5: null, // updateStoreItems
        6: null, // receiveChat
        7: null, // updateMinimap
        8: null, // showText
        9: null  // pingMap
    };

    // setHandlers: legacy guarded API — only overrides keys that already exist.
    function setHandlers(overrides) {
        if (!overrides || typeof overrides !== "object") return;
        const keys = Object.keys(overrides);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (Object.prototype.hasOwnProperty.call(handlers, key)) {
                handlers[key] = overrides[key];
            }
        }
    }

    // register: unrestricted single-handler registration.
    function register(type, fn) {
        if (type == null || typeof fn !== "function") return;
        handlers[type] = fn;
    }

    // registerMany: unrestricted bulk registration; pass null to unregister.
    function registerMany(map) {
        if (!map || typeof map !== "object") return;
        const keys = Object.keys(map);
        for (let i = 0; i < keys.length; i++) {
            handlers[keys[i]] = typeof map[keys[i]] === "function" ? map[keys[i]] : null;
        }
    }

    function dispatch(type, data, ctx) {
        const state = ctx || Nozo.state || {};
        if (type === "io-init") {
            if (Array.isArray(data) && data.length > 0) state.socketID = data[0];
            return { ok: true, handled: true, type: type };
        }

        const handler = handlers[type];
        if (typeof handler !== "function") {
            return { ok: false, handled: false, type: type, reason: "no-handler" };
        }

        const args = Array.isArray(data) ? data : [];
        handler.apply(undefined, args);
        return { ok: true, handled: true, type: type };
    }

    // --- internal helpers -----------------------------------------------

    function _ensureArrays() {
        const s = Nozo.state;
        if (!s) return;
        if (!Array.isArray(s.gameObjects)) s.gameObjects = [];
        if (!Array.isArray(s.liztobj)) s.liztobj = [];
    }

    function _rebuildNearEnemy() {
        const s = Nozo.state;
        if (!s) return;
        const player = s.player;
        const list = Array.isArray(s.players) ? s.players : [];
        if (!player || !list.length) {
            s.near = [];
            s.enemy = [];
            return;
        }
        const pTeam = player.team;
        const mySid = player.sid;
        const near = [];
        const enemy = [];
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p) continue;
            if (p.alive === false) continue;
            if (mySid != null && p.sid === mySid) continue;
            near.push(p);
            if (pTeam == null || p.team == null || p.team !== pTeam) enemy.push(p);
        }
        s.near = near;
        s.enemy = enemy;
    }

    function _removeObjectBySid(sid) {
        if (sid == null) return;
        const om = Nozo.objectManager;
        if (!om || typeof om.remove !== "function") {
            if (Nozo.log) Nozo.log("error:net:_removeObjectBySid:noObjectManager", { sid: sid });
            return;
        }
        om.remove(sid);
    }

    // --- default handlers -----------------------------------------------

    // C: setupGame — captures the local player's server-assigned SID so that
    // _handlerA can identify the self-player in the players list.
    function _handlerC(yourSid) {
        const s = Nozo.state;
        if (!s) return;
        s.mySid = yourSid;
        if (!Array.isArray(s.players)) s.players = [];
        if (!Array.isArray(s.enemy)) s.enemy = [];
        if (!Array.isArray(s.near)) s.near = [];
        const model = Nozo.playerModel || null;
        if (model && typeof model.ensurePlayer === "function" && yourSid != null) {
            const me = model.ensurePlayer(s, yourSid);
            if (me) {
                me.visible = false;
                me.active = true;
                me.alive = true;
                s.player = me;
            }
        }
        if (Nozo.log) Nozo.log("net:setupGame", { mySid: yourSid });
    }

    // D: addPlayer — legacy signature: (data, isYou)
    // data commonly starts with [id, sid, name, x, y, dir, health, maxHealth, scale, skinColor, ...]
    function _handlerD(data, isYou) {
        if (!Array.isArray(data) || data.length < 2) return;
        const s = Nozo.state;
        if (!s) return;

        const model = Nozo.playerModel || null;
        if (!model || typeof model.ensurePlayer !== "function") {
            if (Nozo.log) Nozo.log("error:net:_handlerD:noPlayerModel", { data0: data[0], sid: data[1] });
            return;
        }
        const sid = data[1];
        const p = model.ensurePlayer(s, sid);
        if (!p) return;

        p.id = data[0];
        p.sid = sid;
        p.name = data[2] != null ? data[2] : p.name;
        p.x = typeof data[3] === "number" ? data[3] : p.x;
        p.y = typeof data[4] === "number" ? data[4] : p.y;
        p.x2 = p.x;
        p.y2 = p.y;
        p.dir = typeof data[5] === "number" ? data[5] : p.dir;
        p.health = typeof data[6] === "number" ? data[6] : p.health;
        p.maxHealth = typeof data[7] === "number" ? data[7] : p.maxHealth;
        p.scale = typeof data[8] === "number" ? data[8] : p.scale;
        p.skinColor = data.length > 9 ? data[9] : p.skinColor;
        p.visible = false;
        p.active = true;
        p.alive = true;
        p.lastSeenAt = Date.now();

        if (isYou === true || (s.mySid != null && sid === s.mySid)) {
            s.player = p;
            s.mySid = sid;
        }
    }

    // a: updatePlayers — flat array, 13 values per player:
    //   [sid, x2, y2, dir, buildIndex, weaponIndex, weaponVariant,
    //    team, isLeader, skinIndex, tailIndex, iconIndex, zIndex]
    // Merges into existing player records to preserve accumulated state (e.g. health).
    function _handlerA(data) {
        if (!Array.isArray(data)) return;
        const s = Nozo.state;
        if (!s) return;
        const model = Nozo.playerModel || null;
        if (!model || typeof model.ensurePlayer !== "function" || typeof model.applyTupleUpdate !== "function") {
            if (Nozo.log) Nozo.log("error:net:_handlerA:noPlayerModel", { tupleLen: data.length });
            return;
        }
        if (data.length % 13 !== 0 && Nozo.log) {
            Nozo.log("warn:net:a:partial-tuple", { len: data.length, rem: data.length % 13 });
        }
        s.playersRaw = data;
        if (!Array.isArray(s.players)) s.players = [];

        const seenSids = {};
        for (let i = 0; i + 13 <= data.length; i += 13) {
            const sid = data[i];
            if (sid == null) continue;
            seenSids[sid] = true;
            const p = model.ensurePlayer(s, sid);
            if (!p) continue;

            const _oldSkinIdx = p.skinIndex;
            const _isSelf = (s.mySid != null && sid === s.mySid);

            model.applyTupleUpdate(p, data, i);

            // Shame-clear: self-player's skin changed from 45 (shame) to another.
            // Mirrors the healer() call at the skin-transition branch in the original update loop.
            if (_isSelf && _oldSkinIdx === 45 && p.skinIndex !== 45) {
                if (Nozo.healer && typeof Nozo.healer.onShameClear === "function") {
                    Nozo.healer.onShameClear();
                }
            }
        }

        // Mark players absent from this tick as invisible (not removed — E handles removal).
        for (let j = 0; j < s.players.length; j++) {
            if (s.players[j] && !seenSids[s.players[j].sid]) s.players[j].visible = false;
        }

        // Identify self-player if mySid is known (set by C / setupGame handler).
        const mySid = s.mySid;
        if (mySid != null) {
            for (let j = 0; j < s.players.length; j++) {
                if (s.players[j] && s.players[j].sid === mySid) { s.player = s.players[j]; break; }
            }
        }

        _rebuildNearEnemy();
        _pruneDeadPlayers();
    }

    // H: loadGameObject — flat array, 8 values per object:
    //   [sid, x, y, dir, scale, type, dataIndex, ownerSid]
    // Upserts into state.gameObjects; existing entries for the same sid are replaced.
    function _handlerH(data) {
        if (!Array.isArray(data)) return;
        const om = Nozo.objectManager || null;
        if (!om || typeof om.decorateAndUpsert !== "function") {
            if (Nozo.log) Nozo.log("error:net:_handlerH:noObjectManager", { tupleLen: data.length });
            return;
        }
        if (data.length % 8 !== 0 && Nozo.log) {
            Nozo.log("warn:net:H:partial-tuple", { len: data.length, rem: data.length % 8 });
        }
        _ensureArrays();
        for (let i = 0; i + 8 <= data.length; i += 8) {
            const sid = data[i];
            if (sid == null) continue;
            const rawFields = {
                x:         data[i + 1],
                y:         data[i + 2],
                dir:       data[i + 3],
                scale:     data[i + 4],
                type:      data[i + 5],
                dataIndex: data[i + 6],
                ownerSid:  data[i + 7]
            };
            om.decorateAndUpsert(sid, rawFields);
        }
    }

    // Q: killObject — remove single game object by its own SID.
    function _handlerQ(sid) {
        _removeObjectBySid(sid);
    }

    // R: killObjects(ownerSid) — remove all objects owned by player ownerSid.
    function _handlerR(ownerSid) {
        if (ownerSid == null) return;
        const om = Nozo.objectManager;
        if (!om || typeof om.removeByOwner !== "function") {
            if (Nozo.log) Nozo.log("error:net:_handlerR:noObjectManager", { ownerSid: ownerSid });
            return;
        }
        om.removeByOwner(ownerSid);
    }

    // G: updateLeaderboard
    function _handlerG(data) {
        if (Nozo.state) Nozo.state.leaderboard = data;
    }

    // 7: updateMinimap
    function _handler7(data) {
        if (Nozo.state) Nozo.state.minimap = data;
    }

    // N: updatePlayerValue — safely writes a field onto the local player object.
    // Guards against prototype-poisoning keys.
    function _handlerN(index, value) {
        const s = Nozo.state;
        if (!s) return;
        s.lastPlayerValueUpdateAt = Date.now();
        const player = s.player;
        if (!player || index == null) return;
        if (typeof index !== "string" && typeof index !== "number") return;
        if (index === "__proto__" || index === "constructor" || index === "prototype") return;

        // Numeric N-packets map to weapon reload slots.
        if (typeof index === "number") {
            const pm = Nozo.playerModel || null;
            if (pm && typeof pm.setReload === "function") {
                pm.setReload(player, index, value);
            } else {
                if (!player.reloads || typeof player.reloads !== "object") player.reloads = {};
                player.reloads[index] = typeof value === "number" ? value : 0;
            }
            return;
        }
        player[index] = value;
    }

    // O: updateHealth — updates health for any player found by SID.
    // Notifies healer when the local player takes damage.
    function _handlerO(sid, value) {
        const s = Nozo.state;
        if (!s) return;
        const pm = Nozo.playerModel || null;
        if (!pm || typeof pm.applyHealthUpdate !== "function") {
            if (Nozo.log) Nozo.log("error:net:_handlerO:noPlayerModel", { sid: sid, value: value });
            return;
        }
        s.lastHealthUpdateAt = Date.now();
        if (!Array.isArray(s.players) || typeof value !== "number") return;
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (p && p.sid === sid) {
                const old = p.health;
                pm.applyHealthUpdate(p, value);
                if (Nozo.healer && typeof Nozo.healer.onHealthUpdate === "function") {
                    if (s.mySid != null && sid === s.mySid) {
                        Nozo.healer.onHealthUpdate(sid, value, old);
                    }
                }
                return;
            }
        }
    }

    // E: removePlayer(id) — id matches moomoo.js removePlayer(id) contract.
    function _handlerE(id) {
        const s = Nozo.state;
        if (!s || id == null) return;
        const model = Nozo.playerModel || null;
        if (!model || typeof model.markDead !== "function") {
            if (Nozo.log) Nozo.log("error:net:_handlerE:noPlayerModel", { id: id });
            return;
        }
        if (!Array.isArray(s.players)) return;
        let targetSid = null;
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (!p) continue;
            if (p.id === id) {
                targetSid = p.sid;
                break;
            }
        }
        if (targetSid == null) return;
        model.markDead(s, targetSid);
    }

    // Build a normalized items list from the raw first arg of the A packet.
    // Each entry may be an object with name/type/healing/range/reload/damage, or null.
    // Items that are not plain objects are stored as minimal { id } placeholders.
    function _parseInitDataItems(raw) {
        if (!Array.isArray(raw)) return null;
        const list = new Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            const src = raw[i];
            if (src == null) { list[i] = null; continue; }
            if (typeof src === "object" && !Array.isArray(src)) {
                list[i] = {
                    id:      i,
                    name:    typeof src.name    === "string" ? src.name    : null,
                    type:    typeof src.type    === "number" ? src.type    : null,
                    healing: typeof src.healing === "number" ? src.healing : null,
                    range:   typeof src.range   === "number" ? src.range   : null,
                    reload:  typeof src.reload  === "number" ? src.reload  : null,
                    damage:  typeof src.damage  === "number" ? src.damage  : null
                };
            } else {
                list[i] = { id: i };
            }
        }
        return list;
    }

    // A: setInitData — initial game configuration (items table, ages table, etc.).
    // Parses args into structured catalogs stored at state.itemsData and state.agesData
    // while preserving the full raw payload at state.initData for compatibility.
    function _handlerInitData() {
        const s = Nozo.state;
        if (!s) return;
        const args = Array.prototype.slice.call(arguments);
        s.initData = args;
        s.initDataParsed = false;

        // arg[0]: items/objects catalog (food, weapons, structures, etc.)
        if (Array.isArray(args[0])) {
            const parsed = _parseInitDataItems(args[0]);
            s.itemsData = { raw: args[0], list: parsed, readyAt: Date.now() };
        }

        // arg[1]: ages/upgrades catalog
        if (Array.isArray(args[1])) {
            s.agesData = { raw: args[1], list: args[1], readyAt: Date.now() };
        }

        s.initDataParsed = !!(s.itemsData || s.agesData);
        if (Nozo.log) Nozo.log("net:setInitData", {
            argc:       args.length,
            itemsCount: s.itemsData ? s.itemsData.list.length : 0,
            agesCount:  s.agesData  ? s.agesData.list.length  : 0
        });
    }

    // P: killPlayer — victim marked dead; near/enemy rebuilt so aim resolver stays current.
    function _handlerP(victimIdOrSid, killerIdOrSid) {
        const s = Nozo.state;
        if (!s || victimIdOrSid == null) return;
        if (!Array.isArray(s.players)) return;
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (!p) continue;
            if (p.id === victimIdOrSid || p.sid === victimIdOrSid) {
                p.visible = false;
                p.active = false;
                p.alive = false;
                _rebuildNearEnemy();
                if (Nozo.log) Nozo.log("net:killPlayer", { victim: victimIdOrSid, killer: killerIdOrSid != null ? killerIdOrSid : null });
                return;
            }
        }
    }

    // S: updateItemCounts — raw item count args forwarded to player.
    function _handlerS() {
        const s = Nozo.state;
        if (!s) return;
        const args = Array.prototype.slice.call(arguments);
        if (args.length === 2 && typeof args[0] === "number" && typeof args[1] === "number") {
            if (!s.itemCounts || typeof s.itemCounts !== "object") s.itemCounts = {};
            s.itemCounts[args[0]] = args[1];
            if (s.player) {
                if (!s.player.itemCounts || typeof s.player.itemCounts !== "object") s.player.itemCounts = {};
                s.player.itemCounts[args[0]] = args[1];
            }
            return;
        }
        s.itemCounts = args;
        if (s.player) s.player.itemCounts = args;
    }

    // T: updateAge — age index and optional XP values forwarded to player.
    function _handlerT(ageIndex, xp, maxXp) {
        const s = Nozo.state;
        if (!s) return;
        if (ageIndex != null) { s.ageIndex = ageIndex; if (s.player) s.player.age = ageIndex; }
        if (xp != null) { s.xp = xp; if (s.player) s.player.xp = xp; }
        if (maxXp != null) { s.maxXp = maxXp; if (s.player) s.player.maxXp = maxXp; }
    }

    // U: updateUpgrades — available upgrade options forwarded to player.
    function _handlerU() {
        const s = Nozo.state;
        if (!s) return;
        const upgrades = Array.prototype.slice.call(arguments);
        s.upgradeOptions = upgrades;
        if (s.player) s.player.upgradeOptions = upgrades;
    }

    // V: updateItems — held item IDs (weapons/tools) forwarded to player.
    function _handlerV() {
        const s = Nozo.state;
        if (!s) return;
        const args = Array.prototype.slice.call(arguments);
        const items = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
        s.heldItems = items;
        if (s.player) {
            s.player.heldItems = items;
            s.player.items = items.slice();
        }
    }

    // I: loadAI — upsert AI entities from tuples.
    // Tuple target shape mirrors object-like entities: [sid, x, y, dir, scale, type, ownerSid]
    function _handlerI(data) {
        const s = Nozo.state;
        if (!s) return;
        if (!Array.isArray(data)) return;
        if (!Array.isArray(s.ais)) s.ais = [];
        if (!s.aiBySid || typeof s.aiBySid !== "object") s.aiBySid = {};

        if (data.length % 7 !== 0 && Nozo.log) {
            Nozo.log("warn:net:I:partial-tuple", { len: data.length, rem: data.length % 7 });
        }
        for (let i = 0; i + 7 <= data.length; i += 7) {
            const sid = data[i];
            if (sid == null) continue;
            const ai = s.aiBySid[sid] || { sid: sid };
            ai.sid = sid;
            ai.x = typeof data[i + 1] === "number" ? data[i + 1] : (ai.x || 0);
            ai.y = typeof data[i + 2] === "number" ? data[i + 2] : (ai.y || 0);
            ai.x2 = ai.x;
            ai.y2 = ai.y;
            ai.dir = typeof data[i + 3] === "number" ? data[i + 3] : (ai.dir || 0);
            ai.scale = typeof data[i + 4] === "number" ? data[i + 4] : (ai.scale || 0);
            ai.type = data[i + 5] != null ? data[i + 5] : (ai.type || null);
            ai.ownerSid = data[i + 6] != null ? data[i + 6] : (ai.ownerSid || null);
            ai.visible = true;
            ai.active = true;
            ai.lastSeenAt = Date.now();
            s.aiBySid[sid] = ai;
        }
        s.ais = Object.keys(s.aiBySid).map(function (k) { return s.aiBySid[k]; });
    }

    // J: animateAI — update direction/position animation state for AI sid.
    // common shape: (sid, x, y, dir)
    function _handlerJ(sid, x, y, dir) {
        const s = Nozo.state;
        if (!s || sid == null) return;
        if (!s.aiBySid || typeof s.aiBySid !== "object") s.aiBySid = {};
        const ai = s.aiBySid[sid] || { sid: sid };
        if (typeof x === "number") { ai.x = x; ai.x2 = x; }
        if (typeof y === "number") { ai.y = y; ai.y2 = y; }
        if (typeof dir === "number") ai.dir = dir;
        ai.visible = true;
        ai.active = true;
        ai.lastAnimAt = Date.now();
        s.aiBySid[sid] = ai;
        if (!Array.isArray(s.ais)) s.ais = [];
        let found = false;
        for (let i = 0; i < s.ais.length; i++) {
            if (s.ais[i] && s.ais[i].sid === sid) { s.ais[i] = ai; found = true; break; }
        }
        if (!found) s.ais.push(ai);
    }

    // L: wiggleGameObject — mutate live object orientation/state by sid.
    // common shape: (sid, dir[, x, y])
    function _handlerL(sid, dir, x, y) {
        const s = Nozo.state;
        if (!s || sid == null) return;
        const om = Nozo.objectManager;
        if (!om || typeof om.getBySid !== "function") {
            if (Nozo.log) Nozo.log("error:net:_handlerL:noObjectManager", { sid: sid });
            return;
        }
        const obj = om.getBySid(sid);
        if (!obj) {
            if (Nozo.log) Nozo.log("warn:net:L:notFound", { sid: sid });
            return;
        }
        if (typeof dir === "number") obj.dir = dir;
        if (typeof x === "number") obj.x = x;
        if (typeof y === "number") obj.y = y;
        obj.lastWiggleAt = Date.now();
    }

    // M: shootTurret — record turret shot event and optionally synth projectile record.
    // common shape: (sid, x, y, dir[, projId])
    function _handlerM(sid, x, y, dir, projId) {
        const s = Nozo.state;
        if (!s) return;
        if (!Array.isArray(s.turretShots)) s.turretShots = [];
        const shot = {
            sid: sid != null ? sid : null,
            x: typeof x === "number" ? x : null,
            y: typeof y === "number" ? y : null,
            dir: typeof dir === "number" ? dir : null,
            projId: projId != null ? projId : null,
            t: Date.now()
        };
        s.turretShots.push(shot);
        if (s.turretShots.length > 120) s.turretShots.shift();
        s.lastTurretShot = shot;

        // If projectile id supplied, mirror into projectile map so combat/render can consume.
        if (shot.projId != null) {
            if (!s.projectiles || typeof s.projectiles !== "object") s.projectiles = {};
            s.projectiles[shot.projId] = {
                id: shot.projId,
                ownerSid: shot.sid,
                type: "turret",
                x: typeof shot.x === "number" ? shot.x : 0,
                y: typeof shot.y === "number" ? shot.y : 0,
                dir: typeof shot.dir === "number" ? shot.dir : 0,
                t: shot.t
            };
        }
    }

    // --- observe stubs for unimplemented high-risk handlers -------------------
    // These record counters and log on first occurrence + every 100th hit.

    function _makeObserver(type) {
        return function _observed() {
            const s = Nozo.state;
            if (!s) return;
            if (!s.netEventCounters) s.netEventCounters = {};
            const prev = s.netEventCounters[type] || 0;
            s.netEventCounters[type] = prev + 1;
            if (prev === 0 || prev % 100 === 0) {
                if (Nozo.log) Nozo.log("net:observe:" + type, {
                    count: prev + 1,
                    argc: arguments.length,
                    sample: Array.prototype.slice.call(arguments, 0, 4)
                });
            }
        };
    }

    // --- promoted handlers ---------------------------------------------------

    // X: addProjectile — bounded map keyed by id; max 200 entries.
    function _handlerX() {
        const s = Nozo.state;
        if (!s) return;
        if (!s.projectiles || typeof s.projectiles !== "object") s.projectiles = {};
        const id = arguments[0];
        if (id == null) return;
        s.projectiles[id] = {
            id:       id,
            ownerSid: arguments.length > 1 ? arguments[1] : null,
            type:     arguments.length > 2 ? arguments[2] : null,
            x:        arguments.length > 3 && typeof arguments[3] === "number" ? arguments[3] : 0,
            y:        arguments.length > 4 && typeof arguments[4] === "number" ? arguments[4] : 0,
            dir:      arguments.length > 5 && typeof arguments[5] === "number" ? arguments[5] : 0,
            t:        Date.now()
        };
        const keys = Object.keys(s.projectiles);
        if (keys.length > 200) {
            keys.sort(function (a, b) { return (s.projectiles[a].t || 0) - (s.projectiles[b].t || 0); });
            for (let i = 0; i < keys.length - 200; i++) delete s.projectiles[keys[i]];
        }
        if (!s.netEventCounters) s.netEventCounters = {};
        s.netEventCounters.X = (s.netEventCounters.X || 0) + 1;
    }

    // Y: remProjectile — remove by id.
    function _handlerY() {
        const s = Nozo.state;
        if (!s || !s.projectiles) return;
        const id = arguments[0];
        if (id != null) delete s.projectiles[id];
        if (!s.netEventCounters) s.netEventCounters = {};
        s.netEventCounters.Y = (s.netEventCounters.Y || 0) + 1;
    }

    // K: gatherAnimation — lightweight state record with bounded history.
    const _gatherHistory = [];
    function _handlerK() {
        const s = Nozo.state;
        if (!s) return;
        if (!s.netEventCounters) s.netEventCounters = {};
        const prev = s.netEventCounters.K || 0;
        s.netEventCounters.K = prev + 1;
        const entry = {
            tick:   s.tick || 0,
            time:   Date.now(),
            argc:   arguments.length,
            source: arguments.length > 0 ? arguments[0] : null
        };
        _gatherHistory.push(entry);
        if (_gatherHistory.length > 20) _gatherHistory.shift();
        s.lastGatherAnim = entry;
        if (prev === 0 || prev % 100 === 0) {
            if (Nozo.log) Nozo.log("net:gatherAnim:K", { count: prev + 1, entry: entry });
        }
    }

    // --- dead player pruning -------------------------------------------------

    const _DEAD_GRACE_MS = 30000;

    function _pruneDeadPlayers() {
        const s = Nozo.state;
        if (!s || !Array.isArray(s.players)) return;
        const cutoff = Date.now() - _DEAD_GRACE_MS;
        for (let i = s.players.length - 1; i >= 0; i--) {
            const p = s.players[i];
            if (p && p.alive === false && p.lastSeenAt != null && p.lastSeenAt < cutoff) {
                s.players.splice(i, 1);
            }
        }
    }

    function getAlivePlayers() {
        const s = Nozo.state;
        if (!s || !Array.isArray(s.players)) return [];
        const out = [];
        for (let i = 0; i < s.players.length; i++) {
            if (s.players[i] && s.players[i].alive !== false) out.push(s.players[i]);
        }
        return out;
    }

    // Auto-register default handlers.
    registerMany({
        A: _handlerInitData,
        C: _handlerC,
        D: _handlerD,
        E: _handlerE,
        a: _handlerA,
        G: _handlerG,
        H: _handlerH,
        I: _handlerI,
        J: _handlerJ,
        K: _handlerK,
        L: _handlerL,
        M: _handlerM,
        N: _handlerN,
        O: _handlerO,
        P: _handlerP,
        Q: _handlerQ,
        R: _handlerR,
        S: _handlerS,
        T: _handlerT,
        U: _handlerU,
        V: _handlerV,
        X: _handlerX,
        Y: _handlerY,
        5: _makeObserver("5"),
        6: _makeObserver("6"),
        7: _handler7,
        8: _makeObserver("8"),
        9: _makeObserver("9")
    });

    // Callable facade: Nozo.netEvents(type, data[, ctx]) dispatches directly.
    // All object-API methods are attached as properties so both call forms work.
    function netEventsCallable(type, data, ctx) {
        return dispatch(type, data, ctx);
    }
    netEventsCallable.handlers          = handlers;
    netEventsCallable.setHandlers       = setHandlers;
    netEventsCallable.dispatch          = dispatch;
    netEventsCallable.register          = register;
    netEventsCallable.registerMany      = registerMany;
    netEventsCallable.getAlivePlayers   = getAlivePlayers;
    netEventsCallable.pruneDeadPlayers  = _pruneDeadPlayers;
    netEventsCallable.gatherHistory     = _gatherHistory;

    Nozo.netEvents = netEventsCallable;
    Nozo.state = Nozo.state || {};
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.netEvents = netEventsCallable;
})();
