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
```

## Vendor files (`dist/vendor/`)

| File | Source | Global exposed | Load order |
|------|--------|---------------|------------|
| `easystar.min.js` | Extracted from moomoo.js lines 2850–3113 | `window.EasyStar` | 2 |
| `msgpack.min.js` | Extracted from moomoo.js line 3463 | `window.msgpack` | 3 |

gpu.js is loaded from unpkg CDN directly (not vendored here).

## Project modules (`dist/`)

| File | Source | Global exposed |
|------|--------|---------------|
| `utils.min.js` | Built from `src/utils.js` | `unsafeWindow.NozoNext.Utils`, `unsafeWindow.NozoUtils` |

## Globals

- `unsafeWindow.NozoNext.Utils`
- `unsafeWindow.NozoNext.createUtils()`
- `unsafeWindow.NozoUtils`
- `window.EasyStar` (vendor)
- `window.msgpack` (vendor)
