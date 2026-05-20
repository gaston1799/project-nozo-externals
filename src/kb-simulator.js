/* Knockback simulator for NozoNext.
   Ported interface: kbSimulator.spikeKB(), kbSimulator.meleeKB(), kbSimulator.animations. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const state = {
        animations: [],
        showRender: true
    };

    function _utils() {
        if (Nozo.Utils && typeof Nozo.Utils === "function") {
            if (!state._u) state._u = new Nozo.Utils();
            return state._u;
        }
        return null;
    }

    function _dist(a, b) {
        const u = _utils();
        if (u && typeof u.getDistance === "function") return u.getDistance(a.x, a.y, b.x, b.y);
        const dx = (b.x - a.x);
        const dy = (b.y - a.y);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function _dir(a, b) {
        const u = _utils();
        if (u && typeof u.getDirection === "function") return u.getDirection(a, b);
        return Math.atan2((b.y - a.y), (b.x - a.x));
    }

    function _closeObjects() {
        if (Nozo.state && Array.isArray(Nozo.state.liztobj)) return Nozo.state.liztobj;
        if (Nozo.state && Array.isArray(Nozo.state.closeObjects)) return Nozo.state.closeObjects;
        return [];
    }

    function _players() {
        return (Nozo.state && Array.isArray(Nozo.state.players)) ? Nozo.state.players : [];
    }

    function _tickSpeed() {
        if (Nozo.state && Nozo.state.game && typeof Nozo.state.game.tickSpeed === "number") return Nozo.state.game.tickSpeed;
        return 1;
    }

    function _decel() {
        if (root.config && typeof root.config.playerDecel === "number") return root.config.playerDecel;
        return 0.993;
    }

    function _objScale(o) {
        if (!o) return 0;
        if (Nozo.objectModel && typeof Nozo.objectModel.getScale === "function") return Nozo.objectModel.getScale(o);
        if (typeof o.getScale === "function") return o.getScale() || o.scale || 0;
        return o.scale || 0;
    }

    function addAnimation(tmpObj, posObj) {
        if (!tmpObj || !posObj) return;
        state.animations.push({
            dir: tmpObj.dir || 0,
            dirPlus: tmpObj.dirPlus || 0,
            skinIndex: tmpObj.skinIndex || 0,
            pos: {
                new: { x: posObj.x, y: posObj.y },
                old: { x: tmpObj.x2 || tmpObj.x || 0, y: tmpObj.y2 || tmpObj.y || 0 }
            },
            path: Array.isArray(posObj._kbPath) ? posObj._kbPath.slice() : [
                { x: tmpObj.x2 || tmpObj.x || 0, y: tmpObj.y2 || tmpObj.y || 0 },
                { x: posObj.x, y: posObj.y }
            ],
            duration: 250,
            maxDuration: 250,
            createdAt: Date.now()
        });
        if (state.animations.length > 64) state.animations.shift();
    }

    // Signature-compatible port of legacy kbSimulator.spikeKB(e, t, skipAnim)
    function spikeKB(e, t, skipAnim) {
        const mover = e || { x: 0, y: 0, scale: 35 };
        const hitObj = t || { x: 0, y: 0, scale: 0 };
        if (!mover.vel || typeof mover.vel !== "object") mover.vel = { x: 0, y: 0 };
        const vel = mover.vel;
        const events = [];
        const path = [{ x: mover.x, y: mover.y }];
        const tickSpeed = _tickSpeed();
        let firstPass = true;
        let loops = 0;

        function addPath() {
            const last = path[path.length - 1];
            if (!last || _dist(last, mover) >= 4) path.push({ x: mover.x, y: mover.y });
        }

        while (((vel.x !== 0 || vel.y !== 0) || firstPass) && isFinite(vel.x) && isFinite(vel.y)) {
            const stepMag = _dist({ x: 0, y: 0 }, { x: vel.x * tickSpeed, y: vel.y * tickSpeed });
            const subSteps = Math.min(4, Math.max(1, Math.round(stepMag / 40)));
            const frac = 1 / subSteps;

            for (let p = 0; p < subSteps; p++) {
                if (vel.x) mover.x += vel.x * tickSpeed * frac;
                if (vel.y) mover.y += vel.y * tickSpeed * frac;
                addPath();

                const colliders = _closeObjects().filter(function (o) {
                    if (!o || !o.active) return false;
                    const collidable = (o.teleport || o.trap || !o.ignoreCollision || o.type === 1);
                    if (!collidable) return false;
                    return _dist(mover, o) <= 35 + _objScale(o);
                });

                for (let i = 0; i < colliders.length; i++) {
                    const o = colliders[i];
                    const radius = _objScale(o) + 35;
                    const n = _dir(mover, o);
                    mover.x = o.x + radius * Math.cos(n);
                    mover.y = o.y + radius * Math.sin(n);
                    addPath();
                    vel.x *= 0.75;
                    vel.y *= 0.75;

                    if (o.trap) {
                        vel.x = 0;
                        vel.y = 0;
                        events.push({ id: "trap", x: o.x, y: o.y, owner: o.ownerSid || null });
                    } else if (o.dmg || (o.type === 1 && o.y >= 12000)) {
                        vel.x += Math.cos(n) * 1.5;
                        vel.y += Math.sin(n) * 1.5;
                        events.push({ id: "spiek", dmg: o.dmg || 35 });
                    } else if (o.teleport) {
                        vel.x = 0;
                        vel.y = 0;
                        events.push({ id: "tp" });
                    }
                }

                if (_dist(hitObj, mover) <= 35 + (hitObj.scale || 0)) {
                    const r = (hitObj.scale || 0) + 35;
                    const n2 = _dir(mover, hitObj);
                    mover.x = hitObj.x + r * Math.cos(n2);
                    mover.y = hitObj.y + r * Math.sin(n2);
                    addPath();
                    vel.x *= 0.75;
                    vel.y *= 0.75;
                    vel.x += Math.cos(n2) * 1.5;
                    vel.y += Math.sin(n2) * 1.5;
                    if (!firstPass) events.push({ id: "spiek", dmg: hitObj.dmg || 0 });
                    firstPass = false;
                }

                const pushPlayers = _players().filter(function (pl) {
                    return pl && pl.visible && _dist(pl, mover) <= 70;
                });
                for (let j = 0; j < pushPlayers.length; j++) {
                    const pl = pushPlayers[j];
                    let overlap = _dist(pl, mover) - 70;
                    const n3 = _dir(mover, pl);
                    overlap = overlap * -1 / 2;
                    mover.x += overlap * Math.cos(n3);
                    mover.y += overlap * Math.sin(n3);
                    addPath();
                }
            }

            if (vel.x) {
                vel.x *= Math.pow(_decel(), tickSpeed);
                if (vel.x <= 0.01 && vel.x >= -0.01) vel.x = 0;
            }
            if (vel.y) {
                vel.y *= Math.pow(_decel(), tickSpeed);
                if (vel.y <= 0.01 && vel.y >= -0.01) vel.y = 0;
            }

            firstPass = false;
            loops++;
            if (loops > 30) break;
        }

        mover._kbPath = path;
        if (!skipAnim && mover.tmpObj) addAnimation(mover.tmpObj, mover);

        return {
            vel: vel,
            pos: mover,
            data: events,
            callback: function callback() {
                if (mover.tmpObj) addAnimation(mover.tmpObj, mover);
            }
        };
    }

    function meleeKB(target, angle, weaponIndex, seq) {
        const wi = typeof weaponIndex === "number" ? weaponIndex : 0;
        const knock = (Nozo.state && Nozo.state.itemsData && Array.isArray(Nozo.state.itemsData.list) && Nozo.state.itemsData.list[wi] && Nozo.state.itemsData.list[wi].knock)
            || 0;
        let n = (knock || 0) + 0.3;
        n *= _tickSpeed();
        if (Array.isArray(seq)) {
            const out = { x: target.x2 || target.x || 0, y: target.y2 || target.y || 0 };
            for (let i = 0; i < seq.length; i++) {
                const m = seq[i] * _tickSpeed();
                out.x += Math.cos(angle) * m;
                out.y += Math.sin(angle) * m;
            }
            return out;
        }
        return {
            x: (target.x2 || target.x || 0) + Math.cos(angle) * n,
            y: (target.y2 || target.y || 0) + Math.sin(angle) * n
        };
    }

    const api = {
        get animations() { return state.animations; },
        addAnimation: addAnimation,
        spikeKB: spikeKB,
        meleeKB: meleeKB,
        setRenderEnabled: function setRenderEnabled(flag) {
            state.showRender = !!flag;
            if (Nozo.log) Nozo.log("kbSimulator:setRenderEnabled", { enabled: state.showRender });
        },
        state: state
    };

    Nozo.kbSimulator = api;
    Nozo.state = Nozo.state || {};
    Nozo.state.kbSimulator = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.kbSimulator = api;
})();
