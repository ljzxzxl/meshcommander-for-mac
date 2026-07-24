#!/usr/bin/env node
// Build MeshCommander.app for macOS (Apple Silicon or Intel) from the NW.js
// runtime and the payload in app/.
//
// Usage:
//   node build/mkapp.mjs [--arch arm64|x64] [--dmg]
//
// The NW.js runtime is downloaded once and cached under .cache/.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NWJS_VERSION = '0.113.0';

const args = process.argv.slice(2);
function argValue(name, fallback) {
    const i = args.indexOf(name);
    return (i >= 0 && args[i + 1]) ? args[i + 1] : fallback;
}
const arch = argValue('--arch', process.arch === 'arm64' ? 'arm64' : 'x64');
const makeDmg = args.includes('--dmg');
if (!['arm64', 'x64'].includes(arch)) { console.error(`Unsupported arch: ${arch}`); process.exit(1); }

const appVersion = JSON.parse(readFileSync(path.join(ROOT, 'app', 'package.json'), 'utf8')).version;
const cacheDir = path.join(ROOT, '.cache');
const distDir = path.join(ROOT, 'dist', arch);
const nwName = `nwjs-v${NWJS_VERSION}-osx-${arch}`;
const nwZip = path.join(cacheDir, `${nwName}.zip`);
const nwDir = path.join(cacheDir, nwName);

function run(cmd) { console.log(`> ${cmd}`); execSync(cmd, { stdio: 'inherit' }); }

// 1. Download and unpack the NW.js runtime (cached).
mkdirSync(cacheDir, { recursive: true });
if (!existsSync(nwDir)) {
    if (!existsSync(nwZip)) {
        run(`curl -fSL --retry 3 -o "${nwZip}.part" https://dl.nwjs.io/v${NWJS_VERSION}/${nwName}.zip`);
        run(`mv "${nwZip}.part" "${nwZip}"`);
    }
    // ditto preserves symlinks/permissions inside the .app bundle
    run(`ditto -x -k "${nwZip}" "${cacheDir}"`);
}

// 2. Assemble MeshCommander.app.
const appBundle = path.join(distDir, 'MeshCommander.app');
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
run(`cp -R "${path.join(nwDir, 'nwjs.app')}" "${appBundle}"`);
cpSync(path.join(ROOT, 'app'), path.join(appBundle, 'Contents', 'Resources', 'app.nw'), { recursive: true });
cpSync(path.join(ROOT, 'app', 'meshcommander.icns'), path.join(appBundle, 'Contents', 'Resources', 'app.icns'));

// 3. Fix up Info.plist.
const plist = path.join(appBundle, 'Contents', 'Info.plist');
const pb = (op) => run(`/usr/libexec/PlistBuddy -c '${op}' "${plist}"`);
pb('Set :CFBundleName MeshCommander');
pb('Set :CFBundleDisplayName MeshCommander');
pb('Set :CFBundleIdentifier com.github.meshcommander-for-macos');
pb(`Set :CFBundleShortVersionString ${appVersion}`);
pb(`Set :CFBundleVersion ${appVersion}`);

// 4. Ad-hoc codesign so the app runs locally. Replace "-" with a Developer ID
//    identity (and notarize) for public distribution.
run(`codesign --force --deep --sign - "${appBundle}"`);
run(`codesign --verify --deep --verbose=2 "${appBundle}"`);

// 5. Optional DMG.
if (makeDmg) {
    const stage = path.join(distDir, 'dmg-stage');
    mkdirSync(stage, { recursive: true });
    run(`cp -R "${appBundle}" "${stage}/"`);
    run(`ln -sf /Applications "${stage}/Applications"`);
    const dmg = path.join(ROOT, 'dist', `MeshCommander-${appVersion}-${arch}.dmg`);
    rmSync(dmg, { force: true });
    run(`hdiutil create -volname MeshCommander -srcfolder "${stage}" -ov -format UDZO "${dmg}"`);
    rmSync(stage, { recursive: true, force: true });
    console.log(`\nDMG: ${dmg}`);
}

console.log(`\nDone: ${appBundle} (${arch})`);
