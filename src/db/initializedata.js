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
    // 初始化存储系统
    console.log('🔄 正在初始化存储管理系统...');
    const storageInitialized = await storageManager.initializeStorage();
    if (!storageInitialized) {
      console.error('❌ 存储系统初始化失败');
      return false;
    }
    
    // 获取存储系统状态
    const storageStatus = await storageManager.getStorageStatus();
    console.log('📊 存储系统状态:', JSON.stringify(storageStatus, null, 2));
    
    // 使用传入的sequelize实例
    console.log('🔍 正在初始化数据库...');

    // 定义所有模型
    const Faction = defineFaction(sequelize);
    const Role = defineRole(sequelize);
    const Rarity = defineRarity(sequelize);
    const Agent = defineAgent(sequelize);
    const SoundEngine = defineSoundEngine(sequelize);
    const Bumbo = defineBumbo(sequelize);
    const DriveDisk = defineDriveDisk(sequelize);
    console.log('✅ 所有模型定义完成!');

    // 设置模型关联 - 暂时注释掉以避免自动字段生成
    // const models = { Faction, Role, Rarity, Agent, SoundEngine, Bumbo, DriveDisk };
    // Object.keys(models).forEach(modelName => {
    //   if (models[modelName].associate) {
    //     models[modelName].associate(models);
    //   }
    // });
    console.log('✅ 模型关联设置已跳过!');
    // 使用传入的sequelize实例
console.log('🔍 使用传入的数据库连接:');
console.log(`- 主机: ${sequelize.config.host}`);
console.log(`- 端口: ${sequelize.config.port}`);
console.log(`- 数据库: ${sequelize.config.database}`);
console.log(`- 用户名: ${sequelize.config.username}`);
console.log(`- 方言: ${sequelize.config.dialect}`);

// 测试数据库连接
console.log('🔍 测试数据库连接...');
await sequelize.authenticate();
console.log('✅ 数据库连接成功!');

