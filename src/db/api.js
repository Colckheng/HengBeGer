import defineAgent from './models/agent.js';
import defineAppMeta from './models/appmeta.js';
import defineBumbo from './models/bumbo.js';
import defineDriveDisk from './models/drivedisk.js';
import defineFaction from './models/faction.js';
import defineRole from './models/role.js';
import defineRarity from './models/rarity.js';
import defineSoundEngine from './models/soundengine.js';
import defineHsrCharacter from './models/hsr/character.js';
import defineHsrCone from './models/hsr/cone.js';
import defineHsrElement from './models/hsr/element.js';
import defineHsrPath from './models/hsr/path.js';
import defineHsrRarity from './models/hsr/rarity.js';
import defineHsrRelic from './models/hsr/relic.js';
import defineHsrRelicType from './models/hsr/relicType.js';
import { sequelize as defaultSequelize } from './config.js';
import { Op } from 'sequelize';
import dualStorageManager from './dualStorageManager.js';
import { assertReplaceSafety } from './replaceSafety.js';
import storageManager from './storageManager.js';
import { AppError } from '../utils/errorHandler.js';
import { createSerialTaskQueue } from '../utils/serialTaskQueue.js';
import { logger } from '../utils/logger.js';

let currentSequelize = null;
let modelsInitialized = false;

let Agent;
let AppMeta;
let Bumbo;
let DriveDisk;
let Faction;
let Role;
let Rarity;
let SoundEngine;
let HsrCharacter;
let HsrCone;
let HsrElement;
let HsrPath;
let HsrRarity;
let HsrRelic;
let HsrRelicType;

const DEFAULT_ZZZ_IMAGE = '/assets/zzz.jpg';
const DEFAULT_HSR_IMAGE = '/assets/hsr.jpg';
const DEFAULT_PUBLIC_PAGE_SIZE = 12;
const MAX_PUBLIC_PAGE_SIZE = 100;
const enqueueStorageSync = createSerialTaskQueue();
const enqueueReplace = createSerialTaskQueue();

const ensureModelsInitialized = () => {
  if (!modelsInitialized) {
    throw new Error('Database models have not been initialized.');
  }
};

const ensureSequelizeReady = () => {
  ensureModelsInitialized();
  if (!currentSequelize) {
    throw new Error('Database connection is not available.');
  }
};

const buildQueryOptions = (options = {}) => (
  options.transaction ? { transaction: options.transaction } : {}
);

const normalizeListLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_PUBLIC_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_PUBLIC_PAGE_SIZE);
};

const normalizeListOffset = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
};

const buildInFilter = (values = []) => (
  Array.isArray(values) && values.length > 0 ? { [Op.in]: values } : undefined
);

const toPlain = (record) => (
  typeof record?.get === 'function' ? record.get({ plain: true }) : record
);

const normalizeOptionalId = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

const resolveImage = (value, fallback) => (
  typeof value === 'string' && value.trim() ? value : fallback
);

const buildCreatePayload = (payload, fields) => {
  const id = normalizeOptionalId(payload.id);
  const result = {};

  if (id) {
    result.id = id;
  }

  for (const field of fields) {
    if (payload[field] !== undefined) {
      result[field] = payload[field];
    }
  }

  return result;
};

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

  HsrCharacter.belongsTo(HsrElement, { foreignKey: 'elementId' });
  HsrCharacter.belongsTo(HsrPath, { foreignKey: 'pathId' });
  HsrCharacter.belongsTo(HsrRarity, { foreignKey: 'rarityId' });

  HsrCone.belongsTo(HsrPath, { foreignKey: 'pathId' });
  HsrCone.belongsTo(HsrRarity, { foreignKey: 'rarityId' });

  HsrRelic.belongsTo(HsrRelicType, { foreignKey: 'typeId' });
}

