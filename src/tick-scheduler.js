/* Tick-based deferred callback scheduler for NozoNext.
   Replaces setTimeout-driven deferred actions where 1-tick (50 ms) granularity is sufficient.
   scheduleInTicks / scheduleNextTick / cancel / runTick form the public API. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const _MAX_QUEUE   = 128;
    const _MAX_HISTORY = 64;

    let _nextId = 1;
    const _queue   = []; // { id, fireTick, fn, meta, tag, scheduledAt }
    const _history = []; // { kind, detail, t }

    // Live scheduler state — reachable at Nozo.tickScheduler.state and Nozo.state.tickScheduler.
    const state = {
        pendingCount:     0,
        lastExecutedTag:  null,
        lastExecutedTick: null,
        totalScheduled:   0,
        totalExecuted:    0,
        totalCanceled:    0
    };

    function _record(kind, detail) {
        _history.push({ kind: kind, detail: detail || null, t: Date.now() });
        if (_history.length > _MAX_HISTORY) _history.shift();
    }

    function _currentTick() {
        return (Nozo.state && typeof Nozo.state.tick === "number") ? Nozo.state.tick : 0;
    }

    // Schedule fn to run after delayTicks ticks from the current tick. Returns id for cancel().
    // meta.tag labels the entry in logs and debug state.
    function scheduleInTicks(delayTicks, fn, meta) {
        if (typeof fn !== "function") return null;
        const currentTick = _currentTick();
        const delay    = (typeof delayTicks === "number" && delayTicks >= 0) ? Math.ceil(delayTicks) : 1;
        const fireTick = currentTick + delay;
        const id       = _nextId++;
        const tag      = (meta && meta.tag) || null;

        if (_queue.length >= _MAX_QUEUE) _queue.shift();
        _queue.push({ id: id, fireTick: fireTick, fn: fn, meta: meta || null, tag: tag, scheduledAt: Date.now() });
        state.pendingCount = _queue.length;
        state.totalScheduled++;

        _record("scheduled", { id: id, fireTick: fireTick, tag: tag, delay: delay, currentTick: currentTick });
        if (Nozo.log) Nozo.log("tickScheduler:scheduled", { id: id, fireTick: fireTick, tag: tag, delay: delay });
        return id;
    }

    // Convenience: schedule fn on the very next tick.
    function scheduleNextTick(fn, meta) {
        return scheduleInTicks(1, fn, meta);
    }

    // Cancel a previously scheduled entry by id. Returns true if found and removed.
    function cancel(id) {
        for (let i = 0; i < _queue.length; i++) {
            if (_queue[i].id === id) {
                const entry = _queue.splice(i, 1)[0];
                state.pendingCount = _queue.length;
                state.totalCanceled++;
                _record("canceled", { id: id, tag: entry.tag, fireTick: entry.fireTick });
                if (Nozo.log) Nozo.log("tickScheduler:canceled", { id: id, tag: entry.tag });
                return true;
            }
        }
        return false;
    }

    // Execute all entries whose fireTick <= currentTick. Called once per bridge tick before other modules.
    function runTick(currentTick) {
        const tick = typeof currentTick === "number" ? currentTick : _currentTick();
        let i = 0;
        while (i < _queue.length) {
            const entry = _queue[i];
            if (entry.fireTick <= tick) {
                _queue.splice(i, 1);
                state.pendingCount = _queue.length;
                try {
                    entry.fn(tick);
                } catch (e) {
                    if (Nozo.log) Nozo.log("tickScheduler:error", { id: entry.id, tag: entry.tag, err: e && e.message });
                }
                state.lastExecutedTag  = entry.tag;
                state.lastExecutedTick = tick;
                state.totalExecuted++;
                _record("executed", { id: entry.id, tag: entry.tag, fireTick: entry.fireTick, actualTick: tick });
                if (Nozo.log) Nozo.log("tickScheduler:executed", { id: entry.id, tag: entry.tag, tick: tick });
            } else {
                i++;
            }
        }
    }

    function getDebugState() {
        return Object.assign({}, state, {
            queue: _queue.map(function (e) { return { id: e.id, fireTick: e.fireTick, tag: e.tag }; }),
            time: Date.now()
        });
    }

    function getHistory() {
        return _history.slice();
    }

    const tickScheduler = {
        state:            state,
        scheduleInTicks:  scheduleInTicks,
        scheduleNextTick: scheduleNextTick,
        cancel:           cancel,
        runTick:          runTick,
        getDebugState:    getDebugState,
        getHistory:       getHistory
    };

    Nozo.tickScheduler = tickScheduler;
    Nozo.state = Nozo.state || {};
    Nozo.state.tickScheduler = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.tickScheduler = tickScheduler;
})();
