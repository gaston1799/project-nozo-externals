# project-nozo-externals

External modules for `.PROJECT NOZO w NEXT`.

Clean source files live in `src/`. The build script obfuscates with dead-code
injection, then minifies into `dist/*.min.js`.

## Build

```sh
npm install
npm run build
```

## CDN

```js
// @require https://cdn.jsdelivr.net/gh/gaston1799/project-nozo-externals@main/dist/utils.min.js
```

## Globals

- `unsafeWindow.NozoNext.Utils`
- `unsafeWindow.NozoNext.createUtils()`
- `unsafeWindow.NozoUtils`
