---
name: neptune-migrate-partial
description: Extract FreeMarker markup that is duplicated across multiple Liferay page fragments and/or display templates (SRT/CFT/nav) into ONE shared git-synced partial (a type=macro DDM template), then rewire every consumer to call it. Use whenever the same markup/logic appears in 2+ fragments or templates, when a fragment and a search/category/nav template render the same block, or when authoring a new fragment/template and you notice the markup already exists elsewhere and should be shared instead of copied. Companion to `liferay-fragment-developer` (which covers writing a single fragment); the partial's macro body obeys all of that skill's FreeMarker rules.
---

# Migrate shared markup into a partial

Turn duplicated FreeMarker markup — copied across fragments and display
templates — into **one** parametrized `<#macro>` in a git-synced **partial**,
consumed by every caller via `${nptPartialsPath}`. One source of truth; automatic
deploy-time sync; no more re-pasting.

## Read first (load on demand — don't inline into your reasoning)

- **Mechanics:** `@../neptune-liferay/docs/ddm-partials.md` — `config.yaml` schema,
  the `<#ftl>` tag-syntax rule, the relative-include→`${nptPartialsPath}/KEY`
  rewrite, build/deploy/sync, and the rename-before-sync gotcha. **Everything
  procedural lives there; this skill is the method.**
- **FreeMarker correctness:** the **`liferay-fragment-developer`** skill — typed
  `null` defaults, `?has_content`, single-markup-path, unique editable IDs,
  `@ftlvariable` headers. **The macro body must obey every one of those rules.**

Don't open the sync-engine Java or the cx-tooling builder — the doc summarizes them.

## Procedure

Each step is a gate: don't advance until it holds.

1. **Confirm it's worth it.** Pin down the exact duplicated span and the ≥2
   consumers that carry it. If it appears once, stop — no partial.

2. **Find the seam** — the one token-expensive design step; do it carefully, once.
   - Diff the duplicated spans. What is **identical** → the macro body. What
     **differs** between callers → macro **parameters**.
   - The macro is **presentation-only**: the *caller* resolves all data and passes
     **primitives**. Never pass a Java service object the macro would re-query.
   - Keep the parameter list **minimal**. Reusable shapes:
     - pass-through context — `namespace`, `locale`, `blockClass`
     - optional markup gated by a param with a **render-all default** — e.g.
       `permittedTitles=[]` (empty ⇒ render everything)
     - flags default off — `showFrequency=false`
     - recursion — the macro self-calls with an incrementing param (`depth+1`)
   - **Correctness bar:** markup and CSS class names stay **byte-identical** to the
     originals ⇒ no SCSS change, no visual diff.

3. **Create the partial** at `src/partials/<group>/<kebab-key>/`:
   - `config.yaml` — `templateType: macro`, UPPERCASE `templateKey`, name/description.
   - `template.ftl` — **starts with `<#ftl>`**, then the **macro doc block**
     (see *Macro doc block* below), then `<#macro <name> <params…>> … </#macro>`.
     The body is written in **angle-bracket** syntax regardless of caller — the
     `<#ftl>` header pins it. **Do not** add a comment explaining what `<#ftl>`
     does or the failure when it's omitted — that rule lives in the mechanics doc,
     not repeated in every file.

4. **Rewire each consumer** to include + call the macro, then **delete** the inline
   duplicate. In **both** trees you author a **relative include to the partial's
   `template.ftl`** — the build rewrites it to `${nptPartialsPath}/KEY`. **Never
   hand-write `${nptPartialsPath}` in source; that is an authoring error.** Only the
   caller's tag style differs, matching its own render mode:
   - **Template** (`src/templates/**`, angle):
     `<#include "../../../partials/<group>/<key>/template.ftl" />` → `<@name … />`.
   - **Fragment** (`src/fragments/**`, bracket):
     `[#include "../../../partials/<group>/<key>/template.ftl"]` → `[@name … /]`.
   - Both includes are rewritten by the same `rewriteImports` pass — a relative
     path that doesn't resolve to a known unit is a build error.
   - Leave **caller-only** logic in the caller: side-effecting setup calls,
     mock-item synthesis for the page editor, data resolution. Only the shared
     *markup* moves.

5. **Build & verify.** `cd client-extensions/neptune-ui && yarn build`. Confirm the
   partial and each template appear in
   `modules/neptune-ui-ddm-templates/build/ddm-templates/manifest.json`, and each
   generated display `.ftl` contains `${nptPartialsPath}/KEY`.

6. **Deploy & sync.** Deploy the CE + the delivery module, then
   `blade sh neptune:ddmTemplates:sync`. Expect the partial → **ADDED** and each
   template → **ADDED** (new) or **UPDATED** (adopted).

7. **Pre-existing UI-authored consumer?** If a consumer template already exists as
   a **UI-authored row** (auto-generated **numeric** key), it must be **renamed to
   its git key BEFORE the sync** or a duplicate is created. This is **per-environment
   and human-gated** — present the `inspect`/`rename` commands and let a human run
   them against a shared env. See the rename gotcha + runbook in the mechanics doc.

8. **Verify no diff** in the browser: same markup/classes, same behavior, across
   every consumer.

