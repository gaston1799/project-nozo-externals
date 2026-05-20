/* InstaKill (instaC) module scaffold for NozoNext.
   Wiring and toggle state are ported; attack process remains intentionally disabled. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    // Full legacy state shape mirroring moomoo.js Instakill class plus bridge-layer additions.
    const state = {
        // ---- Core execution flags (moomoo.js Instakill class) ----
        enabled:       false,   // NozoNext module on/off toggle
        isTrue:        false,   // master "insta executing" lock (blocks other automation)
        wait:          false,   // readiness gate; drives crosshair render condition
        can:           false,   // conditions met to fire insta (legacy: instaC.can)
        ticking:       false,   // tick sequence in-progress (blocks autoplace/autopush)
        isTicking:     false,   // hammerInsta alias for ticking
        hammer:        false,   // hammer-insta variant active
        canSpikeTick:  false,   // spike-tick bonus ready this cycle
        startTick:     false,   // tick-sequence start flag
        readyTick:     false,   // tick-sequence ready flag
        canCounter:    false,   // counter-attack ready after taking damage
        revTick:       false,   // reverse-tick variant flag
        syncHit:       true,    // synchronized hit tracking (legacy default true)
        age1insta:     false,   // age-1 insta variant
        nobull:        false,   // nobull strategy variant
        canKb:         false,   // knockback-only sub-sequence ready
        canspam:       false,   // spam-mode flag
        // ---- Bridge-layer additions ----
        pending:       false,   // queued insta request (set before conditions fully met)
        sourceTag:     null,    // string tag of what triggered insta (e.g. "kbi", "hammerInsta", "manual")
        targetSid:     null,    // session-id of locked target player
        lockTick:      0,       // Nozo.state.tick when instaC lock was acquired
        expireTick:    0,       // Nozo.state.tick when lock should auto-expire
        // ---- Tracking ----
        active:        false,
        lastRunAt:     0,
        lastReason:    null,
        attempts:      0
    };

    function _syncFlags() {
        state.active = !!(state.enabled && state.isTrue);
    }

    // --- Setters with typed flip logs ---

    function setEnabled(flag) {
        const prev = state.enabled;
        state.enabled = !!flag;
        _syncFlags();
        if (prev !== state.enabled && Nozo.log)
            Nozo.log("instakill:enabled", { enabled: state.enabled, isTrue: state.isTrue, active: state.active });
    }

    function setIsTrue(flag) {
        const prev = state.isTrue;
        state.isTrue = !!flag;
        _syncFlags();
        if (prev !== state.isTrue && Nozo.log)
            Nozo.log("instakill:isTrue", { isTrue: state.isTrue, active: state.active });
    }

    function setWait(flag) {
        const prev = state.wait;
        state.wait = !!flag;
        if (prev !== state.wait && Nozo.log)
            Nozo.log("instakill:wait", { wait: state.wait });
    }

    function setCan(flag) {
        const prev = state.can;
        state.can = !!flag;
        if (prev !== state.can && Nozo.log)
            Nozo.log("instakill:can", { can: state.can });
    }

    function setTicking(flag) {
        const prev = state.ticking;
        state.ticking = !!flag;
        state.isTicking = state.ticking;
        if (prev !== state.ticking && Nozo.log)
            Nozo.log("instakill:ticking", { ticking: state.ticking });
    }

    function setPending(flag, sourceTag, targetSid) {
        const prev = state.pending;
        state.pending = !!flag;
        if (sourceTag !== undefined) state.sourceTag = sourceTag || null;
        if (targetSid !== undefined) state.targetSid = targetSid != null ? targetSid : null;
        if (prev !== state.pending && Nozo.log)
            Nozo.log("instakill:pending", { pending: state.pending, sourceTag: state.sourceTag, targetSid: state.targetSid });
    }

    function setLockTick(lockTick, expireTick) {
        state.lockTick = lockTick || 0;
        state.expireTick = expireTick || 0;
        if (Nozo.log)
            Nozo.log("instakill:lockTick", { lockTick: state.lockTick, expireTick: state.expireTick });
    }

    function reset() {
        const wasTrue = state.isTrue;
        state.isTrue       = false;
        state.wait         = false;
        state.can          = false;
        state.ticking      = false;
        state.isTicking    = false;
        state.hammer       = false;
        state.canSpikeTick = false;
        state.startTick    = false;
        state.readyTick    = false;
        state.canCounter   = false;
        state.revTick      = false;
        state.syncHit      = true;
        state.age1insta    = false;
        state.nobull       = false;
        state.canKb        = false;
        state.canspam      = false;
        state.pending      = false;
        state.sourceTag    = null;
        state.targetSid    = null;
        state.lockTick     = 0;
        state.expireTick   = 0;
        _syncFlags();
        if (Nozo.log) Nozo.log("instakill:reset", { wasTrue: wasTrue });
    }

    function start(reason) {
        setIsTrue(true);
        state.lastReason = reason || "manual";
        if (Nozo.log) Nozo.log("instakill:start", { reason: state.lastReason });
    }

    function stop(reason) {
        setIsTrue(false);
        state.lastReason = reason || "manual";
        if (Nozo.log) Nozo.log("instakill:stop", { reason: state.lastReason });
    }

    function step(context) {
        if (!state.active) return;
        state.lastRunAt = Date.now();
        state.attempts++;

        // Execution block intentionally disabled — wiring-only port.
        // No manualSwing / send calls permitted from the update loop per constraints.
        // if (Nozo.combat && Nozo.combat.manualSwing) {
        //     Nozo.combat.manualSwing("instakill", context || {});
        // }
    }

    const instakill = {
        state:       state,
        setEnabled:  setEnabled,
        setIsTrue:   setIsTrue,
        setWait:     setWait,
        setCan:      setCan,
        setTicking:  setTicking,
        setPending:  setPending,
        setLockTick: setLockTick,
        reset:       reset,
        start:       start,
        stop:        stop,
        step:        step
    };

    Nozo.instaKill = instakill;
    Nozo.state = Nozo.state || {};
    Nozo.state.instaKill = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.instaKill = instakill;
})();
