/* Player model bridge for NozoNext. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    function createPlayerBase(sid) {
        return {
            sid: sid,
            id: null,
            name: null,
            team: null,
            skinIndex: 0,
            tailIndex: 0,
            iconIndex: 0,
            weaponIndex: 0,
            weaponVariant: 0,
            weaponCode: null,  // weapon slot index used for re-select after food placement
            buildIndex: -1,
            isLeader: 0,
            zIndex: 0,
            x: 0,
            y: 0,
            x2: 0,
            y2: 0,
            dir: 0,
            scale: 35,
            health: 100,
            oldHealth: 100,
            maxHealth: 100,
            alive: true,
            active: true,
            visible: true,
            age: 1,
            kills: 0,
            upgradePoints: 0,
            points: 0,
            shameCount: 0,  // client-side consecutive heal counter, decremented by healer timer
            items: [0, 3, 6, 10],
            weapons: [0],
            reloads: {
                0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0,
                8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 53: 0
            },
            lastSeenAt: Date.now()
        };
    }

    function ensurePlayersState(state) {
        const s = state || Nozo.state;
        if (!s) return [];
        if (!Array.isArray(s.players)) s.players = [];
        return s.players;
    }

    function findPlayerBySid(state, sid) {
        if (sid == null) return null;
        const players = ensurePlayersState(state);
        for (let i = 0; i < players.length; i++) {
            if (players[i] && players[i].sid === sid) return players[i];
        }
        return null;
    }

    function ensurePlayer(state, sid) {
        if (sid == null) return null;
        const players = ensurePlayersState(state);
        let p = findPlayerBySid(state, sid);
        if (p) return p;
        p = createPlayerBase(sid);
        players.push(p);
        return p;
    }

    function markDead(state, sid) {
        const p = findPlayerBySid(state, sid);
        if (!p) return false;
        p.alive = false;
        p.active = false;
        p.visible = false;
        p.lastSeenAt = Date.now();
        return true;
    }

    // Tuple layout from "a" packet:
    // [sid, x2, y2, dir, buildIndex, weaponIndex, weaponVariant, team, isLeader, skinIndex, tailIndex, iconIndex, zIndex]
    function applyTupleUpdate(player, tuple, offset) {
        const i = offset || 0;
        player.x = tuple[i + 1];
        player.y = tuple[i + 2];
        player.x2 = tuple[i + 1];
        player.y2 = tuple[i + 2];
        player.dir = tuple[i + 3];
        player.buildIndex = tuple[i + 4];
        player.weaponIndex = tuple[i + 5];
        player.weaponCode = tuple[i + 5];   // sync for _reSelectWeapon
        player.weaponVariant = tuple[i + 6];
        player.team = tuple[i + 7];
        player.isLeader = tuple[i + 8];
        player.skinIndex = tuple[i + 9];
        player.tailIndex = tuple[i + 10];
        player.iconIndex = tuple[i + 11];
        player.zIndex = tuple[i + 12];
        player.visible = true;
        player.active = true;
        player.alive = true;
        player.lastSeenAt = Date.now();
        return player;
    }

    // Single alive+active gate used by all modules that need to skip dead/inactive players.
    function isAlive(player) {
        if (!player) return false;
        return player.alive !== false && player.active !== false;
    }

    // Player-to-player team check (sid-identity or team-field equality).
    function isSameTeam(a, b) {
        if (!a || !b) return false;
        if (a.sid != null && b.sid != null && a.sid === b.sid) return true;
        if (a.team != null && b.team != null && a.team === b.team) return true;
        return false;
    }

    // Centralized reload-ready check. Mirrors the gate in combat.canSwing:
    //   reload <= Math.max(pingTime, 0) means weapon is ready.
    // Returns true when no weapon/reload info is available (safe default).
    function isReloadReady(player, weaponIndex, pingTime) {
        if (!player) return false;
        const wi   = weaponIndex != null ? weaponIndex : player.weaponIndex;
        if (wi == null) return true;
        const reload = player.reloads && typeof player.reloads[wi] === "number" ? player.reloads[wi] : 0;
        const ping   = typeof pingTime === "number" ? pingTime : 0;
        return reload <= Math.max(ping, 0);
    }

    // Apply a new health value, preserving the prior value in oldHealth.
    // Used by the O-handler and healer to track damage deltas without inline patching.
    function applyHealthUpdate(player, newHealth) {
        if (!player || typeof newHealth !== "number") return;
        player.oldHealth = typeof player.health === "number" ? player.health : newHealth;
        player.health = newHealth;
    }

    // Team-field-only check: returns true when both players share a non-null team value.
    // Use isSameTeam when sid-identity (self-check) should also pass; use isTeam when
    // you want team-grouping only (e.g. "is this a teammate, not self?").
    function isTeam(a, b) {
        if (!a || !b) return false;
        if (a.team == null || b.team == null) return false;
        return a.team === b.team;
    }

    // Set the reload counter for one weapon slot. Called when server pushes N-packet
    // reload state so all reload mutations go through a single path.
    function setReload(player, weaponIndex, value) {
        if (!player || weaponIndex == null) return;
        if (!player.reloads || typeof player.reloads !== "object") player.reloads = {};
        player.reloads[weaponIndex] = typeof value === "number" ? value : 0;
    }

    // Stamp the player as "under attack": sets lastDamageThreatAt and increments
    // damageThreatCount. Used by healer and combat to detect incoming-damage rate
    // without duplicating the damage-delta calculation at each call site.
    function addDamageThreat(player, amount) {
        if (!player) return;
        player.lastDamageThreatAt = Date.now();
        player.damageThreatCount = (typeof player.damageThreatCount === "number"
            ? player.damageThreatCount : 0) + 1;
        if (typeof amount === "number" && amount > 0) player.lastDamageThreatAmount = amount;
    }

    const playerModel = {
        createPlayerBase:  createPlayerBase,
        ensurePlayersState: ensurePlayersState,
        findPlayerBySid:   findPlayerBySid,
        ensurePlayer:      ensurePlayer,
        markDead:          markDead,
        applyTupleUpdate:  applyTupleUpdate,
        isAlive:           isAlive,
        isTeam:            isTeam,
        isSameTeam:        isSameTeam,
        isReloadReady:     isReloadReady,
        applyHealthUpdate: applyHealthUpdate,
        setReload:         setReload,
        addDamageThreat:   addDamageThreat
    };

    Nozo.playerModel = playerModel;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.playerModel = playerModel;
})();
