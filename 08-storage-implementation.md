# HengBeGer 存储功能实现文档

## 数据存储架构

### 概述

HengBeGer 项目采用了分层架构来实现数据存储功能，主要包括以下几个层次：

1. **数据库层**：MySQL 关系型数据库
2. **ORM 层**：Sequelize ORM 框架
3. **模型层**：数据模型定义
4. **API 服务层**：数据操作接口
5. **前端状态管理**：React Context API

## 数据库配置

### 环境配置

项目使用 `.env` 文件管理数据库连接配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=HengBeGer

# 服务器配置
PORT=3001
NODE_ENV=development
```

### 数据库连接

数据库连接通过 `src/db/config.js` 文件实现：

```javascript
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// 从环境变量获取数据库配置
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'HengBeGer';

// 创建 Sequelize 实例
export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false,
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: true
  }
});

// 创建 Sequelize 实例的函数（用于初始化脚本）
export function createSequelizeInstance() {
  return sequelize;
}
```

## 数据模型

### 模型定义

项目使用 Sequelize 定义了多个数据模型，以 `Agent` 模型为例：

```javascript
// Agent.js - 代理人模型
import { DataTypes } from 'sequelize';

// 定义模型函数
export default function defineAgent(sequelize) {
  const Agent = sequelize.define('Agent', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    element: {
      type: DataTypes.STRING
    },
    image: {
      type: DataTypes.STRING,
      defaultValue: '/assets/zzz.jpg'
    },
    factionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'factions',
        key: 'id'
      }
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id'
      }
    },
    rarityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'rarities',
        key: 'id'
      }
    }
  }, {
    tableName: 'agents',
    timestamps: true
  });
  
  return Agent;
}
```

### 模型关联

在 `src/db/api.js` 中定义了模型之间的关联关系：

```javascript
// 设置模型关联
Agent.belongsTo(Faction, { foreignKey: 'factionId' });
Agent.belongsTo(Role, { foreignKey: 'roleId' });
Agent.belongsTo(Rarity, { foreignKey: 'rarityId' });

SoundEngine.belongsTo(Rarity, { foreignKey: 'rarityId' });
SoundEngine.belongsTo(Role, { foreignKey: 'roleId' });

Bumbo.belongsTo(Rarity, { foreignKey: 'rarityId' });

Faction.hasMany(Agent, { foreignKey: 'factionId' });
Role.hasMany(Agent, { foreignKey: 'roleId' });
Role.hasMany(SoundEngine, { foreignKey: 'roleId' });
Rarity.hasMany(Agent, { foreignKey: 'rarityId' });
Rarity.hasMany(SoundEngine, { foreignKey: 'rarityId' });
Rarity.hasMany(Bumbo, { foreignKey: 'rarityId' });
```

## 数据初始化

### 初始化流程

数据初始化通过 `src/db/initializeData.js` 实现：

1. 读取文本文件数据
2. 解析数据为结构化对象
3. 创建数据库表
4. 插入初始数据

```javascript
// 读取文本文件数据
const readDataFile = () => {
  const filePath = path.join(process.cwd(), 'src', 'assets', '新建 文本文档.txt');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return data;
  } catch (error) {
    console.error('读取数据文件失败:', error);
    return null;
  }
};

// 解析数据
const parseData = (data) => {
  if (!data) return null;

  const result = {
    agents: [],
    soundEngines: [],
    bumbos: [],
    driveDisks: []
  };

  // 分割数据块
  const sections = data.split('\n\n');

  // 解析代理人数据
  const agentSection = sections.find(section => section.startsWith('代理人:'));
  if (agentSection) {
    const agentLines = agentSection.replace('代理人:', '').trim().split('\n');
    agentLines.forEach(line => {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          result.agents.push({
            name: parts[0],
            faction: parts[1],
            role: parts[2],
            rarity: parts[3],
            element: parts[4]
          });
        }
      }
    });
  }
  
  // ... 解析其他数据 ...
  
  return result;
};
```

### 数据库初始化命令

项目提供了 `init-db.js` 脚本用于初始化数据库：

```javascript
// 初始化数据库
import { initializeData } from './src/db/initializeData.js';

