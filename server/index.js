// 后端服务器入口文件
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createSequelizeInstance } from '../src/db/config.js';
import { syncData, addAgent, updateAgent, deleteAgent, addSoundEngine, updateSoundEngine, deleteSoundEngine, addBumbo, updateBumbo, deleteBumbo, addDriveDisk, updateDriveDisk, deleteDriveDisk, initializeModels } from '../src/db/api.js';
import initializeData from '../src/db/initializeData.js';
import DataSyncController from '../src/api/dataSync.js';
import dualStorageManager from '../src/db/dualStorageManager.js';
import process from 'process';

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 设置响应头支持UTF-8
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 初始化数据库
let sequelize;
let dbInitialized = false;

const initDb = async () => {
  try {
    console.log('🚀 正在初始化数据库连接...');
    // 使用环境变量中的数据库配置
    const dbUser = process.env.DB_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD;
    
    if (!dbPassword) {
      console.warn('⚠️ 警告: 未设置数据库密码环境变量 DB_PASSWORD');
    }
    
    sequelize = createSequelizeInstance(dbUser, dbPassword);
    // 使用正确的sequelize实例初始化模型
    initializeModels(sequelize);
    await initializeData(sequelize);
    dbInitialized = true;
    console.log('✅ 数据库初始化完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    console.error('请检查数据库连接配置和权限');
    dbInitialized = false;
  }
};

// 数据库状态检查中间件
const checkDbConnection = (req, res, next) => {
  if (!dbInitialized) {
    return res.status(503).json({ 
      error: '数据库连接未就绪',
      message: '请检查数据库配置并重启服务器'
    });
  }
  next();
};

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    database: dbInitialized ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// API路由

// 获取所有数据
app.get('/api/data', checkDbConnection, async (req, res) => {
  try {
    const data = await syncData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 代理人相关API
app.post('/api/agents', checkDbConnection, async (req, res) => {
  console.log('=== 请求调试信息 ===');
  console.log('请求头:', req.headers);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('接收到的请求体:', req.body);
  console.log('请求体类型:', typeof req.body);
  if (req.body.faction) {
    console.log('阵营字段:', req.body.faction);
    console.log('阵营字段长度:', req.body.faction.length);
    console.log('阵营字段字节:', Buffer.from(req.body.faction, 'utf8'));
  }
  if (req.body.name) {
    console.log('名称字段:', req.body.name);
    console.log('名称字段长度:', req.body.name.length);
    console.log('名称字段字节:', Buffer.from(req.body.name, 'utf8'));
  }
  console.log('=== 调试信息结束 ===');
  try {
    const agent = await addAgent(req.body);
    res.status(201).json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/agents/:id', checkDbConnection, async (req, res) => {
  console.log('=== PUT 代理人请求调试信息 ===');
  console.log('代理人ID:', req.params.id);
  console.log('更新数据:', req.body);
  console.log('=== 调试信息结束 ===');
  try {
    const agent = await updateAgent(req.params.id, req.body);
    if (agent) {
      console.log('代理人更新成功:', agent.id, agent.name);
      res.json({ message: 'success', agent });
    } else {
      res.status(404).json({ error: '代理人不存在' });
    }
  } catch (error) {
    console.error('更新代理人错误:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/agents/:id', checkDbConnection, async (req, res) => {
  try {
    const result = await deleteAgent(req.params.id);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '代理人不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取基础数据的API
app.get('/api/base-data', checkDbConnection, async (req, res) => {
  try {
    const { Faction, Role, Rarity } = await import('../src/db/api.js');
    const factions = await Faction.findAll();
    const roles = await Role.findAll();
    const rarities = await Rarity.findAll();
    
    res.json({
      factions: factions.map(f => ({ id: f.id, name: f.name })),
      roles: roles.map(r => ({ id: r.id, name: r.name })),
      rarities: rarities.map(r => ({ id: r.id, name: r.name }))
    });
  } catch (error) {
    console.error('获取基础数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 阵营管理API
app.post('/api/factions', checkDbConnection, async (req, res) => {
  try {
    const { Faction } = await import('../src/db/api.js');
    const faction = await Faction.create(req.body);
    res.status(201).json(faction);
  } catch (error) {
    console.error('添加阵营失败:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/factions', checkDbConnection, async (req, res) => {
  try {
    const { Faction } = await import('../src/db/api.js');
    const factions = await Faction.findAll();
    res.json(factions);
  } catch (error) {
    console.error('获取阵营失败:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/factions/:id', checkDbConnection, async (req, res) => {
  try {
    const { getModels } = await import('../src/db/api.js');
    const { Faction } = getModels();
    const [updated] = await Faction.update(req.body, {
      where: { id: req.params.id }
    });
    if (updated) {
      const faction = await Faction.findByPk(req.params.id);
      res.json(faction);
    } else {
      res.status(404).json({ error: '阵营不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 音擎相关API
app.post('/api/sound-engines', checkDbConnection, async (req, res) => {
  try {
    const engine = await addSoundEngine(req.body);
    res.status(201).json(engine);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/sound-engines/:id', checkDbConnection, async (req, res) => {
  try {
    const engine = await updateSoundEngine(req.params.id, req.body);
    if (engine) {
      res.json(engine);
    } else {
      res.status(404).json({ error: '音擎不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sound-engines/:id', checkDbConnection, async (req, res) => {
  try {
    const result = await deleteSoundEngine(req.params.id);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '音擎不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 邦布相关API
app.post('/api/bumbos', checkDbConnection, async (req, res) => {
  try {
    const bumbo = await addBumbo(req.body);
    res.status(201).json(bumbo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/bumbos/:id', checkDbConnection, async (req, res) => {
  try {
    const bumbo = await updateBumbo(req.params.id, req.body);
    if (bumbo) {
      res.json(bumbo);
    } else {
      res.status(404).json({ error: '邦布不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bumbos/:id', checkDbConnection, async (req, res) => {
  try {
    const result = await deleteBumbo(req.params.id);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '邦布不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 驱动盘相关API
app.post('/api/drive-disks', checkDbConnection, async (req, res) => {
  try {
    const disk = await addDriveDisk(req.body);
    res.status(201).json(disk);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/drive-disks/:id', checkDbConnection, async (req, res) => {
  try {
    const disk = await updateDriveDisk(req.params.id, req.body);
    if (disk) {
      res.json(disk);
    } else {
      res.status(404).json({ error: '驱动盘不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/drive-disks/:id', checkDbConnection, async (req, res) => {
  try {
    const result = await deleteDriveDisk(req.params.id);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '驱动盘不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 双存储系统相关路由

// 初始化双存储系统
app.post('/api/dual-storage/initialize', checkDbConnection, async (req, res) => {
  try {
    const result = await dualStorageManager.initializeDualStorage();
    if (result) {
      res.json({ success: true, message: '双存储系统初始化成功' });
    } else {
      res.status(500).json({ success: false, message: '双存储系统初始化失败' });
    }
  } catch (error) {
    console.error('初始化双存储系统失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 初始化管理员会话
app.post('/api/dual-storage/admin/session', checkDbConnection, async (req, res) => {
  try {
    const result = await dualStorageManager.initializeAdminSession();
    if (result) {
      res.json({ success: true, message: '管理员会话初始化成功' });
    } else {
      res.status(500).json({ success: false, message: '管理员会话初始化失败' });
    }
  } catch (error) {
    console.error('初始化管理员会话失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取管理员端所有数据
app.get('/api/dual-storage/admin/data', checkDbConnection, async (req, res) => {
  try {
    const data = await dualStorageManager.getAllAdminData();
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取管理员端数据失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取网页端所有数据
app.get('/api/dual-storage/web/data', checkDbConnection, async (req, res) => {
  try {
    const data = await dualStorageManager.getAllWebData();
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取网页端数据失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存数据到管理员端存储
app.put('/api/dual-storage/admin/:type', checkDbConnection, async (req, res) => {
  try {
    const { type } = req.params;
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ success: false, message: '无效的数据格式' });
    }
    
    const result = await dualStorageManager.saveToAdminStorage(type, data);
    if (result) {
      res.json({ success: true, message: `管理员端 ${type} 数据保存成功` });
    } else {
      res.status(500).json({ success: false, message: `管理员端 ${type} 数据保存失败` });
    }
  } catch (error) {
    console.error('保存管理员端数据失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 同步管理员端数据到网页端
app.post('/api/dual-storage/sync', checkDbConnection, async (req, res) => {
  try {
    const result = await dualStorageManager.syncAdminToWeb();
    if (result.error) {
      res.status(500).json({ success: false, message: result.error });
    } else {
      res.json({ success: true, message: '数据同步成功', syncResults: result });
    }
  } catch (error) {
    console.error('同步数据失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取双存储系统状态
app.get('/api/dual-storage/status', checkDbConnection, async (req, res) => {
  try {
    const status = await dualStorageManager.getDualStorageStatus();
    res.json({ success: true, status });
  } catch (error) {
    console.error('获取双存储系统状态失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 清理管理员端会话数据
app.delete('/api/dual-storage/admin/session', checkDbConnection, async (req, res) => {
  try {
    const result = await dualStorageManager.cleanupAdminSession();
    if (result) {
      res.json({ success: true, message: '管理员端会话数据清理成功' });
    } else {
      res.status(500).json({ success: false, message: '管理员端会话数据清理失败' });
    }
  } catch (error) {
    console.error('清理管理员端会话数据失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 数据同步API路由（保持兼容性）

// 获取所有存储数据
app.get('/api/storage/data', checkDbConnection, async (req, res) => {
  await DataSyncController.getAllData(req, res);
});

// 获取存储系统状态 - 必须在 :type 路由之前
app.get('/api/storage/status', checkDbConnection, async (req, res) => {
  await DataSyncController.getStorageStatus(req, res);
});

// 重置存储系统 - 必须在 :type 路由之前
app.post('/api/storage/reset', checkDbConnection, async (req, res) => {
  await DataSyncController.resetStorage(req, res);
});

// 批量更新所有数据 - 必须在 :type 路由之前
app.put('/api/storage/batch/update', checkDbConnection, async (req, res) => {
  await DataSyncController.updateAllData(req, res);
});

// 获取特定类型数据
app.get('/api/storage/:type', checkDbConnection, async (req, res) => {
  await DataSyncController.getDataByType(req, res);
});

// 更新特定类型数据
app.put('/api/storage/:type', checkDbConnection, async (req, res) => {
  await DataSyncController.updateDataByType(req, res);
});

// 启动服务器并初始化数据库
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
});

// 优雅关闭
process.on('SIGINT', async () => {
  if (sequelize) {
    await sequelize.close();
  }
  process.exit(0);
});