# 18. 字段能力矩阵与主源终稿（M1 产出，G2 签字件）

- **状态**：✅ G2 已签字（2026-10-06，六项全过：主源调整 a+b / 拆条目 / 时装独立表 / 卡池仅历史 / DB 形态 / schema v1 键集）
- **日期**：2026-10-06
- **输入**：`docs/17` 摸底、实施计划 M1、4 路字段采样（米游社 API / BWIKI / appfeng·zzz.gg·SRS·bittopup / GameKee·货币战争侦察）、`data/` 种子 front-matter 统计
- **关系**：签完本件 → schema v1 生效 → M2 端点验证与迭代计划 → M3 采集器

---

## 1. 主源分配终稿（19 类）

| # | 数据类 | 主源（采集主链） | 补充/抽查源 | 种子基线 |
|---|---|---|---|---|
| 1 | ZZZ 代理人 | **米游社 API**（`entry_page` channel 43，62 条） | BWIKI、zzz.gg、GameKee | nanoka 62 |
| 2 | ZZZ 音擎 | **米游社 API**（channel 45，100 条） | BWIKI、zzz.gg、GameKee | nanoka 103 |
| 3 | ZZZ 驱动盘 | **米游社 API**（channel 46，30 条） | BWIKI、GameKee | nanoka 30 |
| 4 | ZZZ 邦布 | **米游社 API**（channel 44，41 条） | BWIKI、GameKee | nanoka 42 |
| 5 | ZZZ 敌人/Boss | **nanoka 网站**（六维抗性矩阵独家） | 米游社 API（channel 65，225 条情报/版本） | nanoka 364 |
| 6 | ZZZ 卡池（调频） | **米游社 API**（`zzz_wiki/v1/gacha_pool` 实测 200） | BWIKI 调频一览（期数/概率/保底机制）、bittopup 历史 | 无 |
| 7 | ZZZ 伤害公式 | **17173/NGA《数据机制导论 2.0》**（静态收录） | 米游社百科互验 | 已收录 |
| 8 | HSR 角色 | **米游社 API**（`content/info` channel 18，99 条，结构化最深） | appfeng（属性排行/累计材料/配队使用率/推荐配置独家）、BWIKI、SRS | nanoka 99 |
| 9 | HSR 光锥 | **米游社 API**（channel 19，170 条） | appfeng（精炼 1-5/累计材料）、BWIKI | nanoka 172 |
| 10 | HSR 遗器 | **米游社 API**（channel 30，62 条） | appfeng（主属性/副词条取值范围独家）、BWIKI | nanoka 64 |
| 11 | HSR 敌对物种 | **appfeng**（血量乘区计算式/状态抵抗独家，295 条） | nanoka（664 条基线）、米游社 API（226 条招式表）、BWIKI | nanoka 664 |
| 12 | HSR 卡池（跃迁） | **bittopup 全版本历史**（含未来场次独家） | 米游社 `gacha_pool` API、BWIKI 历史跃迁 | 无 |
| 13 | HSR 伤害公式 | **灰机两页**（独家，种子已收） | — | 已收录 |
| 14 | 货币战争·角色 | **nanoka 网站**（唯一源） | BWIKI `/sr/角色一览（货币）` | S1 75 / S2 64 |
| 15 | 货币战争·物品 | **nanoka 网站** | BWIKI `/sr/装备一览` | S1 160 / S2 109 |
| 16 | 货币战争·羁绊 | **nanoka 网站** | BWIKI `/sr/羁绊一览` | S1 33 / S2 33 |
| 17 | 货币战争·投资策略 | **nanoka 网站** | BWIKI `/sr/投资策略一览` | S1 334 / S2 79 |
| 18 | 货币战争·投资环境 | **nanoka 网站** | BWIKI `/sr/投资环境一览` | S1 84 / S2 32 |
| 19 | 货币战争·（S1/S2 双赛季互不干涉，无跨赛季类） | — | — | — |