console.log('开始初始化数据库...');

initializeData()
  .then(() => {
    console.log('数据库初始化完成！');
    process.exit(0);
  })
  .catch(error => {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  });
```

## API 服务层

### 数据操作接口

`src/db/api.js` 提供了一系列数据操作函数：

```javascript
// 获取所有代理人
export const getAllAgents = async () => {
  try {
    return await Agent.findAll({
      include: [Faction, Role, Rarity]
    });
  } catch (error) {
    console.error('获取代理人数据失败:', error);
    return [];
  }
};

// 添加代理人
export const addAgent = async (agentData) => {
  try {
    const agent = await Agent.create(agentData);
    return agent;
  } catch (error) {
    console.error('添加代理人失败:', error);
    throw error;
  }
};

// 更新代理人
export const updateAgent = async (id, agentData) => {
  try {
    const agent = await Agent.findByPk(id);
    if (!agent) {
      throw new Error('代理人不存在');
    }
    await agent.update(agentData);
    return agent;
  } catch (error) {
    console.error('更新代理人失败:', error);
    throw error;
  }
};

// 删除代理人
export const deleteAgent = async (id) => {
  try {
    const agent = await Agent.findByPk(id);
    if (!agent) {
      throw new Error('代理人不存在');
    }
    await agent.destroy();
    return true;
  } catch (error) {
    console.error('删除代理人失败:', error);
    throw error;
  }
};
```

## 后端 API 路由

### Express 路由

`server/index.js` 定义了 API 路由：

```javascript
// 获取所有数据
app.get('/api/data', async (req, res) => {
  try {
    const data = await getAllData();
    res.json(data);
  } catch (error) {
    console.error('获取数据失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 添加代理人
app.post('/api/agents', async (req, res) => {
  try {
    const agent = await addAgent(req.body);
    res.status(201).json(agent);
  } catch (error) {
    console.error('添加代理人失败:', error);
    res.status(500).json({ error: '添加代理人失败' });
  }
});

// 更新代理人
app.put('/api/agents/:id', async (req, res) => {
  try {
    const agent = await updateAgent(req.params.id, req.body);
    res.json(agent);
  } catch (error) {
    console.error('更新代理人失败:', error);
    res.status(500).json({ error: '更新代理人失败' });
  }
});

// 删除代理人
app.delete('/api/agents/:id', async (req, res) => {
  try {
    await deleteAgent(req.params.id);
    res.status(204).end();
  } catch (error) {
    console.error('删除代理人失败:', error);
    res.status(500).json({ error: '删除代理人失败' });
  }
});
```

## 前端数据管理

### DataContext

前端使用 React Context API 管理数据状态：

```jsx
// DataContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';

// 创建上下文
const DataContext = createContext();

// API 基础 URL
const API_BASE_URL = '/api';

// API 服务
const apiService = {
  // 获取所有数据
  async fetchData() {
    try {
      const response = await fetch(`${API_BASE_URL}/data`);
      if (!response.ok) {
        throw new Error('网络响应异常');
      }
      return await response.json();
    } catch (error) {
      console.error('获取数据失败:', error);
      throw error;
    }
  },
  
  // 添加代理人
  async addAgent(agent) {
    try {
      const response = await fetch(`${API_BASE_URL}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agent),
      });
      if (!response.ok) {
        throw new Error('网络响应异常');
      }
      return await response.json();
    } catch (error) {
      console.error('添加代理人失败:', error);
      throw error;
    }
  },
  
  // 更新代理人
  async updateAgent(id, agent) {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agent),
      });
      if (!response.ok) {
        throw new Error('网络响应异常');
      }
      return await response.json();
    } catch (error) {
      console.error('更新代理人失败:', error);
      throw error;
    }
  },
  
  // 删除代理人
  async deleteAgent(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('网络响应异常');
      }
      return true;
    } catch (error) {
      console.error('删除代理人失败:', error);
      throw error;
    }
  },
};

// 数据提供者组件
export const DataProvider = ({ children }) => {
  // 状态管理
  const [data, setData] = useState({
    agents: [],
    soundEngines: [],
    bumbos: [],
    driveDisks: [],
    factions: [],
    roles: [],
    rarities: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 刷新数据
  const refreshData = async () => {
    try {
      setLoading(true);
      setError(null);
      const newData = await apiService.fetchData();
      setData(newData);
    } catch (error) {
      setError(error.message);
      console.error('刷新数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始化数据
  const initData = async () => {
    try {
      await refreshData();
    } catch (error) {
      console.error('初始化数据失败:', error);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    initData();
  }, []);

  // 处理添加代理人
  const handleAddAgent = async (agent) => {
    try {
      await apiService.addAgent(agent);
      await refreshData();
    } catch (error) {
      console.error('添加代理人失败:', error);
      throw error;
    }
  };

  // 处理更新代理人
  const handleUpdateAgent = async (id, agent) => {
    try {
      await apiService.updateAgent(id, agent);
      await refreshData();
    } catch (error) {
      console.error('更新代理人失败:', error);
      throw error;
    }
  };

  // 处理删除代理人
  const handleDeleteAgent = async (id) => {
    try {
      await apiService.deleteAgent(id);
      await refreshData();
    } catch (error) {
      console.error('删除代理人失败:', error);
      throw error;
    }
  };

  // 上下文值
  const contextValue = {
    data,
    loading,
    error,
    refreshData,
    addAgent: handleAddAgent,
    updateAgent: handleUpdateAgent,
    deleteAgent: handleDeleteAgent,
    // ... 其他数据操作函数 ...
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

// 自定义 Hook
export const useDataContext = () => useContext(DataContext);

// 向后兼容的导出别名
export const useData = useDataContext;

export default useDataContext;
```

## 前端数据使用

### 在组件中使用数据

```jsx
import React from 'react';
import { useData } from './DataContext';

const AgentList = () => {
  const { data, loading, error, deleteAgent } = useData();
  
  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  
  return (
    <div>
      <h2>代理人列表</h2>
      <ul>
        {data.agents.map(agent => (
          <li key={agent.id}>
            {agent.name} - {agent.Faction?.name} - {agent.Role?.name}
            <button onClick={() => deleteAgent(agent.id)}>删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AgentList;
```

## 数据流程图

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  React UI   │◄────►│ DataContext │◄────►│  API 请求   │
└─────────────┘      └─────────────┘      └──────┬──────┘
                                                  │
                                                  ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  数据模型   │◄────►│ Sequelize  │◄────►│ Express API │
└─────────────┘      └─────────────┘      └──────┬──────┘
                                                  │
                                                  ▼
                                          ┌─────────────┐
                                          │   MySQL    │
                                          └─────────────┘
```

## 存储功能优化建议

### 性能优化

1. **数据库索引**：为常用查询字段添加索引
2. **数据库连接池**：优化连接管理
3. **查询优化**：减少不必要的关联查询
4. **数据缓存**：实现 Redis 缓存层

### 功能扩展

1. **批量操作**：支持批量添加、更新、删除
2. **数据验证**：增强输入验证
3. **事务支持**：确保数据一致性
4. **数据迁移**：添加 Sequelize 迁移功能
5. **数据备份**：自动备份机制

### 安全增强

1. **参数化查询**：防止 SQL 注入
2. **数据加密**：敏感数据加密存储
3. **访问控制**：基于角色的权限控制
4. **审计日志**：记录数据操作历史

## 总结

HengBeGer 项目的存储功能采用了现代化的分层架构，通过 Sequelize ORM 实现了数据库操作的抽象，使用 React Context API 实现了前端状态管理。这种架构具有良好的可维护性和扩展性，但在数据库连接和错误处理方面还有改进空间。

通过添加数据库连接测试、优化错误处理和提供更详细的错误提示，可以进一步提升系统的稳定性和用户体验。