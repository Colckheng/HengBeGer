# 资料库导入与网页链路（T2.9g）

> 当前状态（T2.9h）：用户已确认报告 20261008-1649，已导入本机正式库 hengbeger：2675 条资料、1710 份去重图片。全量内容和图片哈希校验通过，原 15 张表未变化，重复同步零写入。正式入口 http://127.0.0.1:3001/catalog；`npm run server:existing` 可跳过初始化启动现有库。备份和详细证据见 [T2.9h 交接](./handoff/t2.9h-handoff.md)。下文未确认/未导入描述为先前开发经过。

> 后续更新：已核实原 D:/github/HengBerGer/.env 的密码有效，当前工作树密码与之不同；仅同步工作树 DB_PASSWORD 后连接恢复。正式库只读预览为新增 2675、更新 0、冲突 0、图片 1710，计划文件 .cache/t29g/production-preview-credential-fixed.json。尚未确认报告或执行正式库写入。下文认证失败描述保留为历史经过。

2026-10-08。本轮实现并在隔离 MySQL 8 实测 `data → MySQL → /api/catalog → /catalog`。原业务库未写入：当前工作树 .env 认证失败。测试库只监听 127.0.0.1:13316，库名 hbg_t29g_test，网页预览 http://localhost:13317/catalog。

## 结构与边界

新增 catalog_entries 与 catalog_assets，两张 InnoDB 表与原 Wiki 表并存。资料按“目录分类 + 原始 ID”稳定识别，来源变化不会创建第二份，S1/S2 同 ID 不会互相覆盖。JSON payload 保存全部 front-matter、原文、来源核验和数据质量说明；content_hash 校验实际内容；类别/名称用于检索。

图片以 SHA256 去重，LONGTEXT 保存 data URL。2518 个本地图片引用对应 1710 份不同字节内容；去重不丢记录。API 从数据库返回图片，不依赖部署服务器上的 data/images 路径。

本轮统一接入表用于保留现有完整资料并提供可验证的发布链路；不是 docs/19 分表草稿的完整实施。独立时装表、按类型设计查询列、旧 Wiki/旧后台全面迁移仍待推进。旧 `/zzz-wiki`、`/hsr-wiki` 与内容后台仍读取原表；新资料从首页“完整资料库”或工具栏“资料库”进入。新入口提供分类、搜索、分页、详情和来源，没有添加新的后台写接口。

## 数据收尾

- 8 件备用源装备补入属性核验附录：两件光锥 Lv80 原始计算和取整对照、叠影效果；三件音擎基础/成长参数与精炼效果；两套遗器部位与套装效果；伊埃斯基础参数。
- 伊埃斯来源没有等级表/技能等级，原满级生命、攻击、防御仍不能确认；音擎未推断来源没有明确说明的满级取整公式。原 source=nanoka-seed 与原正文保留，不能宣称全部主源缺口已消除。
- 85 个缺图再次尝试已知备用快照地址后，新增 0。74 个敌人当前主源 404、18 套驱动盘稀有度缺口与历史时间问题继续保留。
- 新脚本 `node scripts/crawl-equipment-checks.js` 默认预演，加 --write 落盘。实际联网二跑 updated=0、checksChanged=false。

## 操作流程

最新汇总报告为 `reports/20261008-1649.md（该报告只存在于当时的隔离 review 目录，未入库）` / `.json`，当前未确认。树哈希：

`be42e72d6b2abb487e0d6e342e2bfaa788b7cad24c3dae9a13e3006c9eb8d29c`

报告从 T2.9e 完成时的基线累计对账，覆盖 T2.9f/g 的完整数据修改：新增 2、修改 2517、删除 0。T2.9g 相对 f 的实际数据变化为 8 个装备文件及 source-checks.json。

无数据库时可离线检查全部输入：

```powershell
node scripts/sync.js --report 20261008-1649 --preview --offline --output .cache/catalog-offline.json
```

离线“新增”是相对空集合的潜在导入数，不能当作真实数据库差异，也不能用于 --apply。

实际数据库参数来自当前工作树 .env 的 DB_HOST、DB_PORT、DB_NAME、DB_USER、DB_PASSWORD。修正认证后先执行只读预览：

```powershell
node scripts/sync.js --report 20261008-1649 --preview --output .cache/catalog-plan.json
```