图片（跨 19 类，AD-4）：**主源 yatta.moe / SRS·bittopup CDN（官方素材归档）+ BWIKI 画廊**，zzz.gg 补充；`data/images/` 落盘，DB 侧按 AD-2。

- 货币战争抽查源侦察结论：**BWIKI 5/5 栏目全覆盖**（`/sr/货币战争` 及子页实测 200，2026-07-11 更新）；米游社仅有 1 篇玩法说明（无图鉴）；appfeng 无栏目。主源仍为 nanoka（唯一图鉴级），BWIKI 当抽查。
- 独有内容自动固定采集：appfeng 属性排行/使用率、SRS 行迹小节点/书架、HoneyHunter Beta 双轨（过盾未解，暂缓，Wayback 兜底）。

## 2. 采样关键发现（采集器实现直接输入）

**米游社 API 端点定稿（2026-10-06 实测）**
| 用途 | 端点 | 状态 |
|---|---|---|
| ZZZ 详情 | `act-api-takumi-static.mihoyo.com/hoyowiki/zzz/wapi/entry_page?app_sn=zzz_wiki&entry_page_id={id}&lang=zh-cn` | 200 |
| ZZZ 批量 | 同域 `/wapi/entry_pages?str_entry_page_ids={ids}` | 200 |
| HSR 详情 | 同域 `common/blackboard/sr_wiki/v1/content/info?app_sn=sr_wiki&content_id={id}` | 200（1.16MB 全文） |
| HSR 批量 | `.../sr_wiki/v1/content/batch_get_list?app_sn=sr_wiki&content_ids={ids}` | 200 |
| **分类清单主入口** | `.../{zzz\|sr}_wiki/.../home/content/list?channel_id={id}`（缺 id 返回 retcode -2005） | 200 |
| 卡池 | `.../common/blackboard/{zzz\|sr}_wiki/v1/gacha_pool` | 200 |
| ZZZ 导航/搜索 | `hoyowiki/zzz/wapi/home/*`、`/wapi/search` | 404/403（弃） |
| HSR navbar | `common/blackboard/sr_wiki/v1/home/index/navbar` | 200（6 条筛选入口） |

- channel：ZZZ 43 代理人 / 44 邦布 / 45 音擎 / 46 驱动盘 / 47 材料 / 65 敌人；HSR 18 角色 / 19 光锥 / 23 敌对物种 / 30 遗器 / 20 养成材料；卡池不走 channel。
- ZZZ 详情只能 `entry_page`（`sr_wiki content/info` 对 ZZZ 返回 -2010）；HSR 详情只能 `content/info`（`rpg_new_tmp_content` 结构化，光锥/遗器为 `contents[0].text` 内嵌 URL 编码 JSON）。
- 仅需浏览器 UA，无 Cookie；robots.txt 两站 404。
- `gacha_pool` **不含概率/保底**（仅 title/时间/pool 条目/活动链接）；概率机制取 BWIKI「调频机制/保底机制」章节（不入库，见 §7-4）。

**各站抓取规则**
- **BWIKI**：EdgeOne 防护——浏览器 UA + Accept-Language + Referer，间隔 ≥8s；>3~5 次/分钟触发 567，退避 30~300s 恢复；`api.php?parse` 可用。
- **GameKee**：`game-id: 50270` header 是硬钥匙（缺则 403）；CDN `api-cdn.gamekee.com/wiki2.0/pro/50270/entry/list.json` 需 `Referer: https://www.gamekee.com/`（带 www，否则 EdgeOne 567）；详情正文 `www.gamekee.com/v1/content/detail/{content_id}` 的 `content_json`（`content` 字段恒空）；`pageList` 是攻略帖子流非图鉴。**音擎/驱动盘详情仅单块信息框，字段浅 → 降为图片/参考源，不作数值主源**。
- **appfeng**（sr.appfeng.com）：全部 200，SSR 直出；robots Disallow `/json/` `/api/` → 只走 HTML 栏目/详情页。
- **SRS**：200，SSR；`/cn/books` 177KB 截断需子页。
- **bittopup**：200；robots Allow `/` + Disallow `/api/` + 显式 Allow AI。

