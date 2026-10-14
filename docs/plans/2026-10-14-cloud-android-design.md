# 云端托管与安卓 App 设计（2026-10-14）

> 状态：设计定稿，待实施。用户已逐节确认第 1–6 节。
> 实施前置：需要用户提供阿里云 ECS 的连接信息；在此之前只做本机预演（§4.7）。

## 背景

用户提出两个诉求：

1. 把项目托管到自己的阿里云服务器，**尽量别影响现在本地的数据**——重新起一套新的，让现在的本地那套和云端那套互不冲突。
2. 增加一个手机端 App（**不是网页，是原生软件**），同样连云端。

### 现有资产实测

| 内容 | 事实 |
|---|---|
| 服务形态 | 单进程 Express 5，3001 端口同时提供 `/api/*` 与静态 `dist/`（SPA 回退） |
| 安全能力 | helmet、全站限流 200/min、登录限流、`/health/live` + `/health/ready`、metrics、管理员会话（cookie 与 Bearer 双支持） |
| `catalog_entries` | 2675 行 / 17.5 MB（JSON payload），2675 条全部有 `imageHash` |
| `catalog_assets` | 1710 行 / 315.2 MB（base64 存于 LONGTEXT），2518 处引用去重到 1710 份 |
| 图片格式分布 | PNG 784 张 257.7 MB（**82%**）、WebP 923 张 57.2 MB、JPEG 3 张 |
| 旧后台小表 | agents / factions / sound_engines / bumbos / drive_disks / hsr_* 等 15 张，合计 < 1 MB |
| 本地资源 | `public/` 60.9 MB、`data/` 15.3 MB、`dist/` 63 MB |
| 本地 Docker | 已安装 Docker 28.3.2（可用于本机预演） |
| 安卓工具链 | Android Studio、SDK 34/35/36、build-tools、adb 齐全；**PATH 上的 Java 是 1.8，需改用 Android Studio 自带 JBR** |
| 现有部署文档 | `docs/06-deployment.md`（PM2 + Nginx，含 `TRUST_PROXY_HOPS` 必读项） |

## 零、约束与方案选型

### 用户设定

- 服务器：阿里云，**大陆地域**
- **不要域名**，直接用公网 IP
- 个人自用
- 数据全部上云，关注加载速度
- 先出安卓

### 由此推出的三条硬约束

1. **80/443 不可用**。大陆机房在标准端口提供 web 服务需要域名 + ICP 备案；无域名 → 只能走高位端口（8443）。
2. **Let''s Encrypt 签不了**。ACME 校验必须走 80 或 443，二者均不可用 → 只剩「自签证书 + App 内证书固定」。
3. 定位是**个人服务**而非公开发布：安全模型可以简化，但不接受明文传输管理员凭据。

### 选型结论

| 领域 | 选定 | 否决的备选 |
|---|---|---|
| 云端 | **方案 A：Docker Compose 单机全栈 + 高位端口自签 TLS** | B 裸机 PM2（环境不可复现）；C 阿里云 RDS+OSS（成本高数倍） |
| 手机端 | **方案 A：React Native + Expo** | B Flutter（Dart 重学、代码零复用）；C Capacitor 套壳（正是用户否定的"网页套壳"） |

选 Docker 的核心理由：用户要的正是"重新来一套新的、跟本地不冲突"，Docker 的隔离性与可复现性正好对上；而且图片落盘 + Nginx 出图这一步三个方案都躲不掉。

## 1. 整体拓扑

```
本地电脑（内容车间）
  MySQL 127.0.0.1:3306 / hengbeger    <- 采集、整理、修数据的真相源
  Node 3001 + Vite 5173               <- 本地预览，照常跑，不受影响
        |
        | (1) 一次性全量导出   (2) 以后按需推增量
        v
阿里云 ECS（生产 —— App 的唯一后端）
  :8443  Nginx --+-- /api/*  -> Node 3001（只监听 127.0.0.1）
                 +-- /img/*  -> 直接读磁盘图片（t/ 缩略图、d/ 显示图）
  MySQL hengbeger_prod   <- 云端自有，永不回写本地
  数据卷  /srv/hengbeger/{data/mysql, data/images}
        ^
        |  HTTPS + 证书固定
        |
  安卓 App —— 只有一行 baseUrl = https://<ECS_IP>:8443
              对"本地"这个概念一无所知
```

### 这个前提推出三件事

