[![Protected by Tracebit Community Edition](https://raw.githubusercontent.com/tracebit-com/tracebit-community-action/main/assets/badges/tracebit-badge.svg)](https://community.tracebit.com/supplychainattacks)

# HengBeGer

HengBeGer 是一个 React + Express + MySQL 的游戏资料站项目，当前包含两套公开 Wiki 和一套管理员能力：

- 绝区零（ZZZ）资料页与管理页
- 崩坏：星穹铁道（HSR）资料页与管理页
- 管理员登录、鉴权、数据写入、公开数据同步

当前代码以 MySQL 为唯一事实源。管理员写操作直接落数据库，再串行刷新 root storage 和 web storage；公开列表页优先走分页 API，详情页和管理链路仍可读取快照数据。

## 当前状态

- 前端：Vite + React 19
- 后端：Express 5
- 数据库：MySQL + Sequelize
- 鉴权：管理员密码登录，支持 Cookie 会话与签名 Session Token
- 公开列表：ZZZ / HSR 都已接入分页与筛选 API
- 管理链路：已补齐同步串行队列、备份恢复、备份清理、统一错误提示、上传图片校验
- 可追踪性：管理员登录、退出、CRUD、staging 发布、storage 重建都会记录审计事件
- 健康检查：
  - `GET /health/live`
  - `GET /health/ready`

## 主要入口

- 首页：`/`
- ZZZ Wiki：`/zzz-wiki`
- ZZZ 管理页：`/zzz-wiki/admin`
- HSR Wiki：`/hsr-wiki`
- HSR 管理页：`/hsr-wiki/admin`

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，至少补齐下面几项：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=hengbeger

ADMIN_PASSWORD=change_this_admin_password
AUTH_SECRET=change_this_auth_secret

PORT=3001
NODE_ENV=development
INIT_DB=false
DB_AUTO_ALTER=false
CORS_ORIGINS=http://localhost:5173
VITE_API_BASE_URL=/api
```

说明：

- `DB_PASSWORD` 必填，项目已经移除了隐式 SQLite 回退。
- `ADMIN_PASSWORD` 和 `AUTH_SECRET` 必填，否则管理员登录不可用。
- `DB_AUTO_ALTER=true` 只建议在本地开发环境临时开启，用于修补历史表结构漂移。
- `VITE_API_BASE_URL=/api` 适合同源或 Vite 代理开发模式。

### 3. 初始化数据库

```bash
npm run init-db
```

### 4. 启动项目

```bash
npm start
```

或分别启动：

```bash
npm run server
npm run dev
```

默认端口：

- 前端：`5173`
- 后端：`3001`

如果 `5173` 被占用，可以手动换端口：

```bash
npm run dev -- --port 5174
```

## 常用命令

```bash
npm run dev
npm run server
npm run init-db
npm run lint
npm test
npm run build
npm run setup-password
npm run security-check
npm run restore-storage -- --type agents --file src/db/storage/backup/agents_xxx.json
npm run cleanup-storage-backups -- --dry-run
```

说明：

- `restore-storage` 只恢复 storage 快照，不会回滚 MySQL 数据。
- 当前建议只在 root storage 文件损坏、丢失或误覆盖时使用。
- `cleanup-storage-backups` 默认按备份前缀分组，每组保留最近 10 份；建议先用 `--dry-run` 预演。

## 管理员工作流

### 登录

前端管理页会请求：

- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`

登录成功后：

- 同源部署优先使用 HttpOnly Cookie
- 分域部署可回退使用签名 Session Token

### 数据流

1. 管理员在管理页新增、编辑、删除内容
2. 后端先写入 MySQL
3. 同步任务进入单进程序列队列
4. 后端重建 root storage 和 web storage
5. 公开 Wiki 详情页或兼容链路可从 `GET /api/dual-storage/web/data` 读取快照

legacy staging 接口已整体下线：数据库是唯一事实源，批量替换走 `/api/storage/*`（提交前强制 mysqldump 备份）。

## 公开与管理 API

### 健康检查

- `GET /health/live`
- `GET /health/ready`

### 管理员会话

- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`

### 公开读取

- `GET /api/base-data`
- `GET /api/hsr/base-data`
- `GET /api/dual-storage/web/data`
- `GET /api/agents/list`
- `GET /api/sound-engines/list`
- `GET /api/bumbos/list`
- `GET /api/drive-disks/list`
- `GET /api/hsr/characters/list`
- `GET /api/hsr/cones/list`
- `GET /api/hsr/relics/list`

分页接口统一支持 `limit` / `offset`，并按业务类型支持多值筛选参数，例如 `factionIds`、`roleIds`、`rarityIds`、`elementIds`、`pathIds`、`typeIds`、`parts`。

### 写接口

以下写接口都要求管理员认证：

- `/api/agents`
- `/api/sound-engines`
- `/api/bumbos`
- `/api/drive-disks`
- `/api/hsr/characters`
- `/api/hsr/cones`
- `/api/hsr/relics`
- `/api/storage/*`
- `/api/dual-storage/status`

## 文档导航

- [文档索引](./docs/README.md)
- [快速开始](./docs/04-quick-start.md)
- [管理员工作流](./docs/11-admin-workflow.md)
- [实施路线图](./docs/14-implementation-roadmap.md)
- [无用文件审计](./docs/13-unused-files-audit.md)

## 注意事项

- 生产环境不要默认开启 `DB_AUTO_ALTER=true`
- 生产环境必须显式配置 `CORS_ORIGINS`
- 本仓库内的 `src/db/storage/backup/`、`backup_storage/`、`dist/` 都属于生成产物或历史备份，提交前建议检查
