---
name: create-osgi-command
description: "Scaffold a custom OSGi (Gogo) shell command — a small Java @Component exposed via osgi.command.scope/function and run with `blade sh scope:command`. Use this whenever you need a lightweight way to execute Java inside the running Liferay runtime: developing utilities, inspecting live objects/services, analyzing runtime behavior, or running one-off maintenance tasks and reading their output over STDOUT."
---

# Create an OSGi Command

Custom OSGi commands (Apache Gogo commands) are the lightest-weight way to run
arbitrary Java inside the **running** Liferay JVM. You define a small
`@Component`, deploy it, and invoke it from the shell:

```bash
blade sh neptune:fragments:propagate
```

This is the go-to tool for an agent that wants to **draft Java, run it, and read
the result**: build a quick utility, probe a live service, inspect an object
graph, or verify runtime behavior — all without a full feature build or a
browser. The canonical reference implementation lives at
`modules/neptune-admin/neptune-admin-shell/src/main/java/com/neptune/admin/shell/NeptuneFragmentCommands.java`
(its backing logic lives in `neptune-admin-ops`'s `NeptuneFragmentManager`).

Every command class also **contributes its own help** to a global `neptune:help`
command and a scoped `neptune:<scope>:help` command by implementing
`com.neptune.admin.shell.NeptuneCommandHelpContributor`. This is not an add-on —
it's part of the canonical shape of a Neptune command, shown in the sample below.

## ⚠️ Scope and function names are camelCase — never kebab-case

Multi-word command **scopes** and **functions** must be **camelCase**, not
kebab-case. Gogo tolerates a hyphen in a scope, but it reads awkwardly and is
inconsistent with the rest of the Neptune commands, so it is not allowed:

- Scope: `neptune:ddmTemplates` — **not** `neptune:ddm-templates`.
- Function: `syncOnStartup` — **not** `sync-on-startup`.

The `neptune:` prefix is a fixed literal and always stays; only the segment(s)
after it are camelCased. Apply this to `osgi.command.scope`, `getScope()`, every
`CommandEntry` command string, and every reference in `docs/osgi-commands.md`.

(This is scope/function naming only. Unrelated kebab-case identifiers — OSGi
config category ids like `neptune-ddm-templates`, module names like
`neptune-ui-ddm-templates`, and resource paths — keep their own conventions.)

## ⚠️ Invoke `/liferay-java-formatting` before writing any Java

Before writing the command class **or** the ops class, invoke the
`/liferay-java-formatting` skill and apply its rules throughout. This covers line
length, line-break/wrapping conventions, `@Reference` naming, DSL Query API,
logging, and brace placement. Do not skip it even for small classes.

## Separation of concerns — thin commands, separate ops classes

**This is the most important structural rule.** A command class is a very thin
I/O layer. Any real business logic must live in a separate class (the "ops"
class). The split is non-negotiable for every command that ships and is kept —
it is only acceptable to co-locate logic in a one-off spike you will delete
before the next release.

### The command class owns only:

- Parsing arguments (split CSVs, validate ranges, handle flags)
- Formatting and printing output via `System.out.println`
- Delegating work to the ops class
- Help metadata (`getCommandEntries()`, summary, appendix)

### The ops class owns only:

- All actual work: queries, mutations, orchestration, data collection
- `_log`-based diagnostics (no `System.out` — it belongs in the command class)
- Returning results back to the command class as typed values (POJOs, lists, maps)
- No awareness of shell output format or how results will be displayed

### Where the ops class lives

Resolve the location in the same way you resolve the command class location, but
with an extra constraint: the ops class must be callable by code other than the
command — it should not require heavy boilerplate to invoke.

- **`neptune-admin-ops`** — for Neptune-level utilities that other modules or
  future commands may need (e.g. `NeptuneFragmentManager` is called by both the
  shell command and the fragment propagation API).
- **Same module as the command, in a separate class** — when the ops class is
  specific enough to one consumer feature that extracting it to `neptune-admin-ops`
  would be premature. The class must still have no `System.out` and no shell
  coupling; it just isn't shared yet.

Never place an ops class inside the shell command class (no inner classes for
business logic). Never have the ops class print to `System.out`.

### Determining parameter names

Avoid generic parameter names like `<csv>`, opt instead for something that a human can easily understand at a glace like
`<journalArticleIdCSV>`.

### Canonical pair — fragment propagation

The fragment command/ops split is the reference to follow:

```
neptune-admin-shell/NeptuneFragmentCommands.java   <- command: thin I/O layer
neptune-admin-ops/NeptuneFragmentManager.java      <- ops: all logic, _log only
```

`NeptuneFragmentManager` does the work and returns typed results.
`NeptuneFragmentCommands` calls it, formats the results, and prints them.

### Example split

```java
// --- OPS CLASS: no System.out, no shell coupling ---
// neptune-admin-ops/src/main/java/com/neptune/admin/ops/MyFeatureManager.java

package com.neptune.admin.ops;

import com.liferay.portal.kernel.log.Log;
import com.liferay.portal.kernel.log.LogFactoryUtil;
import com.liferay.portal.kernel.service.CompanyLocalService;

import java.util.List;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(service = MyFeatureManager.class)
public class MyFeatureManager {

    public List<MyResult> processItems(List<String> keys) {
        _log.info("Processing " + keys.size() + " items");

        // ... real work here, returns typed results ...

        return results;
    }

    private static final Log _log = LogFactoryUtil.getLog(MyFeatureManager.class);

    @Reference
    private CompanyLocalService companyLS;

}
```

```java
// --- COMMAND CLASS: thin I/O layer only ---
// neptune-admin-shell/src/main/java/com/neptune/admin/shell/MyScopeCommands.java

package com.neptune.admin.shell;

import com.neptune.admin.ops.MyFeatureManager;

import java.util.Arrays;
import java.util.List;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(
    service = {MyScopeCommands.class, NeptuneCommandHelpContributor.class},
    property = {
        "osgi.command.scope=neptune:myScope",
        "osgi.command.function=help",
        "osgi.command.function=processItems"
    }
)
public class MyScopeCommands implements NeptuneCommandHelpContributor {

    // blade sh neptune:myScope:processItems "a,b,c"
    public void processItems(String csv) {
        List<String> keys = Arrays.asList(csv.split(","));

        List<MyResult> results = myFeatureManager.processItems(keys);

        for (MyResult result : results) {
            System.out.println(result.getKey() + ": " + result.getStatus());
        }
    }

    public void help() {
        CommandHelpPrinter.printScope(this, null);
    }

    public void help(String filter) {
        CommandHelpPrinter.printScope(this, filter);
    }

    @Override
    public String getScope() {
        return "neptune:myScope";
    }

    @Override
    public List<CommandEntry> getCommandEntries() {
        return Arrays.asList(
            new CommandEntry(
                "neptune:myScope:processItems",
                "<csv>",
                "Process the comma-separated item keys")
        );
    }

    @Reference
    private MyFeatureManager myFeatureManager;

}
```

## How a command works

A Neptune Gogo command is a DS component that:

- registers under **two services** — its own class (so Gogo sees the functions)
  and `NeptuneCommandHelpContributor` (so `neptune:help` sees it),
- declares an `osgi.command.scope` plus one `osgi.command.function` per exposed
  method (`help` is always one of them),
- implements `NeptuneCommandHelpContributor` — `getScope()` and
  `getCommandEntries()` are required; `getSummaryHelpText()` / `getAppendixHelpText()`
  are optional prose bookends,
- provides `help()` / `help(String filter)` that delegate to the shared
  `CommandHelpPrinter`.

Here is a complete canonical command class — copy this shape:

```java
package com.example.myfeature.shell;

import com.neptune.admin.shell.CommandHelpPrinter;
import com.neptune.admin.shell.NeptuneCommandHelpContributor;

import java.util.Arrays;
import java.util.List;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(
    service = {MyScopeCommands.class, NeptuneCommandHelpContributor.class},
    property = {
        "osgi.command.scope=neptune:myScope",
        "osgi.command.function=help",          // enables neptune:myScope:help
        "osgi.command.function=doSomething"    // one line per exposed method
    }
)
public class MyScopeCommands implements NeptuneCommandHelpContributor {

    // ------------------------------------------------------------------
    // Gogo commands. STDOUT (System.out.println) reaches `blade sh`;
    // `_log` goes to the server log.
    // Command methods are thin: parse args, call ops, print results.
    // ------------------------------------------------------------------

    // blade sh neptune:myScope:doSomething
    public void doSomething() {
        MyResult result = myScopeManager.doSomething();

        System.out.println(result.getSummary());
    }

    // Overloads: Gogo passes shell tokens as Strings -- split your own CSVs.
    // blade sh neptune:myScope:doSomething "a,b,c"
    public void doSomething(String groupKeyCSV) {
        List<String> keys = Arrays.asList(groupKeyCSV.split(","));

        MyResult result = myScopeManager.doSomething(keys);

        System.out.println(result.getSummary());
    }

    // blade sh neptune:myScope:help  /  neptune:myScope:help <filter>
    public void help() {
        CommandHelpPrinter.printScope(this, null);
    }

    public void help(String filter) {
        CommandHelpPrinter.printScope(this, filter);
    }

    // ------------------------------------------------------------------
    // NeptuneCommandHelpContributor — the single source of truth for
    // this scope's help. ASCII only in every string (see below).
    // ------------------------------------------------------------------

    @Override
    public String getScope() {
        return "neptune:myScope";
    }

    // Optional: raw markdown ABOVE the command table.
    @Override
    public String getSummaryHelpText() {
        return (
            "One-paragraph overview of what this scope does."
        );
    }

    // Optional: raw markdown BELOW the table (and any per-entry extSummary).
    @Override
    public String getAppendixHelpText() {
        return (
            "Caveats, definitions, or cross-references that apply to the whole scope."
        );
    }

    // REQUIRED: one CommandEntry per invocation row. Overloads are separate rows.
    @Override
    public List<CommandEntry> getCommandEntries() {
        return Arrays.asList(
            new CommandEntry(
                "neptune:myScope:doSomething",  // full command string, includes scope
                "",                             // args synopsis ("" if none)
                "One-line description for the table column"
            ),
            new CommandEntry(
                "neptune:myScope:doSomething",
                "<groupKeyCSV> [--json]",
                "Same command, different overload -> its own row",
                // Optional 4th arg: raw markdown rendered as a paragraph after
                // the table for this entry. Use for flag semantics, caveats,
                // shell-quoting notes, or examples.
                "`--json` emits a machine-readable summary. "
                + "The csv is split on commas."
            )
        );
    }

    // ------------------------------------------------------------------
    // Injected services live at the bottom of the class.
    // ------------------------------------------------------------------

    @Reference
    private MyScopeManager myScopeManager;

}
```

Key facts:

- **Two services, always.** `service = {YourClass.class, NeptuneCommandHelpContributor.class}`
  is what makes the class both a Gogo command holder and a help contributor. Omit
  the second and your commands still work but they vanish from `neptune:help`.
- **Scopes and functions are camelCase, never kebab-case** — `neptune:ddmTemplates`,
  not `neptune:ddm-templates` (see the warning above). Only the segment after the
  fixed `neptune:` prefix is camelCased.
- **`osgi.command.function=help` is always included.** It powers
  `blade sh neptune:<scope>:help` for this scope alone.
- **One `osgi.command.function=` per exposed method** (overloads count once —
  Gogo dispatches on argument count). Gogo passes shell tokens as `String`s;
  split your own CSVs / positional lists.
- The command runs in the live JVM with full access to injected services and the
  OSGi registry. Treat destructive operations with the same care as production code.
- **If your class lives outside `neptune-admin-shell`**, add
  `compileOnly project(":modules:neptune-admin:neptune-admin-shell")` to that
  module's `build.gradle` so it can see `NeptuneCommandHelpContributor` /
  `CommandHelpPrinter` (the package `com.neptune.admin.shell` is exported). bnd
  adds the `Import-Package` automatically once the code references them.

## Anatomy of a `CommandEntry`

Each row in `getCommandEntries()` is one invocation variant. Overloads (same
command, different args) get separate entries.

| Field | Purpose |
|-------|---------|
| `command` | Full command string **including scope**, e.g. `neptune:myScope:doSomething`. |
| `args` | Argument synopsis, e.g. `[--json] <required>`. Empty string when the command takes none. |
| `description` | One line for the table column. Keep it tight. |
| `extSummary` *(optional 4th arg)* | Raw markdown rendered as a paragraph after the table — for nuance that does not fit one line (flag semantics, shell-quoting gotchas, examples). This is how `neptune:fragments:validate` and `:rename` carry their extra detail. |

`getSummaryHelpText()` / `getAppendixHelpText()` bracket the table with
scope-level prose; per-entry `extSummary` blocks sit between them.

## ⚠️ ASCII only in help strings

`blade sh` runs over a Gogo terminal that mangles non-ASCII. `CommandHelpPrinter`
has a `clean()` pass that rewrites the common offenders (em/en dashes, smart
quotes, arrows, `>=`/`<=`, bullets, non-breaking spaces, …) to ASCII, **but do
not rely on it** — write **plain ASCII** in every `CommandEntry` field and in
`getSummaryHelpText()` / `getAppendixHelpText()`:

- Use `-` not `—`/`–`; `->` / `-->` not `→` / `⇒`; `"` `'` not smart quotes.
- Use `>=` `<=` `!=` not `≥` `≤` `≠`; `*` not `•`; `...` not `…`.
- No non-breaking spaces (they sneak in from copy-paste).

Keeping the source ASCII means the human-readable output, the markdown output,
and `docs/osgi-commands.md` all render identically — `clean()` is a safety net,
not a license to paste Unicode.

## ⚠️ Output: `System.out.println` in the command, `_log` in the ops class

This is the single most important rule for agent usability, and it maps directly
onto the separation-of-concerns split above.

- **`System.out.println(...)` is returned over STDOUT** by `blade sh` — the agent
  can read it directly. It belongs **only in the command class**.
- **`_log.info/warn/error/trace/debug` is NOT** — it goes to the server log
  (`bundles/tomcat/logs/`), not the shell session. It belongs **only in the ops
  class** (diagnostics, progress, warnings during the actual work).

The ops class must never call `System.out.println`. The command class must never
do real work that should be logged — that's a sign the logic belongs in an ops
class.

For **complex objects, serialize to JSON** in the command class and println that
— it's far easier for both humans and agents to parse than `toString()`:

```java
import com.liferay.portal.kernel.json.JSONUtil;          // or Jackson, already on the platform
System.out.println(JSONUtil.put("companyId", c.getCompanyId())
                           .put("webId", c.getWebId()).toString());
// For collections / arbitrary POJOs, an ObjectMapper.writeValueAsString(...) is often simplest.
```

## Where to put the command and ops classes

Resolve the location in this priority order:

1. **The user said where it goes.** This always wins — honor it exactly, even if
   it contradicts the heuristics below.
2. **Feature-specific command → the feature's own module.** If the command
   operates on or exercises a feature being built in a consumer portal (e.g.
   isa-portal), create it inside that feature's module so it ships and versions
   with the code it supports.
3. **Generic, reusable utility → Neptune.** If it's broadly useful runtime
   tooling not tied to one feature, it belongs in this repo. Default target:
   `modules/neptune-admin/neptune-admin-shell` (command class) and
   `modules/neptune-admin/neptune-admin-ops` (ops class).
4. **Unsure → default to `neptune-admin/neptune-admin-shell`.**

Think before placing: read the command's purpose and pick the module whose domain
it matches. When choosing an existing module, confirm it can host a DS component
(its `build.gradle` has the Liferay API as `compileOnly` — `release.dxp.api` or
`release.portal.api`). Adding a command to an existing module is just dropping in
new `.java` files; **prefer that over scaffolding a brand-new bundle.**

## Steps

1. **Invoke `/liferay-java-formatting`** before writing any Java and apply its
   rules to every class you create or modify.
2. **Pick the module** using the priority list above. If the command class lives
   outside `neptune-admin-shell`, add the `compileOnly` dependency mentioned in
   [Key facts](#how-a-command-works) so the interface + printer resolve.
3. **Design the ops class first.** Ask: what work needs to happen? Write that
   class with typed inputs/outputs and `_log`-only diagnostics. No `System.out`.
   No awareness of shell output. DS `@Component(service = YourManager.class)`.
4. **Write the command class** as a thin I/O wrapper: parse args, call the ops
   class, `System.out.println` the results. Implement
   `NeptuneCommandHelpContributor`. ASCII-only in every help string.
5. **Build & deploy so the component registers in the running JVM:**
   - In **neptune-liferay**: `./gradlew deploy` (deploys modules to the configured
     local target — see CLAUDE.md / `gradle-local.properties`).
   - In a **consumer portal module**: `blade gw deploy` from that workspace.
   - The server must be running for `blade sh` to reach it.
6. **Run it, including the help:**
   ```bash
   blade sh neptune:myScope:doSomething
   blade sh neptune:myScope:doSomething "arg1,arg2"   # quoted tokens
   blade sh neptune:myScope:help                       # confirm help renders
   blade sh neptune:help                               # confirm global help lists it
   ```
   `blade sh` connects to the running Liferay's Gogo shell and returns the
   command's STDOUT.
7. **Read the output, iterate.** Edit -> redeploy -> re-run. For investigative
   tasks, lean on JSON output to inspect structure.

## Keep the two indexes in sync (non-negotiable)

There are **two** places a command is described, and they must always agree:

1. **`getCommandEntries()`** in the command class — the runtime source of truth,
   surfaced by `neptune:help`.
2. **`docs/osgi-commands.md`** — the checked-in index, whose command section is
   **generated from #1**.

Because the docs are generated, you never hand-write the per-command tables.
The workflow is:

### Step 1 — Edit `getCommandEntries()` (and summary/appendix text)

Add, change, or remove `CommandEntry` rows in the command class. This is the only
place you author command help. Keep it **ASCII only** (see
[the warning above](#️-ascii-only-in-help-strings)).

### Step 2 — Regenerate the docs section

Deploy, then regenerate the autogenerated block and paste it between the markers
in `docs/osgi-commands.md`:

```bash
blade sh "neptune:help --markdown"
```

The file carries a pair of comment markers; **replace everything between them**
with the command's output:

```markdown
[//]: # (START AUTOGENERATED COMMAND INDEX)

...output of `blade sh "neptune:help --markdown"`...

[//]: # (END AUTOGENERATED COMMAND INDEX)
```

Prose outside the markers (the intro, the Command Summary table, the "Authoring"
section) is hand-maintained; the block between them is disposable and always
overwritten.

### Step 3 — Verify

- `blade sh neptune:help` lists the new/updated command.
- `blade sh neptune:<scope>:help` shows the scope on its own.
- `blade sh "neptune:help --filter <keyword>"` finds it.
- The regenerated markdown block in `docs/osgi-commands.md` matches the runtime
  output (re-run the command and diff if unsure).

### Skip only for temporary commands

A throwaway debugging command you will delete before the next release does not
need a `NeptuneCommandHelpContributor` and does not belong in `docs/osgi-commands.md`.
Likewise, a one-off spike may co-locate its logic directly in the command class
if the command will be deleted before the next release. For anything you ship and
keep, self-documenting help **and** a separate ops class are both mandatory.

## Verify

- Confirm the module deployed (`blade sh lb | grep <bundle>` shows it ACTIVE).
- If `blade sh <scope>:<function>` reports the command isn't found, the component
  likely didn't register — recheck the `service`/`property` annotation, that the
  module is ACTIVE, and that DS resolved it (no missing `@Reference`).
- Confirm expected text appears on STDOUT (i.e. you used `System.out.println` in
  the command class, not the logger).
- Confirm the ops class has no `System.out` calls — grep for them as a sanity
  check before committing.