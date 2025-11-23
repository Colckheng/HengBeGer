// initializeData.js - 数据初始化脚本
import fs from 'fs';
import path from 'path';
// 导入模型定义函数和创建Sequelize实例的函数
import { createSequelizeInstance } from './config.js';
import defineFaction from './models/faction.js';
import defineRole from './models/role.js';
import defineAgent from './models/agent.js';
import defineSoundEngine from './models/soundengine.js';
import defineBumbo from './models/bumbo.js';
import defineDriveDisk from './models/drivedisk.js';
import defineRarity from './models/rarity.js';
import storageManager from './storageManager.js';
import { createIndexes, checkIndexes } from './indexes.js';
import { logger, logDatabase } from '../utils/logger.js';
import { withErrorHandling } from '../utils/errorHandler.js';

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

  // 分割数据块 - 使用关键字分割
  const lines = data.split('\n');
  
  // 找到各个部分的起始位置
  const agentStartIndex = lines.findIndex(line => line.startsWith('代理人:'));
  const soundEngineStartIndex = lines.findIndex(line => line.startsWith('音擎:'));
  const bumboStartIndex = lines.findIndex(line => line.startsWith('邦布：'));
  const driveDiskStartIndex = lines.findIndex(line => line.startsWith('驱动盘:'));
  
  // 解析代理人数据
  if (agentStartIndex !== -1) {
    const agentEndIndex = soundEngineStartIndex !== -1 ? soundEngineStartIndex : lines.length;
    const agentLines = lines.slice(agentStartIndex + 1, agentEndIndex);
    agentLines.forEach(line => {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          result.agents.push({
            name: parts[0],
            faction: parts[1],
            role: parts[2],
            rarity: parts[3].replace('级', ''),
            element: parts[4]
          });
        }
      }
    });
  }

  // 解析音擎数据
  if (soundEngineStartIndex !== -1) {
    const soundEngineEndIndex = bumboStartIndex !== -1 ? bumboStartIndex : lines.length;
    const soundEngineLines = lines.slice(soundEngineStartIndex + 1, soundEngineEndIndex);
    soundEngineLines.forEach(line => {
      if (line.trim()) {
        const parts = line.split(/\s+/).filter(part => part !== '');
        if (parts.length >= 4 && parts[2] === '级') {
          const soundEngine = {
            name: parts[0],
            rarity: parts[1], // S 或 A
            role: parts[3]    // 强攻、击破等
          };
          result.soundEngines.push(soundEngine);
        }
      }
    });
  }

  // 解析邦布数据
  if (bumboStartIndex !== -1) {
    const bumboEndIndex = driveDiskStartIndex !== -1 ? driveDiskStartIndex : lines.length;
    const bumboLines = lines.slice(bumboStartIndex + 1, bumboEndIndex);
    bumboLines.forEach(line => {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          result.bumbos.push({
            name: parts[0],
            rarity: parts[1] // S 或 A
          });
        }
      }
    });
  }

  // 解析驱动盘数据
  if (driveDiskStartIndex !== -1) {
    const driveDiskLines = lines.slice(driveDiskStartIndex + 1);
    driveDiskLines.forEach(line => {
      if (line.trim()) {
        const parts = line.split('：');
        if (parts.length >= 2) {
          result.driveDisks.push({
            name: parts[0],
            description: parts[1]
          });
        }
      }
    });
  }

  return result;
};

