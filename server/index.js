// 后端服务器入口文件（ESM）
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import process from 'process';

import { createSequelizeInstance } from '../src/db/config.js';
import {
  syncData,
  addAgent,
  updateAgent,
  deleteAgent,
  addSoundEngine,
  updateSoundEngine,
  deleteSoundEngine,
  addBumbo,
  updateBumbo,
  deleteBumbo,
  addDriveDisk,
  updateDriveDisk,
  deleteDriveDisk,
  initializeModels,
  Faction,
  Role,
  Rarity
} from '../src/db/api.js';
import initializeData from '../src/db/initializeData.js';
import DataSyncController from '../src/api/dataSync.js';
import dualStorageManager from '../src/db/dualStorageManager.js';
import QueryOptimizer from '../src/db/queryOptimizer.js';

import { logger, logAPI } from '../src/utils/logger.js';
import { errorMiddleware, catchAsync, AppError, initializeErrorHandling } from '../src/utils/errorHandler.js';
import {
  validateAgentData,
  validateFactionData,
  validateSoundEngineData,
  validateBumboData,
  validateDriveDiskData,
  validateId,
  validateDataType,
  validateBody
} from './middleware/validation.cjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

initializeErrorHandling();

app.use((req, res, next) => {
  req.startTime = Date.now();
  logger.info(`请求开始: ${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  res.on('finish', () => {
    logAPI(req, res, req.startTime);
  });
  next();
});

let sequelize;
let dbInitialized = false;
let queryOptimizer;

const initDb = async () => {
  try {
    logger.info('正在初始化数据库连接...');
    const dbUser = process.env.DB_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD;
    if (!dbPassword) {
      const errorMsg = '数据库密码环境变量 DB_PASSWORD 未设置，无法启动服务器';
      logger.error(errorMsg);
      process.exit(1);
    }
    logger.info('数据库连接信息', { user: dbUser, passwordSet: !!dbPassword });
    sequelize = createSequelizeInstance(dbUser, dbPassword);
    initializeModels(sequelize);
    const shouldInit = process.env.INIT_DB === 'true' || process.env.NODE_ENV === 'development';
    if (shouldInit) {
      await initializeData(sequelize);
    }
    logger.info('正在初始化查询优化器...');
    queryOptimizer = new QueryOptimizer(sequelize);
    await queryOptimizer.getQueryStats();
    dbInitialized = true;
    logger.info('数据库和查询优化器初始化完成');
  } catch (error) {
    logger.error('数据库初始化失败', { message: error.message });
    logger.warn('请检查数据库连接配置和权限');
    dbInitialized = false;
  }
};

const checkDbConnection = (req, res, next) => {
  if (!dbInitialized) {
    return res.status(503).json({
      error: '数据库连接未就绪',
      message: '请检查数据库配置并重启服务器'
    });
  }
  next();
};

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: dbInitialized ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/data', checkDbConnection, catchAsync(async (req, res) => {
  const data = await syncData();
  res.json(data);
}));

app.get('/api/data/optimized', checkDbConnection, catchAsync(async (req, res) => {
  const data = await queryOptimizer.getAllDataOptimized();
  res.json({ success: true, data, message: '使用优化查询获取数据成功' });
}));

app.get('/api/agents/optimized', checkDbConnection, catchAsync(async (req, res) => {
  const { factionId, roleId, rarityId, element, limit, offset } = req.query;
  const filters = {
    factionId: factionId ? parseInt(factionId) : undefined,
    roleId: roleId ? parseInt(roleId) : undefined,
    rarityId: rarityId ? parseInt(rarityId) : undefined,
    element,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0
  };
  const result = await queryOptimizer.getAgentsOptimized(filters);
  res.json({ success: true, data: result.rows, total: result.count, filters, message: '使用优化查询获取代理人数据成功' });
}));

app.get('/api/search/optimized', checkDbConnection, catchAsync(async (req, res) => {
  const { q: searchTerm, type = 'all' } = req.query;
  if (!searchTerm) {
    throw new AppError('搜索关键词不能为空', 400);
  }
  const results = await queryOptimizer.searchOptimized(searchTerm, type);
  const totalResults = Object.values(results).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  res.json({ success: true, results, totalResults, searchTerm, type, message: `搜索完成，找到 ${totalResults} 条结果` });
}));

app.post('/api/query/analyze', checkDbConnection, catchAsync(async (req, res) => {
  const { queryType, filters = {} } = req.body;
  if (!queryType) {
    throw new AppError('查询类型不能为空', 400);
  }
  const analysis = await queryOptimizer.analyzeQueryPerformance(queryType, filters);
  if (!analysis) {
    throw new AppError('查询分析失败或不支持的查询类型', 400);
  }
  res.json({ success: true, analysis, message: '查询性能分析完成' });
}));

app.get('/api/database/stats', checkDbConnection, catchAsync(async (req, res) => {
  const stats = await queryOptimizer.getQueryStats();
  res.json({ success: true, stats, message: '数据库统计信息获取成功' });
}));

app.post('/api/agents', checkDbConnection, validateBody(validateAgentData), catchAsync(async (req, res) => {
  const agent = await addAgent(req.body);
  res.status(201).json(agent);
}));

app.put('/api/agents/:id', checkDbConnection, validateId, validateBody(validateAgentData), catchAsync(async (req, res) => {
  const agent = await updateAgent(req.params.id, req.body);
  if (agent) {
    res.json(agent);
  } else {
    throw new AppError('代理人不存在', 404);
  }
}));

app.delete('/api/agents/:id', checkDbConnection, validateId, catchAsync(async (req, res) => {
  const result = await deleteAgent(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    throw new AppError('代理人不存在', 404);
  }
}));

app.get('/api/base-data', checkDbConnection, catchAsync(async (req, res) => {
  const factions = await Faction.findAll();
  const roles = await Role.findAll();
  const rarities = await Rarity.findAll();
  res.json({
    factions: factions.map(f => ({ id: f.id, name: f.name })),
    roles: roles.map(r => ({ id: r.id, name: r.name })),
    rarities: rarities.map(r => ({ id: r.id, name: r.name }))
  });
}));

app.post('/api/factions', checkDbConnection, validateBody(validateFactionData), catchAsync(async (req, res) => {
  const faction = await Faction.create(req.body);
  res.status(201).json(faction);
}));

app.get('/api/factions', checkDbConnection, catchAsync(async (req, res) => {
  const factions = await Faction.findAll();
  res.json(factions);
}));

app.put('/api/factions/:id', checkDbConnection, validateId, validateBody(validateFactionData), catchAsync(async (req, res) => {
  const [updated] = await Faction.update(req.body, { where: { id: req.params.id } });
  if (updated) {
    const faction = await Faction.findByPk(req.params.id);
    res.json(faction);
  } else {
    throw new AppError('阵营不存在', 404);
  }
}));

app.post('/api/sound-engines', checkDbConnection, validateBody(validateSoundEngineData), catchAsync(async (req, res) => {
  const engine = await addSoundEngine(req.body);
  res.status(201).json(engine);
}));

app.put('/api/sound-engines/:id', checkDbConnection, validateId, validateBody(validateSoundEngineData), catchAsync(async (req, res) => {
  const engine = await updateSoundEngine(req.params.id, req.body);
  if (engine) {
    res.json(engine);
  } else {
    throw new AppError('音擎不存在', 404);
  }
}));

app.delete('/api/sound-engines/:id', checkDbConnection, validateId, catchAsync(async (req, res) => {
  const result = await deleteSoundEngine(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    throw new AppError('音擎不存在', 404);
  }
}));

app.post('/api/bumbos', checkDbConnection, validateBody(validateBumboData), catchAsync(async (req, res) => {
  const bumbo = await addBumbo(req.body);
  res.status(201).json(bumbo);
}));

app.put('/api/bumbos/:id', checkDbConnection, validateId, validateBody(validateBumboData), catchAsync(async (req, res) => {
  const bumbo = await updateBumbo(req.params.id, req.body);
  if (bumbo) {
    res.json(bumbo);
  } else {
    throw new AppError('邦布不存在', 404);
  }
}));

app.delete('/api/bumbos/:id', checkDbConnection, validateId, catchAsync(async (req, res) => {
  const result = await deleteBumbo(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    throw new AppError('邦布不存在', 404);
  }
}));

app.post('/api/drive-disks', checkDbConnection, validateBody(validateDriveDiskData), catchAsync(async (req, res) => {
  const disk = await addDriveDisk(req.body);
  res.status(201).json(disk);
}));

app.put('/api/drive-disks/:id', checkDbConnection, validateId, validateBody(validateDriveDiskData), catchAsync(async (req, res) => {
  const disk = await updateDriveDisk(req.params.id, req.body);
  if (disk) {
    res.json(disk);
  } else {
    throw new AppError('驱动盘不存在', 404);
  }
}));

app.delete('/api/drive-disks/:id', checkDbConnection, validateId, catchAsync(async (req, res) => {
  const result = await deleteDriveDisk(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    throw new AppError('驱动盘不存在', 404);
  }
}));

app.post('/api/dual-storage/initialize', checkDbConnection, catchAsync(async (req, res) => {
  const result = await dualStorageManager.initializeDualStorage();
  if (result) {
    res.json({ success: true, message: '双存储系统初始化成功' });
  } else {
    throw new AppError('双存储系统初始化失败', 500);
  }
}));

app.post('/api/dual-storage/admin/session', checkDbConnection, catchAsync(async (req, res) => {
  const result = await dualStorageManager.initializeAdminSession();
  if (result) {
    res.json({ success: true, message: '管理员会话初始化成功' });
  } else {
    throw new AppError('管理员会话初始化失败', 500);
  }
}));

app.get('/api/dual-storage/admin/data', checkDbConnection, catchAsync(async (req, res) => {
  const data = await dualStorageManager.getAllAdminData();
  res.json({ success: true, data });
}));

app.get('/api/dual-storage/web/data', checkDbConnection, catchAsync(async (req, res) => {
  const data = await dualStorageManager.getAllWebData();
  res.json({ success: true, data });
}));

app.put('/api/dual-storage/admin/:type', checkDbConnection, validateDataType, catchAsync(async (req, res) => {
  const { type } = req.params;
  const { data } = req.body;
  if (!data || !Array.isArray(data)) {
    throw new AppError('无效的数据格式', 400);
  }
  const result = await dualStorageManager.saveToAdminStorage(type, data);
  if (result) {
    res.json({ success: true, message: `管理员端 ${type} 数据保存成功` });
  } else {
    throw new AppError(`管理员端 ${type} 数据保存失败`, 500);
  }
}));

app.post('/api/dual-storage/sync', checkDbConnection, catchAsync(async (req, res) => {
  const result = await dualStorageManager.syncAdminToWeb();
  if (result.error) {
    throw new AppError(result.error, 500);
  } else {
    res.json({ success: true, message: '数据同步成功', syncResults: result });
  }
}));

app.get('/api/dual-storage/status', checkDbConnection, catchAsync(async (req, res) => {
  const status = await dualStorageManager.getDualStorageStatus();
  res.json({ success: true, status });
}));

app.delete('/api/dual-storage/admin/session', checkDbConnection, catchAsync(async (req, res) => {
  const result = await dualStorageManager.cleanupAdminSession();
  if (result) {
    res.json({ success: true, message: '管理员端会话数据清理成功' });
  } else {
    throw new AppError('管理员端会话数据清理失败', 500);
  }
}));

app.get('/api/storage/data', checkDbConnection, async (req, res) => {
  await DataSyncController.getAllData(req, res);
});

app.get('/api/storage/status', checkDbConnection, async (req, res) => {
  await DataSyncController.getStorageStatus(req, res);
});

app.post('/api/storage/reset', checkDbConnection, async (req, res) => {
  await DataSyncController.resetStorage(req, res);
});

app.put('/api/storage/batch/update', checkDbConnection, async (req, res) => {
  await DataSyncController.updateAllData(req, res);
});

app.get('/api/storage/:type', checkDbConnection, validateDataType, catchAsync(async (req, res) => {
  await DataSyncController.getDataByType(req, res);
}));

app.put('/api/storage/:type', checkDbConnection, validateDataType, catchAsync(async (req, res) => {
  await DataSyncController.updateDataByType(req, res);
}));

app.use(errorMiddleware);

initDb().then(() => {
  app.listen(PORT, () => {
    logger.info(`服务器运行在 http://localhost:${PORT}`);
  });
});

process.on('SIGINT', async () => {
  if (sequelize) {
    await sequelize.close();
  }
  process.exit(0);
});