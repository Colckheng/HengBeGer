# 项目架构说明

> 注意：这份文档成稿较早，保留它主要是为了说明项目演进思路。当前实现请优先以 `README.md`、`docs/04-quick-start.md`、`docs/11-admin-workflow.md` 和 `docs/14-implementation-roadmap.md` 为准。

## 目录结构

```
HengBeGer/
├── docs/                         # 项目文档、工作流和路线图
├── public/                       # 静态公开资源
├── server/                       # Express 服务入口与中间件
│   ├── middleware/               # auth / validation / error middleware
│   ├── __tests__/                # 后端路由与服务测试
│   └── index.js                  # 服务入口、路由注册、健康检查
├── src/
│   ├── api/                      # 前端 API client 与管理员会话辅助
│   │   ├── adminSession.js
│   │   ├── client.js
│   │   ├── config.js
│   │   └── dataSync.js           # storage 管理接口封装
│   ├── assets/                   # 首页与 Wiki 使用的图片资源
│   ├── components/
│   │   └── AdminAuthGate.jsx     # 管理员登录守卫
│   ├── db/                       # 模型、数据同步、storage 与查询优化
│   │   ├── models/               # ZZZ 与 HSR Sequelize 模型
│   │   │   └── hsr/              # HSR 子模型
│   │   ├── storage/
│   │   │   ├── admin/            # legacy staging 快照
│   │   │   ├── web/              # 公开站点快照
│   │   │   └── *.json            # root storage 快照
│   │   ├── api.js                # DB CRUD 与 storage 同步入口
│   │   ├── config.js             # Sequelize 初始化
│   │   ├── dualStorageManager.js # admin / web 双快照管理
│   │   ├── initializedata.js     # 初始数据与数据库引导
│   │   ├── queryOptimizer.js     # 查询优化与分析接口
│   │   └── storageManager.js     # root storage 管理
│   ├── hsr/                      # HSR Wiki 与管理页
│   ├── utils/                    # logger / error handler / security
│   ├── AdminPanel.jsx            # ZZZ 管理页
│   ├── App.jsx                   # 路由入口
│   ├── DataContext.jsx           # 全局数据获取与 CRUD 封装
│   ├── Filter.jsx                # ZZZ Wiki 筛选组件
│   ├── ZZZWiki.jsx               # ZZZ Wiki
│   └── main.jsx                  # React 应用入口
├── init-db.js                    # 初始化数据库脚本
├── launcher.js                   # 一键启动前后端
├── package.json                  # 脚本与依赖
├── README.md                     # 当前项目总览
└── 开发规范文档.md                # 额外开发约定
```

### 当前主路径

- 公开页：`/zzz-wiki`、`/hsr-wiki`
- 管理页：`/zzz-wiki/admin`、`/hsr-wiki/admin`
- 数据事实源：MySQL
- 公开读取源：`src/db/storage/web/*.json`

## 技术架构

### 前端架构
- 框架: React 19 + Vite
- 路由: React Router DOM
- 状态管理: React Context API
- 样式: 原生CSS + 响应式设计
- 构建工具: Vite (支持热重载、代理等)
- 公开数据读取: 默认通过 `/api/dual-storage/web/data`
- 管理写入流程: 通过管理接口写库，再自动刷新 storage 快照

### 后端架构
- 框架: Express.js
- 数据库: MySQL
- ORM: Sequelize
- 中间件: CORS、JSON解析、请求日志
- 环境配置: dotenv
- 认证: 管理员密码登录，支持 Cookie 会话与签名 Session Token
- 运维接口: 健康检查、metrics、storage 状态与 legacy staging 接口

### 数据库设计

#### 核心实体表

**1. agents (代理人表)**
```sql
CREATE TABLE agents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  element VARCHAR(50),
  image VARCHAR(255),
  factionId INT,
  roleId INT,
  rarityId INT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**2. sound_engines (音擎表)**
```sql
CREATE TABLE sound_engines (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  image VARCHAR(255),
  rarityId INT,
  roleId INT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**3. bumbos (邦布表)**
```sql
CREATE TABLE bumbos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  image VARCHAR(255),
  rarityId INT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**4. drive_disks (驱动盘表)**
```sql
CREATE TABLE drive_disks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  image VARCHAR(255),
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

#### 关联实体表

**5. factions (阵营表)**
```sql
CREATE TABLE factions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**6. roles (职业表)**
```sql
CREATE TABLE roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**7. rarities (稀有度表)**
```sql
CREATE TABLE rarities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(10) NOT NULL,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

#### 关联关系设计
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Agents    │────│  Factions   │    │    Roles    │
│ factionId   │────│     id      │    │     id      │
│ roleId      │────┼─────────────┼────│             │
│ rarityId    │────┼─────────────┼────┼─────────────┤
└─────────────┘    └─────────────┘    │             │
       │                               └─────────────┘
       │           ┌─────────────┐              │
       │           │  Rarities   │              │
       └───────────│     id      │──────────────┘
                   └─────────────┘
                          │
                   ┌─────────────┐    ┌─────────────┐
                   │SoundEngines │    │   Bumbos    │
                   │ rarityId    │    │ rarityId    │
                   │ roleId      │    └─────────────┘
                   └─────────────┘
```

## API设计

### 当前主要接口

当前版本已经不再使用本文早期提到的 `/api/search`、`/api/data/sync`、`/api/data/batch` 这类接口，主接口分组如下：

```http
GET    /health/live
GET    /health/ready

GET    /api/auth/session
POST   /api/auth/session
DELETE /api/auth/session

GET    /api/base-data
GET    /api/hsr/base-data
GET    /api/dual-storage/web/data

POST   /api/agents
PUT    /api/agents/:id
DELETE /api/agents/:id

POST   /api/sound-engines
PUT    /api/sound-engines/:id
DELETE /api/sound-engines/:id

POST   /api/bumbos
PUT    /api/bumbos/:id
DELETE /api/bumbos/:id

POST   /api/drive-disks
PUT    /api/drive-disks/:id
DELETE /api/drive-disks/:id

POST   /api/hsr/characters
PUT    /api/hsr/characters/:id
DELETE /api/hsr/characters/:id

POST   /api/hsr/cones
PUT    /api/hsr/cones/:id
DELETE /api/hsr/cones/:id

POST   /api/hsr/relics
PUT    /api/hsr/relics/:id
DELETE /api/hsr/relics/:id

GET    /api/storage/status
PUT    /api/storage/:type
PUT    /api/storage/batch/update
POST   /api/storage/reset

GET    /api/dual-storage/status
```

说明：

- 公开站点当前主要读取 `GET /api/dual-storage/web/data`
- 管理页默认走“直接写数据库并自动刷新 storage”的流程
- legacy staging 接口已整体下线，数据库是唯一事实源

## 数据流架构

### 前端数据流与状态管理要点
- 加载状态、错误状态、空数据状态完整处理
- 关联数据自动查找与同步
- 管理员端 → 网页端的数据同步流程
