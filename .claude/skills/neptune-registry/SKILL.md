---
name: neptune-registry
description: Create, validate, and repair ~/.neptunerc — the machine-local JSON registry of Neptune repo paths, version-file locations, and consumer-pin metadata that create-neptune-release and neptune-upgrade both read. Use when ~/.neptunerc is missing, when a registered path no longer exists, when a Neptune repo (neptune-liferay, neptune-gradle-plugins, neptune-cx-tooling, neptune-cx, freemarker-parser, or a consumer portal) needs registering or relocating, or when another skill reports it cannot locate a Neptune repo.
---

# The Neptune registry (`~/.neptunerc`)

`~/.neptunerc` is a single machine-local JSON file recording, for every Neptune
library and consumer portal on this machine: **where it is**, **where its version
lives**, **how a consumer pins it**, and **how to tell whether local-dev mode is
shadowing that pin**.

It exists so no skill has to guess `../neptune-cx-tooling` or hardcode which file
holds which version. It is machine-local and **never committed** — paths are
specific to this checkout layout.

> **Other skills read this file directly** (`jq`, `Read`). Invoke *this* skill only
> to **create or repair** it. Don't route routine reads through here.

## The schema

```json
{
  "schemaVersion": 1,
  "repos": {
    "<repo-name>": { ... }
  }
}
```

Keyed by repo name, so the map itself dedupes. `schemaVersion` is informational —
there is no migration engine. If the shape ever needs to change, hand-edit the
handful of entries.

### A `library` entry

```json
"neptune-liferay": {
  "type": "library",
  "path": "/Users/patrick.lienau/dev/neptune-liferay",
  "releaseSkill": null,
  "defaultBranchIsBuildScoped": true,
  "versionSource": {
    "kind": "gradle-properties",
    "file": "gradle.properties",
    "key": "version",
    "buildSpecifierSuffix": true
  },
  "consumerPin": {
    "kind": "gradle-property",
    "file": "gradle.properties",
    "key": "com.neptune.lpkg.version",
    "legacyKeys": ["com.neptune.version"]
  },
  "localModeCheck": "grep -qE '^com\\.neptune\\.lpkg\\.local\\.enabled=true' gradle-local.properties",
  "docsDir": "docs/release",
  "legacyDocsDir": "docs/migrations"
}
```

| Field | Meaning |
|---|---|
| `type` | `library` or `portal`. |
| `path` | Absolute path to the local checkout. |
| `releaseSkill` | Name of the repo's own publish skill (commit/tag/publish), or `null`. `create-neptune-release` offers to hand off to it. |
| `defaultBranchIsBuildScoped` | Only `neptune-liferay`. Its branches are per-Liferay-build (`portal-7.4-ga129`, `portal-7.4-ga132`, …), so "latest" must be read from the branch matching the consumer's `liferay.workspace.product`. |
| `versionSource` | Where this repo's **own** version lives. See kinds below. |
| `consumerPin` | How a **consumer** pins this library. See kinds below. |
| `localModeCheck` | A shell command, run **from the consumer's root**, that exits 0 when local/composite-dev mode is active. When it fires, the pin is inert — the build is using local source. |
| `docsDir` | Where release docs live (`docs/release/<x.y.z>/`). |
| `legacyDocsDir` | Only `neptune-liferay`: the pre-`docs/release` flat migration docs. |

**`versionSource.kind`** — exactly three:

| kind | Read it with | Notes |
|---|---|---|
| `gradle-properties` | `grep -E '^<key>=' <file>` | `neptune-liferay`. With `buildSpecifierSuffix: true` the value is `2.2.0-portal-7-4-ga129`: semver is everything before the first `-`; **the suffix must be preserved verbatim on a bump.** |
| `gradle-literal` | `grep -E "^version\s*=" <file>` | `neptune-gradle-plugins` — a Groovy `version = '1.1.0'` line in `build.gradle`. |
| `package-json` | `jq -r .version <file>` | The three npm repos. |

**`consumerPin.kind`** — exactly two:

| kind | Detect / read | Write |
|---|---|---|
| `gradle-property` | `grep -E '^<key>=' gradle.properties` (also try each `legacyKeys` entry) | `sed` the key's value |
| `package-json-dep` | `jq -r '.<section>["<depName>"] // empty' <file>` | `jq` the same path; **preserve the existing range operator** (`^`, `~`, or exact) |

### A `portal` entry

```json
"isa-portal": { "type": "portal", "path": "/Users/patrick.lienau/dev/isa-portal" }
```

That's all. **No `consumes` list** — `neptune-upgrade` detects which libraries a
portal consumes live, by testing each library's `consumerPin` against the portal's
own files. A cached list would go stale the moment someone adds or drops a pin.

Add `"notes": "..."` freely (e.g. `aoc-portal` still uses the pre-split
`com.neptune.version` key).

