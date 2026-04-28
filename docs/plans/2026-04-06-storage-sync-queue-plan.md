# Storage Sync Queue Implementation Plan

日期：2026-04-06

## 实施步骤

1. 在 `src/db/api.js` 提取真正执行同步的内部函数
2. 增加进程内队列状态，统一由 `syncDatabaseToStorage()` 入队执行
3. 保持返回值和调用方式不变
4. 新增并发同步测试，覆盖串行执行与失败恢复
5. 运行最小相关测试，确认没有破坏现有服务行为

## 验收点

- `syncDatabaseToStorage()` 对外签名不变
- CRUD、batch update、legacy sync 无需改调用方式
- 同步任务串行执行
- 队列在失败后仍可继续处理后续任务
