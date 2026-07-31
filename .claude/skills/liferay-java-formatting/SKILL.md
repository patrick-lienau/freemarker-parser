---
name: liferay-java-formatting
description: Java code style and formatting conventions for Liferay/OSGi code in Neptune and its consumer portals — line length, line-break/wrapping rules for method signatures, invocations, assignments, conditionals, and chained calls; private member and @Reference naming; DSL Query API over DynamicQuery; logging and entity-reference conventions; and else/catch brace placement. Use whenever writing, reviewing, or reformatting Java in this workspace, or when the user asks how code should be formatted.
---

# Liferay Java Formatting

The formatting and style conventions below apply to all Java code in Neptune and
its consumer portals (isa, chroa, cbdce, ay, aoc, …). Apply them when authoring
new Java, reviewing a diff, or reformatting existing code. Each rule shows a
❌ Bad / ✅ Good pair — match the Good form.

These conventions intentionally differ from Liferay's own source formatter in
places (e.g. closing `)` placement on wraps). When in doubt, follow the examples
here, not Liferay portal source.

## Line Length

Generally — but not always — most lines should be wrapped to **120 characters**.
Treat this as a strong default rather than a hard rule: prefer wrapping (per the
line-break rules below) when a line exceeds 120 characters, but allow the
occasional longer line where wrapping would hurt readability.

## Private Member Naming

Private methods and properties must **not** be prefixed with `_`. The only
exception is `private static final` fields which represent constants (e.g.
`DEFAULT_MAX_ITEMS`), which retain the underscore-free uppercase convention.
** It is almost always an error to prefix anything with `_`, avoid this. _log is the only exception. **

❌ Bad:
```java
private Layout _getDisplayPageLayout() { … }
```

✅ Good:
```java
private Layout getDisplayPageLayout() { … }
```

## Class Declaration Line Breaks

Keep the `extends` and `implements` clauses on the same line as the class
declaration. Only wrap when they would **otherwise cause the line to exceed 120
characters**. When a wrap is required, move the clause(s) to a new line indented
**only 4 spaces** — do not indent further to align under the class name.

❌ Bad — wrapped even though it fits on one line:
```java
public class ProductSitemapURLProvider
    extends AbstractSitemapURLProvider {
```

❌ Bad — over-indented continuation:
```java
public class TrainingSitemapURLProvider
        extends AbstractSitemapURLProvider
        implements SitemapURLProvider {
```

✅ Good — fits on one line, so it stays there:
```java
public class ProductSitemapURLProvider extends AbstractSitemapURLProvider {
```

✅ Good — would exceed 120 characters, so the clause wraps to a new line indented 4 spaces:
```java
public class TrainingSitemapURLProvider
    extends AbstractSitemapURLProvider implements SitemapURLProvider {
```

## Method Signature Line Breaks

When a method signature must wrap to a second line, parameters are indented 4
spaces. The closing `)` goes on its own line at the same indentation level as the
visibility modifier. A `throws` clause follows on the same line as the closing
`)`.

❌ Bad:
```java
public void visitLayoutSet(
        Element element, LayoutSet layoutSet, ThemeDisplay themeDisplay)
    throws PortalException {
```

✅ Good:
```java
public void visitLayoutSet(
    Element element, LayoutSet layoutSet, ThemeDisplay themeDisplay
) throws PortalException {
```

## Method Invocation Line Breaks

When a method call must wrap to multiple lines, each argument goes on its own line
indented 4 spaces. The closing `)` goes on its own line at the same indentation
level as the start of the call.

❌ Bad:
```java
visitTrainings(
    element, layoutSet, themeDisplay,
    getDisplayPageTrainings(layout));
```

✅ Good:
```java
visitTrainings(
    element,
    layoutSet,
    themeDisplay,
    getDisplayPageTrainings(layout)
);
```

## Wrapping a Method Call (Assignments, Returns, Arguments)

When a single (non-chained) method call is assigned to a variable and must wrap
(i.e. the statement would otherwise exceed 120 characters), do **not** break after
the `=`. Keep the call on the assignment line and move its arguments onto a wrapped
line indented 4 spaces, with the closing `);` on its own line at the declaration's
indentation level.

