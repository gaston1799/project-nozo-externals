/* Input foundation for NozoNext. No packet sends; no combat logic. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const maxHistory = (Nozo.constants && Nozo.constants.MAX_LOG) || 64;
    const _history = [];

    function _record(kind, detail) {
        _history.push({ kind: kind, detail: detail || null, t: Date.now() });
        if (_history.length > maxHistory) _history.shift();
    }

    // Mutable input state — reachable at Nozo.state.input and Nozo.input.state.
    const state = {
        clicks: { left: false, middle: false, right: false },
        keys:   {},
        mouse:  { x: 0, y: 0, clientX: 0, clientY: 0 },
        macro:  {}
    };

    // Registered manual-swing callbacks.
    const _swingCallbacks = [];

    // Listener registry used by detach().
    const _listeners = [];

    function _add(target, type, fn, opts) {
        target.addEventListener(type, fn, opts !== undefined ? opts : false);
        _listeners.push({ target: target, type: type, fn: fn, opts: opts !== undefined ? opts : false });
    }

    function _removeAll() {
        for (let i = 0; i < _listeners.length; i++) {
            const l = _listeners[i];
            try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch (e) { /* ignore */ }
        }
        _listeners.length = 0;
    }

    // --- state setters ---------------------------------------------------

    function setClick(buttonName, value, source) {
        if (!(buttonName in state.clicks)) return;
        state.clicks[buttonName] = !!value;
        _record("click", { button: buttonName, value: !!value, source: source || null });
        if (Nozo.log) Nozo.log("input:click", { button: buttonName, value: !!value, source: source || null });
    }

    function setKey(code, value, source) {
        state.keys[code] = !!value;
        _record("key", { code: code, value: !!value, source: source || null });
        if (Nozo.log) Nozo.log("input:key", { code: code, value: !!value, source: source || null });
    }

    function setMouse(eventLike, source) {
        if (!eventLike) return;
        if (typeof eventLike.clientX === "number") state.mouse.clientX = eventLike.clientX;
        if (typeof eventLike.clientY === "number") state.mouse.clientY = eventLike.clientY;
        // x/y may differ from clientX/Y on scaled canvases; fall back to client coords.
        state.mouse.x = typeof eventLike.x === "number" ? eventLike.x : state.mouse.clientX;
        state.mouse.y = typeof eventLike.y === "number" ? eventLike.y : state.mouse.clientY;
        _record("mouse", { x: state.mouse.x, y: state.mouse.y, source: source || null });
    }

    // --- state getters ---------------------------------------------------

    function getClicks() {
        return { left: state.clicks.left, middle: state.clicks.middle, right: state.clicks.right };
    }

    function getKeys() {
        return Object.assign({}, state.keys);
    }

    function getMouse() {
        return Object.assign({}, state.mouse);
    }

    function getMacro() {
        return Object.assign({}, state.macro);
    }

    // --- manual swing hook -----------------------------------------------

    function onManualSwing(callback) {
        if (typeof callback === "function") _swingCallbacks.push(callback);
    }

    function emitManualSwing(reason) {
        const snapshot = {
            reason: reason || "manual",
            clicks: getClicks(),
            mouse:  getMouse(),
            t:      Date.now()
        };
        _record("swing", { reason: snapshot.reason });
        if (Nozo.log) Nozo.log("input:swing", snapshot);
        for (let i = 0; i < _swingCallbacks.length; i++) {
            try { _swingCallbacks[i](snapshot); } catch (e) { /* ignore */ }
        }
    }

    // --- attach / detach -------------------------------------------------

    function attach(target, options) {
        const opts = options || {};
        const preventCtx = !!opts.preventContextMenu;
        const win = (root && typeof root.addEventListener === "function") ? root : null;

        if (!target || typeof target.addEventListener !== "function") {
            if (Nozo.log) Nozo.log("input:attach:blocked", { reason: "no valid target" });
            return { ok: false, reason: "no valid target" };
        }

        // Mouse position — tracked on the canvas target.
        _add(target, "mousemove", function onMouseMove(e) {
            setMouse(e, "mousemove");
        });

        // Button down — left and right are tracked separately per task requirement.
        _add(target, "mousedown", function onMouseDown(e) {
            if (e.button === 0) {
                setClick("left", true, "mousedown");
            } else if (e.button === 1) {
                setClick("middle", true, "mousedown");
            } else if (e.button === 2) {
                setClick("right", true, "mousedown");
            }
        });

        // Button up — bound to window so drag-release outside the canvas still clears state.
        const upTarget = win || target;
        _add(upTarget, "mouseup", function onMouseUp(e) {
            if (e.button === 0) {
                setClick("left", false, "mouseup");
            } else if (e.button === 1) {
                setClick("middle", false, "mouseup");
            } else if (e.button === 2) {
                setClick("right", false, "mouseup");
            }
        });

        // Context menu suppression is opt-in only.
        if (preventCtx) {
            _add(target, "contextmenu", function onContextMenu(e) {
                e.preventDefault();
            });
        }

        // Keyboard — always bound to window, not the canvas.
        if (win) {
            _add(win, "keydown", function onKeyDown(e) {
                const code = e.code || String(e.which || e.keyCode || 0);
                setKey(code, true, "keydown");
                // Mirror e.key into macro for legacy hat-changer compat (macro[key] = 1/0).
                if (e.key) state.macro[e.key] = 1;
            });

            _add(win, "keyup", function onKeyUp(e) {
                const code = e.code || String(e.which || e.keyCode || 0);
                setKey(code, false, "keyup");
                if (e.key) state.macro[e.key] = 0;
            });
        }

        if (Nozo.log) Nozo.log("input:attach", {
            target: target.id || target.tagName || "?",
            preventContextMenu: preventCtx
        });
        return { ok: true };
    }

    function detach() {
        _removeAll();
        if (Nozo.log) Nozo.log("input:detach", { t: Date.now() });
    }

    // --- public API ------------------------------------------------------

    const input = {
        state:           state,
        attach:          attach,
        detach:          detach,
        setClick:        setClick,
        setKey:          setKey,
        setMouse:        setMouse,
        getClicks:       getClicks,
        getKeys:         getKeys,
        getMouse:        getMouse,
        getMacro:        getMacro,
        onManualSwing:   onManualSwing,
        emitManualSwing: emitManualSwing,
        getHistory:      function getHistory() { return _history.slice(); }
    };

    Nozo.input = input;
    Nozo.state = Nozo.state || {};
    Nozo.state.input = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.input = input;
})();
