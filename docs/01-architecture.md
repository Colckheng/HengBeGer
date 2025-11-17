# 项目架构说明

## 目录结构

```
HengBeGer/
├── src/                    # 前端源码
│   ├── assets/            # 静态资源
│   │   └── 新建 文本文档.txt  # 游戏数据源文件
│   ├── db/                # 数据库相关
│   │   ├── models/        # 数据模型定义
│   │   │   ├── agent.js   # 代理人模型
│   │   │   ├── faction.js # 阵营模型
│   │   │   ├── role.js    # 职业模型
│   │   │   ├── rarity.js  # 稀有度模型
│   │   │   ├── soundengine.js # 音擎模型
│   │   │   ├── bumbo.js   # 邦布模型
│   │   │   └── drivedisk.js # 驱动盘模型
│   │   ├── storage/       # 存储系统
│   │   │   ├── web/       # 网页端数据存储
│   │   │   ├── admin/     # 管理员端数据存储
│   │   │   └── backup/    # 备份数据存储
│   │   ├── config.js      # 数据库配置
│   │   ├── api.js         # 数据库API服务
│   │   ├── initializeData.js # 数据初始化脚本
│   │   ├── storageManager.js # 存储管理器
│   │   ├── dualStorageManager.js # 双存储管理器
│   │   ├── queryOptimizer.js # 查询优化器
│   │   ├── errorHandler.js # 错误处理器
│   │   └── security.js    # 安全验证模块
│   ├── App.jsx            # 主应用组件
│   ├── main.jsx           # 应用入口
│   ├── DataContext.jsx    # 数据上下文管理
│   ├── ZZZWiki.jsx        # 主要展示组件
│   ├── Filter.jsx         # 筛选组件
│   ├── AdminPanel.jsx     # 管理面板组件
│   └── *.css              # 样式文件
├── src/api/               # API接口层
│   ├── dataSync.js        # 数据同步API
│   └── routes.js          # 路由定义
├── server/                # 后端服务器
│   └── index.js           # Express服务器入口
├── init-db.js             # 数据库初始化脚本
├── package.json           # 项目配置和依赖
├── vite.config.js         # Vite构建配置
├── .env.example           # 环境变量模板
├── 09-code-review-findings.md # 代码审查发现与改进建议
└── README.md              # 项目说明
```

## 技术架构

### 前端架构
- 框架: React 19 + Vite
- 路由: React Router DOM
- 状态管理: React Context API
- 样式: 原生CSS + 响应式设计
- 构建工具: Vite (支持热重载、代理等)

### 后端架构
- 框架: Express.js
- 数据库: MySQL
- ORM: Sequelize
- 中间件: CORS、JSON解析、请求日志
- 环境配置: dotenv

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

### RESTful API端点

```http
GET  /health
GET  /api/data
GET  /api/data/optimized
GET  /api/search
GET  /api/storage/status
POST /api/storage/reset
POST /api/data/sync
PUT  /api/data/batch
```

## 数据流架构

### 前端数据流与状态管理要点
- 加载状态、错误状态、空数据状态完整处理
- 关联数据自动查找与同步
- 管理员端 → 网页端的数据同步流程