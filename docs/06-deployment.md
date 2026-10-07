# 部署指南

## 环境要求

- Node.js 20.19+ 或 22.12+（`package.json` engines 约束）
- MySQL 5.7+ / 8.0（无 SQLite 回退，`DB_PASSWORD` 必填）

## 开发环境部署

```bash
git clone <repository-url>
cd HengBeGer
npm install          # 无需任何 flag（历史上的 peer 依赖冲突已移除）
cp .env.example .env # 然后填写 DB_PASSWORD / ADMIN_PASSWORD / AUTH_SECRET
npm run init-db      # 安全模式：默认不破坏数据；重建请显式 npm run init-db -- --force
npm start            # concurrently 启动后端(3001) + Vite(5173)
```

也可用 `bash start.sh`（已自动切换到仓库根目录）或 `npm run launch`。

## 生产环境部署

```bash
npm ci               # 按 lockfile 安装
cp .env.example .env # 填写真实配置，并确认 NODE_ENV=production
npm run build        # 强制 production bundle（含 react 生产构建，约 4s）
npm run server       # 仅启动后端：提供 /api + 静态托管 dist（3001）
```

要点：

- `npm run build` 由脚本强制 `NODE_ENV=production`，不受 `.env` 中开发值影响。
- 服务进程响应 `SIGINT`/`SIGTERM` 优雅关闭（停止接新连接 → 排空存储同步队列 → 关闭数据库连接，10s 兜底强退）。
- 探针：存活探针 `GET /health/live`（恒 200）；就绪探针 `GET /health/ready` 带 1.5s 超时的数据库真实探测，失败返回 503，`GET /health` 为其别名。**不要把 `/health` 当存活探针**——数据库抖动时它会 503，配置错会导致编排器反复重启。
- 生产请保持 `SECURITY_SILENCE` 非 `true`（弱密码提示不要静音）、`DB_AUTO_ALTER=false`、`INIT_DB=false`。

### PM2 示例

```bash
pm2 start npm --name hengbeger -- run server
pm2 save
```

### Nginx 反向代理示例

```nginx
server {
  listen 80;
  server_name example.com;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

> **反代与限流（必读）**：位于 Nginx/反向代理之后时，必须在 `.env` 设置 `TRUST_PROXY_HOPS=1`（每多一层反代加 1）。否则服务端只能看到代理 IP，全站限流与登录防护会退化为**共享同一个桶**——任意访客连续输错 10 次密码即可让所有管理员 15 分钟内无法登录。未使用反代（直连端口）时保持该键为空。服务端在收到 `X-Forwarded-For` 但未启用 trust proxy 时会打一次告警日志。

同源部署走 HttpOnly Cookie；分域部署回退签名 Session Token（见 `README.md` 安全章节）。

## CI / 发布

- `.github/workflows/ci.yml`：lint + 后端/前端 coverage 测试 + production build（覆盖率门槛：backend ≥25/15/25/25，frontend ≥25/20/25/25；frontend 阈值以 `vitest.config.js` 实测基线为准，2026-10-06 前该配置从未生效）。
- 历史 `release.yml` 已删除：发布不再自动打 tag，部署时按上方生产步骤手动执行。
