---
name: create-neptune-search-contributor
description: Scaffold a NeptuneSearchContributor — a small, generic, JSON-configurable Java @Component that shapes a search query for one portlet instance. Use this whenever you need to add, modify, or filter a Liferay search query (add a filter clause, boost, term, category constraint, etc.) and want it to be reusable and configurable per portlet instance via the Search Options portlet's config UI, rather than a one-off hardcoded PortletSharedSearchContributor.
---

# Create a NeptuneSearchContributor

A `NeptuneSearchContributor` is a **shallow, single-purpose wrapper around
Liferay's `PortletSharedSearchContributor`** that earns its keep through one
thing: **per-portlet-instance JSON configuration**.

Normally a `PortletSharedSearchContributor` is hardwired to a portlet and its
behavior is fixed in code. The Neptune layer inverts that. A single dispatcher,
`NeptuneSearchOptionsPortletSharedSearchContributor`, reads a `customContributors`
JSON array from the **Search Options portlet's instance configuration** (set in
the page builder UI), looks up each named contributor in an OSGi
`ServiceTrackerMap`, and calls it with the per-instance `options` JSON. The
result: one contributor class can be **placed on many pages, even multiple times
on the same page, each instance configured differently** — without touching Java.

That is the whole point of this pattern, and it dictates the prime directive:

> ## ⭐ Prime directive: generic, configurable, reusable
>
> A `NeptuneSearchContributor` you write should be usable by someone who has
> **only the config UI and a JSON blob** — no recompile. Push *everything that
> could reasonably vary* into the `options` JSONObject: field names, values,
> boost weights, occur type, source, expressions, toggles. Hardcode as little as
> possible. If two desired behaviors differ only by a constant, they are **one**
> configurable contributor, not two. Resist baking in a specific field name, a
> specific category, or a specific portal's assumptions — that turns a reusable
> tool into a one-off.

## The contract

Implement the interface (`com.neptune.common.search.web.contributors.NeptuneSearchContributor`):

```java
public interface NeptuneSearchContributor {
    void contribute(
        PortletSharedSearchSettings portletSharedSearchSettings,
        SearchRequest searchRequest,   // may be null — always null-check before use
        JSONObject options             // the per-instance config from the JSON blob
    );
}
```

- `portletSharedSearchSettings` — the gateway to mutate the query. Get the
  builder via `portletSharedSearchSettings.getSearchRequestBuilder()` and add
  query parts, toggle source/highlighting, etc.
- `searchRequest` — the pre-existing request (e.g. from URL params). **It can be
  `null`**; guard against it before dereferencing, as `CategoryIdSearchContributor`
  does.
- `options` — your per-instance configuration. **This is where all variability
  lives.** Read every tunable from here with a sensible default.

## Registration (this is what makes it discoverable + configurable)

Register as a `NeptuneSearchContributor` service, keyed by its **fully-qualified
class name** via the `NEPTUNE_SEARCH_CONTRIBUTOR_KEY` property. The dispatcher's
`ServiceTrackerMap` is keyed on exactly that property, and the `"class"` value in
the config JSON is matched against it:

```java
import com.liferay.petra.string.StringPool;
import static com.neptune.common.search.web.portlet.constants.NeptuneSearchOptionsPortletKeys.NEPTUNE_SEARCH_CONTRIBUTOR_KEY;

@Component(
    property = NEPTUNE_SEARCH_CONTRIBUTOR_KEY + StringPool.EQUAL + "com.neptune.common.search.contributors.query.MyThingSearchContributor",
    immediate = true,
    service = NeptuneSearchContributor.class
)
public class MyThingSearchContributor implements NeptuneSearchContributor { ... }
```

The property value (the FQCN) **must match the string a content author will put
in the JSON `"class"` field.** Keep them identical; using the literal FQCN is the
convention in the existing contributors.

## How it gets invoked at runtime — the JSON config

The Search Options portlet has an instance config field, `customContributors`
(a `[]`-defaulted textarea in `configuration.jsp`). An author fills it with an
array of `{class, options}` objects (each entry may also carry an optional
top-level `enabled` boolean, default `true`):

```json
[
  {
    "class": "com.neptune.common.search.contributors.query.ArticleIdSearchContributor",
    "options": { "fieldName": "articleId_String_sortable" }
  },
  {
    "class": "com.neptune.common.search.contributors.query.CategoryIdSearchContributor",
    "options": {
      "fieldName": "assetCategoryIds",
      "source": "Layout",
      "expression": "{{categoryId}}"
    },
    "enabled": false
  }
]
```

The dispatcher parses this array, resolves each `"class"` against the service
tracker map, and calls `contribute(...)` with that entry's `"options"`. Note the
same class can appear multiple times with different `options` — design for that.
An entry with `"enabled": false` is skipped entirely (left in the config but not
applied), so authors can toggle a contributor off without deleting its config.

## Reference implementations (read these first)

In `modules/neptune-common/neptune-common-search/neptune-common-search-contributors/src/main/java/com/neptune/common/search/contributors/query/`:

- **`ArticleIdSearchContributor.java`** — the minimal, canonical example. Reads
  one `fieldName` from `options`, adds a `term` filter on the current display
  page's article id. Start here.
