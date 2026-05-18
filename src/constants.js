/* Pure bootstrap constants for NozoNext. No gameplay catalogs. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    Nozo.constants = {
        VERSION: "next",
        MAP_SCALE: 14400,   // moomoo.io world width/height in game units
        TICK_MS: 100,       // server tick period (10 Hz)
        RELOAD_TICK: 400,   // base weapon reload in ms
        MAX_LOG: 250        // debug log ring-buffer size (matches Nozo.debug.logs limit)
    };
})();
