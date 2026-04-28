# Root Storage Backup Restore Design

日期：2026-04-06

## 背景

当前项目已经会在 root storage 与 web storage 写入前自动复制备份文件，但仓库里还没有正式的恢复流程。已有备份主要是 storage 文件级备份，不是数据库备份。

## 目标

- 提供一个可执行的 root storage 恢复脚本
- 恢复 root storage 后，自动把对应 web storage 重刷到同一份数据
- 明确这是“storage 快照恢复”，不是数据库恢复

## 范围

本次只支持：

- 恢复单个 `root storage` 类型
- 备份文件来源必须是 root storage 备份，也就是 payload `source = database`
- 恢复完成后自动刷新对应的 `web storage`

本次不支持：

- 恢复 `admin staging`
- 一次性恢复所有类型
- 从 `web_*` 或 `admin_*` 备份直接恢复
- 恢复数据库内容

## 设计选择

### 方案 A：做一个独立 CLI，按 `type + backup file` 明确恢复

推荐方案。

优点：

- 输入明确，不容易误恢复
- 对当前脏工作区和已有脚本体系侵入最小
- 后续可平滑扩展成 `--latest` 或批量恢复

### 方案 B：直接加一个服务端 API 恢复接口

优点：

- 管理端可以直接触发

代价：

- 这是高风险动作，不适合先暴露成 HTTP 接口
- 需要额外鉴权、审计、确认机制

## 最终设计

新增一个 `StorageBackupManager`，专门负责：

1. 校验 backup file 是否存在
2. 校验 payload 是否匹配指定 `type`
3. 校验 payload `source` 是否为 `database`
4. 在覆盖前先把当前 root storage 再备份一份
5. 用指定 backup 恢复 root storage
6. 根据恢复后的 root 数据重写对应 web storage

另外提供一个 CLI 脚本：

```bash
npm run restore-storage -- --type agents --file src/db/storage/backup/agents_xxx.json
```

## 失败语义

- 备份文件不存在：直接失败
- payload 非法：直接失败
- `dataType` 不匹配：直接失败
- `source !== database`：直接失败
- 如果恢复 root 成功但刷新 web 失败：命令失败，保留 root 已恢复状态，并提示用户手动检查

## 风险提示

恢复的是 storage 快照，不是数据库。也就是说：

- 公开站点快照会回到备份状态
- 数据库不会一起回退

这类恢复应当只用于“storage 文件损坏、丢失或误覆盖”的场景，不应替代数据库级恢复方案。
