# deploy —— 云端托管与本机预演

设计依据：[docs/plans/2026-10-14-cloud-android-design.md](../docs/plans/2026-10-14-cloud-android-design.md)。
这里只放"怎么跑"，不放"为什么这么选"。

## 这套东西是什么

一台 ECS 上用 Docker Compose 起三个容器：

```
浏览器 / 安卓 App
      │  https://<ECS公网IP>:8443    （大陆无域名，走不了 80/443）
      ▼
   nginx ── 只放行 /api/catalog/、/img/、/health*、SPA 静态资源
      │      其余 /api/* 与 /metrics 一律 403
      ▼
    app ── Node 22 + Express（就是本机那套 server/index.js）
      │
      ▼
   mysql:8.0 ── 只在 internal 网络里可见，公网碰不到
```

图片走具名卷 `images`，nginx 用 `/img/` 直出（阶段 4 落地后 app 才往这个卷写文件）。

## 目录

| 文件 | 作用 |
| --- | --- |
| `Dockerfile` | 多阶段构建：装依赖 → vite build → 只留运行必需 |
| `docker-compose.yml` | 云端正式栈，项目名 `hengbeger-cloud`，端口 8443 |
| `docker-compose.preview.yml` | 本机预演覆盖层，项目名 `hengbeger-preview`，端口 8444 |
| `nginx/nginx.conf` | TLS 终止、路径白名单、图片直出 |
| `.env.example` | 配置模板（键名说明都在这） |
| `scripts/gen-secrets.mjs` | 生成 `deploy/.env`，密钥现场随机 |
| `scripts/make-cert.mjs` | 生成自签证书（本机有 openssl 就用本机，没有就借 alpine 容器） |
| `scripts/verify-preview.mjs` | 预演验收，逐条打 PASS/FAIL |
| `../scripts/cloud/*.mjs` | 导出数据包与图片、导入到云端（阶段 1/2/3，见下面三节） |

生成物（都不进 git）：`.env`、`ssl/`、`data/`（云端的 MySQL 数据）、
`data-preview/`（预演的 MySQL 数据）、`import/`（导入中间文件）、`backups/`。

## 首次准备

前置：Docker Desktop 正在运行（`docker version` 有输出）。

```bash
npm run cloud:secrets   # 生成 deploy/.env，密钥不回显
npm run cloud:cert      # 生成 deploy/ssl/server.crt|key，并打印 SHA256 指纹
```

云端还要多一步：把 ECS 公网 IP 写进证书 SAN，否则 App 那边的证书固定对不上。

```bash
node deploy/scripts/make-cert.mjs --ip 47.98.1.2   # 推荐：直调，参数一定到得了
npm run cloud:cert "--" "--ip" "47.98.1.2"         # 等价写法：-- 必须加引号
```

> **PowerShell 5.1 的坑**：写成 `npm run cloud:cert -- --ip 1.2.3.4` 时，裸 `--` 会被 PowerShell 吞掉，
> npm 再把 `--ip` 当自己的配置收走，脚本一个参数都收不到，**默默签出一张只有 localhost 的证书**。
> 脚本在没收到 `--ip`/`--dns` 时会打印醒目警告。同理适用于 `cloud:export` 的参数。

## 本机预演

```bash
npm run cloud:preview:up       # 构建 + 起栈（首次会拉镜像，几分钟）
npm run cloud:preview:verify   # 验收，全 PASS 才算过
npm run cloud:preview:logs     # 看日志
npm run cloud:preview:down     # 停栈（数据卷保留）
```

浏览器打开 <https://127.0.0.1:8444> —— 自签证书，Chrome 会拦一次，
点"高级 → 继续前往"即可（这是自签的必然代价，不是配置错误）。

预演与云端**数据天然隔离**：项目名不同 → 卷名不同
（`hengbeger-preview_images` vs `hengbeger-cloud_images`），
MySQL 数据目录也各自独立（`deploy/data/mysql` vs 云端的 `/srv/hengbeger/data/mysql`）。
预演怎么折腾都不会碰到本地开发库 `hengbeger`。

