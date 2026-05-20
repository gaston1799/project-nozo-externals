/* Render overlay module for NozoNext. Draws debug overlays on a canvas element.
   No packet sends. All drawing is purely visual. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const state = {
        enabled: true,
        canvas: null,
        context: null,
        gameCanvas: null,
        gameContext: null,
        scale: 1,
        debugPath: null,
        attached: false,
        lastDrawTick: null,
        _flagCache: null,
        _flagCacheAt: 0
    };

    let _resizeListener = null;
    let _lastScaleCheck = 0;

    function _updateScale() {
        const now = Date.now();
        if (now - _lastScaleCheck < 3000) return;
        _lastScaleCheck = now;
        const dpr = (root.devicePixelRatio) || 1;
        // Prefer a known game camera scale global if available.
        const gameScale = (root.game && typeof root.game.scale === "number" && root.game.scale > 0)
            ? root.game.scale
            : (root.camera && typeof root.camera.scale === "number" && root.camera.scale > 0)
            ? root.camera.scale
            : 0;
        let newScale;
        if (gameScale > 0) {
            newScale = Math.max(0.1, Math.min(8, gameScale));
        } else {
            // Heuristic: moomoo.io shows ~1800 world units along the short axis at default zoom.
            const vMin = Math.min(root.innerWidth || 800, root.innerHeight || 600);
            newScale = Math.max(0.25, Math.min(4, (vMin / 1800) * dpr));
        }
        if (Math.abs(newScale - state.scale) > 0.01) {
            state.scale = newScale;
            if (Nozo.log) Nozo.log("render:scale:updated", {
                scale: newScale, dpr: dpr, source: gameScale > 0 ? "game.scale" : "viewport"
            });
        }
    }

    function setEnabled(flag) {
        state.enabled = !!flag;
        if (Nozo.log) Nozo.log("render:setEnabled", { enabled: state.enabled });
    }

    function _createOverlay() {
        const doc = root.document || null;
        if (!doc || !doc.createElement) return null;

        const gameCanvas = doc.getElementById("gameCanvas");
        const el = doc.createElement("canvas");
        el.id = "nozoRenderOverlay";
        el.style.cssText = "position:absolute;top:0;left:0;width:100vw;height:100vh;z-index:10;pointer-events:none;";
        el.width = root.innerWidth || 800;
        el.height = root.innerHeight || 600;

        if (gameCanvas && gameCanvas.parentNode) {
            gameCanvas.parentNode.insertBefore(el, gameCanvas);
        } else if (doc.body) {
            doc.body.appendChild(el);
        } else {
            return null;
        }

        _resizeListener = function onResize() {
            el.width = root.innerWidth || el.width;
            el.height = root.innerHeight || el.height;
        };
        root.addEventListener("resize", _resizeListener);

        return el;
    }

    function attach(canvas) {
        if (state.attached) detach();
        state.gameCanvas = canvas || (root.document && root.document.getElementById("gameCanvas")) || null;
        try {
            state.gameContext = state.gameCanvas && state.gameCanvas.getContext ? state.gameCanvas.getContext("2d") : null;
        } catch (e) {
            state.gameContext = null;
        }
        // Always draw on a dedicated overlay canvas.
        // Never bind directly to gameCanvas (clearing would wipe native world render).
        state.canvas = _createOverlay();

        if (!state.canvas) {
            if (Nozo.log) Nozo.log("render:attach:failed", { reason: "no-canvas" });
            return false;
        }

        try {
            state.context = state.canvas.getContext("2d");
        } catch (e) {
            state.context = null;
        }

        state.attached = !!state.context;
        if (Nozo.log) Nozo.log("render:attach", { attached: state.attached });
        return state.attached;
    }

    function detach() {
        if (_resizeListener) {
            try { root.removeEventListener("resize", _resizeListener); } catch (e) {}
            _resizeListener = null;
        }
        const el = state.canvas;
        if (el && el.parentNode && el.id === "nozoRenderOverlay") {
            el.parentNode.removeChild(el);
        }
        state.canvas = null;
        state.context = null;
        state.gameCanvas = null;
        state.gameContext = null;
        state.attached = false;
        if (Nozo.log) Nozo.log("render:detach", {});
    }

    function setDebugPath(points) {
        state.debugPath = Array.isArray(points) ? points.slice() : null;
    }

    function _px(entity, axis) {
        const v2 = entity[axis + "2"];
        const v = entity[axis];
        return typeof v2 === "number" && isFinite(v2) ? v2 : (typeof v === "number" ? v : null);
    }

    function _worldToScreen(wx, wy, playerX, playerY, canvasW, canvasH) {
        return {
            x: canvasW / 2 + (wx - playerX) * state.scale,
            y: canvasH / 2 + (wy - playerY) * state.scale
        };
    }

    function _drawAimArrow(ctx, cx, cy, angle) {
        const len = 55;
        const ex = cx + Math.cos(angle) * len;
        const ey = cy + Math.sin(angle) * len;
        const hLen = 9;
        const a1 = angle + Math.PI * 0.8;
        const a2 = angle - Math.PI * 0.8;

        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(255,210,0,0.9)";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a1) * hLen, ey + Math.sin(a1) * hLen);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a2) * hLen, ey + Math.sin(a2) * hLen);
        ctx.stroke();
        ctx.restore();
    }

    function _drawRangeRing(ctx, cx, cy, radius) {
        if (!radius || radius <= 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    function _drawTargetMarker(ctx, sx, sy, color, radius, label) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, radius || 10, 0, Math.PI * 2);
        ctx.strokeStyle = color || "rgba(255,80,0,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
        if (label) {
            ctx.font = "10px monospace";
            ctx.fillStyle = color || "rgba(255,80,0,0.9)";
            ctx.textBaseline = "middle";
            ctx.fillText(label, sx + (radius || 10) + 3, sy);
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
    }

    function _drawPath(ctx, points, px, py, cw, ch) {
        if (!points || points.length < 2) return;
        const first = _worldToScreen(points[0].x, points[0].y, px, py, cw, ch);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
            const pt = _worldToScreen(points[i].x, points[i].y, px, py, cw, ch);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = "rgba(0,255,120,0.75)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    function _drawKbiAnimations(ctx, px, py, cw, ch) {
        const kbi = Nozo.kbSimulator || null;
        if (!kbi || !Array.isArray(kbi.animations)) return;
        if (kbi.state && kbi.state.showRender === false) return;
        const now = Date.now();
        for (let i = kbi.animations.length - 1; i >= 0; i--) {
            const anim = kbi.animations[i];
            if (!anim) { kbi.animations.splice(i, 1); continue; }
            const max = typeof anim.maxDuration === "number" ? anim.maxDuration : 250;
            const createdAt = typeof anim.createdAt === "number" ? anim.createdAt : (now - ((anim.duration || max)));
            const age = now - createdAt;
            if (age >= max) { kbi.animations.splice(i, 1); continue; }
            const alpha = Math.max(0.1, 1 - (age / max));
            const path = Array.isArray(anim.path) ? anim.path : null;
            if (!path || path.length < 2) continue;

            const first = _worldToScreen(path[0].x, path[0].y, px, py, cw, ch);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(first.x, first.y);
            for (let p = 1; p < path.length; p++) {
                const pt = _worldToScreen(path[p].x, path[p].y, px, py, cw, ch);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.strokeStyle = "rgba(255,80,80," + alpha.toFixed(3) + ")";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    }

    function _getVisualType() {
        const cfg = Nozo.state && Nozo.state.renderConfig ? Nozo.state.renderConfig : null;
        return String((cfg && cfg.visualType) || "default");
    }

    function _getRenderConfig() {
        return (Nozo.state && Nozo.state.renderConfig) ? Nozo.state.renderConfig : { resetRender: true };
    }

    function getActiveStyle() {
        const vt = _getVisualType();
        const styles = {
            "default": { selfFill: "rgba(90,180,255,0.70)", selfStroke: "rgba(90,180,255,0.95)", enemyFill: "rgba(210,210,210,0.65)", enemyStroke: "rgba(255,255,255,0.60)", hand: "rgba(224,194,160,0.95)", selfAim: "rgba(0,255,170,0.95)", enemyAim: "rgba(255,220,120,0.85)" },
            "classic": { selfFill: "rgba(145,178,219,0.75)", selfStroke: "rgba(40,40,40,0.85)", enemyFill: "rgba(145,178,219,0.75)", enemyStroke: "rgba(40,40,40,0.85)", hand: "rgba(197,136,99,0.95)", selfAim: "rgba(255,255,255,0.95)", enemyAim: "rgba(255,255,255,0.9)" },
            "neo": { selfFill: "rgba(20,210,255,0.65)", selfStroke: "rgba(0,255,255,0.95)", enemyFill: "rgba(170,200,220,0.55)", enemyStroke: "rgba(180,240,255,0.85)", hand: "rgba(225,200,160,0.95)", selfAim: "rgba(0,255,170,0.95)", enemyAim: "rgba(160,230,255,0.85)" },
            "neon": { selfFill: "rgba(0,255,160,0.55)", selfStroke: "rgba(0,255,200,0.95)", enemyFill: "rgba(120,160,210,0.50)", enemyStroke: "rgba(130,190,255,0.85)", hand: "rgba(240,220,180,0.95)", selfAim: "rgba(0,255,120,1)", enemyAim: "rgba(255,70,180,0.9)" },
            "dark": { selfFill: "rgba(60,90,140,0.75)", selfStroke: "rgba(200,220,255,0.7)", enemyFill: "rgba(95,95,105,0.65)", enemyStroke: "rgba(180,180,190,0.55)", hand: "rgba(180,145,120,0.9)", selfAim: "rgba(120,230,255,0.95)", enemyAim: "rgba(230,210,160,0.85)" }
        };
        return styles[vt] || styles.default;
    }

    function _weaponMeta(obj) {
        const stateItems = Nozo.state && Nozo.state.itemsData && Array.isArray(Nozo.state.itemsData.raw)
            ? Nozo.state.itemsData.raw : null;
        const items = stateItems || (root.items && Array.isArray(root.items.weapons) ? root.items.weapons : null);
        const wi = obj && Number.isInteger(obj.weaponIndex) ? obj.weaponIndex : -1;
        const w = items && wi >= 0 ? items[wi] : null;
        return {
            weapon: w,
            aboveHand: !!(w && w.aboveHand),
            armS: (w && Number.isFinite(w.armS)) ? w.armS : 1,
            hndS: (w && Number.isFinite(w.hndS)) ? w.hndS : 1,
            hndD: (w && Number.isFinite(w.hndD)) ? w.hndD : 1
        };
    }

    function _skinColorFor(p, fallback) {
        const cfg = root.config || null;
        const colors = cfg && Array.isArray(cfg.skinColors) ? cfg.skinColors : null;
        if (!colors || p == null || p.skinColor == null) return fallback;
        return colors[p.skinColor] || fallback;
    }

    function _drawWeaponSimple(ctx, len, width, color) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.strokeStyle = color;
        ctx.stroke();
    }

    function _renderTail(ctx, scale, style) {
        const r = Math.max(5, scale * 0.42);
        const off = Math.max(8, scale * 1.05);
        ctx.save();
        ctx.translate(-off, 0);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = style.enemyFill;
        ctx.fill();
        ctx.lineWidth = Math.max(1, scale * 0.05);
        ctx.strokeStyle = style.enemyStroke;
        ctx.stroke();
        ctx.restore();
    }

    function _renderSkin(ctx, scale) {
        const r = Math.max(5, scale * 0.35);
        ctx.save();
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = Math.max(1, scale * 0.04);
        ctx.stroke();
        ctx.restore();
    }

    function _renderTool(ctx, weaponIndex, scale, style, isSelf) {
        const len = Math.max(14, scale * (weaponIndex === 10 ? 1.9 : 1.45));
        const width = Math.max(2.25, scale * 0.15);
        _drawWeaponSimple(ctx, len, width, isSelf ? style.selfAim : style.enemyAim);
        ctx.beginPath();
        ctx.arc(len, 0, Math.max(2, width * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = isSelf ? style.selfAim : style.enemyAim;
        ctx.fill();
    }

    function _renderProjectile(ctx, scale, style) {
        const r = Math.max(2.5, scale * 0.25 * state.scale);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = style.enemyAim;
        ctx.fill();
    }

    function _renderAI(ctx, scale) {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(6, scale), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(180,120,60,0.40)";
        ctx.fill();
        ctx.strokeStyle = "rgba(210,160,80,0.80)";
        ctx.lineWidth = Math.max(1.2, scale * 0.06);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.max(6, scale), 0);
        ctx.strokeStyle = "rgba(255,180,60,0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function _renderDeadPlayer(ctx, scale) {
        ctx.beginPath();
        ctx.arc(0, 0, scale, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100,100,100,0.40)";
        ctx.fill();
        ctx.strokeStyle = "rgba(140,140,140,0.60)";
        ctx.lineWidth = Math.max(1.2, scale * 0.06);
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = Math.max(8, Math.round(scale * 0.38)) + "px monospace";
        ctx.fillStyle = "rgba(180,180,180,0.75)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("(EZ)", 0, 0);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
    }

    function _renderOnePlayer(ctx, localPx, localPy, cw, ch, p, layer, style) {
        if (!p || p.visible === false || p.active === false) return;
        const x = _px(p, "x");
        const y = _px(p, "y");
        if (x === null || y === null) return;

        const sp = _worldToScreen(x, y, localPx, localPy, cw, ch);
        const dir = (typeof p.dir === "number" && isFinite(p.dir)) ? p.dir : 0;
        const scale = Math.max(16, Number(p.scale || 35) * state.scale);
        const isSelf = Nozo.state && Nozo.state.player && p.sid != null && Nozo.state.player.sid === p.sid;

        const wm = _weaponMeta(p);
        const handAngle = (Math.PI / 4) * wm.armS;
        const oHandAngle = (p.buildIndex < 0) ? wm.hndS : 1;
        const oHandDist = (p.buildIndex < 0) ? wm.hndD : 1;
        const skinFill = _skinColorFor(p, style.hand);

        // layer 0: legacy order (tail -> weapon below -> hands -> weapon above -> body -> skin hook)
        if (layer === 0) {
            if (p.tailIndex > 0) {
                if (Nozo.compat && typeof Nozo.compat.renderTail === "function") {
                    try { Nozo.compat.renderTail(p, ctx, state.scale); } catch (e) { _renderTail(ctx, scale, style); }
                } else {
                    _renderTail(ctx, scale, style);
                }
            }

            if (p.buildIndex < 0 && !wm.aboveHand && wm.weapon) {
                ctx.save();
                ctx.translate(sp.x, sp.y);
                ctx.rotate(dir);
                _renderTool(ctx, p.weaponIndex, scale, style, isSelf);
                ctx.restore();
            }

            const handR = Math.max(4, 14 * state.scale);
            ctx.beginPath();
            ctx.arc(sp.x + Math.cos(dir + handAngle) * scale, sp.y + Math.sin(dir + handAngle) * scale, handR, 0, Math.PI * 2);
            ctx.arc(
                sp.x + Math.cos(dir - handAngle * oHandAngle) * (scale * oHandDist),
                sp.y + Math.sin(dir - handAngle * oHandAngle) * (scale * oHandDist),
                handR, 0, Math.PI * 2
            );
            ctx.fillStyle = skinFill;
            ctx.fill();
            ctx.lineWidth = Math.max(1.25, scale * 0.08);
            ctx.strokeStyle = isSelf ? style.selfStroke : style.enemyStroke;
            ctx.stroke();

            if (p.buildIndex < 0 && wm.aboveHand && wm.weapon) {
                ctx.save();
                ctx.translate(sp.x, sp.y);
                ctx.rotate(dir);
                _renderTool(ctx, p.weaponIndex, scale, style, isSelf);
                ctx.restore();
            }

            ctx.beginPath();
            ctx.arc(sp.x, sp.y, scale, 0, Math.PI * 2);
            ctx.fillStyle = isSelf ? style.selfFill : style.enemyFill;
            ctx.fill();
            ctx.lineWidth = Math.max(1.25, scale * 0.08);
            ctx.strokeStyle = isSelf ? style.selfStroke : style.enemyStroke;
            ctx.stroke();

            if (p.skinIndex > 0) {
                if (Nozo.compat && typeof Nozo.compat.renderSkin === "function") {
                    try {
                        ctx.save();
                        ctx.translate(sp.x, sp.y);
                        ctx.rotate(Math.PI / 2);
                        Nozo.compat.renderSkin(p, ctx, state.scale);
                        ctx.restore();
                    } catch (e) {
                        ctx.save();
                        ctx.translate(sp.x, sp.y);
                        _renderSkin(ctx, scale);
                        ctx.restore();
                    }
                } else {
                    ctx.save();
                    ctx.translate(sp.x, sp.y);
                    _renderSkin(ctx, scale);
                    ctx.restore();
                }
            }

            // BUILD ITEM: when buildIndex >= 0 the player holds a placed item.
            // Draw a small indicator circle at arm's reach in the facing direction.
            if (p.buildIndex >= 0) {
                ctx.save();
                ctx.translate(sp.x, sp.y);
                ctx.rotate(dir);
                const bLen = Math.max(14, scale * 0.85);
                const bR = Math.max(4, scale * 0.22);
                ctx.beginPath();
                ctx.arc(bLen, 0, bR, 0, Math.PI * 2);
                ctx.fillStyle = isSelf ? "rgba(100,220,100,0.80)" : "rgba(200,200,200,0.55)";
                ctx.fill();
                ctx.strokeStyle = isSelf ? "rgba(60,200,60,0.90)" : "rgba(150,150,150,0.70)";
                ctx.lineWidth = Math.max(1, scale * 0.06);
                ctx.stroke();
                ctx.restore();
            }
        }

        // layer 1: facing/weapon indicator + sid label
        if (layer === 1) {
            const reach = scale * 1.5;
            const tipX = sp.x + Math.cos(dir) * reach;
            const tipY = sp.y + Math.sin(dir) * reach;

            ctx.beginPath();
            ctx.moveTo(sp.x, sp.y);
            ctx.lineTo(tipX, tipY);
            ctx.lineWidth = Math.max(2, scale * 0.16);
            ctx.strokeStyle = isSelf ? style.selfAim : style.enemyAim;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(tipX, tipY, Math.max(2.5, scale * 0.12), 0, Math.PI * 2);
            ctx.fillStyle = isSelf ? style.selfAim : style.enemyAim;
            ctx.fill();

            if (!isSelf && p.sid != null) {
                ctx.font = "10px monospace";
                ctx.fillStyle = "rgba(255,255,255,0.9)";
                ctx.textAlign = "center";
                ctx.fillText(String(p.sid), sp.x, sp.y - scale - 8);
                ctx.textAlign = "start";
            }
        }
    }

    function _renderPlayers(ctx, localPx, localPy, cw, ch) {
        const players = Nozo.state && Array.isArray(Nozo.state.players) ? Nozo.state.players : null;
        if (!players || players.length === 0) return;
        const style = getActiveStyle();
        for (let layer = 0; layer <= 1; layer++) {
            for (let i = 0; i < players.length; i++) {
                _renderOnePlayer(ctx, localPx, localPy, cw, ch, players[i], layer, style);
            }
        }
    }

    function _drawHudText(ctx, lines, cw, ch) {
        if (!lines || !lines.length) return;
        ctx.save();
        ctx.font = "11px monospace";
        ctx.textBaseline = "alphabetic";
        const lineH = 14;
        const startY = ch - lines.length * lineH - 8;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillText(lines[i], 9, startY + i * lineH + 1);
            ctx.fillStyle = "rgba(160,255,160,0.9)";
            ctx.fillText(lines[i], 8, startY + i * lineH);
        }
        ctx.restore();
    }

    function _readLegacyRenderFlags() {
        const now = Date.now();
        if (state._flagCache && (now - state._flagCacheAt) < 500) return state._flagCache;

        let showAutoPushRender = true;
        let showTracerGhost = true;
        let showSpikeCones = false;
        try {
            const ls = root.localStorage;
            if (ls) {
                showAutoPushRender = (ls.getItem("showAutoPushRender") ?? "1") === "1";
                showTracerGhost = (ls.getItem("showTracerGhost") ?? "1") === "1";
                showSpikeCones = (ls.getItem("showSpikeCones") ?? "0") === "1";
            }
        } catch (e) {}
        state._flagCache = {
            showAutoPushRender: showAutoPushRender,
            showTracerGhost: showTracerGhost,
            showSpikeCones: showSpikeCones
        };
        state._flagCacheAt = now;
        return state._flagCache;
    }

    function _getThingState() {
        // Prefer root._things (moomoo.js's own _things object, exposed at unsafeWindow._things).
        // Nozo.globals is the Nozo-state-backed alias; fall through to it only when _things absent.
        return root._things || Nozo.globals || {};
    }

    function _renderPushOverlay(ctx, px, py, cw, ch) {
        const th = _getThingState();
        const flags = _readLegacyRenderFlags();
        if (!flags.showAutoPushRender || th.showAutoPushRender === false) return;
        const V = th.pushVis_;
        if (!V || !V.enemy || !V.player || !V.ring) return;

        const enemy = _worldToScreen(V.enemy.x, V.enemy.y, px, py, cw, ch);
        const player = _worldToScreen(V.player.x, V.player.y, px, py, cw, ch);
        const spike = _worldToScreen(V.spike.x, V.spike.y, px, py, cw, ch);
        const target = _worldToScreen(V.target.x, V.target.y, px, py, cw, ch);
        const ringR = (V.ring.r || 0) * state.scale;
        if (!isFinite(ringR) || ringR <= 0) return;

        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, ringR, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255,80,80,0.6)";
        ctx.stroke();

        const chain = th.autoPushChain || null;
        const liveAngBehind = (chain && typeof chain.angBehind === "number") ? chain.angBehind : V.angBehind;
        if (typeof liveAngBehind === "number" && isFinite(liveAngBehind)) {
            const half = 80 * Math.PI / 180;
            const arcR = ringR;
            const steps = 7;
            const raycast = Nozo.Utils && typeof Nozo.Utils.raycast === "function" ? Nozo.Utils.raycast : null;

            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, arcR, liveAngBehind - half, liveAngBehind + half);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(0,255,80,0.5)";
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(enemy.x + Math.cos(liveAngBehind) * (arcR - 6), enemy.y + Math.sin(liveAngBehind) * (arcR - 6));
            ctx.lineTo(enemy.x + Math.cos(liveAngBehind) * (arcR + 6), enemy.y + Math.sin(liveAngBehind) * (arcR + 6));
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(0,255,80,1)";
            ctx.stroke();

            for (let i = 0; i <= steps; i++) {
                const a = liveAngBehind - half + (i / steps) * (half * 2);
                const ptx = V.enemy.x + Math.cos(a) * V.ring.r;
                const pty = V.enemy.y + Math.sin(a) * V.ring.r;
                const hit = raycast ? raycast({ x: V.player.x, y: V.player.y }, { x: ptx, y: pty }, { includeTraps: false }) : false;
                const sp = _worldToScreen(ptx, pty, px, py, cw, ch);
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = hit ? "rgba(255,60,60,0.9)" : "rgba(0,255,80,0.9)";
                ctx.fill();
            }
        }

        ctx.fillStyle = "rgba(255,80,80,0.9)";
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(0,200,255,0.9)";
        ctx.beginPath(); ctx.arc(player.x, player.y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,170,0,0.9)";
        ctx.beginPath(); ctx.arc(spike.x, spike.y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(0,255,140,0.9)";
        ctx.beginPath(); ctx.arc(target.x, target.y, 3.5, 0, Math.PI * 2); ctx.fill();

        const pRad = (V.player.r || 35) * state.scale;
        const L = 90;
        const mx = player.x + L * Math.cos(V.moveAngle || 0);
        const my = player.y + L * Math.sin(V.moveAngle || 0);
        ctx.beginPath();
        ctx.arc(player.x, player.y, pRad, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(0,200,255,0.5)";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(mx, my);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,255,120,1)";
        ctx.stroke();

        const ang = V.moveAngle || 0;
        const A = 10;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - A * Math.cos(ang + 0.45), my - A * Math.sin(ang + 0.45));
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - A * Math.cos(ang - 0.45), my - A * Math.sin(ang - 0.45));
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,255,120,1)";
        ctx.stroke();

        ctx.font = "bold 12px monospace";
        ctx.fillStyle = "rgba(0,255,120,1)";
        const angleDeg = ((((V.moveAngle || 0) * 180 / Math.PI) % 360) + 360).toFixed(1);
        ctx.fillText("dir=" + angleDeg + "°", player.x + 10, player.y - 22);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText("bucket=" + (V.bucket == null ? "-" : V.bucket), player.x + 10, player.y - 10);
        ctx.fillStyle = "rgba(255,200,0,0.9)";
        ctx.fillText("orbitR=" + Number(V.ring.r || 0).toFixed(1), player.x + 10, player.y + 2);
    }

    function _renderSpikeCones(ctx, px, py, cw, ch) {
        const th = _getThingState();
        const flags = _readLegacyRenderFlags();
        if (!flags.showSpikeCones && !th.showSpikeCones) return;
        const data = th.spikeCones;
        if (!data || !Array.isArray(data.spikes)) return;

        const c = _worldToScreen(data.cx, data.cy, px, py, cw, ch);
        const enemyRange = Math.max(0, (data.enemyRange || 0) * state.scale);
        const outerRadius = Math.max(0, (data.outerRadius || 0) * state.scale);
        if (enemyRange <= 0 || outerRadius <= 0) return;

        ctx.beginPath();
        ctx.arc(c.x, c.y, enemyRange, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(c.x, c.y, outerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,0,76,0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = 0; i < data.spikes.length; i++) {
            const s = data.spikes[i];
            if (!s) continue;
            const startAngle = s.angle - s.halfAngle;
            const endAngle = s.angle + s.halfAngle;
            const rEnd = Math.min((s.radialEnd || data.outerRadius) * state.scale, outerRadius);

            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.arc(c.x, c.y, rEnd, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = s.threat ? "rgba(255,0,76,0.18)" : (!s.baseThreat ? "rgba(255,165,0,0.08)" : "rgba(128,128,128,0.12)");
            ctx.fill();

            ctx.beginPath();
            ctx.arc(c.x, c.y, rEnd, startAngle, endAngle);
            ctx.strokeStyle = s.threat ? "rgba(255,0,76,0.7)" : (!s.baseThreat ? "rgba(255,165,0,0.6)" : "rgba(120,120,120,0.6)");
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x + Math.cos(s.angle) * rEnd, c.y + Math.sin(s.angle) * rEnd);
            ctx.strokeStyle = s.threat ? "rgba(255,0,76,0.9)" : (!s.baseThreat ? "rgba(255,165,0,0.75)" : "rgba(120,120,120,0.9)");
            ctx.lineWidth = 1.5;
            ctx.setLineDash(s.threat || !s.baseThreat ? [] : [4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function _renderNextTickGhost(ctx, px, py, cw, ch) {
        const th = _getThingState();
        const flags = _readLegacyRenderFlags();
        if (!flags.showTracerGhost && !th.showTracerGhost) return;
        const player = (Nozo.state && Nozo.state.player) || null;
        if (!player) return;

        const x = _px(player, "x");
        const y = _px(player, "y");
        if (x === null || y === null) return;

        const tickMs = (root.config && root.config.serverUpdateRate && 1000 / root.config.serverUpdateRate) || 111.111;
        const maxSpeed = (typeof player.maxSpeed === "number" && player.maxSpeed > 0) ? player.maxSpeed : 8;
        const cap = maxSpeed / 1000;
        const vxRaw = typeof player._vx === "number" ? player._vx : 0;
        const vyRaw = typeof player._vy === "number" ? player._vy : 0;
        const vx = Math.abs(vxRaw) > cap ? Math.sign(vxRaw) * cap : vxRaw;
        const vy = Math.abs(vyRaw) > cap ? Math.sign(vyRaw) * cap : vyRaw;
        const nx = x + vx * tickMs;
        const ny = y + vy * tickMs;
        const nsp = _worldToScreen(nx, ny, px, py, cw, ch);

        let dangerObj = null;
        const objs = (Nozo.state && (Nozo.state.liztobj || Nozo.state.gameObjects)) || [];
        if (Array.isArray(objs) && objs.length) {
            const pr = player.scale || 35;
            for (let i = 0; i < objs.length; i++) {
                const o = objs[i];
                if (!o || !o.active || !o.dmg) continue;
                const ox = _px(o, "x");
                const oy = _px(o, "y");
                if (ox === null || oy === null) continue;
                const d = Math.hypot(nx - ox, ny - oy);
                if (d <= (pr + (o.scale || 18))) {
                    dangerObj = o;
                    break;
                }
            }
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(nsp.x, nsp.y, Math.max(6, (player.scale || 35) * 0.35 * state.scale), 0, Math.PI * 2);
        ctx.fillStyle = dangerObj ? "rgba(255,0,76,0.75)" : "rgba(0,200,255,0.6)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = dangerObj ? "rgba(255,0,76,1)" : "rgba(0,0,0,0.35)";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(nsp.x, nsp.y);
        ctx.lineTo(nsp.x + vx * 18 * state.scale, nsp.y + vy * 18 * state.scale);
        ctx.strokeStyle = dangerObj ? "rgba(255,0,76,1)" : "rgba(0,200,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();

        if (dangerObj) {
            const dx = _px(dangerObj, "x");
            const dy = _px(dangerObj, "y");
            if (dx !== null && dy !== null) {
                const dsp = _worldToScreen(dx, dy, px, py, cw, ch);
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.arc(dsp.x, dsp.y, (dangerObj.scale || 18) * state.scale, 0, Math.PI * 2);
                ctx.strokeStyle = "#ff0000";
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        ctx.restore();
    }

    function _renderDeadPlayers(ctx, px, py, cw, ch) {
        const s = Nozo.state;
        if (!s || !Array.isArray(s.players)) return;
        const style = getActiveStyle();
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (!p || p.alive !== false) continue;
            const x = _px(p, "x");
            const y = _px(p, "y");
            if (x === null || y === null) continue;
            const sp = _worldToScreen(x, y, px, py, cw, ch);
            const scale = Math.max(12, Number(p.scale || 35) * state.scale);

            ctx.save();
            ctx.translate(sp.x, sp.y);
            _renderDeadPlayer(ctx, scale);
            ctx.restore();
        }
    }

    function _renderAIs(ctx, px, py, cw, ch) {
        const s = Nozo.state;
        if (!s || !Array.isArray(s.ais) || !s.ais.length) return;
        for (let i = 0; i < s.ais.length; i++) {
            const ai = s.ais[i];
            if (!ai || ai.visible === false || ai.active === false) continue;
            const x = _px(ai, "x");
            const y = _px(ai, "y");
            if (x === null || y === null) continue;
            const sp = _worldToScreen(x, y, px, py, cw, ch);
            const sc = Math.max(6, (ai.scale || 35) * state.scale);
            const dir = (typeof ai.dir === "number" && isFinite(ai.dir)) ? ai.dir : 0;

            ctx.save();
            ctx.translate(sp.x, sp.y);
            ctx.rotate(dir);
            _renderAI(ctx, sc);
            ctx.restore();
        }
    }

    function _renderProjectiles(ctx, px, py, cw, ch) {
        const s = Nozo.state;
        if (!s || !s.projectiles || typeof s.projectiles !== "object") return;
        const keys = Object.keys(s.projectiles);
        if (!keys.length) return;
        const now = Date.now();
        for (let i = 0; i < keys.length; i++) {
            const p = s.projectiles[keys[i]];
            if (!p) continue;
            const age = now - (typeof p.t === "number" ? p.t : now);
            if (age > 3000) continue;
            const x = typeof p.x === "number" ? p.x : null;
            const y = typeof p.y === "number" ? p.y : null;
            if (x === null || y === null) continue;
            const sp = _worldToScreen(x, y, px, py, cw, ch);
            const alpha = Math.max(0.2, 1 - age / 3000);
            ctx.save();
            ctx.translate(sp.x, sp.y);
            if (typeof p.dir === "number" && isFinite(p.dir)) ctx.rotate(p.dir);
            ctx.globalAlpha = alpha;
            _renderProjectile(ctx, p.scale || 9, getActiveStyle());
            ctx.restore();
        }
    }

    function draw(gameCtx) {
        if (!state.enabled) return;
        if (!state.attached || !state.context || !state.canvas) return;
        _updateScale();

        const ctx = state.context;
        const canvas = state.canvas;
        const cw = canvas.width;
        const ch = canvas.height;

        try {
            const config = _getRenderConfig();
            if (config.resetRender !== false) {
                ctx.clearRect(0, 0, cw, ch);
                ctx.beginPath();
            }

            const nCtx = gameCtx || {};
            const player = nCtx.player || (Nozo.state && Nozo.state.player) || null;
            if (!player) return;

            const px = _px(player, "x");
            const py = _px(player, "y");
            if (px === null || py === null) return;

            // World/player/object rendering on actual gameCanvas path (not overlay).
            const gctx = state.gameContext;
            const gc = state.gameCanvas;
            if (gctx && gc) {
                const gw = gc.width || cw;
                const gh = gc.height || ch;
                _renderPlayers(gctx, px, py, gw, gh);
                _renderDeadPlayers(gctx, px, py, gw, gh);
                _renderAIs(gctx, px, py, gw, gh);
                _renderProjectiles(gctx, px, py, gw, gh);
            }

            const cx = cw / 2;
            const cy = ch / 2;

            // Aim direction arrow + attack range ring
            const combatState = (Nozo.state && Nozo.state.combat) || {};
            let aimAngle = typeof combatState.aimAngle === "number" && isFinite(combatState.aimAngle)
                ? combatState.aimAngle
                : (typeof player.dir === "number" && isFinite(player.dir) ? player.dir : null);
            if (aimAngle !== null) {
                _drawAimArrow(ctx, cx, cy, aimAngle);
            }
            const weaponRange = (typeof combatState.weaponRange === "number" && combatState.weaponRange > 0)
                ? combatState.weaponRange * state.scale
                : 35 * state.scale;
            _drawRangeRing(ctx, cx, cy, weaponRange);

            // Traps target marker
            const trapsState = nCtx.traps || (Nozo.state && Nozo.state.traps) || {};
            if (trapsState.target) {
                const t = trapsState.target;
                const tx = _px(t, "x");
                const ty = _px(t, "y");
                if (tx !== null && ty !== null) {
                    const sp = _worldToScreen(tx, ty, px, py, cw, ch);
                    _drawTargetMarker(ctx, sp.x, sp.y, "rgba(255,80,0,0.9)", 10, "trap");
                }
            }

            // AutoBreak target marker
            const abState = nCtx.autoBreak || (Nozo.state && Nozo.state.autoBreak) || {};
            if (abState.target) {
                const t = abState.target;
                const tx = _px(t, "x");
                const ty = _px(t, "y");
                if (tx !== null && ty !== null) {
                    const sp = _worldToScreen(tx, ty, px, py, cw, ch);
                    _drawTargetMarker(ctx, sp.x, sp.y, "rgba(0,180,255,0.9)", 12, "break");
                }
            }

            // Movement/trap path trace
            const movePath = state.debugPath
                || (Nozo.state && Nozo.state.movement && Array.isArray(Nozo.state.movement.path)
                    ? Nozo.state.movement.path : null);
            if (movePath && movePath.length > 1) {
                _drawPath(ctx, movePath, px, py, cw, ch);
            }

            _drawKbiAnimations(ctx, px, py, cw, ch);
            _renderPushOverlay(ctx, px, py, cw, ch);
            _renderSpikeCones(ctx, px, py, cw, ch);
            _renderNextTickGhost(ctx, px, py, cw, ch);

            // HUD debug text (bottom-left)
            const hudLines = [];
            hudLines.push("tick:" + ((Nozo.state && Nozo.state.tick) || 0));
            if (combatState.aimSource) hudLines.push("aim:" + combatState.aimSource);
            if (combatState.lastSwingAt != null) {
                const baseReload = (Nozo.constants && Nozo.constants.RELOAD_TICK) || 400;
                const elapsed = Date.now() - combatState.lastSwingAt;
                const remaining = Math.max(0, baseReload - elapsed);
                if (remaining > 0) hudLines.push("reload:" + remaining.toFixed(0) + "ms");
            } else if (combatState.reloadGate != null) {
                const rg = typeof combatState.reloadGate === "number"
                    ? combatState.reloadGate.toFixed(0)
                    : combatState.reloadGate;
                hudLines.push("reload:" + rg);
            }
            _drawHudText(ctx, hudLines, cw, ch);

            state.lastDrawTick = (Nozo.state && Nozo.state.tick) || 0;
        } catch (e) {
            if (Nozo.log) Nozo.log("render:draw:error", { message: e && e.message ? e.message : String(e) });
        }
    }

    function getDebugState() {
        return {
            enabled: state.enabled,
            attached: state.attached,
            hasCanvas: !!state.canvas,
            scale: state.scale,
            debugPathLen: state.debugPath ? state.debugPath.length : 0,
            lastDrawTick: state.lastDrawTick
        };
    }

    const render = {
        state: state,
        setEnabled: setEnabled,
        attach: attach,
        detach: detach,
        draw: draw,
        setDebugPath: setDebugPath,
        getDebugState: getDebugState,
        getActiveStyle: getActiveStyle
    };

    Nozo.render = render;
    Nozo.state = Nozo.state || {};
    Nozo.state.render = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.render = render;
})();
