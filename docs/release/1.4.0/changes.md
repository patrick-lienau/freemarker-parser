# 1.4.0 — the range operator

## Added: FreeMarker's range operators

`..`, `..<`, `..!` and `..*` are now parsed. Previously **any** use of a range threw
`Unexpected period` and the parser's recovery discarded the enclosing node — so
`[#list 0..n-1 as i] … [/#list]` produced no `List` node at all and its body was re-parented
into the surrounding block.

```
before:  "[#list 1..3 as i]X[/#list]"  ->  errors: ["Unexpected period", "Unexpected close tag 'List'"]
                                           Program > Text "X"          (the #list is gone)

after:   "[#list 1..3 as i]X[/#list]"  ->  errors: []
                                           Program > List > Text "X"
```

Supported forms:

| Form | Example | Result |
|---|---|---|
| Inclusive | `1..3`, `start..end` | `BinaryExpression`, operator `..` |
| Exclusive end | `0..<10`, `0..!10` | `BinaryExpression`, operator `..<` / `..!` |
| Length-based | `0..*10` | `BinaryExpression`, operator `..*` |
| Open-ended | `seq[5..]` | `UnaryExpression`, operator `..`, `prefix: false` |

The open-ended form is the only binary operator FreeMarker allows with no right operand, so it
is attached to its left operand as a postfix unary rather than being forced through the
precedence stack.

**Precedence** sits between additive and relational, matching FreeMarker's own table:

- `0..n-1` parses as `0..(n-1)` — the arithmetic binds tighter.
- `x..y > z` parses as `(x..y) > z` — the range binds tighter than the comparison.
- `0..9?size` parses as `0..(9?size)` — builtins still outrank it.

## Fixed: a bare `<#ftl>`

`<#ftl>` with no parameters raised `Assign require params`. Every one of `#ftl`'s attributes
(`encoding`, `output_format`, `strip_whitespace`, …) is optional, so a bare tag is valid — and
`@neptune/cx-tooling`'s `require-ftl-directive` rule makes one the first line of every partial and
DDM template, so this failed on essentially all of them (49 files in isa-portal).

## Fixed: self-closing tags in square-tag syntax

`MacroCallNode` tested `token.endTag !== '/>'` — the *angle-tag* spelling. The tokenizer's
terminator list is `[']', '/]']` in square-tag mode, so every `[@macro … /]` opened a body that was
never closed, raising `Unclosed tag 'MacroCall'` and cascading into an `Unexpected close tag
'Condition'` for each enclosing block (14 and 30 occurrences respectively in isa-portal).

Both spellings are now recognized via a shared `isSelfClosing(token)` helper, which is also applied
to `#assign` so `[#assign x /]` no longer captures a body.

## Fixed: numeric literals and member access next to a range

- `parseNumericLiteral` no longer consumes the first `.` of a `..` as a decimal marker.
  `1.5..2.5` parses as a range between two decimals; a genuine second decimal marker (`1.2.3`)
  still raises `Unexpected period`.
- `parseVariable`'s member-access loop no longer reads `start..end` as a member access on
  `start`.

## Compatibility

No breaking changes. All 230 pre-existing tests pass unchanged; 29 tests, a
`test/resource/valid/range.ftl` fixture, and a `test/self-closing-and-ftl.spec.ts` suite were
added.

Consumers that inspect the AST should know the operator can now appear as a `BinaryExpression`
(or postfix `UnaryExpression`) where previously the surrounding construct failed to parse — so
blocks that used to be silently flattened now nest correctly. Together the three fixes drop isa-portal's
parse-error count from **80 of 146 files to 8**:

| Portal | Files | With parse errors, before | After |
|---|---|---|---|
| isa | 146 | 80 | **8** |
| chroa | 94 | — | 6 |
| cbdce | 47 | — | 2 |
| ay | 33 | — | 4 |
| aoc | 91 | — | 22 |

## Still unparsed

What remains is unimplemented directives and two smaller tokenizer gaps:

- `#continue` and `#sep` are not in the `Directives` map (`Unknown token …`); aoc also uses the
  legacy `#foreach`.
- `CloseMacro name cannot be empty` — a `[/@]` close with no macro name, which FreeMarker allows.
- `Invalid \`[\`` — a `[` in a position the tag-name scanner rejects.

None of these is load-bearing for the portals today, and each is a separate, smaller fix.

## Consumer note — newly visible code

Because collapsed blocks now nest correctly, AST-walking lint rules see code they previously
skipped. In isa-portal this surfaced two genuine `no-undefined-variable` findings in
`fragments/content/isa-sponsor-block/index.html` (`fragmentElementId` is assigned only inside
`[#if sponsorArticle?has_content]` but used inside `[#if showOptIn]`, which is not guarded by it).
Expect a small number of such pre-existing issues to become visible on upgrade; they are real, not
regressions.
