/* Html/menu module for NozoNext. Mounts a settings panel to the DOM.
   Persists values via GM_getValue/GM_setValue and localStorage. No packet sends. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const _PREFIX = "nozoNext.";

    const _DEFAULTS = {
        "html.enabled": true,
        "render.enabled": true
    };

    const state = {
        enabled: true,
        mounted: false,
        visible: true,
        panel: null,
        settings: Object.assign({}, _DEFAULTS)
    };

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

    function setEnabled(flag) {
        state.enabled = !!flag;
        if (!state.enabled && state.mounted) unmount();
        if (Nozo.log) Nozo.log("html:setEnabled", { enabled: state.enabled });
    }

    function _makeRow(doc, labelText, key, onChangeFn) {
        const row = doc.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:5px;font-size:12px;";

        const cb = doc.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!getValue(key);
        cb.style.cssText = "cursor:pointer;accent-color:#8ecc51;";
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

    function mount() {
        if (!state.enabled) return false;
        if (state.mounted) return true;

        const doc = root.document;
        if (!doc || !doc.body) return false;

        // Remove any stale panel left in the DOM (e.g. after script re-injection).
        const stale = doc.getElementById("nozoNextHtmlPanel");
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

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
            "background:rgba(0,0,0,0.55)",
            "color:#fff",
            "font-family:monospace",
            "font-size:12px",
            "padding:8px 10px",
            "border-radius:6px",
            "min-width:190px",
            "pointer-events:auto",
            "user-select:none",
            "box-shadow:0 2px 8px rgba(0,0,0,0.5)"
        ].join(";");

        // Title row
        const title = doc.createElement("div");
        title.style.cssText = "font-size:13px;font-weight:bold;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;";
        const titleText = doc.createElement("span");
        titleText.textContent = "NozoNext";
        title.appendChild(titleText);

        const collapseBtn = doc.createElement("button");
        collapseBtn.textContent = "-";
        collapseBtn.style.cssText = "background:none;border:none;color:#fff;cursor:pointer;font-size:14px;padding:0 2px;line-height:1;";
        collapseBtn.addEventListener("click", toggle);
        title.appendChild(collapseBtn);
        panel.appendChild(title);

        // Settings body
        const body = doc.createElement("div");
        body.id = "nozoNextHtmlBody";

        body.appendChild(_makeRow(doc, "Render Overlay", "render.enabled", function (val) {
            if (Nozo.render && typeof Nozo.render.setEnabled === "function") Nozo.render.setEnabled(val);
        }));

        panel.appendChild(body);
        doc.body.appendChild(panel);

        state.panel = panel;
        state.mounted = true;

        // Apply persisted render toggle immediately
        if (Nozo.render && typeof Nozo.render.setEnabled === "function") {
            Nozo.render.setEnabled(!!state.settings["render.enabled"]);
        }

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
        state: state,
        setEnabled: setEnabled,
        mount: mount,
        unmount: unmount,
        toggle: toggle,
        getValue: getValue,
        setValue: setValue
    };

    Nozo.html = html;
    Nozo.state = Nozo.state || {};
    Nozo.state.html = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.html = html;
})();