## 3. 字段矩阵 → schema v1（每类字段清单）

**原则**：四层统一——md front-matter = DB 列 = 表单字段 = 详情页筛选/展示字段；深块（技能倍率表、成长表、材料表、故事/语音）以正文表格存 md、以 JSON 列存 DB，避免宽表爆炸。

### 3.0 通用 front-matter（全部 19 类必填）

```yaml
game: zzz | hsr | currency
type: {类型标识}
id: 源站 ID
name: 名称
tags: [筛选标签...]
source: 采集源标识
source_url: 详情页/API URL
version: 数据版本
last_crawled_at: ISO 时间
image: 图片文件名（data/images/ 下相对路径）
```

### 3.1 各类专有字段（★ = 种子已有沿用，+ = schema v1 新增）

**ZZZ 代理人**：★特性/属性/攻击方式/阵营/评级/星级/生命值/攻击力/防御力/冲击力 + 实装日期、常驻限定、CV（中日韩英）、生日、身高、影画 6 条（正文表）、技能 6 页签 × Lv1-16 倍率（正文表）、突破材料（正文表）、信赖奖励、角色故事/语音（正文）
**ZZZ 音擎**：★特性/稀有度/星级/基础攻击力 + 副词条类型、副词条数值、技能名、技能效果、突破表（正文）、推荐代理人、故事（正文）
**ZZZ 驱动盘**：★tags + 两件套/四件套效果（正文表）、六盘位数值（正文表）、实装版本、获取途径、盘面故事（正文）
**ZZZ 邦布**：★稀有度/星级/生命值/攻击力/防御力/冲击力 + 技能 3 组、突破成长表（正文）、推荐搭配、台词（正文）
**ZZZ 敌人**：★阵营/评级/生命值/攻击力/防御力/冲击力/弱点/抗性 + 分类（小怪/精英/Boss）、情报（正文）、掉落素材、实装版本、相关任务
**ZZZ 卡池**：pool_id、频段名、起止时间、版本、期数、UP 条目（type=代理人/音擎、level=S/A、content_id、icon）、活动链接 —— 概率/保底不入库
**HSR 角色**：★命途/属性/星级/阵营（48/99）/基础生命值/攻击力/防御力/速度 + 实装日期/版本、限定标记、CV、能量上限、行迹（正文，Lv1-5 表）、星魂（正文）、角色故事/语音/画廊（正文）、**补充源字段：属性排行、1→80 累计材料、配队使用率、推荐配置（JSON 列）**
**HSR 光锥**：★命途/星级/基础三维 + 技能名、精炼 1-5 效果、成长表（正文）、晋阶材料（正文）、实装版本、卡池信息、故事（正文）
**HSR 遗器**：★类型 + 2/4 件套效果、六部位名称/描述/故事（正文）、获取途径、实装版本、**补充源字段：主属性成长 + 副词条取值范围（JSON 列，appfeng 独家）**
**HSR 敌对物种**：★阵营/评级/生命值/攻击力/防御力/速度/弱点 + 类型（小怪/精英/Boss）、区域、抗性（8 系）、状态抵抗、韧性、血量档位、召唤物、技能分阶段（正文）、**补充源字段：血量乘区计算式（JSON 列，appfeng 独家）**
**HSR 卡池**：pool_id、跃迁名、起止时间、版本、上/下半场、UP 角色/光锥（5/4 星分列）、未来场次标记（bittopup）、活动链接
**货币战争·角色**：★赛季/星阶/星级/站位/特性/治疗护盾 + 成员/费用/技能（正文）
**货币战争·羁绊**：★赛季/成员数 + 类型（阵营/战斗/命运等分组）、效果（正文）
**货币战争·物品**：拟新增拆条目 → front-matter：赛季/类型（装备等）/稀有度/效果（正文）※见 §7-2
**货币战争·投资策略**：拟新增拆条目 → 赛季/类型/适用环境/效果（正文）※见 §7-2
**货币战争·投资环境**：拟新增拆条目 → 赛季/类型/效果（正文）※见 §7-2
**伤害公式（2 类）**：静态文章，front-matter：game/type/标题/来源/作者/收录日期/许可证；不参与 diff 爬取（人工收录）

