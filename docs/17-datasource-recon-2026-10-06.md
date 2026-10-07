# 数据源浅层摸底报告（21 站）

- 日期：2026-10-06
- 方法：4 个并行只读侦察（WebFetch/WebSearch 只读 GET），每站抓首页 + 2~4 个代表栏目页 + robots.txt；nanoka 两站改用本地镜像盘点
- 状态：**浅层摸底完成，待集体分析 → 定优先站 → 字段级深挖**
- 约束回顾：内鬼内容与正式内容一视同仁，展示不打来源标记；优先站不预设，由本报告结果决定

---

## 1. 站点可抓性总览

### ZZZ（10 站）

| # | 站点 | 类型 | 可抓性 | robots.txt | 更新迹象 |
|---|------|------|--------|-----------|---------|
| Z1 | wiki.biligame.com/zzz（BWIKI） | 社区 MediaWiki | **易**（SSR，数据真实） | 抓到 567 自定义码，不影响正文 | 2026-09-22 编辑 |
| Z2 | baike.mihoyo.com/zzz（米游社） | 官方 | **可抓（API 优先）**，WebFetch 只见 SPA 壳，浏览器渲染 + JSON API 实测均通（见 §7） | 404（无限制声明） | 渲染后可见当日更新日志 |
| Z3 | gamekee.com/zzz | 商业百科 | **✅ 可抓（复测翻转）**：浏览器渲染栏目全出（角色/邦布/音擎/驱动盘图鉴+攻略体系），API 现形且 **CDN 静态 JSON 免鉴权直连 200**（§8） | 放行 | 站点当日维护中 |
| Z4 | zenless-zone-zero.fandom.com | Fandom | **Cloudflare JS 盾**：直连 TCP 超时（网络屏蔽），代理(7892)下 403"请稍候"，Edge 自动过盾失败 | 未确认 | 未确认 |
| Z5 | newridu.com（绳网情报站） | 静态粉丝站 | **易**（但内容多为空壳） | 放行 + sitemap | tier 2026-06-02；角色 0、图库"即将上线" |
| Z6 | zzz.gg/zh-hans | 数据工具 | **易**（Markdown 最干净） | 无标准规则（仅 content signals） | 未确认 |
| Z7 | gachia.com/zh/zzz | 多游戏聚合 | **易**（SSR 直出） | Allow /，Disallow /api/，**显式 Allow AI 爬虫** + sitemap | 无版本时间戳 |
| Z8 | chjiya.github.io/zzz-guide | 个人攻略 | **易**（无需代理） | 404（全开放） | 页标 2026-06-04/07 |
| Z9 | zzz.honeyhunterworld.com | 解包/内鬼 | **不通：Cloudflare JS 盾**——curl 全 403（满头浏览器特征也 403），Edge 真实浏览器 45s 过不去，需专门过盾方案 | 403 未确认 | 索引显示 Beta 3.1.3/3.2.1 |
| Z10 | zzz.nanoka.cc（本地镜像） | 解包/内鬼 | **本地已有** | — | 快照 2026-10-01（3.3.4+19304006） |

### HSR（11 站）

