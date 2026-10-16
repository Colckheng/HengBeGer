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
npm run mobile:test        # node --test（53 个用例；live 用例默认打本机预演栈，栈没起时自动跳过）
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
