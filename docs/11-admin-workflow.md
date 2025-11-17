# 管理员工作流与双存储

## 核心概念
- 双存储：`web/`（网页端显示）与 `admin/`（管理员编辑）分离
- 初始化：进入管理员面板时复制网页端数据到管理员端
- 同步：管理员端修改后，点击“同步数据”写回网页端

## 常见操作
- 添加/编辑/删除完成后：自动执行“读取根存储 → 保存管理员端 → 同步网页端 → 刷新显示”
- 失败兜底：后端删除失败时，从存储数组过滤目标项并同步网页端，保证列表更新

## 接口
- 初始化：`POST /api/dual-storage/initialize`、`POST /api/dual-storage/admin/session`
- 保存管理员端：`PUT /api/dual-storage/admin/:type`
- 同步网页端：`POST /api/dual-storage/sync`
- 获取网页端数据：`GET /api/dual-storage/web/data`

## 提示
- 若列表未更新，手动点击左侧“同步数据”或刷新页面
- 数据安全：同步前自动备份 `web/` 数据到 `backup/`