# 管理员工作流

这份文档描述的是当前实现，不再使用“只改 JSON 再手动回填数据库”的旧流程。

## 当前事实源

- 数据库：唯一事实源
- root storage：数据库快照
- web storage：公开站点快照
- admin storage：兼容 legacy staging 的临时区，不是事实源

## 管理员登录

管理员页依赖：

- `ADMIN_PASSWORD`
- `AUTH_SECRET`

登录接口：

- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`

登录成功后，后端会返回：

- Cookie 会话
- 签名 Session Token

前端优先使用 Cookie，同源失败或跨域时可回退到 Session Token。退出登录时，无论接口成功与否，前端都会清掉本地 token 并刷新页面，避免卡在半退出状态。

## 当前写入流程

### 管理页直接 CRUD

管理页的新增、编辑、删除现在走的是直接数据库写入：

1. 前端调用写接口
2. 后端校验管理员权限
3. 后端写入 MySQL
4. 后端执行 `syncDatabaseToStorage()`
5. 同步任务进入单进程序列队列
6. root storage 和 web storage 顺序刷新
7. 公开页读取到最新快照或新的分页结果

这意味着正常管理操作不需要再手动点击“同步到 web”。

## Legacy staging 接口

以下接口仍保留，主要用于兼容旧工作流或临时批量操作：

- `POST /api/dual-storage/admin/session`
- `GET /api/dual-storage/admin/data`
- `PUT /api/dual-storage/admin/:type`
- `POST /api/dual-storage/sync`
- `DELETE /api/dual-storage/admin/session`

### 它们现在怎么工作

- `admin/:type` 只写 admin staging
- `dual-storage/sync` 会把 staging 数据通过数据库事务正式提交
- 事务成功后才会刷新公开 storage

也就是说，legacy 同步接口现在不会再出现“只改 JSON，不改 DB”的漂移问题。

## 批量替换与事务

`/api/storage/:type` 和 `/api/storage/batch/update` 现在都会走数据库事务：

- 成功：整批提交，再刷新 storage
- 失败：整批回滚，不留下半更新状态

这点对批量导入尤其重要。

## 备份、恢复与清理

管理员运维链路现在有最小可执行的恢复能力：

- `npm run restore-storage -- --type agents --file src/db/storage/backup/agents_xxx.json`
- `npm run cleanup-storage-backups -- --dry-run`

约束如下：

- 恢复的是 root storage 快照，不会回滚 MySQL
- 恢复前会先为当前 root storage 再做一次保护性备份
- 清理命令默认按备份前缀分组，每组保留最近 10 份

## 审计与可追踪性

以下管理员关键动作现在都会写审计事件：

- 管理员登录与退出
- ZZZ / HSR 各类型内容的新增、编辑、删除
- `storage.replaceByType`
- `storage.replaceBatch`
- `storage.rebuildFromDatabase`
- legacy staging 初始化、更新、发布、清理

当前审计事件默认走应用日志输出，适合先做问题追踪与运维排查。

## 推荐操作方式

### 日常内容维护

直接使用：

- `http://localhost:5173/zzz-wiki/admin`
- `http://localhost:5173/hsr-wiki/admin`

### 需要 staging 的兼容场景

仅在以下场景考虑使用 legacy staging：

- 调试旧接口
- 临时批量编辑 JSON 结构
- 做兼容性验证

默认开发与运营流程建议都走管理页直接 CRUD。

## 风险提示

- 不要把 `admin storage` 当成长期真源
- 不要在生产环境默认开启 `DB_AUTO_ALTER=true`
- 如果是分域部署，务必同时检查：
  - `VITE_API_BASE_URL`
  - `CORS_ORIGINS`
  - 管理员登录是否成功拿到会话状态