完整计划保存每类新增/更新/保留/冲突的键列表、来源树哈希、数据库实例 UUID/库名和数据库导入前哈希。终端仅输出汇总数量。输出文件已存在会拒绝覆盖，请换文件名，保留审阅证据。

用户确认该具体报告和目标变更后：

```powershell
node scripts/sync.js --report 20261008-1649 --confirm
node scripts/sync.js --report 20261008-1649 --apply --plan .cache/catalog-plan.json
```

--confirm 只确认当前树匹配的报告；不写数据库。报告、图片或数据库变化均需重新预览/确认相应结果。曾经允许采集不替代具体报告确认；已有确认无需重复询问。

## 导入保护和回滚

- 预览没有建表或写库副作用。apply 首次仅创建两张新表，不 alter/drop 旧表。
- 实例与库名必须匹配计划；同库导入有 GET_LOCK；事务读取当前行并核对预览哈希。
- 实际 payload、名称、类别被手动修改却未同步哈希时，作为冲突拒绝导入。
- 缺少本地记录的已有数据库行列为 retained，不自动删除。改动仅 upsert 新增/更新；无变更不更新时间、不生成新备份。
- 导入前保存带校验和的 JSON 备份；图片和记录在同一事务中写入，提交前重新核对本地树、图片、报告及数据库全部 payload。
- 建表 DDL 属于 MySQL 隐式提交，首次失败可能留下空的新表。事务故障会回滚本轮数据写入，不删除已有表。

```powershell
node scripts/sync.js --rollback db-backups/catalog-实际备份文件名.json
```

回滚仅适用于相同实例/库、且数据库仍匹配该次导入后状态。回滚恢复资料行，保留不可变图片缓存供后续复用；不会改动旧业务表。JSON 备份不包含图片字节，也不包含旧表，不能当成全库灾备。迁机需额外备份 catalog_assets 或保留 data/images 与来源清单。

## 验证证据

- 隔离真实 MySQL：全量 2675 条逐条 payload 哈希与 data 编译结果一致；1710 份去重图片入库；重复导入零写入。另从数据库分批读回全部图片，解码并逐个核对 SHA256，共 247813754 字节，全部通过。
- `scripts/verify-catalog-mysql.js` 在空的本地 hbg_*_test 数据库验证：第二条写入注入故障整批回滚、重复运行、旧预览拒绝、数据库被编辑后的回滚拒绝、单条增量更新及显式恢复。该脚本拒绝非本地/非测试名称/非空资料库。
- 后端 32 套 / 307 项测试，前端 17 套 / 50 项测试；lint、生产 build 和 diff 格式检查通过。
- 浏览器使用完整 Express 服务 + 实际测试 MySQL，验证分类计数、搜索、详情、图片与无图情况；检查桌面和 320/390/768 像素窄屏、原始等级口径、浏览器错误。
- 修复原模型对 LONGTEXT image 的不兼容默认值；默认展示图仍由现有 API/初始化数据处理。
- 修复 SPA 深链接在 .codex 工作树目录中被 sendFile 的 dotfile 规则拦截；改为固定 dist root 下的 index.html。

证据当时位于 `.cache/t29g/`（该目录为临时工作区，已清理，仅存档名称）：mysql-tests.log、full-import.json、equipment-write/repeat.json、images.json、backend-final.log、frontend-final.log、targeted-final.log、lint-final.log、build-final.log、catalog-desktop-final.png、detail-mobile-final.png。full-import 的报告确认只存在于 `.cache/t29g/review-root/reports/`，项目报告仍未确认。

## 运行中的测试预览

测试用 MySQL 数据目录为当前工作树 `.cache/t29g/mysql`，与系统 MySQL 服务分开。随机测试凭据在忽略目录 `.cache/t29g/db.json`，不提交、不输出到聊天。完整网页进程是 `node .cache/t29g/serve.mjs`。查看完可按已核实的命令行/数据目录停止这两个测试进程，不停止系统 MySQL80 服务。

skill 的受版本控制副本为 `.agents/skills/hengberger-data/`，本机已安装至 `C:/Users/hengxing/.codex/skills/hengberger-data/`。支持采集、预览、报告确认、事务导入及网页核验；原 nanoka-update 仍用于另一组镜像仓库。
