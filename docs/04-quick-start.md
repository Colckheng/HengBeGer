# 快速开始

这份文档以当前仓库代码为准，适合在本地直接拉起项目。

## 环境要求

- Node.js 18+
- MySQL 5.7+ 或 8.x
- npm 9+

## 第一步：安装依赖

```bash
npm install
```

## 第二步：准备环境变量

复制模板：

```bash
cp .env.example .env
```

Windows 可以直接手动复制 `.env.example` 为 `.env`。

至少确认这些字段：

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

- `DB_PASSWORD` 必填。
- `ADMIN_PASSWORD` 和 `AUTH_SECRET` 必填。
- `DB_AUTO_ALTER` 默认建议保持 `false`。

## 第三步：初始化数据库

```bash
npm run init-db
```

如果你本地是旧库，且表结构跟当前模型有漂移，可以临时这样做：

```bash
DB_AUTO_ALTER=true npm run server
```

Windows `cmd.exe` 下可写成：

```cmd
set DB_AUTO_ALTER=true&& npm run server
```

只建议本地开发临时使用，生产环境不要依赖这个开关。

## 第四步：启动服务

### 一起启动

```bash
npm start
```

### 分开启动

```bash
npm run server
npm run dev
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`

如果前端端口被占用：

```bash
npm run dev -- --port 5174
```

## 第五步：确认服务正常

后端健康检查：

- `http://localhost:3001/health/live`
- `http://localhost:3001/health/ready`

管理员入口：

- `http://localhost:5173/zzz-wiki/admin`
- `http://localhost:5173/hsr-wiki/admin`

## 常见问题

### 1. 管理员页提示未配置认证

检查：

- `ADMIN_PASSWORD`
- `AUTH_SECRET`

### 2. 后端启动时报数据库字段不存在

这是旧表结构和当前模型不一致。优先做法：

1. 本地备份数据库
2. 临时开启 `DB_AUTO_ALTER=true`
3. 重新启动后端
4. 确认字段补齐后恢复为 `false`

### 3. 前端请求不到后端

先检查：

- 后端是否已监听 `3001`
- `VITE_API_BASE_URL` 是否正确
- `CORS_ORIGINS` 是否包含当前前端源
