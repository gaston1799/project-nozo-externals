# project-nozo-externals

External modules for `.PROJECT NOZO w NEXT`.

Clean source files live in `src/`. The build script obfuscates with dead-code
injection, then minifies into `dist/*.min.js`.

Already-minified vendor files live in `dist/vendor/` and are copied directly
without re-obfuscation.

## Build

```sh
npm install
npm run build
```

## @require order

Add these to your userscript header in load order:

```js
// @require https://unpkg.com/gpu.js@2.16.0/dist/gpu-browser.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/vendor/easystar.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/vendor/msgpack.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/utils.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/constants.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/packet.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/input.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/combat.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/net-events.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/traps.min.js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/autobreak.min.js
```

## Vendor files (`dist/vendor/`)

| File | Source | Global exposed | Load order |
|------|--------|---------------|------------|
| `easystar.min.js` | Extracted from moomoo.js lines 2850–3113 | `window.EasyStar` | 2 |
| `msgpack.min.js` | Extracted from moomoo.js line 3463 | `window.msgpack` | 3 |

gpu.js is loaded from unpkg CDN directly (not vendored here).

## Project modules (`dist/`)

| File | Source | Global exposed | Load order |
|------|--------|---------------|------------|
| `utils.min.js` | Built from `src/utils.js` | `unsafeWindow.NozoNext.Utils`, `unsafeWindow.NozoUtils` | 4 |
| `constants.min.js` | Built from `src/constants.js` | `unsafeWindow.NozoNext.constants` | 5 |
| `packet.min.js` | Built from `src/packet.js` | `unsafeWindow.NozoNext.packet` | 6 |
| `input.min.js` | Built from `src/input.js` | `unsafeWindow.NozoNext.input` | 7 |
| `combat.min.js` | Built from `src/combat.js` | `unsafeWindow.NozoNext.combat` | 8 |
| `net-events.min.js` | Built from `src/net-events.js` | `unsafeWindow.NozoNext.netEvents` | 9 |
| `traps.min.js` | Built from `src/traps.js` | `unsafeWindow.NozoNext.traps` | 10 |
| `autobreak.min.js` | Built from `src/autobreak.js` | `unsafeWindow.NozoNext.autoBreak` | 11 |

## Globals

- `unsafeWindow.NozoNext.Utils`
- `unsafeWindow.NozoNext.createUtils()`
- `unsafeWindow.NozoUtils`
- `unsafeWindow.NozoNext.constants`
- `unsafeWindow.NozoNext.packet`
- `unsafeWindow.NozoNext.input`
- `unsafeWindow.NozoNext.combat`
- `unsafeWindow.NozoNext.netEvents`
- `unsafeWindow.NozoNext.traps`
- `unsafeWindow.NozoNext.autoBreak`
- `window.EasyStar` (vendor)
- `window.msgpack` (vendor)

## `Nozo.netEvents` API (`net-events.min.js`)

`Nozo.netEvents` is callable directly as `Nozo.netEvents(type, data[, ctx])` and also
exposes all object-API methods as properties.

Registration:

| Method | Description |
|--------|-------------|
| `register(type, fn)` | Register a single handler for a message type; unrestricted. |
| `registerMany(map)` | Register many handlers at once; pass `null` as a value to unregister. |
| `setHandlers(overrides)` | Legacy guarded API — only overrides keys that already exist in the map. |

Dispatch:

| Method | Returns | Description |
|--------|---------|-------------|
| `dispatch(type, data, ctx)` | `{ ok, handled, type, reason? }` | Route a decoded server message. `io-init` sets `ctx.socketID` and returns immediately. No-handler returns `{ ok: false, reason: "no-handler" }`. |

Default handlers (auto-registered at module load):

| Type | Name | State written |
|------|------|---------------|
| `C` | setupGame | `state.mySid` |
| `a` | updatePlayers | `state.playersRaw`, `state.players[]`, `state.player`, `state.near[]`, `state.enemy[]` |
| `H` | loadGameObject | `state.gameObjects[]` (upsert by sid; flat array stride 8) |
| `Q` | killObject | removes from `state.gameObjects` and `state.liztobj` by object sid |
| `R` | killObjects | removes all objects from those lists with matching `ownerSid` (or array of object sids) |
| `G` | updateLeaderboard | `state.leaderboard` |
| `7` | updateMinimap | `state.minimap` |
| `N` | updatePlayerValue | `state.player[index]`, `state.lastPlayerValueUpdateAt` |
| `O` | updateHealth | `state.players[i].health` / `.oldHealth`, `state.lastHealthUpdateAt` |

### player data format (from `a` handler, stride 13)

`state.players` entries are plain objects with: `sid`, `x`, `y`, `x2`, `y2`, `dir`,
`buildIndex`, `weaponIndex`, `weaponVariant`, `team`, `isLeader`, `skinIndex`,
`tailIndex`, `iconIndex`, `zIndex`, `visible`, and optionally `health` / `oldHealth`
(written by `O` handler).

### gameObjects format (from `H` handler, stride 8)

