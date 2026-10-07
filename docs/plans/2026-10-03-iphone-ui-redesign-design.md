# iPhone 风格全站 UI 重设计 · 设计文档

- 日期：2026-10-03
- 状态：三节方案已逐节获批（用户确认「全部通过，开工」）
- 风格基准：`design-demos/demo-4-clean-glass.html`（ZZZ 橙版）、`design-demos/demo-4b-hsr-blue.html`（HSR 蓝版）

## 1. 目标与范围

把全站（首页 / ZZZ 列表 / ZZZ·HSR 详情 / HSR 列表 / 管理后台 / 登录门）统一重设计为 iPhone UI 风格的 **Clean Glass** 体系：

- 纯白底 + 浅灰玻璃卡 + 中性投影 + 方角控件 + 语境主题色 + 双明暗令牌
- 数据流、分页、筛选、鉴权逻辑零改动；以换皮为主，首页结构重做

## 2. 设计令牌（新建 `src/styles/tokens.css`）

```css
/* 语境主题色：路由决定 */
--tint: #F0670C;        /* ZZZ 橙；HSR 页 #0A6CFF；首页/后台 #0A6CFF */
--tint-soft: #FFF3EA;   /* tinted 浅底（激活 chip）；HSR #EDF4FF */
--tint-ink: #D95A00;    /* tinted 浅底上的深字；HSR #0A6CFF */
--tint-press: #D95A00;  /* 按压态 */
--tint-a08: rgba(240,103,12,.08); /* 主按钮 hover 浅底 */

/* 中性阶（浅色） */
--bg: #FFFFFF;
--surface: rgba(239,241,247,.78);      /* 玻璃面板/卡片 */
--surface-solid: #FFFFFF;
--text: #0B0B10;  --text-2: rgba(11,11,16,.56);  --text-3: rgba(11,11,16,.32);
--hairline: rgba(11,11,16,.06);  --hairline-2: rgba(11,11,16,.10);

/* 圆角（方角基调） */
--r-ctl: 6px;   /* 按钮/chips/搜索/分段/分页/kicker/徽章 */
--r-bar: 12px;  /* 工具栏 */
--r-panel: 16px;/* 卡片/分组面板 */

/* 阴影（全部中性灰，禁彩色投影） */
--shadow-card: 0 16px 40px rgba(20,24,50,.15);
--shadow-card-hover: 0 24px 56px rgba(20,24,50,.18);
--shadow-ctl: 0 1px 3px rgba(20,24,50,.10);
--shadow-tint: 0 2px 8px rgba(tint,.16);

/* 字体：系统栈，去 Rajdhani / Google Fonts 外链 */
--font: -apple-system, "SF Pro Text", "PingFang SC", "Segoe UI", system-ui, sans-serif;
```

### 暗色映射（`[data-theme="dark"]`，同一令牌换值）

- `--bg:#000`；`--surface: rgba(28,30,34,.72)`；文字反转；hairline 换白系
- `--tint` 提亮：橙 `#FF9A3D` / 蓝 `#4C9AFF`；卡片投影换黑系
- 所有页面免费获得暗色，不写第二套样式

## 3. 全局框架

- **悬浮玻璃工具栏**（sticky，`--r-bar`）：品牌点（tint）+ HENGEBEGER ｜右侧：搜索框（仅列表页）+ 切游戏 + ☀/☾ 主题切换 + 内容后台
- **语境色 = 路由驱动**：App 层按路由设置 `data-tint`（`zzz` / `hsr` / `neutral`），CSS 变量自动换色，ZZZ/HSR 共用一套样式
- **明暗切换**：默认浅色，按钮切换写 `localStorage`，`<html data-theme>` 驱动

## 4. 各页面

### 4.1 首页（`HomePage.jsx` 结构重做）

白底极简：品牌行 → 28–34px/800 字重大标题 + 一行 subtitle → **两张大入口卡**（16px 玻璃卡，色点=语境色，hover 抬升，chevron 6px 方钮）：ZZZ wiki（橙）/ HengHSR（蓝）→ 第三张禁用卡「更多游戏 · 即将开放」→ 底部 12px 淡字。不做营销 hero、无入场动效。

### 4.2 列表页（ZZZWiki / HsrWiki，＝定稿 demo 翻译）

工具栏 → **head 行**（kicker + 28px 标题 + 右侧「共 N 条 · 第 x/y 页」+ 分页方钮）→ 一行 subtitle → segmented（max-width 560px / 高 36px）→ 紧凑筛选组（row 9×14、chip 30px）→ result line → **4:5 卡片网格**（4 列）。

