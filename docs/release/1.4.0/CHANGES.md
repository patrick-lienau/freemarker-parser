---
repo: freemarker-parser
version: 1.4.0
previous_version: 1.3.0
date: 2026-08-18
consumer_impact: code
headline: "Range operators, bare `<#ftl>`, and self-closing square tags all parse"
---

# freemarker-parser 1.4.0

Three parser bugs, each of which made a *structural* parse failure rather than a
contained one: the enclosing node was discarded and its body re-parented into the
surrounding block. A consumer walking the AST therefore saw a tree that was silently the
wrong shape — a `#list` body that looked like top-level content, or a `#if` that appeared
to close somewhere it did not. In `neptune-cx-tooling`'s FreeMarker linter, measured over
isa-portal, this took files with parse errors from **80 of 146 to 8 of 146**.

Nothing in the public API changed, so upgrading is a version bump. The work it creates is
downstream: AST-walking lint rules now see code they previously skipped, so pre-existing
issues in consumer templates can surface as new findings. Those are real bugs made
visible, not regressions — but they will fail a build, so budget for triaging them
(`REQ-1`).

## Highlights

- FreeMarker's range operators parse at last — `1..3`, `0..n-1`, `0..<10`, and the
  open-ended `seq[5..]`. _(INFO-1)_
- A bare `<#ftl>` no longer errors — it was failing on essentially every partial and DDM
  template in a portal. _(INFO-1)_
- Self-closing macro calls work in square-tag syntax: `[@macro … /]`. _(INFO-1)_
- Blocks that used to collapse now nest correctly, so consumers can retire workarounds
  built to avoid the AST. _(IMP-1)_

## Added

- The range operators `..`, `..<`, `..!` and `..*`, at FreeMarker's own precedence —
  between additive and relational, so `0..n-1` is `0..(n-1)` and `x..y > z` is
  `(x..y) > z`. `isRangeOp()` is exported from `enum/Operators`.
- The open-ended range (`seq[5..]`), parsed as a postfix `UnaryExpression` — it is the one
  binary operator FreeMarker permits with no right operand, which a precedence stack
  cannot represent.
- `utils/Tokens.ts` exporting `isSelfClosing(token)`.

## Fixed

- `<#ftl>` with no parameters raised `Assign require params`. Every `#ftl` attribute is
  optional, so a bare tag is valid — and `@neptune/cx-tooling`'s `require-ftl-directive`
  rule puts one atop every partial, so this failed on 49 files in isa-portal alone.
- `MacroCallNode` tested `token.endTag !== '/>'`, the angle-tag spelling. In square-tag
  mode the terminator list is `[']', '/]']`, so every `[@macro … /]` opened a body that was
  never closed — 14 `Unclosed tag 'MacroCall'` errors, cascading into 30
  `Unexpected close tag 'Condition'`.
- `[#assign x /]` no longer captures a body (same root cause).
- `parseNumericLiteral` no longer consumed the first `.` of a `..` as a decimal marker.
  `1.5..2.5` parses; a genuine second decimal marker (`1.2.3`) still errors.
- `parseVariable`'s member-access loop no longer read `start..end` as a member access on
  `start`.

## Compatibility

No breaking changes to the public API. All 230 pre-existing tests and all 174 pre-existing
snapshots pass unchanged; 29 tests, a `test/resource/valid/range.ftl` fixture and a
`test/self-closing-and-ftl.spec.ts` suite were added.

Files with at least one parse error, per portal, before and after:

| Portal | Files | Before | After |
|---|---|---|---|
| isa | 146 | 80 | **8** |
| chroa | 94 | — | 6 |
| cbdce | 47 | — | 2 |
| ay | 33 | — | 4 |
| aoc | 91 | — | 22 |

## Known limitations

What still fails to parse is unimplemented directives and two smaller tokenizer gaps —
`#continue`, `#sep`, the legacy `#foreach` (aoc only), `CloseMacro name cannot be empty`
(a `[/@]` close with no name, which FreeMarker allows), and ``Invalid `[` ``. None is
load-bearing for the portals today; each is a separate, smaller fix. _(INFO-2)_
