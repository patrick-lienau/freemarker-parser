---
name: create-neptune-release
description: Cut a new release of a Neptune LIBRARY repo — neptune-liferay, neptune-gradle-plugins, neptune-cx-tooling, neptune-cx, freemarker-parser, or any repo registered in ~/.neptunerc as type "library". Bumps the repo's own version file, reviews the commit range since the last release, and writes docs/release/<x.y.z>/changes.md (release notes) plus migration.md (the agent-actionable consumer checklist), including any cross-library version requirements, then offers to hand off to the repo's configured releaseSkill for commit/tag/publish. Do NOT use this in a consumer portal (isa-portal, chroa-portal, cbdce-portal, ay-portal, aoc-portal, …) — to move a portal onto newer Neptune versions, use the neptune-upgrade skill instead.
---

# Cut a Neptune library release

Run this **in a Neptune library repo** when you are releasing changes that consumers
will have to reckon with. It produces `docs/release/<x.y.z>/` containing release notes
and a migration checklist written for an **agent** to execute later via
`neptune-upgrade`.

> **The format is defined once, in [`references/release-format.md`](references/release-format.md)**
> (in this skill directory). Read it before authoring — it is the authoritative
> structure for both files, the level definitions, the field reference, and the
> `requires:` syntax. This skill is about *how to gather the right content*; that file
> is *what to emit*.

## ⭐ What these documents are for

**`migration.md` answers: "what must a consumer DO?"** It is not a changelog. Capture
consumer-visible breaks and genuinely useful new capabilities; skip internal
refactors, test churn, and cosmetics. A tight doc with precise `Locate`/`Change` steps
beats hundreds of lines about things no consumer can observe.

**`changes.md` answers: "should I take this version?"** `neptune-upgrade` reads its
frontmatter across *every* candidate version of *every* library to propose targets, so
`consumer_impact` and `headline` must be accurate even when the body is brief.

## Steps

### 1. Confirm this is a library repo, and find its metadata

Read `~/.neptunerc` and look up the current repo (by `git remote get-url origin`
basename, else the directory name).

- **Not in the registry, or the registry doesn't exist** → invoke the
  **`/neptune-registry`** skill to add it, then re-read the file.
- **Registered as `type: "portal"`** → **stop.** This skill releases libraries. Tell
  the user to use `/neptune-upgrade` if they meant to move a portal onto new versions.

