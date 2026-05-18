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

## Globals

- `unsafeWindow.NozoNext.Utils`
- `unsafeWindow.NozoNext.createUtils()`
- `unsafeWindow.NozoUtils`
- `unsafeWindow.NozoNext.constants`
- `unsafeWindow.NozoNext.packet`
- `unsafeWindow.NozoNext.input`
- `unsafeWindow.NozoNext.combat`
- `window.EasyStar` (vendor)
- `window.msgpack` (vendor)

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
