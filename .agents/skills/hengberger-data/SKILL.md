---
name: hengberger-data
description: 在 HengBerGer 项目中采集游戏资料、核验 data 文件、生成导入预览并同步 MySQL 资料库。用于补数据、更新图鉴、检查来源缺口和验证网页数据链路。
---

# HengBerGer 数据更新

从 HengBerGer 工作树根目录执行命令。先读 `docs/handoff/t2.9h-handoff.md`（最新一轮交接）与 `docs/22-catalog-sync.md`（资料同步说明）；完整交接链在 `docs/handoff/`。资料管线设计与决策记录见 `docs/plans/2026-10-06-data-pipeline-design.md` 与 `docs/plans/2026-10-06-data-pipeline-implementation.md`。确认 package.json 有 crawl 与 sync 入口。

文档与工具位置：文档索引 `docs/README.md`；历史交接链 `docs/handoff/`（最新 t2.9h）；生产实现与数据修复记录 `docs/32-open-index-design-handoff-2026-10-13.md`；skill 受控副本 `.agents/skills/hengberger-data/`。可复现工具：`npm run verify:api`（正式 catalog API 冒烟）、`npm run verify:shots`（CDP 截图与控制台检查）、`npm run demo:data`（重建 Demo 快照）、`npm run open-index:css`（重新生成样式，加 `-- --check` 校验磁盘一致）。

原 nanoka 镜像更新 skill 操作的是另一组仓库（D:\\github\\hsr.nanoka.cc、zzz.nanoka.cc），不替代本项目的采集/导入链路。

## 采集与核验

- 按请求选择现有采集器，默认先预演，检查匹配和异常后以 `--write` 写 data。米游社批量入口见 `scripts/crawl-mihoyo.js --help`；货币战争走 `scripts/crawl-nanoka.js`。ZZZ 另有 `scripts/crawl-bwiki.js`、`scripts/crawl-gamekee.js`、`scripts/crawl-tools.js`。
- 采集器共用模块在 `scripts/crawler/`：`sources/{mihoyo,bwiki,gamekee,zzzgg,appfeng,srs,bittopup,nanoka,image-sources}.js`、`transformers/{gacha,zzz-character,hsr-character,zzz-weapon,hsr-lightcone,hsr-relic,zzz-equipment,zzz-bangboo}.js`、`{fetcher,diff,schema,html,report,compare,writer,enemy-writer,currency-writer,batch-assign,image-batch}.js`。
- 敌人按精确游戏 ID 识别；形态可共享图片，图名不能当形态 ID。主列表未匹配不等于来源没有；检查形态链接和直接详情。直接探测 404 保留种子，网络故障不当作缺失。
- 图片用 `scripts/crawl-images.js`（不是 crawl-images-batch.js）。图片字节需实际下载校验，不能宣称旧快照属性已更新。唯一同名匹配须保留「+」等区分字符。
- 不猜弱点、稀有度或结束日期；缺口记录在报告。保留旧正文、ID、名称、来源及等级口径，不混合 Lv80 与 Lv95 数值。备用源身份核验不能算全属性刷新。

## 已知陷阱：正文章节不会被重爬覆盖

`scripts/crawler/writer.js` 的 `mergeBodies` 只替换「新集合里出现过的标题」对应的章节，其余旧章节原样保留。若某个 transformer 返回 `sections: []`，早期种子写入的正文表**永远不会被任何一次重爬更新**。`splitSections` 也只认 `^## ` 二级标题，因此嵌在 `## ` 下的 `###` 章节（如 hsr/characters 的 `### 80级属性`）既不会被替换、也无法被直接覆盖。

历史后果与已修复实例：hsr/light_cones 的 `## 基础数值（等级 80）` 正文表长期停在 nanoka-seed 旧值（比官方高 1），而 front-matter 已是 mihoyo-api 正确值，共 127 条。2026-10-13 已修复：`scripts/crawler/transformers/hsr-lightcone.js` 改为输出该章节（值取自官方面板 `light/value.data.material` 的 `80级` 行，且对生命/攻击/防御做正数校验，缺失即抛错不写半套），`scripts/crawler/transformers/hsr-shared.js` 提供 `textValue` 归一化以匹配带制表符的真实标签，并新增配套报告异常通道。

规则：**transformer 必须输出它负责的每个 `##` 章节，否则正文会与 front-matter 口径漂移**；发现「正文与摘要不一致」时以官方 wiki 判定哪一侧落后，不要因为「摘要不等于正文」就去改摘要。

数据清理实例：hsr/characters 曾有 97 个文件的 `## 基础数值（等级 80）` 与权威 `### 80级属性` 重复且数值更旧（1002_丹恒 882/547/397 vs 882/546/396），因 `###` 嵌在 `## 晋阶` 下，`mergeBodies` 覆盖不到，只能一次性清理。2026-10-14 已删（本地 97 个 data 文件 + 数据库 97 行，均带备份与守卫）。

例外：`1218_椒丘` 没有 `### 80级属性`，该 `## 基础数值（等级 80）` 是唯一属性表且与 mihoyo-api front-matter 一致，**保留**。清理前必须先确认「权威节存在」，否则会删掉唯一数据源。

删除章节时必须做两项校验：删除后旧标题不存在、权威标题仍在；并逐文件比对 `#{2,3}` 标题集合，确认没有连带丢失其它章节。

