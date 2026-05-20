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
        return {
            showAutoPushRender: showAutoPushRender,
            showTracerGhost: showTracerGhost,
            showSpikeCones: showSpikeCones
        };
    }

    function _getThingState() {
        return Nozo.globals || root._things || {};
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

    function draw(gameCtx) {
        if (!state.enabled) return;
        if (!state.attached || !state.context || !state.canvas) return;
        _updateScale();

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
        getDebugState: getDebugState
    };

    Nozo.render = render;
    Nozo.state = Nozo.state || {};
    Nozo.state.render = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.render = render;
})();
