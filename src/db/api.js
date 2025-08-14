// api.js - 数据库API服务
import defineAgent from './models/agent.js';
import defineSoundEngine from './models/soundengine.js';
import defineBumbo from './models/bumbo.js';
import defineDriveDisk from './models/drivedisk.js';
import defineFaction from './models/faction.js';
import defineRole from './models/role.js';
import defineRarity from './models/rarity.js';
import { sequelize as defaultSequelize } from './config.js';

// 全局变量存储当前使用的sequelize实例
let currentSequelize = defaultSequelize;
let Agent, SoundEngine, Bumbo, DriveDisk, Faction, Role, Rarity;

// 初始化模型的函数
function initializeModels(sequelizeInstance = defaultSequelize) {
  currentSequelize = sequelizeInstance;
  Agent = defineAgent(sequelizeInstance);
  SoundEngine = defineSoundEngine(sequelizeInstance);
  Bumbo = defineBumbo(sequelizeInstance);
  DriveDisk = defineDriveDisk(sequelizeInstance);
  Faction = defineFaction(sequelizeInstance);
  Role = defineRole(sequelizeInstance);
  Rarity = defineRarity(sequelizeInstance);
  
  // 设置模型关联
  setupAssociations();
}

// 设置模型关联的函数
function setupAssociations() {
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
}

// 默认初始化
initializeModels();

// 导入存储管理器
import storageManager from './storageManager.js';

// 从数据库同步数据到存储文件
export const syncDatabaseToStorage = async () => {
  try {
    console.log('🔄 正在从数据库同步数据到存储文件...');
    
    // 获取所有代理人数据
    const agents = await getAllAgents();
    const soundEngines = await getAllSoundEngines();
    const bumbos = await getAllBumbos();
    const driveDisks = await getAllDriveDisks();
    
    // 保存到存储文件
    await storageManager.saveToStorage('agents', {
      count: agents.length,
      data: agents,
      lastUpdated: new Date().toISOString(),
      source: 'database'
    });
    
    await storageManager.saveToStorage('soundEngines', {
      count: soundEngines.length,
      data: soundEngines,
      lastUpdated: new Date().toISOString(),
      source: 'database'
    });
    
    await storageManager.saveToStorage('bumbos', {
      count: bumbos.length,
      data: bumbos,
      lastUpdated: new Date().toISOString(),
      source: 'database'
    });
    
    await storageManager.saveToStorage('driveDisks', {
      count: driveDisks.length,
      data: driveDisks,
      lastUpdated: new Date().toISOString(),
      source: 'database'
    });
    
    console.log('✅ 数据库数据已同步到存储文件');
  } catch (error) {
    console.error('❌ 同步数据库到存储文件失败:', error);
    throw error;
  }
};

// 导出模型获取函数
export const getModels = () => ({ Agent, SoundEngine, Bumbo, DriveDisk, Faction, Role, Rarity });
export { Agent, SoundEngine, Bumbo, DriveDisk, Faction, Role, Rarity, initializeModels };

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
    let factionId, roleId, rarityId;

    // 支持通过名称或ID查找关联数据
    if (agentData.factionId) {
      factionId = agentData.factionId;
    } else if (agentData.faction) {
      console.log('查找阵营:', agentData.faction, '长度:', agentData.faction.length);
      const faction = await Faction.findOne({ where: { name: agentData.faction } });
      console.log('找到的阵营:', faction);
      if (!faction) throw new Error('阵营不存在');
      factionId = faction.id;
    } else {
      throw new Error('必须提供factionId或faction');
    }

    if (agentData.roleId) {
      roleId = agentData.roleId;
    } else if (agentData.role || agentData.profession) {
      const roleName = agentData.role || agentData.profession;
      const role = await Role.findOne({ where: { name: roleName } });
      if (!role) throw new Error('职业不存在');
      roleId = role.id;
    } else {
      throw new Error('必须提供roleId、role或profession');
    }

    if (agentData.rarityId) {
      rarityId = agentData.rarityId;
    } else if (agentData.rarity) {
      const rarity = await Rarity.findOne({ where: { name: agentData.rarity } });
      if (!rarity) throw new Error('稀有度不存在');
      rarityId = rarity.id;
    } else {
      throw new Error('必须提供rarityId或rarity');
    }

    const newAgent = await Agent.create({
      name: agentData.name,
      element: agentData.element,
      factionId: factionId,
      roleId: roleId,
      rarityId: rarityId,
      image: agentData.image || '/assets/zzz.jpg'
    });

    // 同步数据到存储文件
    await syncDatabaseToStorage();
    console.log('✅ 代理人添加成功，已同步到存储文件');

    return newAgent;
  } catch (error) {
    console.error('添加代理人失败:', error);
    throw error;
  }
};

