---
repo: freemarker-parser
repo_type: npm-package
version: 1.5.0
previous_version: 1.4.2
source_commit_range: e0721f8..7004b72
generated: 2026-11-01
---

# freemarker-parser 1.5.0 Migration

Lambda expressions now parse into a new `LambdaExpression` node. No API change and nothing
to edit. Code that walks expressions should learn the new node (IMP-1), though. Directives
that held a lambda used to be dropped from the AST and are now present, so rules analyse them
for the first time (INFO-1).

## Manifest

| # | ID | Level | Title | Human-gated |
|---|----|-------|-------|-------------|
| 1 | IMP-1 | IMPROVEMENT | Handle `LambdaExpression` in expression walkers | no |
| 2 | INFO-1 | INFO | Directives holding a lambda are now analysed | — |

## Steps (execute in order — do not reorder or interleave)

### 1 · IMP-1 — Handle `LambdaExpression` in expression walkers

- **Benefit:** a walker that knows the node sees the reads inside a lambda's body and does
  not mistake the lambda's own parameter for a variable. Without it, a walker misses those
  reads or, worse, counts `x` in `x -> x.y` as a read of an outer `x`.
- **What changed:** `xs?map(x -> x.y)` is a `BuiltInExpression` whose `right` is a
  `CallExpression`. That call's `arguments` hold
  `{ type: 'LambdaExpression', params: [Identifier x], body: <x.y> }`. Three things trip
  walkers:
  1. A walker that skips a built-in's `right` side, because it is normally the built-in's
     name, never reaches the call arguments, and so never reaches the lambda.
  2. `body` is a single expression, not an array. A fallback that only iterates array-valued
     keys (`arguments`, `elements`, `body`) never reads it.
  3. `params` are names the lambda binds, not reads. A walker that recurses into every field
     and collects each `Identifier` reports them as reads.
- **Locate:** every expression walker and identifier collector:
  ```
  rg -n "ParamNames\.(BuiltInExpression|CallExpression|Identifier)" --type ts
  rg -n "'arguments', 'elements', 'body'|CHILD_KEYS|Object\.values\(e\)" --type ts
  ```
- **Change:** in a walker that collects reads, add a case that collects from the body,
  minus the lambda's parameters. Also make it visit a built-in call's arguments, but not the
  built-in's name:
  ```ts
  case ParamNames.BuiltInExpression:
      collect(e.left, out);
      if (e.right?.type === ParamNames.CallExpression) {
          for (const arg of e.right.arguments ?? []) collect(arg, out);
      }
      return;
  case ParamNames.LambdaExpression: {
      const bodyRefs = new Set<string>();
      collect(e.body, bodyRefs);
      for (const param of e.params) bodyRefs.delete(param.name);
      for (const name of bodyRefs) out.add(name);
      return;
  }
  ```
  A walker that only looks for calls or literals, and recurses into every object-valued
  field, already reaches the body. Leave it as it is.
- **Verify:** a test that runs the walker over `<#local ys = xs?map(t -> t + y)>` reports a
  read of `y` and none of `t`.
- **Notes:** naming `ParamNames.LambdaExpression` needs `@neptune/freemarker-parser` 1.5.0 or
  later at compile time. Under 1.4.2 it is `undefined`, and `tsc` reports TS2551. Raise the
  dependency in the same change as the walker edit.

### 2 · INFO-1 — Directives holding a lambda are now analysed

No action required to take this version.

The parser used to drop the node that held a lambda:
- an `#assign`, `#local` or `#global` was lost;
- a `${…}` was lost;
- an `#if` or `#list` lost its open tag, and its children were flattened into the parent.

All of these are now in the AST, so findings can appear in them for the first time. Rules
that reason about conditional flow can also change their verdict either way. Assignments
inside such an `#if` used to count as unconditional and now count as conditional. Drop zones
inside one used to count as always emitted. Any new finding is a pre-existing issue becoming
visible, not a regression.

To see what changed before it reaches a build:

```bash
cd <portal>/client-extensions/neptune-ui
npx neptune-cx validate-freemarker --no-cache
```

`--no-cache` matters: a cached result predates this change and will not re-report.