| # | 站点 | 类型 | 可抓性 | robots.txt | 更新迹象 |
|---|------|------|--------|-----------|---------|
| H1 | wiki.biligame.com/sr（BWIKI） | 社区 MediaWiki | **易** | 仅常规 Disallow，无全站限制 | **2026-09-28**（最新） |
| H2 | bbs.mihoyo.com/sr/wiki（米游社） | 官方 | **可抓（API 优先）**，同上（见 §7） | 404（无限制声明） | 渲染后可见 1/28 更新日志 |
| H3 | honkai-star-rail.fandom.com | Fandom | **Cloudflare JS 盾**（同 Z4，代理下 403 实测） | 未确认 | 未确认 |
| H4 | starrailstation.com/cn（SRS） | 社区数据站 | **易**（详情页 SSR；warp/achievements 为 JS） | **完全放开** | 已含 4.6 内容 |
| H5 | sr.appfeng.com（星穹智库） | 图鉴+工具 | **易** | 白名单式（列明可抓栏目；**Disallow /json/**，注明其为"全部图鉴数据"） | 版本 4.6.0 标注 + /log |
| H6 | starrail.huijiwiki.com（灰机） | 爱好者 MediaWiki | **易** | 常规 MediaWiki 限制 | **基本停更**（核心页 3 年前） |
| H7 | gamecircum.com | 导航站 | **易** | 常规 | 2026-10 更新，**无自有数据** |
| H8 | wiki.bittopup.com/zh-CN/starrail | 商业 wiki | **易** | Allow /，Disallow /api/，**明确 Allow AI 爬虫** + sitemap | banner 含 2026-10-21 场次 |
| H9 | gachia.com/zh/starrail | 多游戏聚合 | **中**（正文易，工具类 JS） | 同 Z7 | 节奏榜 2026-06-28 |
| H10 | starrail.honeyhunterworld.com | 解包/内鬼 | **不通：Cloudflare JS 盾**（同 Z9，实测） | 403 未确认 | 索引：Live 4.5.54 / Beta 4.6 |
| H11 | hsr.nanoka.cc（本地镜像） | 解包/内鬼 | **本地已有** | — | 抓取 2026-09-30~10-01（4.6.51） |

**可抓性三档（2026-10-06 复测 + 剔除决定）**：
- **主源候选池（易抓有数据）**：BWIKI×2、zzz.gg、SRS、appfeng、bittopup（图鉴/卡池）、chjiya、nanoka×2（本地）、**米游社×2（API 直连 §7）**、**GameKee（渲染+CDN JSON 实测 §8）**
- **已剔除（质量低）**：gachia×2（数值错误）、newridu（空壳）、gamecircum（纯导航）——不再参与任何采集与抽查
- **受限**：灰机（停更，仅伤害公式页作静态参考）、bittopup 新闻栏（韩语停更，剔除该栏、图鉴/卡池保留）、**Fandom×2 + HoneyHunter×2（均为 Cloudflare JS 盾：直连超时/403，代理下同样 403，自动过盾未成功）**

---

## 2. 内容类型矩阵

图例：✅ 有实数据 ｜ △ 有栏目但空/浅/未验证 ｜ ❌ 无 ｜ ❓ 难抓/未确认（间接证据）

### ZZZ

| 内容类型 | Z1 BWIKI | Z2 米游社 | Z3 GameKee | Z4 Fandom | Z5 newridu | Z6 zzz.gg | Z7 gachia | Z8 chjiya | Z9 HHW | Z10 nanoka |
|---|---|---|---|---|---|---|---|---|---|---|
| 角色图鉴+面板 | ✅ 60 名含三维 | ❓ | ❓ | ❓ | △ 0 名 | ✅ | ✅ 30 名 | △ 单角色攻略 | ❓ | ✅ 62 名 |
| 影画/命座 | ❌ | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | ❌ | ❓ | ✅ 含台词 |
| 技能倍率/成长曲线 | ❌ | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ 仅描述 | ❌ | ❓ 有曲线(索引) | ✅ 单档 |
| 突破/育成材料 | △ 筛选覆盖部分 | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | △ 音擎优先级 | ❓ | ✅ 数量+内链 |
| 音擎 | ✅ | ❓ | ❓ | ❓ | ❌ | ✅ 100+ | ✅ 45 | △ 优先级表 | ❓ | ✅ 103 含精炼逐级 |
| 驱动盘（含词条） | ✅ | ❓ | ❓ | ❓ | ❌ | ✅ 件套全文 | ✅ 24 套 | ✅ 优先级 | ❓ | ✅ 30 套+角色页词条 |
| 邦布 | ✅ | ❓ | ❓ | ❓ | ❌ | ✅ | △ | ❌ | ❓ | ✅ 42 |
| 敌人/Boss | ❌ | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | △ Boss 攻略 | ❓ | ✅ 314+50 含抗性矩阵 |
| 素材/道具 | △ | ❓ | ❓ | ❓ | ❌ | ✅ items | △ | ❌ | ❓ | ✅ 5,980 |
| 活动/版本公告 | ✅ | ❓ | ❓ | ❓ | △ | ❌ | △ version 导航 | △ news | ❓ | △ 仅版本 diff |
| 卡池/调频 | ✅ 调频 | ❓ | ❓ | ❓ | ❌ | △ | △ | ❌ | ❓ | ❌ |
| 兑换码 | ❌ | ❓ | ❓ | ❓ | ✅ | ✅ | ✅ | ❌ | ❓ | ❌ |
| 任务剧情/角色文本 | △ 图鉴类杂项 | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | ❌ | ❓ | ✅ 档案/设定/印象 |
| 成就图鉴 | △ | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | ❌ | ❓ | ✅ 21 系列/831 条 |
| 地图/探索 | ❌ | ❓ | ❓ | ❓ | ❌ | ❌ | △ /map 未验证 | ❌ | ❓ | ❌ |
| 攻略/配队/强度榜 | ✅ 含消耗计算器 | ❓ | ❓ | ❓ | ✅ tier | ✅ tier | ✅ tier+配队 | ✅ 深度攻略 | ❓ | △ 仅官方推荐 |
| 伤害计算 | ❌（仅养成计算） | ❓ | ❓ | ❓ | ❌ | ❌ | ❓ JS | ❌ | ❓ | ❌ |
| 未来内容/爆料 | ✅ **未实装专区** | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | ❌ | ✅ Beta(索引) | ❌ |
| 图片素材 | ✅ 画廊 | ❓ | ❓ | ❓ | △ 空 | ✅ | ✅ CDN | ❌ 全站无图 | ❓ Gallery | ❌ **0 图** |
| 零号空洞等玩法子库 | ✅ 鸣徽/侵蚀/武备 | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | ❌ | ❓ | ✅ 卡牌/棱镜/武备 |
| 终局挑战 | ❌ | ❓ | ❓ | ❓ | ❌ | ❌ | ❌ | ❌ | ❓ | ✅ 式舆/危局含波次表 |

### HSR

| 内容类型 | H1 BWIKI | H2 米游社 | H3 Fandom | H4 SRS | H5 appfeng | H6 灰机 | H7 gamecircum | H8 bittopup | H9 gachia | H10 HHW | H11 nanoka |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 角色图鉴+面板 | ✅ 93 | ❓ | ❓ | ✅ 含行迹小节点 | ✅ 98 精确小数 | ❌ | ❌ | ✅ 97 | △ 81 浅 | ❓ | ✅ 99 |
| 星魂 | △ | ❓ | ❓ | ✅ 1-6 全文 | ✅ 图文 | ❌ | ❌ | ❌ | △ 占位文本 | ❓ | ✅ E1-E6 |
| 技能倍率/成长曲线 | ❌ | ❓ | ❓ | ✅ Lv1-6 切换 | ✅ Lv1-10 | ❌ | ❌ | ❌ | ❌ 无倍率 | ❓ | ✅ **Lv1-15 全曲线** |
| 突破/行迹材料 | ✅ 材料速查 | ❓ | ❓ | ✅ 分段+累计 | ✅ 分段+累计 | ❌ | ❌ | ✅ farming | ❌ | ❓ | ✅ |
| 光锥 | ✅ 170 | ❓ | ❓ | ✅ 含逐阶效果 | ✅ 170 | △ 无总表 | ❌ | ✅ | △ 导航有未验证 | ❓ | ✅ 172 |
| 遗器（含词条） | ✅ 62 | ❓ | ❓ | ✅ 62 | ✅ 62 双维筛选 | ❌ | ❌ | ✅ 62 | ⚠ **仅 32 套且有错** | ❓ | ✅ 64+角色页推荐 |
| 敌人/Boss | ❌ | ❓ | ❓ | ❌ | ✅ 295 含形态 | ❌ | ❌ | ❌ | ❌ | ❓ | ✅ 664 |
| 素材/道具 | △ | ❓ | ❓ | ✅ 背包细分 | ✅ 2,492 | ❌ | ❌ | ✅ | △ | ❓ | ✅ 1,600 |
| 活动/版本公告 | ✅ 活动一览 | ❓ | ❓ | ❌ | ✅ news 818 | ❌ | △ 外链 | ✅ | △ 版本专题 | ❓ | △ 变更日志 |
| 卡池/跃迁 | ❌ | ❓ | ❓ | △ warp JS | ✅ gachaLog(玩家) | ❌ | △ 外链 | ✅ **全版本历史** | △ 攻略文 | ❓ | ❌ |
| 书籍/剧情/语音 | ✅ 角色语音 | ❓ | ❓ | ✅ **书架 177KB**+语音 | ✅ 故事+语音 | ✅ Book/* 独家 | ❌ | ✅ /books | ❌ | ❓ Story 字段 | △ |
| 成就图鉴 | △ | ❓ | ❓ | △ JS | ✅ **按版本+星琼预算** | ❌ | ❌ | ❌ | ❌ | ❓ | ✅ 1,947 |
| 伤害公式/机制 | ❌ | ❓ | ❓ | ❌ | ❌ | ✅ **独家公式页** | ❌ | ❌ | ❌ | ❓ | ❌ |
| 攻略/配队/强度榜 | ✅ | ❓ | ❓ | ❌ | ✅ 配队+分榜 | △ 工具 | ❌ | ❌ | ✅ | ❓ | △ 仅官方推荐 |
| 时装/名词术语 | ✅ 时装+名词解析 | ❓ | ❓ | ❌ | ✅ 术语词典 | ❌ | ❌ | ❌ | ❌ | ❓ | ❌ |
| 地图/模拟宇宙 | ❌ | ❓ | ❓ | ❌ | △ rogue 掉落 | △ 工具 | △ 外链 | ❌ | △ map 导航 | ❓ | ❌ |
| 未来内容/Beta | ❌ | ❓ | ❓ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Live/Beta 双轨独家** | ❌ |
| 图片素材 | ✅ | ❓ | ❓ | ✅ CDN | ✅ /ui/（robots 禁 /image/） | △ 4,884 文件 | ❌ | ✅ yatta.moe | ✅ | ❓ Gallery | ❌ **0 图** |
| UID 展柜/查询 | ❌ | ❓ | ❓ | ❌ | ✅ **/show 独家** | ❌ | △ 外链工具 | ❌ | ❌ | ❓ | ❌ |