From its entry you need `versionSource` (where this repo's version lives), `docsDir`
(normally `docs/release`), and `releaseSkill` (for step 7).

### 2. Determine the version being released — and bump it

Read the current version per `versionSource.kind`:

```bash
# gradle-properties (neptune-liferay) — value is semver + build specifier
grep -E '^version=' gradle.properties          # 2.2.0-portal-7-4-ga129

# gradle-literal (neptune-gradle-plugins)
grep -E "^version[[:space:]]*=" build.gradle   # version = '1.1.0'

# package-json (the npm repos)
jq -r .version package.json                    # 0.7.1
```

For `buildSpecifierSuffix: true` (neptune-liferay only), split the value: semver is
everything before the first `-`; the suffix (`portal-7-4-ga129`) is the *branch's*
Liferay build. **The suffix is preserved verbatim on the bump** and is never part of
the release identity or the `docs/release/<x.y.z>/` directory name.

**This skill writes the bump.** The `releaseSkill` (step 7) only tags what is already
in the working tree — it makes no version decision. The bump has to happen here
because the docs live in a directory named after the target version and record it in
their frontmatter.

**Ask the user for the bump kind** (major / minor / patch) with AskUserQuestion. Offer
a suggestion informed by step 4's review ("the range contains a breaking change to a
public export → suggest minor") but **do not infer it silently** — these libraries are
loosely semver and pre-1.0 in places, so "breaking ⇒ major" is not a rule here.

Write the bumped value back through `versionSource`, then:

> **⚠️ Hard stop.** Show the new version, the file and line written, and the release
> directory about to be created. Get explicit confirmation before writing any docs.

### 3. Pick the start commit — and STOP for approval

The range to review is `<start>..HEAD`, where `<start>` is the commit that released
the **previous** version. Try these in order and take the first that yields a
candidate:

1. **The previous version's git tag** — highest confidence.
   ```bash
   git tag -l "v<previous-version>"          # e.g. v0.7.1
   git rev-list -n 1 "v<previous-version>"
   ```
2. **The commit that added the previous release directory** — reliable for any repo
   that has used this format at least once, tag or no tag.
   ```bash
   git log --diff-filter=A --format=%H -- "docs/release/<previous-version>/migration.md" | tail -1
   ```
3. **A version-mentioning commit message** — the legacy fallback. Needed for repos
   with neither tags nor prior release dirs (as of this writing, `neptune-cx`).
   ```bash
   git log --oneline -40 | grep -iE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head
   ```
4. **Ask the user** if none of the above produce a candidate.

> **⚠️ Hard stop.** Present the candidate as **short hash + full message** (and how
> you found it, e.g. "from tag `v0.7.1`"), then ask the user to **approve it or supply
> a different start commit**. Review and write nothing until they answer. A tag can be
> stale or mistaken — show it anyway.

`HEAD` is fine while you're actively reviewing (`git log --oneline <start>..HEAD`) —
but **resolve it before writing anything down.** Run `git rev-parse HEAD` and record
that fixed hash. The `source_commit_range` written into `migration.md`'s frontmatter
in step 7 must end in this resolved hash, **never** the literal token `HEAD`: `HEAD`'s
meaning is relative to whenever it's read, so a range ending in `HEAD` silently drifts
the moment another commit lands on the branch — it stops describing what was actually
reviewed. `source_commit_range` is a historical record; it must be reproducible from
the doc alone, at any point in the future.

### 4. Review the range for consumer impact

```bash
git log --oneline <start>..HEAD
git diff <start>..HEAD --stat
```

For each change ask **"does a consumer have to do anything, and what?"** Classify:

- **Public surface changes** → almost always **REQUIRED**. Note the `Breakage:` —
  `compile` if it fails to build, `runtime`/`silent` if it builds but behaves
  differently, `config` if the edit is to a config file.
- **Config / property changes a consumer must mirror** → **REQUIRED**,
  `Breakage: config`.
- **Data / index / runtime actions** → **OPS-PRE** or **OPS-POST** (step 6).
- **New capabilities that don't force an edit** → **IMPROVEMENT** (worth adopting) or
  **INFO** (heads-up).
- **Internal-only** (refactors, tests, private helpers, docs) → **omit.**

**What counts as "the public surface" depends on the library.** Use the row matching
`repo_type`:

| `repo_type` | Public consumer surface | Useful `Locate` starting points |
|---|---|---|
| `liferay-osgi` (neptune-liferay) | Exported OSGi packages; public classes/methods in `neptune-common-*`, `neptune-collections`, `neptune-ui-template-helpers`; Service Builder APIs; OSGi config keys/categories; FreeMarker template-helper variable names | `Export-Package` in `bnd.bnd`; `rg -l 'implements Neptune'`; config interfaces; `docs/module-index.md` |
| `gradle-plugin` (neptune-gradle-plugins) | Plugin IDs (`com.neptune.plugins.*`); extension DSL blocks (`neptuneExt`, `neptuneTaskCascade`, `neptuneSerialTasks`); task names; required `settings.gradle` / `build.gradle` wiring | `rg -n "id = 'com.neptune.plugins"` in `build.gradle`; `rg -n 'class.*Extension' src/main/groovy`; diff `docs/consumers.md`'s code fences against the source |
| `npm-package` — CLI (neptune-cx-tooling) | `neptune-cx` CLI subcommands; `neptune.config.js` schema (`DEFAULT_CONFIG` keys); generated token SCSS variable *shape*; FreeMarker lint rule ids and options; `client-extension.yaml` requirements; consumer `package.json` script wiring | `src/cli.js` subcommand table; `constants.ts` `DEFAULT_CONFIG`; the lint rule registry; `docs/consumers.md` |
| `npm-package` — runtime lib (neptune-cx) | Subpath exports (`@neptune/cx/utils`, `/registry`, `/portlet-registry`) and their exported signatures | `package.json` `exports` + `typesVersions` (both autogenerated from `src/*.ts`); `rg -n 'export (function\|const\|class)' src/*.ts` |
| anything else | **No row → fall back:** diff the declared public exports between `<start>` and `HEAD` using whatever the language offers (`exports` map, `Export-Package`, public declarations). If it's genuinely ambiguous, **ask the user** what a consumer of this repo imports, calls, or configures. | — |

That last row is the designed behavior, not a punt: the table is a set of shortcuts
for known repos, not a closed enumeration. A sixth library needs at most a new row —
never a change to these steps.

### 5. Detect and propose cross-library requirements

**Do not skip this step, and do not leave it thin.** `requires:` is the only
mechanism `neptune-upgrade` has for sequencing a multi-library bump correctly — a
missing or incomplete entry doesn't just under-document the release, it lets the
upgrade skill apply this version against a sibling library that's actually too old,
silently, for every consumer of this release from here on. Treat scanning for
requirements as mandatory for every release, not an optional nicety to reach for only
when a dependency bump is obviously visible in the diff.

Don't rely on remembering this. Scan the range for evidence that this release now
depends on another Neptune library:

```bash
# npm: a new or raised @neptune/* dependency
git diff <start>..HEAD -- package.json | grep -E '^\+.*"@neptune/'

# Java: new imports from another Neptune package
git diff <start>..HEAD -- '*.java' | grep -E '^\+import com\.neptune\.'

# Gradle: new plugin ids or version constraints
git diff <start>..HEAD -- '*.gradle' | grep -E '^\+.*com\.neptune'
```

For each hit, propose a `requires:` entry — `min` = the version of that library known
to work (normally its current released version), `hard: true` when the code genuinely
won't work below it, `hard: false` when it's a "works better at" situation. Present the
proposed block and let the user edit, add, or remove entries before it's written.

Go through **every** sibling library registered in `~/.neptunerc`, not just the one(s)
the grep commands above happen to surface — those patterns catch the common cases
(a new npm dep, a new Java import, a new plugin id) but not every way a release can
come to depend on another library's version (a behavior change relied upon, a schema
or format change, a minimum-version bump mentioned only in prose in a commit message).
If the range touches or discusses another library at all, decide explicitly whether
it warrants a `requires:` entry — don't let it fall out simply because it didn't match
a regex.

