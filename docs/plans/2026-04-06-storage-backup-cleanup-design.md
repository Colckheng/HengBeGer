# Storage Backup Cleanup Design

日期：2026-04-06

## 背景

项目已经具备：

- 写入前自动生成 storage 备份
- root storage 备份恢复命令

但还没有统一的备份保留策略和清理命令。随着管理操作增多，`src/db/storage/backup` 很容易累积大量历史文件。

## 目标

- 提供一个通用的备份清理命令
- 默认策略安全、可预测
- 支持 dry-run，先看结果再实际删除

## 设计选择

### 方案 A：按备份前缀分组，每组保留最近 N 份

推荐方案。

优点：

- 适配当前已有命名体系：`agents_*`、`web_agents_*`、`admin_agents_*`
- 不会因为某一类备份太多而误删别的分组
- 对 root / web / admin / restore_before 都能统一处理

### 方案 B：全目录只保留最近 N 份

优点：

- 实现简单

代价：

- 高风险，容易让某个高频分组挤掉别的分组备份

### 方案 C：按天数清理

优点：

- 直觉上容易理解

代价：

- 当前仓库备份命名天然更适合按“版本数量”而不是按天数控制
- 高频写入时，按天数仍可能留下很多文件

## 最终设计

采用方案 A。

默认规则：

- 扫描 `src/db/storage/backup`
- 通过文件名里的时间戳识别“备份前缀”
- 按前缀分组
- 每组默认保留最近 `10` 份
- 其余文件纳入删除候选

CLI 支持：

- `--keep <number>`：覆盖默认保留数量
- `--prefix <group>`：只清理指定前缀
- `--dry-run`：只输出计划，不实际删除

## 分组规则

文件名采用：

- `agents_<timestamp>.json`
- `web_agents_<timestamp>.json`
- `admin_agents_<timestamp>.json`
- `restore_before_agents_<timestamp>.json`

因此“前缀”定义为：

- 最后一个时间戳前面的全部字符串

示例：

- `agents_2026-04-06T00-00-00-000Z.json` -> `agents`
- `web_agents_2026-04-06T00-00-00-000Z.json` -> `web_agents`
- `restore_before_agents_2026-04-06T00-00-00-000Z.json` -> `restore_before_agents`

## 失败与安全语义

- `--keep < 0`：直接失败
- backup 目录不存在：返回空结果，不报错
- 文件名不符合备份命名规则：默认跳过，不参与删除
- dry-run 时绝不删除文件

## 输出结果

命令至少输出：

- 扫描到的总文件数
- 命中的分组
- 每组保留数量
- 将要删除或已经删除的文件列表

## 后续扩展

后续如果确实需要，可以再加：

- `--all` 恢复/清理组合命令
- 按天数清理
- 不同分组配置不同保留数量
