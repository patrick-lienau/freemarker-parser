---
name: liferay-fragment-developer
description: Author and fix Liferay page-fragment FreeMarker templates (the `index.html` of a fragment under `client-extensions/neptune-ui/src/fragments/**`). Use whenever you write, edit, review, or debug a fragment template — especially for the fragment build/html check failures ("unique ID for each editable element", missing-variable errors), null-safety bugs, duplicated markup branches, or when adding `@ftlvariable` intellisense headers. Covers the Neptune global template-helper catalog and the per-portal `docs/ftl-variables.md` index.
---

# Liferay Fragment Developer

This skill is for working on **Neptune UI page fragments** — the FreeMarker
templates that render editable content blocks in Liferay's page editor. A
fragment lives in a consumer portal at:

```
client-extensions/neptune-ui/src/fragments/<collection>/<fragment-name>/
  index.html         ← the FreeMarker template (what this skill is mostly about)
  configuration.json ← the `configuration.*` fields exposed in the editor sidebar
  fragment.json      ← metadata (name, type)
  styles.scss        ← styles
  index.ts           ← optional client-side behavior
```

## 30-second primer

**Liferay fragments** are reusable content blocks placed on pages. The editor
lets content authors edit marked-up regions (**editables**) and set
**configuration** options. The template is rendered server-side with FreeMarker.

**FreeMarker** here uses **square-bracket syntax** (`[#if]`, `[#list]`,
`[#assign]`) and `${...}` interpolation. The template has access to:

- `configuration.*` — the fields declared in `configuration.json`.
- `locale`, `themeDisplay` — standard Liferay context.
- `collectionObjectList` — the items, when the fragment is in a collection display.
- A large set of **Neptune template helpers** injected globally (see the catalog
  below) plus any consumer-portal helpers.

The fragment is validated by an HTML check at build time. The most common failure
this skill fixes:

> `You must define a unique ID for each editable element.`

---

## The rules

These are the non-negotiables. Most fragment bugs are a violation of one of them.

### 1. FreeMarker has no `null` — never assume a Java call returns a value

Java methods return `null`; FreeMarker treats a `null` as a **missing variable**
and throws the moment you touch it. Every value that comes from a Java call or an
optional field **must** carry a default with the **correct data type**:

| Expected type | Default guard |
|---|---|
| String        | `!""`         |
| Hash / object | `!{}`         |
| Sequence      | `![]`         |
| Boolean       | `!false`      |
| Number / id   | `!-1` (or `!0`) |

Then test presence with **`?has_content`** — it is the preferred check; it is
true for non-empty strings, non-empty sequences/hashes, and defined scalars, and
false for `""`, `[]`, `{}`, and missing values.

```ftl
[#-- GOOD --]
[#assign summary = DDMLookupHelper.getLocalizedDDMFieldValue(article, ref, locale)!""]
[#if summary?has_content]
  <div class="summary">${summary}</div>
[/#if]

[#-- BAD — explodes if the helper returns null --]
[#assign summary = DDMLookupHelper.getLocalizedDDMFieldValue(article, ref, locale)]
<div class="summary">${summary}</div>
```

Chain guards when you drill into an object that may itself be absent:

```ftl
[#if (((professional.profileImage.url)!"")?has_content)] ... [/#if]
```

### 2. Initialize every variable at the top level with a typed default

FreeMarker lets you first-`[#assign]` a variable inside an `[#if]`/`[#list]` and
read it later at an outer scope — but if execution never reaches that branch, the
later read throws a missing-variable error. **Any variable read outside the block
that first assigns it must be initialized at the top-level scope**, with a default
of the right type (see the table above).

```ftl
[#-- GOOD — declared up top, conditionally overwritten, always safe to read --]
[#assign imageUrl = ""]
[#assign imageFileEntryId = -1]
[#if showImage]
  [#assign imageUrl = imageMeta.url!""]
[/#if]
[#if imageUrl?has_content] <img src="${imageUrl}"> [/#if]

[#-- BAD — imageUrl only exists when showImage was true --]
[#if showImage]
  [#assign imageUrl = imageMeta.url!""]
[/#if]
[#if imageUrl?has_content] ... [/#if]   [#-- missing-variable error when !showImage --]
```

