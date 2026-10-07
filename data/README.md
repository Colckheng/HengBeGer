# data/ —— 三大块资料层

HengBeGer 数据管线的权威资料层。上游设计：`docs/plans/2026-10-06-data-pipeline-design.md`；实施计划：`docs/plans/2026-10-06-data-pipeline-implementation.md`。

## 目录结构（19 类）

```
data/
├── zzz/            代理人 agents / 音擎 sound_engines / 驱动盘 drive_disks /
│                   邦布 bangboo / 敌人 enemies / 卡池 gacha / 伤害公式 formula
├── hsr/            角色 characters / 光锥 light_cones / 遗器 relics /
│                   敌对物种 enemies / 卡池 gacha / 伤害公式 formula
├── currency/
│   ├── season1/    roles / traits / items / strategies / environments（零和博弈）
│   └── season2/    同上（预载入画奇航，两赛季互不干涉）
├── images/         zzz / hsr / currency（不入 git，AD-4）
└── README.md       本文件
```

时装并入角色/代理人详情（AD-6 之前的决策见设计文档 AD 表）；卡池只要历史时间表；内鬼内容不打标记（AD-6）。

## md 文件约定（schema v0，M1 阶段由字段矩阵定稿 v1）

- **文件名**：实体类 `{ID}_{名称}.md`（如 `1011_安比.md`）；总表与公式类用中文名（如 `角色图鉴.md`、`伤害计算公式.md`）
- **front-matter**：
  - 必填：`game`（zzz/hsr/currency）、`type`、`tags`、`id`、`name`
  - 来源标记：种子文件为 `source: "nanoka-seed"`；采集器写入时改为实际来源站 + `source_url` + `captured_at`
  - 类型扩展字段按类型各异（特性、属性、评级、数值……），以 M1 字段矩阵为准
- **正文**：一级标题 + Markdown 管道表格（沿 nanoka 风格）
- **`_index.md`**：自动生成的 id/名称/文件名索引，勿手改
- **`state.json`**：类型状态，字段 `type / block / seed_source / seed_version / last_crawled_at / primary_source / counts`

## 门禁（AD-3）

爬虫直接更新 `data/`（git diff 即变更清单）→ 生成 diff 报告 → **用户确认** → 才同步 MySQL（`npm run sync -- --report <id>`，M3 实装；未确认必拒）。

## 版本控制

- `*.md`（含 `_index.md`）、`state.json`、`README.md` 入 git
- `images/` 不入 git（图片以 LONGTEXT 入库，前端不引用 data/ 路径）

## 种子（M0，2026-10-06）

从本地镜像迁入，对账 1815 md + 公式 3 篇：

| 种子源 | data_version | 覆盖 |
|---|---|---|
| `D:\github\zzz.nanoka.cc` | 3.3.4+19304006（checked 2026-10-01） | zzz 六类实体 |
| `D:\github\hsr.nanoka.cc` | 4.6.51（checked 2026-10-01） | hsr 四类实体 + currency 两赛季 |

镜像为一次性种子，用完退役（AD-7）；后续更新走 M2 采集器。伤害公式种子：HSR = 灰机两页（CC BY-SA 4.0）；ZZZ = 《数据机制导论 2.0》（17173 转载米游社/NGA 原文）。
