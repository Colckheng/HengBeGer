import initialData from '../initialdata.js';
import { logger } from '../utils/logger.js';
import { createIndexes } from './indexes.js';
import {
  getModels,
  initializeModels,
  syncDatabaseToStorage,
} from './api.js';

const uniqueNames = (items, key) => (
  [...new Set((items || []).map((item) => item[key]).filter(Boolean))]
);

const buildNameMap = async (model) => {
  const records = await model.findAll();
  return records.reduce((map, record) => {
    map[record.name] = record.id;
    return map;
  }, {});
};

const seedNamedRecords = async (model, names) => {
  for (const name of names) {
    await model.findOrCreate({ where: { name }, defaults: { name } });
  }
};

const createZzzSeedData = async (models) => {
  const factionNames = uniqueNames(initialData.agents, 'faction');
  const roleNames = [
    ...uniqueNames(initialData.agents, 'role'),
    ...uniqueNames(initialData.soundEngines, 'role'),
  ];
  const rarityNames = ['S', 'A', 'B'];

  await seedNamedRecords(models.Faction, factionNames);
  await seedNamedRecords(models.Role, roleNames);
  await seedNamedRecords(models.Rarity, rarityNames);

  const [factionMap, roleMap, rarityMap] = await Promise.all([
    buildNameMap(models.Faction),
    buildNameMap(models.Role),
    buildNameMap(models.Rarity),
  ]);

  await models.Agent.bulkCreate(
    initialData.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      element: agent.element,
      image: agent.image || '/assets/zzz.jpg',
      factionId: factionMap[agent.faction],
      roleId: roleMap[agent.role],
      rarityId: rarityMap[agent.rarity],
    })),
  );

  await models.SoundEngine.bulkCreate(
    initialData.soundEngines.map((engine) => ({
      id: engine.id,
      name: engine.name,
      image: engine.image || '/assets/zzz.jpg',
      rarityId: rarityMap[engine.rarity],
      roleId: roleMap[engine.role],
    })),
  );

  await models.Bumbo.bulkCreate(
    initialData.bumbos.map((bumbo) => ({
      id: bumbo.id,
      name: bumbo.name,
      image: bumbo.image || '/assets/zzz.jpg',
      rarityId: rarityMap[bumbo.rarity],
    })),
  );

  await models.DriveDisk.bulkCreate(
    initialData.driveDisks.map((disk) => ({
      id: disk.id,
      name: disk.name,
      description: disk.description || '',
      image: disk.image || '/assets/zzz.jpg',
    })),
  );
};

const createHsrSeedData = async (models) => {
  const elementNames = uniqueNames(initialData.hsrCharacters, 'element');
  const pathNames = [
    ...uniqueNames(initialData.hsrCharacters, 'path'),
    ...uniqueNames(initialData.hsrCones, 'path'),
  ];
  const rarityNames = [
    ...uniqueNames(initialData.hsrCharacters, 'rarity'),
    ...uniqueNames(initialData.hsrCones, 'rarity'),
  ];
  const relicTypeNames = uniqueNames(initialData.hsrRelics, 'type');

  await seedNamedRecords(models.HsrElement, elementNames);
  await seedNamedRecords(models.HsrPath, pathNames);
  await seedNamedRecords(models.HsrRarity, rarityNames);
  await seedNamedRecords(models.HsrRelicType, relicTypeNames);

  const [elementMap, pathMap, rarityMap, relicTypeMap] = await Promise.all([
    buildNameMap(models.HsrElement),
    buildNameMap(models.HsrPath),
    buildNameMap(models.HsrRarity),
    buildNameMap(models.HsrRelicType),
  ]);

  await models.HsrCharacter.bulkCreate(
    initialData.hsrCharacters.map((character) => ({
      id: character.id,
      name: character.name,
      image: character.image || '/assets/hsr.jpg',
      elementId: elementMap[character.element],
      pathId: pathMap[character.path],
      rarityId: rarityMap[character.rarity],
    })),
  );

  await models.HsrCone.bulkCreate(
    initialData.hsrCones.map((cone) => ({
      id: cone.id,
      name: cone.name,
      image: cone.image || '/assets/hsr.jpg',
      pathId: pathMap[cone.path],
      rarityId: rarityMap[cone.rarity],
    })),
  );

  await models.HsrRelic.bulkCreate(
    initialData.hsrRelics.map((relic) => ({
      id: relic.id,
      name: relic.name,
      image: relic.image || '/assets/hsr.jpg',
      typeId: relicTypeMap[relic.type],
      setName: relic.setName || '',
      part: relic.part || '',
    })),
  );
};

const initializeData = async (sequelize) => {
  try {
    initializeModels(sequelize);
    const models = getModels();

    await sequelize.authenticate();

    const destructive =
      process.env.NODE_ENV === 'development' && process.env.INIT_DB === 'true';
    const allowAlter =
      process.env.NODE_ENV === 'development' && process.env.DB_AUTO_ALTER === 'true';

    await sequelize.sync(destructive ? { force: true } : allowAlter ? { alter: true } : {});

    const [
      agentCount,
      soundEngineCount,
      bumboCount,
      driveDiskCount,
      hsrCharacterCount,
      hsrConeCount,
      hsrRelicCount,
    ] = await Promise.all([
      models.Agent.count(),
      models.SoundEngine.count(),
      models.Bumbo.count(),
      models.DriveDisk.count(),
      models.HsrCharacter.count(),
      models.HsrCone.count(),
      models.HsrRelic.count(),
    ]);

    const shouldSeedZzz = destructive || (
      agentCount === 0 &&
      soundEngineCount === 0 &&
      bumboCount === 0 &&
      driveDiskCount === 0
    );
    const shouldSeedHsr = destructive || (
      hsrCharacterCount === 0 &&
      hsrConeCount === 0 &&
      hsrRelicCount === 0
    );

    if (shouldSeedZzz) {
      logger.info('Seeding ZZZ data');
      await createZzzSeedData(models);
    }

    if (shouldSeedHsr) {
      logger.info('Seeding HSR data');
      await createHsrSeedData(models);
    }

    await syncDatabaseToStorage();

    try {
      await createIndexes(sequelize);
    } catch (error) {
      logger.warn('Index creation failed during bootstrap', {
        message: error.message,
      });
    }

    logger.info('Database initialization complete', {
      destructive,
      allowAlter,
      seededZzz: shouldSeedZzz,
      seededHsr: shouldSeedHsr,
    });
    return true;
  } catch (error) {
    logger.error('Database initialization failed', {
      message: error.message,
      stack: error.stack,
    });
    return false;
  }
};

export default initializeData;
