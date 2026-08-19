---
repo: freemarker-parser
version: 1.4.2
previous_version: 1.4.1
date: 2026-08-18
consumer_impact: none
headline: "Support #continue and #sep — isa, cbdce and ay now parse with zero errors"
---

# freemarker-parser 1.4.2

`#continue` and `#sep` were absent from the `Directives` map, so every use raised
`Unknown token`. Unlike the tokenizer throws fixed in 1.4.1, this is a *recovered* error —
the parser skips the token and its block nesting survives — so it cost one node rather than
the whole file. The construct still vanished from the AST, though, and with `#sep` that
meant its entire body went unanalysed by every AST-walking rule.

With these two, the parser reads every FreeMarker construct the consumer portals actually
use, bar one legacy directive and one expression form (below).

## Added

- **`#continue`** — a leaf node (`NodeTypes.Continue`), no params and no body, modelled on
  `#break`. Parameters are rejected.
- **`#sep`** — a body node (`NodeTypes.Sep`). FreeMarker lets its close tag be omitted, in
  which case the separator runs to the end of the enclosing list, so both spellings parse:

  ```ftl
  <#list xs as x>${x}<#sep>, </#sep></#list>   <#-- explicit close -->
  <#list xs as x>${x}<#sep>, </#list>          <#-- runs to the end of the list -->
  ```

  The bodiless form is handled by closing an open `#sep` implicitly when its enclosing
  `#list` or `#items` closes. `#sep` is the only implicitly-closable node — a stray
  `[/#sep]` is still reported, and no other unclosed block is silently absorbed.

## Compatibility

No API change. All 270 tests from 1.4.1 pass unchanged; 21 tests and a
`test/resource/valid/continue-sep-macros.ftl` fixture were added, including strengthened
coverage for 1.4.1's bracketed macro names and `</@>` shorthand close — those now assert the
surrounding tree survives rather than only that no error was raised, since a tokenizer throw
used to leave zero nodes, which reads to a lint rule as "empty file" rather than "broken
file".

Parse errors across the consumer portals:

| Portal | Files | 1.4.1 | 1.4.2 |
|---|---|---|---|
| isa | 146 | 7 | **0** |
| chroa | 94 | 2 | 1 |
| cbdce | 47 | 1 | **0** |
| ay | 33 | 4 | **0** |
| aoc | 91 | 7 | 7 |

For context, isa-portal was at **80 of 146** before the 1.4.0 release.

## Known limitations

- **`#foreach`** — the legacy directive removed in FreeMarker 2.4. aoc-portal uses it
  (9 sites). Aliasing it to `#list` would parse it, but its `x in xs` parameter order
  differs from `xs as x`, so it warrants its own decision rather than a one-line alias.
- **`Expected expression after <`** — one site in chroa-portal, an expression the params
  parser cannot read.

Both are recovered errors that leave block nesting intact.
