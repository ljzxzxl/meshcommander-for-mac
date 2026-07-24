# MeshCommander for macOS — 交接文档 (ONBOARDING)

> 目的：让你在**另一台机器的全新会话**中，仅凭此文档就能快速接手本项目。三阶段路线图（壳 → CI → 自研编译器）已全部完成；`v0.2.0` 起 UI 由自研编译器从上游源码再生；`v0.2.1` 更换全新应用图标。

---

## 1. 项目是什么

Intel AMT (vPro) 远程管理控制台 [MeshCommander](https://github.com/Ylianst/MeshCommander) 的 **macOS 原生客户端**（Hardware-KVM / Serial-over-LAN / IDER / 电源控制等），支持 **Apple Silicon (arm64) + Intel (x64)** 双架构，可跑最新 macOS。对标已停更 4 年、仅 x86 的 gomesjj/MeshCommander。

- 仓库：`git@github.com:ljzxzxl/meshcommander-for-mac.git`（分支 `main`，remote `origin`）
- 已发布：`v0.1.0`（MVP + CI）、`v0.2.0`（自研编译器，UI 从上游源码再生）、`v0.2.1`（新版应用图标）
- 技术栈：**NW.js v0.113.0**（Chromium 149 / Node 26）壳 + 上游纯 Web 技术 UI；构建/编译脚本为 Node ESM（`.mjs`），无第三方 npm 依赖

### 版本号体系（容易混淆，先记住）
| 数字 | 是什么 |
|---|---|
| `0.9.7` | MeshCommander **本体** 版本（界面左上角显示），定义在 `upstream/index.html` 的 `var version = '0.9.7'`，与官方 Windows 客户端同源同版 |
| `0.9.6` | `upstream/package.json` 的 version 字段——**上游忘了同步**，不代表真实版本 |
| `0.9.5` | gomesjj 旧产物的本体版本（v0.2.0 之前我们借用它，现已淘汰） |
| `0.2.x` | **本项目 macOS 壳工程**自己的版本（`package.json` + `app/package.json`，DMG 文件名用它） |

---

## 2. 构建与运行（关键约束）

- 只需 macOS 12+、Node 18+、Xcode Command Line Tools。
- **本机网络特殊性**：`raw.githubusercontent.com` 直连超时；`api.github.com`、`dl.nwjs.io`、git SSH 均可用。下载 GitHub 仓库单文件走 API 通道：`curl -H "Accept: application/vnd.github.raw" https://api.github.com/repos/{owner}/{repo}/contents/{path}`。
- **无 gh CLI**。查 CI / Release 状态用 REST API：`curl https://api.github.com/repos/ljzxzxl/meshcommander-for-mac/actions/runs`、`.../releases`。

```bash
npm run compile                        # compiler/build.mjs --all：从 upstream/ 源码编译 UI → dist/compiled/commander*.htm
cp dist/compiled/commander*.htm app/   # 编译产物放入应用负载（改了 upstream/ 或白名单后需要这两步）
node build/mkapp.mjs                   # 构建当前架构 .app（--arch arm64|x64、--dmg 可选）
npm run dist                           # 双架构 + DMG 一次出齐
```

- 产物：`dist/<arch>/MeshCommander.app`、`dist/*.dmg`。NW.js 运行时首次下载后缓存于 `.cache/`。
- **运行新构建**：必须 `open -n "$PWD/dist/arm64/MeshCommander.app"` 或直接执行 `./dist/arm64/MeshCommander.app/Contents/MacOS/nwjs`——裸 `open` 会被 LaunchServices 拉起 /Applications 里的旧版。
- 发布：推 `v*` tag 触发 `.github/workflows/build.yml`（macos-14、matrix arm64/x64、`permissions: contents: write`），自动构建 DMG 并发 GitHub Release。
- ad-hoc 签名未公证：首次运行需 `xattr -cr MeshCommander.app` 或右键→打开放行。

---

## 3. 目录结构

| 路径 | 职责 |
|---|---|
| `upstream/` | Ylianst/MeshCommander 上游源码**原样隔离**（勿改），是编译器的输入；上游更新时整体替换再重新编译 |
| `app/` | NW.js 应用负载：`commander.htm` + 9 个语言版（编译产物）、`package.json`（NW.js manifest）、`node-main.js`（兼容层）、`meshcommander.icns`/`favicon.png`（图标）、`images-commander/` 等图片、`empty.iso`/`empty.img`（IDER 用） |
| `app/node-main.js` | **UI 加载前的 Node 兼容层，勿删**：老 AMT 固件 TLS 放宽（`DEFAULT_MIN_VERSION='TLSv1'` + `:@SECLEVEL=0`）+ 新 Node 已移除的 `crypto.createCipher/createDecipher` 的 EVP_BytesToKey polyfill（否则旧版保存的密码数据无法解密） |
| `build/mkapp.mjs` | 打包脚本：下载/缓存 NW.js → 组装 .app → PlistBuddy 改 Info.plist → ad-hoc codesign → 可选 hdiutil 出 DMG |
| `compiler/build.mjs` | **自研编译器**（替代上游闭源 Windows-only "WebSite Compiler"），见第 4 节 |
| `compiler/features.json` | 桌面版功能白名单（49 项），来源见第 4 节 |
| `compiler/infer-features.py` | 白名单反推工具（字符串特征法对比编译产物），留作考古/校验 |
| `.github/workflows/build.yml` | CI：双架构构建 + tag 发 Release |

---

## 4. 自研编译器（务必理解）

上游桌面版 UI 由闭源的 "WebSite Compiler"（仅 Windows）从源码编译。`compiler/build.mjs` 是其开源替代，从 `upstream/index.html`（及 `index_xx.html` 语言版）生成单文件 `commander.htm`：

1. **条件编译标记**：源码中 `<!-- ###BEGIN###{Feature} -->` / `<!-- ###END###{Feature} -->`（HTML）和 `// ###BEGIN###{Feature}`（JS/CSS）成对标记，`{!Feature}` 为取反（未启用时保留）。按 `features.json` 白名单裁剪。
   - **不同 feature 的区域可交叉重叠（非严格嵌套）**！同名 BEGIN 配对下一个同名 END。实现是按 feature 独立深度计数（Map），不能用栈匹配。
   - 翻译版 HTML 会把多对标记压在同一行，预处理先把 HTML 注释标记正则拆分为独立行。
2. **单 script 块合并**：所有 `<script src>` 外链 JS（各自先裁剪标记）合并注入**内容最大的主 script 块**开头。这是官方产物的结构——库文件顶层代码引用主脚本函数（如 `amt-script` 的 `script_functionTableX2` 引用 `passwordcheck`），只有同块函数提升才不炸。HTML 里散落的小 script 保持原位。`</script` 转义为 `<\/script`。
3. **CSS 内联**为 `<style>`；图片保持外链（`app/` 里已带）；不做 minify（NW.js 本地加载无压力，产物 ~2.1MB 可读可 diff）。
4. 输出到 `dist/compiled/`，校验残留标记数为 0。

**白名单来源**（`features.json` 的 49 项）：上游官方工程文件 `upstream/websitecompiler/NodeWebkit-Commander.wcc`（.NET BinaryFormatter 二进制）内**按字母序排列的 PlatformTree 数据段**提取 46 项（用正则抽可打印 ASCII 字符串即可看到），另补 3 项 .wcc 快照之后上游新增、但官方 0.9.5 产物已含的功能（`NetAuth`、`DesktopClipboard`、`DesktopRecorder`）。
**`**ClosureAdvancedMode` 故意不启用**：其内容是 Closure 高级压缩用的 `window['x']=x` 导出，官方桌面编译会剔除；且上游 0.9.7 存在"函数已被 `/* */` 注释但导出语句还在"的疏漏（`UploadAppToStorage`），启用会启动即抛 ReferenceError。

---

## 5. 踩过的坑（避免重犯）

- **`crypto.createDecipher is not a function`**：Node 22+ 移除了 legacy crypto API，上游 UI 依赖它解密本地保存的凭据 → `app/node-main.js` 的 EVP_BytesToKey (MD5/无盐/1轮) polyfill 修复，勿删。
- **老 AMT 固件连不上（TLS 握手失败）**：仅支持 TLS 1.0/1.1 + 旧套件 → `node-main.js` 放宽 `tls.DEFAULT_MIN_VERSION` 并追加 `:@SECLEVEL=0`。
- **图片裂图**：`commander.htm` 引用外部图片的形式有三种——CSS `url(images-commander/x.png)`、JS 拼接 `'images-commander/icons200-'+icon+'-1.png'`、**无引号 HTML 属性** `<img src=authcsme.png>`（正则找引用时容易漏最后一种）。图片必须随 `app/` 打包。
- **语言切换崩溃**：菜单项 click 执行 `window.location.href='commander_xx.htm'`，目标文件缺失即白屏 → 9 个语言版 htm 必须齐全（编译器 `--all` 一次全出）。
- **编译产物启动报 `xxx is not defined`**：先怀疑三件事——① 外链 JS 没合并进主 script 块（跨块顶层引用）；② 白名单少开了定义所在 feature；③ 上游自身疏漏（如 ClosureAdvancedMode 导出已注释的函数）。用"产物中引用点与定义点之间数 `</script>` 边界"的办法定位。
- **文件写入工具不落盘**：AI 工具链的 Write/StrReplace 曾对 `README.md` 报成功但磁盘仍 0 字节（README 曾以空文件提交进 git 数个提交才发现）→ 关键文件写完必须 `wc -l` / `grep` 验证，不生效改用 `python3 heredoc` 直接写。
- **AppleScript UI 自动化**：应用菜单项名称随界面语言本地化（中文界面下 Language 菜单叫"语言能力"），且 0.9.7 英文菜单项与 0.9.5 措辞不同（"Chinese (Simplified)" vs "Simplified Chinese"）→ 点击前先动态 `get name of menu items` 再按实际名称点。
- **截图截不到应用窗口**：主屏被全屏应用的 Space 占据时 `screencapture -x` 截不到别的 Space/副屏窗口 → 用 swift `CGWindowListCopyWindowInfo` 找主窗口 ID（owner=MeshCommander、layer=0、尺寸 970×792，忽略多个 1920×30 的菜单栏辅助窗口），再 `screencapture -l <id>` 按窗口截图。
- **数据继承**：`app/package.json` 的 `name` 必须保持 `meshcommander`——与 gomesjj 旧版一致即共享 NW.js 用户数据目录，自动继承旧版的计算机列表与固定证书；改名会"丢"数据。
- **Kerberos**：macOS 上不可用（控制台启动时一条 "Unable to setup kerberos" 属正常，官方版同样如此）。

---

## 6. 【v0.1.0】MVP + CI

- NW.js 壳 + 借用 gomesjj 0.9.5 编译产物；`build/mkapp.mjs` 打包签名；用户真机验证通过（含 KVM/SOL、TLS 连真实 AMT 设备 Intel ME v16.1.35/ACM）。
- `.github/workflows/build.yml`：macos-14 runner、matrix arm64/x64、`actions/cache` 缓存 `.cache/`（key 含 `hashFiles('build/mkapp.mjs')`）、tag 触发 `softprops/action-gh-release` 上传 `dist/*.dmg`。

## 7. 【v0.2.0】自研编译器，UI 从源码再生

- 见第 4 节。`app/commander*.htm` 全部替换为从 `upstream/` 0.9.7 源码自编译的产物，功能与官方桌面版一致（还多了 0.9.5 没有的 MeshCentral 服务器连接、剪贴板同步等）。
- 验证手法：启动后控制台 0 个 Uncaught 错误；AppleScript 驱动语言菜单双向切换（英→中→英）不崩溃；KVM 等核心功能用户真机复验。

## 8. 【v0.2.1】新版应用图标

- 源图 `1254×1254` PNG **无 alpha 通道**（四角"棋盘格"是画进像素的假透明）→ PIL 处理：中心线扫描色彩边界裁出本体 → 缩放 824px 居中 1024 透明画布（macOS Big Sur+ 规范留边）→ 22.5% 圆角遮罩（radius 185）抠出真透明 → 10 尺寸 iconset → `iconutil -c icns` 打包 `app/meshcommander.icns`；另出 32px `app/favicon.png`（NW.js 窗口图标）。
- Dock/Finder 显示旧图标属系统缓存，`killall Dock` 或注销刷新。

---

## 9. 验证清单（改完自检）

- `npm run compile` 通过且每个文件 "leftover markers: 0"；产物替换进 `app/` 后 `node build/mkapp.mjs` 构建成功。
- `./dist/arm64/MeshCommander.app/Contents/MacOS/nwjs --enable-logging=stderr` 启动，控制台除 kerberos 提示外**无 Uncaught 错误**。
- 界面左上角显示 v0.9.7（或更新的上游版本号）；四个侧栏图标、右栏电脑大图、authcsme 图标不裂图。
- Language 菜单切换任意语言不白屏，切回英文正常。
- 真实 AMT 设备连接 / KVM 可用（需真机，交给维护者验收）。
- 发版：推 tag 后 `curl https://api.github.com/repos/ljzxzxl/meshcommander-for-mac/actions/runs` 确认 CI success，`/releases` 确认新 Release 挂上 arm64 + x64 两个 DMG。

## 10. 约定

- 提交信息说明动机；`upstream/` 只做整体同步不做修改；UI 的改动一律改 `upstream/`→白名单→重新编译，**不直接手改 `app/commander*.htm`**（会被下次编译覆盖）。
- 发版流程：改 `package.json` + `app/package.json` 版本号 → 提交 push → `git tag vX.Y.Z && git push origin vX.Y.Z` → CI 自动出 Release。
- 上游更新流程：替换 `upstream/` → `npm run compile` → 产物拷入 `app/` → 构建冒烟（控制台无错、语言切换、图片）→ 交维护者真机复验 KVM。
