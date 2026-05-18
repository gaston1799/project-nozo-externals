/* Network event dispatcher for NozoNext websocket packets. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

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

    Nozo.netEvents = {
        handlers: handlers,
        setHandlers: setHandlers,
        dispatch: dispatch
    };
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.netEvents = Nozo.netEvents;
})();
