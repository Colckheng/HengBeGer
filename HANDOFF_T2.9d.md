# HengBeGer 数据管线 — T2.9d 交接文档

> 当前进度：T2.9c 已完成并提交 (`99484aa`)  
> 进行中：T2.9d — mihoyo 新类 5 个 target 批量爬取

---

## 1. 目标
批量爬取 5 个新类，补充 **COMMON_KEYS** (`source_url/version/last_crawled_at/source`) 与 **TYPE_RULES** 缺失字段，**保留种子 body**（T2.9b 模式：fm 刷新 + body 保留）。

```
--target zzz-weapon,zzz-equipment,zzz-bangboo,hsr-lightcone,hsr-relic --write
```

二跑必须 **无变更 exit 0**。

---

## 2. 文件清单与状态

| 文件 | 状态 | 说明 |
|------|------|------|
| `scripts/crawler/transformers/hsr-lightcone.js` | ✅ 完成 | 解析 `data-data` JSON：命途/星级/80级三维/技能名 |
| `scripts/crawler/transformers/hsr-relic.js` | ⚠️ **lint 报错** | 未使用 `safeParse`/`findPart`，需清理 |
| `scripts/crawler/transformers/zzz-weapon.js` | ✅ 完成 | 从 `multi_table` 文本提取 基础攻击力/副词条/技能名 |
| `scripts/crawler/transformers/zzz-equipment.js` | ✅ 完成 | 仅取 `grade`(稀有度)，drive disks 全空 `grade=""` |
| `scripts/crawler/transformers/zzz-bangboo.js` | ✅ 完成 | `material_base_info.grade` + `role_ascension` 初始四维 |
| `scripts/crawl-mihoyo.js` | ✅ 已改 | 新增 5 TARGETS，crawlOne 分发 7 种 transform，usage 更新 |
| `scripts/crawler/batch-assign.js` | ✅ 通用 | 供所有 target 复用（链接优先 + 名层 + filters 加权） |

---

## 3. 必须先修复的 lint 错误

```bash
npx eslint --no-cache scripts/crawler/transformers/
```

**hsr-relic.js** 两个错误：
- `safeParse` 定义未使用 → **删除**（decodeDataData 内联 JSON.parse 即可）
- `findPart` 定义未使用 → **删除**（改用 inline filter：`decoded.filter(n => (n.tmplKey||n.tmk)==='heritage' && n.partKey==='main')`）

> 其余 transformer 均已修复 `_listItem` 未使用参数。

---

## 4. 关键数据源侦察结果

| 类型 | channel | API条数 | 本地文件 | 关键字段来源 |
|------|---------|---------|----------|--------------|
| **sound_engines** (音擎) | zzz/weapon (45) | 100 | 103 + _index | channel filters{稀有度,特性} + `multi_table` 文本解析 |
| **drive_disks** (驱动盘) | zzz/equipment (46) | 30 | 30 + _index | 无 filters，`grade=""` 空，**稀有度缺口** |
| **bangboo** (邦布) | zzz/bangboo (44) | 41 | 42 + _index | `grade=S` + `role_ascension` 初始四维 |
| **light_cones** (光锥) | hsr/lightcone (19) | 170 | 172 + _index | `data-data` JSON：`career`/`rate`/`material[80级]`/`skill` |
| **relics** (遗器) | hsr/relic (30) | 62 | 64 + _index | `data-data` heritage：套装名称/获取途径/套装效果；类型从 filters `套装种类` |

> **驱动盘稀有度缺口**：seed 无、mihoyo `grade=""` 全空、channel filters 空。TYPE_RULES 要求 `稀有度`。  
> 方案：先跑，若 `validateResults` 报错再补默认值（如 `"A"` 或留空让 mergeFm 保留 seed——seed 也无）。

---

## 5. 种子目录现状 (data/)

```
zzz/sound_engines/   103 实体 + _index.md   (source: nanoka-seed)
zzz/drive_disks/     30  实体 + _index.md
zzz/bangboo/         42  实体 + _index.md
hsr/light_cones/     172 实体 + _index.md
hsr/relics/          64  实体 + _index.md
```

全部缺 `source_url/version/last_crawled_at`（仅 `source: "nanoka-seed"` + body 内 `> 页面来源 <...>` 行）。

---

## 6. 核心设计已落地（不动）

- **统一分配器** `batch-assign.js`：  
  链接优先(10000) → exact(1000) → prefix(800) → contains(600) + filters 加分(50/匹配键)  
  贪心唯一认领，孤儿仅打印提示 `提示: ... N 个本地文件未被源条目匹配（保持不动）` 不计异常
- **单/批模式统一**：`crawlCharacter` 先 `resolveBatchDir` 再按 `assignments` 取 `existingPath` 传给 `crawlOne`；单条模式同理
- **body 保留**：所有 transformer 返回 `sections: []` → `mergeBodies(preamble, [], oldBody)` 仅替换 preamble，正文节原样保留
- **COMMON_KEYS 补全**：所有 transformer 写入 `source: 'mihoyo-api'`, `source_url`, `version`, `last_crawled_at`

---

## 7. 执行步骤

```bash
# 1. 修复 hsr-relic.js lint
# 2. 全量 lint + 单测
npx eslint --no-cache scripts/crawler/transformers/ scripts/crawl-mihoyo.js
npx jest server/__tests__/crawler-mihoyo.test.js server/__tests__/crawler-batch-assign.test.js

# 3. 预览跑（不写盘，验证匹配与字段）
node scripts/crawl-mihoyo.js --target zzz-weapon,zzz-equipment,zzz-bangboo,hsr-lightcone,hsr-relic

# 4. 全量写盘（约 403 条目，5-8 分钟）
node scripts/crawl-mihoyo.js --target zzz-weapon,zzz-equipment,zzz-bangboo,hsr-lightcone,hsr-relic --write

# 5. 二跑验证幂等（必须出现）
node scripts/crawl-mihoyo.js --target zzz-weapon,zzz-equipment,zzz-bangboo,hsr-lightcone,hsr-relic --write
# 期望输出：无变更（data/ 与源一致） exit 0

# 6. 门禁全跑
npx eslint . && npx jest && npx vitest run

# 7. 提交 T2.9d
git add -A
git commit -m "feat(crawler): M2 T2.9d mihoyo 新类 5 target 全量——zzz-weapon/equipment/bangboo + hsr-lightcone/relic 批量 fm 刷新+body 保留、source_url/version/last_crawled_at 补全、确定性分配复用、无变更幂等; 报告 <id> 挂起待 G3; +N 单测"
```

---

## 8. 相关文档

- 计划总纲：`docs/plans/2026-10-06-data-pipeline-implementation.md`（T2.9 行 68-80）
- 字段矩阵：`docs/18-field-matrix-2026-10-06.md` §1（19 类主源表、v1 必填键 `source_url/version/last_crawled_at`）
- T2.9c 侦察细节：本次对话上下文（channel 尺寸、重名消歧、claim 冲突、分配器设计）

---

## 9. 继续对话建议开场白

> "接手 T2.9d：先修 `hsr-relic.js` lint，再全量 lint 通过，跑新 5 类预览→写盘→二跑幂等→门禁→提交。驱动盘稀有度缺口可暂不填（seed/mihoyo 均无），若 validate 报错再补默认值。"

---

*文档生成时间：2026-10-07*  
*当前分支：main | 最近提交：`99484aa` (T2.9c)*