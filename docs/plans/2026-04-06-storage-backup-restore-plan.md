# Root Storage Backup Restore Implementation Plan

日期：2026-04-06

## 实施步骤

1. 新增 `src/db/storageBackupManager.js`
2. 实现 root storage 备份恢复与 web 重刷逻辑
3. 新增 `scripts/restore-storage-backup.js` CLI
4. 在 `package.json` 中接入 `restore-storage` 命令
5. 补两条最小测试：
   - 成功恢复并刷新 web
   - 拒绝使用非 root 备份恢复
6. 在 README 中补最小使用说明和风险提示

## 验收点

- 能按 `type + file` 恢复指定 root storage
- 会自动刷新对应 web storage
- 会在恢复前先备份当前 root storage
- 不接受 `web` / `admin` 来源的备份文件
