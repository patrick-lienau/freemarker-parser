# Neptune release-doc format

The authoritative structure for `docs/release/<x.y.z>/` in **any** Neptune library
repo. `create-neptune-release` emits exactly this; `neptune-upgrade` parses it. Do not
freelance the structure.

This contract lives **inside the skill** deliberately: it must be readable from
`neptune-cx`, `neptune-cx-tooling`, `neptune-gradle-plugins`, and `freemarker-parser`,
none of which have a path to `neptune-liferay`.

## Layout

```
docs/release/<x.y.z>/
├── changes.md      # release notes — "should I take this version?"
├── migration.md    # the agent-actionable consumer checklist
└── scripts/        # optional; anything a migration step invokes
    └── reindex-search.sh
```

The **directory name carries the version**. Bare semver, no `v` prefix, no build
specifier: `docs/release/2.3.0/`, never `docs/release/v2.3.0/` or
`docs/release/2.3.0-portal-7-4-ga129/`.

**Git tags are `v<semver>`** (`v2.3.0`, `v0.8.0`). `neptune-upgrade` resolves a
version's docs by that tag, so the convention is load-bearing.

## `changes.md`

Its job is **triage**, not instruction: let a reader (human or agent) decide whether
to take this version without opening `migration.md`. `neptune-upgrade` reads the
frontmatter of every candidate version in one cheap pass, so keep the frontmatter
accurate even when the body is thin.

````markdown
---
repo: neptune-cx-tooling
version: 0.8.0
previous_version: 0.7.1
date: 2026-07-30
consumer_impact: mixed
headline: "DDM template git-sync watcher; drops Node 18"
---

# neptune-cx-tooling 0.8.0

One paragraph: what shipped, and whether a consumer should expect zero work, a
config touch, a code edit, an ops action, or several.

## Highlights

- The 2–4 things a consumer actually cares about.

## Added

- `build-ddm-templates` now watches `src/partials` in dev mode. _(INFO-1)_

## Changed

- `neptune.config.js` `fonts.familyMappings` now **replaces** rather than merges the
  defaults — see `REQ-1`. _(breaking)_

## Fixed

- …

## Deprecated / Removed

- Node 18 support. Minimum is now Node 22. _(REQ-2)_

## Cross-library requirements

_Rendered from `migration.md`'s `requires:` block — that frontmatter is the source of
truth._

| Library | Min | Hard? |
|---|---|---|
| neptune-gradle-plugins | 1.1.0 | yes |
````

**`consumer_impact`** is the one field read across every candidate:

| Value | Means |
|---|---|
| `none` | Nothing to do. INFO/IMPROVEMENT only. |
| `config` | A config/property file needs editing. |
| `code` | Source edits required. |
| `ops` | A human-gated admin/data action is required. |
| `mixed` | More than one of the above. |

It must match the highest level actually present in `migration.md`. Any REQUIRED step
⇒ at least `code` or `config`; any OPS-* step ⇒ includes `ops`; nothing but
INFO/IMPROVEMENT ⇒ `none`.

Section headings follow Keep-a-Changelog (`Added` / `Changed` / `Fixed` /
`Deprecated` / `Removed`) because it is a familiar, skimmable taxonomy. Omit empty
sections. A bullet may **cite** a migration step id in parens; it must never duplicate
that step's `Locate`/`Change` content.

## `migration.md`

The action checklist. Structure is unchanged from Neptune's long-standing migration
format — frontmatter, an orientation paragraph, a Manifest table, then numbered steps.

````markdown
---
repo: neptune-cx-tooling
repo_type: npm-package
version: 0.8.0
previous_version: 0.7.1
source_commit_range: 8c29c1a..f4e8a2b
generated: 2026-07-30
requires:
  - repo: neptune-gradle-plugins
    min: 1.1.0
    hard: true
---

# neptune-cx-tooling 0.8.0 Migration

One orientation paragraph: the headline of this upgrade and whether a consumer should
expect code edits, ops, or both.

## Manifest

