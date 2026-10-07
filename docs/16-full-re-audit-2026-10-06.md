# 16. 全量复审报告（2026-10-06）

> **方法**：两步复审。第一步复核 `15-project-audit-2026-10-04.md` 已修 84 项（结论见 docs/15 追加章节「复核 2026-10-06」）；第二步 4 路并行只读全量遍历（安全、后端、前端、工程配置），逐文件读码 + 本机运行实例只读 GET 探测 + MySQL 只读查询 + git 只读命令，**只报基线 84 项之外的新问题**。
> **范围**：server/ 903 行 + src/ 约 9.2k 行 + scripts/init-db/launcher + 配置/CI + docs 死链扫描。
> **总览**：新发现 **51 条**（P1×7、P2×16、P3×28）+ 已修项回归 1 条（P2）。本轮无新 P0。
> **状态**：P1 全部修复（见各条状态标记）；P2/P3 待排期。

---

## 一、新 P1（7 条）

### SEC-03 [P1] 反代部署下 `trust proxy` 恒 false → 全站共享限流桶，外部访客可打崩管理员登录

- **位置**：`server/index.js:146,153,155-162`；`.env.example`（缺 `TRUST_PROXY_HOPS`）；`docs/06-deployment.md:44-54`（Nginx 段无说明）
- **问题**：`TRUST_PROXY_HOPS` 未设置时 `trust proxy = false`，Express 一律取 socket 对端 IP（= Nginx 的 IP）→ 全局 200/min 限流与 `loginRateLimiter`（10 次/15min/桶）**全站共享同一个桶**。
- **证据**：反向实测——`GET /health` 带 `X-Forwarded-For: 203.0.113.77` → 日志 `ip:"::1"`、伪造 IP 0 命中（P1-1 伪造绕过确已修复），但同一条逻辑意味着反代后所有真实客户端 IP 必然被压成同一个代理 IP。触发链（外部可触发、无需凭据）：按 docs/06 部署且未设 `TRUST_PROXY_HOPS` → 任意外部访客连续 10 次错误密码 → 全站管理员 15 分钟内登录全部 429。
- **与基线的区别**：P1-1 修的是「伪造 XFF → 信任过多」，本条是同一修复的反向失败模式（信任过少）+ env/文档缺口；基线 P1-1 状态行、P3-17、P3-18 均未涉及此键。
- **修复**：① `.env.example` 补 `TRUST_PROXY_HOPS=`；② docs/06 Nginx 段加显式说明（单层 Nginx = `1`，未在反代后必须留空）；③ 启动时若 `trust proxy` 为 false 且请求带 XFF，`logger.warn` 一次。④（原建议「登录桶 key 叠加 UA」**评估后不采纳**：UA 可被攻击者随意轮换，会把按 IP 的爆破防护降级为按 UA，正确解法是 ①②③ 配好 TRUST_PROXY_HOPS。）
- **状态**：- [x] 已修（①②③；本地 `.env` 已同步补键）

### BE-01 [P1] 音擎/邦布 `image` 列 varchar(255) 与「base64 ≤2MB」校验冲突 → 保存必然 500

- **位置**：`src/db/models/soundengine.js:16-19`、`src/db/models/bumbo.js:16-19`；校验链 `server/middleware/validation.cjs:74-92,194,219`；前端 `src/AdminPanel.jsx:731-738`（4 个 tab 通用 dropzone）
- **问题**：`information_schema` 实测 `sound_engines.image varchar(255)`、`bumbos.image varchar(255)`（`agents/drive_disks/hsr_*` 均为 longtext）；`SELECT @@sql_mode` 含 `STRICT_TRANS_TABLES`。校验放行 base64 至 2MB，落库 `resolveImage`（`api.js:103-105`）原样直通 → 任意真实图片（base64 必超 255 字符）→ MySQL 1406 → 500「数据库操作失败」。
- **修复**：两列改 `LONGTEXT` 对齐其余表（模型 + 存量库 ALTER）。
- **状态**：- [x] 已修（模型改 LONGTEXT + 幂等补列迁移 + 本地库 ALTER）