---

## 3. 共同内容（多站重叠 → 竞争"主源"的板块）

| 内容板块 | ZZZ 覆盖站 | HSR 覆盖站 | 备注 |
|---|---|---|---|
| 角色图鉴+面板 | BWIKI、zzz.gg、gachia、nanoka | BWIKI、SRS、appfeng、bittopup、gachia、nanoka | **最大重叠区**，主源之争焦点 |
| 武器（音擎/光锥） | BWIKI、zzz.gg、gachia、nanoka | BWIKI、SRS、appfeng、bittopup、nanoka | 数值深度差异大 |
| 防具（驱动盘/遗器） | BWIKI、zzz.gg、gachia、nanoka | BWIKI、SRS、appfeng、bittopup、nanoka | **gachia HSR 仅 32/62 且文本有错，出局** |
| 素材/道具 | zzz.gg、nanoka | SRS、appfeng、bittopup、nanoka | — |
| 攻略/强度榜 | BWIKI、zzz.gg、gachia、chjiya、newridu | BWIKI、appfeng、gachia | 观点类，无法数值验证 |
| 活动/版本 | BWIKI、gachia | BWIKI、appfeng、bittopup | nanoka 仅版本 diff，无活动公告 |
| 图片素材 | BWIKI、zzz.gg、gachia | BWIKI、SRS、appfeng、bittopup、gachia | **nanoka 两库 0 图 → 图片必须外采** |