## Macro doc block

Every partial's `template.ftl` opens with a **JSDoc-style** doc comment — the
single source of truth for how to call the macro. Wrap it in the FreeMarker
comment (`<#-- … -->`), keep every line **≤ 120 columns**, and include **no**
boilerplate about the `<#ftl>` header.

```ftl
<#ftl>
<#--
  isaEventCard — shared event-card markup. Presentation-only: the caller resolves
  all data and passes primitives.

  @param {string} itemClassList - Full class list for the <li>.
  @param {string} [itemUrl] - Friendly URL; anchors only when set.
  @param {string} [title] - Card heading text.
  @param {string} [imageUrl] - Image URL; no image block when empty.
  @param {"vertical"|"horizontal"|"sidebar"} [listStyle="vertical"] - How the item is laid out.
  @param {boolean} [showImage=true] - Gate the image block.
-->
<#macro isaEventCard itemClassList itemUrl="" title="" imageUrl="" listStyle="vertical" showImage=true>
  …
</#macro>
```

Rules:

- **Type before name**, in braces: `@param {type} name - description`.
- **Optional** params (any with a macro default) wrap the name in `[brackets]`;
  **required** params (no default) are bare.
- A param with a default states it inside the brackets: `[listStyle="vertical"]`,
  `[showImage=true]` — match the literal to the macro signature's default.
- **String enums** are a union of quoted literals —
  `{"vertical"|"horizontal"|"sidebar"}`, not `{string}`.
- Common types: `{string}`, `{boolean}`, `{number}`, `{sequence}`, `{hash}`.
- **Terse descriptions**, separated from the name by ` - `; one line each, adding
  detail only when the meaning isn't obvious. **Don't align columns** — let each
  line run its natural length (wrapped at 120).

### Block macros: `@nested` and `@yields`

A macro that renders a `<#nested>` body slot documents it too:

- **`@nested - <desc>`** — one line, present whenever the macro calls `<#nested>`.
  Describes what the caller puts in the slot and any gating.
- **`@yields {type} name - <desc>`** — one per loop variable the macro passes via
  `<#nested a, b, …>`, in declaration order. Same grammar as `@param` (type before
  name, ` - ` separator, string enums as literal unions) but **no brackets** — loop
  variables are always positional. Omit entirely when `<#nested>` takes no args.

```ftl
<#--
  isaAccordion — shared accordion markup. Presentation-only.

  @nested - Markup for the content region of the accordion
-->

<#--
  isaNavList — renders <li> wrappers and yields each item to the caller's body.

  @param {sequence} items - Nav items to iterate.
  @yields {hash} item - The current nav item.
  @yields {number} index - Zero-based position in items.
-->
<#macro isaNavList items>
  <#list items as it><li><#nested it, it?index></li></#list>
</#macro>
```

Caller of a yielding macro catches the variables after `;`:
`<@isaNavList items ; item, index> … </@isaNavList>`.

## Worked example

`isa-article-card` (`client-extensions/neptune-ui/src/partials/cards/isa-article-card`)
— one `<#macro isaArticleCard>` rendering the shared `<li class="isa-article-card">`
from pre-resolved primitives. Consumed by the `isa-article-card-list` **fragment**
and the **SRTs** — both via a relative
`[#include "../../../partials/cards/isa-article-card/template.ftl"]` (bracket) /
`<#include "…/template.ftl" />` (angle) that the build rewrites to
`${nptPartialsPath}/ISA-ARTICLE-CARD`. Its `template.ftl` opens with the standard
**macro doc block** (above) — read it for the shape to follow.

## Checklist

- [ ] Duplication is real (≥2 consumers); the exact span is identified.
- [ ] Macro is presentation-only; caller passes primitives (no service objects).
- [ ] Parameters minimal; optional markup gated by render-all defaults.
- [ ] `template.ftl` starts with `<#ftl>`; angle-syntax macro body; no `<#ftl>`
      boilerplate comment.
- [ ] Macro doc block present: JSDoc `@param {type} [name=default] - terse desc`,
      type before name, optionals bracketed, string enums as literal unions, ≤120 cols.
- [ ] If the macro renders `<#nested>`: `@nested` line present; each `<#nested>` loop
      variable documented with `@yields {type} name - desc` (no brackets, positional order).
- [ ] Markup + CSS classes byte-identical to the originals (no SCSS change).
- [ ] Each consumer authors a **relative** include to the partial's `template.ftl`
      (fragment `[#include "…/template.ftl"]`; template `<#include "…/template.ftl" />`)
      — never a hand-written `${nptPartialsPath}`; the build rewrites both.
- [ ] Caller-only setup (side effects, mock synthesis, data resolution) stayed in
      the caller.
- [ ] Macro body obeys `liferay-fragment-developer` (typed defaults, `?has_content`,
      unique/indexed editable IDs, `@ftlvariable`).
- [ ] `manifest.json` lists the partial + templates; deploy+sync report the expected
      ADDED/UPDATED.
- [ ] Any pre-existing numeric-key rows renamed before sync (human-gated,
      per-environment).
- [ ] No visual diff in the browser.