Keep the arguments together on that single wrapped line. Only if the arguments
would **themselves exceed 120 characters** on one line does each argument go on its
own line.

❌ Bad — breaks after `=`:
```java
AssetDisplayPageEntry assetDisplayPageEntry =
        assetDisplayPageEntryLS.fetchAssetDisplayPageEntry(
            groupId, classNameId, training.getTrainingId());
```

✅ Good — arguments fit on one wrapped line:
```java
AssetDisplayPageEntry assetDisplayPageEntry = assetDisplayPageEntryLS.fetchAssetDisplayPageEntry(
    groupId, classNameId, training.getTrainingId()
);
```

✅ Good — arguments would exceed 120 characters, so each goes on its own line:
```java
JournalArticle article = journalArticleLS.updateArticle(
    serviceContext.getUserId(),
    groupId,
    folderId,
    article.getArticleId(),
    article.getVersion(),
    titleMap,
    descriptionMap,
    contentXml,
    serviceContext
);
```

The same logic applies wherever a method is invoked — not just assignments. In a
`return` statement, as an argument to another call, in a `throw`, and so on: keep
the call on the opening line, keep the arguments together on one wrapped line, and
break to one-argument-per-line only when that line would itself exceed 120
characters.

✅ Good — `return` with arguments on one wrapped line:
```java
return journalArticleLS.fetchLatestArticle(
    groupId, JournalArticleConstants.CLASSNAME_ID_DEFAULT, articleId
);
```

✅ Good — `return` whose arguments exceed 120 characters, so each goes on its own line:
```java
return journalArticleLS.getArticle(
    themeDisplay.getScopeGroupId(),
    JournalArticleConstants.CLASSNAME_ID_DEFAULT,
    article.getArticleId(),
    article.getVersion(),
    WorkflowConstants.STATUS_APPROVED
);
```

## Wrapping Conditional Expressions

When the expression inside an `if` (or similar) must wrap, put the opening `if (`
on its own line, the condition indented 4 spaces on its own line, and `) {` on its
own line. Do not leave a fragment of the condition dangling next to `if (`.

❌ Bad:
```java
if (assetDisplayPageEntry != null && assetDisplayPageEntry.getType() ==
        AssetDisplayPageConstants.TYPE_NONE) {

    return null;
}
```

✅ Good:
```java
if (
    assetDisplayPageEntry != null
    && assetDisplayPageEntry.getType() == AssetDisplayPageConstants.TYPE_NONE
) {
    return null;
}
```

## Chained Method Calls in Assignments

When a chain of method calls assigned to a variable must wrap to multiple lines,
wrap the entire chain in parentheses. The first call opens on the same line as the
assignment with `(`, each subsequent chained call is indented 4 spaces from the
variable declaration, and the closing `);` sits on its own line at the
declaration's indentation level.

❌ Bad:
```java
String ids = invalidTemplateIds.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(", "));
```

✅ Good:
```java
String ids = (invalidTemplateIds.stream()
    .map(String::valueOf)
    .collect(Collectors.joining(", "))
);
```

## String Concatenation

Only wrap a string concatenation when it would **otherwise exceed 120
characters** — a concatenation that fits on one line stays on one line. When it
does wrap, put **each operand on its own line with the `+` leading** the line (never
trailing). Do not indent operands progressively; keep them aligned.

❌ Bad — trailing `+`, multiple operands per line, inconsistent indentation:
```java
_log.error(
    "Error adding sitemap entry for " +
        getClassName() + "[" + getEntityId(entity) + "]",
    exception
);
```

✅ Good — one operand per line, `+` leading:
```java
_log.error(
    "Error adding sitemap entry for "
    + getClassName()
    + "["
    + getEntityId(entity)
    + "]",
    exception
);
```

The same shape applies outside a method invocation. When the concatenation is
assigned (or returned), wrap the whole expression in parentheses — like the
Chained Method Calls rule: the first operand opens on the line after `(`, each
subsequent operand leads with `+` indented 4 spaces from the declaration, and the
closing `);` sits on its own line at the declaration's indentation level.

✅ Good — paren-wrapped concatenation in an assignment:
```java
String url = (
    protocol
    + "://"
    + getDomain()
    + "/"
    + getFriendlyUrlSeparator()
    + "/"
    + getFriendlyUrl()
);
```