## 4. 各站独有内容（无替代，必须去该站拿）

| 独有内容 | 归属站 | 说明 |
|---|---|---|
| **Beta/未上线数据（Live/Beta 双轨+构建号）** | HoneyHunter×2 | 403 难抓，唯一解包源之一 |
| **伤害计算公式/击破机制** | 灰机 HSR | 3 年未更新，但公式页独家 |
| **UID 展柜查询**（按 UID 查面板） | appfeng | 工具型独家 |
| **成就按版本筛选+星琼预算** | appfeng | — |
| **全版本卡池历史（含未来场次）** | bittopup | — |
| **行迹小节点逐条数值** | SRS | A2/A3…节点暴击/速度加成 |
| **书架/游戏内书籍全文** | SRS（177KB）、bittopup、灰机 | 三站各有，可互验 |
| **未实装爆料专区** | BWIKI ZZZ | 正式站唯一爆料角 |
| **消耗计算器/养成计算** | BWIKI ZZZ、gachia | JS 渲染，待解 |
| **七语种** | newridu | 内容空壳，暂无价值 |
| **六维抗性矩阵/波次表/精炼逐级** | nanoka×2（本地） | 数值深度无站可及 |
| **/json/ 全量数据文件** | appfeng | robots 明令 Disallow → **不可抓**，仅记录存在 |

