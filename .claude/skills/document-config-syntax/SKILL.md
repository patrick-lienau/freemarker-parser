---
name: document-config-syntax
description: Author or update docs/config/ reference pages that explain Neptune's undocumented custom config syntaxes — OSGi System Settings values, portlet/widget JSON configuration, and fragment configuration.json fields that are parsed by hand-rolled regexes/tokenizers rather than plain typed fields. Use when a config's parsing logic changes, a new custom mini-syntax is added, or docs/config has drifted from the source.
---

# Document a config syntax

`docs/config/` is the reference for every place in Neptune where a human types a
**string or JSON blob** that a hand-rolled parser interprets — as opposed to a plain
typed OSGi field. `docs/module-index.md` answers "what class does X" (updated by
`/update-module-index`); `docs/config/` answers "what am I allowed to type into this
box, and what does it mean." These are undocumented custom grammars living only in
regexes and tokenizers, so the doc must be derived from the parsing code itself, not
from guessing at plausible-looking syntax.

## What counts as a "config" worth documenting

Anywhere a string/JSON value is fed through custom parsing logic instead of being
consumed as a plain typed value. Signals to grep for:

- `@Meta.OCD` / `@ExtendedObjectClassDefinition` interfaces (OSGi System Settings) —
  e.g. `ArticleStructureKeyAliasConfiguration`, `NamedVocabConfiguration`,
  `NamedCategoryConfiguration`.
- `*ConfigManager` classes reading those configurations.
- `*Helper.resolve(...)` / `.parse(...)` methods with a `Pattern.compile(...)` —
  e.g. `StructureKey.parse` (`@alias@` / `!key` syntax), `CategoryExpressionEngine` /
  `ExpressionBuilder` (`&&`, `||`, `,` as OR, `!`, parens over numeric category ids).
- `*Config` classes that pull fields out of a widget's `JSONObject` (portlet
  preferences) with their own comma/token conventions — e.g. `CollectionConfig`'s
  `siteIds` pattern tokens (`*`, `12345`, `12345/*`, `*/12345`, `*/12345/*`, `!`-negation,
  "can't mix negated and non-negated in one field"), and `DatePredicateHelper`'s
  date-predicate strings (`dateLowerBound` / `dateUpperBound`).
- Fragment `configuration.json` fields with a custom `dataType`/expression convention
  rather than a stock Liferay field type.

If a value is just `config.getString("foo")` consumed as-is (no tokenizing, no
regex, no mini-grammar) it does **not** need a page here — that belongs in
`docs/module-index.md` at most.

## Finding the source of truth

For a given config, trace it fully before writing anything:

1. Find the `@Meta.OCD`/`@ExtendedObjectClassDefinition` interface (if it's a System
   Settings value) — note its `category`, `factory` (single vs. multi-instance), and
   each `@Meta.AD` field's `name`/`description` keys (these point at
   `Language.properties` for the human-facing label/help text).
2. Find the parser: the `Pattern.compile(...)`, `tokenize(...)`, `split(...)`, or
   hand-written recursive-descent method. Quote the actual regex/grammar rules in the
   doc — do not paraphrase loosely from a guess at what it "probably" does.
3. Check for unit tests under `modules/**/src/test/**` for the same class — they are
   often the most authoritative set of valid/invalid examples. Prefer lifting
   examples from tests over inventing new ones; verify any example you invent by
   mentally tracing it through the parser.
4. Note every class involved (config interface, config manager, helper/parser,
   consumer of the parsed result) — all of them go in the page's Source section.

## Deciding one file vs. a subfolder

- **One config, one syntax** -> a single file: `docs/config/<slug>.md`.
- **A family of related configs** (e.g. everything under the collection
  configurator's widget JSON — site patterns, category expressions, date predicates,
  structure key aliases all show up in one `CollectionConfig`) -> a subfolder
  `docs/config/<group>/` with its own `index.md` plus one file per mini-syntax:

  ```
  docs/config/collections/index.md
  docs/config/collections/site-expressions.md
  docs/config/collections/date-predicates.md
  ```

  Put shared/overview material (what the widget config JSON looks like as a whole,
  which fields exist, which ones defer to which sibling doc) in the group's
  `index.md`. A sub-syntax that's small enough not to need its own page can just be
  documented inline in the group `index.md` instead of spawning a file.

## Anatomy of one config page

```markdown
# <Config Name>

<One-sentence purpose.>

## Where it's set

<System Settings category/label, or the portlet-preference / widget JSON field
name(s) that carry this value. Cite the @Meta.OCD category / @Meta.AD name, or the
JSONObject key, exactly as found in source.>

## Syntax

<The precise grammar, derived from the regex/tokenizer/parser. Quote the pattern
or spell out the token rules (precedence, negation, what's mutually exclusive,
defaults when blank) rather than describing it vaguely.>

## Examples

<Several concrete examples — valid ones covering common and edge cases, and at
least one invalid example showing what gets rejected/logged as an error. Prefer
examples lifted from existing unit tests.>

## Source

- `modules/.../ThePattern.java` — parser
- `modules/.../TheConfiguration.java` — OSGi config interface (if applicable)
- `modules/.../TheConsumer.java` — where the parsed value is used

## Gotchas

<Only include this section if there's a real footgun found in the code, e.g. "you
cannot mix negated and non-negated site-pattern tokens in the same field." Omit the
section entirely if there's nothing surprising.>
```