export function initializeModels(sequelizeInstance = defaultSequelize) {
  if (!sequelizeInstance) {
    return null;
  }

  currentSequelize = sequelizeInstance;
  Agent = defineAgent(sequelizeInstance);
  AppMeta = defineAppMeta(sequelizeInstance);
  SoundEngine = defineSoundEngine(sequelizeInstance);
  Bumbo = defineBumbo(sequelizeInstance);
  DriveDisk = defineDriveDisk(sequelizeInstance);
  Faction = defineFaction(sequelizeInstance);
  Role = defineRole(sequelizeInstance);
  Rarity = defineRarity(sequelizeInstance);

  HsrElement = defineHsrElement(sequelizeInstance);
  HsrPath = defineHsrPath(sequelizeInstance);
  HsrRarity = defineHsrRarity(sequelizeInstance);
  HsrRelicType = defineHsrRelicType(sequelizeInstance);
  HsrCharacter = defineHsrCharacter(sequelizeInstance);
  HsrCone = defineHsrCone(sequelizeInstance);
  HsrRelic = defineHsrRelic(sequelizeInstance);

  setupAssociations();
  modelsInitialized = true;

  return getModels();
}

export const getModels = () => ({
  Agent,
  AppMeta,
  SoundEngine,
  Bumbo,
  DriveDisk,
  Faction,
  Role,
  Rarity,
  HsrElement,
  HsrPath,
  HsrRarity,
  HsrRelicType,
  HsrCharacter,
  HsrCone,
  HsrRelic,
});

const serializeAgent = (record) => {
  const plain = toPlain(record);
  return {
    id: plain.id,
    name: plain.name,
    element: plain.element,
    image: resolveImage(plain.image, DEFAULT_ZZZ_IMAGE),
    description: plain.description || '',
    factionId: plain.factionId ?? plain.Faction?.id ?? null,
    roleId: plain.roleId ?? plain.Role?.id ?? null,
    rarityId: plain.rarityId ?? plain.Rarity?.id ?? null,
    faction: plain.faction ?? plain.Faction?.name ?? '',
    role: plain.role ?? plain.Role?.name ?? '',
    rarity: plain.rarity ?? plain.Rarity?.name ?? '',
  };
};

const serializeSoundEngine = (record) => {
  const plain = toPlain(record);
  return {
    id: plain.id,
    name: plain.name,
    image: resolveImage(plain.image, DEFAULT_ZZZ_IMAGE),
    rarityId: plain.rarityId ?? plain.Rarity?.id ?? null,
    roleId: plain.roleId ?? plain.Role?.id ?? null,
    rarity: plain.rarity ?? plain.Rarity?.name ?? '',
    role: plain.role ?? plain.Role?.name ?? '',
  };
};

const serializeBumbo = (record) => {
  const plain = toPlain(record);
  return {
    id: plain.id,
    name: plain.name,
    image: resolveImage(plain.image, DEFAULT_ZZZ_IMAGE),
    rarityId: plain.rarityId ?? plain.Rarity?.id ?? null,
    rarity: plain.rarity ?? plain.Rarity?.name ?? '',
  };
};

const serializeDriveDisk = (record) => {
  const plain = toPlain(record);
  return {
    id: plain.id,
    name: plain.name,
    description: plain.description || '',
    image: resolveImage(plain.image, DEFAULT_ZZZ_IMAGE),
  };
};

const serializeHsrCharacter = (record) => {
  const plain = toPlain(record);
  return {
    id: plain.id,
    name: plain.name,
    image: resolveImage(plain.image, DEFAULT_HSR_IMAGE),
    description: plain.description || '',
    elementId: plain.elementId ?? plain.HsrElement?.id ?? null,
    pathId: plain.pathId ?? plain.HsrPath?.id ?? null,
    rarityId: plain.rarityId ?? plain.HsrRarity?.id ?? null,
    element: plain.element ?? plain.HsrElement?.name ?? '',
    path: plain.path ?? plain.HsrPath?.name ?? '',
    rarity: plain.rarity ?? plain.HsrRarity?.name ?? '',
  };
};

const serializeHsrCone = (record) => {
  const plain = toPlain(record);
  return {
    id: plain.id,
    name: plain.name,
    image: resolveImage(plain.image, DEFAULT_HSR_IMAGE),
    pathId: plain.pathId ?? plain.HsrPath?.id ?? null,
    rarityId: plain.rarityId ?? plain.HsrRarity?.id ?? null,
    path: plain.path ?? plain.HsrPath?.name ?? '',
    rarity: plain.rarity ?? plain.HsrRarity?.name ?? '',
  };
};