## 5. 关键结论（分析用）

1. **数值主源最优解在"易抓档"内已可产生**：
   - HSR：**appfeng（星穹智库）** 字段最深（倍率 Lv1-10、小数面板、版本标注、敌人/成就/配队全）+ **BWIKI** 更新最快栏目最全 + **SRS** 备份（行迹/书架/语音独有）。nanoka 本地镜像当数值校验基线（Lv1-15 曲线反而最深）。
   - ZZZ：**BWIKI ZZZ** 栏目最全（60 角色三维+音擎+驱动盘+邦布+未实装区）+ **zzz.gg** 数据密度（音擎 100+、件套文案）。数值深度不足的缺口（倍率/敌人/终局）由 **nanoka 本地镜像**顶上。
2. **质量警示——gachia 不可当数值源**：HSR 遗器 32/62 套、4pc 文本与官方不符、译名错误（Castorice→卡芙卡）、新旧版本文案混杂。降级为"选题/栏目对照"。
3. **难抓站盘点**：米游社×2 **已解决**（浏览器渲染 + JSON API 实测双通，见 §7，可回归正式主链）；仍待解的只剩 **GameKee（SPA 壳）、Fandom×2（域级不可达）、HoneyHunter×2（403）**。正式验证链按用户原意：**米游社（API）→ B站 BWIKI**。
4. **图片必须外采**：nanoka 两库 0 图；图片源候选 BWIKI 画廊、zzz.gg、SRS/appfeng CDN、bittopup（yatta.moe）、gachia CDN（需核对版权与稳定性）。
5. **共同内容的"每类一主源 + 抽查"可行**：重叠区至少 3 站可互验（角色/武器/防具）；独有内容自动成为该站的固定采集项。
6. **robots 合规注意**：appfeng 白名单允许栏目但 **Disallow /json/**（全量数据文件明确禁抓）；gachia Disallow /api/；两者都显式 Allow AI 爬虫。批量爬取走 HTML 栏目页，不碰禁抓路径。
7. **质量分级与剔除（2026-10-06 定稿）**：
   - ❌ **整站剔除**：gachia（遗器 32/62、4pc 文本错、译名错 Castorice→卡芙卡、占位文本）、newridu（角色 0、空壳）、gamecircum（纯外链导航）
   - 🟡 **部分剔除**：灰机仅保留伤害公式页（静态参考，不作更新源）、bittopup 剔除新闻栏（韩语+停更），图鉴/卡池保留
   - 🟢 **保留但非数值源**：chjiya（二手攻略，观点/结构参考）

## 6. 待办（进入分析阶段后逐项定）

- [ ] 与用户共同确认各内容板块的主源分配（第 5 节为草案）
- [ ] Fandom / HoneyHunter 过盾方案（Cloudflare 持久化 profile 手动过一次盾 + cookie 复用；或放弃，HHW 可用 Wayback 快照兜底 §8）
- [ ] 图片素材源定主
- [ ] 定完主源 → 字段级深挖（每主源抓详情页字段清单）→ UI 字段需求 → md 数据模型 → 批量爬取

## 7. 米游社可抓性实测（2026-10-06 追加）

- 浏览器渲染（Playwright + Edge，本地已装）：**首页 + 详情页全渲染成功**，ZZZ 首页见调频记录/活动日历/更新日志，HSR 首页见图鉴导航（角色/光锥/遗器/敌对物种/成就/任务/装扮/…）。
- **JSON API 免登录直连成功**（仅需浏览器 UA，无 Cookie，retcode=0）：
  - ZZZ 词条详情：`GET https://act-api-takumi-static.mihoyo.com/hoyowiki/zzz/wapi/entry_page?app_sn=zzz_wiki&entry_page_id={id}&lang=zh-cn`（实测 25 KB）
  - ZZZ 批量：`.../hoyowiki/zzz/wapi/entry_pages?str_entry_page_ids={ids}&lang=zh-cn`
  - HSR 词条详情：`GET https://act-api-takumi-static.mihoyo.com/common/blackboard/sr_wiki/v1/content/info?app_sn=sr_wiki&content_id={id}`（实测 1.16 MB，含全文）
  - HSR 批量：`.../sr_wiki/v1/content/batch_get_list?app_sn=sr_wiki&content_ids={ids}`
  - 栏目导航/卡池/最新更新：`.../{app_sn}/v1/home/index/navbar`、`.../v1/gacha_pool`、`.../v1/content/latest`（app_sn = `zzz_wiki` / `sr_wiki`）
- robots.txt 两站均 404 → **无 Disallow 声明**。
- 结论：米游社走 **API 采集为主、Playwright 渲染兜底**，可直接进入正式主源候选。

## 8. GameKee 复测 + Wayback 快照实测（2026-10-06 追加）

**GameKee 翻转为可抓**（Playwright 渲染实测）：
- 渲染后栏目全出：角色/邦布/装备/音擎/驱动盘图鉴 + 攻略体系（节奏榜、版本专区、好感事件、全收集）
- 栏目树静态 JSON 免鉴权直连：`GET https://api-cdn.gamekee.com/wiki2.0/pro/50270/entry/list.json`（HTTP 200，64 KB，10 大类嵌套栏目树，带图标；需 Referer gamekee.com）
- 页面 API（渲染时全部 200）：`www.gamekee.com/v1/entry/treesByPid`、`/v1/content/pageList`、`/v1/entry/query-entry-list-from-cdn`、`/v1/wiki/entry/updateList`、`/v1/entryFilter/getEntryFilter?entry_id=`
- 结论：GameKee 走 **CDN JSON + v1 API**，与米游社同级的 API 采集类源。

**Wayback Machine 快照（"搜索引擎快照"的实证）**：
- `https://web.archive.org/cdx/search/cdx?url=zzz.honeyhunterworld.com/agents/` 实测返回 200 快照记录（2026-03-08、2026-03-13 等，HTML 22 KB/17 KB）
- 意义：HoneyHunter 被 Cloudflare 盾住时，**历史存档可作为内鬼数据的离线兜底源**（滞后数周~数月，非实时）
- 注意：archive.org 直连 429 限流，需走代理(7892) + 限速
