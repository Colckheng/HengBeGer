# HengBerGer 安卓客户端（Expo / React Native）

连云端 HengBerGer 的手机端。云端是自签 TLS + 只读的，所以客户端要解决两件事：服务器地址可配、自签证书靠固定的公钥信任（见下面「证书固定」）。
纯解析逻辑（`src/demo/contentModel.js`、`src/open-index/copy.js`）直接复用仓库根的模块，不复制代码 —— Metro 的 `watchFolders` 只指到仓库根的 `src/demo/`（根 `node_modules` 另由 `resolver.nodeModulesPaths` 保留）。**不要**把整个仓库根塞进 `watchFolders`：`deploy/data-preview/mysql/` 是 Docker MySQL 的数据目录，Metro 的文件监听会因 `EACCES: lstat ...mysql.sock` 直接崩掉。

设计依据：`docs/plans/2026-10-14-cloud-android-design.md` §5。

## 依赖环境

- Node 22（仓库 `engines`：^20.19.0 || >=22.12.0）
- Android SDK（本机在 `C:\Users\hengxing\AppData\Local\Android\Sdk`）
- JDK 17：PATH 上的 `java` 是 1.8，对现代 Gradle 太老，必须指到 Android Studio 自带的 JBR：
  ```powershell
  $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
  ```
- 模拟器或真机（`adb devices` 能看到）。**本机原来的两个 AVD（`HengSch_QA_API_35`、`Pixel7`）已删掉腾空间**，
  需要时重建即可（system image 还在 SDK 里，离线就能建）：

  ```powershell
  $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
  & "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd `
      -n HengSch_QA_API_35 -k "system-images;android-35;google_apis;x86_64" -d pixel_7
  ```

  起来时（AMD 显卡）只有 `-gpu off` 能跑，`-gpu swiftshader_indirect` 会在 2 秒内 `exit 1`：

  ```powershell
  & "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd HengSch_QA_API_35 -no-snapshot-load -no-boot-anim -no-window -gpu off
  ```

  连本机预演栈时用 `adb reverse tcp:8444 tcp:8444`（debug 包还要 `adb reverse tcp:8081 tcp:8081` 给 Metro），
  这样设备上的 `127.0.0.1:8444` 直通宿主机，证书 SAN（`DNS:localhost, IP:127.0.0.1`）天然匹配，不必为 `10.0.2.2` 重签证书。连云端（默认地址）不需要 reverse，模拟器走公网即可。

## 安装与跑起来

```powershell
npm --prefix mobile install

$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
npm run mobile:android     # = expo run:android；首次会自动 prebuild 出 android/ 工程
npm run mobile:start       # 只起 Metro（已经装过 debug 包时用这个）
```

## 接哪台服务器

设置页（`app/settings.tsx`）里填服务器地址并测试连通，默认 `https://39.102.49.72:8443`（云端 ECS，见 `mobile/src/api/client.js:8`）。

- 云端 ECS：`https://39.102.49.72:8443`（默认；模拟器与真机都能直连）
- 本机预演栈：`https://127.0.0.1:8444`（配 `adb reverse tcp:8444 tcp:8444`）
- 模拟器访问宿主机：`https://10.0.2.2:8444`
- 真机连本机：同局域网 IP + 8444
- 必须是 https；自签证书的信任问题由下面的证书固定解决。

## 详情页的信息分层

服务端 `buildSections()` 只按 `## 标题` 切块，一个 hsr 角色平均 **18.9 个平铺 section**（最多 24 个），
手机上就是一列看不到头的标题，而且正文几乎全是 markdown 表格，`react-native-markdown-display` 会把表格渲染成竖向无限堆叠的长条。
所以详情页（`app/entry/[key].tsx`）在 `src/lib/sections.js` 里做两层收敛：

1. **分区折叠**：按标题语义把 section 收成「概览 / 战斗 / 养成 / 故事 / 其他」五张卡，前两张默认展开，后三张默认折叠，
   分区头显示章节数与 `▸/▾`，点一下才展开。每个分区最多展示 6 节，超出显示「还有 N 个同类章节未展示」。
2. **子表拆分**：一个 section 的表格块里常常粘着多张子表（hsr 晋阶表 97 行其实是 9~15 张，
   中间还夹着数量列全空的「材料/数量」表），只按第一个表头切就会渲染成一坨 95 行的杂物。
   `src/lib/values.js` 的 `splitTables()` 改用「**一行后面紧跟分隔行 `|---|---|`，它就是表头**」定位边界
   （子表之间没有空行，只能靠这个组合认边界），拆完再逐张渲染。
