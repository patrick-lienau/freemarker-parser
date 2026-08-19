# 1.4.0 — consumer migration

Nothing is required. This release only adds parsing that previously failed.

## 1. Bump the pin — LEVEL: IMPROVEMENT

`@neptune/freemarker-parser` is not pinned by any portal directly; it is a dependency of
`@neptune/cx-tooling`. Bump it there:

```jsonc
// neptune-cx-tooling/package.json
"dependencies": { "@neptune/freemarker-parser": "^1.4.0" }
```

Then cut a `@neptune/cx-tooling` release so the portals pick it up.

## 2. Re-check AST-based lint rules — LEVEL: INFO

Rules that walk the AST (`no-undefined-variable`, `require-default-on-nullable-call`) now see
the contents of `[#list 0..n as i]` blocks that previously failed to parse and were skipped.
That can surface findings in code the linter was silently not checking.

Verified on isa-portal: running `neptune-cx validate-freemarker --no-cache` before and after
this release produces the same 5 errors, so no consumer there is affected. Re-run it in each
portal after bumping.