const serializeHsrRelic = (record) => {
  const plain = toPlain(record);
  return {
    id: plain.id,
    name: plain.name,
    image: resolveImage(plain.image, DEFAULT_HSR_IMAGE),
    typeId: plain.typeId ?? plain.HsrRelicType?.id ?? null,
    type: plain.type ?? plain.HsrRelicType?.name ?? '',
    setName: plain.setName || '',
    part: plain.part || '',
  };
};

const resolveRelationId = async (model, payloadId, payloadName, label, options = {}) => {
  const id = normalizeOptionalId(payloadId);
  if (id) {
    return id;
  }

  if (typeof payloadName !== 'string' || !payloadName.trim()) {
    throw new AppError(`Missing ${label}.`, 400);
  }

  const record = await model.findOne({
    where: { name: payloadName.trim() },
    ...buildQueryOptions(options),
  });
  if (!record) {
    throw new AppError(`${label} "${payloadName}" was not found.`, 400);
  }

  return record.id;
};

export const getAllAgents = async (options = {}) => {
  ensureModelsInitialized();
  return Agent.findAll({
    include: [Faction, Role, Rarity],
    order: [['id', 'ASC']],
    ...buildQueryOptions(options),
  });
};

export const getAllSoundEngines = async (options = {}) => {
  ensureModelsInitialized();
  return SoundEngine.findAll({
    include: [Rarity, Role],
    order: [['id', 'ASC']],
    ...buildQueryOptions(options),
  });
};

export const getAllBumbos = async (options = {}) => {
  ensureModelsInitialized();
  return Bumbo.findAll({
    include: [Rarity],
    order: [['id', 'ASC']],
    ...buildQueryOptions(options),
  });
};

export const getAllDriveDisks = async (options = {}) => {
  ensureModelsInitialized();
  return DriveDisk.findAll({
    order: [['id', 'ASC']],
    ...buildQueryOptions(options),
  });
};

export const getAllHsrCharacters = async (options = {}) => {
  ensureModelsInitialized();
  return HsrCharacter.findAll({
    include: [HsrElement, HsrPath, HsrRarity],
    order: [['id', 'ASC']],
    ...buildQueryOptions(options),
  });
};

export const getAllHsrCones = async (options = {}) => {
  ensureModelsInitialized();
  return HsrCone.findAll({
    include: [HsrPath, HsrRarity],
    order: [['id', 'ASC']],
    ...buildQueryOptions(options),
  });
};

export const getAllHsrRelics = async (options = {}) => {
  ensureModelsInitialized();
  return HsrRelic.findAll({
    include: [HsrRelicType],
    order: [['id', 'ASC']],
    ...buildQueryOptions(options),
  });
};

const findPaginatedRecords = async ({
  model,
  serializer,
  include = [],
  where = {},
  order = [['id', 'ASC']],
  limit,
  offset,
  options = {},
}) => {
  ensureModelsInitialized();

  const normalizedLimit = normalizeListLimit(limit);
  const normalizedOffset = normalizeListOffset(offset);
  const result = await model.findAndCountAll({
    where,
    include,
    order,
    limit: normalizedLimit,
    offset: normalizedOffset,
    ...buildQueryOptions(options),
  });

  return {
    items: result.rows.map(serializer),
    total: result.count,
    limit: normalizedLimit,
    offset: normalizedOffset,
    hasMore: normalizedOffset + result.rows.length < result.count,
  };
};

export const listAgents = async (filters = {}, options = {}) => {
  const where = {};

  const factionFilter = buildInFilter(filters.factionIds);
  if (factionFilter) {
    where.factionId = factionFilter;
  }

  const roleFilter = buildInFilter(filters.roleIds);
  if (roleFilter) {
    where.roleId = roleFilter;
  }

  const rarityFilter = buildInFilter(filters.rarityIds);
  if (rarityFilter) {
    where.rarityId = rarityFilter;
  }

  const elementFilter = buildInFilter(filters.elements);
  if (elementFilter) {
    where.element = elementFilter;
  }

  return findPaginatedRecords({
    model: Agent,
    serializer: serializeAgent,
    include: [Faction, Role, Rarity],
    where,
    limit: filters.limit,
    offset: filters.offset,
    options,
  });
};

