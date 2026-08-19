---
repo: freemarker-parser
repo_type: npm-package
version: 1.4.0
previous_version: 1.3.0
source_commit_range: cba1b76..c4bddc0
generated: 2026-08-18
---

# freemarker-parser 1.4.0 Migration

No API changed, so taking this version is a pin bump with no code edits to the parser's
callers. The work it creates is downstream and one-directional: because blocks that used to
collapse now nest correctly, any AST-walking consumer — in practice
`@neptune/cx-tooling`'s FreeMarker linter — sees template code it previously skipped, and
pre-existing issues in that code can surface as new findings. Expect to triage a small
number of them per portal (`REQ-1`). There are no ops steps and no cross-library
requirements.

## Manifest

| # | ID | Level | Title | Human-gated |
|---|----|-------|-------|-------------|
| 1 | REQ-1 | REQUIRED | Re-lint every portal and resolve newly visible FreeMarker findings | no |
| 2 | IMP-1 | IMPROVEMENT | Retire workarounds that avoided the AST | no |
| 3 | INFO-1 | INFO | What now parses that did not before | — |
| 4 | INFO-2 | INFO | What still does not parse | — |

## Steps (execute in order — do not reorder or interleave)

### 1 · REQ-1 — Re-lint every portal and resolve newly visible FreeMarker findings

- **Breakage:** runtime — the consumer builds, but `neptune-cx validate-freemarker` (which
  runs automatically before `build-fragments` and `build-ddm-templates`) can now fail on
  templates it previously passed. The findings are pre-existing bugs made visible, not
  regressions introduced here.
- **What changed:** a parse error used to discard the enclosing node and re-parent its body,
  so whole blocks vanished from the AST and every rule that walks it silently skipped them.
  With those blocks intact, `no-undefined-variable` and `require-default-on-nullable-call`
  now analyse code they never reached.
- **Locate:** run the linter with the cache disabled in each consumer portal — a cached
  result predates this change and will not re-report:

  ```bash
  cd <portal>/client-extensions/neptune-ui
  npx neptune-cx validate-freemarker --no-cache
  ```

  Do this for every portal that takes the new `@neptune/cx-tooling`, not just one: the
  affected templates differ per portal.

- **Change:** for each new finding, decide between two options — do not batch-suppress.
  1. **Fix the template** when the finding is a real defect. Verified example from
     isa-portal: in `src/fragments/content/isa-sponsor-block/index.html`,
     `fragmentElementId` is assigned only inside `[#if sponsorArticle?has_content]`
     (line 97) but used at lines 328 and 331 inside `[#if showOptIn]`, which is assigned at
     lines 57/90 and is not guarded by it — so a configuration with the opt-in shown and no
     sponsor article fails to render.
  2. **Suppress it** when the finding is genuinely unreachable, using `@neptune/cx-tooling`'s
     `@ftlignore` mechanism — available in whichever cx-tooling release carries this parser
     (unreleased at the time of writing; check its `docs/consumers.md`):

     ```html
     [#-- @ftlignore:next-line no-undefined-variable --]
     ```

- **Verify:** `npx neptune-cx validate-freemarker --no-cache` exits 0, or reports only
  findings you have consciously accepted.
- **Notes:** the count is small in practice — two findings across isa-portal's 146 files.
  Do this before cutting the `@neptune/cx-tooling` release that carries this parser, so
  portals do not discover it at build time.

### 2 · IMP-1 — Retire workarounds that avoided the AST

- **Benefit:** consumers that hand-rolled their own scanning because the AST could not be
  trusted for structure can now use the parser directly, dropping a parallel implementation.
- **Locate:** in `@neptune/cx-tooling`, code that scans FreeMarker source with regexes or a
  bespoke tokenizer instead of `parseFtl()`:

  ```bash
  rg -n 'lfr-drop-zone|tokenize|\[<\]#' src/freemarker
  ```

  As of this release the known case is `src/freemarker/dropzones.ts`, which backs the
  `no-orthogonal-drop-zones` rule. It was written against its own bracket scanner precisely
  because a collapsed `[#list 0..n as i]` turned a loop-generated drop zone into what looked
  like a fixed one — a silent false negative on a defect class that corrupts stored page
  content.
- **Change:** rebuild the analysis on `parseFtl()` / `walk()` from `src/freemarker/parse.ts`.
  The emission-tree and sequence-set logic is substrate-independent; only tree
  *construction* changes.
- **Verify:** the rule still reports exactly five findings in isa-portal
  (`isa-featured-content-hero`, `isa-search-layout`, `isa-latest-comic`,
  `isa-header-nav-item`, `isa-slide-menu`) and none of the 37 prefix-safe fragments — in
  particular not the loop-driven five, `isa-flyout-menu`, or `isa-sidebar`. Evidence for
  every case is in isa-portal's `docs/tasks/ISA-1529/AUDIT.md`.

### 3 · INFO-1 — What now parses that did not before

No action. For reference when reading an AST or a diff of lint results:

| Source | Before | After |
|---|---|---|
| `[#list 1..3 as i]X[/#list]` | `Unexpected period`, `Unexpected close tag 'List'`; the `List` node is gone and `X` is top-level | one `List` node containing `X` |
| `0..n-1` | — | `0 .. (n - 1)` |
| `seq[5..]` | — | postfix `UnaryExpression`, operator `..` |
| `<#ftl>` | `Assign require params` | parses, no params |
| `[@macro … /]` | `Unclosed tag 'MacroCall'` + a cascading `Unexpected close tag` per enclosing block | a `MacroCall` node with no body |
| `[#assign x /]` | captured a body | captures no body |

### 4 · INFO-2 — What still does not parse

No action. Remaining gaps, in descending order of how often they appear across the portals:

- `Invalid \`[\`` and the legacy `#foreach` directive — aoc only.
- `#continue` and `#sep` are absent from the `Directives` map (`Unknown token …`).
- `CloseMacro name cannot be empty` — a `[/@]` close with no macro name, which FreeMarker
  permits.

Each is a separate, smaller fix. None blocks any portal today; after this release
isa-portal is at 8 files with parse errors, down from 80.