// 模型已通过导入定义
console.log('✅ 模型已通过导入定义');

    // 检查连接池状态
    const pool = sequelize.connectionManager.pool;
    console.log('🔍 连接池状态:');
    console.log(`- 最大连接数: ${pool.max || 'N/A'}`);
    console.log(`- 最小连接数: ${pool.min || 'N/A'}`);
    console.log(`- 获取超时: ${pool.acquireTimeoutMillis || 'N/A'}`);
    console.log(`- 空闲超时: ${pool.idleTimeoutMillis || 'N/A'}`);
    console.log(`- 当前连接数: ${pool.size || 'N/A'}`);
    console.log(`- 可用连接数: ${(pool.availableConnections && pool.availableConnections.length) || 0}`);
    console.log(`- 等待队列长度: ${(pool._pendingAcquires && pool._pendingAcquires.length) || 0}`);

    // 确认当前使用的数据库
    const currentDb = sequelize.config.database;
    console.log(`🔍 当前使用的数据库: ${currentDb}`);

    // 检查数据库是否存在
    try {
      const [result] = await sequelize.query(
        `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${currentDb}'`
      );
      if (result.length === 0) {
        console.error(`❌ 数据库 ${currentDb} 不存在`);
        return false;
      } else {
        console.log(`✅ 数据库 ${currentDb} 已存在`);
      }
    } catch (dbError) {
      console.error('❌ 检查数据库存在性失败:', dbError.message);
      console.error('数据库错误详情:', dbError);
      return false;
    }

    // 手动删除可能存在问题的表
    console.log('🧹 清理可能存在的问题表...');
    try {
      await sequelize.query('DROP TABLE IF EXISTS agents');
      await sequelize.query('DROP TABLE IF EXISTS sound_engines');
      await sequelize.query('DROP TABLE IF EXISTS bumbos');
      console.log('✅ 问题表已清理');
    } catch (dropError) {
      console.log('⚠️ 清理表时出现警告:', dropError.message);
    }

    // 同步模型到数据库
    console.log('🚀 开始同步数据库模型...');
    try {
      await sequelize.sync({ force: true });
      console.log('✅ 数据库表已创建');
    } catch (syncError) {
      console.error('❌ 模型同步失败:', syncError.message);
      console.error('同步错误详情:', syncError);
      return false;
    }

    // 检查表是否存在
    console.log('🔍 检查表是否存在...');
    try {
      const [tables] = await sequelize.query(
        "SHOW TABLES LIKE 'rarities'"
      );
      if (tables.length === 0) {
        console.error('❌ 表 rarities 不存在，尝试手动创建...');
        // 手动创建表
        await sequelize.query(
          `CREATE TABLE IF NOT EXISTS rarities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            createdAt DATETIME NOT NULL,
            updatedAt DATETIME NOT NULL
          )`
        );
        console.log('✅ 手动创建表 rarities 成功');
      } else {
        console.log('✅ 表 rarities 已存在');
      }
    } catch (tableError) {
      console.error('❌ 检查表存在性失败:', tableError.message);
      console.error('表错误详情:', tableError);
      return false;
    }

    // 从存储系统读取数据
    console.log('📖 正在从存储系统读取数据...');
    const storageData = await storageManager.getAllStorageData();
    
    if (!storageData || Object.keys(storageData).length === 0) {
      console.error('❌ 从存储系统读取数据失败，尝试解析文本文件...');
      // 备用方案：解析文本文件
      const data = readDataFile();
      const parsedData = parseData(data);
      if (!parsedData) {
        console.error('❌ 数据解析失败');
        return false;
      }
      // 将解析的数据保存到存储系统
      await storageManager.initializeStorage();
      storageData = parsedData;
    }
    
    console.log('✅ 数据读取成功');
    console.log(`- 代理人: ${storageData.agents?.length || 0} 个`);
    console.log(`- 音擎: ${storageData.soundEngines?.length || 0} 个`);
    console.log(`- 邦布: ${storageData.bumbos?.length || 0} 个`);
    console.log(`- 驱动盘: ${storageData.driveDisks?.length || 0} 个`);
    
    // 使用存储数据替代解析数据
    const parsedData = storageData;

    // 插入等级数据 - 支持S、A、B三个等级
    const rarityMap = {};
    const rarities = ['S', 'A', 'B'];
    console.log('🔍 尝试使用原始SQL插入等级数据...');
    for (const rarity of rarities) {
      try {
        // 使用Sequelize模型插入
        const result = await Rarity.create({ name: rarity });
        rarityMap[rarity] = result.id;
        console.log(`✅ 成功插入等级: ${rarity}, ID: ${result.id}`);
      } catch (sqlError) {
        console.error(`❌ 插入等级 ${rarity} 失败:`, sqlError.message);
        console.error('SQL错误详情:', sqlError);
        return false;
      }
    }
    
    // 检查解析出的所有rarity值
    const uniqueRarities = [...new Set([...parsedData.agents.map(agent => agent.rarity), ...parsedData.soundEngines.map(engine => engine.rarity), ...parsedData.bumbos.map(bumbo => bumbo.rarity)])];
    console.log('🔍 检测到的等级类型:', uniqueRarities);

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
    console.log('🔄 正在同步数据到存储系统...');
    try {
      await storageManager.saveToStorage('agents', parsedData.agents);
      await storageManager.saveToStorage('soundEngines', parsedData.soundEngines);
      await storageManager.saveToStorage('bumbos', parsedData.bumbos);
      await storageManager.saveToStorage('driveDisks', parsedData.driveDisks);
      console.log('✅ 数据同步到存储系统完成');
    } catch (syncError) {
      console.error('⚠️ 数据同步到存储系统失败:', syncError.message);
    }
    
    console.log('✅ 数据初始化成功');
    return true;
  } catch (error) {
    console.error('❌ 数据初始化失败:', error.message);
    console.error('错误类型:', error.name);
    console.error('错误详情:', error);
    console.error('SQL状态:', error.parent?.sqlState);
    console.error('SQL错误码:', error.parent?.errno);
    console.error('SQL消息:', error.parent?.sqlMessage);
    return false;
  }
};

export default initializeData;