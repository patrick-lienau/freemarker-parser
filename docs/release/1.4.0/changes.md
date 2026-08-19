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

## Fixed

- `parseNumericLiteral` no longer consumes the first `.` of a `..` as a decimal marker.
  `1.5..2.5` parses as a range between two decimals; a genuine second decimal marker (`1.2.3`)
  still raises `Unexpected period`.
- `parseVariable`'s member-access loop no longer reads `start..end` as a member access on
  `start`.

## Compatibility

No breaking changes. All 230 pre-existing tests pass unchanged; 16 tests and one
`test/resource/valid/range.ftl` fixture were added.

Consumers that inspect the AST should know the operator can now appear as a `BinaryExpression`
(or postfix `UnaryExpression`) where previously the surrounding construct failed to parse — so
blocks that used to be silently flattened now nest correctly. In `@neptune/cx-tooling`'s
FreeMarker linter this drops isa-portal's parse-error count from 80 of 146 files to 68, and
`Unexpected close tag 'List'` from 26 occurrences to 4.

## Still unparsed

Two unrelated gaps remain the largest source of parse errors, both of which also collapse
blocks:

- **A bare `<#ftl>` / `[#ftl]` with no parameters** raises `Assign require params`
  (49 occurrences in isa-portal — every partial and DDM template opens with one).
- **A self-closing macro call, `[@macro … /]`**, raises `Unclosed tag 'MacroCall'`
  (14 occurrences), which in turn produces 30 downstream `Unexpected close tag 'Condition'`
  errors.
