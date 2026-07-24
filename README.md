# MeshCommander for macOS

A native macOS build of [MeshCommander](https://github.com/Ylianst/MeshCommander), the Intel(R) AMT (vPro) remote management console — with Hardware-KVM, Serial-over-LAN, IDER redirection, power control and more.

- Runs natively on **Apple Silicon (arm64)** and **Intel (x64)** Macs — no Rosetta.
- Built on the latest [NW.js](https://nwjs.io/) runtime, works on current macOS releases.
- Spiritual successor to [gomesjj/MeshCommander](https://github.com/gomesjj/MeshCommander), which is x64-only and unmaintained since 2021.

## Repository layout

| Path | Purpose |
|---|---|
| `upstream/` | Unmodified source of [Ylianst/MeshCommander](https://github.com/Ylianst/MeshCommander), kept isolated so it can be re-synced if upstream ever updates |
| `app/` | The NW.js application payload (UI + manifest + macOS icon) |
| `build/mkapp.mjs` | Build script: downloads NW.js, assembles, signs and packages `MeshCommander.app` |
| `compiler/build.mjs` | Open-source replacement for upstream's closed-source Windows-only "WebSite Compiler": compiles the desktop-edition UI directly from `upstream/` sources |

`app/commander.htm` (and the 9 translated `commander_*.htm` files, switchable via the Language menu) are compiled from `upstream/` v0.9.6 sources by `compiler/build.mjs`. The compiler strips `###BEGIN###{Feature}` conditional blocks according to `compiler/features.json` (the desktop feature set, extracted from upstream's official `NodeWebkit-Commander.wcc` project file) and inlines all scripts and stylesheets into a single file. Regenerate with:

```bash
node compiler/build.mjs --all      # writes dist/compiled/commander*.htm
cp dist/compiled/commander*.htm app/
```

## Download

Grab the DMG for your Mac (Apple Silicon `arm64` or Intel `x64`) from the [Releases page](https://github.com/ljzxzxl/meshcommander-for-mac/releases), then see "Installing / first launch" below.

## Build

Requires macOS 12+, Node.js 18+ and Xcode command line tools.

```bash
node build/mkapp.mjs                  # build for the current machine's architecture
node build/mkapp.mjs --arch x64       # build for Intel Macs
node build/mkapp.mjs --arch arm64 --dmg   # also produce a .dmg
```

Output: `dist/<arch>/MeshCommander.app` (and `dist/*.dmg`).

Continuous integration builds both architectures on every push and attaches DMGs to a GitHub Release whenever a `v*` tag is pushed (see `.github/workflows/build.yml`).

## Installing / first launch

Release builds are currently **ad-hoc signed** (not notarized). On first launch macOS Gatekeeper will block the app. Either:

```bash
xattr -cr /Applications/MeshCommander.app
```

or right-click the app, choose "Open", then confirm — and on macOS 15+ additionally allow it under *System Settings → Privacy & Security*.

## Notes

- Old AMT firmware that only supports TLS 1.0/1.1 with legacy ciphers is handled by `app/node-main.js`, which relaxes the Node TLS defaults inside the app.
- Kerberos authentication is not available on macOS (same as the original gomesjj build).
- IDER uses the pure-JavaScript implementation (the Windows-only `imrsdk.dll` path is not used).

## License

[Apache 2.0](upstream/LICENSE), same as upstream MeshCommander. MeshCommander was created by Ylian Saint-Hilaire / Intel Corporation; Intel has discontinued support for the original tool.