想彻底重来：

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.preview.yml down -v
rm -rf deploy/data deploy/data-preview deploy/ssl deploy/.env
```

## 验收清单

`npm run cloud:preview:verify` 会跑完下面这些；手工核对时用同样的路径。

- [ ] TLS 握手成功（TLSv1.3），证书 CN/到期时间合理，且指纹与 `deploy/ssl/server.crt` 一致
- [ ] `GET /health/live` → 200（进程活着）
- [ ] `GET /health/ready` → 200（数据库通了）
- [ ] `GET /` → 200 且是那份 SPA HTML
- [ ] `GET /api/catalog/index` → 200 JSON 且能读出条目数；**全新空库上按设计返回 503「资料库尚未导入，请完成数据同步。」**也接受（`catalog_entries`/`catalog_assets` 不归 `sync({})` 建，要等阶段 3 导入），导入后必须变成 200
- [ ] 导入过数据后：`GET /api/catalog/index` 的条目数与 `deploy/import/manifest.json` 里的 `data.entries.count` 一致
- [ ] `IMAGE_MODE=file` 时接口给的是 `/img/t/<sha256>.webp` + `/img/d/<sha256>.webp`，且按这个地址真能取回图：
      两条都要 200 + `content-type: image/webp` + `Cache-Control: public, max-age=31536000, immutable`
      （这一条同时压住三件事：nginx 直出、图片具名卷、阶段 3 的导入）
- [ ] `/api/data`、`/api/auth/session`、`/api/storage/status`、`/metrics` → 403（nginx 挡住旧后台接口）
- [ ] `GET /img/does-not-exist.png` → 404（图片直出路由通了）。已实测正例：以 `node`(uid 1000) 身份往 `/srv/images` 写文件后，`GET /img/<该文件>` 返回 200 且响应头带 `Cache-Control: public, max-age=31536000, immutable`
- [ ] `docker compose ps` 三个容器都是 `healthy`
- [ ] 全新空库能自举（生产模式 `sync({})` 直接建表）：
      `docker compose -f deploy/docker-compose.yml exec mysql sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "show tables"'`
      应列出 15 张表（`agents app_meta bumbos drive_disks factions hsr_characters hsr_cones hsr_elements hsr_paths hsr_rarities hsr_relic_types hsr_relics rarities roles sound_engines`；`catalog_entries`/`catalog_assets` 不在其中，由阶段 3 的导入创建）

### 最近一次预演结果（2026-10-14，本机）

数据灌进去之后再验收：`npm run cloud:preview:verify` **15/15 PASS**（阶段 0 的 11 条 + 阶段 5 的 4 条：
条目数与 manifest 一致、出图地址是 `/img/...`、t 档与 d 档都能取回）；
导入本身跑两遍都是幂等的（第二遍条目重写、小表整体替换、图片 1710+1710 全部跳过）。
三个容器全 healthy；空库自举日志
`Database initialization complete | {"destructive":false,"allowAlter":false,"seededZzz":true,"seededHsr":true}`。

为让全新空库能自举，本次改了 `src/db/models/soundengine.js` 与 `src/db/models/bumbo.js`：
删掉 TEXT 列上的 `defaultValue: '/assets/zzz.jpg'`（MySQL 8 不接受 BLOB/TEXT/JSON 的默认值，
会让 `sync()` 的 CREATE TABLE 直接失败）。已有库不受影响——写入方（`initializedata.js` / `api.js`）
本来就显式兜底这个路径。

## 数据包（阶段 1：把本地库导出成上云用的包）

图片不在这里——`catalog_assets` 那 1710 张（315 MB base64）走阶段 2 的图片通道。

```bash
npm run cloud:export          # 只读导出一份到 deploy/import/（约 19 MB）
npm run cloud:export:count    # 只连库数一数，不写任何文件
npm run cloud:export:verify   # 不连库，只校验已导出的包（文件/字节数/sha256/行数）
```

产物：`deploy/import/manifest.json` + `entries.jsonl`（`catalog_entries` 全量）+ `tables/*.jsonl`（旧后台 15 张小表）。
导出全程只读（`REPEATABLE READ` + `CONSISTENT SNAPSHOT`），本地库一个字节都不写；`deploy/import/` 已在 `.gitignore` 里。

## 图片（阶段 2：base64 解出来，转成两档 WebP）

云端不让应用从 MySQL 读图出图：一次性转成静态文件，交给 Nginx 直出（`IMAGE_MODE=file`）。

```bash
npm run cloud:images          # 解 base64 → 落 t/d 两档 WebP 到 deploy/import/images/
npm run cloud:images:verify   # 不连库，只比对张数与字节数
```

- 两档：`t/` 宽 320（列表/网格）、`d/` 长边 1280（详情页）。**不搬原图**。
- 文件名 = 图片内容的 sha256，与该行 `catalog_assets.hash` 一致；导出前逐张校验，对不上就跳过并报错。
- 实测 1710 张：t 22.8 MB + d 51.1 MB = 73.9 MB（原 base64 315 MB）；整包 = entries 18 MB + images 73.9 MB ≈ **91.8 MB**。
- 转码用本机 devDependency `sharp`；云端不装任何图像处理库。