### BE-02 [P1] `drive_disks` id=10 生产库残留 E2E 测试数据，经公开接口对外暴露

- **位置**：`src/db/storage/drive_disks.json`（root/web 同步）、公开接口 `GET /api/drive-disks/list`
- **证据**：`SELECT id,name,description FROM drive_disks` → `10 | __P17_DISK_TEST__ | disk`；`GET /api/drive-disks/list?limit=100` → `total:10` 含该条（image 为 `data:image/png;base64,dGVzdA==`）。其余 6 表 + factions `%test%` 计数为 0。说明历史 E2E 直接写了本机库并被同步进 JSON。
- **修复**：删该行 + 重跑同步；测试改用 `NODE_ENV=test` 隔离或 afterEach 清理。
- **状态**：- [x] 已修（DB 行已删、复测 total:9 无残留；JSON 重同步随服务重启的启动 sync；测试隔离策略待 P2 批次）

### FE-01 [P1] 字典接口单侧失败的降级空结果被永久缓存且无可见错误 → 管理端必填下拉全空、本会话录入 100% 不可用

- **位置**：`src/DataContext.jsx:111-140,178-179,209-216`
- **问题**：`fetchBaseData` 用 `Promise.allSettled`，任一侧失败只 `console.warn` 并返回全空数组（不 `setError`）；空结果既写 `baseDataRef.current`（`:215`）也写 state（`:178-179`）。路由 effect 只在 `!baseDataRef.current` 时重取（`:209`），空对象为 truthy → 整个会话不再重试；`loadAllData` 还会用单侧失败结果覆盖原本好的缓存。
- **证据**：`AdminPanel.jsx:264-266` + `:415-438`（faction/role/rarity 三个 required select 只剩占位项）+ `:389`（`reportValidity()` 拦截）→ 点保存只拿到浏览器原生提示，页面无横幅；属性 select 硬编码 5 项掩盖故障。HSR 侧同理（`HsrAdminPanel.jsx:208-214,393-487`）；公共筛选 chip 一并变空（`ZZZWiki.jsx:169-173`、`HsrWiki.jsx` 多处）。
- **修复**：单侧失败设 `degraded` 标志并渲染「部分数据源不可用 + 重试」横幅；`baseDataRef` 只缓存双侧成功结果（单侧失败保持 null，下次导航自动重试）；`loadAllData` 覆盖缓存前同样校验完整性。
- **状态**：- [x] 已修（只缓存双侧成功 + degraded 横幅 + 重试入口）

### ENG-01 [P1] `init-db --force` 被 `.env` 的 `INIT_DB=false` 静默吞掉，仍打印「已重建表结构并重播种子」假成功

- **位置**：`init-db.js:34-36,48-50`；`src/db/initializedata.js:159-164`；`package.json:18`
- **证据**：`init-db.js:9` 先 `dotenv.config()`；`:36` `process.env.INIT_DB = process.env.INIT_DB || 'true'`（`.env` 里 `'false'` 是 truthy，`||` 不覆盖）；破坏闸门要求 `INIT_DB === 'true'` → `{force:true}` 永不执行；`:48-50` 只看 `forceRequested` 就打印成功。暗雷：`package.json` 的 `init-db` 未带 `NODE_ENV=development`，shell 无该变量时 `destructive` 同样 false。docs/06:15 是唯一清库重建指引 → 运维误判已清库。
- **修复**：`forceRequested` 时显式覆盖 `process.env.INIT_DB='true'`（非 `||`）并保证 `NODE_ENV` 有值；打印文案改为读 `destructive` 实际结果；未生效时明示原因。
- **状态**：- [x] 已修

### ENG-02 [P1] `package.json` 里的整段 vitest 配置（含 coverage 阈值）不被 Vitest 读取 → CI 前端 coverage 门禁空转