### 3. Whenever possible, render ONE markup path — don't duplicate the markup per branch

A fragment that copies its whole `<div>…</div>` into a "real data" branch, a
"manual/placeholder" branch, and an "editor preview" branch is a maintenance trap
and a source of duplicate-ID errors. Instead, **compute the display values first
(with placeholders for editor/mock mode), then render the markup exactly once.**

`isa-article-card-list` (in isa-portal) is the reference implementation. Its shape:

```ftl
[#-- 1. derive a mock flag from editor state + whether real data exists --]
[#assign mockItems = false]
[#if NeptuneTemplateHelper.isPageEditorActive()]
  [#if !collectionObjectList?? || collectionObjectList?size == 0]
    [#assign mockItems = true]
  [/#if]
  [#if mockItems]
    [#-- synthesize placeholder items so the editor shows something --]
    [#assign collectionObjectList = []]
    [#list 0..configuration.itemCount - 1 as idx]
      [#assign collectionObjectList = collectionObjectList + [{}]]
    [/#list]
  [/#if]
[/#if]

[#list collectionObjectList as item]
  [#-- 2. top-level defaults, then fill from mock OR real data --]
  [#assign title = ""]
  [#if mockItems]
    [#assign title = "Placeholder Title"]
  [#else]
    [#assign title = item.getTitle(locale, true)!""]
  [/#if]

  [#-- 3. ONE block of markup, driven by the derived values --]
  <li>[#if title?has_content]<h3>${title}</h3>[/#if]</li>
[/#list]
```

The value-selection `[#if mockItems]…[#else]…[/#if]` lives around **assignments**,
not around **markup**. The markup appears once.

> **Shared across fragments/templates?** Rule 3 dedups markup *within* one
> fragment. When the **same** markup is copied across **multiple** fragments and/or
> display templates (SRT/CFT/nav), don't copy it again — extract it into one shared
> `<#macro>` **partial** and include it with a **relative path to its
> `template.ftl`** (`[#include "../../../partials/<group>/<key>/template.ftl"]`) —
> the build rewrites that to the runtime `${nptPartialsPath}/KEY`; never hand-write
> `${nptPartialsPath}` in source. Use the
> **`neptune-migrate-partial`** skill; the mechanics (partial `config.yaml`, the
> `<#ftl>` tag rule, the include-rewrite, build/deploy/sync) are in
> `@../neptune-liferay/docs/ddm-partials.md`. `isa-article-card` is the reference
> partial. A partial's macro body still obeys every rule in this skill — the
> examples below are shown in fragment (bracket) syntax; in an angle-mode partial
> translate `[#…]` → `<#…>` (see the partial skill for details). Document the
> macro with a JSDoc-style doc block — `@param {type} [name=default] - terse desc`
> (type before name, optionals bracketed, string enums as literal unions like
> `{"a"|"b"}`, ≤120 cols; a `<#nested>` slot gets `@nested` and each yielded loop
> variable an `@yields {type} name - desc`) — and add **no** comment explaining the
> `<#ftl>` header. Full spec in **`neptune-migrate-partial`**.

### 4. Editable IDs must be unique — index them inside loops

Every editable needs a unique ID across the **entire rendered output** of the
fragment. Two ways to mark an editable:

```html
<lfr-editable id="08-quote" type="rich-text">…</lfr-editable>
<span data-lfr-editable-id="03-title" data-lfr-editable-type="text">…</span>
```

Inside a `[#list]`, a static ID repeats every iteration → build failure. Append
the loop index:

```ftl
[#list people as person]
  <lfr-editable id="08-quote-${person?index}" type="rich-text">…</lfr-editable>
  <span data-lfr-editable-id="03-title-${person?index}" data-lfr-editable-type="text">…</span>
[/#list]
```

Also watch for the **same ID reused across sibling branches** of the template
(e.g. a "single" branch and a "manual" branch both using `04-location`). Even
though only one renders at runtime, keep them distinct to be safe and to satisfy
the static check. Editable `type` values: `text`, `rich-text`, `image`, `link`,
`html`, `backgroundImage`.

