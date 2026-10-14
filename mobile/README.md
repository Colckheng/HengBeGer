# HengBerGer 安卓客户端（Expo / React Native）

连云端 HengBerGer 的手机端。云端是自签 TLS + 只读的，所以客户端要解决两件事：服务器地址可配、自签证书靠固定的公钥信任（见下面「证书固定」）。
纯解析逻辑（`src/demo/contentModel.js`、`src/open-index/copy.js`）直接复用仓库根的模块，不复制代码 —— Metro 的 `watchFolders` 指到了仓库根。

设计依据：`docs/plans/2026-10-14-cloud-android-design.md` §5。

## 依赖环境

- Node 22（仓库 `engines`：^20.19.0 || >=22.12.0）
- Android SDK（本机在 `C:\Users\hengxing\AppData\Local\Android\Sdk`）
- JDK 17：PATH 上的 `java` 是 1.8，对现代 Gradle 太老，必须指到 Android Studio 自带的 JBR：
  ```powershell
  $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
  ```
- 模拟器或真机（`adb devices` 能看到）

## 安装与跑起来

```powershell
npm --prefix mobile install

$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
npm run mobile:android     # = expo run:android；首次会自动 prebuild 出 android/ 工程
npm run mobile:start       # 只起 Metro（已经装过 debug 包时用这个）
```

## 接哪台服务器

设置页（`app/settings.tsx`）里填服务器地址并测试连通，默认 `https://127.0.0.1:8444`。

- 模拟器访问宿主机：`https://10.0.2.2:8444`
- 真机：同局域网 IP，或云服务器公网 IP（`https://<IP>:8443`）
- 必须是 https；自签证书的信任问题由下面的证书固定解决。

## 证书固定（关键，配错就连不上）

1. 生成服务器证书：`npm run cloud:cert -- --ip <服务器IP>` → 产物 `deploy/ssl/server.crt`
2. 生成固定文件：`npm run mobile:pins` → `mobile/native/network_security_config.xml`

   Android 的 `<pin-set>` 固定的是**公钥 SPKI 的 SHA-256（base64）**，不是证书指纹 —— 两者不同，填错会直接 TLS 握手失败。
3. prebuild 之后把它拷进 Android 工程，并在 `AndroidManifest.xml` 的 `<application>` 上加属性：

   ```powershell
   Copy-Item mobile/native/network_security_config.xml mobile/android/app/src/main/res/xml/network_security_config.xml
   ```
   ```xml
   <application android:networkSecurityConfig="@xml/network_security_config" ... />
   ```
4. **证书一旦重新生成，pin 就变了**，必须重跑 `npm run mobile:pins` 再拷一次。

## 测试与类型检查

```powershell
npm run mobile:test        # node --test（22 个用例；打本机预演栈的 live 用例在栈没起时自动跳过）
npm run mobile:typecheck   # tsc --noEmit
npm run mobile:pins        # 重新生成证书固定文件
```

注意：`node --test` 在 Windows 下不能传目录，必须显式列文件（`package.json` 里已经列好）。

## 离线与缓存

- 索引（约 2.6MB）缓存进 SQLite，6 小时过期；先出缓存，再后台刷新，下拉可强制刷新。
- 详情只有看过的才存。
- 图片靠 RN 原生磁盘缓存 + 服务端 `Cache-Control: immutable`，不需要自己写缓存。
- 收藏 / 历史纯本地（SQLite kv 表，历史最多 100 条）。

## 出包（阶段 6，未做）

```powershell
npm run mobile:prebuild
# 用 keytool 生成自签 keystore 后 gradle assembleRelease
```

keystore **务必自己备份**：丢了就再也签不出能覆盖安装的同签名新版本。keystore 与 `keystore.properties` 都不进仓库（`.gitignore` 已排除）。

## 已知限制

- 只做 Android。不搬原图、不做 iOS、不上 Google Play、不申请域名（设计文档 §8 YAGNI）。
- 公式（全库只有 3 条条目用到）降级成纯文本。
- 云端只读：App 不改服务端数据。