// 更新代理人
export const updateAgent = async (id, agentData) => {
  try {
    const agent = await Agent.findByPk(id);
    if (!agent) return null;

    // 查找关联模型的ID
    if (agentData.faction) {
      const faction = await Faction.findOne({ where: { name: agentData.faction } });
      if (faction) agent.factionId = faction.id;
    }

    if (agentData.role) {
      const role = await Role.findOne({ where: { name: agentData.role } });
      if (role) agent.roleId = role.id;
    }

    if (agentData.rarity) {
      const rarity = await Rarity.findOne({ where: { name: agentData.rarity } });
      if (rarity) agent.rarityId = rarity.id;
    }

    // 更新其他字段
    agent.name = agentData.name || agent.name;
    agent.element = agentData.element || agent.element;
    agent.image = agentData.image || agent.image;

    await agent.save();
    
    // 同步数据到存储文件
    await syncDatabaseToStorage();
    
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
    if (!agent) return false;

    await agent.destroy();
    return true;
  } catch (error) {
    console.error('删除代理人失败:', error);
    throw error;
  }
};

// 获取所有音擎
export const getAllSoundEngines = async () => {
  try {
    return await SoundEngine.findAll({
      include: [Rarity, Role]
    });
  } catch (error) {
    console.error('获取音擎数据失败:', error);
    return [];
  }
};

// 添加音擎
export const addSoundEngine = async (engineData) => {
  try {
    // 查找关联模型的ID
    const rarity = await Rarity.findOne({ where: { name: engineData.rarity } });
    const role = await Role.findOne({ where: { name: engineData.role } });

    if (!rarity || !role) {
      throw new Error('关联数据不存在');
    }

    return await SoundEngine.create({
      name: engineData.name,
      rarityId: rarity.id,
      roleId: role.id,
      image: engineData.image || '/assets/zzz.jpg'
    });
  } catch (error) {
    console.error('添加音擎失败:', error);
    throw error;
  }
};

// 更新音擎
export const updateSoundEngine = async (id, engineData) => {
  try {
    const engine = await SoundEngine.findByPk(id);
    if (!engine) return null;

    // 查找关联模型的ID
    if (engineData.rarity) {
      const rarity = await Rarity.findOne({ where: { name: engineData.rarity } });
      if (rarity) engine.rarityId = rarity.id;
    }

    if (engineData.role) {
      const role = await Role.findOne({ where: { name: engineData.role } });
      if (role) engine.roleId = role.id;
    }

    // 更新其他字段
    engine.name = engineData.name || engine.name;
    engine.image = engineData.image || engine.image;

    await engine.save();
    return engine;
  } catch (error) {
    console.error('更新音擎失败:', error);
    throw error;
  }
};

// 删除音擎
export const deleteSoundEngine = async (id) => {
  try {
    const engine = await SoundEngine.findByPk(id);
    if (!engine) return false;

    await engine.destroy();
    return true;
  } catch (error) {
    console.error('删除音擎失败:', error);
    throw error;
  }
};

// 获取所有邦布
export const getAllBumbos = async () => {
  try {
    return await Bumbo.findAll({
      include: [Rarity]
    });
  } catch (error) {
    console.error('获取邦布数据失败:', error);
    return [];
  }
};

