// api.js - 数据库API服务
import defineAgent from './models/agent.js';
import defineSoundEngine from './models/soundengine.js';
import defineBumbo from './models/bumbo.js';
import defineDriveDisk from './models/drivedisk.js';
import defineFaction from './models/faction.js';
import defineRole from './models/role.js';
import defineRarity from './models/rarity.js';
import { sequelize as defaultSequelize } from './config.js';
// HSR models
import defineHsrElement from './models/hsr/element.js'
import defineHsrPath from './models/hsr/path.js'
import defineHsrRarity from './models/hsr/rarity.js'
import defineHsrRelicType from './models/hsr/relicType.js'
import defineHsrCharacter from './models/hsr/character.js'
import defineHsrCone from './models/hsr/cone.js'
import defineHsrRelic from './models/hsr/relic.js'

// 全局变量存储当前使用的sequelize实例
let currentSequelize = defaultSequelize;
let Agent, SoundEngine, Bumbo, DriveDisk, Faction, Role, Rarity;
// HSR
let HsrElement, HsrPath, HsrRarity, HsrRelicType, HsrCharacter, HsrCone, HsrRelic;

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
  // HSR
  HsrElement = defineHsrElement(sequelizeInstance);
  HsrPath = defineHsrPath(sequelizeInstance);
  HsrRarity = defineHsrRarity(sequelizeInstance);
  HsrRelicType = defineHsrRelicType(sequelizeInstance);
  HsrCharacter = defineHsrCharacter(sequelizeInstance);
  HsrCone = defineHsrCone(sequelizeInstance);
  HsrRelic = defineHsrRelic(sequelizeInstance);
  
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
  // HSR associations
  HsrCharacter.belongsTo(HsrElement, { foreignKey: 'elementId' })
  HsrCharacter.belongsTo(HsrPath, { foreignKey: 'pathId' })
  HsrCharacter.belongsTo(HsrRarity, { foreignKey: 'rarityId' })
  HsrCone.belongsTo(HsrPath, { foreignKey: 'pathId' })
  HsrCone.belongsTo(HsrRarity, { foreignKey: 'rarityId' })
  HsrRelic.belongsTo(HsrRelicType, { foreignKey: 'typeId' })
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
    const hsrCharacters = await getAllHsrCharacters();
    const hsrCones = await getAllHsrCones();
    const hsrRelics = await getAllHsrRelics();
    
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
    await storageManager.saveToStorage('hsrCharacters', {
      count: hsrCharacters.length,
      data: hsrCharacters,
      lastUpdated: new Date().toISOString(),
      source: 'database'
    })
    await storageManager.saveToStorage('hsrCones', {
      count: hsrCones.length,
      data: hsrCones,
      lastUpdated: new Date().toISOString(),
      source: 'database'
    })
    await storageManager.saveToStorage('hsrRelics', {
      count: hsrRelics.length,
      data: hsrRelics,
      lastUpdated: new Date().toISOString(),
      source: 'database'
    })
    
    console.log('✅ 数据库数据已同步到存储文件');
  } catch (error) {
    console.error('❌ 同步数据库到存储文件失败:', error);
    throw error;
  }
};

// 导出模型获取函数
export const getModels = () => ({ Agent, SoundEngine, Bumbo, DriveDisk, Faction, Role, Rarity, HsrElement, HsrPath, HsrRarity, HsrRelicType, HsrCharacter, HsrCone, HsrRelic });
export { Agent, SoundEngine, Bumbo, DriveDisk, Faction, Role, Rarity, HsrElement, HsrPath, HsrRarity, HsrRelicType, HsrCharacter, HsrCone, HsrRelic, initializeModels };

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

// HSR — 获取
export const getAllHsrCharacters = async () => {
  try {
    return await HsrCharacter.findAll({ include: [HsrElement, HsrPath, HsrRarity] })
  } catch (e) { console.error('获取HSR角色失败:', e); return [] }
}
export const getAllHsrCones = async () => {
  try { return await HsrCone.findAll({ include: [HsrPath, HsrRarity] }) } catch (e) { console.error('获取HSR光锥失败:', e); return [] }
}
export const getAllHsrRelics = async () => {
  try { return await HsrRelic.findAll({ include: [HsrRelicType] }) } catch (e) { console.error('获取HSR遗器失败:', e); return [] }
}