- **位置**：`package.json:83-100`；`.github/workflows/ci.yml:24-25`；`server/__tests__/test-glob-coverage.test.js:28`
- **证据**：vitest `CONFIG_NAMES = ["vitest.config","vite.config"]`，不含 package.json；仓库只有 `vite.config.js` 且无 `test` 段、无 `vitest.config.*`。决定性实测：coverage 产物含 `coverage/src/assets/star.jpg.html`、`src/ZZZWiki.css.html` —— 若 `coverage.include: ["src/**/*.{js,jsx}"]` 生效必被过滤。当前基线 54.36/46.24/49.15/53.8 恰好过线，将来跌破**不会让 CI 变红**。guard 测试断言的是死字段 `pkg.vitest.include`。
- **修复**：新建 `vitest.config.js`（`mergeConfig(viteConfig, {test:{…}})` 保留 React 插件与 dev proxy），搬入 include/environment/coverage；删 package.json 的 `vitest` 段；guard 测试改断言真实配置文件。
- **实测**：配置生效后真实基线 = **25.52/20.93/26.34/25.26**（全 src js/jsx 为分母；旧「54% 基线」是默认 include 的错误产物）→ 阈值改设 **25/20/25/25** 防倒退，docs/06 的 50/40/45/50 声明同步订正（见 docs/15 复核章节）。
- **状态**：- [x] 已修（vitest.config.js + guard 测试改断言 + 阈值按实测基线订正）

### ENG-03 [P1] docs/06 把 `GET /health` 写成「存活探针」，它实际是就绪探针（DB 不可用即 503）

- **位置**：`docs/06-deployment.md:34`；对照 `server/index.js:316-335`
- **证据**：`sendReadiness` = `dbInitialized && probeDatabase()` → ready?200:503；`/health/ready` 与 `/health` 都挂它；真正的存活探针是 `/health/live`（`:330-332`）。README:21-22/149-150 列的都是 live+ready，只有部署文档写反。按此文档配 liveness 会在 DB 抖动时被编排器反复重启。
- **修复**：改写为「存活探针 `GET /health/live`；就绪探针 `GET /health/ready`（`/health` 为别名，DB 探测失败 503）」。
- **状态**：- [x] 已修

---

## 二、已修项回归（1 条）

### FIXED-REGRESSION-01 [P2] P2-19 的「序号防旧快照覆盖」在路由 prefetch 路径缺失

- **位置**：`src/DataContext.jsx:219-226`（对照 `:164-180`）
- **问题**：P2-19 序号丢弃只实现在 `loadAllData`；路由 effect 的主数据应用走 `fetchMainData()` → `setData(mainData)`，只有 `cancelled` 标志、无序号校验。`shouldPrefetchMainData`（`:75-80`）覆盖 admin/详情/data-test 路由，进入即发 `/dual-storage/web/data`。时序：切导航触发慢请求 R1 → 管理员保存 → `loadAllData`（序号 N）先落地新数据 → R1 后落地 → 用改动前快照覆盖，重现「刚保存的条目不见了」。
- **修复**：路由 effect 发起前 `refreshSeqRef.current += 1` 取号、落地前比对（或 `loadForRoute` 复用 `loadAllData` 取号逻辑）。
- **状态**：- [x] 已修

---

## 三、新 P2（16 条）

### 安全域

