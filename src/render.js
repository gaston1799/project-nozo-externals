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
        scale: 1,
        debugPath: null,
        attached: false,
        lastDrawTick: null
    };

    let _resizeListener = null;

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

        if (canvas && typeof canvas.getContext === "function") {
            state.canvas = canvas;
        } else {
            state.canvas = _createOverlay();
        }

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

    function draw(gameCtx) {
        if (!state.enabled) return;
        if (!state.attached || !state.context || !state.canvas) return;

        const ctx = state.context;
        const canvas = state.canvas;
        const cw = canvas.width;
        const ch = canvas.height;

        try {
            ctx.clearRect(0, 0, cw, ch);

            const nCtx = gameCtx || {};
            const player = nCtx.player || (Nozo.state && Nozo.state.player) || null;
            if (!player) return;

            const px = _px(player, "x");
            const py = _px(player, "y");
            if (px === null || py === null) return;

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

            // HUD debug text (bottom-left)
            const hudLines = [];
            hudLines.push("tick:" + ((Nozo.state && Nozo.state.tick) || 0));
            if (combatState.aimSource) hudLines.push("aim:" + combatState.aimSource);
            if (combatState.reloadGate != null) {
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
        getDebugState: getDebugState
    };

    Nozo.render = render;
    Nozo.state = Nozo.state || {};
    Nozo.state.render = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.render = render;
})();
