# HengBerGer

> 绝区零 / 崩坏：星穹铁道 / 货币战争 多源资料采集与图鉴系统 —— 一个自建、可离线、可上云的开放式游戏资料库。

HengBeGer 面向「想把散落在十几个 wiki 站里的游戏资料收拢到一处，并且能追溯出处」的人：它把多个公开数据源采集成一份可版本控制的 Markdown 资料层，再编译成结构化目录供网页、桌面端和安卓端共读，同时保留一套管理员后台来直接编辑旧 Wiki 的业务表。

---

## 目录

- [这是什么 / 解决什么问题](#这是什么--解决什么问题)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [常用脚本](#常用脚本)
- [配置与环境变量](#配置与环境变量)
- [测试](#测试)
- [数据采集与同步](#数据采集与同步)
- [桌面端 / 移动端](#桌面端--移动端)
- [部署](#部署)
- [相关文档](#相关文档)
- [License](#license)

---

## 这是什么 / 解决什么问题

游戏资料散落在官方 API、B 站 wiki、gamekee、nanoka 镜像站等十几个来源里：字段命名不一、图片挂在不同 CDN、数值口径各不相同、版本更新只能靠人肉对比。想把这些资料做成一个能长期维护的站点，难点从来不是「渲染页面」，而是三件事：

1. **来源可追溯** —— 每条资料要能回答「哪来的、什么时候抓的、哪些字段还没核验」。
2. **更新可控** —— 爬虫改了几千个文件，不能直接灌进生产库。
3. **多端同构** —— 同一份数据要能在网页、桌面窗口和手机上表现一致。

HengBeGer 的做法是把这三件事拆成三层：

```
数据源 → data/（Markdown 资料层，git 可追溯）→ catalog 目录（编译产物）→ MySQL → 网页 / 桌面端 / 移动端
```

- **`data/` 是权威层**：一个条目一个 Markdown 文件，front-matter 记录 `game / type / id / name / source / source_url / captured_at`，正文是表格化数值。改一个字就是一次 git diff。
- **`catalog` 是编译层**：`scripts/catalog/data.js` 的 `compileCatalog()` 把 `data/` 编译成条目 + 图片清单，产出稳定的 `treeHash` 作为变更指纹。
- **门禁在导入前**：爬虫跑完生成差异报告（`reports/<id>.md` + `.json`），人工审阅并确认后，才允许导入数据库；`data/` 在报告生成后又被改动的话，导入会被直接拒绝。

除了这条采集链路，仓库里还保留了一套更早的「旧 Wiki 后台」：MySQL 里的 15 张业务表（代理人 / 音擎 / 驱动盘 / 邦布 / 星铁角色 / 光锥 / 遗器 等）加上管理员登录，前端对应 `/zzz-wiki`、`/hsr-wiki` 两套页面和它们的 `/admin` 管理页。这两套并存：日常抓取走 catalog 管线，后台改数据走 CRUD。

---

## 功能特性

### 开放图录（网站首页，`/` 与 `/index`）

- 一个首页聚合 3 个世界（绝区零 / 星铁 / 货币战争）、23 个分类的入口，首页展示全站资料总数。
- 图鉴列表页支持**站内搜索 + 多字段筛选**（字段内多选取或、字段间取交集），筛选取值直接来自当前索引实际数据。
- 条目详情页按「目录 → 章节 → 小节」三层组织，正文表格自动渲染，数值列可转条形可视化，等级型表格提供可拖动的等级滑轨。
- 前后端一致的数据契约：列表走 `/api/catalog/index`（一次返回全量索引，实测约 2.7 MB，服务端缓存 60 秒），详情走 `/api/catalog/entry`。
- 支持 `/` 快捷键聚焦搜索、深色主题、键盘可达的翻页与返回定位。

> 实现：`src/open-index/OpenIndex.jsx`、`src/demo/AtlasCollection.jsx` / `AtlasDetail.jsx` / `AtlasEdition.jsx`、`src/demo/model.js`、`src/demo/values.js`；服务端 `server/openIndex.js` + `server/catalog.js`。

### 旧 Wiki 与管理后台

- 两套公开 Wiki：`/zzz-wiki`（列表 + `/zzz-wiki/agent/:id` 详情）与 `/hsr-wiki`。
- 两套管理页：`/zzz-wiki/admin`、`/hsr-wiki/admin`，由 `AdminAuthGate` 包裹，未登录自动跳转登录。
- 列表走分页 API（`limit` / `offset`，默认 12 条、上限 100 条），筛选参数支持多值（`factionIds`、`roleIds`、`rarityIds`、`elementIds`、`pathIds`、`typeIds`、`parts`）。
- 管理页支持新增 / 编辑 / 删除 / 图片上传 / 批量替换，写操作全部落库，再串行重建 root storage 与 web storage 快照。
- 管理员密码登录：scrypt 派生 + 定长比较，同源走 HttpOnly Cookie，跨域回退 `Authorization: Bearer <签名 Session Token>`，会话有效期 8 小时，登录失败 15 分钟内限流 10 次。

> 实现：`src/ZZZWiki.jsx`、`src/hsr/HsrWiki.jsx`、`src/AdminPanel.jsx`、`src/hsr/HsrAdminPanel.jsx`、`src/hooks/usePaginatedPublicList.js`、`server/middleware/auth.js`、`src/db/api.js`。

### 数据采集管线

- 6 个采集器脚本，覆盖 **米游社官方 API**、**B 站 wiki**、**gamekee**、**nanoka 镜像站**、**zzz.gg / SRS / appfeng / bittopup** 等辅助核对源，以及独立的图片采集器。
- 采集器只写 `data/`，同时产出 diff 报告（新增 / 修改 / 删除清单 + 异常项），**默认干跑**，必须显式 `--write` 才落盘。
- 支持按名字或数字 ID 定点抓取，也支持整类批量；支持 `--versions` 查看上游当前数据版本。
- 图片按内容寻址（文件名 = 字节 sha256）下载到 `data/images/`，并回写 front-matter 的 `image` 字段；`data/images/` 不进 git。

> 实现：`scripts/crawl-*.js`、`scripts/crawler/sources/*.js`、`scripts/crawler/transformers/*.js`、`scripts/crawler/writer.js` / `diff.js` / `report.js`。

### 运维与可观测性

- 健康探针：`GET /health/live`（存活）、`GET /health/ready`（1.5 秒超时的真实数据库探测，失败 503）、`GET /health`（`/ready` 的别名）。
- Prometheus 指标：`GET /metrics`（需管理员），含默认运行时指标 + API 请求数与延迟直方图。
- 管理员审计日志：登录 / 退出 / 各实体 CRUD 都记录事件。
- 统一错误处理与响应结构（`{ code, message, data, requestId }`），带 `x-request-id` 贯穿。
- 优雅关闭：`SIGINT` / `SIGTERM` 停止接新连接 → 排空 storage 同步队列 → 关闭数据库连接，10 秒兜底强退。

> 实现：`server/index.js`、`src/utils/logger.js`、`src/utils/errorHandler.js`、`src/utils/adminAudit.js`。

---

## 技术栈

| 层 | 选型 | 版本 |
| --- | --- | --- |
| 前端框架 | React + React Router | `react` ^19.3.0 / `react-router-dom` ^7.8.0 |
| 构建 | Vite | ^7.3.6（`@vitejs/plugin-react` ^4.7.0） |
| Markdown 渲染 | react-markdown + remark-gfm / remark-math + rehype-katex | ^10.1.0 / ^4.0.1 / ^6.0.0 / ^7.0.1 |
| 后端 | Express | ^5.1.0 |
| 数据库 | MySQL + Sequelize | `mysql2` ^3.14.3 / `sequelize` ^6.37.7 |
| 安全中间件 | helmet / cors / express-rate-limit / compression | ^7.0.0 / ^2.8.5 / ^7.4.0 / ^1.7.4 |
| 监控 | prom-client | ^15.1.3 |
| 环境变量 | dotenv / dotenv-safe | ^16.4.5 / ^8.2.0 |
| 桌面端 | Electron + electron-builder | 42.2.0 / ^26.15.3 |
| 移动端 | Expo + React Native + expo-router | ~57.0.28 / 0.86.3 / ~57.0.26 |
| 移动端存储 | expo-sqlite / @react-native-async-storage | ~57.0.4 / 2.2.0 |
| 后端测试 | Jest + supertest | ^29.7.0 / ^6.3.4 |
| 前端测试 | Vitest + Testing Library + jsdom | ^4.1.11 / ^16.0.0 / ^27.2.0 |
| 图像处理 | sharp（仅开发期，转 WebP 用） | ^0.35.5 |

**运行环境**：Node.js `^20.19.0 || >=22.12.0`（见 `package.json` 的 `engines`），MySQL 5.7+ 或 8.x（无 SQLite 回退）。

---

## 快速开始

### 0. 前置条件

- Node.js 20.19+ 或 22.12+
- MySQL 5.7+ / 8.x，且 root（或你指定的账号）能建库建表
- npm 9+

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env     # Windows: 直接把 .env.example 另存为 .env
```

至少填这几项：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=hengbeger

ADMIN_PASSWORD=change_this_admin_password
AUTH_SECRET=change_this_auth_secret

PORT=3001
NODE_ENV=development
INIT_DB=false
DB_AUTO_ALTER=false
CORS_ORIGINS=http://localhost:5173
VITE_API_BASE_URL=/api
```

**Windows 用户注意**：`.env` 里的 `DB_PASSWORD` 如果包含 `#`、空格或特殊字符，手写容易出错，可以用仓库自带的交互式助手写入（该脚本会读取已有的 `.env` 并替换 `DB_PASSWORD=` 那一行）：

```bash
npm run setup-password
```

忘了 MySQL 密码时，Windows 上还有 `reset-mysql-password.bat`（需管理员权限，走 MySQL 安全模式改密）。

### 3. 初始化数据库

```bash
npm run init-db
```

这是**安全模式**：只建缺失的表、不删已有数据，并按需播 ZZZ / HSR 种子数据（种子标记写在 `app_meta` 表的 `seeded:zzz` / `seeded:hsr` 键上）。

需要清库重建时：

```bash
npm run init-db -- --force     # 仅在 NODE_ENV=development 且 INIT_DB=true 时才会真的重建
```

如果本地是旧库、表结构与当前模型有漂移，可以临时开 `DB_AUTO_ALTER=true` 让 Sequelize 改结构（**仅限本地开发**，生产不要开）：

```bash
DB_AUTO_ALTER=true npm run server
```

### 4. 启动

```bash
npm start
```

`npm start` 会用 `concurrently` 同时拉起后端（`http://localhost:3001`）与 Vite 前端（`http://localhost:5173`）。也可以分开跑：

```bash
npm run server    # 只起后端
npm run dev       # 只起前端
```

或者用一键启动器（会检查 Node、依赖、`.env`、MySQL 服务状态，并在缺 `.env` 时自动从 `.env.example` 复制一份）：

```bash
npm run launch              # 前后端一起
npm run launch:frontend     # 只前端
npm run launch:backend      # 只后端
```

Windows 也可以双击 `start.bat`，Linux/macOS 用 `bash start.sh`。

### 5. 验证

```bash
curl http://localhost:3001/health/live    # 存活
curl http://localhost:3001/health/ready   # 就绪（数据库通则 200）
```

浏览器打开 <http://localhost:5173/> 就是开放图录首页。

> 端口被占用时：`npm run dev -- --port 5174`；后端端口改 `.env` 里的 `PORT`。

---

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `server/` | Express 应用入口 `index.js`、管理员鉴权与校验中间件、catalog 路由、开放图鉴的纯函数实现、后台测试 |
| `server/__tests__/` | 后端 Jest 测试与抓取器固定样本（fixtures） |
| `src/` | React 前端：`App.jsx` 路由、开放图录组件、旧 Wiki 与管理面板、`demo/` 设计稿组件库 |
| `src/db/` | Sequelize 模型（`models/`）、初始化与建表（`initializedata.js` / `ensureSchema.js` / `indexes.js`）、storage 快照、备份与恢复 |
| `src/api/` | 前端 API 客户端、分页封装、管理员会话 |
| `src/utils/` | 日志、错误处理、安全校验、串行任务队列、审计 |
| `data/` | **权威资料层**：按世界与分类组织的 Markdown + front-matter（图片在 `data/images/`，不进 git） |
| `scripts/` | 采集器与公共库（`crawler/`）、catalog 编译器（`catalog/`）、云端导入导出（`cloud/`）、验证脚本 |
| `reports/` | 采集器产出的差异报告（`.md` + `.json`），同步门禁的依据 |
| `docs/` | 全部项目文档：索引、架构、审计、UI 设计、交接记录、事故记录、设计与实施计划 |
| `desktop/` | Electron 桌面客户端（主进程 + 渲染层 + NSIS 安装脚本） |
| `mobile/` | Expo / React Native 安卓客户端（`app/` 路由、`src/` 逻辑与组件、`scripts/` 出包脚本） |
| `deploy/` | Docker Compose 云端栈与本机预演栈、Nginx 配置、证书与密钥脚本 |
| `public/` | 静态素材（首页插画 `demo-art/`、字体、`demo-data/`） |
| `dist/` | `npm run build` 的产物，由后端静态托管 |
| `init-db.js` / `launcher.js` / `security-check.js` / `setup-mysql-password.js` | 根级运维脚本 |

---

## 常用脚本

全部脚本都来自 `package.json`，按场景分组如下。

### 前端开发

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（默认 `5173`，`/api` 代理到 `3001`） |
| `npm run build` | 生产构建到 `dist/`（强制 `NODE_ENV=production`） |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | ESLint 全仓检查 |
| `npm run open-index:css` | 把 `src/demo/` 的设计稿 CSS 机械变换成作用域化副本，供正式站开放图录使用 |

### 后端服务

| 命令 | 作用 |
| --- | --- |
| `npm run server` | 只启动 Express 后端（`3001`），同时静态托管 `dist/` |
| `npm start` | 并发启动后端 + 前端 |
| `npm run launch` / `launch:frontend` / `launch:backend` | 带环境检查的一键启动器 |

### 数据库与存储

| 命令 | 作用 |
| --- | --- |
| `npm run init-db` | 安全模式初始化数据库（建表 + 播种子） |
| `npm run init-db -- --force` | 开发环境下清库重建并重播种子 |
| `npm run setup-password` | 交互式把 MySQL 密码写进 `.env` |
| `npm run migrate:columns` | 补齐历史表结构缺失的列 |
| `npm run backup-database` | 导出一份数据库备份 |
| `npm run restore-storage -- --type agents --file <备份文件>` | 恢复 storage 快照（**不回滚 MySQL 记录**） |
| `npm run cleanup-storage-backups -- --dry-run` | 清理 storage 备份；默认按前缀分组每组保留最近 10 份 |

### 测试

| 命令 | 作用 |
| --- | --- |
| `npm test` | 后端 + 前端测试串跑 |
| `npm run test:backend` / `test:backend:coverage` | 后端 Jest 测试 / 带覆盖率 |
| `npm run test:frontend` / `test:frontend:coverage` | 前端 Vitest 测试 / 带覆盖率 |
| `npm run test:coverage` | 前后端覆盖率一起跑 |

### 数据采集

| 命令 | 作用 |
| --- | --- |
| `npm run crawl:mihoyo -- --target <目标> [--write]` | 米游社官方 API：ZZZ 代理人/音擎/驱动盘/邦布/敌人、HSR 角色/光锥/遗器/敌人、卡池 |
| `npm run crawl:bwiki -- --check <目标:名字>` | B 站 wiki 字段抽查比对；`--gacha` 拉调频期表 |
| `npm run crawl-gamekee -- --check <目标:名字>` | gamekee 字段抽查比对；`--tree` 打印栏目树 |
| `npm run crawl-tools -- --check <目标:名字>` | zzz.gg / SRS / appfeng 辅助核对源；`--gacha` 拉跃迁历史 |
| `npm run crawl:nanoka -- --check <目标:选择器>` | nanoka 镜像站：货币战争五类、ZZZ 怪物 / Boss、HSR / ZZZ 技能表；`--versions` 看上游版本 |
| `npm run crawl:images -- --check <类型:名字>` | 下载图片到 `data/images/` 并回写 front-matter |
| `npm run sync -- --list` / `--report <id>` | 查看 / 审阅采集差异报告（门禁校验） |

### 云同步与部署

| 命令 | 作用 |
| --- | --- |
| `npm run cloud:secrets` | 生成 `deploy/.env`（密钥现场随机，不回显） |
| `npm run cloud:cert` | 生成自签证书到 `deploy/ssl/` 并打印 SHA256 指纹 |
| `npm run cloud:preview:up` / `:down` / `:logs` / `:verify` | 本机预演栈（`https://127.0.0.1:8444`）起停、日志与验收 |
| `npm run cloud:export` / `:count` / `:verify` | 把本地库只读导出成上云数据包 |
| `npm run cloud:images` / `:verify` | 把 base64 图片解成两档 WebP |
| `npm run cloud:import` / `:check` | 把数据包导入目标库（upsert，默认不删） |
| `npm run cloud:preview:import` / `:preview:import:check` | 在预演栈的 app 容器里导入 / 体检 |
| `npm run cloud:push` / `:check` | 一条命令把本机数据推送到云端（打包 → scp → 远端导入 → 复核） |
| `npm run cloud:test` | 云端脚本自身的单测 |

### 桌面端 / 移动端

| 命令 | 作用 |
| --- | --- |
| `npm run desktop` | 启动 Electron 客户端 |
| `npm run desktop:smoke` | 无人值守自检：加载 → 首屏 → 截图 → 打印 JSON |
| `npm run desktop:dist` | 打包 Windows 安装版（NSIS）+ 便携版，产物在 `desktop/out/` |
| `npm run mobile:start` | 只起 Metro |
| `npm run mobile:android` | `expo run:android`（首次会自动 prebuild 出 `android/` 工程） |
| `npm run mobile:prebuild` / `mobile:patch` | 生成 Android 工程 / 幂等地打上图标、证书固定、签名补丁 |
| `npm run mobile:pins` | 生成证书固定文件（`mobile/native/`） |
| `npm run mobile:icons` | 用 `sharp` 生成 `mobile/assets/` 下的图标与启动图 |
| `npm run mobile:keystore` | 生成 release 签名 keystore（已存在则拒绝覆盖） |
| `npm run mobile:release` | 打补丁 → `assembleRelease` → 验签 → 复制到 `mobile/dist/` |
| `npm run mobile:test` / `mobile:typecheck` | 移动端单测 / `tsc --noEmit` |

### 验收与安全

| 命令 | 作用 |
| --- | --- |
| `npm run verify:api` | 对运行中的服务跑开放图鉴 API 冒烟检查 |
| `npm run verify:shots` | 用 Chrome DevTools Protocol 截图 + 控制台/网络校验（无需 Playwright） |
| `npm run demo:data` | 生成 `public/demo-data/` 演示数据 |
| `npm run security-check` | 检查环境变量、密码强度、生产配置与文件权限 |
| `npm run generate-password` | 生成一个安全密码 |
| `npm run audit` / `audit:prod` | `npm audit`，生产依赖审计为 `--omit=dev` |

---

## 配置与环境变量

### 根目录 `.env`（依据 `.env.example`）

| 变量 | 默认 / 示例 | 说明 |
| --- | --- | --- |
| `DB_HOST` | `localhost` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | 数据库账号 |
| `DB_PASSWORD` | — | **必填**。无 SQLite 回退，缺它后端拒绝启动 |
| `DB_NAME` | `hengbeger` | 数据库名 |
| `PORT` | `3001` | 后端监听端口 |
| `NODE_ENV` | `development` | 生产务必设为 `production` |
| `INIT_DB` | `false` | 仅开发环境且为 `true` 时允许破坏性初始化 |
| `DB_AUTO_ALTER` | `false` | 为 `true` 时 Sequelize 用 `alter: true` 修表结构；**仅限本地开发** |
| `ADMIN_PASSWORD` | — | **必填**，管理员登录密码 |
| `AUTH_SECRET` | — | **必填**，会话签名密钥 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `SECURITY_SILENCE` | `false` | 仅开发环境可设 `true` 静音弱密码提示 |
| `CORS_ORIGINS` | `http://localhost:5173` | 逗号分隔的前端源白名单；生产环境留空表示不放开跨域写操作 |
| `VITE_API_BASE_URL` | `/api` | 前端调用的 API 前缀 |
| `TRUST_PROXY_HOPS` | 空 | 位于反向代理后时必填（单层 Nginx = `1`）；留空表示直连。填错会让限流退化成共享一个桶 |

### 云端额外变量（`deploy/.env.example`，由 `npm run cloud:secrets` 生成）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DATA_ROOT` | `./data` | 云端 MySQL 数据目录（云端为 `/srv/hengbeger/data`） |
| `HTTPS_PORT` | `8443` | Nginx 对外 HTTPS 端口（大陆未备案，用高位端口） |
| `MYSQL_ROOT_PASSWORD` | — | MySQL root 密码 |
| `MYSQL_BUFFER_POOL` | `256M` | InnoDB buffer pool，4G 内存可上调到 1G |
| `IMAGE_MODE` | `file` | `file` = 图片由 Nginx 从磁盘直出；`db` = 图片存 MySQL 走应用出图接口（仅本机 `npm run server` 用） |
| `IMAGES_ROOT` | `/srv/images` | 图片根目录（容器内） |
| `APP_TAG` | `latest` | 镜像标签，用于回滚 |
| `PREVIEW_DATA_ROOT` / `PREVIEW_HTTPS_PORT` / `PREVIEW_MYSQL_PORT` | `./data-preview` / `8444` / `3307` | 仅本机预演栈使用 |

---

## 测试

| 套件 | 命令 | 框架 | 实测规模（2026-11-06） |
| --- | --- | --- | --- |
| 后端 | `npm run test:backend` | Jest（`server/__tests__/**/*.js`，node 环境）+ supertest | 26 个 suite / **227** 个用例全通过 |
| 前端 | `npm run test:frontend` | Vitest（jsdom）+ Testing Library | 25 个文件 / **135** 个用例全通过 |
| 移动端 | `npm run mobile:test` | `node --test` | 133 个用例，132 通过 / 1 跳过（live 用例需真实服务器） |
| 桌面端 | `npm --prefix desktop test` | `node --test` | 14 个用例全通过 |
| 云端脚本 | `npm run cloud:test` | `node --test` | 18 个用例，17 通过 / 1 跳过 |

后端测试覆盖：健康探针、指标、鉴权（Cookie 与 Bearer 双路）、CRUD 路由、公开列表查询与分页、参数校验、统一错误响应、管理维护路由、开放图鉴纯函数，以及 6 个采集器 + 差异比对 + 报告门禁 + 同步控制器的固定样本回放（样本放在 `server/__tests__/fixtures/`，不依赖网络）。

覆盖率门槛写在配置里：后端 statements/branches/functions/lines ≥ 25/15/25/25，前端 ≥ 25/20/25/25。CI（`.github/workflows/ci.yml`）在 push / PR 时执行 lint → 前后端覆盖率测试 → 生产构建 → 生产依赖审计。

---

## 数据采集与同步

这是本项目最有特色的部分，完整链路如下。

### 1. 资料层：`data/`

`data/` 下按世界与分类组织，每个条目一个 Markdown 文件，front-matter 记录来源与抓取时间，正文是数值表格。共 19 类：

```
data/
├── zzz/       agents / sound_engines / drive_disks / bangboo / enemies / gacha / formula
├── hsr/       characters / light_cones / relics / enemies / gacha / formula
├── currency/  season1/ 与 season2/ 各含 roles / traits / items / strategies / environments
└── images/    图片（不进 git，由 crawl:images 下载）
```

### 2. 采集：只写 `data/`，默认干跑

每个采集器都是「查 → 比对 → 出报告 → 显式 `--write` 才落盘」的形态：

```bash
# 定点抓取并与现有资料比对（默认不落盘）
npm run crawl:mihoyo -- --target zzz-agent:安比,hsr-character:48

# 落盘并生成差异报告
npm run crawl:mihoyo -- --target zzz-agent,hsr-character,gacha --write
```

| 脚本 | 数据源 | 抓什么 |
| --- | --- | --- |
| `crawl:mihoyo` | 米游社官方 API（`act-api-takumi-static.mihoyo.com`） | ZZZ 代理人 / 音擎 / 驱动盘 / 邦布 / 敌人，HSR 角色 / 光锥 / 遗器 / 敌人，两作卡池 |
| `crawl:bwiki` | B 站 wiki（`wiki.biligame.com`） | 代理人 / 角色字段抽查比对；ZZZ 调频期表 |
| `crawl:gamekee` | gamekee（`www.gamekee.com`） | 代理人 / 音擎字段抽查比对；栏目树与攻略帖流 |
| `crawl:tools` | zzz.gg、starrailstation.com、sr.appfeng.com、wiki.bittopup.com | 代理人 / 角色 / 敌人字段抽查比对；HSR 跃迁历史 |
| `crawl:nanoka` | zzz.nanoka.cc、hsr.nanoka.cc | 货币战争五类、ZZZ 怪物与 Boss、HSR / ZZZ 技能表、两边数据版本 |
| `crawl:images` | 米游社列表接口 + B 站 wiki | 图片本体下载与 front-matter 回写 |

### 3. 审阅：差异报告 + 门禁

采集器落盘后会在 `reports/` 下生成一份报告（`<日期-时间>.md` 与同名 `.json`），记录新增 / 修改 / 删除清单、异常项与当时的 `data/` 树哈希。

```bash
npm run sync -- --list                  # 列出所有报告
npm run sync -- --report 20261008-1649  # 审阅：打印变更清单 + 校验树哈希
```

`scripts/sync.js` 会做两道门禁（`scripts/crawler/report.js` 的 `assertSyncAllowed`）：报告必须已被人工确认；报告记录的树哈希必须与当前 `data/` 一致，否则拒绝同步。

> **注意**：`npm run sync -- --report <id> --apply` 目前会直接报错退出（`数据库同步尚未实现（T3.2）`）。真正把目录写进 MySQL 的路径是下面的 `npm run cloud:import`。

### 4. 编译与导入

```bash
# 只读编译校验：本地跑一次即可看到当前目录的条目数与树哈希
node -e "import('./scripts/catalog/data.js').then(m=>{const c=m.compileCatalog(process.cwd());console.log(c.entries.length, c.treeHash)})"
```

当前 `data/` 编译出 **2613** 条目录条目，覆盖 **23** 个分类（绝区零 7 类、星铁 6 类、货币战争两赛季各 5 类）。图片单独走文件通道，不进目录条目。

导入 MySQL 使用云端导入脚本（upsert 语义，默认不删任何东西，删要显式 `--prune --yes`）：

```bash
npm run cloud:export                  # 本地库只读导出成数据包
npm run cloud:import -- --check       # 只体检：包完整性 + 与目标库的差异
npm run cloud:import                   # 真导入
```

导入会做逐键回查校验：包里每个 `entry_key` 都必须存在且 `content_hash` 一致，任何一条对不上就 exit 1。

> 上线实测口径：云端 `/api/catalog/index` 为 2675 条 / 23 个分组、1710 份去重图片（见 `deploy/README.md`）。本地 `data/` 编译出的 2613 条是当前工作树的实时值，两者随采集进度变化。

---

## 桌面端 / 移动端

### 桌面端（Electron）

`desktop/` 是一个薄壳：把已经验收过的云端站点装进原生窗口，浏览逻辑一行不重写，用的还是浏览器里那套界面与接口。

- 主进程 `main.js`：窗口、菜单、**自签证书指纹确认流程**（首次连接某主机时弹出证书 SHA-256 指纹，与服务器证书核对一致后点击信任，按 `host → 指纹` 记进 `settings.json`，指纹变了会重新询问）、`--smoke` 自检。
- 预加载 `preload.js`：contextBridge 暴露 `window.hengberger`（state / saveServer / openExternal / quit）。
- `src/settings.js`：服务器地址规范化与配置读写（纯逻辑，可单测）。
- 打包：`electron-builder --win --x64`，产物在 `desktop/out/`（NSIS 安装版 + 便携版），使用自定义 `build/installer.nsi`。

```bash
npm run desktop        # 启动
npm run desktop:smoke  # 无人值守自检，退出码 0 通过 / 1 失败 / 2 超时
npm run desktop:dist   # 出安装包
```

### 移动端（Expo / React Native，仅 Android）

`mobile/` 是独立的 Expo 工程（`expo-router`），只读连接云端图录 API。

- 页面：`app/index.tsx`（首页）、`app/list.tsx`（图鉴：搜索 → 当前条件 → 一个筛选区 → 结果）、`app/entry/[key].tsx`（详情三层结构）、`app/library.tsx`（收藏与历史）、`app/settings.tsx`（服务器地址与连通性测试）。
- 离线：索引进 SQLite 缓存（6 小时过期，先出缓存再后台刷新），详情只缓存看过的，收藏与历史纯本地。
- **证书固定**：把自签证书本体放进 `res/raw/`，用 `network_security_config.xml` 只信任这几张证书。`npm run mobile:pins` 生成信任锚，`npm run mobile:patch` 打进工程（幂等）。证书一旦重签，必须重跑这两个命令，否则 App 连不上。
- 出包：`npm run mobile:keystore`（首次生成签名 keystore，**务必自行备份**）→ `npm run mobile:release`（打补丁 → `assembleRelease` → `apksigner verify` 验签 → 复制到 `mobile/dist/`）。
- release 包内嵌 JS bundle，不需要 Metro；安装前需先卸载 debug 包（签名不同，不能覆盖安装）。

```bash
npm --prefix mobile install
npm run mobile:android    # 装到模拟器 / 真机
npm run mobile:test       # 移动端单测
npm run mobile:typecheck  # tsc --noEmit
```

---

## 部署

### 生产（单机，Node 直出）

```bash
npm ci
cp .env.example .env     # 填真实配置，确认 NODE_ENV=production
npm run build            # 生产构建到 dist/
npm run server           # 后端同时托管 dist 与 /api
```

要点：

- `npm run build` 由脚本强制 `NODE_ENV=production`。
- 探针别用错：`/health/live` 恒 200，`/health/ready`（及别名 `/health`）会真实探测数据库，抖动时返回 503 —— 拿它当存活探针会让编排器反复重启。
- 生产请保持 `DB_AUTO_ALTER=false`、`INIT_DB=false`、`SECURITY_SILENCE` 非 `true`。
- 位于 Nginx 之后时务必设 `TRUST_PROXY_HOPS=1`（每多一层反代加 1），否则限流与登录防护会退化成共享一个桶。

### 云端（Docker Compose：MySQL + Node + Nginx）

`deploy/` 提供三容器栈（项目名 `hengbeger-cloud`）：MySQL 8.0 只在内部网络可见，Node 应用提供 `/api`，Nginx 终止 TLS 并按白名单放行 `/api/catalog/`、`/img/`、`/health*` 与 SPA 静态资源，其余 `/api/*` 与 `/metrics` 一律 403。

```bash
npm run cloud:secrets                  # 生成 deploy/.env
npm run cloud:cert                     # 生成自签证书（云端记得带 --ip <公网IP>）
docker compose -f deploy/docker-compose.yml up -d --build
```

本机预演（叠加覆盖层，端口 8444，数据与云端天然隔离）：

```bash
npm run cloud:preview:up       # 构建 + 起栈
npm run cloud:preview:verify   # 逐条打 PASS/FAIL
npm run cloud:preview:logs
npm run cloud:preview:down
```

数据上云：

```bash
npm run cloud:export && npm run cloud:images
node scripts/cloud/push-data.mjs --host <公网IP>            # 打包 → scp → 远端导入 → 复核
node scripts/cloud/push-data.mjs --host <公网IP> --dry-run  # 只打印将执行的命令
```

> PowerShell 5.1 会吞掉 `npm run x -- --flag` 里的裸 `--`，要传自定义标志请写 `npm run cloud:export "--" "--verify"`，或直接 `node scripts/cloud/export-data.mjs --verify`。另：不要用 `--dry-run`，那是 npm 的原生标志，本仓库对应参数是 `--check` / `--count-only`。

---

## 相关文档

以下链接均指向仓库内真实存在的文件。

**入门与运维**

- [文档索引](./docs/README.md)
- [快速开始](./docs/04-quick-start.md)
- [部署指南](./docs/06-deployment.md)
- [管理员工作流](./docs/11-admin-workflow.md)
- [云端托管与本机预演](./deploy/README.md)
- [安全配置指南](./SECURITY.md)
- [开发规范文档](./开发规范文档.md)

**数据与资料管线**

- [资料层说明](./data/README.md)
- [资料同步说明（T2.9g 期）](./docs/22-catalog-sync.md)
- [数据源摸底（2026-10-06）](./docs/17-datasource-recon-2026-10-06.md)
- [爬取覆盖（2026-10-08）](./docs/20-crawl-coverage-2026-10-08.md)
- [资料补齐（2026-10-08）](./docs/21-data-completion-2026-10-08.md)
- [数据管线设计](./docs/plans/2026-10-06-data-pipeline-design.md) / [实施计划](./docs/plans/2026-10-06-data-pipeline-implementation.md)
- [云端 + 安卓客户端设计（2026-10-14）](./docs/plans/2026-10-14-cloud-android-design.md)

**界面与设计**

- [开放图录 · 方案定稿与开发交接（2026-10-13）](./docs/32-open-index-design-handoff-2026-10-13.md)
- [UI 需求清单（2026-10-08）](./docs/24-ui-requirements-2026-10-08.md)
- [八套可交互 UI Demo · 第三版（2026-10-11）](./docs/26-ui-demo-v3-2026-10-11.md)

**客户端**

- [桌面端说明](./desktop/README.md)
- [安卓端说明](./mobile/README.md)

**审计与事故**

- [项目审查（2026-10-04）](./docs/15-project-audit-2026-10-04.md)
- [完整复审（2026-10-06）](./docs/16-full-re-audit-2026-10-06.md)
- [仓库通篇遍历 · 清理结论（2026-10-17）](./docs/33-repo-sweep-2026-10-17.md)
- [线上 /demo-art 破图事故（2026-10-16）](./docs/incidents/2026-10-16-demo-art-404.md)

---

## License

仓库的 `package.json` **没有声明 `license` 字段**，因此本项目当前未指定开源许可证（`package.json` 中同时标记了 `"private": true`）。资料内容另有出处标注（见 `data/` 各文件的 front-matter `source` / `source_url`），二次分发前请自行确认各来源站点的授权条款。
