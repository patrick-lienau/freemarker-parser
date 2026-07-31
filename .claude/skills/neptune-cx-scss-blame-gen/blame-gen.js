#!/usr/bin/env node
// neptune-cx-scss-blame-gen
// ---------------------------------------------------------------------------
// Build the neptune-ui client extension, collect every SCSS diagnostic the
// `neptune:scss` Vite plugin emits (each one carries an absolute file:line:col),
// `git blame` the offending line, and bucket the diagnostics by the author who
// last touched that line. Output report: docs/blames/<YYYYMMDDThhmmssZ>.md.
//
// The build runs through GRADLE by default (`packageRunBuild`), NOT a bare
// `yarn build`. This matters: the Liferay gradle node plugin pins the Node
// version (see root build.gradle `nodeVersion`), while a bare `yarn build`
// uses whatever Node is on PATH — and a mismatched Node crashes Vite *before*
// the neptune:scss plugin ever runs, producing an empty log that looks
// identical to a clean build. Going through gradle guarantees the pinned Node
// and an up-to-date log. `--rerun-tasks` defeats gradle's UP-TO-DATE cache,
// which would otherwise also yield an empty log on a second run.
//
// Crucially, the script distinguishes a *crashed/aborted* build (the SCSS
// pipeline never ran) from a *genuinely clean* one. Only the latter gets the
// "🎉 no diagnostics" report; the former gets a "BUILD FAILED" report and a
// nonzero exit, so a broken build is never silently reported as clean.
//
// Deterministic by construction: no randomness; findings are de-duplicated and
// sorted (author → file → line → col); the only time-derived value is the
// output filename + matching header, stamped once at startup.
//
// Usage (run from anywhere inside the consumer portal git repo):
//   node .claude/skills/neptune-cx-scss-blame-gen/blame-gen.js
//
// Options:
//   --builder <gradle|yarn>   How to build (default: gradle). `yarn` runs
//                             `yarn build` in the CE dir with PATH's Node —
//                             only use it when you know PATH's Node matches the
//                             pinned version.
//   --ce <dir>                Client-extension dir to build, relative to repo
//                             root (default: client-extensions/neptune-ui). The
//                             gradle project path is derived from it
//                             (client-extensions/neptune-ui -> :client-extensions:neptune-ui).
//   --log <file>              Parse a previously-captured build log instead of
//                             building. Useful for iterating without paying the
//                             build cost twice, or where the build can't run.
//
// CommonJS by design: consumer portals (and the neptune-liferay repo itself)
// do not set `"type": "module"` in their root package.json, so under the .js
// extension Node resolves this as CJS. Keeps the file portable across every
// consumer without forcing a package.json change at any layer.
// ---------------------------------------------------------------------------

const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { resolve, relative, isAbsolute } = require('node:path');

// --- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const getOpt = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const LOG_FILE = getOpt('--log');
const CE_DIR_REL = getOpt('--ce') ?? 'client-extensions/neptune-ui';
const BUILDER = (getOpt('--builder') ?? 'gradle').toLowerCase();
if (!['gradle', 'yarn'].includes(BUILDER)) {
    console.error(`Unknown --builder "${BUILDER}". Use "gradle" or "yarn".`);
    process.exit(2);
}

// --- locate the repo -------------------------------------------------------
const git = (args, opts = {}) =>
    spawnSync('git', args, { encoding: 'utf8', ...opts });

const topLevel = git(['rev-parse', '--show-toplevel']).stdout?.trim();
if (!topLevel) {
    console.error('Not inside a git repository. Run from the consumer portal.');
    process.exit(1);
}
const PORTAL_ROOT = topLevel;
const CE_DIR = resolve(PORTAL_ROOT, CE_DIR_REL);
const BLAME_DIR = resolve(PORTAL_ROOT, 'docs', 'blames');

