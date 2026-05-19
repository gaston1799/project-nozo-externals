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
            if (mySid != null && p.sid === mySid) continue;
            near.push(p);
            if (pTeam == null || p.team == null || p.team !== pTeam) enemy.push(p);
        }
        s.near = near;
        s.enemy = enemy;
    }

    function _removeObjectBySid(sid) {
        if (sid == null) return;
        _ensureArrays();
        const s = Nozo.state;
        for (let i = s.gameObjects.length - 1; i >= 0; i--) {
            if (s.gameObjects[i] && s.gameObjects[i].sid === sid) { s.gameObjects.splice(i, 1); break; }
        }
        for (let i = s.liztobj.length - 1; i >= 0; i--) {
            if (s.liztobj[i] && s.liztobj[i].sid === sid) { s.liztobj.splice(i, 1); break; }
        }
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
        const sid = data[1];
        let p = model && typeof model.ensurePlayer === "function"
            ? model.ensurePlayer(s, sid)
            : null;
        if (!p) {
            if (!Array.isArray(s.players)) s.players = [];
            for (let i = 0; i < s.players.length; i++) {
                if (s.players[i] && s.players[i].sid === sid) { p = s.players[i]; break; }
            }
            if (!p) {
                p = { sid: sid };
                s.players.push(p);
            }
        }

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
        s.playersRaw = data;
        if (!Array.isArray(s.players)) s.players = [];
        const model = Nozo.playerModel || null;

        const seenSids = {};
        for (let i = 0; i + 13 <= data.length; i += 13) {
            const sid = data[i];
            if (sid == null) continue;
            seenSids[sid] = true;
            let p = model && typeof model.ensurePlayer === "function"
                ? model.ensurePlayer(s, sid)
                : null;
            if (!p) {
                for (let j = 0; j < s.players.length; j++) {
                    if (s.players[j] && s.players[j].sid === sid) { p = s.players[j]; break; }
                }
            }
            if (!p) { p = { sid: sid }; s.players.push(p); }

            if (model && typeof model.applyTupleUpdate === "function") {
                model.applyTupleUpdate(p, data, i);
            } else {
                p.x            = data[i + 1];
                p.y            = data[i + 2];
                p.x2           = data[i + 1];
                p.y2           = data[i + 2];
                p.dir          = data[i + 3];
                p.buildIndex   = data[i + 4];
                p.weaponIndex  = data[i + 5];
                p.weaponVariant = data[i + 6];
                p.team         = data[i + 7];
                p.isLeader     = data[i + 8];
                p.skinIndex    = data[i + 9];
                p.tailIndex    = data[i + 10];
                p.iconIndex    = data[i + 11];
                p.zIndex       = data[i + 12];
                p.visible      = true;
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
    }

    // H: loadGameObject — flat array, 8 values per object:
    //   [sid, x, y, dir, scale, type, dataIndex, ownerSid]
    // Upserts into state.gameObjects; existing entries for the same sid are replaced.
    function _handlerH(data) {
        if (!Array.isArray(data)) return;
        _ensureArrays();
        const s = Nozo.state;
        for (let i = 0; i + 8 <= data.length; i += 8) {
            const sid = data[i];
            if (sid == null) continue;
            const obj = {
                sid:       sid,
                x:         data[i + 1],
                y:         data[i + 2],
                dir:       data[i + 3],
                scale:     data[i + 4],
                type:      data[i + 5],
                dataIndex: data[i + 6],
                ownerSid:  data[i + 7],
                active:    true
            };
            let found = false;
            for (let j = 0; j < s.gameObjects.length; j++) {
                if (s.gameObjects[j] && s.gameObjects[j].sid === sid) {
                    s.gameObjects[j] = obj;
                    found = true;
                    break;
                }
            }
            if (!found) s.gameObjects.push(obj);
        }
    }

    // Q: killObject — remove single game object by its own SID.
    function _handlerQ(sid) {
        _removeObjectBySid(sid);
    }

    // R: killObjects — legacy form: remove all objects owned by player ownerSid.
    //   Accepts an array of individual object SIDs as well (for flexibility).
    function _handlerR(ownerSidOrArray) {
        if (ownerSidOrArray == null) return;
        _ensureArrays();
        const s = Nozo.state;
        if (Array.isArray(ownerSidOrArray)) {
            for (let i = 0; i < ownerSidOrArray.length; i++) _removeObjectBySid(ownerSidOrArray[i]);
        } else {
            const ownerSid = ownerSidOrArray;
            for (let i = s.gameObjects.length - 1; i >= 0; i--) {
                if (s.gameObjects[i] && s.gameObjects[i].ownerSid === ownerSid) s.gameObjects.splice(i, 1);
            }
            for (let i = s.liztobj.length - 1; i >= 0; i--) {
                if (s.liztobj[i] && s.liztobj[i].ownerSid === ownerSid) s.liztobj.splice(i, 1);
            }
        }
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
        player[index] = value;
    }

    // O: updateHealth — updates health for any player found by SID.
    function _handlerO(sid, value) {
        const s = Nozo.state;
        if (!s) return;
        s.lastHealthUpdateAt = Date.now();
        if (!Array.isArray(s.players) || typeof value !== "number") return;
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (p && p.sid === sid) {
                p.oldHealth = p.health;
                p.health = value;
                return;
            }
        }
    }

    // E: removePlayer — marks player hidden/inactive.
    function _handlerE(idOrSid) {
        const s = Nozo.state;
        if (!s || idOrSid == null) return;
        const model = Nozo.playerModel || null;
        if (!Array.isArray(s.players)) return;
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (!p) continue;
            if (p.id === idOrSid || p.sid === idOrSid) {
                if (model && typeof model.markDead === "function") {
                    model.markDead(s, p.sid);
                } else {
                    p.visible = false;
                    p.active = false;
                    p.alive = false;
                }
                return;
            }
        }
    }

    // A: setInitData — initial game configuration (items table, ages table, etc.).
    function _handlerInitData() {
        const s = Nozo.state;
        if (!s) return;
        s.initData = Array.prototype.slice.call(arguments);
        if (Nozo.log) Nozo.log("net:setInitData", { argc: s.initData.length });
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
        const counts = Array.prototype.slice.call(arguments);
        s.itemCounts = counts;
        if (s.player) s.player.itemCounts = counts;
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
        const items = Array.prototype.slice.call(arguments);
        s.heldItems = items;
        if (s.player) s.player.heldItems = items;
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
        N: _handlerN,
        O: _handlerO,
        P: _handlerP,
        Q: _handlerQ,
        R: _handlerR,
        S: _handlerS,
        T: _handlerT,
        U: _handlerU,
        V: _handlerV,
        7: _handler7
    });

    // Callable facade: Nozo.netEvents(type, data[, ctx]) dispatches directly.
    // All object-API methods are attached as properties so both call forms work.
    function netEventsCallable(type, data, ctx) {
        return dispatch(type, data, ctx);
    }
    netEventsCallable.handlers     = handlers;
    netEventsCallable.setHandlers  = setHandlers;
    netEventsCallable.dispatch     = dispatch;
    netEventsCallable.register     = register;
    netEventsCallable.registerMany = registerMany;

    Nozo.netEvents = netEventsCallable;
    Nozo.state = Nozo.state || {};
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.netEvents = netEventsCallable;
})();
