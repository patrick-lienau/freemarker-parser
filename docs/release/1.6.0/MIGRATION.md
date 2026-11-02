---
repo: freemarker-parser
repo_type: npm-package
version: 1.6.0
previous_version: 1.5.0
source_commit_range: e6e828f..5ffb453
generated: 2026-11-01
---

# freemarker-parser 1.6.0 Migration

A hash literal's `key` is now any expression, not always a `Literal`. TypeScript code that
reads `key.value` or `key.raw` has to narrow first (REQ-1). Expression walkers can also read
the variables inside a key (IMP-1). Code that matches operators by spelling can learn the
entity forms (IMP-2). There are no ops. Constructs the parser used to drop are now in the AST
and get analysed for the first time (INFO-1).

## Manifest

| # | ID | Level | Title | Human-gated |
|---|----|-------|-------|-------------|
| 1 | REQ-1 | REQUIRED | Narrow `MapExpressionValues.key` before reading it as a literal | no |
| 2 | IMP-1 | IMPROVEMENT | Collect reads from hash literal keys | no |
| 3 | IMP-2 | IMPROVEMENT | Recognise entity-spelled operators | no |
| 4 | INFO-1 | INFO | Constructs that used to be dropped are now analysed | — |

## Steps (execute in order — do not reorder or interleave)

### 1 · REQ-1 — Narrow `MapExpressionValues.key` before reading it as a literal

- **Breakage:** compile
- **What changed:** `MapExpressionValues.key` was typed `Literal` and is now `AllParamTypes`.
  `{personKey: true}` yields `{ type: 'Identifier', name: 'personKey' }` as the key, and
  `{node.getId()?c: node}` yields a `BuiltInExpression`. A quoted key still yields the same
  `Literal` as before. In TypeScript, reading `key.value` or `key.raw` directly no longer
  compiles. In plain JavaScript or through `any` it compiles, but returns `undefined` for an
  expression key.
- **Locate:** every read of a map element's key:
  ```
  rg -n "\.key\b" --type ts --type js -g '!node_modules'
  rg -n "MapExpression|MapExpressionValues" --type ts --type js -g '!node_modules'
  ```
  Keep only the hits where the object is a `MapExpression` element (`elements[i]`, `el`,
  `item`, …). A key read that is only passed to a generic walker (`walk(el.key)`) is fine.
- **Change:** narrow before reading a literal's fields:
  ```ts
  // before
  const name = element.key.value;

  // after
  const name =
      element.key.type === ParamNames.Literal ? element.key.value : undefined;
  ```
  Decide what an expression key should mean at that site. Usually it is "unknown at parse
  time", and the site should skip the entry rather than guess a name.
- **Verify:** `tsc --noEmit` passes with `@neptune/freemarker-parser` at 1.6.0. A test over
  `<#assign m = {k: 1}>` doesn't throw and doesn't report `k` as a string key.
- **Notes:** neptune-cx-tooling's walkers read keys only through `any`-typed generic
  recursion (`walkExpr` in `src/freemarker/parse.ts`, and the recursion in
  `require-default-on-nullable-call.ts`), so it needs no edit for this step.

### 2 · IMP-1 — Collect reads from hash literal keys

- **Benefit:** a walker that collects variable reads sees the variables a key reads. Without
  it, `{personKey: true}` is not counted as a read of `personKey`, so an undefined-variable
  check misses it.
- **What changed:** before 1.6.0 a key was always a string literal, so a walker could skip
  keys safely. Now a key can hold identifiers, calls and built-ins.
- **Locate:** walkers with a `MapExpression` case that visit only `value`:
  ```
  rg -n -A3 "ParamNames\.MapExpression" --type ts -g '!node_modules'
  ```
  In neptune-cx-tooling this is `collectRefs` in
  `src/freemarker/rules/no-undefined-variable.ts`.
- **Change:**
  ```ts
  // before
  case ParamNames.MapExpression:
      for (const el of e.elements ?? []) collectRefs(el?.value, out);
      return;

  // after
  case ParamNames.MapExpression:
      for (const el of e.elements ?? []) {
          collectRefs(el?.key, out);
          collectRefs(el?.value, out);
      }
      return;
  ```
  A quoted key is a `Literal`, which a read collector ignores already.
- **Verify:** a test over `<#assign seen = seen + {personKey: true}>` reports a read of
  `personKey`, and one over `<#assign m = {"a": b}>` reports `b` only.

### 3 · IMP-2 — Recognise entity-spelled operators

- **Benefit:** code that evaluates or classifies expressions by operator spelling handles
  `&gt;`, `&lt;=`, `&amp;&amp;` and the rest the same as their plain forms.
- **What changed:** the AST keeps an operator as written. `a &amp;&amp; b` is a
  `LogicalExpression` with `operator: '&amp;&amp;'`. `a &gt; b` is a `BinaryExpression` with
  `operator: '&gt;'`. The new spellings are `Operators.ENTITY_LT`, `ENTITY_LTE`, `ENTITY_GT`,
  `ENTITY_GTE`, `ENTITY_AND` and `ENTITY_LAMBDA_ARROW`.
- **Locate:**
  ```
  rg -n "operator (===|!==) ['\"](&&|<|<=|>|>=|lt|lte|gt|gte)['\"]" --type ts -g '!node_modules'
  rg -n "Operators\.(AND|NATURAL_(LT|LTE|GT|GTE)|ESCAPED_(LT|LTE|GT|GTE))" --type ts -g '!node_modules'
  ```
  In neptune-cx-tooling this is the `&&` / `||` evaluation in `src/freemarker/dropzones.ts`.
- **Change:** treat each entity spelling like its plain operator:
  ```ts
  // before
  if (e.operator === '&&' || e.operator === '||') {

  // after
  if (e.operator === '&&' || e.operator === '&amp;&amp;' || e.operator === '||') {
  ```
  `&amp;&amp;` is `&&`. `&lt;` and `&lt;=` are `<` and `<=`. `&gt;` and `&gt;=` are `>` and
  `>=`.
- **Verify:** a test where the same template written with `&&` and with `&amp;&amp;` gets the
  same verdict.
- **Notes:** naming `Operators.ENTITY_*` needs 1.6.0 at compile time. Without this step an
  unrecognised operator usually falls through to "can't decide", and in `dropzones.ts` that is
  the safe direction.

### 4 · INFO-1 — Constructs that used to be dropped are now analysed

No action required to take this version.

1.5.0 dropped the node that held any of the forms 1.6.0 fixes: an `#assign`, `#local` or
`#global` was lost, and an `#if` lost its open tag, so its children were flattened into the
parent. A file holding an escaped quote in a directive's string lost every node. All of
these are now in the AST, so lint findings can appear in them for the first time. Any new
finding is an existing issue becoming visible, not a regression.

With neptune-cx-tooling's default rules, no portal's findings change today: isa 0, chroa 21,
cbdce 3, ay 5, aoc 0 with either version. To check a portal before a build does:

```bash
cd <portal>/client-extensions/neptune-ui
npx neptune-cx validate-freemarker --no-cache
```

`--no-cache` matters: a cached result predates this change and won't re-report.