// 初始化数据库数据
const initializeData = async (sequelize) => {
  try {
    const shouldInitStorage = process.env.INIT_DB === 'true';
    logger.info('检查是否需要初始化存储系统...', { shouldInitStorage });
    if (shouldInitStorage) {
      logger.info('正在初始化存储管理系统...');
      const storageInitialized = await storageManager.initializeStorage();
      if (!storageInitialized) {
        logger.error('存储系统初始化失败');
        return false;
      }
    } else {
      logger.info('跳过存储初始化（保留现有数据）');
    }
    
    // 获取存储系统状态
    const storageStatus = await storageManager.getStorageStatus();
    logger.info('存储系统状态', { storageStatus });
    
  // 使用传入的sequelize实例
    logger.info('正在初始化数据库...');

    // 定义所有模型
    const Faction = defineFaction(sequelize);
    const Role = defineRole(sequelize);
    const Rarity = defineRarity(sequelize);
    const Agent = defineAgent(sequelize);
    const SoundEngine = defineSoundEngine(sequelize);
    const Bumbo = defineBumbo(sequelize);
    const DriveDisk = defineDriveDisk(sequelize);
    logger.info('所有模型定义完成');

    // 设置模型关联 - 暂时注释掉以避免自动字段生成
    // const models = { Faction, Role, Rarity, Agent, SoundEngine, Bumbo, DriveDisk };
    // Object.keys(models).forEach(modelName => {
    //   if (models[modelName].associate) {
    //     models[modelName].associate(models);
    //   }
    // });
    logger.info('模型关联设置已跳过');
    // 使用传入的sequelize实例
    logger.info('使用传入的数据库连接', {
      host: sequelize.config.host,
      port: sequelize.config.port,
      database: sequelize.config.database,
      username: sequelize.config.username,
      dialect: sequelize.config.dialect
    });

    // 测试数据库连接
    logger.info('测试数据库连接...');
    await sequelize.authenticate();
    logger.info('数据库连接成功');
    logDatabase('连接测试', { status: 'success' });

    // 模型已通过导入定义
    logger.info('模型已通过导入定义');
    logDatabase('模型定义', { status: 'completed' });

    // 检查连接池状态
    const pool = sequelize.connectionManager.pool;
    logger.info('连接池状态', {
      maxConnections: pool.max || 'N/A',
      minConnections: pool.min || 'N/A',
      acquireTimeout: pool.acquireTimeoutMillis || 'N/A',
      idleTimeout: pool.idleTimeoutMillis || 'N/A',
      currentConnections: pool.size || 'N/A',
      availableConnections: (pool.availableConnections && pool.availableConnections.length) || 0,
      waitingQueueLength: (pool._pendingAcquires && pool._pendingAcquires.length) || 0
    });

    // 确认当前使用的数据库
    const currentDb = sequelize.config.database;
    logger.info('当前使用的数据库', { database: currentDb });

    // 检查数据库是否存在
    try {
      const [result] = await sequelize.query(
        `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${currentDb}'`
      );
      if (result.length === 0) {
        logger.error('数据库不存在', { database: currentDb });
        return false;
      } else {
        logger.info('数据库已存在', { database: currentDb });
      }
    } catch (dbError) {
      logger.error('检查数据库存在性失败', {
        message: dbError.message,
        stack: dbError.stack,
        code: dbError.code
      });
      return false;
    }

    // 手动删除可能存在问题的表
    const destructive = process.env.NODE_ENV === 'development' && process.env.INIT_DB === 'true';
    if (destructive) {
      try {
        await sequelize.query('DROP TABLE IF EXISTS agents');
        await sequelize.query('DROP TABLE IF EXISTS sound_engines');
        await sequelize.query('DROP TABLE IF EXISTS bumbos');
        logger.info('问题表已清理');
        logDatabase('清理表', { status: 'success', tables: ['agents', 'sound_engines', 'bumbos'] });
      } catch (dropError) {
        logger.warn('清理表时出现警告', { message: dropError.message });
      }
    }

    // 同步模型到数据库
    logger.info('开始同步数据库模型...');
    try {
      if (destructive) {
        await sequelize.sync({ force: true });
        logDatabase('模型同步', { status: 'success', force: true });
      } else {
        await sequelize.sync({ alter: true });
        logDatabase('模型同步', { status: 'success', alter: true });
      }
      logger.info('数据库表同步完成');
    } catch (syncError) {
      logger.error('模型同步失败', {
        message: syncError.message,
        stack: syncError.stack,
        sql: syncError.sql
      });
      return false;
    }

    // 检查表是否存在
    logger.info('检查表是否存在...');
    try {
      const [tables] = await sequelize.query(
        "SHOW TABLES LIKE 'rarities'"
      );
      if (tables.length === 0) {
        logger.error('表 rarities 不存在，尝试手动创建...');
        // 手动创建表
        await sequelize.query(
          `CREATE TABLE IF NOT EXISTS rarities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            createdAt DATETIME NOT NULL,
            updatedAt DATETIME NOT NULL
          )`
        );
        logger.info('手动创建表 rarities 成功');
      } else {
        logger.info('表 rarities 已存在');
      }
    } catch (tableError) {
      logger.error('检查表存在性失败', {
        message: tableError.message,
        stack: tableError.stack,
        sql: tableError.sql
      });
      return false;
    }

    // 从存储系统读取数据
    logger.info('正在从存储系统读取数据...');
    const storageData = await storageManager.getAllStorageData();
    
    if (!storageData || Object.keys(storageData).length === 0) {
      logger.error('从存储系统读取数据失败，尝试解析文本文件...');
      // 备用方案：解析文本文件
      const data = readDataFile();
      const parsedData = parseData(data);
      if (!parsedData) {
        logger.error('数据解析失败');
        return false;
      }
      // 将解析的数据保存到存储系统
      await storageManager.initializeStorage();
      storageData = parsedData;
    }
    
    logger.info('数据读取成功', {
      agents: storageData.agents?.length || 0,
      soundEngines: storageData.soundEngines?.length || 0,
      bumbos: storageData.bumbos?.length || 0,
      driveDisks: storageData.driveDisks?.length || 0
    });
    
    // 使用存储数据替代解析数据
    const parsedData = storageData;

    // 插入等级数据 - 支持S、A、B三个等级
    const rarityMap = {};
    const rarities = ['S', 'A', 'B'];
    logger.info('插入等级数据');
    for (const rarity of rarities) {
      try {
        // 使用Sequelize模型插入
        const result = await Rarity.create({ name: rarity });
        rarityMap[rarity] = result.id;
        logger.info('插入等级成功', { rarity, id: result.id });
      } catch (sqlError) {
        logger.error('插入等级失败', { rarity, message: sqlError.message });
        return false;
      }
    }
    
    // 检查解析出的所有rarity值
    const uniqueRarities = [...new Set([...parsedData.agents.map(agent => agent.rarity), ...parsedData.soundEngines.map(engine => engine.rarity), ...parsedData.bumbos.map(bumbo => bumbo.rarity)])];
    logger.info('检测到的等级类型', { rarities: uniqueRarities });

    // 插入阵营数据
    const factionMap = {};
    const factions = [...new Set(parsedData.agents.map(agent => agent.faction))];
    for (const faction of factions) {
      const result = await Faction.create({ name: faction });
      factionMap[faction] = result.id;
    }

    // 插入职业数据
    const roleMap = {};
    const roles = [...new Set([...parsedData.agents.map(agent => agent.role), ...parsedData.soundEngines.map(engine => engine.role)])];
    for (const role of roles) {
      const result = await Role.create({ name: role });
      roleMap[role] = result.id;
    }

    // 插入代理人数据
    for (const agent of parsedData.agents) {
      await Agent.create({
        name: agent.name,
        factionId: factionMap[agent.faction],
        roleId: roleMap[agent.role],
        rarityId: rarityMap[agent.rarity],
        element: agent.element,
        image: agent.image || '/assets/zzz.jpg'
      });
    }

    // 插入音擎数据
    for (const engine of parsedData.soundEngines) {
      await SoundEngine.create({
        name: engine.name,
        rarityId: rarityMap[engine.rarity],
        roleId: roleMap[engine.role]
      });
    }

    // 插入邦布数据
    for (const bumbo of parsedData.bumbos) {
      await Bumbo.create({
        name: bumbo.name,
        rarityId: rarityMap[bumbo.rarity]
      });
    }

    // 插入驱动盘数据
    for (const disk of parsedData.driveDisks) {
      await DriveDisk.create({
        name: disk.name,
        description: disk.description
      });
    }

    // 数据初始化完成后，确保存储系统与数据库同步
    logger.info('正在同步数据到存储系统...');
    try {
      await storageManager.saveToStorage('agents', parsedData.agents);
      await storageManager.saveToStorage('soundEngines', parsedData.soundEngines);
      await storageManager.saveToStorage('bumbos', parsedData.bumbos);
      await storageManager.saveToStorage('driveDisks', parsedData.driveDisks);
      logger.info('数据同步到存储系统完成');
    } catch (syncError) {
      logger.warn('数据同步到存储系统失败', { message: syncError.message });
    }
    
    // 创建数据库索引以优化查询性能
    logger.info('正在创建数据库索引...');
    try {
      const indexesCreated = await createIndexes(sequelize);
      if (indexesCreated) {
        logger.info('数据库索引创建完成');
        await checkIndexes(sequelize);
      } else {
        logger.warn('索引创建失败，但不影响系统运行');
      }
    } catch (indexError) {
      logger.warn('索引创建过程中出现错误', { message: indexError.message });
    }
    
    logger.info('数据初始化成功');
    return true;
  } catch (error) {
    logger.error('数据初始化失败', {
      message: error.message,
      name: error.name,
      sqlState: error.parent?.sqlState,
      errno: error.parent?.errno,
      sqlMessage: error.parent?.sqlMessage
    });
    return false;
  }
};

export default initializeData;