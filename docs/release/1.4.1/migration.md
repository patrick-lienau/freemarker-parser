---
repo: freemarker-parser
repo_type: npm-package
version: 1.4.1
previous_version: 1.4.0
source_commit_range: 25f5fc0..5a35307
generated: 2026-08-18
---

# freemarker-parser 1.4.1 Migration

A single tokenizer fix, no API change, nothing to edit. The one thing worth knowing is
that files which previously produced **zero** AST nodes — and were therefore invisible to
every lint rule — are now parsed and linted, so findings can appear in code that was never
being checked.

## Manifest

| # | ID | Level | Title | Human-gated |
|---|----|-------|-------|-------------|
| 1 | INFO-1 | INFO | Previously-unparsed files are now linted | — |

## Steps (execute in order — do not reorder or interleave)

### 1 · INFO-1 — Previously-unparsed files are now linted

No action required to take this version.

``Invalid `[` `` and `CloseMacro name cannot be empty` escaped the tokenizer rather than
being recovered per-token, so an affected file produced no nodes at all and every
AST-walking rule skipped it silently. Those files are now parsed, which means rules run
against them for the first time. Any findings are pre-existing issues becoming visible, not
regressions introduced here.

Files that produced zero nodes before this release, and now produce a real tree: aoc 4,
chroa 5, isa 1, cbdce 1. To see what changed before it reaches a build, run the linter with
the cache disabled:

```bash
cd <portal>/client-extensions/neptune-ui
npx neptune-cx validate-freemarker --no-cache
```
