# 部署指南

## 开发环境部署

- Node.js 16+
- MySQL 5.7+

```bash
git clone <repository-url>
cd HengBeGer
npm install
cp .env.example .env
npm run init-db
npm start
```

## 生产环境部署（示例 PM2/Docker/Nginx）
- PM2 集群部署、Docker Compose、Nginx 反向代理配置