Cite source as repo-relative backticked paths (matching `docs/module-index.md`'s
`**Path:**` convention) — never invent or guess a GitHub URL.

## Anatomy of `docs/config/index.md`

Keep it bare — a discoverability map, not a summary:

```markdown
# Config Syntax Reference

Reference for Neptune's custom OSGi/portlet/fragment config syntaxes — what you're
allowed to type into each value and what it means.

| Config | Description |
|---|---|
| @docs/config/structure-key-alias.md | Alias journal-article structure keys (`@alias@`) to real keys, with `!`-negation. |
| @docs/config/named-vocab.md | Look up vocabularies by configured name instead of numeric id. |
| @docs/config/named-category.md | Look up categories by configured name instead of numeric id. |
| @docs/config/category-expression-engine.md | Boolean expression grammar (`&&`, `\|\|`, `!`, parens) over category ids. |
| @docs/config/collections/index.md | Collection-provider widget JSON config: site scoping, category filters, dedupe, sorting. |
| @docs/config/collections/site-expressions.md | Site/group id pattern tokens (`*`, `id`, `id/*`, `*/id/*`) with negation. |
| @docs/config/collections/date-predicates.md | Relative/absolute date-bound predicate syntax for collection date filters. |
```

Every group's children are listed here directly alongside their group's `index.md`
row — a group being documented does not exempt its children from this table. One
row, one sentence, no elaboration; that lives on the page itself.

Every `@`-link is a repo-root-relative path (`@docs/config/...`), matching the
`@path/to/.../docs/module-index.md` import convention already used in
`docs/consumers.md` and the top-level `CLAUDE.md` files — pick this form
consistently regardless of which file does the linking, so links are unambiguous
to copy between files.

## Anatomy of a group `index.md`

Same bare-table pattern as the root index, but scoped to the group's children, plus
room for a bit more prose: shared context about the overall config surface (e.g.
what the whole widget JSON blob looks like) and inline documentation for any
sub-syntax too small to deserve its own file.

```markdown
# Collections Config

<Slightly fuller intro: what the widget JSON as a whole looks like, which fields
are documented here vs. delegate to a sibling page.>

| Config | Description |
|---|---|
| @docs/config/collections/site-expressions.md | Site/group id pattern tokens with negation. |
| @docs/config/collections/date-predicates.md | Relative/absolute date-bound predicates. |

## <small inline sub-syntax that doesn't need its own file>

<...>
```

## Updating `docs/consumers.md`

Add **one** brief pointer, not a summary of every config — the existing
`## Configuration` section already lists the System Settings panel names; append a
single line + `@`-link under it:

```markdown
For the full syntax of each of these values, see @docs/config/index.md.
```

Do not enumerate individual configs here — that duplicates `docs/config/index.md`
and the two will drift.

## Steps

1. Identify the config to document and trace its source per
   [Finding the source of truth](#finding-the-source-of-truth).
2. Decide file vs. subfolder per the grouping rule above. If a subfolder already
   exists for this family, add to it rather than creating a new sibling group.
3. Write the page(s) following [Anatomy of one config page](#anatomy-of-one-config-page).
4. Add/update the row in `docs/config/index.md` (and the group `index.md` if
   applicable) for every file you added or changed.
5. If this is the first config page ever added, also add the one-line pointer to
   `docs/consumers.md` per [Updating docs/consumers.md](#updating-docsconsumersmd).
   If it already exists, leave it alone.

## Keep the index in sync (non-negotiable)

Every file under `docs/config/` — including every child of a group — must have a
row in `docs/config/index.md`. When you add, rename, or remove a config page,
update that table in the same change. Prefer surgical edits: touch only the
row(s)/section(s) that actually changed, matching the existing density and tone
rather than rewriting the whole index.

## Verify

- Every claim about syntax in the page traces to an actual regex/tokenizer/parser
  method you can point at by file and method name — nothing paraphrased from
  a guess.
- Every example either came from an existing unit test or was traced by hand
  through the parser logic.
- Every file under `docs/config/**/*.md` has exactly one row in the nearest
  `index.md` above it, and every group `index.md` is itself linked from the root
  `docs/config/index.md`.
- Every `@`-link uses a repo-root-relative path and resolves to a real file.
- `docs/consumers.md` still has exactly one brief pointer to `docs/config/index.md`
  — no per-config summaries were added there.