// 添加邦布
export const addBumbo = async (bumboData) => {
  try {
    // 查找关联模型的ID
    const rarity = await Rarity.findOne({ where: { name: bumboData.rarity } });

    if (!rarity) {
      throw new Error('关联数据不存在');
    }

    return await Bumbo.create({
      name: bumboData.name,
      rarityId: rarity.id,
      image: bumboData.image || '/assets/zzz.jpg'
    });
  } catch (error) {
    console.error('添加邦布失败:', error);
    throw error;
  }
};

// 更新邦布
export const updateBumbo = async (id, bumboData) => {
  try {
    const bumbo = await Bumbo.findByPk(id);
    if (!bumbo) return null;

    // 查找关联模型的ID
    if (bumboData.rarity) {
      const rarity = await Rarity.findOne({ where: { name: bumboData.rarity } });
      if (rarity) bumbo.rarityId = rarity.id;
    }

    // 更新其他字段
    bumbo.name = bumboData.name || bumbo.name;
    bumbo.image = bumboData.image || bumbo.image;

    await bumbo.save();
    return bumbo;
  } catch (error) {
    console.error('更新邦布失败:', error);
    throw error;
  }
};

// 删除邦布
export const deleteBumbo = async (id) => {
  try {
    const bumbo = await Bumbo.findByPk(id);
    if (!bumbo) return false;

    await bumbo.destroy();
    return true;
  } catch (error) {
    console.error('删除邦布失败:', error);
    throw error;
  }
};

// 获取所有驱动盘
export const getAllDriveDisks = async () => {
  try {
    return await DriveDisk.findAll();
  } catch (error) {
    console.error('获取驱动盘数据失败:', error);
    return [];
  }
};

// 添加驱动盘
export const addDriveDisk = async (diskData) => {
  try {
    return await DriveDisk.create({
      name: diskData.name,
      description: diskData.description,
      image: diskData.image || '/assets/zzz.jpg'
    });
  } catch (error) {
    console.error('添加驱动盘失败:', error);
    throw error;
  }
};

// 更新驱动盘
export const updateDriveDisk = async (id, diskData) => {
  try {
    const disk = await DriveDisk.findByPk(id);
    if (!disk) return null;

    // 更新字段
    disk.name = diskData.name || disk.name;
    disk.description = diskData.description || disk.description;
    disk.image = diskData.image || disk.image;

    await disk.save();
    return disk;
  } catch (error) {
    console.error('更新驱动盘失败:', error);
    throw error;
  }
};

// 删除驱动盘
export const deleteDriveDisk = async (id) => {
  try {
    const disk = await DriveDisk.findByPk(id);
    if (!disk) return false;

    await disk.destroy();
    return true;
  } catch (error) {
    console.error('删除驱动盘失败:', error);
    throw error;
  }
};

// 同步数据库数据到前端
export const syncData = async () => {
  try {
    const agents = await getAllAgents();
    const soundEngines = await getAllSoundEngines();
    const bumbos = await getAllBumbos();
    const driveDisks = await getAllDriveDisks();
    
    // 获取基础数据
    const factions = await Faction.findAll();
    const roles = await Role.findAll();
    const rarities = await Rarity.findAll();

    return {
      agents: agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        faction: agent.Faction?.name || '',
        role: agent.Role?.name || '',
        rarity: agent.Rarity?.name || '',
        element: agent.element,
        image: agent.image
      })),
      soundEngines: soundEngines.map(engine => ({
        id: engine.id,
        name: engine.name,
        rarity: engine.Rarity?.name || '',
        role: engine.Role?.name || '',
        image: engine.image
      })),
      bumbos: bumbos.map(bumbo => ({
        id: bumbo.id,
        name: bumbo.name,
        rarity: bumbo.Rarity?.name || '',
        image: bumbo.image
      })),
      driveDisks: driveDisks.map(disk => ({
        id: disk.id,
        name: disk.name,
        description: disk.description,
        image: disk.image
      })),
      // 添加基础数据
      factions: factions.map(faction => ({
        id: faction.id,
        name: faction.name
      })),
      roles: roles.map(role => ({
        id: role.id,
        name: role.name
      })),
      rarities: rarities.map(rarity => ({
        id: rarity.id,
        name: rarity.name
      }))
    };
  } catch (error) {
    console.error('同步数据失败:', error);
    return null;
  }
};