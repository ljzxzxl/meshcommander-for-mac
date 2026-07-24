#!/usr/bin/env node
// Open-source replacement for the closed-source Windows-only "WebSite Compiler"
// used by upstream MeshCommander. Produces the NW.js desktop edition from
// upstream/ sources:
//   - strips ###BEGIN###{Feature} / ###END###{Feature} conditional blocks
//     according to compiler/features.json ({!Feature} means "when disabled")
//   - inlines <script src> and <link rel=stylesheet> references (scripts are
//     themselves preprocessed for feature markers)
//
// Usage:
//   node compiler/build.mjs                 # English -> out/commander.htm
//   node compiler/build.mjs --lang zh-chs   # -> out/commander_zh-chs.htm
//   node compiler/build.mjs --all           # English + all menu languages
//   node compiler/build.mjs --out <dir>     # output directory (default dist/compiled)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'upstream');
const enabled = new Set(JSON.parse(readFileSync(path.join(ROOT, 'compiler', 'features.json'), 'utf8')).enabled);

// Languages that the desktop edition's Language menu actually links to.
const MENU_LANGS = ['de', 'es', 'fr', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-chs'];

const args = process.argv.slice(2);
function argValue(name, fallback) {
    const i = args.indexOf(name);
    return (i >= 0 && args[i + 1]) ? args[i + 1] : fallback;
}
const outDir = path.resolve(ROOT, argValue('--out', 'dist/compiled'));
const langs = args.includes('--all') ? ['', ...MENU_LANGS] : [argValue('--lang', '')];

const MARK = /###(BEGIN|END)###\{(!?)([^}]+)\}/;

// Single-pass conditional block stripper. Upstream regions of different
// features may overlap (not strictly nested), and each ###BEGIN###{X} pairs
// with the next ###END###{X} of the same name — so we track an independent
// depth counter per feature instead of a nesting stack. A line is kept only
// while it is not inside any "removing" region. Marker lines always stand on
// their own line in upstream sources (verified).
function preprocess(text, file) {
    // Translated upstream files squeeze several "<!-- ###BEGIN###{X} --><!-- ###END###{X} -->"
    // pairs onto one line (with real content around them); split HTML comment
    // markers onto their own lines first so the line filter stays correct.
    text = text.replace(/<!-- ###(?:BEGIN|END)###\{[^}]+\} -->/g, '\n$&\n');
    const outLines = [];
    const depth = new Map(); // "!name" / "name" -> open depth
    let removing = 0;        // number of currently open removing regions
    for (const line of text.split('\n')) {
        const m = line.match(MARK);
        if (!m) {
            if (removing === 0) outLines.push(line);
            continue;
        }
        const [, kind, negFlag, name] = m;
        const key = negFlag + name;
        const keep = negFlag === '!' ? !enabled.has(name) : enabled.has(name);
        const delta = kind === 'BEGIN' ? 1 : -1;
        const d = (depth.get(key) || 0) + delta;
        if (d < 0) throw new Error(`${file}: ###END###{${key}} without matching BEGIN`);
        depth.set(key, d);
        if (!keep) {
            // entering (0->1) or leaving (1->0) a removing region
            if (kind === 'BEGIN' && d === 1) removing++;
            if (kind === 'END' && d === 0) removing--;
        }
    }
    for (const [key, d] of depth) {
        if (d !== 0) throw new Error(`${file}: unclosed marker {${key}}`);
    }
    return outLines.join('\n');
}

function inlineAssets(html) {
    // Collect every <script src="xxx.js"> reference (preprocessed for feature
    // markers) and remove the tags from the document...
    const collected = [];
    html = html.replace(/^[ \t]*<script [^>]*src="([^"]+)"><\/script>[ \t]*$/gm, (full, src) => {
        const js = preprocess(readFileSync(path.join(SRC, src), 'utf8'), src);
        collected.push(`// --- inlined: ${src} ---\n${js}`);
        return '';
    });
    // ...then merge them into the big main <script> block (the one holding the
    // page logic). The official compiler does the same: library files reference
    // functions defined by the main script at top level (e.g. amt-script's
    // function tables use passwordcheck), which only works when everything
    // shares one script block so function hoisting applies.
    const re = /<script type="text\/javascript">([\s\S]*?)<\/script>/g;
    let main = null, m;
    while ((m = re.exec(html)) !== null) {
        if (!main || m[1].length > main[1].length) main = m;
    }
    if (!main) throw new Error('main inline <script> block not found');
    const merged = (collected.join('\n') + '\n' + main[1]).replace(/<\/script/gi, '<\\/script');
    html = html.slice(0, main.index)
        + '<script type="text/javascript">\n' + merged + '\n</script>'
        + html.slice(main.index + main[0].length);
    // <link type="text/css" href="xxx.css" ... rel="stylesheet" ... />
    html = html.replace(/^[ \t]*<link [^>]*href="([^"]+\.css)"[^>]*\/?>[ \t]*$/gm, (full, href) => {
        const css = preprocess(readFileSync(path.join(SRC, href), 'utf8'), href);
        return `<style media="screen">\n/* --- inlined: ${href} --- */\n${css}\n</style>`;
    });
    return html;
}

mkdirSync(outDir, { recursive: true });
for (const lang of langs) {
    const srcFile = lang ? `index_${lang}.html` : 'index.html';
    const outFile = lang ? `commander_${lang}.htm` : 'commander.htm';
    let html = readFileSync(path.join(SRC, srcFile), 'utf8');
    html = preprocess(html, srcFile);
    html = inlineAssets(html);
    const target = path.join(outDir, outFile);
    writeFileSync(target, html);
    const leftover = (html.match(/###BEGIN###/g) || []).length;
    console.log(`${srcFile} -> ${target} (${(html.length / 1048576).toFixed(2)} MB, leftover markers: ${leftover})`);
    if (leftover) throw new Error('markers remained after preprocessing');
}