- **删除现有 wiki-hero 三张大 stat 卡**（信息并入 head 行，卡片提前出现，y≈400）
- 卡片：thumb `aspect-ratio:4/5`、body `padding:16px 15px 24px`、tags `margin-top:12px`
- 稀有度徽章：白底平涂方牌 `rgba(255,255,255,.96)`、细边 `--hairline-2`、`0 1px 3px` 轻影；S 字 `#D97706`、A 字 `#607D8B`（HSR 星级同规范）

### 4.3 详情页（换皮 + 小改）

工具栏内「‹ 返回代理人/角色」文字钮 → 左 `detail-media` 包玻璃容器（4:5 图，16px）→ 右 `detail-body`：kicker → 标题 → 徽章/chips 行（tinted 浅底）→ 描述卡（surface）→ 属性改紧凑定义表（hairline 分隔行）。不加新功能。

### 4.4 管理后台（令牌对齐）

现有已是浅色，只做对齐：白卡→玻璃卡、蓝按钮→`--tint` 平涂 6px、控件 6px、面板 16px、kicker/激活态 tinted 浅底；`AdminAuthGate` 登录门收窄成居中卡片。

## 5. 按钮与控件规范（禁"渐变果冻糖水感"）

- 主按钮：平涂纯色 `--tint`，白字，`--r-ctl`，`box-shadow: var(--shadow-tint)`，无渐变/无内高光/无彩影
- 激活 chip：`--tint-soft` 底 + `--tint-ink` 字，`box-shadow:none`
- hover：主按钮叠 `--tint-a08` 深一阶；按压 `scale(.98)` + `--tint-press`，80ms

## 6. 动效

- 卡片 hover：`translateY(-4px)` + `--shadow-card-hover`，`180ms cubic-bezier(.2,.7,.3,1)`
- 主题/语境切换：CSS 变量过渡 300ms（不闪白）
- segmented 指示条滑动；列表换页/筛选无入场动画
- `prefers-reduced-motion: reduce` 全部关闭

## 7. 响应式（4 断点）

| 断点         | 卡片列 | 其他                 |
| ---------- | --- | ------------------ |
| ≥1200px    | 4   | —                  |
| 768–1199px | 3   | —                  |
| <768px     | 2   | 搜索框收进图标；head 行分页换行 |
| <480px     | 1   | 筛选组横向滚动            |

详情页 <900px 单列（图上 body 下）。

## 8. 实施计划

| 步   | 内容                                       | 文件                                                                      |
| --- | ---------------------------------------- | ----------------------------------------------------------------------- |
| 0   | 设计文档入库 + git 基线                          | 本文件                                                                     |
| 1   | 令牌层                                      | 新建 `src/styles/tokens.css`；改 `src/index.css`                            |
| 2   | 全局框架（工具栏 / ThemeToggle / `data-tint` 路由） | `src/App.css`、`src/App.jsx`、新 `src/components/ThemeToggle.jsx`          |
| 3   | 列表页换皮（ZZZ/HSR 共用）                        | 重写 `src/ZZZWiki.css`；`src/hsr/HsrWiki.jsx` 样式并入                         |
| 4   | 首页重做                                     | `src/HomePage.jsx` + 新样式                                                |
| 5   | 详情页                                      | `detail-*` 样式（`ZZZWiki.css` / `HsrWiki`）                                |
| 6   | 后台令牌对齐                                   | `AdminPanel.jsx`、`hsr/HsrAdminPanel.jsx`、`components/AdminAuthGate.jsx` |
| 7   | 暗色映射 + 响应式 + reduced-motion              | `tokens.css` 尾部                                                         |
| 8   | 验证                                       | `npm run lint`、`npm test`、Edge 逐页截图对比（浅/暗、ZZZ/HSR）                      |

### 已知风险 / 待办

- `npm install` 需 `--legacy-peer-deps`（vite 7 vs vitest 2.1.9 / vite-plugin-node-stdlib-browser peer 冲突），完善阶段根治
- `.env` `DB_PASSWORD=<removed>` 强度不足，安全检查会提示
- 后台运行时会重写 `src/db/storage/*.json` 的 `lastUpdated` 时间戳——提交前用 `git checkout -- src/db/storage/` 还原，勿混入 UI 提交
- 收尾清理 `design-demos\`（或留作风格参考，届时问用户）
