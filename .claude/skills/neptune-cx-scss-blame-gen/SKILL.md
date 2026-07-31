---
name: neptune-cx-scss-blame-gen
description: Build a neptune-cx client extension (via gradle, with the pinned Node) and generate a blame report bucketing every SCSS diagnostic emitted by the `neptune:scss` Vite plugin by the git author who last touched the offending line. Writes `docs/blames/<YYYYMMDDThhmmssZ>.md` in the consumer portal, with clickable file/line and commit links. Use when reviewing accumulated SCSS warnings (unresolved tokens, etc.) and you need to know who to talk to about each.
---

# /neptune-cx-scss-blame-gen

Produces a markdown report grouping SCSS build diagnostics by the developer who
last touched each offending line, so you can hand each author their own list to
fix.

## When to use

- Auditing SCSS warnings in a consumer portal that have piled up over time.
- After a token-pack rename, when many `Could not resolve the variable "$t-…"`
  warnings appear and you need to route them to the right people.
- Whenever the `neptune:scss` plugin's prod output reads as a wall of
  `[plugin neptune:scss] …` lines and you want them organized.

## What it does

1. **Builds the CE through gradle** (`gradlew :client-extensions:neptune-ui:packageRunBuild
   --rerun-tasks`) and captures stdout+stderr in memory for parsing. (Accepts
   `--ce <dir>`, `--builder`, and `--log <file>` — see below.)
