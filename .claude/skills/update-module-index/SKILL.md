---
name: update-module-index
description: Regenerate or update docs/module-index.md so it accurately reflects the modules and key public classes under modules/. Use when modules or classes are added, removed, or renamed, or when the index has drifted from the source.
---

# Update module-index.md

`docs/module-index.md` is a quick-reference map of every Neptune module and its key
public classes. It is read by both humans and agents to locate relevant code. This
skill keeps it in sync with the actual source tree.

## What the index contains

1. An intro line.
2. A **Module Summary** table: one row per top-level module, linking to its section.
3. A per-module section with:
   - `**Path:** \`modules/...\`` (the module's directory relative to repo root)
   - A one-line purpose description
   - A table of key classes: `| Class | Description |` (or `| Class | Template Variable | Description |` for `neptune-ui-template-helpers`)
4. An **Additional Modules** section for minor/internal modules that only get a
   one-line mention rather than a full class table.

Match the existing structure and tone exactly — concise descriptions, no fluff.

## How to gather the data

Run these from the repo root. Exclude `build/` directories everywhere.

1. **Enumerate modules.** A module is any directory containing a `bnd.bnd`:
   ```
   find modules -path '*/build' -prune -o -name bnd.bnd -print | sort
   ```
   Group nested submodules under their parent in the summary (e.g. the three
   `neptune-common-search-*` modules roll up under one `neptune-common-search`
   section; `neptune-category-augment-{api,service}` roll up under
   `neptune-category-augment`).

2. **Get each module's symbolic name / exports** from its `bnd.bnd`
   (`Bundle-Name`, `Bundle-SymbolicName`, `Export-Package`). Exported packages
   tell you which classes are public API and worth listing.

3. **Find the key classes.** List Java sources, focusing on public/exported
   packages — `*Helper`, `*Service`, `*ContextContributor`, `*ConfigManager`,
   `*Configuration`, `*CollectionProvider`, entity/util classes, and exceptions:
   ```
   find modules/<module> -path '*/build' -prune -o -name '*.java' -print
   ```
   Read class headers / Javadoc / class names to write each one-line description.
   Do NOT list every class — pick the ones a consumer or agent would care about,
   consistent with the density of the existing index.

## How to write the update

- **Prefer surgical edits.** If only one module changed, update only that section
  and its summary-table row. Don't rewrite the whole file.
- Keep classes that still exist with their current descriptions unless the code
  clearly changed; only touch what drifted.
- When a module is added: add a summary row (alphabetical-ish, matching existing
  grouping) and a full section. When removed: delete both.
- Keep descriptions to a single concise line. Use backticks for class names.
- Preserve the `---` section separators and heading levels.

## Verify

After editing, confirm every module under `modules/` (with a `bnd.bnd`) appears
either in a full section or under **Additional Modules**, and that every section's
`**Path:**` points to a real directory. Report which modules/classes you added,
removed, or changed.
