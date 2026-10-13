import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import dotenvSafe from 'dotenv-safe';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import client from 'prom-client';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

import { RELIC_PARTS } from './constants/relicParts.cjs';

import { createSequelizeInstance } from '../src/db/config.js';
import {
  addAgent,
  addBumbo,
  addDriveDisk,
  addHsrCharacter,
  addHsrCone,
  addHsrRelic,
  addSoundEngine,
  deleteAgent,
  deleteBumbo,
  deleteDriveDisk,
  deleteHsrCharacter,
  deleteHsrCone,
  deleteHsrRelic,
  deleteSoundEngine,
  Faction,
  HsrElement,
  HsrPath,
  HsrRarity,
  HsrRelicType,
  initializeModels,
  isStorageSyncDirty,
  listAgents,
  listBumbos,
  listDriveDisks,
  listHsrCharacters,
  listHsrCones,
  listHsrRelics,
  listSoundEngines,
  Rarity,
  Role,
  syncData,
  updateAgent,
  updateBumbo,
  updateDriveDisk,
  updateHsrCharacter,
  updateHsrCone,
  updateHsrRelic,
  updateSoundEngine,
  waitForStorageSync,
} from '../src/db/api.js';
import DataSyncController from '../src/api/dataSync.js';
import dualStorageManager from '../src/db/dualStorageManager.js';
import initializeData from '../src/db/initializedata.js';
import QueryOptimizer from '../src/db/queryOptimizer.js';
import {
  AppError,
  catchAsync,
  errorMiddleware,
  initializeErrorHandling,
} from '../src/utils/errorHandler.js';
import { logAdminAudit } from '../src/utils/adminAudit.js';
import { logger, logAPI } from '../src/utils/logger.js';
import {
  clearAdminSession,
  createAdminSession,
  getAdminAuthStatus,
  requireAdmin,
} from './middleware/auth.js';
import {
  parseNonNegativeIntQuery,
  parseNumberListQuery,
  parsePositiveIntQuery,
  parseStringListQuery,
} from './utils/publicListQuery.js';
import { createCatalogRouter } from './catalog.js';
import {
  validateAgentData,
  validateBody,
  validateBumboData,
  validateDataType,
  validateDriveDiskData,
  validateFactionData,
  validateHsrCharacterData,
  validateHsrConeData,
  validateHsrRelicData,
  validateId,
  validateSoundEngineData,
} from './middleware/validation.cjs';

try {
  dotenvSafe.config({ allowEmptyValues: true });
} catch (error) {
  dotenv.config();
  logger.error('dotenv-safe 校验失败，已回退 dotenv.config()', {
    message: error.message,
  });
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isTest = process.env.NODE_ENV === 'test';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const apiRequestCounter = new client.Counter({
  name: 'api_requests_total',
  help: 'Total API requests',
  labelNames: ['method', 'route', 'status'],
});

const apiRequestDuration = new client.Histogram({
  name: 'api_request_duration_ms',
  help: 'API request duration (ms)',
  labelNames: ['route', 'method'],
  buckets: [50, 100, 200, 500, 1000, 2000],
});

register.registerMetric(apiRequestCounter);
register.registerMetric(apiRequestDuration);

const resolveAllowedOrigins = () => {
  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  if (process.env.NODE_ENV !== 'production') {
    return ['http://localhost:5173', 'http://localhost:3000'];
  }

  return [];
};

const allowedOrigins = resolveAllowedOrigins();

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS);
const trustProxyEnabled = Number.isInteger(trustProxyHops) && trustProxyHops > 0;
app.set('trust proxy', trustProxyEnabled ? trustProxyHops : false);

let warnedMissingTrustProxy = false;
app.use((req, res, next) => {
  if (!trustProxyEnabled && !warnedMissingTrustProxy && req.get('x-forwarded-for')) {
    warnedMissingTrustProxy = true;
    logger.warn(
      'X-Forwarded-For received while trust proxy is disabled; set TRUST_PROXY_HOPS behind a reverse proxy so rate limits key on real client IPs',
    );
  }
  next();
});
app.use(helmet());
app.use(compression());
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again later.' },
});

const fullDumpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many full export requests. Try again later.' },
});

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin || allowedOrigins.includes(origin)) {
    next();
    return;
  }

  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (sameOrigin) {
    next();
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    delete req.headers.origin;
    next();
    return;
  }

  next(new AppError('Origin is not allowed.', 403));
});

app.use(
  cors({
    credentials: true,
    origin: true,
  }),
);
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

app.use((req, res, next) => {
  const requestId = req.get('x-request-id') || Math.random().toString(36).slice(2);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use((req, res, next) => {
  res.success = (data, message = '', code = 0) => {
    res.json({ code, message, data, requestId: req.requestId });
  };

  res.fail = (message = 'bad request', code = 1, data = null, status = 400) => {
    res.status(status).json({ code, message, data, requestId: req.requestId });
  };

  next();
});

app.use((req, res, next) => {
  req.startTime = Date.now();
  logger.info(`Request started: ${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.on('finish', () => {
    logAPI(req, res, req.startTime);
    const routeLabel = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    apiRequestCounter.inc({
      method: req.method,
      route: routeLabel,
      status: String(res.statusCode),
    });
    apiRequestDuration.observe(
      { route: routeLabel, method: req.method },
      Date.now() - req.startTime,
    );
  });

  next();
});

initializeErrorHandling();

let sequelize;
let dbInitialized = false;
let queryOptimizer;

const initDb = async () => {
  if (isTest) {
    dbInitialized = true;
    return true;
  }

  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword) {
    throw new Error('DB_PASSWORD is required. The implicit SQLite fallback was removed.');
  }

  sequelize = createSequelizeInstance(dbUser, dbPassword);
  initializeModels(sequelize);

  const initialized = await initializeData(sequelize);
  if (!initialized) {
    throw new Error('Database bootstrap failed.');
  }

  await dualStorageManager.initializeDualStorage();
  queryOptimizer = new QueryOptimizer(sequelize);
  await queryOptimizer.getQueryStats();

  dbInitialized = true;
  logger.info('Database initialization completed successfully.');
  return true;
};

const checkDbConnection = (req, res, next) => {
  if (!dbInitialized) {
    next(new AppError('Database is not ready yet.', 503));
    return;
  }

  next();
};

const READINESS_PROBE_TIMEOUT_MS = 1500;

const probeDatabase = async () => {
  if (!sequelize) {
    return dbInitialized;
  }

  let timer;
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness probe timed out.')), READINESS_PROBE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (error) {
    logger.warn('Readiness probe failed', { message: error.message });
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const sendReadiness = async (req, res) => {
  const ready = dbInitialized && await probeDatabase();
  res.status(ready ? 200 : 503).json({
    code: 0,
    message: ready ? 'ready' : 'not_ready',
    data: {
      status: ready ? 'ok' : 'degraded',
      database: ready ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    },
    requestId: req.requestId,
  });
};

app.get('/health/live', (req, res) => {
  res.success({ status: 'ok', timestamp: new Date().toISOString() }, 'live');
});

app.get('/health/ready', sendReadiness);
app.get('/health', sendReadiness);

app.get('/metrics', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/auth/session', (req, res) => {
  res.json({ success: true, ...getAdminAuthStatus(req) });
});

app.post('/api/auth/session', loginRateLimiter, createAdminSession, (req, res) => {
  logAdminAudit(req, 'admin.session.login', {
    authenticated: true,
    expiresAt: req.adminSession?.expiresAt ?? null,
  });
  res.json({
    success: true,
    message: 'Admin session created.',
    sessionToken: req.adminSessionToken ?? null,
    ...getAdminAuthStatus(req),
  });
});

app.delete('/api/auth/session', (req, res) => {
  clearAdminSession(req, res);
  logAdminAudit(req, 'admin.session.logout', {
    authenticated: false,
  });
  res.json({
    success: true,
    authenticated: false,
    expiresAt: null,
  });
});

app.get('/api/data', requireAdmin, checkDbConnection, fullDumpRateLimiter, catchAsync(async (req, res) => {
  res.json(await syncData());
}));

app.get('/api/data/optimized', requireAdmin, checkDbConnection, fullDumpRateLimiter, catchAsync(async (req, res) => {
  res.json({
    success: true,
    data: await queryOptimizer.getAllDataOptimized(),
    message: 'Optimized data fetched successfully.',
  });
}));

app.get('/api/agents/optimized', requireAdmin, checkDbConnection, catchAsync(async (req, res) => {
  const limit = Math.min(parsePositiveIntQuery(req.query.limit) ?? 50, 100);
  const filters = {
    factionId: parsePositiveIntQuery(req.query.factionId),
    roleId: parsePositiveIntQuery(req.query.roleId),
    rarityId: parsePositiveIntQuery(req.query.rarityId),
    element: req.query.element,
    limit,
    offset: parseNonNegativeIntQuery(req.query.offset, 0),
  };

  const result = await queryOptimizer.getAgentsOptimized(filters);
  res.json({
    success: true,
    data: result.rows,
    total: result.count,
    filters,
  });
}));

app.get('/api/search/optimized', requireAdmin, checkDbConnection, catchAsync(async (req, res) => {
  const searchTerm = String(req.query.q || '').trim();
  const type = String(req.query.type || 'all');

  if (!searchTerm) {
    throw new AppError('Search term is required.', 400);
  }

  const results = await queryOptimizer.searchOptimized(searchTerm, type);
  const totalResults = Object.values(results).reduce(
    (sum, items) => sum + (items?.length || 0),
    0,
  );

  res.json({
    success: true,
    results,
    totalResults,
    searchTerm,
    type,
  });
}));

app.get('/api/database/stats', requireAdmin, checkDbConnection, catchAsync(async (req, res) => {
  res.json({
    success: true,
    stats: await queryOptimizer.getQueryStats(),
  });
}));

app.get('/api/base-data', checkDbConnection, catchAsync(async (req, res) => {
  const [factions, roles, rarities] = await Promise.all([
    Faction.findAll({ order: [['id', 'ASC']] }),
    Role.findAll({ order: [['id', 'ASC']] }),
    Rarity.findAll({ order: [['id', 'ASC']] }),
  ]);

  res.json({
    factions: factions.map((faction) => ({ id: faction.id, name: faction.name })),
    roles: roles.map((role) => ({ id: role.id, name: role.name })),
    rarities: rarities.map((rarity) => ({ id: rarity.id, name: rarity.name })),
  });
}));

app.get('/api/hsr/base-data', checkDbConnection, catchAsync(async (req, res) => {
  const [elements, paths, rarities, relicTypes] = await Promise.all([
    HsrElement.findAll({ order: [['id', 'ASC']] }),
    HsrPath.findAll({ order: [['id', 'ASC']] }),
    HsrRarity.findAll({ order: [['id', 'ASC']] }),
    HsrRelicType.findAll({ order: [['id', 'ASC']] }),
  ]);

  res.json({
    elements: elements.map((element) => ({ id: element.id, name: element.name })),
    paths: paths.map((item) => ({ id: item.id, name: item.name })),
    rarities: rarities.map((rarity) => ({ id: rarity.id, name: rarity.name })),
    relicTypes: relicTypes.map((type) => ({ id: type.id, name: type.name })),
    relicParts: RELIC_PARTS,
  });
}));

app.get('/api/agents/list', checkDbConnection, catchAsync(async (req, res) => {
  res.success(await listAgents({
    factionIds: parseNumberListQuery(req.query.factionIds),
    roleIds: parseNumberListQuery(req.query.roleIds),
    rarityIds: parseNumberListQuery(req.query.rarityIds),
    elements: parseStringListQuery(req.query.elements),
    limit: parsePositiveIntQuery(req.query.limit),
    offset: parseNonNegativeIntQuery(req.query.offset),
  }));
}));

app.get('/api/sound-engines/list', checkDbConnection, catchAsync(async (req, res) => {
  res.success(await listSoundEngines({
    roleIds: parseNumberListQuery(req.query.roleIds),
    rarityIds: parseNumberListQuery(req.query.rarityIds),
    limit: parsePositiveIntQuery(req.query.limit),
    offset: parseNonNegativeIntQuery(req.query.offset),
  }));
}));

app.get('/api/bumbos/list', checkDbConnection, catchAsync(async (req, res) => {
  res.success(await listBumbos({
    rarityIds: parseNumberListQuery(req.query.rarityIds),
    limit: parsePositiveIntQuery(req.query.limit),
    offset: parseNonNegativeIntQuery(req.query.offset),
  }));
}));

app.get('/api/drive-disks/list', checkDbConnection, catchAsync(async (req, res) => {
  res.success(await listDriveDisks({
    limit: parsePositiveIntQuery(req.query.limit),
    offset: parseNonNegativeIntQuery(req.query.offset),
  }));
}));

app.get('/api/hsr/characters/list', checkDbConnection, catchAsync(async (req, res) => {
  res.success(await listHsrCharacters({
    elementIds: parseNumberListQuery(req.query.elementIds ?? req.query.elementId),
    pathIds: parseNumberListQuery(req.query.pathIds ?? req.query.pathId),
    rarityIds: parseNumberListQuery(req.query.rarityIds ?? req.query.rarityId),
    limit: parsePositiveIntQuery(req.query.limit),
    offset: parseNonNegativeIntQuery(req.query.offset),
  }));
}));

app.get('/api/hsr/cones/list', checkDbConnection, catchAsync(async (req, res) => {
  res.success(await listHsrCones({
    pathIds: parseNumberListQuery(req.query.pathIds ?? req.query.pathId),
    rarityIds: parseNumberListQuery(req.query.rarityIds ?? req.query.rarityId),
    limit: parsePositiveIntQuery(req.query.limit),
    offset: parseNonNegativeIntQuery(req.query.offset),
  }));
}));

app.get('/api/hsr/relics/list', checkDbConnection, catchAsync(async (req, res) => {
  res.success(await listHsrRelics({
    typeIds: parseNumberListQuery(req.query.typeIds ?? req.query.typeId),
    parts: parseStringListQuery(req.query.parts ?? req.query.part),
    limit: parsePositiveIntQuery(req.query.limit),
    offset: parseNonNegativeIntQuery(req.query.offset),
  }));
}));

app.get('/api/dual-storage/web/data', fullDumpRateLimiter, catchAsync(async (req, res) => {
  res.json({
    success: true,
    data: await dualStorageManager.getAllWebData(),
  });
}));

app.get('/api/factions', checkDbConnection, catchAsync(async (req, res) => {
  res.json(await Faction.findAll({ order: [['id', 'ASC']] }));
}));

app.post('/api/agents', requireAdmin, checkDbConnection, validateBody(validateAgentData), catchAsync(async (req, res) => {
  const created = await addAgent(req.body);
  logAdminAudit(req, 'agents.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/agents/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateAgentData), catchAsync(async (req, res) => {
  const agent = await updateAgent(req.params.id, req.body);
  if (!agent) {
    throw new AppError('Agent not found.', 404);
  }

  logAdminAudit(req, 'agents.update', {
    entityId: agent.id,
    name: agent.name,
  });
  res.json(agent);
}));

app.delete('/api/agents/:id', requireAdmin, checkDbConnection, validateId, catchAsync(async (req, res) => {
  const deleted = await deleteAgent(req.params.id);
  if (!deleted) {
    throw new AppError('Agent not found.', 404);
  }

  logAdminAudit(req, 'agents.delete', {
    entityId: Number(req.params.id),
  });
  res.json({ success: true });
}));

app.post('/api/factions', requireAdmin, checkDbConnection, validateBody(validateFactionData), catchAsync(async (req, res) => {
  const created = await Faction.create(req.body);
  logAdminAudit(req, 'factions.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/factions/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateFactionData), catchAsync(async (req, res) => {
  const [updated] = await Faction.update(req.body, { where: { id: req.params.id } });
  if (!updated) {
    throw new AppError('Faction not found.', 404);
  }

  const faction = await Faction.findByPk(req.params.id);
  logAdminAudit(req, 'factions.update', {
    entityId: faction.id,
    name: faction.name,
  });
  res.json(faction);
}));

app.post('/api/sound-engines', requireAdmin, checkDbConnection, validateBody(validateSoundEngineData), catchAsync(async (req, res) => {
  const created = await addSoundEngine(req.body);
  logAdminAudit(req, 'soundEngines.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/sound-engines/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateSoundEngineData), catchAsync(async (req, res) => {
  const engine = await updateSoundEngine(req.params.id, req.body);
  if (!engine) {
    throw new AppError('Sound engine not found.', 404);
  }

  logAdminAudit(req, 'soundEngines.update', {
    entityId: engine.id,
    name: engine.name,
  });
  res.json(engine);
}));

app.delete('/api/sound-engines/:id', requireAdmin, checkDbConnection, validateId, catchAsync(async (req, res) => {
  const deleted = await deleteSoundEngine(req.params.id);
  if (!deleted) {
    throw new AppError('Sound engine not found.', 404);
  }

  logAdminAudit(req, 'soundEngines.delete', {
    entityId: Number(req.params.id),
  });
  res.json({ success: true });
}));

app.post('/api/bumbos', requireAdmin, checkDbConnection, validateBody(validateBumboData), catchAsync(async (req, res) => {
  const created = await addBumbo(req.body);
  logAdminAudit(req, 'bumbos.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/bumbos/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateBumboData), catchAsync(async (req, res) => {
  const bumbo = await updateBumbo(req.params.id, req.body);
  if (!bumbo) {
    throw new AppError('Bumbo not found.', 404);
  }

  logAdminAudit(req, 'bumbos.update', {
    entityId: bumbo.id,
    name: bumbo.name,
  });
  res.json(bumbo);
}));

app.delete('/api/bumbos/:id', requireAdmin, checkDbConnection, validateId, catchAsync(async (req, res) => {
  const deleted = await deleteBumbo(req.params.id);
  if (!deleted) {
    throw new AppError('Bumbo not found.', 404);
  }

  logAdminAudit(req, 'bumbos.delete', {
    entityId: Number(req.params.id),
  });
  res.json({ success: true });
}));

app.post('/api/drive-disks', requireAdmin, checkDbConnection, validateBody(validateDriveDiskData), catchAsync(async (req, res) => {
  const created = await addDriveDisk(req.body);
  logAdminAudit(req, 'driveDisks.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/drive-disks/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateDriveDiskData), catchAsync(async (req, res) => {
  const disk = await updateDriveDisk(req.params.id, req.body);
  if (!disk) {
    throw new AppError('Drive disk not found.', 404);
  }

  logAdminAudit(req, 'driveDisks.update', {
    entityId: disk.id,
    name: disk.name,
  });
  res.json(disk);
}));

app.delete('/api/drive-disks/:id', requireAdmin, checkDbConnection, validateId, catchAsync(async (req, res) => {
  const deleted = await deleteDriveDisk(req.params.id);
  if (!deleted) {
    throw new AppError('Drive disk not found.', 404);
  }

  logAdminAudit(req, 'driveDisks.delete', {
    entityId: Number(req.params.id),
  });
  res.json({ success: true });
}));

app.post('/api/hsr/characters', requireAdmin, checkDbConnection, validateBody(validateHsrCharacterData), catchAsync(async (req, res) => {
  const created = await addHsrCharacter(req.body);
  logAdminAudit(req, 'hsrCharacters.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/hsr/characters/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateHsrCharacterData), catchAsync(async (req, res) => {
  const character = await updateHsrCharacter(req.params.id, req.body);
  if (!character) {
    throw new AppError('HSR character not found.', 404);
  }

  logAdminAudit(req, 'hsrCharacters.update', {
    entityId: character.id,
    name: character.name,
  });
  res.json(character);
}));

app.delete('/api/hsr/characters/:id', requireAdmin, checkDbConnection, validateId, catchAsync(async (req, res) => {
  const deleted = await deleteHsrCharacter(req.params.id);
  if (!deleted) {
    throw new AppError('HSR character not found.', 404);
  }

  logAdminAudit(req, 'hsrCharacters.delete', {
    entityId: Number(req.params.id),
  });
  res.json({ success: true });
}));

app.post('/api/hsr/cones', requireAdmin, checkDbConnection, validateBody(validateHsrConeData), catchAsync(async (req, res) => {
  const created = await addHsrCone(req.body);
  logAdminAudit(req, 'hsrCones.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/hsr/cones/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateHsrConeData), catchAsync(async (req, res) => {
  const cone = await updateHsrCone(req.params.id, req.body);
  if (!cone) {
    throw new AppError('HSR cone not found.', 404);
  }

  logAdminAudit(req, 'hsrCones.update', {
    entityId: cone.id,
    name: cone.name,
  });
  res.json(cone);
}));

app.delete('/api/hsr/cones/:id', requireAdmin, checkDbConnection, validateId, catchAsync(async (req, res) => {
  const deleted = await deleteHsrCone(req.params.id);
  if (!deleted) {
    throw new AppError('HSR cone not found.', 404);
  }

  logAdminAudit(req, 'hsrCones.delete', {
    entityId: Number(req.params.id),
  });
  res.json({ success: true });
}));

app.post('/api/hsr/relics', requireAdmin, checkDbConnection, validateBody(validateHsrRelicData), catchAsync(async (req, res) => {
  const created = await addHsrRelic(req.body);
  logAdminAudit(req, 'hsrRelics.create', {
    entityId: created.id,
    name: created.name,
  });
  res.status(201).json(created);
}));

app.put('/api/hsr/relics/:id', requireAdmin, checkDbConnection, validateId, validateBody(validateHsrRelicData), catchAsync(async (req, res) => {
  const relic = await updateHsrRelic(req.params.id, req.body);
  if (!relic) {
    throw new AppError('HSR relic not found.', 404);
  }

  logAdminAudit(req, 'hsrRelics.update', {
    entityId: relic.id,
    name: relic.name,
  });
  res.json(relic);
}));

app.delete('/api/hsr/relics/:id', requireAdmin, checkDbConnection, validateId, catchAsync(async (req, res) => {
  const deleted = await deleteHsrRelic(req.params.id);
  if (!deleted) {
    throw new AppError('HSR relic not found.', 404);
  }

  logAdminAudit(req, 'hsrRelics.delete', {
    entityId: Number(req.params.id),
  });
  res.json({ success: true });
}));

app.get('/api/dual-storage/status', requireAdmin, catchAsync(async (req, res) => {
  res.json({
    success: true,
    status: {
      ...(await dualStorageManager.getDualStorageStatus()),
      storageDirty: isStorageSyncDirty(),
    },
  });
}));

app.get('/api/storage/data', requireAdmin, async (req, res) => {
  await DataSyncController.getAllData(req, res);
});

app.get('/api/storage/status', requireAdmin, async (req, res) => {
  await DataSyncController.getStorageStatus(req, res);
});

app.post('/api/storage/reset', requireAdmin, checkDbConnection, async (req, res) => {
  await DataSyncController.resetStorage(req, res);
});

app.put('/api/storage/batch/update', requireAdmin, checkDbConnection, async (req, res) => {
  await DataSyncController.updateAllData(req, res);
});

app.get('/api/storage/:type', requireAdmin, validateDataType, async (req, res) => {
  await DataSyncController.getDataByType(req, res);
});

app.put('/api/storage/:type', requireAdmin, checkDbConnection, validateDataType, async (req, res) => {
  await DataSyncController.updateDataByType(req, res);
});

app.use('/api/catalog', createCatalogRouter({
  query: (sql, params = []) => sequelize.query(sql, { replacements: params }),
}));

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

app.use(express.static(distDir));

app.use((req, res, next) => {
  if (req.method !== 'GET'
    || req.path.startsWith('/api')
    || req.path.startsWith('/health')
    || req.path === '/metrics') {
    next();
    return;
  }

  res.sendFile(path.join(distDir, 'index.html'), (sendError) => {
    if (sendError) {
      next();
    }
  });
});

app.use(errorMiddleware);

let httpServer;

initDb()
  .then(() => {
    if (!isTest) {
      httpServer = app.listen(PORT, () => {
        logger.info(`Server listening on http://localhost:${PORT}`);
      });
    }
  })
  .catch((error) => {
    logger.error('Server startup failed', { message: error.message });
    if (!isTest) {
      process.exit(1);
    }
  });

const shutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close(resolve);
        httpServer.closeAllConnections?.();
      });
    }
    await waitForStorageSync();
    if (sequelize) {
      await sequelize.close();
    }
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Graceful shutdown failed', { message: error.message, stack: error.stack });
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