- **SEC-01 [P2]** `server/index.js:821,829` — `PUT /api/storage/:type` 与 `PUT /api/storage/batch/update` **整体绕过字段级校验白名单**。16 条 CRUD 写路由全挂 `validateBody(validateXxxData)`，这两条没有；替代的 `validateItems`（`dataSync.js:90-115`）只做 truthy 存在性检查。经此入口失效：`validateImage`（2MB/白名单）、description ≤500、isEnum 稀有度/属性/部位、sanitizeHtml。落库侧全程无兜底（`resolveImage` 任意字符串直通、`relic.part` 无枚举约束、MEDIUMTEXT + `express.json({limit:'3mb'})`）→ 一次 PUT 写 ≈3MB 任意字符串入库，随后经公开接口全量下发（不可逆污染 + 带宽放大）。**注意基线 P2-3 的修复方向原文把该路由当「达标参照」，参照本身不达标。** 建议：抽 `validation.cjs` 纯校验函数供 dataSync 对每 item 复跑，或实现数组变体 `validateBody`；给 image 加应用层上限。状态：- [ ] 待修
- **SEC-02 [P2]** `server/index.js:821,829` + `dataSync.js:181,237` — 存储批量写入口**每次无条件 spawn mysqldump**（含空 payload、注定 409 的请求），且只受全局限流器（200/min 共享桶）约束。`{"data":{}}` 校验全过 → 备份照跑；`{"data":[]}` → 备份已执行之后才被 replaceSafety 拦 409 → 反复重试 = 反复 mysqldump（保留 30 份，写放大）。建议：两条路由挂专用限流（如 10/min/IP）；`touchedTypes/items` 为空直接 400 不进备份；`createDatabaseBackup` 移到 `assertReplaceSafety` 通过之后。状态：- [ ] 待修
- **SEC-08 [P2→并入 P3 讨论]** 会话吊销 denylist 两处残留：① 无过期自动清理（基线 P1-4 状态行写「过期自动清理」，机制并不存在——只有同 jti 再来才惰性删）；② 进程重启即清空，已吊销 token 重启后复活。建议：读取时/定时扫描清理；跨重启吊销落 app_meta 或至少启动 WARN。状态：- [ ] 待修（与 BE-11 同一处代码）

### 后端域

- **BE-03 [P2]** `dualStorageManager.js:60-73,89-94` — web 侧 `writePayload` 用裸 `writeFile`（无 atomic）、`readPayload` 裸 `JSON.parse`、文件存在即跳过重建 → web JSON 一旦损坏，前端主数据源 `/api/dual-storage/web/data` 与 status 诊断接口**永久 500**（P2-10 只修了 storageManager 侧，web 侧未覆盖）。建议：复用 `writeJsonAtomic`；parse 失败回退 root/种子并告警。状态：- [ ] 待修
- **BE-04 [P2]** 与 ENG-01 同一条（init-db 假成功），见 P1 列表。状态：已随 ENG-01 修
- **BE-05 [P2]** `server/index.js:572-593` — `POST/PUT /api/factions` 是唯二不调 `syncAfterWrite`/`syncDatabaseToStorage` 的写路由 → 改阵营名后前端 `agent.faction` 显示旧名（web JSON 陈旧），直到下一次任意其他写操作；而 `/api/base-data` 走 DB 已更新 → 两处显示不一致。建议：faction 写后补同步。状态：- [ ] 待修
- **BE-06 [P2]** `server/index.js:882-891` — 优雅关闭先 `closeAllConnections()` 立即切断全部连接（含在途请求），且只 drain `enqueueStorageSync`、**不 drain `enqueueReplace`**（全量替换走的队列）→ 关闭时进行中替换被 `sequelize.close()` 打断。建议：先 `closeIdleConnections()` + 限时 `close()`，超时才全切；shutdown 对 enqueueReplace 也排 no-op 等待。状态：- [ ] 待修
- **BE-07 [P2]** `storageManager.js:57-69`、`dualStorageManager.js:75-87` — 每次写入产生 14 份全量 JSON 备份，**无任何自动轮转**（实测 backup 目录 360 文件；`cleanupBackups` 只有手动脚本）。建议：轮转挂到 performStorageSync 末尾/启动（keep=10），内容未变跳过备份。状态：- [ ] 待修

### 前端域

