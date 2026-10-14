# 文档索引

## 推荐先读

- [开放图录 · 方案定稿与开发交接（2026-10-13）](./32-open-index-design-handoff-2026-10-13.md) — 当前生产实现与本次数据修复的完整记录
- [项目总览](../README.md)
- [快速开始](./04-quick-start.md)
- [管理员工作流](./11-admin-workflow.md)
- [实施路线图](./14-implementation-roadmap.md)

## 交接记录（按时间顺序）

历史交接链保留在 [handoff/](./handoff/)，由旧到新：

- [T2.9d 交接](./handoff/t2.9d-handoff.md) — mihoyo 新类批量爬取
- [T2.9e 交接](./handoff/t2.9e-handoff.md) — 敌人与星铁历史阶段采集
- [T2.9f 交接](./handoff/t2.9f-handoff.md) — 敌人形态与图片补充
- [T2.9g 交接](./handoff/t2.9g-handoff.md) — 装备核验与隔离 MySQL 导入
- [T2.9h 交接](./handoff/t2.9h-handoff.md) — 本机正式库导入完成（最新一轮）

> 这些文件记录的是各自时点的状态；数量与树哈希为历史基线，最新口径见 32 号文档。

## 资料管线

- [数据管线设计（2026-10-06）](./plans/2026-10-06-data-pipeline-design.md)
- [数据管线实施（2026-10-06）](./plans/2026-10-06-data-pipeline-implementation.md)
- [资料同步说明（T2.9g 期）](./22-catalog-sync.md)
- [爬取覆盖（2026-10-08）](./20-crawl-coverage-2026-10-08.md)
- [资料补齐（2026-10-08）](./21-data-completion-2026-10-08.md)
- [数据源摸底（2026-10-06）](./17-datasource-recon-2026-10-06.md)
- [字段矩阵（2026-10-06）](./18-field-matrix-2026-10-06.md)
- [数据库 DDL 草案（2026-10-06）](./19-db-ddl-draft-2026-10-06.md)

## 界面与设计

- [新 UI 真实样本（2026-10-08）](./23-ui-samples-2026-10-08.md)（[JSON 清单](./23-ui-samples-2026-10-08.json)）
- [新 UI 需求清单（2026-10-08）](./24-ui-requirements-2026-10-08.md)
- [UI Demo 第二版（2026-10-08）](./25-ui-demo-2026-10-08.md)
- [八套可交互 UI Demo · 第三版（2026-10-11）](./26-ui-demo-v3-2026-10-11.md)
- [UI 配图来源（2026-10-11）](./27-ui-image-sources-2026-10-11.md)
- [技能等级滑动条研究（2026-10-12）](./30-slider-study-2026-10-12.md)
- [八套 Demo 评审修订（2026-10-12）](./31-ui-review-revision-2026-10-12.md)

## 架构与分析

- [01-architecture.md](./01-architecture.md)（历史参考）
- [02-detailed-architecture.md](./02-detailed-architecture.md)（历史参考）
- [03-project-analysis.md](./03-project-analysis.md)
- [08-storage-implementation.md](./08-storage-implementation.md)

## 使用与运维

- [04-quick-start.md](./04-quick-start.md)
- [05-startup-guide.md](./05-startup-guide.md)
- [06-deployment.md](./06-deployment.md)
- [07-troubleshooting.md](./07-troubleshooting.md)
- [11-admin-workflow.md](./11-admin-workflow.md)

## 评审与规范

- [项目审查（2026-10-04）](./15-project-audit-2026-10-04.md)
- [完整复审（2026-10-06）](./16-full-re-audit-2026-10-06.md)
- [09-code-review-findings.md](./09-code-review-findings.md)
- [09-improvements-summary.md](./09-improvements-summary.md)
- [10-dev-guidelines.md](./10-dev-guidelines.md)
- [12-code-review.md](./12-code-review.md)
- [13-unused-files-audit.md](./13-unused-files-audit.md)
- [开发规范文档](../开发规范文档.md)

## 附件

- [docs/assets/open-index-2026-10-13/](./assets/open-index-2026-10-13/) — 开放图录定稿期的截图与机器可读证据

> `01-architecture.md` 与 `02-detailed-architecture.md` 成稿较早，仅作演进思路参考；一线实现以 `README.md`、`04-quick-start.md`、`11-admin-workflow.md`、`15-project-audit-2026-10-04.md` 为准。