export const listSoundEngines = async (filters = {}, options = {}) => {
  const where = {};

  const roleFilter = buildInFilter(filters.roleIds);
  if (roleFilter) {
    where.roleId = roleFilter;
  }

  const rarityFilter = buildInFilter(filters.rarityIds);
  if (rarityFilter) {
    where.rarityId = rarityFilter;
  }

  return findPaginatedRecords({
    model: SoundEngine,
    serializer: serializeSoundEngine,
    include: [Rarity, Role],
    where,
    limit: filters.limit,
    offset: filters.offset,
    options,
  });
};

export const listBumbos = async (filters = {}, options = {}) => {
  const where = {};

  const rarityFilter = buildInFilter(filters.rarityIds);
  if (rarityFilter) {
    where.rarityId = rarityFilter;
  }

  return findPaginatedRecords({
    model: Bumbo,
    serializer: serializeBumbo,
    include: [Rarity],
    where,
    limit: filters.limit,
    offset: filters.offset,
    options,
  });
};

export const listDriveDisks = async (filters = {}, options = {}) => (
  findPaginatedRecords({
    model: DriveDisk,
    serializer: serializeDriveDisk,
    limit: filters.limit,
    offset: filters.offset,
    options,
  })
);

export const listHsrCharacters = async (filters = {}, options = {}) => {
  const where = {};

  const elementFilter = buildInFilter(filters.elementIds);
  if (elementFilter) {
    where.elementId = elementFilter;
  }

  const pathFilter = buildInFilter(filters.pathIds);
  if (pathFilter) {
    where.pathId = pathFilter;
  }

  const rarityFilter = buildInFilter(filters.rarityIds);
  if (rarityFilter) {
    where.rarityId = rarityFilter;
  }

  return findPaginatedRecords({
    model: HsrCharacter,
    serializer: serializeHsrCharacter,
    include: [HsrElement, HsrPath, HsrRarity],
    where,
    limit: filters.limit,
    offset: filters.offset,
    options,
  });
};

export const listHsrCones = async (filters = {}, options = {}) => {
  const where = {};

  const pathFilter = buildInFilter(filters.pathIds);
  if (pathFilter) {
    where.pathId = pathFilter;
  }

  const rarityFilter = buildInFilter(filters.rarityIds);
  if (rarityFilter) {
    where.rarityId = rarityFilter;
  }

  return findPaginatedRecords({
    model: HsrCone,
    serializer: serializeHsrCone,
    include: [HsrPath, HsrRarity],
    where,
    limit: filters.limit,
    offset: filters.offset,
    options,
  });
};

export const listHsrRelics = async (filters = {}, options = {}) => {
  const where = {};

  const typeFilter = buildInFilter(filters.typeIds);
  if (typeFilter) {
    where.typeId = typeFilter;
  }

  const partFilter = buildInFilter(filters.parts);
  if (partFilter) {
    where.part = partFilter;
  }

  return findPaginatedRecords({
    model: HsrRelic,
    serializer: serializeHsrRelic,
    include: [HsrRelicType],
    where,
    limit: filters.limit,
    offset: filters.offset,
    options,
  });
};

const buildSnapshot = async (options = {}) => {
  const [
    agents,
    soundEngines,
    bumbos,
    driveDisks,
    hsrCharacters,
    hsrCones,
    hsrRelics,
  ] = await Promise.all([
    getAllAgents(options),
    getAllSoundEngines(options),
    getAllBumbos(options),
    getAllDriveDisks(options),
    getAllHsrCharacters(options),
    getAllHsrCones(options),
    getAllHsrRelics(options),
  ]);

  return {
    agents: agents.map(serializeAgent),
    soundEngines: soundEngines.map(serializeSoundEngine),
    bumbos: bumbos.map(serializeBumbo),
    driveDisks: driveDisks.map(serializeDriveDisk),
    hsrCharacters: hsrCharacters.map(serializeHsrCharacter),
    hsrCones: hsrCones.map(serializeHsrCone),
    hsrRelics: hsrRelics.map(serializeHsrRelic),
  };
};

const performStorageSync = async () => {
  const snapshot = await buildSnapshot();
  await storageManager.saveAllData(snapshot);
  await dualStorageManager.syncRootToWeb(snapshot);
  return snapshot;
};

