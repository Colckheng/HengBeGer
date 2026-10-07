import { jest } from '@jest/globals';

const replaceAllRecords = jest.fn();
const replaceMultipleRecordSets = jest.fn();
const syncDatabaseToStorage = jest.fn();
const createDatabaseBackup = jest.fn();
const storageManager = {
  getAllStorageData: jest.fn(),
  readFromStorage: jest.fn(),
  getStorageStatus: jest.fn(),
};
const logger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  api: jest.fn(),
};

const STORAGE_TYPES = [
  'agents',
  'soundEngines',
  'bumbos',
  'driveDisks',
  'hsrCharacters',
  'hsrCones',
  'hsrRelics',
];

jest.unstable_mockModule('../../src/db/api.js', () => ({
  replaceAllRecords,
  replaceMultipleRecordSets,
  syncDatabaseToStorage,
}));

jest.unstable_mockModule('../../src/db/databaseBackup.js', () => ({
  createDatabaseBackup,
}));

jest.unstable_mockModule('../../src/db/storageManager.js', () => ({
  default: storageManager,
  STORAGE_TYPES,
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger,
  logAudit: jest.fn(),
}));

const { default: DataSyncController } = await import('../../src/api/dataSync.js');

const createResponse = () => {
  const response = {
    status: jest.fn(() => response),
    json: jest.fn(() => response),
  };

  return response;
};

describe('DataSyncController sync flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createDatabaseBackup.mockResolvedValue({ fileName: 'hengbeger-test.sql' });
  });

  it('rejects updateAllData payloads that are not keyed objects', async () => {
    const req = { body: { data: [] } };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(replaceMultipleRecordSets).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Payload data must be an object keyed by storage type.',
    });
  });

  it('rejects invalid typed items before batch replacement runs', async () => {
    const req = {
      body: {
        data: {
          agents: [
            {
              name: 'Anby',
              element: 'Electric',
              roleId: 1,
              rarityId: 1,
            },
          ],
        },
      },
    };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(replaceMultipleRecordSets).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed for agents.',
      errors: ['agents[0] is missing faction or factionId.'],
    });
  });

  it('replaces only touched types and returns counts from the snapshot', async () => {
    replaceMultipleRecordSets.mockResolvedValue({
      agents: [{ id: 1 }, { id: 2 }],
      hsrCharacters: [{ id: 3 }],
    });

    const req = {
      body: {
        data: {
          agents: [
            {
              name: 'Anby',
              element: 'Electric',
              factionId: 1,
              roleId: 2,
              rarityId: 3,
            },
          ],
          hsrCharacters: [
            {
              name: 'March 7th',
              elementId: 1,
              pathId: 2,
              rarityId: 4,
            },
          ],
        },
      },
    };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(replaceMultipleRecordSets).toHaveBeenCalledWith(
      {
        agents: req.body.data.agents,
        hsrCharacters: req.body.data.hsrCharacters,
      },
      { allowEmptyWipe: false },
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'All provided data sets were replaced successfully.',
        results: {
          agents: { success: true, count: 2 },
          hsrCharacters: { success: true, count: 1 },
        },
      }),
    );
  });

  it('forwards an explicit confirm flag as allowEmptyWipe', async () => {
    replaceMultipleRecordSets.mockResolvedValue({ agents: [] });

    const req = { body: { data: { agents: [] }, confirm: true } };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(replaceMultipleRecordSets).toHaveBeenCalledWith(
      { agents: [] },
      { allowEmptyWipe: true },
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('returns counts when storage is rebuilt successfully', async () => {
    syncDatabaseToStorage.mockResolvedValue({
      agents: [{ id: 1 }],
      soundEngines: [],
      bumbos: [],
      driveDisks: [],
      hsrCharacters: [{ id: 2 }, { id: 3 }],
      hsrCones: [],
      hsrRelics: [],
    });

    const req = {};
    const res = createResponse();

    await DataSyncController.resetStorage(req, res);

    expect(syncDatabaseToStorage).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Storage rebuilt from the database.',
        counts: {
          agents: 1,
          soundEngines: 0,
          bumbos: 0,
          driveDisks: 0,
          hsrCharacters: 2,
          hsrCones: 0,
          hsrRelics: 0,
        },
      }),
    );
  });

  it('returns a stable 500 payload when storage rebuild fails', async () => {
    syncDatabaseToStorage.mockRejectedValue(new Error('sync exploded'));

    const req = {};
    const res = createResponse();

    await DataSyncController.resetStorage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to rebuild storage from database.',
      error: 'Internal server error.',
    });
  });

  it('preserves the 409 wipe guard when batch replacement refuses', async () => {
    const guardError = new Error(
      'Sync would delete all 43 existing "agents" records. '
      + 'Re-stage the data, or resend with confirm: true if this is intentional.',
    );
    guardError.statusCode = 409;
    replaceMultipleRecordSets.mockRejectedValue(guardError);

    const req = { body: { data: { agents: [] } } };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Sync would delete all 43'),
      }),
    );
  });

  it('maps duplicate name violations to 409 on batch replacement', async () => {
    const duplicateError = new Error('duplicate entry');
    duplicateError.name = 'SequelizeUniqueConstraintError';
    replaceMultipleRecordSets.mockRejectedValue(duplicateError);

    const req = {
      body: {
        data: {
          agents: [
            {
              name: 'Anby',
              element: 'Electric',
              factionId: 1,
              roleId: 1,
              rarityId: 1,
            },
          ],
        },
      },
    };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'duplicate entry',
      }),
    );
  });

  it('backs up the database before batch replacement runs', async () => {
    replaceMultipleRecordSets.mockResolvedValue({ agents: [{ id: 1 }] });

    const req = { body: { data: { agents: [{ name: 'Anby', element: 'Electric', factionId: 1, roleId: 1, rarityId: 1 }] } } };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(createDatabaseBackup).toHaveBeenCalledTimes(1);
    expect(createDatabaseBackup.mock.invocationCallOrder[0])
      .toBeLessThan(replaceMultipleRecordSets.mock.invocationCallOrder[0]);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        backup: 'hengbeger-test.sql',
      }),
    );
  });

  it('aborts batch replacement when the database backup fails', async () => {
    const backupError = new Error('mysqldump unavailable');
    backupError.statusCode = 503;
    createDatabaseBackup.mockRejectedValue(backupError);

    const req = { body: { data: { agents: [] } } };
    const res = createResponse();

    await DataSyncController.updateAllData(req, res);

    expect(replaceMultipleRecordSets).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'mysqldump unavailable',
      }),
    );
  });
});