## Creating the file

If `~/.neptunerc` does not exist, write it with the five libraries and every portal
you can confirm on disk. Use `references/neptunerc-seed.json` in this skill
directory as the starting point — it is the known-good shape for all five libraries.
Verify each `path` exists (`test -d`) before including it, and drop entries you
cannot confirm rather than writing a path that doesn't resolve.

Then sanity-check that each declared `versionSource` actually reads a version:

```bash
grep -E '^version=' ~/dev/neptune-liferay/gradle.properties          # 2.2.0-portal-7-4-ga129
grep -E "^version\s*=" ~/dev/neptune-gradle-plugins/build.gradle     # version = '1.1.0'
jq -r .version ~/dev/neptune-cx-tooling/package.json                 # 0.7.1
```

If one comes back empty, the descriptor is wrong — fix it now, not at release time.

## Registering the current repo

```bash
# Name: prefer the git remote (stable across directory renames), else the dir name.
NAME=$(git remote get-url origin 2>/dev/null | sed -E 's#.*/##; s/\.git$//')
[ -z "$NAME" ] && NAME=$(basename "$PWD")
```

**Type** is derived, not assumed:

1. Does this repo *look like* a registered library? Check the library's expected
   version file for its identity — `jq -r .name package.json` equals
   `@neptune/cx-tooling`, or `gradle.properties` has `artifact=neptune-library`, or
   `build.gradle` declares `group = 'com.neptune.plugins'`. A match ⇒ `library`
   (this is the "known library, freshly cloned to a new path" case — update `path`
   rather than adding a second entry).
2. Otherwise, test **every** registered library's `consumerPin` against this repo. Any
   hit ⇒ `portal`. Because this loop is driven by the registry, adding a sixth
   library automatically teaches it to recognize that library's consumers.
3. **Zero hits ⇒ do not register.** Say so plainly and stop: *"`<name>` references no
   known Neptune library — not registering."* `diojoliet-portal` and `iuoe399-portal`
   are exactly this case. A non-Neptune repo in the registry is worse than absent.

A hit only on a `legacyKeys` entry still registers the portal, but add a `notes`
field recording the legacy key — `neptune-upgrade` will offer the key rename as an
IMPROVEMENT.

## Locating a missing library

When another skill needs a library whose entry is absent, or whose `path` fails
`test -d`, search in this order and **confirm identity** before trusting any hit:

```bash
LIB=neptune-cx-tooling

# 1. Sibling of the current repo — matches every documented default.
test -d "../$LIB" && echo "../$LIB"

# 2. Alongside repos already in the registry.
jq -r '.repos[].path' ~/.neptunerc | xargs -n1 dirname | sort -u | while read -r root; do
  test -d "$root/$LIB" && echo "$root/$LIB"
done

# 3. Bounded find under those same roots. Never unbounded, never into node_modules.
find "$root" -maxdepth 2 -type d -name "$LIB" \
  -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null
```

**Confirm** with the identity check from step 1 of the previous section — a directory
name alone is not proof (a stray demo checkout would false-positive). Only write the
entry once the version file's contents match.

**Not found:**

- **Needed by the current task** — one clear blocking message naming the library and
  every path tried, then ask the user for the path. Never clone, never guess. This
  blocks that one library, not the whole run.
- **Not pinned by the repo being worked on** — skip silently. No message.

## Write discipline

This file is shared mutable state: two skills write it and a human may hand-edit it.

- **Read fresh, patch one key.** Read the whole file immediately before writing,
  change only the `repos["<name>"]` object (or the single field) this operation is
  about, and leave every other entry untouched.
- **Preserve unknown fields.** Never strip a key you don't recognize — hand-added
  notes and future fields must survive a skill-driven update.
- **Idempotent.** Registering an already-correct repo is a no-op. Say "already
  registered, no changes" rather than rewriting identical content.
- **Stale `path` → relocate, don't delete.** Re-run the locate flow using that
  library's identity check. Found ⇒ update `path` and report what moved. Not found ⇒
  leave `path` as-is, set `"pathStale": true`, and treat the library as not-found for
  the caller. Never silently hand out a dead path.
- **Name/path collision.** If the current repo's derived name has no entry but its
  absolute path matches an entry under a *different* name, don't create a duplicate —
  ask the user whether to rename the existing key or treat it as a distinct repo.

## Out of scope

`neptune-skills` (the repo these skills are authored in) is **not** registered. It is
distribution tooling, not a versioned dependency a portal pins — nothing reads a
version from it.

## Verify

- `jq -e '.schemaVersion and .repos' ~/.neptunerc` succeeds.
- Every `.repos[].path` passes `test -d`, or carries `"pathStale": true`.
- Every `library` entry's `versionSource` reads a non-empty version (commands above).
- No entry exists for a repo that references no Neptune library.