`state.gameObjects` entries: `sid`, `x`, `y`, `dir`, `scale`, `type`, `dataIndex`,
`ownerSid`, `active`.

### Notes

- `state.player` is only populated when `state.mySid` is set (requires the `C`/setupGame packet handler to have fired).
- `state.near` and `state.enemy` are rebuilt on every `a` tick from `state.players` relative to `state.player`.
- Default handlers write only to `Nozo.state.*`; no legacy globals are touched.
- Callers can override any default with `register(type, fn)` or `setHandlers({ type: fn })`.

## `Nozo.input` API (`input.min.js`)

State (live references — do not cache):

| Property | Type | Description |
|----------|------|-------------|
| `Nozo.input.state.clicks` | `{ left, middle, right }` | Current button-down state |
| `Nozo.input.state.keys` | `{}` | Key codes → boolean |
| `Nozo.input.state.mouse` | `{ x, y, clientX, clientY }` | Last mouse position |
| `Nozo.input.state.macro` | `{}` | Key string → 0/1 (legacy compat) |

Methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `attach(target, { preventContextMenu })` | `{ ok, reason? }` | Add mouse/keyboard listeners; never throws on bad target |
| `detach()` | `void` | Remove every listener added by `attach` |
| `setClick(name, value, source)` | `void` | Set `left`, `middle`, or `right` click state |
| `setKey(code, value, source)` | `void` | Set key state by code string |
| `setMouse(eventLike, source)` | `void` | Update mouse position from any event-like object |
| `getClicks()` | `{}` | Snapshot of `{ left, middle, right }` |
| `getKeys()` | `{}` | Snapshot of keys map |
| `getMouse()` | `{}` | Snapshot of mouse coords |
| `getMacro()` | `{}` | Snapshot of macro map |
| `onManualSwing(callback)` | `void` | Register callback for manual swing events |
| `emitManualSwing(reason)` | `void` | Fire all swing callbacks with snapshot; no packets sent |
| `getHistory()` | `Array` | Copy of last N input event records |

## `Nozo.combat` API (`combat.min.js`)

All `D` direction packet sends and `K` gather/swing packet sends in the new pipeline must
go through `Nozo.combat`. Direct `F` attack packets are not supported — they remain
disabled/unsupported in this pipeline.

State (live reference — do not cache):

| Property | Type | Description |
|----------|------|-------------|
| `Nozo.combat.state.lastDirAngle` | `number\|null` | Angle of last sent D packet |
| `Nozo.combat.state.lastDirTag` | `string\|null` | Tag of last sent D packet |
| `Nozo.combat.state.lastDirTick` | `number\|null` | Game tick of last sent D packet |
| `Nozo.combat.state.lastGatherTick` | `number\|null` | Game tick of last sent K packet |
| `Nozo.combat.state.lastBlockReason` | `string\|null` | Reason last swing was blocked |

Also reachable at `Nozo.state.combat`.

Aim lock:

| Method | Description |
|--------|-------------|
| `setAimLock(angle, tag, ticksOrExpireTick)` | Set a locked aim angle. `ticksOrExpireTick > currentTick` = absolute expire tick; otherwise relative ticks from now. |
| `clearAimLock(tag)` | Clear lock matching `tag` (or any lock if tag is falsy). |
| `getActiveAim(context)` | Return current lock object `{ angle, tag, expireTick }` or `null` if expired/absent. |

Aim resolver:

| Method | Returns | Description |
|--------|---------|-------------|
| `calculateAim(context)` | `{ ok, angle, source, reason?, debug }` | Single aim resolver. Priority: aimLock → context.aim → traps.aim → autoBreak.aim → enemy position → mouse fallback → blocked. Never throws. |

Reload gate:

| Method | Returns | Description |
|--------|---------|-------------|
| `canSwing(context)` | `{ ok, reason, debug }` | Check macro block, packet module, socket readiness, weapon, and reload. Reload ready when `reload <= pingTime` or `reload <= 0`. |

Packet senders (centralized — do not call `Nozo.packet` directly for combat):

| Method | Returns | Description |
|--------|---------|-------------|
| `sendDirection(angle, tag, context)` | `{ ok, sent?, reason? }` | The only D-packet sender. Calls `Nozo.packet.sendDirection`. |
| `sendGather(tag, context)` | `{ ok, sent?, reason? }` | The only auto-gather swing sender. Calls `Nozo.packet.sendGather`. |
| `swingAt(angle, tag, context)` | `{ ok, reason?, dir?, gather? }` | Reload check → sendDirection → sendGather. |

Input integration:

| Method | Returns | Description |
|--------|---------|-------------|
| `manualSwing(reason, context)` | `{ ok, ... }` | Calculate aim then call `swingAt`. Entry point for left/right click callbacks. |
| `wireInput(inputModule)` | `{ ok, reason? }` | Register `onManualSwing` callback on `Nozo.input` so manual swings route through combat pipeline. |

Debug:

| Method | Returns | Description |
|--------|---------|-------------|
| `getHistory()` | `Array` | Copy of last N send/block records. |
| `getDebugState()` | `{}` | Snapshot of aim lock, state, current tick, and time. |