export const syncDatabaseToStorage = async () => {
  ensureModelsInitialized();
  return enqueueStorageSync(performStorageSync);
};

export const waitForStorageSync = () => enqueueStorageSync(async () => true);

let storageDirty = false;

export const isStorageSyncDirty = () => storageDirty;

const syncAfterWrite = async (options = {}) => {
  if (options.syncStorage === false) {
    return true;
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await syncDatabaseToStorage();
      storageDirty = false;
      return true;
    } catch (error) {
      logger.error('Storage sync failed after write', {
        attempt,
        message: error.message,
        stack: error.stack,
      });
    }
  }

  storageDirty = true;
  logger.error(
    'Storage marked dirty after repeated sync failures; next write will rebuild JSON from database',
    {},
  );
  return false;
};

export const syncData = async () => {
  ensureModelsInitialized();
  return buildSnapshot();
};

export const addAgent = async (agentData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);

  const factionId = await resolveRelationId(
    Faction,
    agentData.factionId,
    agentData.faction,
    'faction',
    options,
  );
  const roleId = await resolveRelationId(
    Role,
    agentData.roleId,
    agentData.role || agentData.profession,
    'role',
    options,
  );
  const rarityId = await resolveRelationId(
    Rarity,
    agentData.rarityId,
    agentData.rarity,
    'rarity',
    options,
  );

  const created = await Agent.create({
    ...buildCreatePayload(agentData, []),
    name: agentData.name,
    element: agentData.element,
    image: resolveImage(agentData.image, DEFAULT_ZZZ_IMAGE),
    description: agentData.description || '',
    factionId,
    roleId,
    rarityId,
  }, queryOptions);

  await syncAfterWrite(options);

  return created;
};

export const updateAgent = async (id, agentData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const agent = await Agent.findByPk(id, queryOptions);
  if (!agent) {
    return null;
  }

  if (agentData.name !== undefined) {
    agent.name = agentData.name;
  }
  if (agentData.element !== undefined) {
    agent.element = agentData.element;
  }
  if (agentData.image !== undefined) {
    agent.image = resolveImage(agentData.image, DEFAULT_ZZZ_IMAGE);
  }
  if (agentData.description !== undefined) {
    agent.description = agentData.description;
  }

  if (agentData.factionId !== undefined || agentData.faction !== undefined) {
    agent.factionId = await resolveRelationId(
      Faction,
      agentData.factionId,
      agentData.faction,
      'faction',
      options,
    );
  }
  if (agentData.roleId !== undefined || agentData.role !== undefined || agentData.profession !== undefined) {
    agent.roleId = await resolveRelationId(
      Role,
      agentData.roleId,
      agentData.role || agentData.profession,
      'role',
      options,
    );
  }
  if (agentData.rarityId !== undefined || agentData.rarity !== undefined) {
    agent.rarityId = await resolveRelationId(
      Rarity,
      agentData.rarityId,
      agentData.rarity,
      'rarity',
      options,
    );
  }

  await agent.save(queryOptions);

  await syncAfterWrite(options);

  return agent;
};

export const deleteAgent = async (id, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const agent = await Agent.findByPk(id, queryOptions);
  if (!agent) {
    return false;
  }

  await agent.destroy(queryOptions);
  await syncAfterWrite(options);
  return true;
};

export const addSoundEngine = async (engineData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);

  const rarityId = await resolveRelationId(
    Rarity,
    engineData.rarityId,
    engineData.rarity,
    'rarity',
    options,
  );
  const roleId = await resolveRelationId(
    Role,
    engineData.roleId,
    engineData.role,
    'role',
    options,
  );

  const created = await SoundEngine.create({
    ...buildCreatePayload(engineData, []),
    name: engineData.name,
    image: resolveImage(engineData.image, DEFAULT_ZZZ_IMAGE),
    rarityId,
    roleId,
  }, queryOptions);

  await syncAfterWrite(options);

  return created;
};