出图两态由环境变量 `IMAGE_MODE` 决定：容器里一律 `file`（compose 里给了默认值），
本机跑 `npm run server` 不设它 → `db`（老路，图片走 `/api/catalog/images/<hash>`）。
`file` 模式下「这张图有没有」以磁盘上的 `t/<hash>.webp` 为准（目录清单缓存 60s），
所以云端**不需要**导入 `catalog_assets` 那张 315 MB 的表。

## 导入（阶段 3：把包灌进云端库与图片卷）

导入脚本在 **app 容器里**跑：容器里有 node_modules、能连到 `mysql`、`/srv/images` 是图片卷，
宿主的 `deploy/import` 以只读方式挂在容器 `/import`。

```bash
# 本机预演（一条命令，走 preview 栈的 app 容器）
npm run cloud:preview:import:check   # 只读体检：包完整吗、云端差多少条
npm run cloud:preview:import         # 真导入

# 云端（阶段 6 会用 npm run cloud:push 把 scp 与这一步串起来）
docker compose -f deploy/docker-compose.yml exec -T app \
  node scripts/cloud/import-data.mjs --dir /import
```

语义（设计文档 §2.3）：

- `catalog_entries` 是 upsert；**默认什么都不删**。要删必须显式 `--prune`，
  而且只给 `--prune` 时只打印待删清单，再加 `--yes` 才真的动手。
- 旧后台那 15 张小表按**整表替换**写入（关外键检查 → `DELETE` → 按包原样写回，连本地 id 一起照抄），
  整体一个事务，失败就回滚。原因：这些表在云端是只读参考数据，但 app 首次启动会用种子数据灌一遍，
  种子 id 是自增出来的、与本地库对不上，而 `name` 上有唯一索引——按主键 upsert 会在 id 与 name 之间
  互相顶掉（`Duplicate entry '天琴座' for key 'factions.name'`）。幂等性由「包是唯一真相」保证。
- 替换完成后自动跑一次**外键完整性检查**：包内小表之间不允许有悬空引用，有就报失败并 exit 1。
- 导入后做**逐键回查**：包里 2675 个 `entry_key` 必须全部存在且 `content_hash` 一致，
  任何一条对不上就 exit 1 —— 宁可不报成功，也不让云端带着半套数据对外服务。
- 图片按内容寻址，目标已存在且大小相同就跳过，重复导入是幂等的。
- 旧后台那 15 张表如果云端还没有（表由 app 启动时 sequelize 自动建），会跳过并提示，建好后重导一次即可。
- 只读体检用 `--check`；**不要用 `--dry-run`**，那是 npm 自己的标志，会被 npm 截走。

导入完成后 `IMAGE_MODE=file` 的出图地址以磁盘 `t/` 档为准（目录清单缓存 60 秒），最多一分钟生效。

## 上云

阶段 6 才执行；没有用户提供的 ECS 信息（公网 IP、能否装 Docker、实例配置）之前不动手。

1. ECS 安全组放行 `8443/tcp`（源可以是 `0.0.0.0/0`，个人服务够用）
2. 装 Docker + compose 插件，`git clone` 到 `/srv/hengbeger`
3. `cd /srv/hengbeger`，按上面的"首次准备"生成 `.env` 与证书（`--ip <公网IP>`）
4. 从本机导出数据（`npm run cloud:export`，阶段 1 落地）并 scp 到 `deploy/import/`
5. `docker compose -f deploy/docker-compose.yml up -d --build`
6. 导入数据（阶段 3 落地），再跑一次与预演相同的验收

回滚：`APP_TAG` 换成上一版标签重新 up 即可（每次发布用日期打标签，例如 `APP_TAG=2026-10-14`）。

## 运维

```bash
# 状态与日志
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f --tail=100 app

# 数据库备份（导到 deploy/backups/）
docker compose -f deploy/docker-compose.yml exec -T mysql \
  sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > deploy/backups/hengbeger-$(date +%F).sql

# 只重启应用（改代码后）
docker compose -f deploy/docker-compose.yml up -d --build app
```

## 已知限制

- **自签证书**：浏览器每次会警告；App 端靠证书固定，不受影响。换域名 + 备案后可以换成 Let's Encrypt，那时把 8443 换成 443 并打开 HSTS。
- **单机**：没有冗余。MySQL 卷丢了就得靠备份恢复，所以备份要定期拉到本机。
- **镜像里没有 demo-art / demo-data**：这两个目录是仓库里的演示数据（约 60MB），生产入口不引用，构建时已删。
- **旧后台接口在云端不可用**：`/api/*` 除 catalog 外全被 nginx 挡在门外，这是刻意的——个人服务不需要暴露后台。
- 端口号写死在 compose 与证书里；换端口要同时改 `.env`、安全组和 App 里配置的地址。