- **FE-02 [P2]** `AdminPanel.jsx:360-362,729,742-754` / `HsrAdminPanel.jsx:348-350,700,714-725` — `handleSubmit` 无防重入守卫（无 `if (submitting) return`），保存按钮在 form 外 → 单文本字段 tab（音擎/邦布/光锥）按 Enter 可隐式提交；在途再 Enter → 并发两条 POST → 409 → catch 覆盖「已创建」提示（与 P1-11 同症状不同根因）；若唯一索引降级未建成则真实重复行。建议：首行防重入 + 保存按钮入 form。状态：- [ ] 待修
- **FE-03 [P2]** 同两文件 — 提交在途仍可改表单/点编辑/点新增/关抽屉（P2-26 只禁了 tab），完成回调无条件清空表单与编辑上下文 → 保存期间输入被静默丢弃。建议：`submitting` 期间统一 disabled + 成功分支校验 editingItem 仍是本次提交对象。状态：- [ ] 待修
- **FE-04 [P2]** `AdminAuthGate.jsx:47-53,89-96,131-146` + `api/client.js:21-30` — 会话 8h 过期后管理端不回登录：mutation 401 不触发重新校验（client 无响应拦截、`expiresAt` 存了没用），界面只显示英文 `Unauthorized admin request.`；唯一恢复是手动刷新。建议：client 加 401 响应拦截 → 清 token + bump retryNonce；错误文案按状态码映射中文。状态：- [ ] 待修
- **FE-05 [P2]** `AdminPanel.jsx:714-717` / `HsrAdminPanel.jsx:687-688` — 管理抽屉全屏 fixed 遮罩层无 dialog 语义与焦点管理（全仓 grep `keydown|Escape|role="dialog"|aria-modal|inert` 0 命中）：不移焦点、Tab 可穿遮罩、无 Esc、读屏不播报。建议：`role="dialog" aria-modal` + 焦点管理 + Esc + 背景 inert。状态：- [ ] 待修
- **FE-06 [P2]** `AdminPanel.jsx:662-667` / `HsrAdminPanel.jsx:633-638` — 后台状态横幅/加载态无 `role="alert"`/`aria-live`（全仓 grep 0 命中；前台 `LoadErrorBanner` 已用 `role="alert"`，属遗漏非策略）。建议：成功 `role="status"`、失败 `role="alert"` + aria-live。状态：- [ ] 待修

### 工程域

- **ENG-04 [P2]** `eslint.config.js:20` — `files: ['**/*.{js,jsx}']` 不匹配 `.cjs` → 3 个 CommonJS 文件从不被 lint（`validation.cjs`、`errorHandler.cjs`、`relicParts.cjs`）。建议：`files: ['**/*.{js,jsx,cjs,mjs}']`（可能需给 .cjs 配 `sourceType:'commonjs'`，需实跑验证）。状态：- [ ] 待修
- **ENG-05 [P2]** `package-lock.json` 混用两个 registry（557 条 npmmirror + 107 条 npmjs），仓库无 `.npmrc` → CI `npm ci` 按 resolved URL 大量经第三方镜像取包（可用性/供应链面）。建议：`.npmrc` 固定 registry 并重生成 lock。状态：- [ ] 待修（涉及 lock 重生成，单独批次）
- **ENG-06 [P2]** `开发规范文档.md:1223-1227` — 5 条相对链接全部死链（`./01-architecture.md` 等实际在 `docs/` 下）。其余 docs/README/SECURITY/plans 相对链接 0 死链。建议：改 `./docs/0X-*.md`。状态：- [ ] 待修

---

## 四、新 P3（28 条，摘要）

### 安全域

