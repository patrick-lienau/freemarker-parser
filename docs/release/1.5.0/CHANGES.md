---
repo: freemarker-parser
version: 1.5.0
previous_version: 1.4.2
date: 2026-11-01
consumer_impact: none
headline: "Parse lambda expressions: directives holding one are no longer dropped from the AST"
---

# freemarker-parser 1.5.0

The params parser had no `->`. It read `x -> x.y` as `x - …` and threw "Expected expression
after -". That error is recovered per token, so the whole node holding the lambda vanished
from the AST. Lambdas now parse into a new `LambdaExpression` node. The change is additive: no
existing node changes shape, and nothing has to be edited to take this version. Consumers that
walk expressions will meet a new node kind (IMP-1), and constructs that used to be missing now
appear, so lint findings can surface inside them (INFO-1).

## Highlights

- Lambda arguments to `?filter`, `?map`, `?take_while` and `?drop_while` parse, in both the
  bare form `x -> …` and the parenthesised form `(x) -> …`.
- An `#assign`, `#local`, `#global`, `#if`, `#list` or `${…}` that holds a lambda stays in the
  AST, with its children where they belong.
- No lambda parse errors remain in any consumer portal. Files with parse errors fall from 11
  to 5 in isa-portal and from 11 to 4 in chroa-portal.

## Added

- `ParamNames.LambdaExpression` and the `LambdaExpression` interface
  (`params: Identifier[]`, `body: AllParamTypes`). It is a member of `AllParamTypes` and is
  exported from the package root. _(IMP-1)_
- `Operators.LAMBDA_ARROW` (`'->'`). It is not a binary operator.

## Fixed

- A lambda no longer makes its node vanish. Before, an assignment holding one was lost, a
  `${…}` holding one was lost, and an `#if` or `#list` whose open tag held one lost that tag:
  its children were flattened into the parent, and its `#else` and close tag were reported as
  stray. _(INFO-1)_

## Compatibility

No existing node changes shape. All 291 tests from 1.4.2 pass unchanged, including the 178
snapshots, and 24 tests were added.

FreeMarker accepts a lambda only as a built-in's argument and only with exactly one
parameter. The parser reads one only as a call argument, never as a sequence element, and
only with a single parameter.

Files with at least one parse error, over each portal's `neptune-ui` partials, templates and
fragment `index.html`:

| Portal | Files | 1.4.2 | 1.5.0 |
|---|---|---|---|
| isa | 197 | 11 | 5 |
| chroa | 176 | 11 | 4 |
| cbdce | 40 | 0 | 0 |
| ay | 28 | 0 | 0 |
| aoc | 11 | 0 | 0 |

## Known limitations

These expression forms still fail. Each failure is recovered, so block nesting survives, but
the node holding the expression is dropped.

- **A hash literal key that is an expression**, such as `{node.getCategoryId()?c: node}` or
  `{personKey: true}`. `parseMap` accepts only quoted string keys. Seen in 2 isa files and
  3 chroa files.
- **Indexing a hash literal directly**, such as `{"h2": "h3"}[headingLevel]`. Seen in 2 isa
  files.
- **`&gt;` as a comparison operator**, such as `<#if count &gt; 0>`. Seen in 1 isa file.
- **A backslash-escaped quote inside a string in a directive's parameters**, such as
  `?matches("src=\"([^\"]+)\"")`. The tokenizer does not honour `\`, so it reports
  `Missing " close char`. Seen in 1 chroa file.
