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
        "render.visualType": "default",
        "render.resetRender": true,
        "traps.enabled":     true,
        "autobreak.enabled": true,
        "autoplace.enabled": true,
        "replacer.enabled":  true,
        "preplacer.enabled": true,
        "autobuy.enabled":   false,
        "instakill.enabled": false,
        "instakill.istrue":  false,
        "instakill.wait":    false,
        "healer.enabled":    true,
        "movement.enabled":  false,
        "kbi.render":        true,
        "render.autoPush":   true,
        "render.spikeCones": false,
        "render.tracerGhost": true,
        "debug.enabled":     true
    };

    const state = {
        enabled:       true,
        mounted:       false,
        visible:       true,
        panel:         null,
        weaponHud:     null,
        settings:      Object.assign({}, _DEFAULTS),
        _debugInterval: null,
        _debugInfoEl:  null,
        _weaponHudInterval: null,
        _lastReloadByWeapon: {},
        _lastWeaponKey: null
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
    function _applyRenderVisualType(val) {
        if (!Nozo.state) Nozo.state = {};
        if (!Nozo.state.renderConfig) Nozo.state.renderConfig = {};
        Nozo.state.renderConfig.visualType = String(val || "default");
    }
    function _applyRenderReset(val) {
        if (!Nozo.state) Nozo.state = {};
        if (!Nozo.state.renderConfig) Nozo.state.renderConfig = {};
        Nozo.state.renderConfig.resetRender = !!val;
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

    function _applyHealer(val) {
        if (Nozo.healer && typeof Nozo.healer.setEnabled === "function") Nozo.healer.setEnabled(val);
    }

    function _applyAutoBuy(val) {
        if (Nozo.autoBuy && typeof Nozo.autoBuy.setEnabled === "function") Nozo.autoBuy.setEnabled(val);
    }

    function _applyInstaKillEnabled(val) {
        if (Nozo.instaKill && typeof Nozo.instaKill.setEnabled === "function") Nozo.instaKill.setEnabled(val);
    }

    function _applyInstaKillIsTrue(val) {
        if (Nozo.instaKill && typeof Nozo.instaKill.setIsTrue === "function") Nozo.instaKill.setIsTrue(val);
    }

    function _applyInstaKillWait(val) {
        if (Nozo.instaKill && typeof Nozo.instaKill.setWait === "function") Nozo.instaKill.setWait(val);
    }

    function _applyAutoPlace(val) {
        if (Nozo.autoPlace && typeof Nozo.autoPlace.setEnabled === "function") Nozo.autoPlace.setEnabled(val);
    }

    function _applyReplacer(val) {
        if (Nozo.replacer && typeof Nozo.replacer.setEnabled === "function") Nozo.replacer.setEnabled(val);
    }

    function _applyPreplacer(val) {
        if (Nozo.preplacer && typeof Nozo.preplacer.setEnabled === "function") Nozo.preplacer.setEnabled(val);
    }

    function _applyKbiRender(val) {
        if (Nozo.kbSimulator && typeof Nozo.kbSimulator.setRenderEnabled === "function") {
            Nozo.kbSimulator.setRenderEnabled(val);
        }
    }

    function _applyDebug(val) {
        if (Nozo.debug) Nozo.debug.enabled = !!val;
    }

    function _applyLegacyRenderFlag(storageKey, val) {
        try {
            if (root.localStorage) root.localStorage.setItem(storageKey, val ? "1" : "0");
        } catch (e) {}
    }

    function _applyRenderAutoPush(val) {
        _applyLegacyRenderFlag("showAutoPushRender", !!val);
    }

    function _applyRenderSpikeCones(val) {
        _applyLegacyRenderFlag("showSpikeCones", !!val);
    }

    function _applyRenderTracerGhost(val) {
        _applyLegacyRenderFlag("showTracerGhost", !!val);
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

    function _makeSelectRow(doc, labelText, key, options, onChangeFn) {
        const row = doc.createElement("label");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:12px;";

        const span = doc.createElement("span");
        span.textContent = labelText;

        const sel = doc.createElement("select");
        sel.style.cssText = "background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:11px;padding:2px 4px;border-radius:4px;";
        const current = String(getValue(key) || "default");
        for (let i = 0; i < options.length; i++) {
            const opt = doc.createElement("option");
            opt.value = options[i].value;
            opt.textContent = options[i].label;
            if (opt.value === current) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener("change", function () {
            setValue(key, sel.value);
            if (typeof onChangeFn === "function") {
                try { onChangeFn(sel.value); } catch (e) {}
            }
        });

        row.appendChild(span);
        row.appendChild(sel);
        return row;
    }

    function _injectWeaponHudStyles(doc) {
        if (!doc) return;
        if (doc.getElementById("nozoWeaponHudStyle")) return;
        const style = doc.createElement("style");
        style.id = "nozoWeaponHudStyle";
        style.textContent = ""
            + "@keyframes nozoWiggle{0%{transform:translateX(0)}15%{transform:translateX(-2px)}30%{transform:translateX(2px)}45%{transform:translateX(-1px)}60%{transform:translateX(1px)}100%{transform:translateX(0)}}\n"
            + "#nozoWeaponHud{position:fixed;left:20px;top:214px;z-index:9999;background:rgba(0,0,0,.72);color:#fff;font-family:monospace;font-size:12px;padding:8px 10px;border-radius:6px;min-width:200px;pointer-events:none;user-select:none;box-shadow:0 2px 12px rgba(0,0,0,.6)}\n"
            + "#nozoWeaponHud.nozo-wiggle{animation:nozoWiggle 220ms ease-out}\n"
            + "#nozoWeaponHud .nozo-weapon-row{display:flex;align-items:center;gap:8px}\n"
            + "#nozoWeaponHud .nozo-weapon-icon{width:34px;height:34px;image-rendering:auto;object-fit:contain;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}\n"
            + "#nozoWeaponHud .nozo-weapon-main{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}\n"
            + "#nozoWeaponHud .nozo-weapon-label{font-size:11px;line-height:1;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px}\n"
            + "#nozoWeaponHud .nozo-reload-wrap{height:8px;background:rgba(255,255,255,.16);border-radius:999px;overflow:hidden}\n"
            + "#nozoWeaponHud .nozo-reload-bar{height:100%;width:100%;background:linear-gradient(90deg,#7fd14d,#c5ee6e);transform-origin:left center;transform:scaleX(1);transition:transform 80ms linear,background 120ms linear}\n"
            + "#nozoWeaponHud .nozo-reload-meta{font-size:10px;line-height:1;opacity:.85}";
        doc.head ? doc.head.appendChild(style) : doc.body && doc.body.appendChild(style);
    }

    function _createWeaponHud(doc) {
        if (!doc || !doc.body) return null;
        const stale = doc.getElementById("nozoWeaponHud");
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

        const hud = doc.createElement("div");
        hud.id = "nozoWeaponHud";
        hud.innerHTML = ""
            + "<div class=\"nozo-weapon-row\">"
            + "  <img class=\"nozo-weapon-icon\" alt=\"weapon\" />"
            + "  <div class=\"nozo-weapon-main\">"
            + "    <div class=\"nozo-weapon-label\">Weapon</div>"
            + "    <div class=\"nozo-reload-wrap\"><div class=\"nozo-reload-bar\"></div></div>"
            + "    <div class=\"nozo-reload-meta\">ready</div>"
            + "  </div>"
            + "</div>";
        doc.body.appendChild(hud);
        return hud;
    }

    function _syncWeaponHudPosition() {
        if (!state.weaponHud) return;
        state.weaponHud.style.top = state.visible ? "214px" : "20px";
    }

    function _resolveWeaponMeta(weaponIndex) {
        if (weaponIndex == null) return null;
        let w = null;
        const nozoRaw = Nozo.state && Nozo.state.itemsData && Array.isArray(Nozo.state.itemsData.raw)
            ? Nozo.state.itemsData.raw : null;
        if (nozoRaw && nozoRaw[weaponIndex]) {
            w = nozoRaw[weaponIndex];
        } else if (root.items && Array.isArray(root.items.weapons)) {
            w = root.items.weapons[weaponIndex] || null;
        }
        const nozoList = Nozo.state && Nozo.state.itemsData && Array.isArray(Nozo.state.itemsData.list)
            ? Nozo.state.itemsData.list : null;
        const fromNozo = nozoList && nozoList[weaponIndex] ? nozoList[weaponIndex] : null;
        return {
            name: (w && w.name) || (fromNozo && fromNozo.name) || ("weapon " + weaponIndex),
            src: (w && w.src) || null,
            reload: (w && typeof w.speed === "number" ? w.speed : null) || (fromNozo && typeof fromNozo.reload === "number" ? fromNozo.reload : null)
        };
    }

    function _resolveWeaponSpriteUrl(meta) {
        if (!meta || !meta.src) return null;
        const src = meta.src;
        const origin = (root.location && root.location.origin) ? root.location.origin : "https://moomoo.io";
        return origin.replace(/\/$/, "") + "/img/weapons/" + src + ".png";
    }

    function _setWiggle() {
        if (!state.weaponHud) return;
        state.weaponHud.classList.remove("nozo-wiggle");
        void state.weaponHud.offsetWidth;
        state.weaponHud.classList.add("nozo-wiggle");
    }

    function _updateWeaponHud() {
        const hud = state.weaponHud;
        if (!hud) return;
        const player = Nozo.state && Nozo.state.player ? Nozo.state.player : null;
        if (!player) {
            hud.style.display = "none";
            return;
        }
        hud.style.display = "";

        const wi = Number.isFinite(player.weaponIndex) ? player.weaponIndex : 0;
        const meta = _resolveWeaponMeta(wi);
        const reload = (player.reloads && typeof player.reloads[wi] === "number") ? player.reloads[wi] : 0;
        const maxReload = Math.max(
            1,
            meta && typeof meta.reload === "number" ? meta.reload : 0,
            Nozo.constants && typeof Nozo.constants.RELOAD_TICK === "number" ? Nozo.constants.RELOAD_TICK : 0,
            state._lastReloadByWeapon[wi] || 0
        );
        if (reload > (state._lastReloadByWeapon[wi] || 0)) state._lastReloadByWeapon[wi] = reload;

        const icon = hud.querySelector(".nozo-weapon-icon");
        const label = hud.querySelector(".nozo-weapon-label");
        const bar = hud.querySelector(".nozo-reload-bar");
        const text = hud.querySelector(".nozo-reload-meta");
        if (!icon || !label || !bar || !text) return;

        const spriteUrl = _resolveWeaponSpriteUrl(meta);
        if (spriteUrl) {
            if (icon.getAttribute("src") !== spriteUrl) icon.setAttribute("src", spriteUrl);
            icon.style.display = "";
        } else {
            icon.removeAttribute("src");
            icon.style.display = "none";
        }
        label.textContent = (meta && meta.name) ? meta.name : ("weapon " + wi);

        const progress = 1 - Math.max(0, Math.min(1, reload / maxReload));
        bar.style.transform = "scaleX(" + progress.toFixed(4) + ")";
        bar.style.background = reload > 0
            ? "linear-gradient(90deg,#f0a03b,#e15c4c)"
            : "linear-gradient(90deg,#7fd14d,#c5ee6e)";
        text.textContent = reload > 0 ? ("reloading " + Math.ceil(reload) + "ms") : "ready";

        const key = wi + ":" + (reload > 0 ? 1 : 0);
        const prevKey = state._lastWeaponKey;
        if (prevKey && prevKey !== key && reload > 0) _setWiggle();
        state._lastWeaponKey = key;
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
        body.appendChild(_makeSelectRow(doc, "Visual Type", "render.visualType", [
            { value: "default", label: "Default" },
            { value: "classic", label: "Classic" },
            { value: "neo", label: "Neo" },
            { value: "neon", label: "Neon" },
            { value: "dark", label: "Dark" },
            { value: "vapor", label: "Vapor" },
            { value: "bright", label: "Bright" },
            { value: "midnight", label: "Midnight" },
            { value: "sunset", label: "Sunset" },
            { value: "emerald", label: "Emerald" },
            { value: "amethyst", label: "Amethyst" },
            { value: "crimson", label: "Crimson" }
        ], _applyRenderVisualType));
        body.appendChild(_makeRow(doc, "Reset Render", "render.resetRender", _applyRenderReset));
        body.appendChild(_makeRow(doc, "AutoPush Render", "render.autoPush", _applyRenderAutoPush));
        body.appendChild(_makeRow(doc, "Spike Cones", "render.spikeCones", _applyRenderSpikeCones));
        body.appendChild(_makeRow(doc, "Tracer Ghost", "render.tracerGhost", _applyRenderTracerGhost));

        // --- Combat section ---
        body.appendChild(_makeSection(doc, "Combat"));
        body.appendChild(_makeRow(doc, "Trap System", "traps.enabled", _applyTraps));
        body.appendChild(_makeRow(doc, "AutoBreak", "autobreak.enabled", _applyAutoBreak));
        body.appendChild(_makeRow(doc, "AutoPlace", "autoplace.enabled", _applyAutoPlace));
        body.appendChild(_makeRow(doc, "Replacer", "replacer.enabled", _applyReplacer));
        body.appendChild(_makeRow(doc, "Preplacer", "preplacer.enabled", _applyPreplacer));
        body.appendChild(_makeRow(doc, "AutoBuy", "autobuy.enabled", _applyAutoBuy));
        body.appendChild(_makeRow(doc, "InstaKill", "instakill.enabled", _applyInstaKillEnabled));
        body.appendChild(_makeRow(doc, "InstaC isTrue", "instakill.istrue", _applyInstaKillIsTrue));
        body.appendChild(_makeRow(doc, "InstaC Wait", "instakill.wait", _applyInstaKillWait));
        body.appendChild(_makeRow(doc, "Healer", "healer.enabled", _applyHealer));
        body.appendChild(_makeRow(doc, "KBI Render", "kbi.render", _applyKbiRender));

        // --- Movement section ---
        body.appendChild(_makeSection(doc, "Movement"));
        body.appendChild(_makeRow(doc, "Movement Helper", "movement.enabled", _applyMovement));

        // --- Debug section ---
        body.appendChild(_makeSection(doc, "Debug"));
        body.appendChild(_makeRow(doc, "Debug Logging", "debug.enabled", _applyDebug));

        const debugInfoEl = doc.createElement("pre");
        debugInfoEl.style.cssText = "font-size:9px;color:#aaa;margin:4px 0 0;white-space:pre-wrap;" +
            "word-break:break-all;max-height:60px;overflow-y:auto;line-height:1.4;";
        debugInfoEl.textContent = "initData: pending";
        body.appendChild(debugInfoEl);
        state._debugInfoEl = debugInfoEl;

        panel.appendChild(body);
        doc.body.appendChild(panel);

        state.panel = panel;
        state.mounted = true;

        _injectWeaponHudStyles(doc);
        state.weaponHud = _createWeaponHud(doc);
        _syncWeaponHudPosition();
        _updateWeaponHud();
        state._weaponHudInterval = root.setInterval(_updateWeaponHud, 80);

        // Apply persisted state to live modules immediately on mount.
        _applyRender(!!state.settings["render.enabled"]);
        _applyRenderVisualType(String(state.settings["render.visualType"] || "default"));
        _applyRenderReset(!!state.settings["render.resetRender"]);
        _applyTraps(!!state.settings["traps.enabled"]);
        _applyAutoBreak(!!state.settings["autobreak.enabled"]);
        _applyAutoPlace(!!state.settings["autoplace.enabled"]);
        _applyReplacer(!!state.settings["replacer.enabled"]);
        _applyPreplacer(!!state.settings["preplacer.enabled"]);
        _applyAutoBuy(!!state.settings["autobuy.enabled"]);
        _applyInstaKillEnabled(!!state.settings["instakill.enabled"]);
        _applyInstaKillIsTrue(!!state.settings["instakill.istrue"]);
        _applyInstaKillWait(!!state.settings["instakill.wait"]);
        _applyHealer(!!state.settings["healer.enabled"]);
        _applyMovement(!!state.settings["movement.enabled"]);
        _applyKbiRender(!!state.settings["kbi.render"]);
        _applyRenderAutoPush(!!state.settings["render.autoPush"]);
        _applyRenderSpikeCones(!!state.settings["render.spikeCones"]);
        _applyRenderTracerGhost(!!state.settings["render.tracerGhost"]);
        _applyDebug(!!state.settings["debug.enabled"]);

        // Start auto-refresh for debug info display.
        _refreshDebugInfo();
        state._debugInterval = root.setInterval(_refreshDebugInfo, 2000);

        if (Nozo.log) Nozo.log("html:mount", {});
        return true;
    }

    function _refreshDebugInfo() {
        const el = state._debugInfoEl;
        if (!el || !state.mounted || !state.visible) return;
        const s  = Nozo.state || {};
        const h  = (Nozo.healer && Nozo.healer.state) || {};
        const ts = (Nozo.tickScheduler && Nozo.tickScheduler.state) || {};
        const player     = s.player || {};
        const itemsCount = s.itemsData && Array.isArray(s.itemsData.list) ? s.itemsData.list.length : "-";
        const agesCount  = s.agesData  && Array.isArray(s.agesData.list)  ? s.agesData.list.length  : "-";
        const lastHeal   = h.lastHealAt ? ((Date.now() - h.lastHealAt) / 1000).toFixed(1) + "s ago" : "-";
        el.textContent = [
            "initData: " + (s.initDataParsed ? "ready" : "pending") + " | items:" + itemsCount + " ages:" + agesCount,
            "healer: "   + (h.enabled ? "on" : "off") + " | heals:" + (h.healCount || 0) + " shame:" + (player.shameCount || 0),
            "lastHeal: " + lastHeal,
            "sched: q=" + (ts.pendingCount || 0) + " run=" + (ts.totalExecuted || 0) + " last=" + (ts.lastExecutedTag || "-")
        ].join("\n");
    }

    function unmount() {
        if (!state.mounted) return;
        if (state._debugInterval) {
            root.clearInterval(state._debugInterval);
            state._debugInterval = null;
        }
        if (state._weaponHudInterval) {
            root.clearInterval(state._weaponHudInterval);
            state._weaponHudInterval = null;
        }
        state._debugInfoEl = null;
        const el = state.panel;
        if (el && el.parentNode) el.parentNode.removeChild(el);
        const wh = state.weaponHud;
        if (wh && wh.parentNode) wh.parentNode.removeChild(wh);
        state.weaponHud = null;
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
        _syncWeaponHudPosition();
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