| 编号 | 位置 | 问题 |
|---|---|---|
| SEC-04 | `src/utils/logger.js:66-79` | `basicSanitize` 子串匹配把审计日志 `authMode`/`authenticated` 掩成 `*****`（`'authmode'.includes('auth')`），P1-3/P1-4 最需要留痕的两字段失真。建议：精确键名匹配或改名 |
| SEC-05 | `src/db/databaseBackup.js:98-104` → `dataSync.js:203-208` | mysqldump stderr 塞进 `AppError.message` 且非 500 分支原样回显 HTTP 响应（泄露 DB 用户/主机/库名）。P1-2 修复的残余缺口。建议：公开文案固定，detail 只进日志 |
| SEC-06 | `server/index.js:204-206` | `X-Request-Id` 无白名单直接写日志——实测注入 `probeXYZ] [ERROR] FAKE-ENTRY` 原样落盘，未鉴权可伪造日志条目。建议：`^[A-Za-z0-9_-]{1,64}$` 校验 |
| SEC-07 | `index.js:809,817,403,334-335` | 限流缺口：第 4 个全量导出口 `GET /api/storage/data` 未挂 fullDumpRateLimiter；`POST /api/storage/reset` 全量重建无限流；`/api/search/optimized` LIKE 全表扫描无限流；`/health(/ready)` 公网无鉴权每次真打 DB（失败每次写 warn 无去抖）。附：`errorHandler.cjs` 的 `errorHandler` 中间件导出后从未 `app.use`（死代码） |
| SEC-08 | `server/middleware/auth.js:14,111-128` | denylist 只增不清 + 重启失效（详见 P2 列表，与 BE-11 同码） |
| SEC-09 | `validation.cjs:310` | P1-6「三处同源」不彻底：`validateHsrRelicData` 仍硬编码部位枚举，未引用 `relicParts.cjs`（第 4 处副本）。当前值相同无功能影响，词表变更即复现 P1-6 症状；基线 docs/15:155/400「三处引用同源」声明失真 |

### 后端域

| 编号 | 位置 | 问题 |
|---|---|---|
| BE-08 | `index.js:582-585` | `PUT /api/factions/:id` 用 `affectedRows` 判 404（sequelize `-FOUND_ROWS`），同秒相同 payload 重复提交会误报 404 |
| BE-09 | `index.js:200-208` | body-parser 报错响应缺 `x-request-id`、不写访问日志、不计指标（requestId/日志中间件注册在 json 解析之后） |
| BE-10 | `src/utils/errorHandler.js:226-279` | `errorMiddleware` 无 `res.headersSent` 保护；`uncaughtException`/`unhandledRejection` 直接 `process.exit(1)` 跳过优雅关闭（不 drain、不 sequelize.close） |
| BE-11 | `auth.js:117-127` | 吊销名单惰性清理，登出条目常驻内存（与 SEC-08 同） |
| BE-12 | `validation.cjs:165-216` | 校验器接受但模型/DB 不存在的字段被静默丢弃：`faction.logo`、`soundEngines/bumbos.description`（无列、serializer 不返回）→ 调用方拿成功但数据没落库 |
| BE-13 | `index.js:837-851` | 静态资源 404 被 SPA 兜底吞掉：`GET /assets/nonexistent.png` → 200 text/html（监控全 200 掩盖缺资源） |
| BE-14 | `api.js:570-598` | `buildSnapshot` 7 个 findAll 并行无事务 → 快照跨表撕裂（并发写在两次查询之间时 JSON 同时含新旧数据，下次写入自愈） |
| BE-15 | MySQL 实测 | 冗余唯一索引 24 个（factions/roles/rarities 各 name_2/_3/_4、4 张 hsr 维表 name_2/_3，历史 DB_AUTO_ALTER sync 产物）。建议 DROP 多余保留一个 |
| BE-16 | `src/db/config.js:22-23,85-87` | 死配置（`retryAttempts` 未传给 Sequelize 且键名不对）与死单例（`export const sequelize` 无人使用却 import 时构造） |
| BE-17 | `server/__tests__/` | 测试盲区：11 个测试文件仅 3 个真正 `import app`，其余 mini Express 复刻 → SPA 兜底/优雅关闭/factions 路由/storage PUT/init-db/launcher/scripts 均未覆盖真 app |
| BE-18 | 多处 | 响应封装三种形状并存（health 的 code/data、错误的 success/message、裸对象/裸数组） |
| BE-19 | `databaseBackup.js:92-108` | mysqldump 子进程无 timeout；dump 非原子落盘（直接 writeFile） |
| BE-20 | `launcher.js:167-171,223` | SIGINT 立即 `process.exit(0)` 子进程可能残留占 3001；`checkMySQLService()` 返回值被忽略 |

