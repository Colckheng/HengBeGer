# 首轮采集覆盖对账（2026-10-08）

> 后续状态：T2.9f 已补充敌人形态和图片；本文的覆盖数量与树哈希为历史基线，最新状态见 [T2.9f 对账](21-data-completion-2026-10-08.md)。

报告：20261008-1450；data 树 SHA256：bc69db8e2f60133edaa144512e9cae76fd4caccd670151129002d3d130e8ad5a。

23 个物理目录共 2679 个非 _index.md 文档，其中 4 个货币战争图鉴总览，实际实体/阶段/静态文章记录共 2675。下表文件数沿用 state.counts.files 的现有口径，全部与磁盘一致。卡池的阶段汇总和官方活动是不同粒度，不能相加当作独立活动数量。

| 目录 | 文档数 | 来源与数量 | state 文件计数 |
| --- | ---: | --- | --- |
| currency/season1/environments | 84 | nanoka: 84 | 一致 |
| currency/season1/items | 160 | nanoka: 160 | 一致 |
| currency/season1/roles | 76 | nanoka: 75 / 索引文章: 1 | 一致 |
| currency/season1/strategies | 334 | nanoka: 334 | 一致 |
| currency/season1/traits | 34 | nanoka: 33 / 索引文章: 1 | 一致 |
| currency/season2/environments | 32 | nanoka: 32 | 一致 |
| currency/season2/items | 109 | nanoka: 109 | 一致 |
| currency/season2/roles | 65 | nanoka: 64 / 索引文章: 1 | 一致 |
| currency/season2/strategies | 79 | nanoka: 79 | 一致 |
| currency/season2/traits | 34 | nanoka: 33 / 索引文章: 1 | 一致 |
| hsr/characters | 99 | mihoyo-api: 99 | 一致 |
| hsr/enemies | 664 | appfeng: 295 / nanoka-seed: 369 | 一致 |
| hsr/formula | 2 | starrail.huijiwiki.com: 2 | 一致 |
| hsr/gacha | 65 | mihoyo-api: 3 / bittopup: 62 | 一致 |
| hsr/light_cones | 172 | mihoyo-api: 170 / nanoka-seed: 2 | 一致 |
| hsr/relics | 64 | mihoyo-api: 62 / nanoka-seed: 2 | 一致 |
| zzz/agents | 62 | mihoyo-api: 62 | 一致 |
| zzz/bangboo | 42 | mihoyo-api: 41 / nanoka-seed: 1 | 一致 |
| zzz/drive_disks | 30 | mihoyo-api: 30 | 一致 |
| zzz/enemies | 364 | nanoka: 364 | 一致 |
| zzz/formula | 1 | news.17173.com: 1 | 一致 |
| zzz/gacha | 4 | mihoyo-api: 4 | 一致 |
| zzz/sound_engines | 103 | mihoyo-api: 100 / nanoka-seed: 3 | 一致 |

## 保留范围与限制

- HSR 敌人：295 主源已刷新，369 种子未被主源列表覆盖。ZZZ 音擎/邦布、HSR 光锥/遗器合计另有 8 个种子孤儿。未删除也未声明全部被主源验证。
- HSR 卡池：31 版本、62 阶段，另有 3 个官方活动；1 个未来阶段，3 个阶段使用文本日期，1 个官方活动版本仍未知。
- 三篇公式为人工静态收录，last_crawled_at 为空符合既定范围，不能按漏爬处理。
- 四篇货币战争图鉴总览没有实体 front-matter，属于索引文章；M3 导入应跳过总览而非补造实体数据。
- T2.9d 的 23 个字段警告与 T2.9e 的 24 个记录警告均待审核；本表表示覆盖和计数一致，不表示所有字段已补齐。
- 当前未确认报告、未入库、未提交；数据库迁移、UPSERT、图片与一致性校验仍属 M3。
