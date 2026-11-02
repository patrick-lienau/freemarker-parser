---
repo: freemarker-parser
version: 1.6.0
previous_version: 1.5.0
date: 2026-11-01
consumer_impact: code
headline: "Parse expression hash keys, literal indexing, entity operators and escaped quotes; MapExpressionValues.key widens to any expression"
---

# freemarker-parser 1.6.0

This release fixes the four forms listed under 1.5.0's "Known limitations", plus indexing on
sequence and string literals. Each used to make the parser drop the node holding the
expression. One case dropped a whole file. A consumer may have one code edit: a hash literal's
`key` is now any expression, not always a `Literal`. A TypeScript consumer that reads
`key.value` must narrow first (REQ-1). Expression walkers can also learn to read keys (IMP-1)
and to recognise the entity-spelled operators (IMP-2). No parse errors remain in any consumer
portal. The constructs that are now present in the AST add no lint findings in any portal
today (INFO-1).

## Highlights

- Hash literal keys can be expressions: `{node.getCategoryId()?c: node}`, `{personKey: true}`.
- `.x`, `[x]` and `(…)` work directly on a literal: `{"h2": "h3"}[level]!"h3"`,
  `["a", "b"][i]`, `"abc"[0]`.
- Operators spelled as HTML entities parse: `<#if count &gt; 0>`, `a &lt;= b`,
  `a &amp;&amp; b`, `x -&gt; x.y`.
- An escaped quote inside a string no longer breaks a directive: `?matches("src=\"([^\"]+)\"")`.
- Files with parse errors drop from 5 to 0 in isa-portal and from 4 to 0 in chroa-portal.

## Added

- `Operators.ENTITY_LT` (`&lt;`), `ENTITY_LTE` (`&lt;=`), `ENTITY_GT` (`&gt;`), `ENTITY_GTE`
  (`&gt;=`), `ENTITY_AND` (`&amp;&amp;`) and `ENTITY_LAMBDA_ARROW` (`-&gt;`). These are every
  entity spelling in FreeMarker's own grammar. Comparisons and `&amp;&amp;` take the
  precedence of their plain forms, and `&amp;&amp;` yields a `LogicalExpression`. The AST keeps
  the operator as written (`operator: '&gt;'`), the same way `gt` and `>` already stay
  distinct. _(IMP-2)_
- `ParamsParser.parseMemberChain(node)` (protected): the member/call loop that
  `parseVariable` used to run inline. It now also runs after a hash, sequence or string
  literal.

## Changed

- `MapExpressionValues.key` is typed `AllParamTypes`, was `Literal`. FreeMarker evaluates a
  hash key, so `{personKey: true}` gives an `Identifier` key that reads the variable, not the
  string `"personKey"`. A quoted key still gives the same `Literal` as before. _(REQ-1,
  IMP-1)_

## Fixed

- A hash literal with an unquoted key (`{a: 1}`, `{x?c: y}`, `{f(): y}`) no longer throws
  "Invalid character …", which lost the directive holding it.
- A hash, sequence or string literal followed by `[…]`, `.x` or `(…)` no longer becomes a
  Compound ("Invalid parameters in Assign"), which lost the directive holding it.
- `&lt;`, `&gt;` and the other entity operators no longer throw `Unexpected "&"`. Before, an
  `#if` holding one lost its open tag, so its children were flattened into the parent and its
  close tag was reported as stray.
- The tokenizer honours `\` inside a quoted string, so `\"` and `\'` no longer close it. Before,
  the quotes fell out of step and the tokenizer threw `Missing " close char`. A tokenizer
  error is not recovered, so **the whole file parsed to an empty AST**, not just one node as
  1.5.0's notes said. Raw strings (`r"C:\dir\"`) have no escapes and still close as before.
  _(INFO-1)_

## Compatibility

All 315 tests from 1.5.0 pass unchanged, including the 178 snapshots, and 76 tests were added.
Templates that already parsed produce the same AST. Only constructs that used to fail come out
differently.

Files with at least one parse error, over each portal's `neptune-ui` partials, templates and
fragment `index.html`:

| Portal | Files | 1.5.0 | 1.6.0 |
|---|---|---|---|
| isa | 197 | 5 | 0 |
| chroa | 176 | 4 | 0 |
| cbdce | 40 | 0 | 0 |
| ay | 28 | 0 | 0 |
| aoc | 11 | 0 | 0 |

neptune-cx-tooling's default lint rules return the same findings over all five portals with
1.5.0 and with 1.6.0: isa 0, chroa 21, cbdce 3, ay 5, aoc 0.

## Known limitations

These forms still fail. None appears in any consumer portal.

- **A hash literal directly inside `${…}`**, such as `${{"a": 1}[k]}`. The tokenizer does not
  track `{`, so the literal's first `}` ends the interpolation. Inside parentheses it works:
  `${(m + {"a": 1})?size}`.
- **Raw strings in an expression**, such as `x?replace(r"\d", "")`. The params parser reads
  `r` as a variable followed by a string. As a call argument that silently adds an argument;
  in an assignment it is an error.
- **FreeMarker's other operator spellings**: `\lt`, `\lte`, `\gt`, `\gte`, `\and`, a bare `&`
  for and, a bare `|` for or, and `,` as a hash key/value separator (`{"a", 1}`).
