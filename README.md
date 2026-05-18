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

## Globals

- `unsafeWindow.NozoNext.Utils`
- `unsafeWindow.NozoNext.createUtils()`
- `unsafeWindow.NozoUtils`
- `unsafeWindow.NozoNext.constants`
- `unsafeWindow.NozoNext.packet`
- `unsafeWindow.NozoNext.input`
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