export const updateSoundEngine = async (id, engineData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const engine = await SoundEngine.findByPk(id, queryOptions);
  if (!engine) {
    return null;
  }

  if (engineData.name !== undefined) {
    engine.name = engineData.name;
  }
  if (engineData.image !== undefined) {
    engine.image = resolveImage(engineData.image, DEFAULT_ZZZ_IMAGE);
  }
  if (engineData.rarityId !== undefined || engineData.rarity !== undefined) {
    engine.rarityId = await resolveRelationId(
      Rarity,
      engineData.rarityId,
      engineData.rarity,
      'rarity',
      options,
    );
  }
  if (engineData.roleId !== undefined || engineData.role !== undefined) {
    engine.roleId = await resolveRelationId(
      Role,
      engineData.roleId,
      engineData.role,
      'role',
      options,
    );
  }

  await engine.save(queryOptions);

  await syncAfterWrite(options);

  return engine;
};

export const deleteSoundEngine = async (id, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const engine = await SoundEngine.findByPk(id, queryOptions);
  if (!engine) {
    return false;
  }

  await engine.destroy(queryOptions);
  await syncAfterWrite(options);
  return true;
};

export const addBumbo = async (bumboData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);

  const rarityId = await resolveRelationId(
    Rarity,
    bumboData.rarityId,
    bumboData.rarity,
    'rarity',
    options,
  );

  const created = await Bumbo.create({
    ...buildCreatePayload(bumboData, []),
    name: bumboData.name,
    image: resolveImage(bumboData.image, DEFAULT_ZZZ_IMAGE),
    rarityId,
  }, queryOptions);

  await syncAfterWrite(options);

  return created;
};

export const updateBumbo = async (id, bumboData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const bumbo = await Bumbo.findByPk(id, queryOptions);
  if (!bumbo) {
    return null;
  }

  if (bumboData.name !== undefined) {
    bumbo.name = bumboData.name;
  }
  if (bumboData.image !== undefined) {
    bumbo.image = resolveImage(bumboData.image, DEFAULT_ZZZ_IMAGE);
  }
  if (bumboData.rarityId !== undefined || bumboData.rarity !== undefined) {
    bumbo.rarityId = await resolveRelationId(
      Rarity,
      bumboData.rarityId,
      bumboData.rarity,
      'rarity',
      options,
    );
  }

  await bumbo.save(queryOptions);

  await syncAfterWrite(options);

  return bumbo;
};

export const deleteBumbo = async (id, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const bumbo = await Bumbo.findByPk(id, queryOptions);
  if (!bumbo) {
    return false;
  }

  await bumbo.destroy(queryOptions);
  await syncAfterWrite(options);
  return true;
};

export const addDriveDisk = async (diskData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);

  const created = await DriveDisk.create({
    ...buildCreatePayload(diskData, []),
    name: diskData.name,
    description: diskData.description || '',
    image: resolveImage(diskData.image, DEFAULT_ZZZ_IMAGE),
  }, queryOptions);

  await syncAfterWrite(options);

  return created;
};

export const updateDriveDisk = async (id, diskData, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const disk = await DriveDisk.findByPk(id, queryOptions);
  if (!disk) {
    return null;
  }

  if (diskData.name !== undefined) {
    disk.name = diskData.name;
  }
  if (diskData.description !== undefined) {
    disk.description = diskData.description;
  }
  if (diskData.image !== undefined) {
    disk.image = resolveImage(diskData.image, DEFAULT_ZZZ_IMAGE);
  }

  await disk.save(queryOptions);

  await syncAfterWrite(options);

  return disk;
};

export const deleteDriveDisk = async (id, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const disk = await DriveDisk.findByPk(id, queryOptions);
  if (!disk) {
    return false;
  }

  await disk.destroy(queryOptions);
  await syncAfterWrite(options);
  return true;
};

export const addHsrCharacter = async (payload, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);

  const elementId = await resolveRelationId(
    HsrElement,
    payload.elementId,
    payload.element,
    'element',
    options,
  );
  const pathId = await resolveRelationId(
    HsrPath,
    payload.pathId,
    payload.path,
    'path',
    options,
  );
  const rarityId = await resolveRelationId(
    HsrRarity,
    payload.rarityId,
    payload.rarity,
    'rarity',
    options,
  );

  const created = await HsrCharacter.create({
    ...buildCreatePayload(payload, []),
    name: payload.name,
    image: resolveImage(payload.image, DEFAULT_HSR_IMAGE),
    description: payload.description || '',
    elementId,
    pathId,
    rarityId,
  }, queryOptions);

  await syncAfterWrite(options);

  return created;
};