1. **云端必须自给自足**：2675 条条目 + 1710 张图必须全在云上。首次导入是「全量 + 可校验」的一次性动作，不能"传一半先用着"。
2. **本机角色变了**：从"服务器"降级为"内容车间"。以后改数据的流程是 本机改 -> 导出 -> 推云端。
3. **必须有增量更新通道**：否则改十个条目就要传几百 MB。

### 导出源的更正

导出的源是**本地 MySQL，不是 `data/` 目录**。因为本地 DB 比 `data/` 新：`hsr/characters` 的正文在 DB 里更长、字段更全（带 image / image_source），光锥正文也是在 DB 中修复的。`data/` 只是车间的原料。

## 2. 数据迁移与增量更新

### 2.1 搬什么

| 内容 | 体积 | 搬运 | 说明 |
|---|---|---|---|
| `catalog_entries` | 2675 条 / 17.5 MB | 搬 | 网站与 App 的唯一数据源 |
| `catalog_assets` | 1710 张 / 315 MB | 搬，但**转成文件** | 云端不再用 base64 存库 |
| 旧后台 15 张小表 | < 1 MB | 搬 | 太便宜，不带白不带；云端只读 |
| `data/` Markdown | 15.3 MB | 不搬 | 原料，不是成品 |
| `public/demo-art` | 53.8 MB | 不搬 | 仅设计总览页使用 |
| `reports/` `db-backups/` | - | 不搬 | 本机审计件 |

依据：前端实际只调用 `/api/catalog/index` 与 `/api/catalog/entry` 两个接口，公开页面完全不碰旧后台那套（旧后台只服务 `AdminPanel` / `HsrAdminPanel` / `ZZZWiki`）。

### 2.2 首次全量：分两趟搬

- **条目走数据通道**：导出成 JSONL（约 20 MB），云端事务入库。
- **图片走文件通道**：本地把 base64 解成真实图片 -> 生成缩略图与显示图 -> 打包 tar -> 云端解包到 `/srv/hengbeger/data/images/`。

理由：图片反正要落盘，本地解一次比"传 315 MB 上云再解一次再落盘"省一半事；缩略图在本机算好，上行传的是小图。云端数据库因此只有约 20 MB，备份从"慢"变"秒"。

### 2.3 增量怎么算

- **条目**：按 `content_hash` 比对，只传"云端没有的" + "hash 不一样的"。
- **图片**：内容寻址，文件名即 sha256 -> 只传云端缺失的文件，**永远不需要"更新"图片**。天然幂等。
- **删除：默认不删。** 要删必须显式 `--prune` 且把待删清单打出来供确认。理由：增量传输一旦某次导出不完整，自动删除会清掉线上数据，不值得为省那一下冒险。

整包形态：`manifest.json` + `entries.jsonl` + `images/`，带整包 sha256。

### 2.4 一致性保证

manifest 记录：导出时间、条目数、图片数、总字节、条目 `content_hash` 的聚合值。云端流程为「先全量校验 -> 写临时表 -> 与 manifest 比对 -> 事务提交」，任何一项不一致整体回滚。导入幂等。

### 2.5 触发方式

- `npm run cloud:push` = 本地导出 -> scp 上传 -> 远程触发导入 -> 回报结果摘要
- `npm run cloud:status` = 查看云端数据状态

### 2.6 旧后台处置

15 张小表照搬上云（不到 1 MB，避免页面缺数据），但**云端不开放管理员登录**。实现方式为零代码：Nginx 层 `location /api/auth/ { deny all; }`，同时封掉旧后台写接口。用户改数据一律走本机 -> 推云端。

## 3. 图片落盘与缩略图

### 3.1 重心：PNG 占了 82%

| 格式 | 张数 | base64 占用 | 占比 |
|---|---|---|---|
| **PNG** | **784** | **257.7 MB** | **82%** |
| WebP | 923 | 57.2 MB | 18% |
| JPEG | 3 | 0.3 MB | - |

首屏慢的真正原因不是图片多，是这 784 张 PNG 没压缩。转 WebP 后这部分可降到 40–60 MB 量级，是整个云端优化里最大的一笔。

### 3.2 云端目录

```
/srv/hengbeger/data/images/
  t/<sha256>.webp    缩略图  320px 宽      列表 / 网格用
  d/<sha256>.webp    显示图  长边 1280     详情页用
```

**不搬原图**。理由：App 是拿来看的，不是下载素材的；本机原始数据一个字节没丢，将来要加 `f/` 目录不影响任何已有设计。上行因此从 315 MB 降到约 115 MB。

