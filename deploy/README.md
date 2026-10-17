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

## 推送（阶段 6：一条命令把本机数据推到云端）

云端仓库在 `/srv/hengbeger`（`--dir` 可改）。数据先在本机导好，然后：

```bash
npm run cloud:export && npm run cloud:images     # 1. 本机导出数据与两档图片（只读快照）
node scripts/cloud/push-data.mjs --host <公网IP> --dry-run   # 2. 空跑：只看将执行的命令
node scripts/cloud/push-data.mjs --host <公网IP>             # 3. 真推：上传 + 远端导入 + 复核
```

它按顺序做五件事，任何一步失败就停下来并报出是哪一步（**前面的步骤已经生效**）：

1. 本地校验数据包（`manifest` 的字节数/sha256/行数，加两档图片的张数与字节数）——
   包不完整就直接拒绝上传；
2. 打成 `deploy/packages/hengbeger-package.tar.gz`（纯 Node 写的 ustar，实测 92 MB → 76.9 MB / 3437 个文件）；
3. `scp` 到 `<用户>@<IP>:/srv/hengbeger/incoming/`；
4. `ssh` 远端解包到 `deploy/import`（**先 `rm -rf deploy/import` 再解**，那个目录里只放上传的包）；
5. 先 `docker compose up -d --force-recreate app`，再在 app 容器里跑 `import-data.mjs`，最后跑一次 `--check` 复核。
   为什么要重建容器：`./import:/import:ro` 这种绑定挂载只在**容器创建时**解析源目录，
   首次 `up` 时 `deploy/import` 还不存在的话，容器里 `/import` 会永远是个空目录（Docker 不会自愈），
   导入就报「没有找到 manifest.json」。重建一次即可，导入本身仍是幂等的。

常用参数：`--user`（默认 root）、`--port`、`--key`（私钥）、`--password-auth`
（默认是 `BatchMode=yes`，只走密钥/agent，不弹密码）、`--check`（只读看云端现状）、
`--skip-upload`（只校验+打包）、`--skip-import`（上传解包但不导入）、`--dry-run`（只打印命令，零副作用）。
也可用环境变量 `HENGBERGER_CLOUD_HOST/USER/PORT/DIR/KEY`。

第一次连一台新机器会写 `known_hosts`（`StrictHostKeyChecking=accept-new`）；
主机指纹变了会直接拒绝连接，这是有意的。

自检：`npm run cloud:test`（18 个用例：tar 打包器、ssh/scp 参数、失败中止、dry-run 零副作用等）。

## 上云

已在阿里云 ECS **39.102.49.72**（2 核 / 1.6G / Ubuntu 22.04）上跑通，步骤与实测如下。

1. ECS 安全组放行 `8443/tcp`（源可以是 `0.0.0.0/0`，个人服务够用），服务器上再 `ufw allow 8443/tcp`
2. 装 Docker + compose 插件（`apt-get install -y docker.io docker-compose-v2`），代码放到 `/srv/hengbeger`
3. `cd /srv/hengbeger`，按上面的"首次准备"生成 `.env` 与证书（`node deploy/scripts/make-cert.mjs --ip <公网IP>`）
4. `docker compose -f deploy/docker-compose.yml up -d --build`
5. 本机 `npm run cloud:export && npm run cloud:images`，然后 `node scripts/cloud/push-data.mjs --host <公网IP>`
6. 浏览器开 `https://<公网IP>:8443`，再跑一次与预演相同的验收（见上）——注意证书是自签的，浏览器会拦一次

回滚：`APP_TAG` 换成上一版标签重新 up 即可（每次发布用日期打标签，例如 `APP_TAG=2026-10-14`）。

### 实测踩过的坑（2026-10-15，ECS 39.102.49.72）

- **Docker Hub 不可达**：`registry-1.docker.io` 被 DNS 污染（解析到 `2a03:2880:...`），直接 `docker pull` 必然失败。
  要在 `/etc/docker/daemon.json` 里配国内镜像源，实测可达的有
  `docker.m.daocloud.io`、`docker.1ms.run`、`docker.1panel.live`、`dockerproxy.net`，改完 `systemctl restart docker`。