### 5. Understand the flow before editing — kill dead branches and redundancy

Before changing a fragment, trace the top-level branching (`configuration.*`
switches, `cardSource`-style modes, editor-active checks). Look for:

- Branches that can never be reached (a condition already guaranteed by an outer
  `[#if]`, e.g. `[#if cardSource == 'single']` nested inside a block already
  guarded by `cardSource == 'single'`).
- Values recomputed identically in multiple branches — hoist them up.
- Placeholder/example markup that duplicates the real markup (see rule 3).

Simplify to the smallest correct execution tree, then make your change.

### 6. Add `@ftlvariable` intellisense headers (see next section)

### 7. Formatting: 2-space indent, wrap at 120 columns

Indent nested FreeMarker directives and HTML by 2 spaces. Wrap long lines at 120
columns. Match the surrounding file if it is already consistent.

---

## `@ftlvariable` headers and the variable catalog

**Always add `@ftlvariable` comments at the top of a fragment** (unless told not
to). They give editor intellisense for the injected helpers and document what the
template depends on. Syntax:

```ftl
[#-- @ftlvariable name="NeptuneTemplateHelper" type="com.neptune.ui.templates.helpers.TemplateHelperUtil" --]
[#-- @ftlvariable name="professionalProfileDisplayPageHelper" type="com.avisonyoung.portal.professional.profile.ProfessionalProfileDisplayPageHelper" --]
```

Add one line per helper/variable the template actually uses. Don't dump the entire
catalog into every file — only what's referenced.

### How to find the type of a variable (cheapest first)

1. **This skill's Neptune catalog** (below) — covers everything injected by
   `neptune-liferay`. Free; no searching.
2. **The consumer portal's `docs/ftl-variables.md`** — the per-portal index of
   symbols that portal injects. Check it before searching.
3. **Only if not found in 1 or 2**, discover it, then **record it** (see below).

### Discovering a portal-specific variable

Portal helpers are injected by classes implementing
`com.liferay.portal.kernel.template.TemplateContextContributor` (usually named
`*ContextContributor` / `*TemplateContextContributor`), which do:

```java
contextObjects.put("professionalProfileDisplayPageHelper", _professionalProfileDPH);
```

⚠️ **The map parameter is not always named `contextObjects`** — it may be `ctx`,
`contextMap`, etc. So grep for the **string literal**, not the variable name:

```bash
# find where an FTL var name is registered, then read the field's type + import
grep -rn '"professionalProfileDisplayPageHelper"' <portal>/modules --include=*.java
```

