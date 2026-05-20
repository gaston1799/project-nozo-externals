/* Object model for NozoNext — flag classification, scale helpers, team checks, and decoration. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    // Derive stable boolean flags from an object's resolved name and type.
    function classifyFlags(name, type) {
        const n = (name && typeof name === "string") ? name.toLowerCase() : "";
        const trap    = !!(n.indexOf("trap") !== -1 || n.indexOf("pit") !== -1);
        const spike   = !!(n.indexOf("spike") !== -1);
        const poison  = !!(n.indexOf("poison") !== -1);
        const turret  = !!(n.indexOf("turret") !== -1);
        const blocker = !!(n.indexOf("blocker") !== -1);
        const teleport = !!(n.indexOf("teleporter") !== -1 || n.indexOf("teleport") !== -1);
        const dmg     = !!(spike || poison || turret);
        return { trap: trap, spike: spike, poison: poison, turret: turret, blocker: blocker, teleport: teleport, dmg: dmg };
    }

    // Standalone scale helper. mult defaults to 1.
    function getScale(obj, mult) {
        if (!obj) return 0;
        const m = (typeof mult === "number" && isFinite(mult)) ? mult : 1;
        const s = typeof obj.scale === "number" ? obj.scale : 0;
        return s * m;
    }

    // Standalone team-object check.
    function isTeamObject(obj, player) {
        if (!obj || !player) return false;
        if (player.sid != null && obj.ownerSid != null && obj.ownerSid === player.sid) return true;
        if (player.team != null && obj.team != null && obj.team === player.team) return true;
        return false;
    }

    // Proximity threshold for placed-object collision/trigger scans.
    // Mirrors the `playerScale + objScale + buffer` expression used by traps/autobreak,
    // centralising it so all scan modules use identical semantics.
    function getThresholdRadius(obj, playerScale, buffer) {
        const ps = typeof playerScale === "number" ? playerScale : 35;
        const b  = typeof buffer === "number" ? buffer : 15;
        return ps + getScale(obj) + b;
    }

    // Returns true when obj has been processed through decorateObject.
    // The isItem flag is set unconditionally by decorateObject; its presence is the
    // canonical signal that flag classification (trap/dmg/spike/etc.) is complete.
    function isDecoratedItem(obj) {
        return !!(obj && obj.isItem === true);
    }

    function _resolveItemMeta(dataIndex) {
        const s = Nozo.state;
        if (!s || !s.itemsData || !Array.isArray(s.itemsData.list)) return null;
        if (typeof dataIndex !== "number") return null;
        return s.itemsData.list[dataIndex] || null;
    }

    // Decorate a raw object in place: resolve name/type from catalog, apply flags,
    // attach getScale and isTeamObject instance methods.
    function decorateObject(obj) {
        if (!obj) return obj;
        const meta = _resolveItemMeta(obj.dataIndex);
        const name = meta && typeof meta.name === "string" ? meta.name : (obj.name || "");
        const type = meta && meta.type != null ? meta.type : (obj.type != null ? obj.type : null);
        obj.name = name || null;
        obj.type = type;
        const flags = classifyFlags(name, type);
        obj.trap    = flags.trap;
        obj.spike   = flags.spike;
        obj.poison  = flags.poison;
        obj.turret  = flags.turret;
        obj.blocker = flags.blocker;
        obj.teleport = flags.teleport;
        obj.dmg     = flags.dmg;
        obj.isItem  = true;
        obj.getScale = function _getScale(mult) {
            const m = (typeof mult === "number" && isFinite(mult)) ? mult : 1;
            return (typeof this.scale === "number" ? this.scale : 0) * m;
        };
        obj.isTeamObject = function _isTeamObject(player) {
            if (!player) return false;
            if (player.sid != null && this.ownerSid != null && this.ownerSid === player.sid) return true;
            if (player.team != null && this.team != null && this.team === player.team) return true;
            return false;
        };
        return obj;
    }

    // Create a decorated game-object from a raw field bag.
    function createObject(sid, raw) {
        const obj = {
            sid:       sid,
            x:         (raw && typeof raw.x === "number") ? raw.x : 0,
            y:         (raw && typeof raw.y === "number") ? raw.y : 0,
            dir:       (raw && typeof raw.dir === "number") ? raw.dir : 0,
            scale:     (raw && typeof raw.scale === "number") ? raw.scale : 0,
            type:      (raw && raw.type != null) ? raw.type : null,
            dataIndex: (raw && typeof raw.dataIndex === "number") ? raw.dataIndex : null,
            ownerSid:  (raw && raw.ownerSid != null) ? raw.ownerSid : null,
            team:      (raw && raw.team != null) ? raw.team : null,
            active:    true
        };
        return decorateObject(obj);
    }

    // Debug snapshot of all classified objects in state.
    function snapshot() {
        const s = Nozo.state;
        const go = (s && Array.isArray(s.gameObjects)) ? s.gameObjects : [];
        const li = (s && Array.isArray(s.liztobj)) ? s.liztobj : [];
        return {
            count:       go.length,
            liztCount:   li.length,
            gameObjects: go.map(function (o) {
                if (!o) return null;
                return {
                    sid: o.sid, x: o.x, y: o.y, name: o.name, type: o.type,
                    trap: o.trap, dmg: o.dmg, spike: o.spike, turret: o.turret,
                    blocker: o.blocker, teleport: o.teleport,
                    scale: o.scale, ownerSid: o.ownerSid, active: o.active
                };
            })
        };
    }

    const objectModel = {
        classifyFlags:      classifyFlags,
        getScale:           getScale,
        getThresholdRadius: getThresholdRadius,
        isDecoratedItem:    isDecoratedItem,
        isTeamObject:       isTeamObject,
        decorateObject:     decorateObject,
        createObject:       createObject,
        snapshot:           snapshot
    };

    Nozo.objectModel = objectModel;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.objectModel = objectModel;
})();