### 前端域

| 编号 | 位置 | 问题 |
|---|---|---|
| FE-07 | `DataContext.jsx:182-183` | 手动「刷新数据」仍整屏 loading 替换后台面板（P2-18 只修 mutation 路径），提交期间也能点 |
| FE-08 | `ZZZWiki.jsx:183-184,319-327` / `HsrWiki.jsx:135-136` | 首屏整屏 loading 被 base-data 阻塞（列表已返回也全屏等待，且看不到 LoadErrorBanner） |
| FE-09 | `DataContext.jsx:261-265` | mutation 成功但刷新失败仅 console.warn——P1-11 承诺的「提示已保存 + 重试」未实现（静默陈旧残留） |
| FE-10 | `App.jsx:31-33` | 路由切换无滚动复位、无焦点移动、`document.title` 恒为 HengBeGer（全仓 0 命中） |
| FE-11 | `ZZZWiki.jsx:383-395` 等 | tab/筛选 chip 选中态只有 className，无 `aria-pressed`/`aria-selected`/`role=tab` |
| FE-12 | `DataContext.jsx:270-362` | `contextValue` 未 memo → `memo(ZZZWiki)`、`memo(AdminPanel)`、tabConfig useMemo 全部失效 |
| FE-13 | `DataContext.jsx:168-171,219-226` | 每次保存/刷新恒发 3 请求（`loadAllData` 绕过 baseDataRef 缓存）、prefetch 无缓存 → 撞 60/min 限流风险；P1-12 声称的「baseData 会话缓存」在写路径不生效 |
| FE-14 | `ZZZWiki.jsx:319-340` | `if (error && initialLoading)` 死分支永不可达 |
| FE-15 | `AdminPanel.jsx:334-350` | 删除当前正在编辑记录后 `editingItem` 未失效 → 继续保存必 404 |
| FE-16 | `AdminPanel.jsx:278-285` | 文件选择两分支不一致（校验失败清 image、无文件只清预览）；无途径撤销已选图片 |
| FE-17 | `AdminPanel.jsx:735`、`HsrAdminPanel.jsx:706-707` | 后台图片预览 `<img>` 无 onError 兜底（P2-21 漏网 3 处） |
| FE-18 | `utils/apiError.js:6-19` | 服务端英文错误文案原样透出到中文 UI |
| FE-19 | `vite.config.js:24-28` | 无路由级代码分割；`manualChunks.vendor` 声明失效产出 1 字节空 chunk，首页即拉 326KB（含双后台代码） |
| FE-20 | `usePaginatedPublicList.js:115-118` 等 | `goToPage` 全仓 0 调用；`<input type="hidden" name="image">` 无消费方 |

### 工程域