Do **one** targeted search per unknown symbol — don't crawl. Resolve the field's
declared type to a FQN (check the file's `import` for that type; if there's no
import it's in the same package as the contributor).

### Keep the indexes current

- If the symbol belongs to **neptune-liferay** (package starts with
  `com.neptune.`), update the **catalog in this skill** if it's new/changed/removed.
- If the symbol belongs to the **consumer portal**, add/update a row in that
  portal's **`docs/ftl-variables.md`** — a plain `name → fully.qualified.ClassName`
  mapping, no descriptions. Create the file if it doesn't exist:

### Liferay / Java built-ins

| FreeMarker name | Type (FQN) |
|---|---|
| `locale` | `java.util.Locale` |
| `themeDisplay` | `com.liferay.portal.kernel.theme.ThemeDisplay` |
| `htmlUtil` | `com.liferay.portal.kernel.util.HtmlUtil` |
| `languageUtil` | `com.liferay.portal.kernel.language.LanguageUtil` |
| `arrayUtil` | `com.liferay.portal.kernel.util.ArrayUtil` |
| `jsonFactoryUtil` | `com.liferay.portal.kernel.json.JSONFactoryUtil` |
| `serviceContext` | `com.liferay.portal.kernel.service.ServiceContext` |
| `dateUtil` | `com.liferay.portal.kernel.util.DateUtil` |
| `portalUtil` | `com.liferay.portal.kernel.util.PortalUtil` |
| `stringUtil` | `com.liferay.portal.kernel.util.StringUtil` |
| `httpUtil` | `com.liferay.portal.kernel.util.Http` |

### Neptune global catalog

All of these are available in every fragment of any Neptune consumer portal.
Aliases (two names for one helper) are ignored if they use the old *Util convention.

| FreeMarker name(s) | Type (FQN) |
|---|---|
| `NeptuneTemplateHelper` | `com.neptune.ui.templates.helpers.TemplateHelperUtil` |
| `JournalArticleTemplateHelper` | `com.neptune.ui.templates.helpers.JournalArticleTemplateHelperUtil` |
| `DDMDocumentHelper` | `com.neptune.ui.templates.helpers.DDMDocumentHelperUtil` |
| `AssetCategoryTemplateHelper` | `com.neptune.ui.templates.helpers.AssetCategoryTemplateHelper` |
| `AssetEntryTemplateHelper` | `com.neptune.ui.templates.helpers.AssetEntryTemplateHelper` |
| `LayoutTemplateHelper` | `com.neptune.ui.templates.helpers.LayoutTemplateHelper` |
| `SegmentedContentHelper` | `com.neptune.ui.templates.helpers.segments.SegmentedContentHelper` |
| `DDMLookupHelper` | `com.neptune.common.article.DDMLookupHelper` |
| `ArticleRefMapper` | `com.neptune.common.article.ArticleRefMapper` |
| `StructureKeyAliasHelper` | `com.neptune.common.article.structure.StructureKeyAliasHelper` |
| `AdjacentArticlesHelper` | `com.neptune.common.article.util.AdjacentArticlesHelper` |
| `ArticleContentTypeHelper` | `com.neptune.common.article.categorizer.ArticleContentTypeHelper` |
| `NamedCategoryHelper` | `com.neptune.common.category.NamedCategoryHelper` |
| `NamedVocabHelper` | `com.neptune.common.category.NamedVocabHelper` |
| `CategoryAugmentHelper` | `com.neptune.category.augment.util.CategoryAugmentHelper` |
| `AppliedFacetsHelper` | `com.neptune.common.search.facet.applied.AppliedFacetsHelper` |
| `AssetCategoryTreeHelper` | `com.neptune.common.search.facet.category.AssetCategoryTreeHelper` |
| `URLDisplayHelper` | `com.neptune.common.util.URLDisplayHelper` |
| `HashHelper` | `com.neptune.common.util.HashHelper` |
| `CollectionConfigHelper` | `com.neptune.collections.configurator.CollectionConfigHelper` |
| `CollectionPassthroughHelper` | `com.neptune.collections.util.CollectionPassthroughHelper` |

> Source of truth: the `*ContextContributor` classes under
> `neptune-liferay/modules/**` with `property = { "type=" + TemplateContextContributor.TYPE_GLOBAL }`.
> If you touch those, update this table.

---

## Good vs. bad, at a glance

| ❌ Bad | ✅ Good |
|---|---|
| `[#assign x = someJavaCall()]` | `[#assign x = someJavaCall()!""]` (typed default) |
| `[#if x?exists]` / `[#if x??]` scattered | `[#if x?has_content]` |
| Variable first assigned inside `[#if]`, read outside | Declared with default at top level, overwritten in branch |
| Whole markup block copied into real/manual/preview branches | Values chosen per-branch, markup written once |
| `id="08-quote"` inside a `[#list]` | `id="08-quote-${item?index}"` |
| Nested `[#if cardSource=='single']` inside a `single`-only block | Dead branch removed |
| No header comments | `@ftlvariable` lines for every used helper |

---

## Review checklist (run before finishing)

- [ ] Every Java-derived value has a typed default (`!""`, `!{}`, `![]`, `!false`, `!-1`).
- [ ] Presence tested with `?has_content`.
- [ ] Every variable read at a scope is initialized (typed default) at the top level.
- [ ] Markup rendered once; no duplicated blocks across branches.
- [ ] Dead/unreachable branches and redundant recomputation removed.
- [ ] Editable IDs unique everywhere; loop editables suffixed with `?index`.
- [ ] `@ftlvariable` header present for every helper/variable used.
- [ ] Neptune catalog (this skill) and/or the portal's `docs/ftl-variables.md` updated for any new symbol.
- [ ] 2-space indent, wrapped at 120 columns.
- [ ] Fragment build/html check passes.