### Centralized packet rule

All combat packet sends must go through `Nozo.combat`. Callers must not call
`Nozo.packet.sendDirection` or `Nozo.packet.sendGather` directly for combat purposes.
`F` attack packets are intentionally unsupported and not exposed in the combat API.

## `Nozo.traps` API (`traps.min.js`)

Detects enemy traps near the player and provides an aim angle for `Nozo.combat.calculateAim`.
Does **not** send any packets and does **not** contain placement logic.

State (live reference — do not cache):

| Property | Type | Description |
|----------|------|-------------|
| `Nozo.traps.state.inTrap` | `boolean` | True when the player is inside an enemy trap |
| `Nozo.traps.state.aim` | `number\|null` | Current aim angle (radians); consumed by `Nozo.combat.calculateAim` tier 3 |
| `Nozo.traps.state.target` | `object\|null` | Snapshot of the current aim target `{ x, y, sid, trap }` |
| `Nozo.traps.state.lastScan` | `number\|null` | Tick of the last `scan()` call |
| `Nozo.traps.state.lastReason` | `string\|null` | Reason string from the last scan result |
| `Nozo.traps.state.debug` | `object\|null` | Debug data from the last scan |

Also reachable at `Nozo.state.traps`.

Methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `scan(context)` | `{ ok, aim, target, inTrap, reason, debug }` | Scan object/player lists for traps; updates state. Never throws. |
| `setAim(angle, tag, expireTick)` | `void` | Manually set the aim entry. |
| `clearAim(reason)` | `void` | Clear current aim. |
| `getAim(context)` | `{ angle, tag, expireTick }\|null` | Return current aim entry, or null if expired/absent. |
| `getDebugState()` | `{}` | Snapshot of aim entry, state, tick, and time. |
| `getHistory()` | `Array` | Copy of last N scan/aim event records. |

### closeObjects fallback

`scan()` resolves object lists in this order:
1. `context.liztobj` (preferred)
2. `Nozo.state.liztobj`
3. `context.closeObjects` (fallback when liztobj is empty)
4. `Nozo.state.closeObjects`
5. `context.gameObjects` / `Nozo.state.gameObjects` (last resort)

`closeObjects` is treated as a `liztobj` equivalent — they refer to the same
server-provided close-objects list aliased under different names in moomoo.js.

## `Nozo.autoBreak` API (`autobreak.min.js`)

Selects the best breakable object target near the player, scores aim angles to
minimise friendly-fire, and stores aim for `Nozo.combat.calculateAim`.
Does **not** send any packets directly. Swings are only sent when
`requestBreak` is called with `context.send === true`, which routes through
`Nozo.combat.swingAt`.

State (live reference — do not cache):

| Property | Type | Description |
|----------|------|-------------|
| `Nozo.autoBreak.state.active` | `boolean` | True when a valid target and aim are set |
| `Nozo.autoBreak.state.aim` | `number\|null` | Current best aim angle (radians); consumed by `Nozo.combat.calculateAim` tier 4 |
| `Nozo.autoBreak.state.target` | `object\|null` | Snapshot of current target `{ x, y, sid, dmg, trap }` |
| `Nozo.autoBreak.state.lastScan` | `number\|null` | Tick of the last `scan()` call |
| `Nozo.autoBreak.state.lastReason` | `string\|null` | Reason string from the last scan result |
| `Nozo.autoBreak.state.debug` | `object\|null` | Debug data from the last scan |

Also reachable at `Nozo.state.autoBreak`.

Methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `scan(context)` | `{ ok, aim, target, level, reason, debug }` | Scan for breakable objects; populate 4-tier priority; update state. Never throws. |
| `setAim(angle, tag, expireTick)` | `void` | Manually set the aim entry. |
| `clearAim(reason)` | `void` | Clear current aim and deactivate. |
| `getAim(context)` | `{ angle, tag, expireTick }\|null` | Return current aim entry, or null if expired/absent. |
| `requestBreak(target, context)` | `{ ok, aim, target, sent, reason }` | Scan + aim update. Sends a swing via `Nozo.combat.swingAt` **only** when `context.send === true`. |
| `getDebugState()` | `{}` | Snapshot of aim entry, state, tick, and time. |
| `getHistory()` | `Array` | Copy of last N scan/aim event records. |

### Priority tiers

| Tier | Condition | Objects |
|------|-----------|---------|
| 0 | `Nozo.state.traps.inTrap === true` | Closest enemy spikes ≤ 169 px + the trap object the player is inside |
| 1 | Always | All enemy spikes ≤ 169 px |
| 2 | Always | Enemy turrets, teleporters, and blockers |
| 3 | Always (aborted if nearest enemy ≤ 569 px) | All enemy non-null-type objects |

### Aim scoring

Each candidate angle is scored against the sweep cone (π/2.6 half-angle).
Hitting enemy damaging objects earns reward; hitting team objects costs reward.
Level 3 (break-all) inverts team-object cost to encourage clearing them.