3. **数值可视化**：末列单元格里 34.5%（10887/31529）是纯数字或纯百分比。能抽到数值的子表按
   `src/lib/values.js` 的 `tableToSeries()` + `computeScale()` 画成条形（同一张表共享刻度，
   条形长度才能横向比较；百分比刻度且最大值 >100% 时轨道上画一条 100% 参考线）。
   抽不到数值的仍退回键值卡 / Markdown，不把文字硬塞进条形。
4. **等级型表用拖动条**：键全是 `等级n` / `Lv.n` 且 ≥3 级的（hsr 行迹、技能倍率这类，全库 300 个角色条目里
   有 822 张），用 `src/ui/Bars.tsx` 的 `LevelPicker`——一根可拖的滑轨选等级，只显示当前等级那一行的数值，
   而不是把 12 级全铺开。**刻意不用 `@react-native-community/slider`**：它是原生依赖，
   装完要重新 prebuild + 出包（约 5 分钟），而这里只需要「按百分比取整」，PanResponder + onLayout 零依赖零风险。
5. **`| 等级 | 项目 | 数据 |` 三列表按形态分派**：全库 911 张，长得很像但语义完全不同，认错就会渲染成
   拖动条刻度写着「等级 总计→等级 满级」的怪东西。`SubTable` 的判断顺序：
   - **属性快照**（69 张，zzz 代理人「总计」表）：等级列是 `初始/10/20/…/满级`、项目列大面积为空、
     数据列是 `生命值：603 攻击力：95 …` 一整串。→ `StatSnapshotPicker`：等级滑轨 + 属性键值网格，
     10~50 级那种「突破前 + 突破后」两组属性用 `groupStatSegments()` 按标签重复切组，第二组标「突破后」。
     **刻意不画条形**：生命值 7500 和暴击率 5% 同刻度会把百分比压成看不见的线。
     「总计」行是全表材料合计且源数据把数字和名字粘在一起（`4初阶击破认证章32高阶…`），
     `splitMaterialRun()` 拆成 chips，不拆的话就是一整段没法读的糊字。
   - **核心技 A~F**（59 张，等级列是单字母不是数字）：→ `RankTable`，每级一个徽章 + 该级核心被动
     末尾百分比（`37.3%→64%`）画一条 A→F 递增的条形，下面跟效果全文与材料。
   - **真技能表**（等级 1..N + 项目 伤害倍率/失衡倍率/养成材料）→ `ProjectLevelPicker`（拖动条选等级，
     多段值如 `一段伤害倍率：31.2% 二段…` 用 `splitSegments()` 拆成多条 bar）。

另外 hero 图从「独占一屏 180dp」缩成 108dp 与标题/收藏按钮横向并排，首屏就能看到属性表和第一张分区卡。
`mobile/test/sections.test.mjs` 覆盖分区归属、表格解析、键值收敛与分组的边界；
`mobile/test/values.test.mjs` 覆盖子表拆分、数值抽取、刻度计算、拖动条触发条件，以及属性快照 / 核心技 A~F /
粘连材料串的解析（这三类判定错一个，详情页就会退化成一整屏糊字）。

## 证书固定（关键，配错就连不上）

做法：把自签证书本体放进 `res/raw/`，用 `network_security_config.xml` 声明**只信任这些证书**（不信任任何公共 CA）。

1. 生成服务器证书：云端跑 `node deploy/scripts/make-cert.mjs --ip <公网IP>` → 产物 `deploy/ssl/server.crt`；把公网证书拷成 `deploy/certs/cloud-server.crt` 进仓库（`deploy/ssl/` 被 .gitignore 排除）
2. 生成固定文件：`npm run mobile:pins` → `mobile/native/` 下：`native/*.pem` 每个文件就是一个信任锚，配置里逐个 `<certificates src="@raw/<名字>" />`（可同时信任云端与预演栈）

   - `cloud_server.pem`（云端 `deploy/certs/cloud-server.crt`，CN=39.102.49.72）与 `server.pem`（预演 `deploy/ssl/server.crt`，CN=localhost；不存在就跳过）—— 证书本体，公开信息可进仓库
   - `network_security_config.xml` —— release 用：信任上面那张证书 + 禁明文
   - `network_security_config.debug.xml` —— debug 用：同上，但放开明文（Metro 走 http）
3. prebuild 之后打补丁（`android/` 是 prebuild 生成的，手改会被覆盖，所以用脚本）：

   ```powershell
   npm run mobile:prebuild   # 生成 android/ 工程
   npm run mobile:patch      # 拷 pem→res/raw、两份 xml→res/xml，并给 AndroidManifest 加 networkSecurityConfig
   ```

   脚本是幂等的：已经打过就报「已是最新」。对应 `mobile/scripts/apply-android-patches.mjs`。
