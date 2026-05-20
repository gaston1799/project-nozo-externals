/* Healer module for NozoNext.
   Tracks health deltas, evaluates shame/skin transitions, and triggers
   food-placement via centralized packet APIs. No rogue packet sends. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    // Max shame stack before immediate heal is suppressed (mirrors _HEAL_SHAME_SOFT_CAP).
    const _SHAME_SOFT_CAP = 5;
    // Minimum damage that warrants a heal response.
    const _MIN_DAMAGE_THRESHOLD = 1;
    // Default food heal amount when initData is absent.
    const _DEFAULT_FOOD_HEAL = 20;
    // Delay before a shame increment is reversed (mirrors addShameTimer cooldown).
    const _SHAME_DECAY_MS    = 14000;
    // Tick equivalent for shame decay (14000 ms / 50 ms per tick).
    const _SHAME_DECAY_TICKS = 280;

    const maxHistory = (Nozo.constants && Nozo.constants.MAX_LOG) || 64;
    const _history = [];

    // Live healer state — reachable at Nozo.state.healer and Nozo.healer.state.
    const state = {
        enabled:            true,
        pendingTimer:       null,
        pendingScheduledId: null,
        lastHealAt:         0,
        lastTriggerReason:  null,
        lastBlockReason:    null,
        healCount:          0
    };

    function _record(kind, detail) {
        _history.push({ kind: kind, detail: detail || null, t: Date.now() });
        if (_history.length > maxHistory) _history.shift();
    }

    function _currentTick() {
        return (Nozo.state && typeof Nozo.state.tick === "number") ? Nozo.state.tick : 0;
    }

    function _pingTime() {
        return (Nozo.state && typeof Nozo.state.pingTime === "number") ? Nozo.state.pingTime : 0;
    }

    // Food heal amount per item. Tries live initData first, then defaults.
    function _getFoodHealAmount(itemId) {
        const s = Nozo.state;
        if (s && s.itemsData && Array.isArray(s.itemsData.list) && itemId != null) {
            const item = s.itemsData.list[itemId];
            if (item && typeof item.healing === "number" && item.healing > 0) return item.healing;
        }
        return _DEFAULT_FOOD_HEAL;
    }

    function _getFoodCount(player, itemId) {
        if (!player || itemId == null) return Infinity;
        const counts = player.itemCounts;
        if (!counts) return Infinity;
        if (typeof counts[itemId] === "number") return counts[itemId];
        if (Array.isArray(counts) && typeof counts[itemId] === "number") return counts[itemId];
        return Infinity;
    }

    function _resolveFoodItem(player) {
        if (!player) return null;
        const slots = Array.isArray(player.items) ? player.items : [];
        if (!slots.length) return null;
        let best = null;
        let bestHeal = 0;
        for (let i = 0; i < slots.length; i++) {
            const itemId = slots[i];
            if (itemId == null) continue;
            const count = _getFoodCount(player, itemId);
            if (count <= 0) continue;
            const heal = _getFoodHealAmount(itemId);
            if (heal > bestHeal) {
                bestHeal = heal;
                best = { id: itemId, heal: heal, count: count };
            }
        }
        return best;
    }

    // Number of food items needed to reach full health. Returns 0 when nothing to do.
    function _healthBased(player) {
        if (!player) return 0;
        if (player.health >= 100) return 0;
        // Skin 45 = shame, skin 56 = special — skip healing in these states.
        if (player.skinIndex === 45 || player.skinIndex === 56) return 0;
        const food = _resolveFoodItem(player);
        const healAmt = food ? food.heal : _DEFAULT_FOOD_HEAL;
        if (!healAmt) return 0;
        return Math.ceil((100 - player.health) / healAmt);
    }

    // Whether the player is in immediate danger (enemy close or in a trap).
    function _isInDanger(player) {
        const s = Nozo.state;
        if (!s || !player) return false;
        if (s.traps && s.traps.inTrap) return true;
        const enemy = s.enemy;
        if (!Array.isArray(enemy) || !enemy.length) return false;
        const nearEnemy = enemy[0];
        if (!nearEnemy) return false;
        const px = player.x2 != null ? player.x2 : player.x;
        const py = player.y2 != null ? player.y2 : player.y;
        const ex = nearEnemy.x2 != null ? nearEnemy.x2 : nearEnemy.x;
        const ey = nearEnemy.y2 != null ? nearEnemy.y2 : nearEnemy.y;
        if (!isFinite(px) || !isFinite(py) || !isFinite(ex) || !isFinite(ey)) return false;
        const dx = px - ex, dy = py - ey;
        return (dx * dx + dy * dy) <= 40000; // 200 units
    }

    // Best aim angle for food placement — delegates to combat resolver.
    function _getAimAngle() {
        if (Nozo.combat && typeof Nozo.combat.calculateAim === "function") {
            const res = Nozo.combat.calculateAim({});
            if (res && res.ok && isFinite(res.angle)) return res.angle;
        }
        return 0;
    }

    // Re-select the player's primary weapon after food placement.
    function _reSelectWeapon(player) {
        if (!player || !Nozo.packet || typeof Nozo.packet.sendSelectItem !== "function") return;
        const wi = player.weaponCode != null ? player.weaponCode
            : (Array.isArray(player.weapons) && player.weapons.length ? player.weapons[0] : null);
        if (wi != null) Nozo.packet.sendSelectItem(wi, true);
    }

    // Execute food placement: select item → F-packet × count → re-select weapon.
    function _doHeal(count, angle, reason) {
        const player = Nozo.state && Nozo.state.player;
        if (!player) {
            state.lastBlockReason = "noPlayer";
            _record("heal:blocked", { reason: "noPlayer", cause: reason });
            if (Nozo.log) Nozo.log("healer:blocked", { reason: "noPlayer", cause: reason });
            return false;
        }
        if (!Nozo.packet || typeof Nozo.packet.sendSelectItem !== "function" ||
                typeof Nozo.packet.sendPlace !== "function") {
            state.lastBlockReason = "noPacketAPI";
            _record("heal:blocked", { reason: "noPacketAPI", cause: reason });
            if (Nozo.log) Nozo.log("healer:blocked", { reason: "noPacketAPI", cause: reason });
            return false;
        }

        const food = _resolveFoodItem(player);
        const itemIndex = food ? food.id : null;
        if (itemIndex == null) {
            state.lastBlockReason = "noFoodItem";
            _record("heal:blocked", { reason: "noFoodItem", cause: reason });
            if (Nozo.log) Nozo.log("healer:blocked", { reason: "noFoodItem", cause: reason });
            return false;
        }
        _record("heal:execute", { count: count, angle: angle, itemIndex: itemIndex, reason: reason, tick: _currentTick() });
        if (Nozo.log) Nozo.log("healer:execute", { count: count, angle: angle, itemIndex: itemIndex, reason: reason });

        function _placeAll() {
            for (let i = 0; i < count; i++) {
                Nozo.packet.sendSelectItem(itemIndex, false);
                Nozo.packet.sendPlace(1, angle);
            }
            _reSelectWeapon(player);
            _addShameTimer(count);
        }

        // Skin 56 requires a one-tick delay before placement (mirrors original healer branch).
        if (player.skinIndex === 56) {
            if (Nozo.tickScheduler && typeof Nozo.tickScheduler.scheduleNextTick === "function" &&
                    Nozo.state && typeof Nozo.state.tick === "number") {
                Nozo.tickScheduler.scheduleNextTick(_placeAll, { tag: "skin56Heal" });
            } else {
                setTimeout(_placeAll, 50);
            }
        } else {
            _placeAll();
        }

        state.lastHealAt = Date.now();
        state.healCount++;
        state.lastBlockReason = null;
        return true;
    }

    // Increment player.shameCount by count, then decrement after decay period.
    // Prefers tick scheduler; falls back to ms-timeout when tick context is unavailable.
    // Captures the player reference at call time so respawn doesn't corrupt the counter.
    function _addShameTimer(count) {
        const player = Nozo.state && Nozo.state.player;
        if (!player || typeof player !== "object") return;
        if (typeof player.shameCount !== "number") player.shameCount = 0;
        player.shameCount += count;
        const target = player;
        const decrement = function () {
            if (typeof target.shameCount === "number" && target.shameCount > 0) {
                target.shameCount = Math.max(0, target.shameCount - count);
            }
        };
        if (Nozo.tickScheduler && typeof Nozo.tickScheduler.scheduleInTicks === "function" &&
                Nozo.state && typeof Nozo.state.tick === "number") {
            Nozo.tickScheduler.scheduleInTicks(_SHAME_DECAY_TICKS, decrement, { tag: "shameDecay" });
        } else {
            setTimeout(decrement, _SHAME_DECAY_MS);
        }
    }

    // Cancel any pending heal timer (both ms-based and tick-based paths).
    function _cancelPending() {
        if (state.pendingTimer) {
            clearTimeout(state.pendingTimer);
            state.pendingTimer = null;
        }
        if (state.pendingScheduledId != null) {
            if (Nozo.tickScheduler && typeof Nozo.tickScheduler.cancel === "function") {
                Nozo.tickScheduler.cancel(state.pendingScheduledId);
            }
            state.pendingScheduledId = null;
        }
    }

    // Schedule a delayed heal trigger. Uses tick scheduler when available, ms-timeout as fallback.
    function _scheduleHeal(delayMs, reason) {
        _cancelPending();
        const fn = function () {
            state.pendingTimer = null;
            state.pendingScheduledId = null;
            requestHeal(reason, { fromTimer: true });
        };
        if (Nozo.tickScheduler && typeof Nozo.tickScheduler.scheduleInTicks === "function" &&
                Nozo.state && typeof Nozo.state.tick === "number") {
            const delayTicks = Math.max(1, Math.ceil(delayMs / 50));
            state.pendingScheduledId = Nozo.tickScheduler.scheduleInTicks(
                delayTicks, fn, { tag: "healSchedule:" + reason });
        } else {
            state.pendingTimer = setTimeout(fn, Math.max(0, delayMs));
        }
    }

    // requestHeal: primary entry point for triggering a heal.
    // On first call (fromTimer=false): schedule a ping-delayed execution.
    // On timer callback (fromTimer=true): evaluate and execute.
    function requestHeal(reason, opts) {
        if (!state.enabled) {
            state.lastBlockReason = "disabled";
            _record("heal:blocked", { reason: "disabled", cause: reason });
            return { ok: false, reason: "disabled" };
        }

        const player = Nozo.state && Nozo.state.player;
        if (!player) {
            state.lastBlockReason = "noPlayer";
            return { ok: false, reason: "noPlayer" };
        }

        const count = _healthBased(player);
        if (count <= 0) {
            const why = player.health >= 100 ? "fullHealth" : "shameOrSpecialSkin";
            state.lastBlockReason = why;
            _record("heal:skip", { reason: why, hp: player.health, skin: player.skinIndex });
            return { ok: false, reason: why };
        }

        const fromTimer = !!(opts && opts.fromTimer);

        // First call: schedule a ping-aware delay, then execute on callback.
        if (!fromTimer) {
            const ping = _pingTime();
            const delay = ping * 1.5;
            _record("heal:schedule", { reason: reason, count: count, ping: ping, delay: delay });
            if (Nozo.log) Nozo.log("healer:schedule", { reason: reason, count: count, ping: ping, delay: delay });
            _scheduleHeal(delay, reason + ":timer");
            return { ok: true, scheduled: true };
        }

        // Timer fired — execute now.
        state.lastTriggerReason = reason;
        const angle = _getAimAngle();
        _doHeal(count, angle, reason);
        return { ok: true, executed: true, count: count };
    }

    // onTick: called every bridge tick. Reserved for future per-tick parity work.
    function onTick(ctx) {
        if (!state.enabled) return;
        // No polling-style auto-heal here — healer is event-driven via onHealthUpdate.
    }

    // onHealthUpdate: called when O (updateHealth) fires for the local player.
    // Mirrors the advHeal / _healWithShameGate logic from the original updatePlayers block.
    function onHealthUpdate(sid, newHealth, oldHealth) {
        if (!state.enabled) return;
        const s = Nozo.state;
        if (!s) return;
        const player = s.player;
        if (!player) return;
        if (s.mySid != null && sid !== s.mySid) return;

        const damaged = typeof oldHealth === "number" ? oldHealth - newHealth : 0;
        if (damaged < _MIN_DAMAGE_THRESHOLD) return;

        _record("healthUpdate", { sid: sid, newHealth: newHealth, oldHealth: oldHealth, damaged: damaged });

        const inDanger = _isInDanger(player);
        const ping = _pingTime();
        const healTimeout = Math.max(0, 140 - ping);
        const shameCount = player.shameCount != null ? player.shameCount : 0;

        if (Nozo.log) Nozo.log("healer:trigger", {
            reason: "damage",
            damaged: damaged,
            hp: newHealth,
            inDanger: inDanger,
            shameCount: shameCount
        });

        if (inDanger || shameCount < _SHAME_SOFT_CAP) {
            // Immediate (ping-delayed) heal path.
            requestHeal("damage:onHealth", {});
        } else {
            // Shame cap reached — use timeout-only slow path.
            _record("heal:defer", { reason: "shameCap", shameCount: shameCount, damaged: damaged });
            if (Nozo.log) Nozo.log("healer:defer", { reason: "shameCap", shameCount: shameCount });
            _scheduleHeal(healTimeout, "damage:delayed");
        }
    }

    // onShameClear: called when self-player's skinIndex transitions from 45 (shame) to other.
    // Mirrors the healer() call at the skin-transition branch near moomoo.js ~30422.
    function onShameClear() {
        if (!state.enabled) return;
        _record("shameClear:trigger", { tick: _currentTick() });
        if (Nozo.log) Nozo.log("healer:shameClear", { tick: _currentTick() });
        requestHeal("shameClear", {});
    }

    function setEnabled(flag) {
        state.enabled = !!flag;
        if (!state.enabled) _cancelPending();
        if (Nozo.log) Nozo.log("healer:setEnabled", { enabled: state.enabled });
    }

    function getHistory() {
        return _history.slice();
    }

    function getDebugState() {
        return Object.assign({}, state, { tick: _currentTick(), time: Date.now() });
    }

    const healer = {
        state:          state,
        setEnabled:     setEnabled,
        onTick:         onTick,
        onHealthUpdate: onHealthUpdate,
        onShameClear:   onShameClear,
        requestHeal:    requestHeal,
        getHistory:     getHistory,
        getDebugState:  getDebugState
    };

    Nozo.healer = healer;
    Nozo.state = Nozo.state || {};
    Nozo.state.healer = state;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.healer = healer;
})();
