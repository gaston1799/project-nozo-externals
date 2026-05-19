/* Html/menu module for NozoNext. Mounts a settings panel to the DOM.
   Persists values via GM_getValue/GM_setValue and localStorage. No packet sends. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const _PREFIX = "nozoNext.";

    const _DEFAULTS = {
        "html.enabled":      true,
        "render.enabled":    true,
        "traps.enabled":     true,
        "autobreak.enabled": true,
        "movement.enabled":  false,
        "debug.enabled":     true
    };

    const state = {
        enabled:  true,
        mounted:  false,
        visible:  true,
        panel:    null,
        settings: Object.assign({}, _DEFAULTS)
    };

    // --- Storage helpers -------------------------------------------------

    function _storageGet(key) {
        if (typeof GM_getValue === "function") {
            try {
                const v = GM_getValue(_PREFIX + key, null);
                if (v !== null && v !== undefined) return v;
            } catch (e) {}
        }
        try {
            const doc = root.localStorage;
            if (doc) {
                const raw = doc.getItem(_PREFIX + key);
                if (raw !== null) return JSON.parse(raw);
            }
        } catch (e) {}
        return null;
    }

    function _storageSet(key, value) {
        if (typeof GM_setValue === "function") {
            try { GM_setValue(_PREFIX + key, value); } catch (e) {}
        }
        try {
            if (root.localStorage) root.localStorage.setItem(_PREFIX + key, JSON.stringify(value));
        } catch (e) {}
    }

    function getValue(key) {
        const stored = _storageGet(key);
        if (stored !== null && stored !== undefined) return stored;
        return (key in _DEFAULTS) ? _DEFAULTS[key] : undefined;
    }

    function setValue(key, value) {
        state.settings[key] = value;
        _storageSet(key, value);
    }

    // --- Panel enable/disable --------------------------------------------

    function setEnabled(flag) {
        state.enabled = !!flag;
        if (!state.enabled && state.mounted) unmount();
        if (Nozo.log) Nozo.log("html:setEnabled", { enabled: state.enabled });
    }

    // --- Live module wiring ----------------------------------------------

    function _applyRender(val) {
        if (Nozo.render && typeof Nozo.render.setEnabled === "function") Nozo.render.setEnabled(val);
    }

    function _applyTraps(val) {
        if (Nozo.traps && typeof Nozo.traps.setEnabled === "function") Nozo.traps.setEnabled(val);
    }

    function _applyAutoBreak(val) {
        if (Nozo.autoBreak && typeof Nozo.autoBreak.setEnabled === "function") Nozo.autoBreak.setEnabled(val);
    }

    function _applyMovement(val) {
        if (Nozo.movement && typeof Nozo.movement.setEnabled === "function") Nozo.movement.setEnabled(val);
    }

    function _applyDebug(val) {
        if (Nozo.debug) Nozo.debug.enabled = !!val;
    }

    // --- DOM helpers -----------------------------------------------------

    function _makeSection(doc, label) {
        const sec = doc.createElement("div");
        sec.style.cssText = "margin-top:8px;margin-bottom:2px;font-size:10px;font-weight:bold;" +
            "color:#8ecc51;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid rgba(142,204,81,.25);padding-bottom:2px;";
        sec.textContent = label;
        return sec;
    }

    function _makeRow(doc, labelText, key, onChangeFn) {
        const row = doc.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:4px;font-size:12px;";

        const cb = doc.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!getValue(key);
        cb.style.cssText = "cursor:pointer;accent-color:#8ecc51;flex-shrink:0;";
        cb.addEventListener("change", function () {
            setValue(key, cb.checked);
            if (typeof onChangeFn === "function") {
                try { onChangeFn(cb.checked); } catch (e) {}
            }
        });

        const span = doc.createElement("span");
        span.textContent = labelText;

        row.appendChild(cb);
        row.appendChild(span);
        return row;
    }

    // --- Mount/unmount ---------------------------------------------------

    function mount() {
        if (!state.enabled) return false;
        if (state.mounted) return true;

        const doc = root.document;
        if (!doc || !doc.body) return false;

        // Remove any stale panel (e.g. after script re-injection).
        const stale = doc.getElementById("nozoNextHtmlPanel");
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

        // Load persisted values into state.settings before building checkboxes.
        Object.keys(_DEFAULTS).forEach(function (key) {
            const stored = _storageGet(key);
            if (stored !== null && stored !== undefined) state.settings[key] = stored;
        });

        const panel = doc.createElement("div");
        panel.id = "nozoNextHtmlPanel";
        panel.style.cssText = [
            "position:fixed",
            "top:20px",
            "left:20px",
            "z-index:9999",
            "background:rgba(0,0,0,0.72)",
            "color:#fff",
            "font-family:monospace",
            "font-size:12px",
            "padding:8px 10px 10px",
            "border-radius:6px",
            "min-width:200px",
            "max-height:80vh",
            "pointer-events:auto",
            "user-select:none",
            "box-shadow:0 2px 12px rgba(0,0,0,0.6)"
        ].join(";");

        // Title row
        const title = doc.createElement("div");
        title.style.cssText = "font-size:13px;font-weight:bold;margin-bottom:4px;" +
            "display:flex;justify-content:space-between;align-items:center;";
        const titleText = doc.createElement("span");
        titleText.textContent = "NozoNext";
        title.appendChild(titleText);

        const collapseBtn = doc.createElement("button");
        collapseBtn.textContent = "-";
        collapseBtn.style.cssText = "background:none;border:none;color:#fff;cursor:pointer;" +
            "font-size:14px;padding:0 2px;line-height:1;";
        collapseBtn.addEventListener("click", toggle);
        title.appendChild(collapseBtn);
        panel.appendChild(title);

        // Scrollable body
        const body = doc.createElement("div");
        body.id = "nozoNextHtmlBody";
        body.style.cssText = "overflow-y:auto;max-height:calc(80vh - 36px);padding-right:2px;";

        // --- Render section ---
        body.appendChild(_makeSection(doc, "Render"));
        body.appendChild(_makeRow(doc, "Render Overlay", "render.enabled", _applyRender));

        // --- Combat section ---
        body.appendChild(_makeSection(doc, "Combat"));
        body.appendChild(_makeRow(doc, "Trap System", "traps.enabled", _applyTraps));
        body.appendChild(_makeRow(doc, "AutoBreak", "autobreak.enabled", _applyAutoBreak));

        // --- Movement section ---
        body.appendChild(_makeSection(doc, "Movement"));
        body.appendChild(_makeRow(doc, "Movement Helper", "movement.enabled", _applyMovement));

        // --- Debug section ---
        body.appendChild(_makeSection(doc, "Debug"));
        body.appendChild(_makeRow(doc, "Debug Logging", "debug.enabled", _applyDebug));

        panel.appendChild(body);
        doc.body.appendChild(panel);

        state.panel = panel;
        state.mounted = true;

        // Apply persisted state to live modules immediately on mount.
        _applyRender(!!state.settings["render.enabled"]);
        _applyTraps(!!state.settings["traps.enabled"]);
        _applyAutoBreak(!!state.settings["autobreak.enabled"]);
        _applyMovement(!!state.settings["movement.enabled"]);
        _applyDebug(!!state.settings["debug.enabled"]);

        if (Nozo.log) Nozo.log("html:mount", {});
        return true;
    }

    function unmount() {
        if (!state.mounted) return;
        const el = state.panel;
        if (el && el.parentNode) el.parentNode.removeChild(el);
        state.panel = null;
        state.mounted = false;
        if (Nozo.log) Nozo.log("html:unmount", {});
    }

    function toggle() {
        if (!state.mounted || !state.panel) return;
        state.visible = !state.visible;
        const body = root.document && root.document.getElementById("nozoNextHtmlBody");
        if (body) body.style.display = state.visible ? "" : "none";
        const btn = state.panel.querySelector("button");
        if (btn) btn.textContent = state.visible ? "-" : "+";
        if (Nozo.log) Nozo.log("html:toggle", { visible: state.visible });
    }

    const html = {
        state:      state,
        setEnabled: setEnabled,
        mount:      mount,
        unmount:    unmount,
        toggle:     toggle,
        getValue:   getValue,
        setValue:   setValue
    };

    Nozo.html = html;
    Nozo.state = Nozo.state || {};
    Nozo.state.html = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.html = html;
})();
