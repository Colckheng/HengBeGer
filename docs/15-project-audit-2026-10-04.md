# 15 - 全项目审查报告（2026-10-04）

> **日期**：2026-10-04  
> **范围**：全栈（Express 5 服务端 / Sequelize+MySQL 数据层 / 双 JSON 存储链 / React 19 前端 / 工程配置与依赖）  
> **方法**：4 路并行只读审查（安全、后端正确性与数据、前端健壮性、工程配置），关键结论均附**实测验证**（对本机运行实例的只读 API 探测、MySQL 只读查询、npm audit、git 只读命令）  
> **基线**：UI 重设计 8 步完成后；筛选序列化/动态选项/闪屏修复后；阵营"奥伯勒斯/奥波勒斯"合并后  
> **统计**：P0 严重 4 项 · P1 高 20 项 · P2 中 34 项 · P3 低 26 项 = **84 项**；另附"已核实无问题"25 项

---

## 目录

- [本版已完成（背景）](#本版已完成背景)
- [P0 · 严重（4）](#p0--严重4)
- [P1 · 高（20）](#p1--高20)
- [P2 · 中（34）](#p2--中34)
- [P3 · 低（26）](#p3--低26)
- [已核实无问题项](#已核实无问题项)
- [修复批次计划](#修复批次计划)

---

## 本版已完成（背景）

以下问题在本次审查**之前**已发现并修复，不计入待办：

| 修复 | 内容 |
|---|---|
| 筛选序列化 | axios 数组参数 `key[]=v` 与 Express 5 query 解析不兼容 → 所有 id 型筛选被静默忽略。已加 `src/api/params.js` 逗号序列化器并挂入 `src/api/client.js` |
| 筛选选项漂移 | `src/Filter.jsx` 硬编码名单与 DB 不一致（白祇/白祈、怪啸/怪啖等）。改为从 baseData 动态生成 |
| 筛选闪屏 | 每次筛选/翻页整页替换为"加载中"面板。改 stale-while-revalidate：`usePaginatedPublicList` 切 tab 清空、筛选保留旧列表；两页 `initialLoading`/`refreshing` 分流 + `.is-refreshing` 淡显 |
| 阵营错字合并 | DB 中"奥波勒斯小队"(id2) 与"奥伯勒斯小队"(id5) 分裂。已合并为一条（官方拼法=奥波勒斯），3 个代理人迁移，种子 `initialdata.js` 与 admin 暂存同步修正，root+web 已重同步 |

---

## P0 · 严重（4）

### P0-1 【安全】未鉴权 SQL 注入 — `POST /api/query/analyze`

- **位置**：路由 `server/index.js:370`（无 `requireAdmin`）；拼接 `src/db/queryOptimizer.js:347,350,371-372,394`；执行 `src/db/indexes.js:175`
- **实测**（对本机 3001，无需任何凭据）：
  ```
  {"queryType":"agents","filters":{"factionId":1}}          → 200 + 执行计划
  {"queryType":"agents","filters":{"factionId":"1 OR 1=1"}} → 200 + 注入表达式被 MySQL 真实执行
  {"queryType":"agents","filters":{"factionId":"abc"}}       → 400（SQL 报错被吞 → 成为盲注二元预言机）
  ```
- **说明**：`req.body.filters` 的值未做类型校验/转义就拼进 `EXPLAIN` 语句。响应还直接回传表名、索引名、行数估算。
- **影响**：匿名访问者可向 MySQL 提交任意布尔表达式；报错/成功差异构成数据探测通道。
- **修复**：① 前端零调用（已 grep 证实）→ **直接删除该路由**，或加 `requireAdmin`；② 若保留：数值字段 `Number.isInteger` 强校验 + 绑定变量 `replacements`，字符串走白名单；③ `indexes.js:205` 不要静默吞 SQL 错误，至少记日志。
- **状态**：- [x] **已修（2026-10-04）**：路由、`analyzeQueryPerformance` 及 3 个拼接 builder、`indexes.js` 的 `analyzeQuery`/`generateRecommendations` 全链删除；冒烟确认 `POST /api/query/analyze` → 404。

### P0-2 【数据】staging 同步把"文件缺失"当"空数据" → 一次调用删光 HSR 数据

- **位置**：`server/index.js:801-821`（sync 路由）；`src/db/dualStorageManager.js:65-72`（`readPayload`：文件不存在 → `data: []`）、`:226-232`（`getAllAdminData` 遍历全部 7 类）；`src/db/api.js:1271-1302`（空数组 = 删光现有行）
- **实测**：磁盘上 `src/db/storage/admin/` **只有 4 个 ZZZ 文件，hsrCharacters/hsrCones/hsrRelics 三个缺失**（且 hsr JSON 本来就不入库，新 clone 必然缺失）；DB 现有 `hsr_characters=31, hsr_cones=15, hsr_relics=13`。
- **说明**：现在对 `POST /api/dual-storage/sync` 发一次请求 → 3 个缺失类型被当空数组 → **59 条 HSR 记录全删** → root/web JSON 同步为空 → 前台立刻空列表，接口还返回 `200 success:true`，无任何告警。
- **放大器**：全仓无任何 MySQL 备份手段（grep `mysqldump` 零命中）→ 此类 DB 侧误操作不可恢复；`npm run restore-storage` 只还原 JSON，重启即被空 DB 覆盖。
- **修复**：① `readPayload` 区分 *missing* 与 *空数组*，missing → 跳过该类型且不进 `touchedTypes`；② 删除量异常（0 条 vs DB N 条）时拒绝并要求显式确认；③ **立即补 mysqldump 定时备份**（与 P1-8/P1-9 一并考虑）。
- **状态**：- [x] **已修（2026-10-04）**：
  - ① `readPayload` 缺文件返回 `null`（签名简化为单参数），`getAllAdminData` 跳过 null 类型，`initializeAdminSession` 不再为缺 web 源的类型生成空暂存；
  - ② 新增 `src/db/replaceSafety.js` 纯函数保险丝，挂入 `replaceRecordsForType`：暂存 0 条 vs DB N 条 → `AppError 409`，需 `confirm: true`（路由透传 `allowEmptyWipe`，`dataSync` 两个 replace 入口同样透传）；
  - ③ 新增 `src/db/databaseBackup.js`（mysqldump 自动定位：env → PATH → 常见安装路径）+ `npm run backup-database`；sync 路由**强制先备份**，备份失败即中止（503）；产物写 `db-backups/`（已 gitignore，保留最近 30 份）；
  - ④ 新测试：`dualStorageManager.test.js`（5 例，临时目录真实文件）+ `replaceSafety.test.js`（4 例）+ 镜像路由 2 个新用例；实测备份 33KB/14 张表。

### P0-3 【工程】npm audit：2 critical + 49 high（含运行时依赖）

- **位置**：`package.json` dependencies
- **实测**：默认 registry（npmmirror）不实现 audit 端点，须 `npm audit --registry=https://registry.npmjs.org/` → `70 vulnerabilities (2 critical, 49 high, 12 moderate, 7 low)`
- **要点**：
  | 依赖 | 级别 | 生产运行时 |
  |---|---|---|
  | `vitest <=4.1.10`（路径穿越/任意读 GHSA-82fw-gwwqj7x9） | critical | dev（测试链） |
  | `shell-quote <=1.8.4`（← concurrently） | critical | `npm start` 启动链 |
  | `mysql2 <=3.23.0`（认证降级泄露、解压炸弹） | high | **是（DB 链路）** |
  | `sequelize 6.x`（JSON cast 注入面） | high | **是** |
  | `path-to-regexp 8.2.0`（← express 5.1.0，ReDoS） | high | **是（路由）** |
  | `axios 1.11.0`（30+ 条：原型污染/SSRF/ReDoS…） | high | 浏览器侧 |
  | `react-router-dom 7.8.0` | high | 前端 |
  | jest/vite/postcss/lodash/ws… | high | 主要 dev |
- **附带**：本机默认 registry 不实现 audit → 日常 `npm audit` 直接报 404，**安全检查实际从未执行**（须 `.npmrc` 固定 audit-registry 或 CI 作权威入口）。
- **修复**：`npm audit fix`（不带 `--force`）先吃掉 semver 内的大部分；`vitest@5`、`mysql2` major 单独评估；CI 加 `npm audit --audit-level=high` 门禁。
- **状态**：- [x] **已修（2026-10-04）**：
  - 删除零引用的 `vite-plugin-node-stdlib-browser`（解除 ERESOLVE，`npm install`/`npm ci` 恢复原生可用，**顺带完成 P1-16**）；
  - `npm audit fix` + 定向升级 `vite 7.1.1 → 7.3.6`、`vitest 2.1.9 → 4.1.11`（修掉 vitest critical、vite 全部 high、esbuild）；
  - 测试适配：vitest 4 要求构造器 mock 用 `function`（`AdminPanel`/`HsrAdminPanel` 各 1 处 `FileReader` mock 改写）；
  - 结果：**70 → 35（critical 2 → 0）**；生产链（`--omit=dev`）**0 high / 0 critical**（剩 7 个 low/moderate：uuid←sequelize、elliptic，暂接受）；
  - 剩余 28 high 全部是 `braces <=3.0.3` 经 jest 的传递链 —— **上游尚未发布修复版**（最新即 3.0.3），无解，只能等；
  - 门禁：`npm run audit` / `npm run audit:prod` 两个 script（带 `--registry` 绕过镜像源无 audit 端点问题）+ CI 加 `npm audit --omit=dev --audit-level=high` 步骤；
  - 验证：lint ✓、后端 40/40 ✓、前端 43/43 ✓、`vite build` ✓、三页 Edge headless 冒烟 ✓。

### P0-4 【前端】全站无 React Error Boundary → 任意 render 抛错 = 整站白屏

- **位置**：`src/main.jsx:8-16`（树：StrictMode > BrowserRouter > DataProvider > App，无边界）；`src/App.jsx:33-62`
- **证据**：全仓 grep `ErrorBoundary|componentDidCatch|getDerivedStateFromError` → **0 命中**；且存在真实抛错向量：
  - `ZZZWiki.jsx:74` `item.name.toLowerCase()` —— `name` 为 null/非字符串直接 TypeError（数据来自磁盘 JSON，不经校验）
  - `ZZZWiki.jsx:65-72`、`HsrWiki.jsx:51-58` `image.startsWith(...)` —— 非字符串 image 同理
- **影响**：React 卸载整棵组件树 → 用户只见空白页（连工具栏都没有），必须硬刷新；无日志、线上无法定位。
- **修复**：在 `main.jsx` 根层加 `<AppErrorBoundary>`（`getDerivedStateFromError` + `componentDidCatch` 打日志 + 重置按钮）；可再按路由包一层局部边界，避免单页崩溃连累全站。
- **状态**：- [x] **已修（2026-10-04）**：
  - 新增 `src/AppErrorBoundary.jsx`（根层 + `App.jsx` 路由层双边界，路由层 `key={pathname}` 随导航自动复位，复用 `error-container`/`btn-primary` 样式）；
  - 三处已知炸点加固：`ZZZWiki.jsx` 的 `item.name.toLowerCase()` 与两文件的 `image.startsWith` 均加类型守卫；
  - 新增 `AppErrorBoundary.test.jsx`（2 例：子组件抛错出兜底 UI + 正常渲染），注意该仓库 RTL 需手动 `cleanup()`（无全局配置）。

---

## P1 · 高（20）

### 安全域（5）

#### P1-1 【安全】限速可被 `X-Forwarded-For` 伪造绕过 + 登录无爆破防护

- **位置**：`server/index.js:138`（`trust proxy: 1`）、`:141`（唯一全局限速 200/min）、`server/middleware/auth.js:241-268`
- **实测**：每换一个伪造 XFF 头即获得全新 200 次/分钟配额；登录端点无失败计数、无锁定、**失败尝试不写任何审计日志**（`logAdminAudit` 只在成功路径调用）。
- **影响**：直连部署（仓库无 nginx/Dockerfile）= 无限速的管理密码爆破，且完全不留痕。
- **修复**：`trust proxy` 按实际跳数配置（未在可信代理后必须 `false`）；登录端点单独挂 `rateLimit({windowMs:15min, max:10, skipSuccessfulRequests:true})` + 失败退避；失败登录也记审计（IP/UA/原因，不记密码）。
- **状态**：- [x] **已修（2026-10-04）：trust proxy 默认 false（TRUST_PROXY_HOPS 可配）+ 登录限流（E2E 429 验证）+ 失败登录审计 logAdminAudit**

#### P1-2 【安全】错误响应泄露完整 stack 与内部 details

- **位置**：`src/utils/errorHandler.js:226-236`（dev 回显 `stack`+`details`）、`:114-120`（DB 错误落盘含 sql+parameters）；`src/api/dataSync.js` 6 处 catch **与 NODE_ENV 无关**恒回显 `error.message`
- **实测**：`POST /api/auth/session` 错误密码 → 401 响应体含 `stack: "AppError... at createAdminSession (file:///D:/.../auth.js:255:10)"`；非法 JSON body 返回 500（应 400）且 `details.body` 回显原始请求体。
- **影响**：泄露绝对路径、依赖栈、中间件链与源码行号；当前 `.env` 是 development，以此配置上线即全量暴露。
- **修复**：统一中间件只回 `message + statusCode + requestId`，stack 进服务端日志；`dataSync.js` 六处改固定文案；body-parser 错误映射 400；DB 错误日志不落 `parameters` 原文。
- **状态**：- [x] **已修（2026-10-04）：去 stack/details 回显、dataSync 六处 500 固定文案、invalid JSON→400/超限→413、DB 日志去 parameters（E2E 验证）**

#### P1-3 【安全】管理密码可直接当永不过期 Bearer + 密钥回退链

- **位置**：`server/middleware/auth.js:207`（`secureCompare(providedToken, bearerToken || adminPassword)`）、`:53-63`（ADMIN_PASSWORD→ADMIN_API_TOKEN→**DB_PASSWORD** 非生产回退）、`:73-83`（AUTH_SECRET 同样回退）、`:254`（明文比对无 KDF）
- **影响**：① 密码出现在每个请求的 Authorization 头 = 一旦日志/代理/前端 sessionStorage 泄露即**永久凭据**（8h 会话过期对它无效、无法吊销）；② 开发配置下 admin 口令 = DB 口令，横向打通；③ `.env` 泄露后可离线验证。
- **修复**：移除 `|| adminPassword` 回退只接受签名会话令牌；去掉 DB_PASSWORD 回退（缺失即 503）；比对前做慢哈希（argon2/scrypt + `timingSafeEqual` 比摘要）。
- **状态**：- [x] **已修（2026-10-04）：Bearer 只认签名会话、getAdminPassword/getAuthSecret 仅取 ADMIN_PASSWORD/AUTH_SECRET、scryptSync+timingSafeEqual 登录比对（E2E 密码当 Bearer 401 验证）**

#### P1-4 【安全】登出不吊销服务端会话

- **位置**：`server/index.js:304-314`（只清浏览器 Cookie）；`server/middleware/auth.js:107-124`（payload 仅 issuedAt/expiresAt，**无 jti、无服务端存储**）
- **影响**：被盗的 `sessionToken`（POST 响应体明文返回，`index.js:299`）在 8 小时内**登出后依然有效**；同毫秒登录产生完全相同的令牌，无法区分会话。
- **修复**：payload 加 `jti`（`crypto.randomUUID()`）+ 服务端失效集合（内存/DB），logout 时加入 denylist；或改服务端 session 表。
- **状态**：- [x] **已修（2026-10-04）：jti + 内存 denylist（过期自动清理），clearAdminSession 收 req 吊销（E2E 登出后旧 token 401 验证）**

#### P1-5 【安全】DoS 面三连：10MB body × 限速可绕过 × 指标标签无界；`/metrics` 无鉴权

- **位置**：`server/index.js:170-171`（10MB body 上限）、`:141`（限速）、`:103-114/203-211`（`route: req.path` 未归一化的 Prometheus 标签）、`:282`（`/metrics` 无鉴权，实测 200）
- **影响**：伪造 XFF 后并发提交大量 10MB body 耗内存；任意 404 路径都新建时序 → 指标内存持续增长；外部可读进程/路由指标辅助攻击探测。
- **修复**：管理写接口 body 降到 1-2MB（图片改独立上传端点，与前端 2MB 对齐）；指标标签改 `req.route?.path` 或白名单；`/metrics` 挂 `requireAdmin` 或仅内网。
- **状态**：- [x] **已修（2026-10-04）：body 10mb→3mb（E2E 413 验证）、指标标签用 req.route.path 归一化（unmatched 兜底）、/metrics 挂 requireAdmin（E2E 401 验证）**

### 数据正确性域（5）

#### P1-6 【数据】HSR 遗器"部位"词表三处不一致 → 前台筛选恒 0、管理端无法保存

- **位置**：API 常量 `server/index.js:421`（`头部/手部/身躯/脚部/位面球/连接绳`）vs 校验枚举 `server/middleware/validation.cjs:279`（`头/手/身/脚/位面球/连结绳`）vs DB 实际值（`头/手/身/脚/位面球/连结绳`）
- **实测**：`GET /api/hsr/relics/list?parts=头部` → `total:0`；`?parts=头` → `total:1`。管理端 `HsrAdminPanel` 下拉用 API 常量 → 提交即 400（除"位面球"）。
- **影响**：**筛选动态修复的漏网之鱼**——前台遗器部位筛选除位面球外全部无效；管理端根本选不了部位。
- **修复**：单一数据源——`/api/hsr/base-data` 的 `relicParts` 从 `hsr_relics` distinct 或共享常量导出，与 `isEnum`、seed 三处同源。
- **状态**：- [x] **已修（2026-10-04）：`server/constants/relicParts.cjs` 单一来源，三处引用同源**

#### P1-7 【数据】"描述"与驱动盘"图片"是假字段：保存成功但静默丢弃

- **位置**：
  - 描述：表单 `AdminPanel.jsx:408-416`、`HsrAdminPanel.jsx:385-392`；模型 `src/db/models/agent.js`（**无 description 列**）；`api.js:633-641/650-703`（写入被丢）；`api.js:190-204`（序列化不回传）→ `ZZZWiki.jsx:126` 永远显示占位文案、后台搜索描述永远搜不到
  - 驱动盘图片：`validation.cjs:212-231` `validateDriveDiskData` 白名单**没有 image** → 上传返回 200 后字段消失
- **影响**：管理员输入 → 保存提示成功 → 数据没存。**静默数据丢失**，且 UI 看起来像"没填"。
- **修复**：二选一——给 agents/hsrCharacters 加列并贯通 serialize/add/update，**或从表单删掉该字段**；`validateDriveDiskData` 补 `image` 白名单。
- **状态**：- [x] **已修（2026-10-04）：description 加列贯通 + 驱动盘 image 白名单（E2E 验证）**

#### P1-8 【数据】种子无事务、非幂等、失败即卡死，唯一恢复是清库

- **位置**：`src/db/initializedata.js:144-221`（catch → `return false`）、`:176-186`（重入闸门="4 张表全为 0"）→ `server/index.js:238-241` 抛错 → `:865` `process.exit(1)`
- **说明**：所有 `bulkCreate` 无事务包裹。任一条失败 → 已插的表保留、失败的表为空 → 下次启动闸门判定"不用重播"**永不补齐** → 启动直接退出。恢复手段只有 `INIT_DB=true`（= `sync({force:true})` 全库清空）。
- **修复**：整个 seed 包一个 `sequelize.transaction`（失败全回滚，下次仍满足全 0 可重试）；或改 `findOrCreate` 幂等补齐；启动失败信息给出明确恢复步骤。
- **状态**：- [x] **已修（2026-10-04）：种子包进 sequelize.transaction，触发器强制中途失败回滚验证 7/7**

#### P1-9 【数据】DB 写成功但 JSON 同步失败 → 500 + 永久漂移 + 重试产生重名

- **位置**：`src/db/api.js:643-645` 等（`Agent.create` 无事务 → `syncDatabaseToStorage` 失败则异常上抛）；`src/utils/serialTaskQueue.js:1-9`（无重试）；业务表**无 UNIQUE(name)**（`idx_agents_name` 是普通索引）
- **影响**：前台数据源是 JSON 不是 DB → 同步失败期间管理端 500、前台旧数据，无补偿；客户端按 500 重试 `POST` 即产生重复名字。
- **修复**：同步失败标记 dirty 并重试/下次写入补偿（或返回 201 + degraded 标记）；给 agents/sound_engines/bumbos/drive_disks/hsr_* 的 `name` 加唯一约束（重试被 409 挡住）。
- **状态**：- [x] **已修（2026-10-04）：syncAfterWrite 重试 + storageDirty、resolveErrorStatusCode 保留 409、7 个 name 唯一索引（E2E 9/9）**

#### P1-10 【数据】陈旧 admin staging 发布会静默回滚 DB 中之后的所有修改

- **位置**：`server/index.js:785-799`（PUT staging **仅 `Array.isArray` 校验**）；`dualStorageManager.js:115-132`（staging 文件存在即不刷新）；`admin/agents.json` 实测为 2025-12-07 旧格式（只有 faction 文本、无 id）
- **说明**：正常 CRUD **从不更新 admin/ 暂存** → 一旦之后改过任何 ZZZ 数据，再点发布就把改动回滚；且无 dry-run/预览。与 P0-2 同属该链路（发布流程整体不可用）。
- **修复**：要么下线整个 legacy staging 流程，要么 sync 前 `forceRefresh` 从 DB 重建 staging + PUT 复用 `validateItems` 校验；补一条用真实 dualStorageManager（临时目录）的集成测试（现有测试全 mock，掩盖了 P0-2）。
- **状态**：- [x] **已修（2026-10-04）：staging 整体下线（E2E 11/11），P0-2 备份迁至 /api/storage/*，P3-20 随删**

### 前端健壮性域（6）

#### P1-11 【前端】保存失败误报 → 管理员重试 = 重复录入

- **位置**：`src/DataContext.jsx:186-195`（`mutateAndRefresh` 的 catch 包住了 `await refreshData()`）、`:135-137`（refreshData 失败会 throw）→ 消费端 `AdminPanel.jsx:341-357`、`HsrAdminPanel.jsx:327-343`
- **说明**：mutation 已经成功（201），但随后刷新列表失败 → catch 捕获 → UI 显示"添加代理人失败"。管理员按提示重试 → **同一条数据创建两次**。删除/更新同理。
- **修复**：拆两段——mutation 失败才是真失败；refresh 失败只提示"已保存，刷新失败"+提供重试，不 throw。
- **状态**：- [x] **已修（2026-10-04）：mutation 失败才报“保存失败”，刷新失败仅 console.warn**

#### P1-12 【前端】每次路由切换都重拉数据 + 全屏 loading（另一种闪屏）

- **位置**：`src/DataContext.jsx:143-184`（`useEffect(..., [pathname])` 每次 `setLoading(true)` + 重拉 baseData 2 个请求；prefetch 路由再拉全量 main data，**无缓存无取消**）；`:166`（`setData(createEmptyData())` 清空主数据）
- **影响**：首页↔wiki↔详情每次导航正文全屏换"加载中"；每导航 2-3 个请求放大；任一失败 → 整页错误（叠加 P1-14 无重试）。
- **修复**：`loading` 拆 `initialLoad`/`routeTransition`；baseData 会话内缓存（或版本号）；`AbortController` 取消上一次；清空改为保留旧值（stale-while-revalidate）。
- **状态**：- [x] **已修（2026-10-04）：loading 仅初次/显式刷新、baseData 会话缓存、AbortController 取消、不清空旧值（SWR）；浏览器验证无闪屏**

#### P1-13 【前端】axios 无 timeout → 弱网永久卡"加载中"

- **位置**：`src/api/client.js`（实例无 `timeout`，默认 0=永不超时）；卡点 `DataContext.jsx:146-177`、`AdminAuthGate.jsx:84-90`（"正在检查管理员会话..."无限等待）、`usePaginatedPublicList`
- **影响**：连接挂起时 loading 永不转 error，错误态反而不出现。
- **修复**：`axios.create({ timeout: 10000 })`；loading 加超时兜底转 error + 重试按钮。
- **状态**：- [x] **已修（2026-10-04）：`axios.create({ timeout: 10000 })`，错误经 P1-14 重试入口兜底**

#### P1-14 【前端】错误态是整页死路：吞掉已有数据、无重试入口

- **位置**：`ZZZWiki.jsx:324-332`、`HsrWiki.jsx:361-369`（`if (error) return 整页面板`）；`error = listState.error || contextError`
- **说明**：翻页/筛选时一次请求失败 → 已渲染的卡片、筛选 UI 全部被替换成错误页，无"重试"按钮，error 无清除入口，只能刷新浏览器。
- **修复**：错误改非破坏性——保留列表 + 顶部错误条 + 重试按钮（重新 fetch）；`setError(null)` 提供用户动作。
- **状态**：- [x] **已修（2026-10-04）：错误条保留列表 + 重试按钮（listState.retry + refreshData），浏览器验证非破坏**

#### P1-15 【前端】代理人卡片 `<article onClick>` 键盘完全不可达

- **位置**：`src/ZZZWiki.jsx:205-210`（无 tabIndex/role/onKeyDown/焦点样式）
- **影响**：键盘/辅助技术用户**无法进入代理人详情页**（这是唯一入口）。可访问性硬伤。
- **修复**：改成 `<Link to={...}>`（顺带获得中键/新标签页），或补 `role="link" tabIndex={0}` + Enter/Space 处理。
- **状态**：- [x] **已修（2026-10-04）：代理人卡片改 `<Link>`（键盘/中键/新标签页可达）**

### 工程配置域（5）

#### P1-16 【工程】`npm install` 按 README 操作 100% 失败（ERESOLVE）

- **位置**：`package.json:71`（`vite-plugin-node-stdlib-browser`，全仓 **0 引用**）；README.md:37、docs/04、docs/06 均写裸 `npm install`；规避 flag 只藏在 start.bat/sh、launcher.js
- **实测**：`npm install --dry-run` 报 `ERESOLVE ... vite@7.3.6 ... peer vite@"^2||^3||^4" from vite-plugin-node-stdlib-browser@0.2.1`
- **修复**：删除该依赖（一条改动解锁安装）；或补 `.npmrc` 写 `legacy-peer-deps=true`；统一 README/docs 命令。
- **状态**：- [x] **已修（2026-10-04，随 P0-3 顺带）**：已删除该依赖；`npm install --dry-run`、`npm ci --dry-run`、真实 `npm install` 均验证通过，不再需要任何 flag。

#### P1-17 【工程】dotenv-safe 校验形同虚设（被空值 + try/catch 双重绕过）

- **位置**：`server/index.js:90-94`（`try { dotenvSafe.config() } catch { dotenv.config() }`）；`.env.example:14`（`ADMIN_API_TOKEN=` 空值触发永久抛错）
- **影响**：缺失键/键名拼错/`.env` 不存在时启动**无任何提示**，错误推迟到运行期。
- **修复**：`dotenvSafe.config({ allowEmptyValues: true })`；catch 里至少 `logger.error` 打出 missing 列表；example 给非空占位。
- **状态**：- [x] **已修（2026-10-04）**：`allowEmptyValues: true` + catch 内 `logger.error`；`ADMIN_API_TOKEN` 空值键已随 P1-3 删除（改 allowEmpty 兜底，偏差等效）；重启实测启动日志无校验失败、`/health` 200

#### P1-18 【工程】release workflow 指向不存在的目录/脚本，打 tag 必红

- **位置**：`.github/workflows/release.yml:21,25,29,30,44`（`working-directory: HengBeGer`/`HengBerGerApp` 均不存在；`npm run make` 不存在）；body 还写着已删除的 SQLite 降级
- **修复**：删除该 workflow 或指向真实目录；发布说明与当前代码对齐。
- **状态**：- [x] **已修（2026-10-04）**：直接删除 `release.yml`（指向不存在目录/脚本的死配置，当前无有效发布流程）

#### P1-19 【工程】storage JSON 既被 git 跟踪又被 ignore（中间态）

- **位置**：`.gitignore:76-77` vs `git ls-files -ci` 列出全部 12 个文件；HSR 六个 JSON 是 ignored+未跟踪，ZZZ 却入库
- **影响**：每次跑服务产生 9-12 个数据文件 diff（极易误提交/掩盖真实改动）；新 clone 缺 HSR 快照、ZZZ 有，策略自相矛盾；审查中还发现 git checkout/pull 会把陈旧内容覆盖回运行时（与 P1-10 相关）。
- **修复**：**二选一**——`git rm --cached -r src/db/storage`（真 ignore，运行时由 DB 重建），或移除 ignore 统一全部入库。需决策。
- **状态**：- [x] **已修（2026-10-04）：`git rm --cached` 真 ignore，随本版提交入库**

#### P1-20 【工程】构建开 sourcemap + dev server 对局域网开放

- **位置**：`vite.config.js:21`（`sourcemap: true` → dist 含全部源码）、`:9`（`host: true` 绑 0.0.0.0 且 `/api` 反代后端）
- **影响**：dist 直接上线可还原源码；局域网任意人可访问 dev server 借 proxy 打后端（叠加 P1-1 限速可绕）。
- **修复**：`sourcemap: !production`；`host` 改回 localhost/按需开启。
- **状态**：- [x] **已修（2026-10-04）**：`sourcemap: false`；`host: process.env.VITE_HOST || 'localhost'`（局域网需 env 显式开启）

---

## P2 · 中（34）

### 安全域（8）

| # | 问题 | 位置 | 修复方向 | 状态 |
|---|---|---|---|---|
| P2-1 | `secureCompare` 长度早退 → 密码长度侧信道 | `auth.js:39-51` | HMAC/填充到同长再比；限制输入长度 | - [x] 已修：HMAC-SHA256 digest + timingSafeEqual 恒长；登录侧信道由 P1-3 scrypt 比对解决 |
| P2-2 | 图片字段服务端仅长度校验，类型校验全在前端（可绕过传任意字符串） | `validation.cjs:115-117` | 服务端校验 `^data:image/(png\|jpe?g\|webp\|gif);base64,...` + 2MB 统一 | - [x] 已修：validateImage 正则+解码 2MB 上限；**偏差**——生产数据 97% 为路径格式（实测 agents 43/43 等），额外放行 ≤500 字符路径白名单，否则旧记录无法保存 |
| P2-3 | staging PUT 缺逐条 `validateItems`（任意对象可入库，靠 DB 事务兜底报 500） | `index.js:785-799` | 挂与 `/api/storage/:type` 同套校验 | - [x] 已随 P1-10 legacy staging 整体下线消失 |
| P2-4 | `reset-mysql-password.bat` 指引把 root 密码重置为**空**（且 PASSWORD() 在 MySQL8 已失效） | `reset-mysql-password.bat:35,50` | 改为设置新强密码，删除空密码指引 | - [x] 已修：FLUSH PRIVILEGES + ALTER USER 设新强密码 + 提示同步 .env DB_PASSWORD |
| P2-5 | CSRF 仅靠 SameSite=Lax；dev 下 CORS_ORIGINS 为空时**任意源+credentials 反射** | `auth.js:162-174`、`index.js:151-158` | state-changing 加 Origin 校验；dev 也不反射任意源 | - [x] 已修：cors 前置 Origin 中间件——state-changing 跨域 403、跨域 GET 剥离 Origin 不发 ACAO、同源/白名单放行（E2E 四路验证） |
| P2-6 | 调试端点无鉴权：`/api/database/stats`（实测 200 返回表结构）、`/api/data/optimized` 等（前端零调用） | `index.js:316,320,387` | 非 development 禁用或挂 requireAdmin | - [x] 已修：/api/data、/data/optimized、/agents/optimized、/search/optimized、/database/stats 五端点挂 requireAdmin（E2E 401 验证） |
| P2-7 | `/api/agents/optimized` limit/offset 未校验：`limit=abc`→500+SQL泄露、`limit` 无上限（绕过 MAX 100） | `index.js:328-345` | 复用 `parsePositiveIntQuery` + 上限 | - [x] 已修：parsePositiveIntQuery/parseNonNegativeIntQuery + clamp 100（E2E limit=999999→100、abc→50 验证；非法值回退默认与 list 端点一致，非 400） |
| P2-8 | `/metrics` 无鉴权（与 P1-5 关联，单列跟踪） | `index.js:282` | requireAdmin 或内网 | - [x] 已修：requireAdmin（E2E 401/200 验证，metrics.test 同步更新） |

### 数据域（7）

| # | 问题 | 位置 | 修复方向 | 状态 |
|---|---|---|---|---|
| P2-9 | DB 写未与同步队列串行 → 并发 replace 可产生重复行/静默删他人数据（无 UNIQUE 放大） | `api.js:1304-1325` | DB 变更进同一队列或 `FOR UPDATE`/乐观锁 | - [x] 已修：replace 全家（单类型/批量）过 `enqueueReplace` 串行队列，快照读不再落后于并发提交；配合既有事务 + name UNIQUE（P1-9）+ 409 兜底。**偏差**：单行 CRUD 未入队（无陈旧快照整删语义，靠 UNIQUE+行锁） |
| P2-10 | JSON 非原子写（无 tmp+rename）+ 无优雅关闭（SIGTERM 缺失、exit 前不 flush）→ 半截文件 | `storageManager.js:109`、`errorHandler.js:242-268`、`index.js:880-885` | tmp+rename；SIGTERM 等队列 drain + `sequelize.close()` | - [x] 已修：`writeJsonAtomic`（tmp+rename+失败清理）覆盖 initialize/save 两处；SIGINT+SIGTERM 优雅关闭（server.close → 队列 drain → sequelize.close，10s 兜底强退）。**偏差**：logger 文件写本就 `appendFileSync` 同步、无独立 flush 需求；Windows 无 POSIX 信号、关闭链为代码级验证 |
| P2-11 | `/health/ready` 是永不翻转的布尔，MySQL 挂了仍报 connected | `index.js:220,247` | ready 做带超时 `authenticate()` 探活 | - [x] 已修：1.5s 超时 `authenticate()` 探活，失败降 503；实测 200 + 测试 42/42 |
| P2-12 | `validateAgentData` 缺 role 必填 → 漏字段打到 `resolveRelationId` 抛 500 而非 400 | `validation.cjs:100-107` | role 加 else 抛 400；resolveRelationId 改 AppError(400) | - [x] 已修：role 缺失 → AppError 400；`resolveRelationId` Missing/not-found 两处 throw 改 AppError(400) |
| P2-13 | 存储路径依赖 `process.cwd()` → 换目录启动会新建一套空 storage 无告警 | `storageManager.js:21` | `fileURLToPath(import.meta.url)` 定位 | - [x] 已修：storageManager/dualStorageManager/storageBackupManager 三处默认路径全改模块目录定位（backup 用户传参的 cwd resolve 属预期语义，保留） |
| P2-14 | `data:[]` 即可整表清空，无最小条数/二次确认 | `dataSync.js:77-102` | 0 条 vs DB N 条时要求 `confirm:true` | - [x] 已随 P0-2 完成：`assertReplaceSafety`（0 vs N → 409 + `confirm:true`）+ dataSync 转发 `allowEmptyWipe` + 测试 |
| P2-15 | 种子"全表为空即重播"会复活已删除数据；`init-db.js` 的 INIT_DB 开关行为反直觉 | `initializedata.js:176-196`、`init-db.js:44` | 加 seeded 标记；init-db 改显式 `--force` | - [x] 已修：新增 `app_meta` 表种子标记（`seeded:zzz`/`seeded:hsr`，空表且无标记才重播，存量库首次启动自动补标，实测两行已写入）；`init-db` 默认安全模式、显式 `--force` 才 `INIT_DB=true`（连带关闭 P3-23） |

### 前端域（11）

| # | 问题 | 位置 | 修复方向 | 状态 |
|---|---|---|---|---|
| P2-16 | `fetchBaseData` 用 `Promise.all` 绑死 ZZZ+HSR：一边 5xx 整页错误 | `DataContext.jsx:96-100` | `allSettled` 各自降级 | - [x] 已修：改 `allSettled`，单侧失败 warn 后降级空数组、双侧失败才抛错；测试同步为双侧 mock |
| P2-17 | 后台保存按钮在 `<form>` 外且 `type="button"` → 绕过 required，两条提交路径行为不一致 | `AdminPanel.jsx:714`、`HsrAdminPanel.jsx:685` | 按钮进 form 用 `type="submit"` 或先 `reportValidity()` | - [x] 已修：两面板保存按钮点击先 `form.reportValidity()` 再提交（Enter 路径本就走浏览器校验），双路径一致 |
| P2-18 | 每次 mutation 把整个后台面板替换成 loading（焦点丢失、抽屉卸载、banner 不可见） | `AdminPanel.jsx:564-570`、`DataContext.jsx:123-125` | 后台用 refreshing 降透明度而非整页替换 | - [x] 已修：mutation 刷新改独立 `refreshing` 态，`.admin-shell.is-refreshing` 降透明度且保留抽屉/banner，不再整页替换 |
| P2-19 | refresh 无版本控制：慢的旧快照可能覆盖新数据（"刚保存的不见了"） | `DataContext.jsx:123-141` | 递增序号只应用最新 / AbortController | - [x] 已修：`loadAllData` 递增序号，完成时序号过期即丢弃（只应用最新） |
| P2-20 | 兜底图片 404：`/assets/hsr.jpg` 不存在（59 条 HSR+API 兜底全 404）、`/images/agents/*.jpg` 目录不存在 | `api.js:40`、`ZZZWiki.jsx:74`、`public/assets/` | 补图或改指已存在资源；去掉推导路径 | - [x] 已修：补 `public/assets/hsr.jpg`（star.jpg 占位，59 条引用恢复）；`agentImage` 删 `/images/agents` 推导直落 zzz 占位 |
| P2-21 | `onError` 兜底无防抖：兜底资源本身失败时无限循环刷请求 | `ZZZWiki.jsx` 5 处、`HsrWiki.jsx` 3 处 | `dataset.fallback` 守卫或比对 currentSrc | - [x] 已修：8 处统一 `handleImageError`（`dataset.fallbackApplied` 单次守卫，兜底再失败即停） |
| P2-22 | 后台所有 `<label>` 无 `htmlFor`/输入框无 `id`（26 处）→ 屏幕阅读器不可用 | `AdminPanel.jsx`、`HsrAdminPanel.jsx` | id+htmlFor 同值或 Field 封装 | - [x] 已修：两面板 renderForm 全部 label `htmlFor` + 控件 `id`（`fieldId` 工厂生成，25 对 + 图片项原有） |
| P2-23 | 无 404 兜底路由（未知路径=工具栏+空白）；**生产无任何静态托管**（server 不服务 dist，深链 404 JSON） | `App.jsx:37-59`、`server/index.js` 全文 | 加 `path="*"` NotFound；生产补 `express.static(dist)` + history fallback | - [x] 已修：NotFound 路由 + express.static(dist) + history fallback |
| P2-24 | HSR 筛选 chip `key={option.value}` 未去重（ZZZ 侧已去重）→ 重名即重复 key | `HsrWiki.jsx:147` 等 6 处 | 按 name 去重；长期改用 id 做 value | - [x] 已修：7 处 option 组建统一 `nameOptions`（Set 按 name 去重） |
| P2-25 | AdminAuthGate 会话检查无取消、失败无重试（网络闪断时已登录者被当未登录） | `AdminAuthGate.jsx:35-65` | cancelled 标志；失败渲染重试，仅 401 判未登录 | - [x] 已修：`loadSession` 带 cancelled 标志；非 401 失败进 `failed` 态渲染重试按钮（retryNonce 重查），仅 401 清 token 判未登录 |
| P2-26 | 保存进行中切 tab：回调把状态写到新 tab（提示串台、强制拉开抽屉） | `AdminPanel.jsx:144-151 vs 336-361` | submitting 期间禁切 tab 或校验 ref | - [x] 已修：两面板 `submitting` 期间侧栏 tab 按钮 `disabled`，回调不再写到新 tab |

### 工程域（8）

| # | 问题 | 位置 | 修复方向 | 状态 |
|---|---|---|---|---|
| P2-27 | 11 个运行时依赖全仓 0 引用（browserify 全家桶）+ `@types/*`（无 TS）+ `vite-plugin-node-stdlib-browser` | `package.json:28-52,58-59,71` | 删除（顺带消掉一批 audit low 噪声） | - [x] 已修：删零引用依赖 12 个（assert/browserify-zlib/buffer/https-browserify/os-browserify/path-browserify/stream-browserify/stream-http/util/pg-hstore/@types×2；node-stdlib 已随 P0-3 删），`npm install` 实测 removed 111 包 |
| P2-28 | `npm start` 依赖 devDependency `concurrently` → `--omit=dev` 后无法启动 | `package.json:12 vs 61` | 移入 dependencies 或生产改 PM2 只跑 server | - [x] 已修：`concurrently` 移入 dependencies |
| P2-29 | CI 缺 `npm run build` 与 audit 门禁（lint+test 就算过） | `.github/workflows/ci.yml:19-25` | 补 build + `npm audit --audit-level=high` | - [x] 已修：audit 门禁随 P0-3 已补；本批补 `Production build` step（build 已带 `NODE_ENV=production`，见批次 5 新发现） |
| P2-30 | Node 版本文档错误（写 16/18+，Vite 7 实际要 20.19+/22.12+）+ 无 engines 字段 | `docs/04:7`、`docs/06:5` | 文档统一 + 补 engines | - [x] 已修：`engines: ^20.19.0 || >=22.12.0`；docs/04、docs/06 统一改 20.19+/22.12+ |
| P2-31 | `DB_NAME` 三处不一致（`HengBeGer` vs `hengbeger`） | `.env.example:5`、`README:49`、`config.js:17` | 统一小写 `hengbeger` | - [x] 已修：`.env.example:5` 统一 `hengbeger`（README/config.js 本已小写） |
| P2-32 | 生产路径 `console.log` ×11（queryOptimizer）+ `/data-test` 调试路由随包发布且 render 打全量数据 | `queryOptimizer.js` 11 处、`App.jsx:58`、`DataTest.jsx:7-9` | 改 logger；路由用 `import.meta.env.DEV` 包裹 | - [x] 已修：queryOptimizer 全部 console→logger（动态 import 改静态 import）；`/data-test` 路由 `import.meta.env.DEV` 包裹；重建后生产 bundle 实测路由/DataTest 均 0 残留 |
| P2-33 | 测试配置静默漏跑盲区（jest 只认 `server/__tests__/**`、vitest 只认 `src/**`，其他位置的测试不跑不报错）+ 零覆盖率门禁 + 双框架 | `package.json:74-85` | 加 glob 断言 + coverageThreshold；长期收敛单 runner | - [x] 已修：`test-glob-coverage.test.js`（锁双框架根 + 全仓扫描盲区）；jest/vitest `coverageThreshold`（基线 30%/54%，阈值 25%/50%）+ `test:coverage` 脚本，CI 测试 step 换 coverage 变体做真门禁；收敛单 runner 留长期 |
| P2-34 | 历史残留 461 个 backup 快照 blob（占历史体积 49%） | git 历史 `src/db/storage/backup` | `git filter-repo` 剔除（可选，pack 才 2MB 暂不急） | - [x] 已评估并暂缓：历史 pack 仅 2MB，改写历史的协作/强推风险大于收益；如未来历史显著膨胀再执行 `git filter-repo` |

---

## P3 · 低（26）

| # | 问题 | 位置 | 状态 |
|---|---|---|---|
| P3-1 | 全量导出有三个无分页出口（`/api/data`、`/api/data/optimized`、web/data），廉价带宽放大器 | `index.js:316,320,488` | - [x] 已修：三出口挂 `fullDumpRateLimiter`（60/min）；两个 admin 导出本就 requireAdmin，公网 web/data 另有全局 200/min + gzip + ETag 兜底 |
| P3-2 | `npm run restore-storage` 恢复的 JSON 活不过下次重启，易被误解为"已回滚" | `scripts/restore-storage-backup.js:56-75` | - [x] 已修：restore 输出追加显式告警——本地 storage 下次重启会被 MySQL 重新同步覆盖，持久回滚需在数据库层操作 |
| P3-3 | DataSyncController 自己 catch 并回显 `error.message`，绕过统一错误结构（6 处） | `dataSync.js:114-302` | - [x] 已随 P1-2 修复（2026-10-04）：6 处 catch 统一 `resolveErrorStatusCode` + 统一 JSON 结构，500 固定文案不回显 |
| P3-4 | `public/assets/hsr.jpg` 缺失（与 P2-20 同源）；seed 的 HSR 命途缺"记忆"（DB 有 8 个、种子只有 7 个） | `public/assets/`、`initialdata.js` | - [x] 已修：补 `public/assets/hsr.jpg`；`initializedata.js` pathNames 显式加 `"记忆"`（findOrCreate 幂等） |
| P3-5 | 筛选变更先用旧 offset 发一次作废请求（被 cancelled 挡住，白烧一次网络） | `usePaginatedPublicList.js:28-30` | - [x] 已修：fetch effect 检测 `offset≠0` 且 `resetKey(limit|filters)` 已变时跳过本轮，等 offset 归零后只发一次正确请求 |
| P3-6 | `onClick={refreshData}` 失败产生 Unhandled Rejection | `AdminPanel.jsx:615`、`HsrAdminPanel.jsx:585` | - [x] 已修：两面板刷新按钮改 `handleRefresh`（`void ...catch`），失败由 context error banner 呈现 |
| P3-7 | 状态条用 `includes('失败')` 嗅探样式 → 英文错误（Network Error）被渲染成**成功**绿色 | `AdminPanel.jsx:628`、`HsrAdminPanel.jsx:598` | - [x] 已修：`statusTone` 显式态（`pushStatus(msg, tone)`），错误红/成功绿，不再嗅探字面 |
| P3-8 | 表格标签 key `${id}-${tag}` 同值重复 | `AdminPanel.jsx:535-537` | - [x] 已修：两面板 tag key 追加 `tagIndex`，同值不再撞 key |
| P3-9 | 后台搜索框无 aria-label/label | `AdminPanel.jsx:663-671` | - [x] 已修：两面板搜索框补 `aria-label` |
| P3-10 | FileReader 回调无取消 → 慢读取跨过面板替换窗口时状态丢失 | `AdminPanel.jsx:18-22,284-289` | - [x] 已修：`fileReadSeqRef` 令牌——选文件递增、回调校验；tab 切换/关闭/切新增/编辑/取消选择均失效挂起读取 |
| P3-11 | 公开页 context error 无用户可见清除入口（挂到下次导航） | `DataContext.jsx:121,136,170` | - [x] 已随批次3 P1-14 完成：公开页列表/详情均挂 `LoadErrorBanner`+重试，`refreshData` 成功即清除 context error |
| P3-12 | `.gitignore` 死规则（不存在的 `!src/db/storage/README.md`、`temp_debug.js`）+ `_logs/` 目录未显式忽略 | `.gitignore:16,77` | - [x] 已修：删死规则 `!src/db/storage/README.md`、补 `_logs/`（temp_debug 规则此前已不在） |
| P3-13 | `src/assets` 与 `public/assets` 三对图字节级重复；根目录两个未引用 hero PNG 共 1.35MB（仓库最大被跟踪文件） | `src/assets/*`、`.codex-hsr-hero*.png` | - [x] 已修：3 处 import 改指 `/assets` 公共路径、删除 `src/assets` 三对重复图与双份死文件 `mc.jpg`；根目录 `.codex-hsr-hero*.png`（1.35MB 零引用）删除 |
| P3-14 | README `.env` 样例缺 `ADMIN_API_TOKEN`（dotenv-safe 修好后会拦） | `README.md:47-60` | - [x] 已失效（2026-10-04）：`ADMIN_API_TOKEN` 已随 P1-3 整体删除，README 与 `.env.example` 天然一致 |
| P3-15 | `package.json` version `0.0.0` 与历史 tag v0.1.2 不符 | `package.json:4` | - [x] 已修：version `0.0.0` → `0.1.2`（对齐最近 tag） |
| P3-16 | 密钥回退链（缺 ADMIN_PASSWORD 时回落 DB_PASSWORD）文档未提示 | `auth.js:61,81`、README | - [x] 已随批次1 P1-6 完成：回退链已移除（getAdminPassword/getAuthSecret 仅取 ADMIN_PASSWORD/AUTH_SECRET），无回退可提示 |
| P3-17 | `LOG_LEVEL`/`SECURITY_SILENCE` 可选变量未进 `.env.example`；`开发规范文档.md:950` 示例含代码零引用的 `JWT_SECRET` | `logger.js:267`、`security.js:254` | - [x] 已修：`.env.example` 补两变量（本地 `.env` 同步，保持 dotenv-safe 键一致）；开发规范文档示例 `JWT_SECRET` → `AUTH_SECRET` |
| P3-18 | 部署文档是空壳（一行标题），且同时踩 P1-16/P2-28 两个坑 | `docs/06-deployment.md` | - [x] 已修：重写为真实内容（环境要求/env/init-db 安全模式/build 4s/优雅关闭/健康探针/PM2/Nginx/CI 现状），不含已删 release 流程与历史依赖坑 |
| P3-19 | npm scripts 冗余：`launch` 与 `quick-start` 完全相同 | `package.json:14,17` | - [x] 已修：删 `quick-start`（文档引用更多的 `launch` 保留），05-startup-guide 同步去重 |
| P3-20 | 死代码 `syncAdminToWeb` 无任何调用方（文档还在讲它） | `dualStorageManager.js:220`、`开发规范文档.md:509` | - [x] 已随 P1-10 staging 下线删除 |
| P3-21 | 分页控件 `page`/`total` prop 传入未使用（冗余非 bug） | `PaginationControls.jsx` | - [x] 已修：两处调用删除未消费的 `page`/`total` 传参 |
| P3-22 | `errorHandler` 非法 JSON 返回 500（应 400）+ `details.body` 回显（与 P1-2 同链路，单列） | `errorHandler.js` | - [x] 已随 P1-2 修复（2026-10-04）：`entity.parse.failed` → 400 `'Invalid JSON payload.'`；`details` 回显已删 |
| P3-23 | 破坏性初始化仅 dev 门禁依赖 `NODE_ENV`，`.env` 删行即变无确认清库（`init-db` 反直觉，与 P2-15 关联） | `initializedata.js:151-156` | - [x] 已随 P2-15 修复：`init-db` 默认安全模式，显式 `--force` 才置 `INIT_DB=true` |
| P3-24 | 广告位式重复脚本/文档导航指向不存在文件的链接需复核（docs/README 导航） | `docs/README.md` | - [x] 已修：docs/README 导航去重（04/11/13/14 各出现两次）、补 15-project-audit 链接，全部链接复核存在 |
| P3-25 | 启动链 `start.bat/sh` 内的路径假设未在非仓库目录场景验证（与 P2-13 关联） | `start.sh:27` | - [x] 已修：start.sh 首行 `cd "$(dirname "$0")"`，去掉不再需要的 `--legacy-peer-deps` |
| P3-26 | react-router-dom 等前端 high 漏洞待 major 评估（并入 P0-3 批次跟踪） | `package.json` | - [x] 已关闭（2026-10-04）：`npm audit --omit=dev --audit-level=high` 现为 0 high（仅剩 sequelize 2 moderate，不挡门禁），并已入 CI 门禁 |

---

## 已核实无问题项

审查中**主动验证过、确认不是问题**的关注点（避免后续重复排查）：

**安全**
- 写路由鉴权覆盖：22 条实体写 + 6 条 dual-storage + 6 条 storage 全部挂 `requireAdmin`（唯一漏网是 P0-1）
- 路径穿越：`/api/storage/:type` 四重白名单（validation 枚举 → dataSync → storageManager → dualStorageManager）
- `.env` 未被 git 跟踪且历史中从未出现；全仓无硬编码密钥
- 日志无凭据泄露（`_logs` 中 token/Bearer/密码值 0 命中；`logger.basicSanitize` 按字段名掩码；adminAudit 不记令牌）
- 密码比对使用 `crypto.timingSafeEqual`；Cookie 为 HttpOnly+SameSite=Lax（prod 加 Secure）
- CORS 生产未配置时 fail-closed；helmet 7.2.0 生效（CSP/HSTS/nosniff/frameOptions 实测响应头齐全）

**数据**
- 外键真实存在（`SHOW CREATE TABLE` 见 7 表 ibfk 约束，ON UPDATE CASCADE），孤儿记录实测 0
- 同步队列覆盖所有运行时写路径；启动无并发（listen 在 initDb 之后）；队列对失败隔离
- 分页 `listXXX` 边界健壮：limit 0/负/非数字 → 默认 12，>100 → 100，空数组不生成 `IN ()`（实测全 200）
- `INIT_DB` 默认值不会误清库（destructive 需 dev + `=true` 同时满足）
- 种子数据质量除 P1-6 遗器部位、P3-4 记忆命途外，7 个数组无重复、词表与 DB 字典完全一致、DB↔seed↔root↔web 逐字段 0 diff
- `catchAsync` 覆盖足够（Express 5 自动把 async 拒绝转 next(err)）
- replace 批量写有事务包裹（`api.js:1318-1322`）

**前端**
- XSS：`dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` 全仓 0 命中；外链 src 无硬编码
- 内存泄漏：`src/` 无裸 addEventListener/setInterval/matchMedia（无需清理的对象）
- DataContext 初始加载失败会正确进 error 态（finally 置 loading false），唯一卡点是无超时（P1-13）
- 详情页 id 变化无旧数据闪现（contextLoading 全程 gate + selectedAgent effect 设计正确）
- 分页连点有 `cancelled` 标志 + 原生 `disabled`，PaginationControls 边界正确
- React 19 已移除 API（defaultProps/PropTypes/findDOMNode/UNSAFE_*）零使用
- admin 鉴权是真门双层：前端 AdminAuthGate 调真实接口 + 服务端 37 处 requireAdmin
- 无 SSR，hydration 不适用

**工程**
- `node_modules`/`dist`/`_logs`/`storage/backup` 均未被跟踪；仓库体积健康（pack 2.06 MiB）
- 所有 npm scripts 指向的文件都存在；全仓无 TODO/FIXME/HACK
- 鉴权缺配置时 fail-closed（503 而非放行）

---

## 修复批次计划

### 批次 1 · 紧急（P0 全部，预计 ~1h）
- [x] P0-1 删除/鉴权 SQL 注入端点
- [x] P0-2 staging sync 缺失文件保护 + **补 mysqldump 备份**——sync 接口已随 P1-10 下线，强制备份迁至 `/api/storage/:type` 与 `/api/storage/batch/update`
- [x] P0-3 `npm audit fix` + CI audit 门禁（含 P1-16 依赖删除）
- [x] P0-4 根层 ErrorBoundary

### 批次 2 · 数据正确性
- [x] P1-6 遗器部位词表三处同源（`server/constants/relicParts.cjs` 单一来源）
- [x] P1-7 描述/driveDisk image 假字段（决策：description 加列贯通 + image 白名单）
- [x] P1-11 保存误报拆分（mutation 失败才报"保存失败"，刷新失败仅警告）
- [x] P1-8 种子事务化（触发器强制中途失败，回滚验证 7/7）
- [x] P1-9 同步失败补偿 + name UNIQUE（`storageDirty` + 重试；E2E 9/9，7 索引 NON_UNIQUE=0）
- [x] P1-10 staging 流程去留决策（决策：整体下线，E2E 11/11；P0-2 备份迁至 `/api/storage/*`，P3-20 死代码随删）

### 批次 3 · 前端健壮性
- [x] P1-13 axios timeout——`timeout: 10000`
- [x] P1-12 DataContext loading 拆分 + baseData 缓存 + 取消——浏览器验证无闪屏
- [x] P1-14 错误态非破坏化 + 重试——错误条保留列表，浏览器验证
- [x] P1-15 卡片改 Link（键盘可达）
- [x] P2-23 404 路由 + 生产静态托管——E2E 8/8（深链/未知路径/API 404 分离）

### 批次 4 · 安全加固
- [x] P1-1 限速 trust proxy + 登录爆破防护——E2E 429 验证
- [x] P1-2 错误响应去 stack——E2E 无 stack/details + 400/413 验证
- [x] P1-3/P1-4 凭据体系（去密码 Bearer、会话可吊销）——E2E 401/吊销验证
- [x] P1-5 body 限制/指标标签/metrics 鉴权——E2E 413/401 验证
- [x] P2-1~P2-8 清扫——E2E 32/32；P2-2 偏差（放行路径格式）/P2-7 偏差（非法值回退默认）已注记；lint+backend 40/40+frontend 47/47+build 全绿

### 批次 5 · 工程卫生
- [x] P1-16 删 `vite-plugin-node-stdlib-browser`（解锁 npm install）——随 P0-3 顺带完成
- [x] P1-17 dotenv-safe 修复——`allowEmptyValues` + catch 日志，重启实测 `/health` 200 无报错
- [x] P1-18 release.yml 修复或删除——直接删除（指向不存在目录/脚本的死配置）
- [x] P1-19 **storage 跟踪策略二选一（需决策）**——决策：`git rm --cached` 真 ignore，随本版提交入库
- [x] P1-20 sourcemap/host——`sourcemap: false` + `host: localhost`（`VITE_HOST` env 可显式开）
- [x] P2-27~P2-33 依赖/CI/文档——lint + backend 42/42 + frontend 47/47 + coverage 双门禁 + build 全绿
- [x] 新发现（审查外）：`.env NODE_ENV=development` 导致 `vite build` 一直产 dev bundle（jsxDEV×583、data-test 路由常开、index 503KB）——`build` 脚本加 `cross-env NODE_ENV=production`；重建后 index 284KB、jsxDEV 0、路由已剥、Warning 0
- [x] 新发现（审查外）：`react-dom@19.1.1` 生产文件触发 rollup 4.64 treeshaking 病态路径追踪（`NODE_ENV=production` 构建 5m35s vs dev 模式 6s，CPU profile ~80% 在 `includeStatements`/`trackEntityAtPathAndGetIfTracked`，最小复现仅 21 模块 4 分钟）——升级 `react`/`react-dom` 19.1.1→19.3.0，完整生产构建 **4.2s**（约 120×），产物指标全绿

### 批次 6 · 清扫
- [x] P2 其余 + P3 全部按表逐条消化

---

## 附录 · 审查方法

- 4 个并行只读 explore agent（安全 / 后端+数据 / 前端 / 工程），输出均要求 文件:行号 + 证据 + 影响 + 修复建议
- 实测手段：对 `localhost:3001` 只读 API 探测（注入、限速头、鉴权、分页边界）、MySQL 只读 `SHOW CREATE TABLE`/`SELECT`、`npm audit --registry=https://registry.npmjs.org/`、`git ls-files`/`git log`、全仓 grep 交叉验证
- 所有结论与"不是问题"的反证一并记录，防止后续重复排查

---

# 复核 2026-10-06

> **方法**：4 路只读复核 agent 分域逐条验证 84 项修复真伪 + 关键项人工二次核验（MySQL 实测、dotenv-safe 源码、npm audit 复跑）。复核期间另做全量代码遍历，**51 条新发现 + 1 条已修项回归见 `16-full-re-audit-2026-10-06.md`**。
> **总判定**：84 项中 **79 项 ✅ 属实**、**3 项 ⚠️ 有偏差/残留（下详）**、**2 项 ➖ 证据或声明需修正**；另发现 **P2-19 未完全闭合**（路由 prefetch 路径缺序号守卫 → 新文档 FIXED-REGRESSION-01）。

## ⚠️ 偏差与残留（3）

### ⚠️ 1. P1-7 残留 — 存量库补列迁移脚本零引用

- `scripts/add-description-columns.js`（幂等给 `agents`/`hsr_characters` 补 description 列）**不在 package.json scripts、不在任何文档**（全仓 md/package.json grep 0 命中）；启动 `sequelize.sync({})` 不加列，`DB_AUTO_ALTER` 仅 dev。
- 本地库实测 5 表 description 列齐全（agents/drive_disks/factions/hsr_characters/roles）→ 本机无恙；**存量库**（P1-7 修复前建表且未开 alter 的库，含生产）缺列时 Sequelize SELECT/INSERT 含该列 → 相关读写全部 500。
- **处置**：已挂启动幂等迁移（随 BE-01 补列同链路），并补 `package.json` script。见 16 号文档 P1 批次。

### ⚠️ 2. P1-9 实现方式注记 — UNIQUE 由运行时 ensureIndex 维护，非模型定义

- 本地 MySQL 实测 7 个 name 索引全部 `NON_UNIQUE=0` ✅ 修复属实。
- 但约束来源是 `src/db/indexes.js:75-98` 启动时 `CREATE UNIQUE INDEX`（模型定义里无 `unique:true`，`sync()` 无 alter 也不会补）→ 降级路径：表内已有重名时只 `logger.warn('存在重复 name，保留普通索引…')` 后跳过（`:43-50`），**保护缺失直到人工去重**；`createIndexes` 外层 catch 吞错 `return false`（`:102-105`）且 `initializedata.js:237` 不阻断启动——即建索引失败启动照常，仅有 error 日志。
- **判定**：✅ 已修属实（E2E 9/9 + 本机实测），实现方式与状态行「加唯一约束」的字面表述有偏差，重名环境自动降级需知悉。

### ⚠️ 3. P0-2 证据行失真 — 描述引用了已删除的函数、测试计数不符

- `docs/15:60` 修复描述提到 `getAllAdminData` 跳过 null、`initializeAdminSession` 不再生成空暂存——**两函数在全仓已不存在**（grep 0 命中，随 P1-10 staging 整体下线被删）。实际修复=删除而非改造。
- `docs/15:63` 称 `dualStorageManager.test.js`（5 例）——实际 **3 例**（`replaceSafety.test.js` 4 例属实）。
- **判定**：修复本身有效（P1-10 E2E 11/11），仅证据描述失真，以本节为准。

## ➖ 声明修正（3）

- **P0-3 / P3-26「仅剩 sequelize 2 moderate」已过期**：2026-10-06 复跑 `npm audit --omit=dev --registry=…` = **4 项（2 moderate + 1 high + 1 critical）**——新披露 advisory：`proxy-addr <2.0.8` critical（IP spoofing）、`compression <1.8.2` high（DoS），均 Express 传递依赖且 `npm audit fix`（非 force）可修；`uuid <11.1.1` moderate 经 sequelize（--force 才能修，保持暂缓）。**全量 audit = 38 项（7 moderate/30 high/1 critical）**。→ CI `npm audit --omit=dev --audit-level=high` 门禁**当前会红**。**已修（2026-10-06）**：`npm audit fix` 后 prod = 2 moderate、exit 0（门禁恢复绿）；全量 35 项（dev 侧 28 high 属既有状态）。
- **P2-33「vitest 阈值 50/40/45/50」从未生效（死配置）**：`package.json` 的 `vitest` 段不被 vitest 4 读取（配置只认 `vitest.config.*`/`vite.config.*`），所谓「基线 54%」是 vitest 默认 include 下的产物，且 `coverage/include` 过滤也从未生效（产物含 star.jpg/ZZZWiki.css）。**已修（2026-10-06）**：新建 `vitest.config.js`（mergeConfig 保留 vite 插件/代理）+ 删死段 + guard 测试改断言真实配置；启用后实测真实基线 **25.52/20.93/26.34/25.26**（全 src js/jsx 分母），阈值改设 **25/20/25/25**（防倒退棘轮）；docs/06 的 50/40/45/50 声明同步订正。
- **dotenv-safe 缺键疑点解除（不阻断启动）**：`server/index.js:95-102` try/catch 回退；`dotenv-safe@8` 内部**先** `dotenv.config()` 载入 `.env` **再**比对 example 键，抛错时 env 已加载，catch 里的 `dotenv.config()` 为 no-op → 启动永不失败。仅存量 `.env` 缺 `LOG_LEVEL`/`SECURITY_SILENCE` 时每次启动多一条 error 日志误报噪音（本地 `.env` 已补键，无噪音）。

## 其余核验摘要

- P0-1/P0-4/P1-1~P1-6/P1-8/P1-10~P1-20/P2-1~P2-36/P3 其余：复核 agent 判定 ✅ 属实（修复代码在位、测试计数可复现、探测手段复测通过）。
- **修复提交状态**：全部 84 项修复**仍未提交**（HEAD 停在 `a5d5d4f`，85 files +3819/−9956 在工作区/暂存区）；`release.yml`、`admin-staging-sync.test.js`、`design-demos/*.html` 等删除均为未暂存 D，提交后方从 `git ls-files` 消失——属正常未提交状态，非缺陷。
- 已知注记偏差维持原判：P2-7 limit 回退非 400、P2-33 单 runner、P2-9 单行 CRUD 未入队、P2-10 appendFileSync、P2-13 backup 按 cwd、SIGTERM Windows 无法本地实测。
