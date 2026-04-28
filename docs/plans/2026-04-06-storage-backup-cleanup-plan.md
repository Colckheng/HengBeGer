# Storage Backup Cleanup Implementation Plan

日期：2026-04-06

## 实施步骤

1. 在 `src/db/storageBackupManager.js` 中增加备份扫描与清理逻辑
2. 支持按前缀分组、按数量保留、dry-run 输出
3. 新增 `scripts/cleanup-storage-backups.js`
4. 在 `package.json` 中接入 `cleanup-storage-backups`
5. 增加最小测试：
   - dry-run 不删除文件
   - 实际清理只保留最近 N 份
6. 在 README 中补使用说明

## 验收点

- 默认每组只保留最近 10 份
- dry-run 可预演删除结果
- 可以通过 `--prefix` 限定分组
- 不符合命名规则的文件不会被误删