// HSR — 添加
export const addHsrCharacter = async (payload) => {
  try {
    const created = await HsrCharacter.create({
      name: payload.name,
      elementId: payload.elementId || (await HsrElement.findOne({ where: { name: payload.element } }))?.id,
      pathId: payload.pathId || (await HsrPath.findOne({ where: { name: payload.path } }))?.id,
      rarityId: payload.rarityId || (await HsrRarity.findOne({ where: { name: payload.rarity } }))?.id,
      image: payload.image || '/assets/hsr.jpg'
    })
    await syncDatabaseToStorage();
    return created
  } catch (error) { console.error('添加HSR角色失败:', error); throw error }
}

export const addHsrCone = async (payload) => {
  try {
    const created = await HsrCone.create({
      name: payload.name,
      pathId: payload.pathId || (await HsrPath.findOne({ where: { name: payload.path } }))?.id,
      rarityId: payload.rarityId || (await HsrRarity.findOne({ where: { name: payload.rarity } }))?.id,
      image: payload.image || '/assets/hsr.jpg'
    })
    await syncDatabaseToStorage();
    return created
  } catch (error) { console.error('添加HSR光锥失败:', error); throw error }
}

export const addHsrRelic = async (payload) => {
  try {
    const created = await HsrRelic.create({
      name: payload.name,
      typeId: payload.typeId || (await HsrRelicType.findOne({ where: { name: payload.type } }))?.id,
      setName: payload.setName,
      part: payload.part,
      image: payload.image || '/assets/hsr.jpg'
    })
    await syncDatabaseToStorage();
    return created
  } catch (error) { console.error('添加HSR遗器失败:', error); throw error }
}

// HSR — 更新
export const updateHsrCharacter = async (id, payload) => {
  try {
    const model = await HsrCharacter.findByPk(id); if (!model) return null
    if (payload.elementId) model.elementId = payload.elementId; else if (payload.element) { const e = await HsrElement.findOne({ where: { name: payload.element } }); if (e) model.elementId = e.id }
    if (payload.pathId) model.pathId = payload.pathId; else if (payload.path) { const p = await HsrPath.findOne({ where: { name: payload.path } }); if (p) model.pathId = p.id }
    if (payload.rarityId) model.rarityId = payload.rarityId; else if (payload.rarity) { const r = await HsrRarity.findOne({ where: { name: payload.rarity } }); if (r) model.rarityId = r.id }
    model.name = payload.name || model.name
    model.image = payload.image || model.image
    await model.save(); await syncDatabaseToStorage(); return model
  } catch (error) { console.error('更新HSR角色失败:', error); throw error }
}

export const updateHsrCone = async (id, payload) => {
  try {
    const model = await HsrCone.findByPk(id); if (!model) return null
    if (payload.pathId) model.pathId = payload.pathId; else if (payload.path) { const p = await HsrPath.findOne({ where: { name: payload.path } }); if (p) model.pathId = p.id }
    if (payload.rarityId) model.rarityId = payload.rarityId; else if (payload.rarity) { const r = await HsrRarity.findOne({ where: { name: payload.rarity } }); if (r) model.rarityId = r.id }
    model.name = payload.name || model.name
    model.image = payload.image || model.image
    await model.save(); await syncDatabaseToStorage(); return model
  } catch (error) { console.error('更新HSR光锥失败:', error); throw error }
}

export const updateHsrRelic = async (id, payload) => {
  try {
    const model = await HsrRelic.findByPk(id); if (!model) return null
    if (payload.typeId) model.typeId = payload.typeId; else if (payload.type) { const t = await HsrRelicType.findOne({ where: { name: payload.type } }); if (t) model.typeId = t.id }
    model.name = payload.name || model.name
    model.setName = payload.setName || model.setName
    model.part = payload.part || model.part
    model.image = payload.image || model.image
    await model.save(); await syncDatabaseToStorage(); return model
  } catch (error) { console.error('更新HSR遗器失败:', error); throw error }
}

