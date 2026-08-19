---
repo: freemarker-parser
repo_type: npm-package
version: 1.4.2
previous_version: 1.4.1
source_commit_range: e614560..63e5af6
generated: 2026-08-18
---

# freemarker-parser 1.4.2 Migration

Two directives that previously produced `Unknown token` now parse. No API change and
nothing to edit — but `#sep` bodies in particular were absent from the AST entirely, so
rules that walk it will analyse that content for the first time.

## Manifest

| # | ID | Level | Title | Human-gated |
|---|----|-------|-------|-------------|
| 1 | INFO-1 | INFO | `#continue` and `#sep` bodies are now analysed | — |

## Steps (execute in order — do not reorder or interleave)

### 1 · INFO-1 — `#continue` and `#sep` bodies are now analysed

No action required to take this version.

An unknown directive is skipped by the parser, so the node — and, for `#sep`, everything
inside it — never reached the AST. Lint rules that walk the tree therefore never saw that
content. It is now present, so findings can appear inside `#sep` blocks that were
previously invisible. Any such finding is a pre-existing issue becoming visible, not a
regression.

To see what changed before it reaches a build:

```bash
cd <portal>/client-extensions/neptune-ui
npx neptune-cx validate-freemarker --no-cache
```

`--no-cache` matters — a cached result predates this change and will not re-report.
