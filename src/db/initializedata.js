import initialData from '../initialdata.js';
import { logger } from '../utils/logger.js';
import { ensureColumns } from './ensureSchema.js';
import { createIndexes } from './indexes.js';
import {
  getModels,
  initializeModels,
  syncDatabaseToStorage,
} from './api.js';

const uniqueNames = (items, key) => (
  [...new Set((items || []).map((item) => item[key]).filter(Boolean))]
);

const buildNameMap = async (model, transaction) => {
  const records = await model.findAll({ transaction });
  return records.reduce((map, record) => {
    map[record.name] = record.id;
    return map;
  }, {});
};

const seedNamedRecords = async (model, names, transaction) => {
  for (const name of names) {
    await model.findOrCreate({ where: { name }, defaults: { name }, transaction });
  }
};

const createZzzSeedData = async (models, transaction) => {
  const factionNames = uniqueNames(initialData.agents, 'faction');
  const roleNames = [
    ...uniqueNames(initialData.agents, 'role'),
    ...uniqueNames(initialData.soundEngines, 'role'),
  ];
  const rarityNames = ['S', 'A', 'B'];

  await seedNamedRecords(models.Faction, factionNames, transaction);
  await seedNamedRecords(models.Role, roleNames, transaction);
  await seedNamedRecords(models.Rarity, rarityNames, transaction);

  const [factionMap, roleMap, rarityMap] = await Promise.all([
    buildNameMap(models.Faction, transaction),
    buildNameMap(models.Role, transaction),
    buildNameMap(models.Rarity, transaction),
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
    { transaction },
  );

  await models.SoundEngine.bulkCreate(
    initialData.soundEngines.map((engine) => ({
      id: engine.id,
      name: engine.name,
      image: engine.image || '/assets/zzz.jpg',
      rarityId: rarityMap[engine.rarity],
      roleId: roleMap[engine.role],
    })),
    { transaction },
  );

  await models.Bumbo.bulkCreate(
    initialData.bumbos.map((bumbo) => ({
      id: bumbo.id,
      name: bumbo.name,
      image: bumbo.image || '/assets/zzz.jpg',
      rarityId: rarityMap[bumbo.rarity],
    })),
    { transaction },
  );

  await models.DriveDisk.bulkCreate(
    initialData.driveDisks.map((disk) => ({
      id: disk.id,
      name: disk.name,
      description: disk.description || '',
      image: disk.image || '/assets/zzz.jpg',
    })),
    { transaction },
  );
};

const createHsrSeedData = async (models, transaction) => {
  const elementNames = uniqueNames(initialData.hsrCharacters, 'element');
  const pathNames = [
    ...uniqueNames(initialData.hsrCharacters, 'path'),
    ...uniqueNames(initialData.hsrCones, 'path'),
    '记忆',
  ];
  const rarityNames = [
    ...uniqueNames(initialData.hsrCharacters, 'rarity'),
    ...uniqueNames(initialData.hsrCones, 'rarity'),
  ];
  const relicTypeNames = uniqueNames(initialData.hsrRelics, 'type');

  await seedNamedRecords(models.HsrElement, elementNames, transaction);
  await seedNamedRecords(models.HsrPath, pathNames, transaction);
  await seedNamedRecords(models.HsrRarity, rarityNames, transaction);
  await seedNamedRecords(models.HsrRelicType, relicTypeNames, transaction);

  const [elementMap, pathMap, rarityMap, relicTypeMap] = await Promise.all([
    buildNameMap(models.HsrElement, transaction),
    buildNameMap(models.HsrPath, transaction),
    buildNameMap(models.HsrRarity, transaction),
    buildNameMap(models.HsrRelicType, transaction),
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
    { transaction },
  );

  await models.HsrCone.bulkCreate(
    initialData.hsrCones.map((cone) => ({
      id: cone.id,
      name: cone.name,
      image: cone.image || '/assets/hsr.jpg',
      pathId: pathMap[cone.path],
      rarityId: rarityMap[cone.rarity],
    })),
    { transaction },
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
    { transaction },
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

    await ensureColumns(sequelize);

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

    const hasZzzData = !(
      agentCount === 0 &&
      soundEngineCount === 0 &&
      bumboCount === 0 &&
      driveDiskCount === 0
    );
    const hasHsrData = !(
      hsrCharacterCount === 0 &&
      hsrConeCount === 0 &&
      hsrRelicCount === 0
    );

    const [seededZzzMarker, seededHsrMarker] = await Promise.all([
      models.AppMeta.findOne({ where: { key: 'seeded:zzz' } }),
      models.AppMeta.findOne({ where: { key: 'seeded:hsr' } }),
    ]);

    const shouldSeedZzz = destructive || (!hasZzzData && !seededZzzMarker);
    const shouldSeedHsr = destructive || (!hasHsrData && !seededHsrMarker);

    if (shouldSeedZzz || shouldSeedHsr) {
      await sequelize.transaction(async (transaction) => {
        if (shouldSeedZzz) {
          logger.info('Seeding ZZZ data');
          await createZzzSeedData(models, transaction);
        }

        if (shouldSeedHsr) {
          logger.info('Seeding HSR data');
          await createHsrSeedData(models, transaction);
        }

        const markerValue = new Date().toISOString();
        if (shouldSeedZzz) {
          await models.AppMeta.upsert({ key: 'seeded:zzz', value: markerValue }, { transaction });
        }
        if (shouldSeedHsr) {
          await models.AppMeta.upsert({ key: 'seeded:hsr', value: markerValue }, { transaction });
        }
      });
    }

    const markerValue = new Date().toISOString();
    if (hasZzzData && !seededZzzMarker) {
      await models.AppMeta.upsert({ key: 'seeded:zzz', value: markerValue });
    }
    if (hasHsrData && !seededHsrMarker) {
      await models.AppMeta.upsert({ key: 'seeded:hsr', value: markerValue });
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
