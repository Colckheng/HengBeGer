# HengBerGer 桌面客户端

一个薄壳：把已经验收过的云端站点（`https://<ECS>:8443`，本机预演是 `https://127.0.0.1:8444`）装进原生窗口，
省掉浏览器标签页、地址栏和每次都要点「继续访问不安全站点」的麻烦。**浏览逻辑一行都不重写**，用哪套界面、哪套接口，
都跟浏览器里那套完全一致。

## 为什么是 Electron

- 纯 JS/Node，不需要 MSVC 或 Rust 链接器，出包路径最短、最不容易卡在工具链上。
- Chromium 自带完整的 HTTP 磁盘缓存 → 图片（`Cache-Control: immutable`）和站点资源天然离线可用，
  与安卓端的离线策略方向一致，不用另写一套缓存层。
- 代价：安装包偏大（NSIS 约 100MB 量级）。若以后想要 10MB 以内的安装包，可以换 Tauri 重写这一层壳
  （Rust/cargo 这台机器上已就绪），但窗口壳之外的东西（服务器地址、指纹信任、打包配置）都是现成的参考。

## 目录

| 文件 | 作用 |
| --- | --- |
| `main.js` | 主进程：窗口、菜单、自签证书信任流程、`--smoke` 自检 |
| `preload.js` | contextBridge 暴露 `window.hengberger`（state / saveServer / openExternal / quit） |
| `src/settings.js` | 配置读写与服务器地址规范化，纯逻辑、无 Electron 依赖 |
| `renderer/setup.html` | 首次运行 / 切换服务器地址的设置页 |
| `renderer/error.html` | 连不上时的错误页（含排障提示） |
| `test/settings.test.mjs` | `node --test` 单测（地址规范化、配置往返） |

## 跑起来

```powershell
cd desktop
npm install
npm start            # 打开窗口
npm test             # 地址规范化与配置读写的单测
npm run smoke        # 无人值守自检：加载 → 等首屏 → 截图 → 打印 JSON → 退出
npm run dist         # 出 Windows 安装包（NSIS + 便携版），产物在 desktop/out/
```

仓库根也留了三个入口：`npm run desktop`、`npm run desktop:smoke`、`npm run desktop:dist`。

### 自定义 NSIS 脚本（build/installer.nsi）

`desktop/package.json` 的 `build.nsis.script` 指向 `installer.nsi`，它按 `buildResourcesDir` 解析，
也就是 `desktop/build/installer.nsi`。

为什么要自定义：官方模板会让 electron-builder 先用 `BUILD_UNINSTALLER` 编一个中间安装器，
再**直接运行**它，让它自己 `WriteUninstaller` 吐出 uninstaller.exe 供签名
（`app-builder-lib/out/targets/nsis/NsisTarget.js:337-381`）。那一步在受限宿主里会被信号杀掉
（`ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`），成品安装器根本构建不到。
一旦提供自定义脚本，同文件 :342-345 会提前 return，整条 uninstaller 提取/签名流程被跳过。

代价与注意点：

- uninstaller.exe 不打包也不签名（我们没有代码签名证书，本来就签不了）；
  `registryAddInstallInfo` 仍会写 `UninstallString` 指向 `$INSTDIR\Uninstall HengBerGer.exe`，
  该文件不存在，所以**系统「应用和功能」里的卸载入口是无效的**，卸载请手动删目录。
- 自定义脚本里必须把官方 `installApplicationFiles` 宏（`include/installer.nsh:9-101`）
  末尾的 `File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"` 去掉：
  自定义路线下 `UNINSTALLER_OUT_FILE` 从未被赋值，留着会让 makensis 报
  `Usage: File [/nonfatal] ... / Error in macro installApplicationFiles on macroline 91`。
  NSIS 不允许重定义已存在的宏，所以 `build/installer.nsi` 是把 `installSection.nsh` 的内容
  内联进来、只替换那一行调用。
- 升级 electron-builder 后请和 `node_modules/app-builder-lib/templates/nsis/installer.nsi`
  重新比对。

## 服务器地址

- 本机预演：`https://127.0.0.1:8444`（先 `npm run cloud:preview:up`）
- 上云之后：`https://<ECS 公网 IP>:8443`
- 地址写什么都尽量救：`47.98.1.2:8443` 会自动补成 `https://47.98.1.2:8443`；尾斜杠、query、hash 会被去掉；
  只接受 http/https。没写端口的 `https://1.2.3.4` 会走 443，而云端是 8443，**记得带端口**。
