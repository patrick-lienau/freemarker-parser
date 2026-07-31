---
name: migrate-to-neptune-cx
description: How to build, maintain, and consume the shared Neptune client-extension packages — @neptune/cx-tooling (the build CLI, Vite 8 / Rolldown, wrapping a postcss-scss pipeline, token & fragment builders, and a dev server with true HMR) and @neptune/cx (runtime utils plus the fragment & portlet registries). Use when extracting a portal's vendored neptune-ui/scripts or shared src into these packages, cutting a consumer portal (isa, chroa, cbdce, ay, aoc) over to them, bumping/publishing a version, adding a module/subpath export, or wiring up yarn-link local dev with HMR. Covers the private registry, publish gotchas, and the Vite/Liferay integration traps.
---

# Neptune shared CX packages: @neptune/cx-tooling & @neptune/cx

The Neptune UI client extension used to vendor its entire `neptune-ui/scripts/`
build tooling and shared `src` utilities by **copying** them into every consumer
portal. They drifted. These two published packages are the fix — one source of
truth, consumed from the private registry, with `yarn link` for local dev.

| Package | What | Consumed how | Repo |
|---|---|---|---|
| `@neptune/cx-tooling` | Build **tooling**: a `neptune-cx` CLI (Vite 8 / Rolldown) — scss-via-postcss, vendor chunks, token + fragment builders, dev server + HMR | runs in Node (devDependency) | `github.com/thirdwavellc/neptune-cx-tooling` (`~/dev/neptune-cx-tooling`) |
| `@neptune/cx` | Shared **runtime** code: DOM utils + the fragment & portlet registries | imported by the portal's bundle (dependency) | `github.com/thirdwavellc/neptune-cx` (`~/dev/neptune-cx`) |