- **`CategoryIdSearchContributor.java`** — a richer example: validates several
  `options` (`fieldName`, `expression`, `source` against a whitelist), pulls
  context from the display page, builds a complex query. Shows graceful
  validation and `@Reference` service injection.
- **`NeptuneSearchOptionsPortletSharedSearchContributor.java`** — the dispatcher.
  Read it to understand how your contributor is discovered and called; you
  normally do **not** modify it.

## Defensive coding (every contributor should do this)

Because `options` comes from hand-edited JSON in a UI, treat it as untrusted:

- Read each value with a default: `options.getString("fieldName", StringPool.BLANK)`.
- Validate required inputs; if missing/invalid, `_log.warn(...)` a clear message
  and **`return` (skip the contribution) rather than throw**. The dispatcher
  wraps each call in try/catch, but a clean skip with a logged reason is far
  easier to debug from the page than a stack trace.
- Whitelist enum-like options (see `VALID_SOURCES` in `CategoryIdSearchContributor`).
- Null-check `searchRequest` before using it.
- Diagnostics go to `_log`; this runs server-side during search, so there is no
  STDOUT channel.

## Where to put the file

Resolve the location in this priority order:

1. **The user said where it goes.** This always wins — honor it exactly, even if
   it contradicts the heuristics below.
2. **Generic, reusable contributor → Neptune.** If the contributor has a generic
   use case and is *not* specific to one consumer portal, it belongs in Neptune
   so every consuming project can reuse it. The canonical home is
   `com.neptune.common.search.contributors.query` in
   `modules/neptune-common/neptune-common-search/neptune-common-search-contributors` —
   alongside the existing query contributors. (The `NeptuneSearchContributor`
   interface itself and the dispatcher live in `neptune-common-search-web`.)
3. **Feature-specific contributor → the consumer portal's feature module.** If it
   is tied to a feature being built in a consumer portal (e.g. isa-portal) and
   encodes that portal's specific fields/assumptions, create it in that feature's
   own module so it ships and versions with the code it supports. That module
   must depend on `neptune-common-search-web` (or the artifact exporting the
   `NeptuneSearchContributor` interface and the `NEPTUNE_SEARCH_CONTRIBUTOR_KEY`
   constant) and be able to host a DS component.
4. **Unsure → default to `com.neptune.common.search.contributors.query`** in
   `neptune-common-search-contributors`.

Bias toward Neptune when in doubt about a genuinely generic contributor — but if
the contributor only makes sense for one portal's data model, keep it in that
portal. Think about the contributor's purpose and reusability before placing it.

## Steps

1. **Decide reusability and pick the module** using the priority list above.
2. **Add the class** under that module's `src/main/java/<package>/`, implementing
   `NeptuneSearchContributor`. Match the package to its location. Read every
   tunable from `options`; hardcode as little as possible (prime directive).
3. **Register it** with `@Component(service = NeptuneSearchContributor.class, ...)`
   and the `NEPTUNE_SEARCH_CONTRIBUTOR_KEY=<FQCN>` property. Keep the property's
   FQCN identical to the class's real FQCN.
4. **Inject** any Liferay services you need via `@Reference` (e.g.
   `ComplexQueryPartBuilderFactory` to build query parts).
5. **Build & deploy** so the component registers in the running JVM:
   - In **neptune-liferay**: `./gradlew deploy` (see CLAUDE.md / `gradle-local.properties`).
   - In a **consumer portal module**: `blade gw deploy` from that workspace.
6. **Configure a Search Options portlet instance** to use it: in the page editor,
   open the portlet's configuration, and add an entry to the `customContributors`
   JSON array with your `"class"` (the FQCN) and its `"options"`.

## Document it (required)

Whenever you add a **new** `NeptuneSearchContributor` (or change an existing
one's options/behavior), update the catalog so the next person/agent can discover
and use it correctly:

1. **Add (or update) its entry in `docs/search-contributors.md`** — the reference doc
   that lives with the contributors at
   `docs/search-contributors.md`.
   Match the existing format: a row in the "at a glance" table **and** a full
   section (purpose, an options table, and at least one worked example). Keep it
   accurate to the code — option names, defaults, and behavior.
2. **Keep existing entries current.** If your change alters another contributor's
   options or behavior, fix that entry too. This file is the source of truth for
   how these contributors are configured; a stale entry is a bug.
3. **Record the upkeep expectation in memory.** Ensure a memory exists stating
   that `docs/search-contributors.md` must be kept up to date whenever a Neptune search
   contributor is added or edited (create the memory if it's missing). This
   persists the practice across sessions so the catalog doesn't drift.

## Verify

- Confirm the bundle deployed and is ACTIVE: `blade sh lb | grep <bundle>`.
- Confirm the service registered under the expected key. If the dispatcher logs
  `No NeptuneSearchContributor found for class: <FQCN>`, the property value
  doesn't match the `"class"` in the JSON, or the component didn't register
  (check the `@Component` annotation, that the module is ACTIVE, and that DS
  resolved all `@Reference`s).
- Run a search on the page and confirm the query is shaped as intended. Watch the
  server log (`bundles/tomcat/logs/`) for your `_log` warnings if a contribution
  is being skipped — a skipped contribution usually means an `options` value was
  missing or failed validation.
- Re-test with a second portlet instance using *different* `options` to confirm
  the contributor is genuinely generic and instance-configurable.
