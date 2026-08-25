---
repo: freemarker-parser
version: 1.4.1
previous_version: 1.4.0
date: 2026-08-18
consumer_impact: none
headline: "Two tokenizer throws fixed — no template is silently invisible to the linter any more"
---

# freemarker-parser 1.4.1

Two fixes with an outsized blast radius. Both were throws from the **tokenizer** rather
than from a node constructor — and the parser's error recovery is per-token, so a
tokenizer throw means there are no tokens at all. An affected file yielded **zero AST
nodes**, which every AST-walking lint rule reads as "nothing to check". Those files were
not failing their lint; they were silently exempt from it.

Both constructs are ordinary, valid FreeMarker that Liferay templates use routinely:

- `<@liferay_util["html-top"]>` — a macro called through a bracketed lookup, which is how
  Liferay taglib macros are invoked. `parseTagName` accepted only letters, `.` and `_`, so
  it raised ``Invalid `[` ``.
- `</@>` — the shorthand close for a macro call, whose name is optional. The tokenizer
  demanded one and raised `CloseMacro name cannot be empty`. The parser matches a close
  macro on node *type* and never reads the name, so it was never needed.

After this release **no template in any consumer portal produces zero nodes** — every file
is now actually being linted. Nothing to do on upgrade beyond taking the version.

## Fixed

- `parseTagName` now consumes a balanced `[…]` group as part of a macro name, quotes
  respected, in both tag syntaxes. `<@liferay_util["html-top"]>`, `[@liferay_ui["message"]
  key="x" /]`, chained lookups (`[@ns["a"]["b"]]`) and a `]` inside the quoted key
  (`[@ns["a]b"]]`) all parse, and the matching close tag resolves. An unterminated group
  reports `Unclosed [ in tag name` rather than running to EOF.
- `</@>` / `[/@]` is accepted. A close *directive* (`</#>`) still requires its name, since
  FreeMarker has no shorthand for that.

## Compatibility

No API or AST-shape change for anything that already parsed. `MacroCallNode.name` now
carries the full lookup text (`liferay_util["html-top"]`) for bracketed calls, and is empty
for a shorthand close — in both cases where previously no node existed at all. All 259 tests
from 1.4.0 pass unchanged; 11 added.

Measured across the consumer portals. "Zero-node files" is the number getting no linting at
all, and is the figure that matters:

| Portal | Files | Errors after 1.4.0 | Errors after 1.4.1 | Zero-node files: 1.4.0 → 1.4.1 |
|---|---|---|---|---|
| isa | 146 | 8 | 7 | 1 → **0** |
| chroa | 94 | 6 | 2 | 5 → **0** |
| cbdce | 47 | 2 | 1 | 1 → **0** |
| ay | 33 | 4 | 4 | 0 → 0 |
| aoc | 91 | 22 | 7 | 4 → **0** |

## Known limitations

`#continue`, `#sep` and the legacy `#foreach` are still absent from the `Directives` map,
and chroa has one `Expected expression after <`. These are all *recovered* errors: the
parser skips the offending token and leaves block nesting intact, so each costs one node
rather than the file. That is the difference between the errors remaining and the ones
fixed here.