- **`git clone` 走 HTTPS 不稳**：`git ls-remote https://github.com/...` 会超时，`git clone` 报
  `GnuTLS recv error (-110)`。代码上云改用 `git archive --format=tar.gz`（约 68 MB）scp 过去解包。
- **容器 `/import` 空挂载**：见上面「推送」第 5 步，`up -d --force-recreate app` 解决。
- **PowerShell 里别手拼远端命令**：`ssh "...for p in ...; do ...; done"` 会因为引号嵌套报
  `bash: -c: line 2: syntax error: unexpected end of file`。复杂远端脚本一律「写 `.sh` → `scp` →
  远端 `tr -d '\r'` 清洗后 `bash` 执行」（PowerShell 管道送过去的是 CRLF，不清洗会报 `$'\r': command not found`）。
- 验收结果：`/api/catalog/index` 200（2,846,971 字节，2675 条 / 23 个分组 / 2518 条带图）、
  `/img/t/*.webp` 200 `image/webp`、`/api/data`、`/api/auth/session`、`/metrics` 全 403。
- 证书 SAN 是 `IP Address:39.102.49.72`，有效期到 2036-10-12；**证书进仓库的副本在 `deploy/certs/cloud-server.crt`**，
  App 侧靠它做信任锚（`npm run mobile:pins`）。


## 运维

```bash
# 状态与日志
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f --tail=100 app

# 数据库备份（导到 deploy/backups/，手动跑一次）
docker compose -f deploy/docker-compose.yml exec -T mysql \
  sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > deploy/backups/hengbeger-$(date +%F).sql

# 只重启应用（改代码后）
docker compose -f deploy/docker-compose.yml up -d --build app
```

### 每日自动备份

`deploy/scripts/backup.sh` 是云端那份备份脚本（mysqldump → gzip → `deploy/backups/`，只留最近 14 份）。
已经装在 ECS 39.102.49.72 上：脚本在 `/srv/hengbeger/deploy/backup.sh`，root crontab 里是
`30 3 * * * /srv/hengbeger/deploy/backup.sh >> /var/log/hengbeger-backup.log 2>&1`（实测跑出 3.0 MB 的 `.sql.gz`）。
新机器上部署时：`scp deploy/scripts/backup.sh <host>:/srv/hengbeger/deploy/backup.sh`，
远端 `tr -d '\r' < … | sponge`（或先 `tr` 到临时文件再 `mv`）清掉 CRLF、`chmod +x`，再加 crontab。

备份要定期拉到本机（`scp <host>:/srv/hengbeger/deploy/backups/*.sql.gz db-backups/`）——卷丢了只能靠它。

## 已知限制

- **自签证书**：浏览器每次会警告；App 端靠证书固定，不受影响。换域名 + 备案后可以换成 Let's Encrypt，那时把 8443 换成 443 并打开 HSTS。
- **单机**：没有冗余。MySQL 卷丢了就得靠备份恢复，所以备份要定期拉到本机。
- **镜像里只有 demo-art 的一部分**：`covers/`（首页三张世界卡片）、`fonts/`（全站字体）与根级 9 张插画
  （世界页 hero + 详情页肖像）会进镜像，`previews/` 与 `demo-data/` 被 `scripts/trim-dist.mjs` 裁掉。
  这条边界曾经写错过一次，代价是线上首页破图 + 全站字体静默退化，
  完整事故记录见 `docs/incidents/2026-10-16-demo-art-404.md`——改 `.dockerignore` 前先读它。
- **旧后台接口在云端不可用**：`/api/*` 除 catalog 外全被 nginx 挡在门外，这是刻意的——个人服务不需要暴露后台。
- 端口号写死在 compose 与证书里；换端口要同时改 `.env`、安全组和 App 里配置的地址。