## `@Reference` Field Conventions

`@Reference`-injected OSGi components must be declared at the **bottom** of the
class and **must not carry an `_` prefix.**

Field names follow a specific abbreviation scheme:
- **Entity names are never abbreviated.**
- The following **suffix types only** may be abbreviated to their initials:

  | Full suffix | Abbreviation |
  |---|---|
  | `LocalService` | `LS` |
  | `BuilderFactory` | `BF` |
  | `ConfigManager` | `CM` |
  | `TemplateHelper` | `TH` |

❌ Bad: has a leading underscore and abbreviated entity name:
```java
@Reference
private JournalArticleLocalService _jals;
```

✅ Good:
```java
@Reference
private JournalArticleLocalService journalArticleLS;
```

## Query API

Use the **DSL Query API** instead of `DynamicQuery`.

❌ Bad:
```java
DynamicQuery query = sponsorMailingListEntryLS.dynamicQuery();

query.add(RestrictionsFactoryUtil.eq("groupId", scopeGroupId));
query.add(RestrictionsFactoryUtil.eq("sponsorArticleId", sponsorArticleId));
query.add(RestrictionsFactoryUtil.eq("requestedRemoval", false));

if (exportStartDate != null) {
    query.add(RestrictionsFactoryUtil.ge("createDate", exportStartDate));
}
if (exportEndDate != null) {
    query.add(RestrictionsFactoryUtil.le("createDate", exportEndDate));
}

List<SponsorMailingListEntry> entries = sponsorMailingListEntryLS.dynamicQuery(query);
```

✅ Good:
```java
Predicate predicate = (
    SponsorMailingListEntryTable.INSTANCE.groupId.eq(scopeGroupId)
    .and(
        SponsorMailingListEntryTable.INSTANCE.sponsorArticleId.eq(sponsorArticleId)
    )
    .and(
        SponsorMailingListEntryTable.INSTANCE.requestedRemoval.eq(false)
    )
);

if (exportStartDate != null) {
    predicate = predicate.and(
        SponsorMailingListEntryTable.INSTANCE.createDate.gte(exportStartDate)
    );
}
if (exportEndDate != null) {
    predicate = predicate.and(
        SponsorMailingListEntryTable.INSTANCE.createDate.lte(exportEndDate)
    );
}

DSLQuery dslQuery = DSLQueryFactoryUtil
    .select(SponsorMailingListEntryTable.INSTANCE)
    .from(SponsorMailingListEntryTable.INSTANCE)
    .where(predicate);

List<SponsorMailingListEntry> entries = sponsorMailingListEntryLS.dslQuery(dslQuery);
```

## Logging

Declare the logger as a `private static final` field using `_log` (the underscore
prefix is correct here — this is a `private static final` field, which is exempt
from the no-underscore rule above):

```java
private static final Log _log = LogFactoryUtil.getLog(MyClass.class);
```

> **Exception:** Custom OSGi (Gogo) shell commands must use `System.out.println`
> instead — `_log` output goes to the server log and is not visible over
> `blade sh`.

### Entity references in log messages

When a log message concerns a specific entity, always use the entity's Java
`SimpleName` followed by its identifier in brackets.

**Default — use the primary key:**
```
AssetCategory[123]
```

**When the primary key is not the most meaningful identifier, name the field:**
```
JournalArticle[articleId: 34234]
Layout[plid: 67, friendlyUrl: /home]
```

**`JournalArticle` **almost** always uses `articleId`**, not its primary key.

Multiple fields are separated by `, ` inside the brackets, as shown in the
`Layout` example above.

## Else / Else If / Catch Statements

The keyword (`else`, `else if`, `catch`, `finally`) goes on the **same line** as
the preceding block's closing `}`, separated by a single space. Do not put the
closing `}` on its own line.

❌ Bad:
```java
if (condition) {
    // ...
}
else {
    // ...
}
```

✅ Good:
```java
if (condition) {
    // ...
} else {
    // ...
}
```

The same rule applies to `else if`, `catch`, and `finally`:

✅ Good:
```java
try {
    // ...
} catch (PortalException portalException) {
    // ...
} finally {
    // ...
}
```