| 编号 | 位置 | 问题 |
|---|---|---|
| ENG-07 | `coverage/` | jest 与 vitest 共写同一 coverage 目录，产物互相混合。建议分 `coverage/backend`、`coverage/frontend` |
| ENG-08 | `package-lock.json:3,9` | lock 根 version 仍 `0.0.0`（P3-15 只改了 package.json 0.1.2） |
| ENG-09 | `.env.example` | 缺 3 个代码确实读的键：`TRUST_PROXY_HOPS`、`MYSQLDUMP_PATH`（P0-2 备份链路开关）、`VITE_HOST`；「写了没人读」= 0 |
| ENG-10 | `start.bat:22`、`launcher.js:62` | 仍带 `npm install --legacy-peer-deps`（start.sh 已去、docs/06 称无需 flag） |
| ENG-11 | `README.md:19,185,199` | staging 审计句过期；GET 接口列进「写接口」节；storage/backup 称可提交（实际 .gitignore 整体忽略） |
| ENG-12 | `docs/14:21,67` | 仍把 staging 回归测试当已完成能力（测试文件已删） |
| ENG-13 | `SECURITY.md:27,99,217,221` | DB_NAME 大小写、`logs/security.log` 不存在（实为分级文件且非生产不落盘）、裸 npm audit（镜像无 audit 端点） |
| ENG-14 | `docs/plans/2026-10-03-…:120,122` | 仍建议 `--legacy-peer-deps` 与 `git checkout -- src/db/storage/`（均已失效） |
| ENG-15 | `docs/01-architecture.md:21,28,35,77` | 目录树含已删 `src/assets/`、legacy staging、不存在的 analyze 接口 |
| ENG-16 | `docs/` | `09-code-review-findings.md` 与 `09-improvements-summary.md` 编号重复 |
| ENG-17 | `ci.yml:16` | Node 20（本地 22.17.1 无 CI 覆盖）；无 `permissions:`、无 `timeout-minutes` |
| ENG-18 | `package.json:74-81` | jest coverageThreshold 无 `collectCoverageFrom` → 分母只有被加载过的文件（新增未测文件不拉低分数） |
| ENG-19 | `vite.config.js:13` | proxy target 硬编码 3001 不跟随 `.env` PORT |
| ENG-20 | `docs/06:63` | 描述 CI 步骤漏列 production audit 门禁 |
| ENG-21 | `docs/README.md` | 04/11/14 仍各出现两次（P3-24 结论不符）；plans/ 29 文件未收录 |
| ENG-22 | `docs/13:23` | 仍把 `storage/backup/` 列为应清理（实际持续生成、已 ignore） |

---

## 五、附：git 工作区事实核查（工程 agent）

- 分支 `main`，HEAD `a5d5d4f`；**基线 84 项修复全部未提交**（`git diff --stat HEAD` = 85 files, +3819/−9956）。
- 已暂存删除（`git rm --cached`，P1-19 决策）：`src/db/storage/**` 12 个 json，工作区文件仍在盘、gitignore 生效。
- 未暂存删除：`release.yml`、`admin-staging-sync.test.js`、`public/assets/mc.jpg`、`src/assets/{mc,star,zzz}.jpg`、两个 `.codex-hsr-hero*.png`、**`design-demos/*.html` 5 个**（后者未记入 docs/15，plans 文档仍列「届时问用户」待办——事实待用户确认是否有意）。

---

## 六、覆盖说明与不确定点

- **安全域**：38 文件 7,284 行全读 + 30+ 只读 GET 探测（注入/穿越/伪造头/CORS/限流头全过）+ 关键 grep 断言（原生 SQL 13 处全常量插值、0 XSS sink、execFile 无 shell、日志 0 泄漏）。
- **后端域**：server/index.js 903 行全读 + src/db 全读 + MySQL 只读查询（列类型/索引/脏数据/sql_mode）+ 20+ GET 探测。
- **前端域**：30 文件 4,082 行全读 + dist 产物分析 + 后端契约对照。
- **工程域**：全部配置/workflow/17 个 docs md + 死链递归扫描 + env 键全仓对照 + git 状态。
- **未实测项**（需写操作/重启，未做）：SEC-01/02/05 端到端、BE-01 500 复现（由列类型+严格模式推断）、BE-03 损坏态、BE-05 陈旧显示、BE-06 关闭行为、FE-02 按键时序、SEC-03 生产是否已触发（需运维确认 TRUST_PROXY_HOPS）。
- **docs/15 基线「已修」声明可信度**：SEC-09、ENG-01/02/08/21、P0-2 证据行等多处证明**状态行不宜直接采信**，复核结论以 docs/15「复核 2026-10-06」章节为准。