| # | ID | Level | Title | Builds | Human-gated |
|---|----|-------|-------|--------|-------------|
| 1 | OPS-PRE-1 | OPS-PRE | Snapshot token output before regenerating | all | YES |
| 2 | REQ-1 | REQUIRED | `fonts.familyMappings` replaces instead of merging | all | no |
| 3 | REQ-2 | REQUIRED | Require Node 22 | all | no |
| 4 | IMP-1 | IMPROVEMENT | Adopt the `@icon` at-rule | all | no |
| 5 | OPS-POST-1 | OPS-POST | Rebuild and redeploy the client extension | all | YES |
| 6 | INFO-1 | INFO | Partials are now watched in dev | all | — |

## Steps (execute in order — do not reorder or interleave)

### 1 · OPS-PRE-1 — Snapshot token output before regenerating

- **Requires human:** YES — STOP. Present the command, wait for an explicit
  go-ahead, and confirm success before continuing.
- **What & why:** …
- **Command:** `./scripts/snapshot-tokens.sh`
- **Run when:** before applying REQ-1.
- **Success criteria:** what output/state confirms it worked.
- **Rollback:** how to undo. *(optional)*

### 2 · REQ-1 — `fonts.familyMappings` replaces instead of merging

- **Breakage:** silent
- **What changed:** one or two sentences on the change and why it matters.
- **Locate:**
  ```
  rg -n 'familyMappings' client-extensions/neptune-ui/neptune.config.js
  ```
- **Change:** the exact edit — before/after snippet, or an old → new rename map.
- **Verify:** the check that proves it took.
- **Notes:** edge cases. *(optional)*

### 4 · IMP-1 — Adopt the `@icon` at-rule

- **Benefit:** what the consumer gains. Framed as something to *offer*.
- **Locate / Change:** same form as a REQUIRED step.

### 6 · INFO-1 — Partials are now watched in dev

- A short note. No action.
````

### Levels

Every actionable step carries exactly one.

| Level | Meaning | Agent may auto-apply? |
|---|---|---|
| **REQUIRED** | The consumer won't compile, or will misbehave, without this. | **Yes** |
| **OPS-PRE** | Admin/data/ops action that must run **before** deploying. | **NEVER** — human-gated |
| **OPS-POST** | Admin/data/ops action that must run **after** deploying. | **NEVER** — human-gated |
| **IMPROVEMENT** | Optional; worth offering, not required to function. | Yes, **with consent** |
| **INFO** | Context only. | n/a |