export const updateHsrCharacter = async (id, payload, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const character = await HsrCharacter.findByPk(id, queryOptions);
  if (!character) {
    return null;
  }

  if (payload.name !== undefined) {
    character.name = payload.name;
  }
  if (payload.image !== undefined) {
    character.image = resolveImage(payload.image, DEFAULT_HSR_IMAGE);
  }
  if (payload.description !== undefined) {
    character.description = payload.description;
  }
  if (payload.elementId !== undefined || payload.element !== undefined) {
    character.elementId = await resolveRelationId(
      HsrElement,
      payload.elementId,
      payload.element,
      'element',
      options,
    );
  }
  if (payload.pathId !== undefined || payload.path !== undefined) {
    character.pathId = await resolveRelationId(
      HsrPath,
      payload.pathId,
      payload.path,
      'path',
      options,
    );
  }
  if (payload.rarityId !== undefined || payload.rarity !== undefined) {
    character.rarityId = await resolveRelationId(
      HsrRarity,
      payload.rarityId,
      payload.rarity,
      'rarity',
      options,
    );
  }

  await character.save(queryOptions);

  await syncAfterWrite(options);

  return character;
};

export const deleteHsrCharacter = async (id, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const character = await HsrCharacter.findByPk(id, queryOptions);
  if (!character) {
    return false;
  }

  await character.destroy(queryOptions);
  await syncAfterWrite(options);
  return true;
};

export const addHsrCone = async (payload, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);

  const pathId = await resolveRelationId(
    HsrPath,
    payload.pathId,
    payload.path,
    'path',
    options,
  );
  const rarityId = await resolveRelationId(
    HsrRarity,
    payload.rarityId,
    payload.rarity,
    'rarity',
    options,
  );

  const created = await HsrCone.create({
    ...buildCreatePayload(payload, []),
    name: payload.name,
    image: resolveImage(payload.image, DEFAULT_HSR_IMAGE),
    pathId,
    rarityId,
  }, queryOptions);

  await syncAfterWrite(options);

  return created;
};

export const updateHsrCone = async (id, payload, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const cone = await HsrCone.findByPk(id, queryOptions);
  if (!cone) {
    return null;
  }

  if (payload.name !== undefined) {
    cone.name = payload.name;
  }
  if (payload.image !== undefined) {
    cone.image = resolveImage(payload.image, DEFAULT_HSR_IMAGE);
  }
  if (payload.pathId !== undefined || payload.path !== undefined) {
    cone.pathId = await resolveRelationId(
      HsrPath,
      payload.pathId,
      payload.path,
      'path',
      options,
    );
  }
  if (payload.rarityId !== undefined || payload.rarity !== undefined) {
    cone.rarityId = await resolveRelationId(
      HsrRarity,
      payload.rarityId,
      payload.rarity,
      'rarity',
      options,
    );
  }

  await cone.save(queryOptions);

  await syncAfterWrite(options);

  return cone;
};

export const deleteHsrCone = async (id, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const cone = await HsrCone.findByPk(id, queryOptions);
  if (!cone) {
    return false;
  }

  await cone.destroy(queryOptions);
  await syncAfterWrite(options);
  return true;
};

export const addHsrRelic = async (payload, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);

  const typeId = await resolveRelationId(
    HsrRelicType,
    payload.typeId,
    payload.type,
    'relic type',
    options,
  );

  const created = await HsrRelic.create({
    ...buildCreatePayload(payload, []),
    name: payload.name,
    image: resolveImage(payload.image, DEFAULT_HSR_IMAGE),
    typeId,
    setName: payload.setName || '',
    part: payload.part || '',
  }, queryOptions);

  await syncAfterWrite(options);

  return created;
};

export const updateHsrRelic = async (id, payload, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const relic = await HsrRelic.findByPk(id, queryOptions);
  if (!relic) {
    return null;
  }

  if (payload.name !== undefined) {
    relic.name = payload.name;
  }
  if (payload.image !== undefined) {
    relic.image = resolveImage(payload.image, DEFAULT_HSR_IMAGE);
  }
  if (payload.typeId !== undefined || payload.type !== undefined) {
    relic.typeId = await resolveRelationId(
      HsrRelicType,
      payload.typeId,
      payload.type,
      'relic type',
      options,
    );
  }
  if (payload.setName !== undefined) {
    relic.setName = payload.setName;
  }
  if (payload.part !== undefined) {
    relic.part = payload.part;
  }

  await relic.save(queryOptions);

  await syncAfterWrite(options);

  return relic;
};