2. **Guards against a crashed build.** Before parsing, it checks for positive
   proof the `neptune:scss` pipeline actually ran (a `[plugin neptune:scss]`
   line, vite's "N modules transformed", etc.). If the build crashed or was
   aborted *before* SCSS was processed and zero diagnostics were found, it
   writes a **"⚠️ BUILD FAILED"** report and exits nonzero — it never reports a
   broken build as a clean "🎉".
3. Parses every line carrying an absolute `<file>.scss:<line>:<col>` (the
   `neptune:scss` plugin appends this in prod). Each line is normalized first
   (ANSI escapes and vite's carriage-return progress overwrites stripped). The
   message on the same line (after the last `[plugin neptune:scss]` marker) —
   or the most recent non-empty line above it — is the diagnostic text.
4. Runs `git blame --porcelain` on each `file:line` to get the author, email,
   and commit hash. Cached per `file:line` to keep repeated diagnostics free.
5. Buckets diagnostics by author, de-duplicates identical
   (message, file, line, col) tuples, sorts everything for determinism, and
   writes `docs/blames/<YYYYMMDDThhmmssZ>.md`.

### Why gradle, not a bare `yarn build`

The Liferay gradle node plugin pins the Node version (root `build.gradle`
`nodeVersion`). A bare `yarn build` uses whatever Node is on `PATH` — and a
mismatched Node **crashes Vite before the `neptune:scss` plugin ever runs**,
producing empty output that looks identical to a clean build. Driving the build
through gradle guarantees the pinned Node and real output. `--rerun-tasks`
defeats gradle's `UP-TO-DATE` cache, which would otherwise also yield empty
output on a second run.

## How to run it (deterministic)

From anywhere inside the consumer portal:

```bash
node .claude/skills/neptune-cx-scss-blame-gen/blame-gen.js
```

That builds the CE through gradle, parses, blames, and writes the report. The
script prints the absolute path of the written `.md` on stdout (other progress
on stderr) so an agent can `cat` or open it next.

Exit codes:

- **0** — the build reached the SCSS pipeline. Diagnostics found → blame
  report; zero diagnostics → "🎉" report.
- **1** — the build crashed/aborted before the SCSS pipeline ran (a "⚠️ BUILD
  FAILED" report is still written; re-run the build directly to see the output).
- **2** — bad arguments.

### Options

| Flag                  | Default                          | Purpose                                                    |
| --------------------- | -------------------------------- | ---------------------------------------------------------- |
| `--ce <dir>`          | `client-extensions/neptune-ui`   | Path (relative to repo root) of the CE to build. The gradle project path is derived from it (`client-extensions/neptune-ui` → `:client-extensions:neptune-ui`). |
| `--builder <gradle\|yarn>` | `gradle`                    | How to build. `gradle` uses the pinned Node (recommended). `yarn` runs `yarn build` in the CE dir with `PATH`'s Node — only when you know it matches the pinned version. |
| `--log <file>`        | —                                | Parse a pre-captured build log instead of building. Use when iterating, or when the build can't run in the current environment. |

### Two-step variant (when running the build separately)

If you've already captured a build log (e.g. to keep the build output as a
separate artifact, or on a machine where `node` isn't available):

```bash
# 1. somewhere with the build environment (use the gradle task for pinned Node)
./gradlew :client-extensions:neptune-ui:packageRunBuild --rerun-tasks --console=plain 2>&1 | tee /tmp/scss-build.log

# 2. parse + blame from the portal root
node .claude/skills/neptune-cx-scss-blame-gen/blame-gen.js --log /tmp/scss-build.log
```

## Output format

```markdown
# SCSS blame — 20260630T073634Z

Generated by `neptune-cx-scss-blame-gen` from `gradlew :client-extensions:neptune-ui:packageRunBuild`. 17 diagnostics across 3 authors.

## Patrick Lienau <patrick.lienau@thirdwavellc.com>
  * Could not resolve the variable "$t-color-cbdce-blue-400" within "$t-color-cbdce-blue-400"
    [../../client-extensions/neptune-ui/src/fragments/layouts/cbdce-search-layout/styles.scss:321:13](../../client-extensions/neptune-ui/src/fragments/layouts/cbdce-search-layout/styles.scss#L321) ([ab7aa259](https://github.com/thirdwavellc/cbdce-portal/commit/ab7aa259796a5668ded608af8b9b6e6a57c949c7))
```

Specifics:

- **Filename:** `docs/blames/<YYYYMMDDThhmmssZ>.md` — UTC, stamped once at
  startup, so re-running the script produces a new file rather than mutating an
  old one.
- **File path:** relative to `docs/blames/` (i.e. `../../…`), with a
  `#L<line>` anchor — clickable in GitHub and editors that handle markdown
  file links.
- **Commit hash:** 8 characters (matches the abbreviation `git rev-parse --short`
  uses in this repo). Linked to the full commit on GitHub when `origin` is a
  GitHub remote.
- **Uncommitted lines:** rendered as `(uncommitted)` under the author
  `Not Committed Yet` — they exist locally but aren't in any commit.
- **No GitHub remote** (e.g. self-hosted): the short hash still renders, just
  un-linked.

## How an agent should drive it

1. Verify you're inside the consumer portal git repo (script self-checks too).
2. Run `node .claude/skills/neptune-cx-scss-blame-gen/blame-gen.js`. This builds
   the CE via gradle (pinned Node) and writes the report.
3. The last stdout line is the absolute path of the generated file. Check the
   exit code: a nonzero exit means the build failed before the SCSS pipeline
   ran (the report says "BUILD FAILED") — surface that rather than treating it
   as clean. On exit 0, open or summarize the report.
4. Do NOT post-process the markdown — the format is the contract. If the user
   asks for something different (group by file instead of author, etc.) edit
   the script, not the output.

## Implementation notes

The script (`blame-gen.js`) is a single Node program so behavior doesn't
depend on awk/sed/grep versions across platforms.

- **The build** runs through gradle (`packageRunBuild --rerun-tasks
  --console=plain`) with stdout+stderr captured in memory for parsing. Nonzero
  exit codes are not fatal — a build with SCSS errors still emits the
  diagnostics we want. The gradle project path is derived from `--ce`.
- **Build-failure guard:** the script requires positive proof the
  `neptune:scss` pipeline ran (a `[plugin neptune:scss]` line, vite's "N modules
  transformed", "built in", etc.). If that proof is absent and no diagnostics
  were parsed, it emits a "BUILD FAILED" report and exits 1 — so a crash (e.g.
  wrong Node version aborting Vite before SCSS) is never mistaken for clean.
- **Parser** anchors on `<abs-path>.scss:<line>:<col>`. Each log line is first
  normalized — kept only after the last carriage return (vite's progress
  spinner overwrites in place) and stripped of ANSI escapes — then the message
  is taken from the same line (after the last `[plugin …]` marker) when present,
  else from the most recent non-empty line above. This tolerates the two-line
  prod layout, single-line variants, and progress-polluted lines.
- **`git blame --porcelain`** is the source of truth — never `git log` /
  `git annotate` — because it returns author + email + hash atomically per
  line in a stable machine-readable format.
- **Determinism:** the only time-dependent value is the filename/header
  timestamp. Findings are de-duplicated and sorted; blame is cached per
  `file:line`.

## Syncing this skill into consumer portals

This skill is authored in the **`neptune-skills`** repo
(`~/dev/neptune-skills/.claude/skills/`) and distributed by **skillfish**, which
writes a *copy* into each consumer's `.claude/skills/neptune-cx-scss-blame-gen/`
(plus a `.skillfish.json` provenance file). Edit it in `neptune-skills` and re-sync
(`skillfish install` in the consumer) — a copy edited in place is silently
overwritten on the next sync.