- 存放位置：Electron 的 userData 目录（Windows 上是 `%APPDATA%\HengBerGer\settings.json`），里面还记着
  已信任的证书指纹和上次的窗口尺寸。

## 自签证书怎么处理的

大陆 + 无域名 + 80/443 不可用，所以云端只能用自签证书；浏览器每次都要手点「继续」，客户端则走显式信任：

1. 第一次连某个主机时，主进程收到 `certificate-error`，弹窗把证书的 SHA-256 指纹完整打印出来。
2. 你把它和服务器上 `deploy/ssl/server.crt` 的指纹核对一致后点「信任并继续」，指纹按 `host → 指纹` 记进 settings.json。
3. 之后同一个 host、同一个指纹直接放行；**指纹变了就重新问**（换证书、重签、被中间人都会触发）。
4. 想撤回信任：删掉 settings.json 里的 `trustedHosts` 条目（或整个文件），下次连接会重新询问。

这不是「关掉 TLS 校验」，而是把信任的决定权交给你一次、并记住结果 —— 与安卓端计划里的证书固定是同一个思路。

## 自检（--smoke）

`npm run smoke` 会：用配置里的地址（没配就用 `https://127.0.0.1:8444`）打开窗口（不显示）→ 等 5 秒让首屏把
`/api/catalog/index`（约 2.5MB）拉完 → `capturePage()` 截图到 `desktop/.smoke/screenshot.png` → 打印一行 JSON
（url / title / screenshot / interactiveNodes / 前 10 条 error 级 console 消息）→ 退出。

退出码：`0` 通过、`1` 加载或截图失败、`2` 超时（45 秒）。smoke 模式下证书指纹自动信任（仅此模式）。

## 版本与下载

`electron` 固定在 **42.2.0**：这台机器上 `%LOCALAPPDATA%\electron\Cache` 里已经有这个版本的 win32-x64 包，
安装时直接解压、不用联网。想升到新版本就改 `devDependencies.electron` 再 `npm install`；如果 GitHub Releases 太慢，
用国内镜像：`$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`。

## 排障

- **进程秒退、退出码 `-2147483645`（0x80000003），日志里只有 `crashpad_client_win.cc: not connected`**：
  这是 Chromium 浏览器进程起不来，**不是本项目的代码问题** —— 已用最小 Electron 空应用复证（只 `require('electron')`，
  连窗口都不建，一样在 1 秒内崩）。常见于从受限宿主里启动（沙箱化的终端、CI、服务会话）。
  诊断时可以先 `$env:ELECTRON_DISABLE_SANDBOX="1"` 或加 `--no-sandbox` 试着绕过；
  正常使用请在你的桌面会话里双击/命令行启动。
- **`ELECTRON_RUN_AS_NODE=1` 被宿主塞进环境**：Electron 会以纯 Node 运行，报 `Cannot read properties of undefined (reading 'getPath')`。
  启动前 `Remove-Item Env:\ELECTRON_RUN_AS_NODE`（DSH 这类 Electron 宿主会带这个变量）。
- **连不上**：先 `npm run cloud:preview:up`，或用浏览器直接开 `https://127.0.0.1:8444` 确认服务在；
  再看 ECS 安全组是否放行 8443/tcp。

## 已做的验证

- `npm test`：14 个用例全过 —— 地址规范化 7 个、主进程行为 7 个（自签证书弹窗确认/记住指纹/指纹变更重问/拒绝不放行、
  非法地址被拒、合法地址落盘并打开主窗口、加载失败翻本地错误页且不递归、忽略 -3、窗口尺寸记忆、外部链接只放行 http(s)）。
  主进程用的是 `test/electron-stub.cjs` 替身，所以不需要真的起 GUI。
- 端到端视觉验证（`npm run smoke` 出截图）**需要在能启动 Chromium 的桌面会话里跑**；
  从受限宿主里跑不动的原因见上面「排障」第一条。

## 已知限制

- 目前只做 Windows 打包（`electron-builder --win`）；macOS/Linux 要另加 target。
- 没有自动更新（未接 electron-updater）；升级靠重新跑 `npm run dist` 覆盖安装。
- 站点从云端加载，所以 **断网就等于只有 Chromium 缓存里的东西**；完整的离线浏览（索引进 SQLite、收藏/历史本地化）
  留给后续版本，路线与安卓端一致。
- 公式条目按纯文本渲染（与 Web 端同一策略），没引 KaTeX。
