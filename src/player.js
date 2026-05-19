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

    const playerModel = {
        createPlayerBase: createPlayerBase,
        ensurePlayersState: ensurePlayersState,
        findPlayerBySid: findPlayerBySid,
        ensurePlayer: ensurePlayer,
        markDead: markDead,
        applyTupleUpdate: applyTupleUpdate
    };

    Nozo.playerModel = playerModel;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.playerModel = playerModel;
})();
