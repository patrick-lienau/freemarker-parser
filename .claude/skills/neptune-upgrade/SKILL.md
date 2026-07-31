---
name: neptune-upgrade
description: Move a consumer portal onto newer Neptune library versions. Use this in a portal repo (isa-portal, chroa-portal, cbdce-portal, ay-portal, aoc-portal, …) when upgrading Neptune. It reads ~/.neptunerc, detects which Neptune libraries this portal actually pins (neptune-liferay via com.neptune.lpkg.version, neptune-gradle-plugins via com.neptune.plugins.version, @neptune/cx-tooling and @neptune/cx in the neptune-ui client extension), reviews each one's release notes, proposes coordinated target versions honoring cross-library requirements, then executes every migration document in order — applying required edits, offering improvements, and STOPPING at every ops step for human invocation. Produced by the create-neptune-release skill.
---

# Upgrade Neptune in a consumer portal

Run this **in a consumer portal** to move it from its currently pinned Neptune library
versions to newer ones, by executing the migration documents those libraries ship.

Neptune is several libraries, not one. This skill coordinates them: it only touches the
ones this portal actually pins, respects the requirements they declare on each other,
and runs their migrations in a single correctly-ordered pass.

> Release documents live in each library's own checkout under
> `docs/release/<x.y.z>/{changes.md,migration.md}`. Their **format** — the levels, the
> `### N · LEVEL-n — title` step structure, the field meanings, the `requires:` syntax —
> is defined in the **`create-neptune-release`** skill's
> `references/release-format.md`. Read that before executing steps; it is the contract
> you are acting on. (`neptune-liferay` additionally has older flat docs under
> `docs/migrations/` — see *Legacy documents* below.)

## ⚠️ The rules that govern this whole skill

These come from the release format and **override convenience**:

1. **Ops are never automatic.** At every **OPS-PRE / OPS-POST** step you **STOP**, show
   the human the exact command, and wait for them to run it (or tell you to) and
   confirm success. You draft and explain ops; the human invokes them. Never run a
   migration's `blade sh`, SQL, or deploy command on your own initiative.
2. **Order is significant.** Execute steps in their numbered order. Do not reorder,
   batch, or skip ahead — especially past an ops gate. Within a library, versions run
   in ascending order, each fully before the next.
3. **Respect every step's level** (REQUIRED apply, IMPROVEMENT offer, INFO relay, OPS-*
   human-gate). Honor a per-step instruction in the document over your own judgment.

## Steps

### 1. Preconditions — before reading a single version

**a. Make sure the registry is sound.** Invoke the **`/neptune-registry`** skill, then
read `~/.neptunerc` directly. (Routine reads don't go through that skill; you only
invoke it to create or repair the file.)

**b. Confirm this is a portal.** Look the current repo up in the registry. If it's
registered as `type: "library"`, **stop** — this skill upgrades portals. Point the user
at `/create-neptune-release` if they meant to cut a release.

**c. Check for local-dev / composite-build mode. This gate comes first for a reason.**
Run each library's `localModeCheck` from the portal root:

```bash
grep -qE '^com\.neptune\.lpkg\.local\.enabled=true'    gradle-local.properties
grep -qE '^com\.neptune\.plugins\.local\.enabled=true' gradle-local.properties
test -L client-extensions/neptune-ui/node_modules/@neptune/cx-tooling
test -L client-extensions/neptune-ui/node_modules/@neptune/cx
```

Any hit means the build is resolving that library from **local source**, so its pinned
version is fiction — bumping the pin changes nothing that runs. **Stop and report
which library is shadowed**, then let the user either disable local mode (unset the
flag, or `yarn neptune:unlink`) or explicitly accept a pins-and-docs-only run. Do not
discover this at the end.

**d. Check the portal's git state.** `git status --short`. If the tree is dirty,
recommend committing or stashing first, or working on a dedicated branch — mixing
pre-existing edits with upgrade edits makes `git checkout --` recovery ambiguous if a
step goes wrong.

### 2. Determine which libraries this portal actually consumes

Test each registered library's `consumerPin` against **this portal's** files:

```bash
grep -E '^com\.neptune\.lpkg\.version='    gradle.properties
grep -E '^com\.neptune\.plugins\.version=' gradle.properties
grep -E '^com\.neptune\.version='          gradle.properties   # legacy key
jq -r '.devDependencies["@neptune/cx-tooling"] // empty' client-extensions/neptune-ui/package.json
jq -r '.dependencies["@neptune/cx"]           // empty' client-extensions/neptune-ui/package.json
```

A library with **no pin here is not relevant** — skip it entirely, and never drag the
portal through its migrations. (`aoc-portal` pins only neptune-liferay, and via the
legacy key; `neptune-ui`-less portals consume neither npm package.)

A hit on a `legacyKeys` entry counts as consuming the library **and** flags the key
rename (`com.neptune.version` → `com.neptune.lpkg.version`) — raise it as an
IMPROVEMENT in step 4, don't silently rewrite it.