// --- timestamp: YYYYMMDDThhmmssZ (UTC), stamped once -----------------------
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const TS = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
    + `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
const OUT = resolve(BLAME_DIR, `${TS}.md`);

// --- derive the GitHub web base from origin (for commit links) -------------
// Supports git@github.com:org/repo(.git) and https://github.com/org/repo(.git).
const remote = git(['remote', 'get-url', 'origin']).stdout?.trim() ?? '';
const webBase = remote
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^https?:\/\/github\.com\//, 'https://github.com/')
    .replace(/\.git$/, '') || null;

// --- 1. get the build log --------------------------------------------------
// `builderLabel` is what we tell the reader the diagnostics came from.
let log;
let buildExit = null; // null when parsing a pre-captured log
let builderLabel;
if (LOG_FILE) {
    log = readFileSync(resolve(LOG_FILE), 'utf8');
    builderLabel = `pre-captured log \`${LOG_FILE}\``;
} else if (BUILDER === 'gradle') {
    // Derive :a:b:c gradle project path from the CE dir (POSIX-relative).
    const gradlePath = ':' + CE_DIR_REL.split(/[\\/]+/).filter(Boolean).join(':');
    const task = `${gradlePath}:packageRunBuild`;
    const gradlew = resolve(PORTAL_ROOT, 'gradlew');
    builderLabel = `\`gradlew ${task}\``;
    process.stderr.write(`Building via ${builderLabel} (pinned Node)…\n`);
    // --rerun-tasks: defeat gradle's UP-TO-DATE cache so the SCSS pipeline
    //   actually re-runs and re-emits diagnostics on every invocation.
    // --console=plain: stable, parseable output without progress redraws.
    // Nonzero exit is expected when SCSS has hard errors — the plugin still
    // printed the diagnostics we want, so we keep the log and press on.
    const r = spawnSync(
        gradlew,
        [task, '--rerun-tasks', '--console=plain'],
        { cwd: PORTAL_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    buildExit = r.status;
    log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
} else {
    builderLabel = `\`yarn build\` in \`${CE_DIR_REL}\``;
    process.stderr.write(`Building via ${builderLabel} (PATH Node)…\n`);
    const r = spawnSync('yarn', ['build'], {
        cwd: CE_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    buildExit = r.status;
    log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
}

mkdirSync(BLAME_DIR, { recursive: true });

// --- 2. did the SCSS pipeline actually run? --------------------------------
// A crash *before* the neptune:scss plugin (e.g. wrong Node version, vite
// config load failure) yields a log with zero diagnostics — indistinguishable
// from a clean build unless we demand positive proof the pipeline ran. Any one
// of these markers is that proof.
const PIPELINE_RAN =
    /\[plugin neptune:scss\]/.test(log) ||  // plugin emitted at least one line
    /\bmodules transformed\b/.test(log) ||  // vite got through the transform phase
    /\bbuilt in\b/i.test(log) ||            // vite reported a successful build
    /✓\s+\d+\s+modules/.test(log);          // vite's transform tick

// --- 3. parse diagnostics --------------------------------------------------
// A diagnostic is anchored on a line carrying `<abs-path>.scss:<line>:<col>`.
// The message is the text on the same line before the path (plugin prefix
// stripped) if any, else the most recent non-empty line above it. This handles
// both the two-line prod layout:
//     [plugin neptune:scss] Could not resolve the variable "$x" within "$x"
//       /abs/.../styles.scss:321:13
// and a hypothetical single-line variant — we stay tolerant.
const LOC = /(\/[^\n:]*\.scss):(\d+):(\d+)/;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
// Normalize a raw log line for parsing/display:
//   1. Vite's progress spinner overwrites the line with carriage returns, so
//      keep only the text after the last \r (the final, settled content).
//   2. Strip ANSI escape sequences (colors, the `[2K` erase-line emitted by
//      the progress redraw) that otherwise corrupt the message text.
//   3. Drop everything up to and including the LAST `[plugin …]` marker, so a
//      message glued onto leftover spinner text ("transforming…[plugin …] msg")
//      reduces to just the message — and dedupes against its clean twin.
const clean = (s) =>
    s.split('\r').pop()
        .replace(ANSI, '')
        .replace(/^.*\[plugin[^\]]*\]\s*/, '')
        .trim();

const findings = [];
let lastMessage = '';
for (const rawLine of log.split('\n')) {
    const raw = rawLine.replace(ANSI, '').split('\r').pop();
    const m = raw.match(LOC);
    if (m) {
        const before = clean(raw.slice(0, m.index));
        const message = before || lastMessage;
        findings.push({ message, file: m[1], line: Number(m[2]), col: Number(m[3]) });
    } else {
        const t = clean(raw);
        if (t) lastMessage = t;
    }
}

// De-duplicate identical (message, file, line, col) tuples.
const seen = new Set();
const unique = [];
for (const f of findings) {
    const key = `${f.message} ${f.file} ${f.line} ${f.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
}

// --- build-failure guard ---------------------------------------------------
// If the pipeline never ran AND we found nothing, the build is broken, not
// clean. Emit a loud report and exit nonzero so the
// caller (and any automation) treats this as a failure rather than success.
if (!PIPELINE_RAN && unique.length === 0) {
    const out = [
        `# SCSS blame — ${TS}`,
        '',
        `**⚠️ BUILD FAILED — no SCSS diagnostics could be collected.**`,
        '',
        `The build (${builderLabel}) did not reach the \`neptune:scss\` pipeline, `
        + `so this is **not** a clean result — the build crashed or was aborted `
        + `before any SCSS was processed`
        + (buildExit !== null ? ` (exit code ${buildExit})` : '') + '.',
        '',
        `Common cause: a bare \`yarn build\` ran under the wrong Node version. `
        + `The default \`gradle\` builder uses the Node version pinned in the root `
        + `\`build.gradle\`; re-run without \`--builder yarn\` if you overrode it. `
        + `Re-run the build directly to see the full output.`,
        '',
    ].join('\n');
    writeFileSync(OUT, out.replace(/\n+$/, '\n'), 'utf8');
    process.stderr.write(
        `BUILD FAILED before the SCSS pipeline ran — wrote ${relative(PORTAL_ROOT, OUT)}.\n`
    );
    console.log(OUT);
    process.exit(1);
}

// --- 4. git blame each offending line (cached per file:line) ---------------
const blameCache = new Map();
const blameLine = (absFile, line) => {
    const key = `${absFile} ${line}`;
    if (blameCache.has(key)) return blameCache.get(key);
    const r = git(
        ['blame', '-L', `${line},${line}`, '--porcelain', '--', absFile],
        { cwd: PORTAL_ROOT }
    );
    let info = { hash: null, author: 'Unknown', email: '' };
    if (r.status === 0 && r.stdout) {
        const lines = r.stdout.split('\n');
        const hash = lines[0]?.split(' ')[0] ?? null;
        let author = 'Unknown';
        let email = '';
        for (const l of lines) {
            if (l.startsWith('author ')) author = l.slice('author '.length).trim();
            else if (l.startsWith('author-mail ')) {
                email = l.slice('author-mail '.length).trim().replace(/^<|>$/g, '');
            }
        }
        const uncommitted = hash && /^0+$/.test(hash);
        info = {
            hash: uncommitted ? null : hash,
            author: uncommitted ? 'Not Committed Yet' : author,
            email: uncommitted ? '' : email,
        };
    }
    blameCache.set(key, info);
    return info;
};

// --- 5. bucket by author ---------------------------------------------------
const buckets = new Map(); // authorKey -> { author, email, items: [] }
for (const f of unique) {
    const absFile = isAbsolute(f.file) ? f.file : resolve(CE_DIR, f.file);
    const blame = blameLine(absFile, f.line);
    const authorKey = `${blame.author} ${blame.email}`;
    if (!buckets.has(authorKey)) {
        buckets.set(authorKey, { author: blame.author, email: blame.email, items: [] });
    }
    // Path relative to the .md file's location → clickable in GitHub and IDEs.
    const mdRel = relative(BLAME_DIR, absFile);
    buckets.get(authorKey).items.push({
        message: f.message,
        mdRel,
        line: f.line,
        col: f.col,
        hash: blame.hash,
    });
}

// --- 6. render markdown (sorted for determinism) ---------------------------
const out = [];
out.push(`# SCSS blame — ${TS}`);
out.push('');
const totalAuthors = buckets.size;
out.push(
    `Generated by \`neptune-cx-scss-blame-gen\` from ${builderLabel}. `
    + `${unique.length} diagnostic${unique.length === 1 ? '' : 's'} across `
    + `${totalAuthors} author${totalAuthors === 1 ? '' : 's'}.`
);
out.push('');

if (unique.length === 0) {
    out.push('No SCSS diagnostics found. 🎉');
} else {
    const sortedAuthors = [...buckets.values()].sort((a, b) =>
        (a.author + a.email).localeCompare(b.author + b.email)
    );
    for (const bucket of sortedAuthors) {
        const emailPart = bucket.email ? ` <${bucket.email}>` : '';
        out.push(`## ${bucket.author}${emailPart}`);
        const items = bucket.items.sort((a, b) =>
            a.mdRel.localeCompare(b.mdRel) || a.line - b.line || a.col - b.col
        );
        for (const it of items) {
            // Short hash = first 8 chars of the full hash (matches this repo's
            // git abbreviation). Linked to the commit on GitHub when available.
            const short = it.hash ? it.hash.slice(0, 8) : null;
            const commit = short
                ? (webBase ? `([${short}](${webBase}/commit/${it.hash}))` : `(${short})`)
                : '(uncommitted)';
            // File link: display path:line:col; href uses GitHub's #L line anchor.
            const display = `${it.mdRel}:${it.line}:${it.col}`;
            const href = `${it.mdRel}#L${it.line}`;
            out.push(`  * ${it.message}`);
            out.push(`    [${display}](${href}) ${commit}`);
        }
        out.push('');
    }
}

// --- write -----------------------------------------------------------------
writeFileSync(OUT, out.join('\n').replace(/\n+$/, '\n'), 'utf8');
process.stderr.write(`Wrote ${relative(PORTAL_ROOT, OUT)} (${unique.length} diagnostics, ${totalAuthors} authors).\n`);
console.log(OUT);
