/* Object manager for NozoNext — bounded upsert/remove/query over state.gameObjects. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const _MAX_OBJECTS = 2000;

    function _ensureState() {
        const s = Nozo.state;
        if (!s) return false;
        if (!Array.isArray(s.gameObjects)) s.gameObjects = [];
        if (!Array.isArray(s.liztobj)) s.liztobj = [];
        return true;
    }

    // Add or replace an object by its sid. Returns false if the object is invalid.
    function upsert(obj) {
        if (!obj || obj.sid == null || !_ensureState()) return false;
        const list = Nozo.state.gameObjects;
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].sid === obj.sid) {
                list[i] = obj;
                return true;
            }
        }
        list.push(obj);
        if (list.length > _MAX_OBJECTS) list.shift();
        return true;
    }

    // Remove an object by sid from gameObjects and liztobj.
    function remove(sid) {
        if (sid == null || !_ensureState()) return false;
        const s = Nozo.state;
        let removed = false;
        for (let i = s.gameObjects.length - 1; i >= 0; i--) {
            if (s.gameObjects[i] && s.gameObjects[i].sid === sid) {
                s.gameObjects.splice(i, 1);
                removed = true;
                break;
            }
        }
        for (let i = s.liztobj.length - 1; i >= 0; i--) {
            if (s.liztobj[i] && s.liztobj[i].sid === sid) {
                s.liztobj.splice(i, 1);
                break;
            }
        }
        return removed;
    }

    function getBySid(sid) {
        if (sid == null || !_ensureState()) return null;
        const list = Nozo.state.gameObjects;
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].sid === sid) return list[i];
        }
        return null;
    }

    function listActive() {
        if (!_ensureState()) return [];
        const list = Nozo.state.gameObjects;
        const out = [];
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].active) out.push(list[i]);
        }
        return out;
    }

    // Objects within radius world units of player (uses x2/y2 then x/y).
    function listNear(player, radius) {
        if (!player || !_ensureState()) return [];
        const r = typeof radius === "number" ? radius : 400;
        const r2 = r * r;
        const px = (typeof player.x2 === "number" && isFinite(player.x2)) ? player.x2
            : (typeof player.x === "number" ? player.x : NaN);
        const py = (typeof player.y2 === "number" && isFinite(player.y2)) ? player.y2
            : (typeof player.y === "number" ? player.y : NaN);
        if (!isFinite(px) || !isFinite(py)) return listActive();
        const list = Nozo.state.gameObjects;
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const obj = list[i];
            if (!obj || !obj.active) continue;
            const ox = typeof obj.x === "number" ? obj.x : 0;
            const oy = typeof obj.y === "number" ? obj.y : 0;
            const dx = ox - px, dy = oy - py;
            if (dx * dx + dy * dy <= r2) out.push(obj);
        }
        return out;
    }

    function getByOwner(ownerSid) {
        if (ownerSid == null || !_ensureState()) return [];
        const list = Nozo.state.gameObjects;
        const out = [];
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].ownerSid === ownerSid) out.push(list[i]);
        }
        return out;
    }

    // Remove all objects with the given ownerSid from gameObjects and liztobj.
    function removeByOwner(ownerSid) {
        if (ownerSid == null || !_ensureState()) return 0;
        const s = Nozo.state;
        let count = 0;
        for (let i = s.gameObjects.length - 1; i >= 0; i--) {
            if (s.gameObjects[i] && s.gameObjects[i].ownerSid === ownerSid) {
                s.gameObjects.splice(i, 1);
                count++;
            }
        }
        for (let i = s.liztobj.length - 1; i >= 0; i--) {
            if (s.liztobj[i] && s.liztobj[i].ownerSid === ownerSid) {
                s.liztobj.splice(i, 1);
            }
        }
        return count;
    }

    // Build, decorate, and upsert an object from raw H-packet field bag.
    // Delegates decoration to Nozo.objectModel.decorateObject when the module is loaded,
    // so flag classification (trap/dmg/spike/turret/blocker/teleport) is canonical.
    function decorateAndUpsert(sid, rawFields) {
        if (sid == null || !rawFields) return false;
        const obj = {
            sid:       sid,
            x:         typeof rawFields.x         === "number" ? rawFields.x         : 0,
            y:         typeof rawFields.y         === "number" ? rawFields.y         : 0,
            dir:       typeof rawFields.dir       === "number" ? rawFields.dir       : 0,
            scale:     typeof rawFields.scale     === "number" ? rawFields.scale     : 0,
            type:      rawFields.type != null                  ? rawFields.type      : null,
            dataIndex: typeof rawFields.dataIndex === "number" ? rawFields.dataIndex : null,
            ownerSid:  rawFields.ownerSid != null              ? rawFields.ownerSid  : null,
            team:      rawFields.team != null                  ? rawFields.team      : null,
            active:    true
        };
        if (Nozo.objectModel && typeof Nozo.objectModel.decorateObject === "function") {
            Nozo.objectModel.decorateObject(obj);
        }
        return upsert(obj);
    }

    // Compact debug snapshot: counts by category.
    function snapshot() {
        if (!_ensureState()) return { count: 0, active: 0, traps: 0, dmg: 0 };
        const list = Nozo.state.gameObjects;
        let active = 0, traps = 0, dmg = 0, turrets = 0, blockers = 0;
        for (let i = 0; i < list.length; i++) {
            const o = list[i];
            if (!o) continue;
            if (o.active) active++;
            if (o.trap) traps++;
            if (o.dmg) dmg++;
            if (o.turret) turrets++;
            if (o.blocker) blockers++;
        }
        return { count: list.length, active: active, traps: traps, dmg: dmg, turrets: turrets, blockers: blockers };
    }

    const objectManager = {
        upsert:            upsert,
        remove:            remove,
        getBySid:          getBySid,
        listActive:        listActive,
        listNear:          listNear,
        getByOwner:        getByOwner,
        removeByOwner:     removeByOwner,
        decorateAndUpsert: decorateAndUpsert,
        snapshot:          snapshot
    };

    Nozo.objectManager = objectManager;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.objectManager = objectManager;
})();
