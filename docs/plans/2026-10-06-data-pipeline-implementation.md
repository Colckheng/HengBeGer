# 实施计划：三大块数据管线（细化任务清单）

- 日期：2026-10-06
- 上游设计：`docs/plans/2026-10-06-data-pipeline-design.md`（已获批）；数据源摸底：`docs/17`
- 状态：待用户批准后按 M0 → M1 → M2/M3 → M4 → M5 执行
- 说明：`writing-plans` skill 本地不可用，本文按其标准手写（任务级、含文件路径/命令/验收/依赖）

---

## 0. 执行总则（每个任务通用）

- 仓库：`D:\github\HengBerGer`（React 19 + Vite 7 + Express 5 + MySQL）
- 验证命令：`npm run lint` / `npm run test:backend`（42）/ `npm run test:frontend`（47）/ `npm run build`
- 代码风格：**不加任何注释**；输出/文档中文
- 凭据约定：数据库密码只保存在本机忽略文件 `.env`（`DB_PASSWORD`），不得硬编码、写入文档/报告或作为命令行参数暴露；连接参数统一从 `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` 读取
- PS 坑：改文件用 edit/write 工具（不要 Get/Set-Content）；复杂 `node -e` 写临时文件到 `C:\Users\hengxing\AppData\Local\Temp\opencode\`；命令前置 `[Console]::OutputEncoding=[Text.Encoding]::UTF8`
- 网络：系统代理 `127.0.0.1:7892`；米游社/GameKee API 已实测免登录（docs/17 §7/§8）
- 门禁（AD-3）：**任何 data/ → DB 的同步，必须凭用户确认后的报告 ID 执行**
- 提交策略：不主动 git commit，等用户明确指示

## 0.1 ⚠ 前置 Gate（开工前用户拍板）

- **G1**：工作区现有 ~107 个未提交变更（85 files 的审计修复批次）。Phase 0 之前是否先单独提交这个批次？（推荐：先提交，形成干净基线）

---

## M0 — 资料层地基（对应 Phase 0）

| ID | 任务 | 关键文件/动作 | 验收 |
|---|---|---|---|
| T0.1 | 建目录骨架 | `data/zzz/`、`data/hsr/`、`data/currency/season1/`、`data/currency/season2/`、`data/images/{zzz,hsr,currency}/` | 目录评审通过 |
| T0.2 | 定 md schema v0 并写 `data/README.md` | front-matter 约定：`id / name / type / source / source_version / updated_at` + 正文 Markdown 管道表格（沿 nanoka 风格）；每类实体一文件，命名 `{ID}_{name}.md`；索引 `data/<block>/<type>/_index.md` | README 评审通过 |
| T0.3 | 种子迁移（AD-7/AD-10） | 从 `D:\github\zzz.nanoka.cc`、`D:\github\hsr.nanoka.cc` 拷 19 类子集到 data/（保留 front-matter，改 `source` 标记；**不拷 raw/**） | 见对账表 T0.5 |
| T0.4 | `state.json` 模板 | 每类目录一个：`{type, seed_source, seed_version, last_crawled_at, primary_source, counts}` | 全部 19 类生成 |
| T0.5 | 种子对账 | 数量核对：ZZZ agents 62 / sound_engines 103 / drive_disks 30 / bangboo 42 / enemies 364（314+50）/ gacha 0（占位）/ formula 0（占位）；HSR characters 99 / light_cones 172 / relics 64 / enemies 664 / gacha 0 / formula 0；currency S1 686 / S2 317（role+item+trait+strategy+environment） | 对账脚本全绿，差额有解释 |
| T0.6 | git 忽略 | `.gitignore` 追加 `data/images/`（AD-4）；md 纳入版本管理 | `git status` 验证 |
| T0.7 | 伤害公式种子 | NGA《数据机制导论 2.0》+ 灰机两页内容整理成 `data/zzz/formula/`、`data/hsr/formula/`（标来源 URL/作者） | 公式页 md 就位 |

- 依赖：G1
- 产出评审：用户过一遍 `data/` 结构和 2~3 个样例 md

## M1 — 字段矩阵 + 主源定稿（对应 Phase 1）

| ID | 任务 | 动作 | 验收 |
|---|---|---|---|
| T1.1 | 主源字段采集 | 对 19 类，每类从主源候选站抓 2~3 个**详情页样本**，提取完整字段清单（网络只读） | 每类字段清单 |
| T1.2 | 字段能力矩阵 | 样本字段 ∪ 种子字段 → `docs/18-field-matrix-2026-10-XX.md`，标注字段来源（哪个站提供） | 文档产出 |
| T1.3 | 主源终稿 | 修订 docs/17 §5 草案为终稿表（19 类 × 主源 × 抽查源 × 图片源）；**货币战争主源=nanoka 网站**，补侦察 BWIKI/米游社/appfeng 栏目当抽查 | 用户签字 |
| T1.4 | md schema v1 | 每类定稿：front-matter 字段 + 正文表格列 = 未来 DB 列 = 表单字段 = 页面展示字段；**时装形态**（倾向 agents/hsr_characters 加 `skins` JSON 段）；卡池表结构（起止日期+up 实体列表） | 用户签字 |
| T1.5 | DB 变更预演 | 按 schema v1 写 DDL 草稿（新表清单），只评审不执行 | DDL 评审 |

- **Gate G2：T1.4 签字前不写任何采集器代码**（schema 单点风险）

## M2 — 采集器（对应 Phase 2）

> 门禁形态（先定）：**爬虫直接更新 `data/`**（git diff 即变更清单）→ 生成报告 `reports/YYYYMMDD-HHMM.md`（新增/修改/删除+字段级变化+抽查异常）→ **停** → 用户确认 → `npm run sync -- --report <id>` 才入库。报告 ID 与 git commit 哈希绑定，防误同步。

| ID | 任务 | 关键文件 | 验收 |
|---|---|---|---|
| T2.1 | 公共底座 | `scripts/crawler/`：fetcher（UA/重试/限速/代理 7892）、schema 校验器（front-matter+表格列比对）、diff 引擎、report 生成器 | 单测（fixture） |
| T2.2 | 米游社采集器 | API：`hoyowiki/zzz/wapi/entry_page`、`sr_wiki/v1/content/info`、`gacha_pool`、`batch_get_list`（docs/17 §7）→ 代理人/角色/卡池等 | 真实样本跑通 |
| T2.3 | BWIKI 采集器 | wiki.biligame.com HTML 解析（角色/音擎/光锥/遗器筛选页、调频、活动） | 真实样本跑通 |
| T2.4 | GameKee 采集器 | `api-cdn.gamekee.com/.../entry/list.json` + `v1/entry/treesByPid` + `v1/content/pageList` | 真实样本跑通 |
| T2.5 | 数据工具站采集器 | zzz.gg、SRS、appfeng、bittopup（卡池历史）HTML 解析；**遵守 robots 红线**（禁 /json/、/api/） | 真实样本跑通 |
| T2.6 | nanoka 网站采集器 | 货币战争 5 类（唯一源）、ZZZ 敌人/Boss、技能曲线补深 | 真实样本跑通 |
| T2.7 | 图片采集器 | 下载到 `data/images/<block>/<entity>/`，md 内记相对路径；多源回退 | 样本图就位 |
| T2.8 | 报告+门禁闭环 | diff 报告生成 → 展示 → `sync --report` 校验确认态 | **未确认时 sync 必须拒绝**（测试断言） |
| T2.9 | 首轮全量爬取 | 19 类全跑一轮 | 报告交用户确认 |

- 依赖：M1 G2；M2.8 是硬性安全点
- 测试：每采集器至少 1 个 fixture 单测；lint/test 全绿

## M3 — 同步层 + DB 改造（对应 Phase 3，与 M2 并行可交错）

| ID | 任务 | 关键文件 | 验收 |
|---|---|---|---|
| T3.1 | DDL 迁移 | 新表：`zzz_enemies`、`zzz_gacha`、`hsr_enemies`、`hsr_gacha`、`formulas`、货币战争 10 表（5 类 × season）；`agents`/`hsr_characters` 加 `skins`（LONGTEXT JSON）——走 `src/db/ensureSchema.js` 幂等模式 | 迁移幂等可重跑 |
| T3.2 | sync 脚本 | `scripts/sync.js`：md → DB（UPSERT by id）、图片读文件 → base64/LONGTEXT 入库（AD-2）、依赖 `--report` 确认态 | 单测 + 干跑 |
| T3.3 | 一致性校验 | `scripts/verify-data.js`：条数对账（data/ vs DB）、字段抽查、孤儿引用 | 全绿 |
| T3.4 | 回归 | 现有 15 表数据不动；42+47 测试 + build | 全绿 |

## M4 — UI 三大块（对应 Phase 4）

| ID | 任务 | 说明 | 验收 |
|---|---|---|---|
| T4.1 | 三块导航 | 路由/顶栏 2→3；货币战争**两赛季独立切换互不干涉** | E2E |
| T4.2 | 新页面 | 敌人图鉴、卡池历史时间表、伤害公式页；角色详情加**时装 tab**；货币战争 5 类列表+详情 | E2E |
| T4.3 | 字段严格按 schema v1 | 展示/表单/校验三侧同源（防 P1-7 复发） | 代码评审 |
| T4.4 | admin 面板 | 三块管理入口 + 报告确认界面（查看 diff 报告 → 确认同步按钮） | 手测 |
| T4.5 | 视觉终审 | Playwright+Edge（channel='msedge'）截图三块 | 用户过目 |

## M5 — skill 一条龙 + 副本（对应 Phase 5）

| ID | 任务 | 说明 | 验收 |
|---|---|---|---|
| T5.1 | skill 编写 | 流程写死：检测更新 → 爬取 → 生成报告 → **等确认** → 同步 → 校验 → 汇报；门禁条款显式文案 | 文档评审 |
| T5.2 | 仓库副本 | 副本放 `HengBerGer/.opencode/skills/data-update/SKILL.md` | 路径可用 |
| T5.3 | 端到端演练 | 用户一句"更新数据"走完整闭环 | 用户验收 |

## 1. 依赖关系与并行

```
G1 → M0 → M1 →(G2)→ M2 ─┐
                 └─────→ M3 ─→ M2.9/M3.2 联调 → M4 → M5
```
- M2 采集器可按站并行开发（米游社/BWIKI/GameKee/工具站/nanoka 五组）
- M3 的 DDL 在 M1.T1.5 评审后即可动工，不必等 M2 全部完成

## 2. 需要用户拍板的决策点

- **G1** 现有审计修复批次何时提交（建议 M0 前）
- **G2** schema v1 签字（M1 末）
- **G3** 首轮全量爬取报告确认（M2.9 末，之后每次更新同此门禁）
- **G4** UI 视觉终审 + 最终提交批次

## 3. 风险提示

- 字段采集依赖主源存活：米游社/GameKee API 属无文档接口，变动时由 T2.1 校验器兜住（失败进报告不静默）
- 货币战争单源（nanoka 网站）：若站点改版，种子 M0 是回退底牌
- appfeng `Disallow /json/`：采集器只解析 HTML 栏目页，代码评审时检查 URL 白名单