Every `requires.repo` must be a real key in `~/.neptunerc`. Omit the key entirely when
there are no constraints — never write `requires: []`.

### 6. Specify ops — and keep the human gate absolute

**The test for whether something is an op:** *does running this affect anything beyond
files on this machine?*

- **Yes** → it is **OPS-PRE** or **OPS-POST**, with `Command:`, `Run when:`, and
  `Success criteria:`. **Never** auto-run, in this skill or in `neptune-upgrade`.
- **No** → it can live inside a REQUIRED (or IMPROVEMENT) step's instructions and the
  upgrade agent may execute it directly.

So `yarn install`, a local `neptune-cx write-tokens`, or clearing a local Gradle cache
are **not** ops. A reindex, a bulk data rewrite, or anything that redeploys to a
shared Liferay instance **is**.

Where the op's implementation lives, by `repo_type`:

| `repo_type` | Ops delivery | Typically ops | Typically *not* ops |
|---|---|---|---|
| `liferay-osgi` | A custom OSGi command in `neptune-admin-shell`, package `com.neptune.admin.shell.migrations`, invoked with `blade sh`. Reusable, parameter-driven actions belong in `neptune-admin-ops`; the shell command is a thin wrapper. Scaffold with the **`/create-osgi-command`** skill. | Reindex, bulk re-save, field rewrite, service reconfiguration | — (Liferay actions are inherently shared-system) |
| `gradle-plugin` | A shell command in the step's `Command:` | Rarely anything — a plugin bump has no runtime side effects | Clearing `~/.gradle/caches/modules-*/files-*/com.neptune.plugins/` (local only) |
| `npm-package` | A shell command in `Command:`, usually the `neptune-cx` CLI | `neptune-cx deploy` / a client-extension republish; a token or fragment rebuild that lands on a shared instance | `yarn install`; a purely local `write-tokens` |

