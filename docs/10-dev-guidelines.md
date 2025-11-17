# 开发规范

- 模块导入：后端统一 ES Module，入口 `server/index.js`
- 日志：生产禁止 `console.log`，使用 `src/utils/logger.js`
- API 基地址：前端 `'/api'` 通过 Vite 代理
- 初始化门禁：仅开发或显式 `INIT_DB=true` 允许破坏性初始化
- 安全提示：开发可 `SECURITY_SILENCE=true`，生产禁用静音

## 命名与结构
- 变量命名、函数命名、事件处理、BEM CSS 命名
- 目录分层与组件职责单一

## 安全规范
- 输入验证与清理、SQL 注入防护、错误处理中间件
- 环境变量与敏感信息保护、日志安全

## 禁止操作
- 生产环境禁止使用 `init-db`
- 图片资源统一由管理员维护，禁止私自添加

## 参考
- 详尽规范见《开发规范文档.md》（已迁移与压缩至本页），更多细节参考 `SECURITY.md`