/* AutoBuy module scaffold for NozoNext.
   Ported state/toggle wiring; buying flow can be expanded safely later. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const state = {
        enabled: false,
        active: false,
        lastRunAt: 0,
        lastReason: null,
        buys: 0
    };

    function setEnabled(flag) {
        state.enabled = !!flag;
        state.active = state.enabled;
        if (Nozo.log) Nozo.log("autobuy:setEnabled", { enabled: state.enabled });
    }

    function start(reason) {
        state.active = true;
        state.lastReason = reason || "manual";
        if (Nozo.log) Nozo.log("autobuy:start", { reason: state.lastReason });
    }

    function stop(reason) {
        state.active = false;
        state.lastReason = reason || "manual";
        if (Nozo.log) Nozo.log("autobuy:stop", { reason: state.lastReason });
    }

    function step(context) {
        if (!state.enabled || !state.active) return;
        state.lastRunAt = Date.now();
        const player = (context && context.player) || (Nozo.state && Nozo.state.player) || null;
        if (!player) return;
        // Intentional scaffold: decision + packet buy flow gets filled during parity pass.
    }

    const autobuy = {
        state: state,
        setEnabled: setEnabled,
        start: start,
        stop: stop,
        step: step
    };

    Nozo.autoBuy = autobuy;
    Nozo.state = Nozo.state || {};
    Nozo.state.autoBuy = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.autoBuy = autobuy;
})();