官方 wiki 回查方式：取条目 `source_url` 中的 content id，请求 `https://act-api-takumi-static.mihoyo.com/common/blackboard/sr_wiki/v1/content/info?app_sn=sr_wiki&content_id=<id>`，请求头 `x-rpc-wiki_app: sr_wiki`、`Referer: https://baike.mihoyo.com/`，解析 `data-data` 属性后取 `light/value.data.material` 里名为 `80级` 的行。注意官方标签常带尾部制表符（`80级\t`），比较前必须归一化。

两条口径：只有 `80级（未确认）` 行时，官方自身标注未确认——保留种子值并在正文追加说明，把差异写进报告异常，不擅自采用官方未确认值（实例 hsr/light_cones/21003_唯有沉默）。要修复正文旧表时，改 transformer 输出章节让 `mergeBodies` 覆盖，不要逐条手改 data/。

若本机 DNS 无法解析 `act-api-takumi-static.mihoyo.com`（`scripts/crawl-mihoyo.js` 走 axios，会报 `ENOTFOUND undefined`，且项目未配代理），可先用外部抓取把官方响应缓存成 JSON，再用真实 transformer/writer/diff/report 模块离线落盘；落盘必须走 `writeEntityFile` + `validateFile` + 快照 diff，禁止绕过校验直接写文件。

**导入前先比对数据库与本地 data/，不要盲目 sync。** `applyImport` 会把 `compileCatalog(root)` 的全部条目写进 `catalog_entries`；若本地 data/ 比数据库旧（正文更短、缺 `image`/`image_source` 等字段、`last_crawled_at` 更早），一次 sync 就是用旧数据覆盖新数据。判定方法：跑联网 `previewImport` 看 `changes.updated` 的量级——只应等于本次爬虫改动的文件数；若接近全表（如 2613/2675），说明两侧快照不同代，必须改为定向更新而不是整体导入。

定向更新的做法：事务内逐行读 `payload.body`，只替换目标章节（如「## 基础数值（等级 80）」）内的值，重算 `content_hash`，**并设置守卫——必须命中且只命中预期行数**（如恰好 3 行）。首次尝试若用全局正则，会误伤「晋阶材料」等其他表格里的同名字段（`1,058` 被写成 `1`，因为千分位逗号让 `\d+` 只匹配到 1）；从事前备份恢复并逐行字节校验后再重做。同时注意数据库正文可能是 CRLF，正则有 `$` 时要按行处理而不是整篇匹配。

## 导入

1. 使用当前树匹配的变更报告；代码或数据改变后重新核验。图片由 image-manifest.json 的真实文件哈希单独校验。
2. `node scripts/sync.js --report REPORT --preview --offline --output .cache/offline-plan.json` 可在无数据库时查看资料数量；此计划不能执行导入。
3. `node scripts/sync.js --report REPORT --preview --output .cache/import-plan.json` 只读目标数据库，列出新增、更新、保留和冲突。计划绑定数据库实例、库名和导入前状态。
4. 实际库导入沿用项目的具体报告确认规则；用户已经确认该报告时不重复询问。仅批准采集/开发不等于确认尚未展示的实际库变更。确认后执行 `node scripts/sync.js --report REPORT --confirm`，再执行 `node scripts/sync.js --report REPORT --apply --plan .cache/import-plan.json`。隔离测试库可使用单独测试报告，不能把其确认写回实际报告。
5. 失败后读明确错误；认证失败由用户在本机配置 .env，不请求聊天发送密码。数据或数据库变化时重新预览，不绕过旧计划检查。不使用 alter/force 同步旧表。
6. 成功后核对数据库条数和内容、重复预览零变更、访问 `/catalog` 的分类/搜索/详情及图片。抽查缺图、长名称、不同等级、S1/S2；手机和桌面都检查布局及控制台。

事务前备份在 db-backups/catalog-*.json；`node scripts/sync.js --rollback BACKUP` 只在数据库仍等于该次导入结果时恢复，保留内容寻址图片缓存。根据当前授权范围执行回滚。

## 完成记录

报告写清采集数量、缺口、导入目标、实际验证、是否修改正式库。

已完成示例一（2026-10-13，光锥 Lv.80 表修复）：采集 170/170 个官方条目、2 个无匹配孤儿保持不动、1 个官方未确认项保留种子值并写入记录异常；数据层修改 171 个文件、数据库定向更新 160 行（`hsr/light_cones` 的 `## 基础数值（等级 80）` 章节内三个数值），核验 172/172 行正文与 `payload.fields` 一致。因本仓库 `data/` 比数据库旧，未走整体 `applyImport`（否则会用旧数据覆盖 2400+ 行），改为定向更新，备份 `db-backups/catalog-1791947642172-*.json`。

已完成示例二（2026-10-14，角色重复章节清理）：`hsr/characters` 97 个文件的重复旧节 `## 基础数值（等级 80）` 已在本地 data 与数据库双侧删除（`1218_椒丘` 无权威节，保留），备份 `db-backups/catalog-1791950976998-*.json`；测试 fixture 同步为数据库现行正文。

两例过程均写入 `docs/32-open-index-design-handoff-2026-10-13.md`（「修复执行记录（2026-10-13）」与「角色重复章节清理（2026-10-14 执行）」）与本 skill。

图片在 data/images 中被 Git 忽略，数据库内使用去重 LONGTEXT 图片；备份 JSON 不包含图片，恢复到另一台机器需额外备份 catalog_assets 或保留 data/images。新 `/catalog` 使用新资料表，旧 Wiki/后台仍使用旧表，不能宣称旧页面都已迁移。