| 档 | 规格 | 单张 | 1710 张合计 | 用途 |
|---|---|---|---|---|
| `t` | 320px 宽 WebP q80 | ~18 KB | ~30 MB | 列表、网格 |
| `d` | 长边 1280 WebP q85 | ~50 KB | ~85 MB | 详情页 |

文件名 = 内容 sha256 -> 永久不可变 -> `Cache-Control: immutable` 名正言顺，客户端一辈子只下一次。

### 3.3 谁生成

**在本机生成，用 `sharp`**（一次性，1710 张约几十秒）。云端只存文件、**不装任何图像处理库**，运行时零图像开销。

### 3.4 云端怎么出图（Nginx 直出，Node 不碰图片）

```nginx
location /img/ {
  alias /srv/hengbeger/data/images/;
  expires 1y;
  add_header Cache-Control "public, immutable";
  open_file_cache max=2000 inactive=1h;
}
```

加上分级尺寸后，一屏列表从约 3.4 MB 降到约 0.5 MB：1 Mbps 约 4 秒，3 Mbps 秒开。

### 3.5 接口改动（本机零影响）

现状：`server/openIndex.js:154` 死写 `/api/catalog/images/<hash>`。改为按环境变量分两态：

- 云端 `IMAGE_MODE=file` -> `image` 给 `/img/t/<hash>.webp`，另加 `imageLarge` 给 `/img/d/<hash>.webp`
- 本机不设该变量 -> **完全走老路，一个字节不变**

`server/catalog.js` 的 `/images/:hash` 保留不动（本机仍需要）。改动是纯增量。

### 3.6 附带好处

RN 的 `<Image>` 自带原生内存 + 磁盘缓存，配合 immutable 头与缩略图，"看过的就能离线看"基本白送（在 §5.5 兑现）。

## 4. 部署流程

### 4.1 ECS 目录

```
/srv/hengbeger/
  app/              代码（git clone）
  deploy/           compose + Dockerfile + nginx.conf + 脚本
  data/mysql/       MySQL 数据卷
  data/images/      图片（t/ d/）
  certs/            自签证书
  backups/          mysqldump 定时备份
  import/           上传的数据包落点
  .env              云端配置（全部新生成的密钥）
```

### 4.2 三个容器

```yaml
services:
  mysql:            # 8.0，数据卷落盘，不映射宿主端口
    command: --innodb-buffer-pool-size=384M --character-set-server=utf8mb4
  app:              # Node，只 expose 3001，不对外映射
    environment: { NODE_ENV: production, IMAGE_MODE: file, TRUST_PROXY_HOPS: "1" }
  nginx:            # 唯一对外，监听 8443
    volumes: 证书 + 图片目录（只读）
```

`app` 只监听容器内网，公网看不到 3001。`TRUST_PROXY_HOPS=1` 是 `docs/06-deployment.md` 记录过的坑，必须带上。

**密钥全部重新生成**（`DB_PASSWORD` / `AUTH_SECRET` / `ADMIN_PASSWORD` 用随机强值），不复用本机弱密码。

### 4.3 首次部署八步

1. 阿里云安全组放行 **8443**（22 保留）
2. 装 Docker + compose 插件
3. 上传 `deploy/`，拉代码
4. 生成 `.env`（随机密钥）
5. 生成自签证书（见 4.4）
6. `docker compose up -d`
7. 导出数据包 -> 上传 -> 导入
8. 验收：`curl -k https://<IP>:8443/health/ready`

