# HengBerGer 云端镜像
# 构建上下文 = 仓库根目录（deploy/docker-compose.yml 里写的是 context: ..）
# 两个阶段：builder 跑 vite build；runtime 只带生产依赖 + dist，不带 devDependencies。
#
# 设计依据：docs/plans/2026-10-14-cloud-android-design.md §1 §4
ARG NODE_IMAGE=node:22-alpine

# ---------------------------------------------------------------- builder
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# 先只拷清单，让依赖层能命中缓存
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# public/demo-art(约 54MB) 与 public/demo-data(约 7MB) 只服务设计预览页，
# 生产入口 index.html 完全不引用；vite 会把 public/ 整个拷进 dist，所以这里删掉。
RUN npm run build \
 && rm -rf dist/demo-art dist/demo-data \
 && node -e "const fs=require('fs');const ok=fs.existsSync('dist/index.html');if(!ok){console.error('dist/index.html missing');process.exit(1)};console.log('dist ready')"

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    TZ=Asia/Shanghai

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY src ./src
COPY scripts ./scripts

# server 从 ../src/... 导入 db/models，dist 由 Node 直接托管；
# /srv/images 是内容寻址的图片目录（nginx 只读直出，Node 写入）。
# src/db/storage 由 dualStorageManager 在运行期 mkdir，必须对非 root 用户可写。
RUN mkdir -p /srv/images src/db/storage \
 && chown -R node:node /app /srv/images

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