## 4. DB 表结构草案（T1.5 细化，先定形态）

原则：每类 1 主表；**筛选列进列、深块进 JSON 列、详情页渲染 md 正文**（`md_path` 关联 `data/` 文件，diff 报告驱动同步）。

- 通用列：`id BIGINT PK, game, type, name, alias, tags JSON, source, source_url, version, status, first_seen_at, updated_at, md_path, image LONGTEXT(AD-2), raw_json JSON`
- 专有筛选列：§3.1 中 ★/+ 标记的标量字段各表落列
- 深块 JSON 列：`skills_json, growth_json, materials_json, story_json, extra_json`（各表按需）
- 新表：`gacha_pools`（pool_id, game, title, start_time, end_time, version, half, pool_json, source_url）——历史表形态，AD-5；`character_skins`（时装 1:N，§7-3）；`reference_articles`（伤害公式静态文章）；`currency_*` 5 表带 `season` 列（S1/S2 互不干涉）
- 现有 15 表与新表关系：M3 迁移时并入 `ensureSchema.js` 幂等模式，旧表结构差异在 T1.5 DDL 评审时逐列对账

## 5. md 规范 v1（相对 v0 变更）

- front-matter 必填键集 = §3.0（v0 缺 `source_url/version/last_crawled_at/image`，v1 补齐）
- `state.json` 新增 `schema_version: 1`、`primary_source`（M0 已有）
- 文件名 `{ID}_{名称}.md` 不变；正文表格沿用 nanoka 风格；货币战争总表拆条目后与 19 类同构
- 门禁报告与 `sync` 流程不变（AD-3）

## 6. M2 预告（G2 签字后执行）

- T2.1 端点验证迭代：按 §2 规则写一次性验证脚本（不落采集器），确认 channel 清单→详情→卡池全链路
- T2.2 迭代计划文档 `docs/20`（仍需你确认后才进 M3 采集器编码）

## 7. G2 签字清单（请逐项确认）

1. **主源分配终稿 §1**：19 类主源/抽查源/图片源。特别确认两处相对草案的调整：
   - (a) HSR 角色/光锥/遗器 主源由草案「appfeng+BWIKI」改为「**米游社 API 主源**（结构化 JSON 免登录、批量可拿）+ **appfeng 深字段补充**（排行/使用率/副词条独家）」；
   - (b) ZZZ 五类主源由草案「BWIKI+zzz.gg」改为「**米游社 API 主源**（字段已含技能倍率/影画/突破材料，且免登录结构化）+ BWIKI/zzz.gg 抽查」。
2. **货币战争 items/strategies/environments 拆条目**：现状为总表单文件（S1 共 578 行/S2 共 220 行）。建议拆成与 roles/traits 同构的单条 md（约 798 个新文件），否则这 3 类无法进统一 diff/同步流。**拆 or 不拆？**
3. **时装形态**：建议独立 `character_skins` 表（角色 1:N：名称/实装版本/来源/图片），md 中作为角色正文章节。**同意独立表？**
4. **卡池范围**：只存历史字段（时间/UP/版本），概率与保底机制说明**不入库**（BD 仅文章页展示）。**同意？**
5. **DB 存储形态**：筛选列 + 深块 JSON 列 + md 正文四层统一（§4）。**同意？**
6. **schema v1 front-matter 键集**（§3.0 + 各类专有）。**同意？**

---
*签字方式：回复本件编号结论（如「7-1a/1b/2拆/3同意…」），即视为 G2 通过，随后提交 M1 成果 commit。*