### 4.4 自签证书

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=hengbeger" -addext "subjectAltName=IP:<ECS_IP>"
```

**有效期 10 年**。理由：App 做了证书固定，换证书就要重新打包 App，90 天轮换在这里是自找麻烦。

App 侧做法：把 `cert.pem` 放进 `res/raw/`，用 `network_security_config.xml` 声明只信任它（比记指纹更易维护）。

### 4.5 三种更新

| 更新什么 | 怎么做 |
|---|---|
| 代码 | 本机 push -> ECS `git pull` -> `docker compose up -d --build` |
| 数据 | `npm run cloud:push`（§2 的通道） |
| 配置 | 改 `.env` -> `docker compose up -d` |

### 4.6 备份

- 云端：cron 每天 `mysqldump` -> `backups/`，保留 14 天（DB 约 20 MB，压缩后几 MB）
- 阿里云：ECS 快照每周一次（可选，防机器级故障）
- 本机：现有 `db-backups/` 机制不动

### 4.7 本机预演（上云前必做）

用本机 Docker 把整套 `deploy/` 跑起来：

- 端口映射到 **8444**（避开 8443，也避开现有 3001/5173）
- MySQL 用新库名 `hengbeger_prod`，独立数据卷，与本机 3306 的 `hengbeger` 物理隔离，**一个字节都碰不到**
- 数据从本机 `hengbeger` 导出 -> 导入容器内 `hengbeger_prod`

收益：在花一分钱上云之前，把 TLS、Nginx、图片出图、接口、App 联调全部验证一遍，风险为零。全绿后原样搬上 ECS。

### 4.8 代码上云方式

- **A** `git clone` / `git pull`（首选，可持续更新）
- **B** `git bundle` 走 scp（大陆访问 GitHub 不稳时的备胎，`.git` 打包 67 MB）
- **C** 每次传 tar 包

计划：先实测 A，失败自动退到 B；两条路都写进脚本。

## 5. 安卓 App 结构

### 5.1 技术栈

React Native + Expo（prebuild 模式，以便注入 `network_security_config.xml`）+ `expo-router` 导航 + `expo-sqlite` 缓存 + `react-native-markdown-display` 渲染正文。

**公式降级**：正文数学公式（Web 端 `rehype-katex`）在 RN 无现成等价物，而公式条目只有 3 条（`hsr/formula` 2 + `zzz/formula` 1），先按纯文本渲染，不引入 WebView。

### 5.2 复用清单（逐个核查过）

| 模块 | 能否复用 | 说明 |
|---|---|---|
| `src/demo/contentModel.js` | 可以直接用 | 纯 JS，零依赖零 DOM：正文解析、章节切分、属性表抽取 |
| `src/open-index/copy.js` | 可以直接用 | 文案常量 |
| `src/api/config.js` | 可以直接用 | 服务器地址配置 |
| `src/demo/model.js` / `navigation.js` / `worlds.js` | 要先解耦 | 依赖 DOM（`href` 用了 `window`） |
| `src/api/client.js` | 要重写 | axios + localStorage -> fetch + AsyncStorage |

结论：核心数据解析逻辑原样搬，网络层与导航层重写。

### 5.3 目录

```
mobile/
  app/                    expo-router 路由
    _layout.tsx
    index.tsx             首页：三个世界入口
    list.tsx              图鉴：分类 / 搜索 / 筛选 / 分页
    entry/[key].tsx       详情：档案 + 正文
    settings.tsx          服务器地址 / 缓存 / 关于
  src/
    api/                  基于 fetch 的客户端 + 类型
    content/              复用 contentModel
    ui/                   组件
    store/                SQLite 缓存 + 收藏/历史