export const deleteHsrRelic = async (id, options = {}) => {
  ensureModelsInitialized();
  const queryOptions = buildQueryOptions(options);
  const relic = await HsrRelic.findByPk(id, queryOptions);
  if (!relic) {
    return false;
  }

  await relic.destroy(queryOptions);
  await syncAfterWrite(options);
  return true;
};

const REPLACE_HANDLERS = {
  agents: {
    getAll: getAllAgents,
    create: addAgent,
    update: updateAgent,
    remove: deleteAgent,
  },
  soundEngines: {
    getAll: getAllSoundEngines,
    create: addSoundEngine,
    update: updateSoundEngine,
    remove: deleteSoundEngine,
  },
  bumbos: {
    getAll: getAllBumbos,
    create: addBumbo,
    update: updateBumbo,
    remove: deleteBumbo,
  },
  driveDisks: {
    getAll: getAllDriveDisks,
    create: addDriveDisk,
    update: updateDriveDisk,
    remove: deleteDriveDisk,
  },
  hsrCharacters: {
    getAll: getAllHsrCharacters,
    create: addHsrCharacter,
    update: updateHsrCharacter,
    remove: deleteHsrCharacter,
  },
  hsrCones: {
    getAll: getAllHsrCones,
    create: addHsrCone,
    update: updateHsrCone,
    remove: deleteHsrCone,
  },
  hsrRelics: {
    getAll: getAllHsrRelics,
    create: addHsrRelic,
    update: updateHsrRelic,
    remove: deleteHsrRelic,
  },
};

const replaceRecordsForType = async (type, items = [], options = {}) => {
  const handler = REPLACE_HANDLERS[type];
  if (!handler) {
    throw new Error(`Unsupported record type: ${type}`);
  }

  const incomingItems = Array.isArray(items) ? items : [];
  const existingRecords = await handler.getAll(options);
  const existingIds = new Set(existingRecords.map((record) => Number(toPlain(record).id)));
  const incomingIds = new Set(
    incomingItems
      .map((item) => normalizeOptionalId(item.id))
      .filter((id) => id !== undefined),
  );

  assertReplaceSafety(type, incomingItems.length, existingRecords.length, options);

  for (const item of incomingItems) {
    const id = normalizeOptionalId(item.id);
    if (id && existingIds.has(id)) {
      await handler.update(id, item, { ...options, syncStorage: false });
      continue;
    }

    await handler.create(item, { ...options, syncStorage: false });
  }

  for (const existingRecord of existingRecords) {
    const existingId = Number(toPlain(existingRecord).id);
    if (!incomingIds.has(existingId)) {
      await handler.remove(existingId, { ...options, syncStorage: false });
    }
  }
};

export const replaceMultipleRecordSets = async (dataMap = {}, options = {}) => {
  ensureSequelizeReady();

  const touchedTypes = Object.keys(dataMap);
  if (touchedTypes.length === 0) {
    return syncData();
  }

  for (const type of touchedTypes) {
    if (!REPLACE_HANDLERS[type]) {
      throw new Error(`Unsupported record type: ${type}`);
    }
  }

  await enqueueReplace(() => currentSequelize.transaction(async (transaction) => {
    for (const type of touchedTypes) {
      await replaceRecordsForType(type, dataMap[type], { ...options, transaction });
    }
  }));

  await syncAfterWrite(options);
  return syncData();
};

export const replaceAllRecords = async (type, items = [], options = {}) => (
  replaceMultipleRecordSets({ [type]: items }, options)
);

export {
  Agent,
  SoundEngine,
  Bumbo,
  DriveDisk,
  Faction,
  Role,
  Rarity,
  HsrElement,
  HsrPath,
  HsrRarity,
  HsrRelicType,
  HsrCharacter,
  HsrCone,
  HsrRelic,
  currentSequelize,
};