npm scope is `@neptune`; repos are `neptune-cx*` (names differ — don't "fix" it).
Both `package.json` set `"type": "module"`.

> **Build pipeline:** the tooling is **Vite 8 (Rolldown)** — webpack was removed.
> While iterating, the Vite tooling runs from a **linked** local checkout (see
> Local dev); the published version may lag, so `yarn neptune:link` during a migration.

## Hard conventions (do not violate)
- **Never create `.mjs` / `.cjs` files.** Packages are `type: module`, so `.js` is ESM — even for Node loader hooks.
- **Never commit gradle scaffolding** (`build.gradle`, `gradlew`, `gradle/`, `.gradle/`). Gitignore them; watch for `git add -A` sweeping in `.gradle/`.
- **Never hand-edit `@neptune/cx`'s `exports`/`typesVersions`** — they're generated.

## Registry & publishing
- Private Nexus: `https://npm.thirdwavellc.com/repository/thirdwave-npm/`.
- Each consumer repo commits a **root `.npmrc`** pinning the scope (no secret):
  ```ini
  @neptune:registry=https://npm.thirdwavellc.com/repository/thirdwave-npm/
  always-auth=true
  ```
  Plus `"publishConfig": { "registry": ".../thirdwave-npm/" }` in each `package.json`.
- The **auth token** stays per-developer in `~/.npmrc` (`//npm.thirdwavellc.com/repository/thirdwave-npm/:_authToken=…`) — never committed.
- **PUBLISH GOTCHA:** this env's `npm` uses a bundled runtime npmrc as userconfig (not `~/.npmrc`), so `npm publish` fails `ENEEDAUTH`. Always: `npm publish --userconfig "$HOME/.npmrc"`.
- CI/Liferay-gradle builds run `yarn` themselves — the agent's environment needs the registry token (the committed `.npmrc` carries only the scope→registry mapping).

---

## @neptune/cx-tooling (the Vite build CLI)

Source in **`src/`**; `bin` is `src/cli.js` exposing **`neptune-cx`**. The CLI dispatches:
`vite build`, `vite` (serve), `vite:dev`, `vite:hmr-stubs`, `write-tokens`,
`watch-tokens`, `watch-fragments`, `build-fragments`, `deploy`, `clean:procs`.
`dependencies` = vite + the postcss chain (autoprefixer, advanced-variables, cssnano,
the custom eliding-import/unquote, …) + `@swc/core` + node-script libs (fs-extra,
execa, sane, yaml, chalk, lodash). The CLI runs node tasks as child processes and
spawns the vite bin via its `package.json` `bin` field (it isn't in vite's `exports`).

### Why it's built the way it is (the traps)
1. **Locate the consumer via `process.cwd()`, never `__dirname`** — installed under node_modules, `__dirname` points inside the package. `constants.js` sets `EXTENSION_DIR = process.env.NEPTUNE_EXTENSION_DIR || process.cwd()` (Yarn runs scripts with cwd = the neptune-ui dir) and throws clearly if no `client-extension.yaml`.
2. **SCSS is processed by postcss, NOT dart-sass.** The `.scss` is SCSS *syntax*; `postcss-advanced-variables` resolves `$vars`/inlines `@import`. The `neptune:scss-as-postcss` plugin (`enforce:'pre'`) resolves a `.scss` import to `<abs>.css?neptune-scss` so Vite picks postcss (extension `.css`) instead of the Sass preprocessor, then runs the shared chain (`src/postcss-chain.js`). Use postcss `{ parser: postcssScss }` — **not** `{ syntax }` (syntax also sets the scss *stringifier*, emitting scss-flavored output that Vite's css pass can't parse).
3. **lightningcss** minifies **and validates** the CSS (`cssMinify: 'lightningcss'`, `css.lightningcss.errorRecovery: true` to downgrade pre-existing malformed selectors / unresolved `#{$…}` to warnings instead of failing). cssnano is therefore disabled in the chain for Vite (`minify:false`).
4. **Chunks from `client-extension.yaml`** (`getFragmentBundles`): `common` + `common-vendor` (manualChunks: node_modules → common-vendor), and `fragment-<name>[-vendor]` when CE entries exist. Rolldown inlines its own runtime as `rolldown-runtime.js`; a `runtime.js` stub is emitted for the yaml's `runtime` CE.
5. **`?h=` cache-busting (prod, the `neptune:cache-bust` plugin):** files keep stable names and carry an `?h=<contenthash:8>` query on every reference. Three reference kinds are busted: (a) **asset refs** (images/fonts) in JS/CSS — like the old webpack `[name][ext]?h=`; (b) **cross-chunk ESM imports** between JS chunks — Rolldown emits these with NO query (`import"./common-vendor.js"`), so they're rewritten to `import"./common-vendor.js?h=<hash>"`; (c) the injected `<script>`/`<link>` URLs in the **CE config**, stamped post-assembly by the `cachebust` command. Chunks are hashed in **dependency order** (imported chunk first) so an importer embeds its dependency's final hash, and the hashes are carried to the patcher via a **manifest** (`neptune-cachebust-manifest.json`, emitted into `dist`, deleted from `static` after patching) — so the in-bundle import and the script tag are the *same* hash without re-hashing (immune to post-write byte differences like the sourcemap comment). `assetsInlineLimit` is lowered (~2048) so fewer small assets inline as base64. **Why it matters:** Liferay's `?t=${modifiedTime}` only reaches the `<script>`/`<link>` URL, never the in-bundle vendor import — so without (b)+(c) the browser fetched `common-vendor.js` twice (once cache-busted via the tag, once bare via the import) and the bare one was never busted. Consumers therefore **drop `?t=${modifiedTime}`** from `client-extension.yaml` (see cutover) and let the build own cache-busting. *(since 0.4.0)*
6. **Per-project config** comes from the consumer's `neptune.config.js`: `themeSlug`, `allowedHosts`, `fragmentContributors`, `fonts.emitAssets`.

### Production loading — **must be `type="module"`**
Rolldown output is **ESM with cross-chunk imports** (`common.js` imports `./common-vendor.js`, `./rolldown-runtime.js`). Loaded as a classic script it throws *"Cannot use import statement outside a module."* Liferay must inject the entry as **`<script type="module">`** (Liferay's `globalJS` CE supports this). The browser then pulls vendor/runtime via the entry's imports — so vendor/runtime are separate cached *files*, not separate classic-script CEs.

### Dev — true HMR (Liferay-hosted)
Vite's dev server serves ESM + `@vite/client`. The **JS** is loaded via a **classic-script bootstrap** (the `common.js` "stub", served by Liferay from its own context — no patch) that dynamic-imports `@vite/client` + a single generated dev entry (`neptune-vite-dev-entry.js`, which statically imports `src/index.ts` + all fold-in fragments → **one** import, not ~90). The **CSS** is patched (below).
- **No FOUC + always-current base CSS:** `extension-patcher.js` (`dev:patch-ext`, run via the gradle `packageRunDevPatchExt` task) rewrites the **`globalCSS`** CE `baseURL`s to the dev server. A serve-only Vite middleware (`neptune:dev-base-css`) then serves `/common.css` + `/common-vendor.css` as the **current** bundled CSS — built in-memory (`vite build`, `write:false`, prod `base` so `url()` assets resolve via Liferay), cached, invalidated by **`.scss` mtime** (not fs events), `Cache-Control: no-store`. So Liferay injects `<link href="http://localhost:3000/common.css">` server-side (instant styled paint) and every hard-refresh reflects the latest edit. (`dev:base-css` still runs a real build to **deploy the hashed assets** the CSS references.)
- **HMR stays authoritative:** once the dev entry resolves (Vite has injected the live CSS), the bootstrap **removes the base CSS `<link>`s** — otherwise a deleted rule would linger in the base link.
- **Watchers poll** (`sane({ poll: true })` in `fragment-watcher.js` + `token-watcher.js`; the base-css middleware uses `.scss` mtime) — native FSEvents are contended alongside Vite's watcher and silently miss `index.html`/`*.json`/`tokens.json`/`.scss` changes.
- **Linked-package HMR:** when a `@neptune/*` dep is yarn-linked (symlink in node_modules), the dev config sets `server.watch.usePolling` so edits to its built output (outside node_modules) hot-update. No-op/no-cost for registry installs — transparent.

---

## @neptune/cx (shared runtime)
Source `.ts` in `src/` (`utils.ts`, `registry.ts` = the fragment registry, `portlet-registry.ts` = the portlet registry), built by `tsc` to `dist/` as ESM + `.d.ts`. The two registries are independent (distinct `window` keys / brand symbols) — `@neptune/cx/registry` exports `registerFragment`, `@neptune/cx/portlet-registry` exports `registerPortlet`. Consumers import the **built JS** (the portal's bundler doesn't transpile node_modules). The `exports` + `typesVersions` keys are **auto-generated** from `src/*.ts` by `scripts/gen-package-exports.js` (`yarn gen`, run before `build`/`prepack`; `yarn watch` regenerates on src add/remove). `typesVersions` is required because consumer tsconfigs use `moduleResolution: node` (which ignores `exports` for types).

---

## Consumer cutover (apply per portal)
One portal at a time; verify before moving on.
1. **Root `.npmrc`** (registry pin, above).
2. **`client-extensions/neptune-ui/neptune.config.js`:**
   ```js
   export default {
     themeSlug: 'neptune-ui-theme',         // default — every portal's WAR theme is `neptune-ui-theme`; override only if a portal's theme CE slug differs
     allowedHosts: 'all',
     fragmentContributors: ['content','cards','layouts','basics','shell','util'],
     fonts: { emitAssets: true },
   };
   ```
3. **`neptune-ui/package.json`:**
   - `devDependencies`: `@neptune/cx-tooling` (remove the old vendored build deps).
   - `dependencies`: `@neptune/cx` (keep runtime deps: splide/lodash/moment/…).
   - scripts → the CLI:
     - `build:prod` = `NODE_ENV=production neptune-cx vite build`
     - `dev` = `clean && dev:prep && dev:watch`
     - `dev:prep` = `dev:write-tokens && dev:base-css && dev:hmr-stubs && dev:deploy`
     - `dev:base-css` = `NODE_ENV=production neptune-cx vite build` (deploys hashed assets; the live base CSS is served by the dev middleware)
     - `dev:hmr-stubs` = `NODE_ENV=development neptune-cx vite:hmr-stubs`
     - `dev:patch-ext` = `NODE_ENV=development neptune-cx patch-ext` (gradle invokes it as `packageRunDevPatchExt`)
     - `dev:watch` = `NODE_ENV=development neptune-cx vite:dev`
     - `prod:cachebust` = `NODE_ENV=production neptune-cx cachebust` (gradle invokes it as `packageRunProdCachebust`; stamps `?h=` on the CE config URLs — see step 5)
   - link helpers (**root-aware** — Yarn-1 workspaces hoist the bin to root, so link from there):
     - `neptune:link` = `cd ../.. && yarn link @neptune/cx-tooling && yarn link @neptune/cx`
     - `neptune:unlink` = `cd ../.. && (yarn unlink @neptune/cx-tooling; yarn unlink @neptune/cx; yarn install --force)`
4. **`client-extension.yaml`:** the entry/vendor `globalJS` need `scriptElementAttributes: { type: "module" }` — prod Rolldown output is ESM with cross-chunk imports, so loaded as a classic script it throws *"Cannot use import statement outside a module"*. **Drop `?t=${modifiedTime}`** from every `url:` — the build now owns cache-busting via `?h=` (trap 5); leaving `?t=` on the tag while the in-bundle import uses `?h=` would re-introduce the double vendor fetch. So `url: common.js` (not `url: common.js?t=${modifiedTime}`).
5. **`neptune-ui/build.gradle`:** dev mode skips the prod build and runs the CSS-only patch; **non-dev** mode runs the cache-bust patch (after assembly writes the CE config json + copies `dist → static`, before zipping):
   ```gradle
   if (project.hasProperty('devMode')) {
       tasks.assembleClientExtension.dependsOn -= tasks.packageRunBuild
       tasks.buildClientExtensionZip.dependsOn += tasks.packageRunDevPatchExt
   } else {
       tasks.packageRunProdCachebust.mustRunAfter tasks.assembleClientExtension
       tasks.buildClientExtensionZip.dependsOn += tasks.packageRunProdCachebust
   }
   ```
6. **Root `build.gradle`:** pin the Node/npm version the Liferay Node Gradle plugin uses, to match `.nvmrc`. Without this the plugin downloads its own default Node, which can be **older than `@neptune/cx-tooling`'s engines require** (Vite 8 needs Node ≥ 20.19 / ≥ 22.12) — so a `blade gw`/`./gradlew` build, or running the neptune-ui CX build from the **IntelliJ Gradle panel**, fails the engine check even when the developer's shell `nvm` is correct. Add to the root `build.gradle` (the `npmVersion` is the one bundled with that Node — check `.nvmrc`):
   ```gradle
   node {
       nodeVersion = "22.22.2" // keep in sync with .nvmrc
       npmVersion = "10.9.7"   // keep in sync with .nvmrc
   }
   ```
7. **Delete** the vendored `neptune-ui/scripts/` and the local shared sources now sourced from `@neptune/cx`: `src/utils.ts`, `src/fragments/registry.ts`, and (if present) the portlet registry `src/portlets/registry.ts`. (Keep any portal-specific files that merely *live* alongside them.)
8. **Rewire imports** in `neptune-ui/src` to the package — rewrite longest paths first via `sed`:
   - utils (varying depths `./utils`, `../../utils`, `../../../utils`) → `@neptune/cx/utils`
   - fragment registry `../../registry` → `@neptune/cx/registry` (catch side-effect imports too: `import './fragments/registry'` → `import '@neptune/cx/registry'`)
   - portlet registry `../registry` (imported from `src/portlets/**`) → `@neptune/cx/portlet-registry`
   - **Disambiguate the two registries by import path** — `../../registry` (from a fragment, two levels down) is the fragment registry; `../registry` (from a portlet, one level down) is the portlet registry. Rewrite the deeper (`../../registry`) pattern first so the shallower portlet rewrite doesn't mis-hit it. A missed import only surfaces once the local files are deleted, as a bundler "doesn't exist" error.
9. **SCSS cleanup (optional):** `src/theme/tokens.scss` begins with `@import './breakpoints.scss'` (which in turn imports `tokens.breakpoints.scss`), so any `.scss` that already `@import`s `theme/tokens` transitively gets the breakpoints (`$immu-bp-*` vars + `@custom-media`) — a separate `@import '…/theme/breakpoints'` in that *same* file is redundant and can be dropped. **Exceptions (keep their breakpoints import):** `src/index.ts` and `src/theme/tokens.scss` itself.
10. `yarn install`; verify `yarn build:prod` (dist) and `tsc -p neptune-ui/tsconfig.json --noEmit` reports no unresolved `@neptune/*`.

## Local dev with HMR (the linking developer)
```bash
cd ~/dev/neptune-cx-tooling && yarn link
cd ~/dev/neptune-cx && yarn link && yarn watch     # rebuild dist as you edit
# in the portal (root-aware helper):
yarn neptune:link        # links BOTH, from the workspace root
yarn dev                 # vite dev server + HMR; editing @neptune/cx hot-updates too
yarn neptune:unlink      # back to registry versions
```
`yarn link` (Yarn 1) doesn't modify `package.json`, so nothing leaks into git; teammates on the registry version are unaffected.

## Publishing a new version
1. Bump `version`; `git commit` + `git push`.
2. `npm publish --userconfig "$HOME/.npmrc"` (`prepack` builds `dist`; for `cx`, `build` regenerates `exports`/`typesVersions` — eyeball that diff if a module was added/removed).
3. Bump the dependency range in each consumer and `yarn install`.

## Verification checklist
- [ ] `yarn build:prod` produces `dist/` (`common`/`common-vendor` js+css, `rolldown-runtime.js`, `assets/…?h=…`, `neptune-cachebust-manifest.json`).
- [ ] Prod entry loads as `type="module"` (no "Cannot use import statement outside a module").
- [ ] **Cache-busting:** `common.js`'s cross-chunk imports carry `?h=` matching the manifest (`grep -oE './(common-vendor|rolldown-runtime)\.js\?h=[a-f0-9]+' dist/common.js`); after a real deploy, the assembled CE config's JS/CSS `url=` entries end in `?h=<hash>` (no `?t=${modifiedTime}`), and the `common-vendor.js` script-tag hash equals the one imported inside `common.js` (one network request for the vendor chunk, not two).
- [ ] `tsc --noEmit` reports no unresolved `@neptune/*` module.
- [ ] `yarn dev`: styled paint is immediate (no FOUC); base CSS `<link>`s disappear after load; editing **and deleting** CSS rules hot-updates; editing a fragment `index.html`/`*.json` triggers a rebuild; editing a linked `@neptune/cx` file hot-updates.
- [ ] No `.mjs`/`.cjs`; no gradle tracked in the package repos.