`freemarker-parser` is pinned by `neptune-cx-tooling`, not by portals; it is normally
irrelevant here.

### 3. Read current and latest versions

**Current** — from the portal's own files. Pins may be ranges, so extract the semver
rather than stripping operators:

```bash
jq -r '.devDependencies["@neptune/cx-tooling"]' client-extensions/neptune-ui/package.json \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
```

If a pin yields no parseable semver, **stop and report it** — don't guess at `^0.4` or
a tag-like value.

**Latest** — from the library's local checkout named in `~/.neptunerc`, **read-only**:

```bash
cd "$LIB_PATH"
git fetch --quiet origin
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD || echo origin/main)
git show "$DEFAULT:package.json" | jq -r .version      # or the repo's versionSource file
```

> **Never `git checkout` a library repo.** The user may be mid-feature-work there. At
> the time of writing, `neptune-cx` sits on a feature branch at `0.1.1` while
> `origin/main` is `0.2.0` — reading the working tree gives the wrong answer, and
> checking out a branch would clobber their state. Always `git show <ref>:<file>`.

**For `neptune-liferay`** (`defaultBranchIsBuildScoped: true`), versions are scoped to
a Liferay build. Resolve the branch matching this portal's build:

```bash
grep -E '^liferay\.workspace\.product=' gradle.properties    # e.g. portal-7.4-ga129
git -C "$LIB_PATH" branch -a | grep 'portal-7.4-ga129'
```

Read the version from **that** branch, not from `master`. If no branch or release
exists for this portal's build, **say so and stop** rather than proposing a version cut
from a different build's branch.

**Confirm it's actually published.** A tag can exist while the publish failed:

```bash
npm view @neptune/cx-tooling versions --json | tail -5        # npm libraries
```

For the Nexus-published libraries, check the artifact resolves. If a version is tagged
but unpublished, `yarn install` / Gradle resolution will 404 — flag it and don't
propose it.

### 4. Propose target versions

For each relevant library, read the candidate versions' release notes — cheaply, from
frontmatter only:

```bash
git -C "$LIB_PATH" show "v<version>:docs/release/<version>/changes.md" | head -20
```

`consumer_impact` and `headline` are what you need to summarize "is this worth taking."
Then present one table:

| Library | Current | Latest | Suggested | Impact | Note |
|---|---|---|---|---|---|
| neptune-gradle-plugins | 1.1.0 | 1.2.0 | 1.2.0 | config | — |
| neptune-cx-tooling | 0.7.1 | 0.8.0 | 0.8.0 | mixed | needs plugins ≥ 1.1.0 |

Use **AskUserQuestion** to accept the suggestions as a set, then one follow-up question
per library the user wants to change (suggested / stay / a specific version).

Then **validate `requires:`** across the chosen set. Gather the constraints from every
`migration.md` in each library's applied range — the effective `min` for a pair is the
**tightest** across the range, not just the target's, since a skipped intermediate
version's requirement still applies.

- A `hard: true` constraint unsatisfied by the chosen set → **refuse**, name the exact
  unsatisfiable constraint and the document it came from, and re-prompt.
- A `hard: false` constraint unsatisfied → mention it once in the plan; never block.
- Two hard constraints jointly unsatisfiable → **stop.** Present both with their source
  documents and ask which library's target to hold back. Do not resolve it silently.

### 5. Build one ordered plan

Order libraries in this fixed sequence, which already matches the real dependency
direction:

```
neptune-gradle-plugins  →  neptune-liferay  →  neptune-cx-tooling  →  neptune-cx
```

Versions ascend within each library. `requires:` is *validated* against the chosen
targets (step 4), not used to compute the order.

For each library, enumerate the versions in `(current, target]` that have a migration
document, and list every step from each in document order. Qualify step ids for
reporting so they're unique across the run: `<library>@<version>::<LEVEL-n>`, e.g.
`neptune-cx-tooling@0.8.0::REQ-1`. Ids are local to each document; you qualify them
here.

Show the user this consolidated checklist before changing anything — which libraries,
which versions, each step's number/id/level/title, and **which steps are human-gated**.
For `neptune-liferay`, skip steps whose `Builds:` excludes this portal's
`liferay.workspace.product` and say which you skipped.

### 6. Execute — one library at a time, pin first

For each library in order:

**a. Bump its pin, before applying its steps.** This ordering matters: a step's
`Verify` runs `./gradlew build` or `yarn install`, which resolve the *pinned* version.
Verifying before the bump tests the old dependency and proves nothing.

```bash
# gradle-property
sed -i '' 's/^com\.neptune\.plugins\.version=.*/com.neptune.plugins.version=1.2.0/' gradle.properties

# package-json-dep — preserve the existing range operator (^, ~, or exact)
cd client-extensions/neptune-ui
jq '.devDependencies["@neptune/cx-tooling"] = "^0.8.0"' package.json > package.json.tmp \
  && mv package.json.tmp package.json
yarn install
```