// HSR — 删除
export const deleteHsrCharacter = async (id) => { try { const m = await HsrCharacter.findByPk(id); if (!m) return false; await m.destroy(); await syncDatabaseToStorage(); return true } catch (e) { console.error('删除HSR角色失败:', e); throw e } }
export const deleteHsrCone = async (id) => { try { const m = await HsrCone.findByPk(id); if (!m) return false; await m.destroy(); await syncDatabaseToStorage(); return true } catch (e) { console.error('删除HSR光锥失败:', e); throw e } }
export const deleteHsrRelic = async (id) => { try { const m = await HsrRelic.findByPk(id); if (!m) return false; await m.destroy(); await syncDatabaseToStorage(); return true } catch (e) { console.error('删除HSR遗器失败:', e); throw e } }

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
    if (agentData.factionId) {
      agent.factionId = agentData.factionId;
    } else if (agentData.faction) {
      const faction = await Faction.findOne({ where: { name: agentData.faction } });
      if (faction) agent.factionId = faction.id;
    }

    if (agentData.roleId) {
      agent.roleId = agentData.roleId;
    } else if (agentData.role) {
      const role = await Role.findOne({ where: { name: agentData.role } });
      if (role) agent.roleId = role.id;
    }

    if (agentData.rarityId) {
      agent.rarityId = agentData.rarityId;
    } else if (agentData.rarity) {
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
    await syncDatabaseToStorage();
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
    let rarityId;
    let roleId;
    if (engineData.rarityId) {
      rarityId = engineData.rarityId;
    } else {
      const rarity = await Rarity.findOne({ where: { name: engineData.rarity } });
      if (!rarity) throw new Error('稀有度不存在');
      rarityId = rarity.id;
    }
    if (engineData.roleId) {
      roleId = engineData.roleId;
    } else {
      const role = await Role.findOne({ where: { name: engineData.role } });
      if (!role) throw new Error('职业不存在');
      roleId = role.id;
    }
    const created = await SoundEngine.create({
      name: engineData.name,
      rarityId,
      roleId,
      image: engineData.image || '/assets/zzz.jpg'
    });
    await syncDatabaseToStorage();
    return created;
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
  if (engineData.rarityId) {
    engine.rarityId = engineData.rarityId;
  } else if (engineData.rarity) {
    const rarity = await Rarity.findOne({ where: { name: engineData.rarity } });
    if (rarity) engine.rarityId = rarity.id;
  }

  if (engineData.roleId) {
    engine.roleId = engineData.roleId;
  } else if (engineData.role) {
    const role = await Role.findOne({ where: { name: engineData.role } });
    if (role) engine.roleId = role.id;
  }

    // 更新其他字段
    engine.name = engineData.name || engine.name;
    engine.image = engineData.image || engine.image;

    await engine.save();
    await syncDatabaseToStorage();
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
    await syncDatabaseToStorage();
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
    let rarityId;
    if (bumboData.rarityId) {
      rarityId = bumboData.rarityId;
    } else {
      const rarity = await Rarity.findOne({ where: { name: bumboData.rarity } });
      if (!rarity) throw new Error('稀有度不存在');
      rarityId = rarity.id;
    }
    const created = await Bumbo.create({
      name: bumboData.name,
      rarityId,
      image: bumboData.image || '/assets/zzz.jpg'
    });
    await syncDatabaseToStorage();
    return created;
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
  if (bumboData.rarityId) {
    bumbo.rarityId = bumboData.rarityId;
  } else if (bumboData.rarity) {
    const rarity = await Rarity.findOne({ where: { name: bumboData.rarity } });
    if (rarity) bumbo.rarityId = rarity.id;
  }

    // 更新其他字段
    bumbo.name = bumboData.name || bumbo.name;
    bumbo.image = bumboData.image || bumbo.image;

    await bumbo.save();
    await syncDatabaseToStorage();
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
    await syncDatabaseToStorage();
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
    const created = await DriveDisk.create({
      name: diskData.name,
      description: diskData.description,
      image: diskData.image || '/assets/zzz.jpg'
    });
    await syncDatabaseToStorage();
    return created;
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
    await syncDatabaseToStorage();
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
    await syncDatabaseToStorage();
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