Because ops are human-gated and order-sensitive, each one must state `Run when:` (the
exact point in the sequence) and `Success criteria:` (what output or state confirms it
worked) so the human and the agent share an unambiguous gate.

Anything longer than a one-liner goes in `docs/release/<x.y.z>/scripts/` and is
referenced **relative to the release directory** (`./scripts/reindex-search.sh`).

### 7. Write both documents, then self-check

Lay the steps out in the **exact order they must be performed** — typically OPS-PRE →
REQUIRED edits → (consumer builds & deploys) → OPS-POST → IMPROVEMENT, but let the
real dependencies decide. Number them globally within the document; assign stable
`LEVEL-n` ids; build the Manifest to match. Follow
`references/release-format.md` field-for-field.

Make every actionable step **executable without guesswork**:

- `Locate:` — searches that surface *every* affected site in a consumer, not one
  example.
- `Change:` — the precise edit: a before/after snippet or an old → new rename map.
- `Verify:` — the check that proves it took (a compile target, a grep that should
  return nothing, a test).

Then check:

- Every **REQUIRED** step has a `Breakage:` tag, a real `Locate`, a concrete `Change`,
  and a `Verify`.
- Every **ops** step says `Requires human: YES` and has `Command`, `Run when`, and
  `Success criteria`.
- The **Manifest** matches the steps — same ids, same order, same human-gated flags.
- `version` / `previous_version` agree between `changes.md`, `migration.md`, and the
  directory name.
- `consumer_impact` in `changes.md` matches the highest level in `migration.md`.
- Every `requires.repo` is a real `~/.neptunerc` key.
- Every `./scripts/...` reference resolves to a file that exists.
- `builds_covered` is present only for `repo_type: liferay-osgi` — and is `[all]`
  unless a step genuinely behaves differently per Liferay build. For neptune-liferay,
  if a doc for this version **already exists** (another build's branch got there
  first), **merge into it — do not overwrite**: add only the steps this build
  introduces, fold shared changes into existing steps, and add this build's specifier
  to `builds_covered`.
- The internal churn is **left out**. If a step doesn't change what a consumer does or
  experiences, it's INFO at most — or cut it.

### 8. Offer the `releaseSkill` handoff

Everything so far is **uncommitted working-tree changes**. This skill **never commits,
tags, or pushes.**

Read the current repo's `releaseSkill` from `~/.neptunerc`:

- **`null`** → stop here. Tell the user the version bump and docs are ready and
  uncommitted, and that committing/tagging/publishing is theirs to do.
- **Set** → use **AskUserQuestion** to offer running it now ("Run `<releaseSkill>`
  now" / "Leave uncommitted for later"). **Do not auto-invoke it.**

If accepted, hand off with this contract — the stable interface any per-repo release
skill can implement against:

```json
{
  "repo": "neptune-cx-tooling",
  "version": "0.8.0",
  "previous_version": "0.7.1",
  "release_dir": "/Users/patrick.lienau/dev/neptune-cx-tooling/docs/release/0.8.0",
  "docs_committed": false,
  "requires": [{ "repo": "neptune-gradle-plugins", "min": "1.1.0", "hard": true }]
}
```

`docs_committed` is always `false` at handoff by construction; it's included so the
contract is self-describing. The release skill owns: staging and writing the commit
message, committing the version bump and docs **together as one commit**, creating the
annotated tag `v<version>` **on that commit**, pushing, and publishing to the registry.

> **The discoverability contract.** A release becomes visible to `neptune-upgrade`
> only once the version bump is **committed and pushed to the default branch** —
> the upgrade skill reads the pushed ref, never a dirty working tree. A
> bumped-but-unpushed tree is correctly invisible to consumers. Don't leave one lying
> around and expect a portal to see it.

## Verify

- `docs/release/<x.y.z>/` exists with `changes.md` and `migration.md`, and both
  frontmatter `version` values match the directory name.
- The repo's version file reads the new version — and for neptune-liferay, still
  carries its `-portal-…` build specifier.
- A fresh read of `migration.md` by someone with no other context could perform the
  upgrade: find the code, make the edits, and know exactly where to stop and call a
  human for ops.