For the legacy `com.neptune.version` key, offer the rename to
`com.neptune.lpkg.version` as an IMPROVEMENT rather than doing it unasked.

**b. Walk its steps in order.** Read each version's document **from that version's
ref**, not from the branch tip:

```bash
git -C "$LIB_PATH" show "v<version>:docs/release/<version>/migration.md"
```

By level:

- **OPS-PRE / OPS-POST** — **STOP.** Present the step's `Command`, `Run when`, and
  `Success criteria`. Wait for the human to run it and confirm. Only then continue. On
  failure, surface the `Rollback` if given and hold — do not press on. A
  `./scripts/<file>` reference resolves against that version's release directory in the
  library checkout.
- **REQUIRED** — apply the edit. Use `Locate` to find **every** affected site, not just
  the first; make the `Change` at each; run `Verify`. For `Breakage: silent`, verify
  *behavior*, not just that it compiles. Report what changed.
- **IMPROVEMENT** — **offer** it with the stated benefit; apply only if the user
  accepts. Never silently apply.
- **INFO** — relay it. No action.

**c. Build / deploy boundaries.** Batch one Java build after the gradle-plugins and
neptune-liferay REQUIRED edits, and one client-extension build + deploy for the npm
side — rather than a build per version. **But never collapse a deploy that an OPS-POST
depends on.** If an intermediate version's ops assume their own deploy, say so and let
the human decide whether to deploy in between.

### 7. Check for drift introduced by the npm bumps

After `yarn install`, diff `yarn.lock` and call out any change **not** attributable to
the Neptune packages — a widened caret can pull unrelated transitive bumps in the same
install:

```bash
git diff --stat yarn.lock
git diff yarn.lock | grep -E '^[+-]' | grep -v '@neptune/' | head -30
```

### 8. Verify and summarize

Confirm each pin now reads its target, then report:

- Per library: current → target (or "unchanged").
- Every REQUIRED step applied, by qualified id.
- IMPROVEMENTs accepted and declined.
- **Every ops step and its outcome** — and flag any the human still needs to run.
- Any version in range that had **no** migration document (a gap you bumped past).
- Any local-mode / yarn-link state still shadowing a pin.
- Any unrelated `yarn.lock` drift.
- Whether the `neptune-liferay` bump also warrants re-syncing this portal's skills
  (`skillfish install`) — Neptune skills are authored in `~/dev/neptune-skills` and a
  library release often ships skill changes alongside.

Do **not** commit. Leave the changes in the working tree for the user to review, test,
and commit themselves.

## Legacy documents

`neptune-liferay` has flat per-version docs at
`docs/migrations/neptune-<major>-<minor>-<patch>.md` predating the
`docs/release/<x.y.z>/` layout (through 2.2.0). One rule handles them:

> For a version in range, if `docs/release/<version>/migration.md` is absent, look for
> `docs/migrations/neptune-<M>-<m>-<p>.md` and treat it **identically** — both carry
> the same Manifest table and `### N · LEVEL-n — title` step structure, so execution
> doesn't care which one it read. If both exist, `docs/release/` wins.

Legacy docs have **no `changes.md`**, so in step 4 use the legacy document's
orientation paragraph as that version's summary and treat its impact as unknown rather
than inventing a `consumer_impact`.

A version in range with **no document in either location** is a **warning and a
no-op**, not a failure: nothing to apply, bump past it, and record the gap in the
summary.

## When something is missing or wrong

| Situation | Do this |
|---|---|
| Library not in `~/.neptunerc`, or its `path` doesn't resolve | Invoke `/neptune-registry` to locate and register it. Still not found *and* the library is pinned here → stop and ask for the path. Not pinned here → skip silently. |
| No release/tag exists at or above the current pin | Report "no upgrade available for `<library>`" and move on to the next library. Not an error. |
| Requested version has no tag in the checkout | The release may be unpushed (see the discoverability contract in `create-neptune-release`). Report it and don't propose that version. |
| Portal's Liferay build isn't in a doc's `builds_covered` | Skip that step and say so. If an entire version excludes this build, ask whether to skip the version or proceed anyway. |
| A REQUIRED step's `Verify` fails | Stop. Show the output. Offer to retry, or to mark the step failed and continue — and flag it in the summary either way. Never mark a failed step as done. |
| Library checkout is mid-feature-work | Fine — you only ever read published refs with `git show`. Note the branch in the summary; never check anything out. |

## Verify

- Every relevant pin equals its target version, in the right file, with its original
  range operator intact.
- The portal builds cleanly against the new versions.
- Every REQUIRED step's `Verify` passed; no ops step ran without explicit human
  invocation; no step was skipped except those excluded by `Builds:` or reported as
  gaps.
- No library checkout changed branches or working-tree state.