4. **证书一旦重新生成，信任锚就变了**，必须重跑 `npm run mobile:pins` 与 `npm run mobile:patch`（再 `npm run mobile:release` 重打包），否则 App 直接连不上。脚本会顺手删掉 `res/raw/` 里没人引用的旧 `.pem`（aapt2 会把它们也打进包）。

> **不要用 `<pin-set>`。** Android 的解析器只允许 `<pin-set>` 出现在 `<domain-config>` 里，放进 `<base-config>` 会在 Application 初始化时抛
> `ParserException: pin-set element not allowed in base-config`，App 一启动就闪退（连崩溃日志都要靠 `adb logcat` 才看得到）；
> 而 `<domain-config>` 必须写死域名/IP，与本项目「服务器地址可在设置页改」直接冲突。
> 源码依据：`XmlConfigSource.java:270-274`（`<domain>` 在 `:255-259` 有同样限制）。
> `mobile/test/android-config.test.mjs` 会静态校验这几条规则，改错会直接测试失败。

> 主机名校验仍由证书自己的 SAN 决定（`@raw` 信任锚只解决"信不信这张证书"，不解决"名字对不对"）。
> 所以换 IP 要重新签一张 SAN 含该 IP 的证书，再重跑 pins + patch 重装。

## 测试与类型检查

```powershell
npm run mobile:test        # node --test（87 个用例；live 用例默认打本机预演栈，栈没起时自动跳过）
npm run mobile:typecheck   # tsc --noEmit
npm run mobile:pins        # 重新生成证书固定文件
```

注意：`node --test` 在 Windows 下不能传目录，必须显式列文件（`package.json` 里已经列好）。

live 用例打的是真实服务器，可以指向云端：

```powershell
$env:HENGBERGER_TEST_SERVER='https://39.102.49.72:8443'; node --test mobile/test/live.test.mjs
```

`punycode` 是显式依赖：`react-native-markdown-display` → `markdown-it@10` 在 `lib/index.js:14` 里 `require('punycode')`，
但 `markdown-it` 自己没声明这个依赖，Metro 会报 `Unable to resolve module punycode`，bundle 直接 500。

## 离线与缓存

- 索引（约 2.6MB）缓存进 SQLite，6 小时过期；先出缓存，再后台刷新，下拉可强制刷新。
- 详情只有看过的才存。
- 图片靠 RN 原生磁盘缓存 + 服务端 `Cache-Control: immutable`，不需要自己写缓存。
- 收藏 / 历史纯本地（SQLite kv 表，历史最多 100 条）。

## 出包

debug 包（自签用的就是 Gradle 默认 debug keystore，不用自己准备）：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\Users\hengxing\AppData\Local\Android\Sdk'
npm run mobile:prebuild; npm run mobile:patch
cd mobile\android
.\gradlew.bat assembleDebug
# 产物 mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

正式包（一条命令）：

```powershell
npm run mobile:keystore    # 首次：生成 mobile\hengbeger-release.keystore + keystore.properties（已存在则拒绝覆盖）
npm run mobile:release     # 打补丁 → assembleRelease → 验签 → 复制到 mobile\dist\hengbeger-release.apk
```

`mobile:release` 会自动把 `JAVA_HOME` 指向 Android Studio 的 jbr（AGP 只对它有保证，PATH 上的 java 1.8 编不了），
并用 `apksigner verify --print-certs` 核对签名者指纹与 keystore 一致。装 release 包前必须先 `adb uninstall cc.nanoka.hengbeger`
（签名与 debug 包不同，不能覆盖安装）；release 包内嵌了 JS bundle，**不需要 Metro**。

keystore **务必自己备份**：丢了就再也签不出能覆盖安装的同签名新版本。keystore 与 `keystore.properties` 都不进仓库（`.gitignore` 已排除）。

> **Windows 长路径**：release 构建（RelWithDebInfo）下 ninja 1.10.2 会对超过 260 字符的对象文件路径直接报
> `Stat(...): Filename longer than 260 characters`。CMake 本来会把超长对象名换成 `md5(前缀)+文件名`，
> 但默认 `CMAKE_OBJECT_PATH_MAX=250` 时 armeabi-v7a 恰好差 1 个字符没触发缩短。补丁脚本会在 `defaultConfig` 里注入
> `-DCMAKE_OBJECT_PATH_MAX=270`（安全窗口 251..342），Debug 变体因为目录名短 9 字符本来就不会踩到。

## 已知限制

- 只做 Android。不搬原图、不做 iOS、不上 Google Play、不申请域名（设计文档 §8 YAGNI）。
- `app/` 下**只能放路由页面**：expo-router 会把目录里每个文件当路由，工具模块要放 `src/`（例如全局单例在 `src/api/app.ts`）。
- 公式（全库只有 3 条条目用到）降级成纯文本。
- 云端只读：App 不改服务端数据。