REQUIRED steps also carry **`Breakage:`** — `compile` (won't build; self-revealing),
`runtime` (builds, throws/misbehaves), `silent` (builds and runs but behaves
differently — the most dangerous; verify *behavior*, not just the build), or `config`
(the edit is to a config/property file, not source).

### Two rules that override everything

1. **Ops are never automatic.** An agent **STOPS** at every OPS-PRE / OPS-POST step,
   presents the exact command, and waits for explicit human go-ahead — then confirms
   success before moving on. Agents draft and explain ops; humans invoke them.
2. **Order is significant.** Steps are listed in execution order and must not be
   reordered or interleaved. The leading number is that order. Ops gate the sequence:
   nothing proceeds past an unconfirmed op.

### ID scheme

- The **leading number** (`1 ·`, `2 ·`) is execution order **within this document**.
  Steps are not grouped by level — a REQUIRED step can sit between two ops steps if
  that's when it must happen.
- The **`LEVEL-n` id** (`REQ-1`, `OPS-PRE-1`, `IMP-1`, `INFO-1`) is **stable**: `n`
  counts within its level in authoring order and does **not** renumber when a step is
  inserted later. Ids are **local to this document** — `neptune-upgrade` qualifies
  them with repo and version at runtime. Never reuse or renumber one.

### Field reference

| Field | Used by | Purpose |
|---|---|---|
| `Builds:` | all steps | Only for `repo_type: liferay-osgi`. `all`, or a list like `[portal-7-4-ga129]`. Omit entirely for other repo types. |
| `Breakage:` | REQUIRED | `compile` / `runtime` / `silent` / `config`. |
| `Requires human:` | OPS-* | Always `YES`; restates the STOP rule. |
| `What changed:` / `What & why:` | actionable | The change, kept short. |
| `Locate:` | code/config | Searches that surface **every** affected site, not one example. |
| `Change:` | code/config | The precise edit: before/after or a rename map. |
| `Verify:` | code/config | How to confirm it took (compile, a grep that returns nothing, a test). |
| `Command:` | ops | The exact command, or a `./scripts/<file>` reference. |
| `Run when:` | ops | The precise point in the sequence. |
| `Success criteria:` | ops | What confirms the op worked. |
| `Rollback:` | ops *(optional)* | How to undo a failed op. |

## Frontmatter reference

| Key | Where | Notes |
|---|---|---|
| `repo` | both | Must match the repo's key in `~/.neptunerc`. |
| `repo_type` | `migration.md` | `liferay-osgi` \| `gradle-plugin` \| `npm-package`. Selects the surface/ops guidance. |
| `version` | both | Bare semver. Must equal the directory name. |
| `previous_version` | both | The version this migrates from. |
| `date` / `generated` | changes / migration | ISO date. |
| `headline` | `changes.md` | One line, quoted. |
| `consumer_impact` | `changes.md` | See the table above. |
| `source_commit_range` | `migration.md` | What was reviewed, as two resolved hashes, e.g. `8c29c1a..f4e8a2b`. **Never `HEAD`** — resolve it (`git rev-parse HEAD`) before writing, since `HEAD`'s meaning drifts with every later commit and the range must stay reproducible. |
| `requires` | `migration.md` | Cross-library constraints. See below. |
| `builds_covered` | `migration.md` | **Only** for `repo_type: liferay-osgi`; defaults to `[all]`. Omit for other types — a Liferay build specifier is meaningless for a plugin or npm package. |

## Cross-library requirements (`requires:`)

Constraints live in `migration.md` frontmatter, because a constraint is introduced
**by** a release and migration docs are the immutable per-version record. The
`changes.md` table is a rendered convenience copy.

```yaml
requires:
  - repo: neptune-gradle-plugins   # key as it appears in ~/.neptunerc
    min: 1.1.0
    hard: true
```

Exactly three fields. `hard` is an **explicit boolean**, never inferred from the
presence of `min` — an advisory-only entry (`hard: false`) is a legitimate thing to
express.

| | `neptune-upgrade` behavior |
|---|---|
| `hard: true` | **Block.** Do not apply this version until the named library is at ≥ `min` — either already, or by upgrading it earlier in the same session. |
| `hard: false` | **Recommend.** Surface it in the plan; never block. |

**Forward-only.** A release declares only what *it* needs from other libraries, never
what other libraries should need from it. If cx-tooling later needs a newer
gradle-plugins, that goes in cx-tooling's own next release — nobody retrofits
gradle-plugins' docs. This is why there is no direction field: both libraries are free
to declare a requirement pointing at the other, each in its own release history.

**Effective constraint** across a range is the **tightest `min`** from every doc being
applied, not just the target's — a skipped intermediate version's requirement still
applies if it was never satisfied on the way through.

Real examples:

```yaml
# neptune-cx-tooling docs/release/0.8.0/migration.md
requires:
  - repo: neptune-gradle-plugins
    min: 1.1.0
    hard: true
```

```yaml
# neptune-cx docs/release/0.2.0/migration.md
# Works with older cx-tooling, but the yarn-link HMR poll-watch path
# wasn't reliable before 0.7.0.
requires:
  - repo: neptune-cx-tooling
    min: 0.7.0
    hard: false
```

Omit the key entirely when there are no cross-library constraints. Do not write
`requires: []`.

## Resource files (`scripts/`)

- One file per distinct action; don't bundle unrelated ops together. Name it for the
  step it serves (`reindex-search.sh`, `SyncPartials.groovy`).
- A step references it **relative to the release directory**: `Command:
  ./scripts/reindex-search.sh`. Never relative to the repo root or cwd — the release
  directory is the one anchor the upgrade agent always has in hand, at any ref.
- Make shell scripts executable and idempotent where possible, and have them print
  something that satisfies the step's `Success criteria`.
