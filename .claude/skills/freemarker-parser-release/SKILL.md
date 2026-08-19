---
name: freemarker-parser-release
description: Build, test, commit, tag, push, publish, and GitHub-release a freemarker-parser version to Third Wave's private npm registry (never npmjs.org). Use this whenever /create-neptune-release hands off a release for freemarker-parser, or whenever the user asks to publish, ship, cut, tag, or release a new version of freemarker-parser / @neptune/freemarker-parser — even phrased casually, like "publish the parser" or "tag and ship this as a patch". Handles the exact build+test+commit+tag+push+publish sequence and verifies the registry that received it, so the mechanics aren't reinvented (or gotten wrong) release to release.
---

# freemarker-parser release (build, test, commit, tag, publish)

This skill is the **last mile** of a release: turning an already-bumped `package.json`
and an already-written `docs/release/<x.y.z>/` into a built, tested, committed, tagged,
pushed, published, and GitHub-released package. It does not decide a version number or
write release notes — that is **`/create-neptune-release`**'s job, run first. If
`package.json` hasn't been bumped, or `docs/release/<target-version>/` doesn't exist,
stop and run that skill rather than improvising a commit here.

This is a **repo-local** skill (lives in `freemarker-parser/.claude/skills/`, not
`~/dev/neptune-skills`) because its mechanics are specific to this repo's build and
registry. The shared skills that used to live here were removed in `792e5c2` once they
became a plugin; a per-repo release skill is the deliberate exception, the same way
`neptune-cx-tooling-release` lives in that repo.

## What makes this repo different from the other Neptune libraries

Three things the script guards, which the cx-tooling equivalent does not have to:

1. **`lib/` is the published artifact and it is git-ignored.** `package.json` `files`
   is `["lib"]`, and `lib/` is built by `tsc -b` from `src/`. So a publish that skips
   the build ships whatever happened to be on disk — stale output, or nothing at all.
   The script always rebuilds from a clean `lib/` before publishing.
2. **This repo has a real test suite** (~259 tests, ~176 snapshots). A parser
   regression is silent and downstream — it doesn't break this package, it changes the
   shape of the AST every consumer walks. Tests gate the release.
3. **The version bump may already be committed.** Unlike a clean
   `/create-neptune-release` handoff, parser work often lands the bump alongside the
   fix it belongs to. The script tolerates this: if there is nothing left to stage, it
   tags `HEAD` instead of failing.

## When this skill is invoked via handoff

`/create-neptune-release` step 8 hands off with a JSON contract shaped like:

```json
{
  "repo": "freemarker-parser",
  "version": "1.4.0",
  "previous_version": "1.3.0",
  "release_dir": "/Users/.../freemarker-parser/docs/release/1.4.0",
  "docs_committed": false
}
```

`docs_committed` is always `false` at handoff — that's what this skill exists to fix.
A `requires` array, if present, is informational context for the commit message; this
skill doesn't act on it (a consumer, not this repo, is what has to honor it). As a leaf
library, freemarker-parser normally has none.

If invoked directly by the user with no handoff contract, derive the same inputs
yourself: `version` is the current `package.json` version, and `docs/release/<version>/`
must already exist.

## Steps

### 1. Compose the commit message

Read `docs/release/<version>/changes.md` for its `headline` frontmatter field and
`## Highlights` section, and write a message that explains *why* the version moved:

```
Release 1.4.0: <headline>

<1-4 lines from Highlights, in prose>
```

Write it to a temp file (the scratchpad directory is fine) — the script takes the
message as a file, not an inline string.

### 2. Get explicit go-ahead before running the script

`git push`, `npm publish`, and `gh release create` are each either irreversible or
immediately visible to every consumer. A published version number can never be reused
on the registry. Before running the script, tell the user plainly: the version, the tag
name, that it pushes to `origin`, that it publishes to the private registry, and that
it opens a GitHub release. Wait for a clear yes.

### 3. Run the script

```bash
./.claude/skills/freemarker-parser-release/scripts/publish-release.sh <version> <msg-file>
```

Run it from the repo root. In order, it will:

1. Verify the message file and `docs/release/<version>/` exist, that `package.json` is
   already at `<version>`, that `publishConfig.registry` points at `thirdwavellc.com`,
   and that tag `v<version>` does not already exist locally or on `origin`.
2. Verify nothing is uncommitted outside `package.json` and `docs/release/<version>/`,
   so unrelated WIP can't be swept into the release commit.
3. **Rebuild `lib/` from scratch and run the full test suite.** Both happen *before*
   any commit, so a broken build never leaves a commit or tag behind.
4. `git add` + commit (or skip the commit and tag `HEAD`, if the bump and docs are
   already committed) + `git tag -a v<version>` + `git push origin HEAD --follow-tags`
   — in that order, so the tag exists on the remote before anything downstream (like
   `neptune-upgrade`, which resolves a version's docs by tag) goes looking for it.
5. `npm publish --userconfig "$HOME/.npmrc"`. The explicit `--userconfig` is required:
   this environment's npm otherwise reads a bundled runtime npmrc that does not carry
   the `@neptune:` registry mapping or its credentials.
6. `npm view <package> version` against the private registry, failing loudly if it
   doesn't now serve `<version>`.
7. `gh release create v<version>` with `changes.md` as the release notes, when `gh` is
   available and authenticated. Skipped with a warning otherwise — a missing GitHub
   release is cosmetic, and by this point the package is already published.

If a precondition fails, the script exits non-zero naming the problem. Fix the named
problem and re-run rather than working around the check.

### 4. Report back

State what happened: the version, the tag, that it's pushed, that the registry serves
it, and the GitHub release URL. Cite the script's own final `npm view` line as the
evidence that the publish landed — a zero exit from `npm publish` alone is not proof
the registry accepted it.

Then say what is **not** done: consumers still pin the old version. Bumping
`@neptune/cx-tooling`'s dependency (the only direct consumer) is a separate step, and
if anyone has this package `yarn link`ed, they are still on their working copy and will
not see the published version until they unlink.

## What this skill does not do

- Decide the version bump or write `changes.md` / `migration.md` — that's
  `/create-neptune-release`.
- Bump the dependency in `neptune-cx-tooling`, or unlink an active `yarn link` — those
  are consumer-side actions on their own schedule.
- Retry a failed publish. A failure partway (registry auth expired mid-run, say) can
  leave the repo committed, tagged, and pushed but not published — report exactly which
  steps completed and let the human decide. A blind re-run's `git tag` step would fail
  against the already-advanced state, which is the correct, safe outcome, not a bug.