```

### 5.4 页面

- **首页**：三世界卡片（绝区零 / 星穹铁道 / 货币战争）作视觉主线，**单列**；每张卡片下挂「最近更新」与「常用分类」快捷入口。不做 Web 的多列网格与侧栏。
- **图鉴**：分类树 -> 缩略图网格 -> 搜索 / 筛选 / 分页
- **详情**：属性表 + 正文分节 + 大图
- **设置**：服务器地址（可覆盖默认）、清缓存、版本

依据：手机首页的价值是"两步内到达目标"；三个世界是内容结构而非导航结构，当装饰性主线可以，当唯一入口就绕了。

### 5.5 离线策略

| 内容 | 做法 |
|---|---|
| 索引（约 2.6 MB） | 首次拉取存 SQLite，启动先用缓存、后台刷新 |
| 条目详情 | 看过就存 |
| 图片 | RN `<Image>` 自带原生磁盘缓存 + immutable 头 |
| 收藏 / 历史 | SQLite，纯本地 |

效果："看过的东西断网也能看"。

### 5.6 代码位置

同仓库 `mobile/` 子目录，用 Metro 的 `watchFolders` 指向仓库根，直接 import `contentModel.js` 等纯模块（不复制）。若 monorepo 配置受阻，退路是把那 3 个纯文件复制进 `mobile/src/`。

### 5.7 打包与安装

- 开发：`npx expo run:android`（JAVA_HOME 指向 `C:\Program Files\Android\Android Studio\jbr`，绕开 PATH 上的 Java 8）
- 发布：自签 keystore -> `--variant release` 出 APK -> `adb install` 或直接传手机
- **keystore 必须备份**：丢失后只能卸载重装，无法覆盖升级
- 个人自用不上 Google Play，无需 25 美元开发者账号

## 6. 安全与运维

### 6.1 暴露面

线上只开 **8443（TLS）**。3001 与 3306 不映射宿主。管理员入口在 Nginx 层 `deny all` 封掉 -> 系统对外**只有只读能力**。

### 6.2 防扫

- 22 端口：安全组**限制来源 IP**（只放行常用地址），收益最大、成本为零
- 8443：不能按 IP 限（手机 4G/5G 出口 IP 会变），靠应用层限流；**必须配 `TRUST_PROXY_HOPS=1`**，否则限流退化为共享一个桶
- 最实在的一点：云端不开放任何写操作，被扫到也没有可偷的东西

### 6.3 密钥

全部随机生成，不复用本机的 `041698`（该密码与 `ADMIN_PASSWORD` 同值，建议一并轮换）。`.env` 与证书私钥权限 600，永不进 git。

### 6.4 备份与回滚

| 项 | 做法 |
|---|---|
| 云端数据库 | 每天 `mysqldump` -> `backups/`，保留 14 天 |
| 数据回滚 | 备份是纯 SQL，导入即回滚 |
| 机器级故障 | 阿里云快照，或照 `deploy/` 文档在新机器重来一遍 |

### 6.5 自愈与监控

- 三容器 `restart: unless-stopped`
- MySQL 用 `mysqladmin ping`；app 用 `/health/ready`（**不要用 `/health`**——数据库抖动时它会 503，配错会让编排器反复重启）
- 可选：cron 每小时 curl `/health/ready`，失败记日志

### 6.6 出事手册

| 症状 | 动作 |
|---|---|
| 网站打不开 | `docker compose ps` -> 看 nginx/app 日志 -> 重启对应容器 |
| 数据不对 | 从最近一份备份导入 |
| 证书过期 / IP 变了 | 重新生成证书 -> **App 需重新打包**（证书固定的代价） |
| 机器整体挂 | 快照回滚，或新机器按文档重来 |

### 6.7 设计的底气

**云端是可丢弃的。** 本机那份干净数据才是真相源，云端任何时候被改脏、被搞坏，重推一遍就回来了。因此云端安全模型可以简单——它本来就不允许写。

## 7. 已确认的决策清单

| # | 决策 | 拍板人 |
|---|---|---|
| 1 | 云端走 Docker Compose 单机全栈（方案 A） | 用户 |
| 2 | App 只连云端，对本地一无所知 | 用户 |
| 3 | 导出源 = 本地 MySQL，不是 `data/` | 设计 |
| 4 | 增量默认不删，删除需显式 `--prune` | 设计 |
| 5 | 云端旧后台表照搬，但不开放管理员登录 | 设计 |
| 6 | 图片落盘 + 缩略图；**不搬原图** | 用户 |
| 7 | 证书自签 10 年 + App 内固定 | 设计 |
| 8 | 上云前先在本机 Docker 预演（8444 端口、独立卷） | 设计 |
| 9 | 安卓走 React Native + Expo 方案 A | 用户 |
| 10 | 收藏 / 历史功能要做 | 用户 |
| 11 | 首页保留三世界入口但改单列手机布局 | 设计 |
| 12 | 先出安卓，iOS 留后路 | 用户 |
| 13 | 不使用域名、不做 ICP 备案，走公网 IP + 高位端口 | 用户 |

## 8. 明确不做的事（YAGNI）

- 不搬原图（本机保留，需要时再加 `f/`）
- 不做 iOS（先安卓，但技术选型已留后路）
- 不做公式渲染（只 3 条公式条目，降级为纯文本）
- 不上 Google Play
- 不申请域名、不做 ICP 备案
- 云端不开放管理员登录与任何写接口
- 不做多实例 / 负载均衡（单机够用）

## 9. 待补充的未知

| # | 未知项 | 影响 | 获取方式 |
|---|---|---|---|
| 1 | ECS 具体配置（CPU / 内存 / 磁盘 / 带宽） | 决定 buffer pool、缩略图档位 | 用户执行一条探测命令；未提供则按 2 核 2G / 40G / 3 Mbps 设计 |
| 2 | ECS 能否装 Docker | 决定是否退到方案 B | 用户确认 |
| 3 | 代码上云方式 A 是否可行 | 决定用 bundle 还是 git pull | 实施时实测 |
| 4 | ECS 公网 IP | 证书 SAN、App 默认地址、安全组 | 用户提供 |

