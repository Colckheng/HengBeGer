# 部署指南

## 开发环境部署

### 前置要求
- Node.js 16+
- MySQL 5.7+
- Git

### 快速部署步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd HengBeGer
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，设置数据库密码
   ```

4. **创建数据库**
   ```sql
   CREATE DATABASE HengBeGer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

5. **初始化数据库**
   ```bash
   npm run init-db
   ```

6. **启动服务**
   ```bash
   npm start
   ```

## 生产环境部署

### 使用 PM2 部署

1. **安装 PM2**
   ```bash
   npm install -g pm2
   ```

2. **构建前端**
   ```bash
   npm run build
   ```

3. **创建 PM2 配置文件**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'hengbeger-server',
       script: 'server/index.js',
       env: {
         NODE_ENV: 'production',
         PORT: 3001
       },
       instances: 'max',
       exec_mode: 'cluster'
     }]
   }
   ```

4. **启动 PM2**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### 使用 Docker 部署

1. **创建 Dockerfile**
   ```dockerfile
   FROM node:18-alpine
   
   WORKDIR /app
   
   COPY package*.json ./
   RUN npm ci --only=production
   
   COPY . .
   RUN npm run build
   
   EXPOSE 3001
   
   CMD ["node", "server/index.js"]
   ```

2. **创建 docker-compose.yml**
   ```yaml
   version: '3.8'
   services:
     app:
       build: .
       ports:
         - "3001:3001"
       environment:
         - NODE_ENV=production
         - DB_HOST=mysql
         - DB_PASSWORD=your_password
       depends_on:
         - mysql
     
     mysql:
       image: mysql:8.0
       environment:
         - MYSQL_ROOT_PASSWORD=your_password
         - MYSQL_DATABASE=HengBeGer
       volumes:
         - mysql_data:/var/lib/mysql
   
   volumes:
     mysql_data:
   ```

3. **启动容器**
   ```bash
   docker-compose up -d
   ```

### Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        root /path/to/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # API 代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # 健康检查
    location /health {
        proxy_pass http://localhost:3001;
    }
}
```

## 数据库优化

### MySQL 配置优化

```ini
# my.cnf
[mysqld]
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
max_connections = 200
query_cache_size = 64M
query_cache_type = 1
```

### 数据库备份

```bash
# 备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u root -p HengBeGer > backup_${DATE}.sql

# 定时备份 (crontab)
0 2 * * * /path/to/backup.sh
```

## 监控和日志

### 应用监控

```bash
# PM2 监控
pm2 monit

# 查看日志
pm2 logs

# 重启应用
pm2 restart hengbeger-server
```

### 日志管理

```javascript
// 在 server/index.js 中添加日志中间件
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

## 性能优化

### 前端优化
- 启用 Gzip 压缩
- 配置 CDN
- 图片懒加载
- 代码分割

### 后端优化
- 数据库连接池
- Redis 缓存
- API 限流
- 静态资源缓存

## 安全配置

### HTTPS 配置
```bash
# 使用 Let's Encrypt
sudo certbot --nginx -d your-domain.com
```

### 防火墙配置
```bash
# UFW 配置
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查 MySQL 服务状态
   - 验证数据库凭据
   - 确认防火墙设置

2. **前端无法访问 API**
   - 检查 CORS 配置
   - 验证代理设置
   - 确认后端服务运行状态

3. **性能问题**
   - 检查数据库查询性能
   - 监控内存使用情况
   - 分析网络延迟

### 日志分析
```bash
# 查看错误日志
tail -f /var/log/nginx/error.log
pm2 logs --err

# 分析访问日志
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -nr
```