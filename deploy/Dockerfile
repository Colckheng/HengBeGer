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

# vite 会把 public/ 整个拷进 dist。这里按「生产是否真的引用」裁剪，并做引用完整性校验：
#   - 保留 covers/ 与 fonts/       ：首页三卡 + 全站字体
#   - 保留根级 9 张插画            ：世界页 hero 图 + 详情页肖像图
#   - 删掉 previews/ 与 demo-data   ：只有 DemoApp 设计总览用得到
# 校验逻辑在 scripts/trim-dist.mjs（可本机单独跑、可读、可加单测）：
# 扫 dist 里所有文本产物的 /demo-art/ 引用，缺一个就让构建失败。
# 背景：.dockerignore 曾把 public/demo-art 整目录排除，线上首页三卡全部 404、
# 全站字体静默退化成系统字体，只能靠肉眼发现 —— 这类问题必须在构建期炸掉。
RUN npm run build && node scripts/trim-dist.mjs

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
