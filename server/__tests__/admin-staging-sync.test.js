import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

import { AppError, catchAsync, errorMiddleware } from '../../src/utils/errorHandler.js';
import {
  createAdminSession,
  getAdminAuthStatus,
  requireAdmin,
  TEST_AUTH,
} from '../middleware/auth.js';
import validationModule from '../middleware/validation.cjs';

const { validateDataType } = validationModule;

const buildTestApp = ({ dualStorageManager, replaceMultipleRecordSets }) => {
  const app = express();

  app.use(express.json());

  app.post('/api/auth/session', createAdminSession, (req, res) => {
    res.json({
      success: true,
      message: 'Admin session created.',
      sessionToken: req.adminSessionToken ?? null,
      ...getAdminAuthStatus(req),
    });
  });

  app.post('/api/dual-storage/admin/session', requireAdmin, catchAsync(async (req, res) => {
    await dualStorageManager.initializeAdminSession({
      forceRefresh: req.body?.forceRefresh === true,
    });
    res.json({ success: true, message: 'Admin storage session initialized.' });
  }));

  app.put('/api/dual-storage/admin/:type', requireAdmin, validateDataType, catchAsync(async (req, res) => {
    if (!Array.isArray(req.body?.data)) {
      throw new AppError('Admin storage payload must be an array.', 400);
    }

    await dualStorageManager.saveToAdminStorage(req.params.type, req.body.data);
    res.json({
      success: true,
      message: `${req.params.type} admin staging updated.`,
    });
  }));

  app.post('/api/dual-storage/sync', requireAdmin, catchAsync(async (req, res) => {
    const stagedData = await dualStorageManager.getAllAdminData();
    const snapshot = await replaceMultipleRecordSets(stagedData);
    await dualStorageManager.saveAllToAdminStorage(snapshot);

    res.json({
      success: true,
      message: 'Admin staging synced to the database and public storage.',
      syncResults: Object.fromEntries(
        Object.entries(snapshot).map(([type, items]) => [type, {
          success: true,
          count: items.length,
        }]),
      ),
    });
  }));

  app.use(errorMiddleware);

  return app;
};

const loginAsAdmin = async (app) => {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/session').send({
    password: TEST_AUTH.password,
  });

  expect(response.status).toBe(200);
  return agent;
};

describe('admin staging sync routes', () => {
  it('initializes admin staging with the requested forceRefresh flag', async () => {
    const dualStorageManager = {
      initializeAdminSession: jest.fn().mockResolvedValue(true),
      saveToAdminStorage: jest.fn(),
      getAllAdminData: jest.fn(),
      saveAllToAdminStorage: jest.fn(),
    };
    const app = buildTestApp({
      dualStorageManager,
      replaceMultipleRecordSets: jest.fn(),
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/dual-storage/admin/session').send({
      forceRefresh: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Admin storage session initialized.',
    });
    expect(dualStorageManager.initializeAdminSession).toHaveBeenCalledWith({
      forceRefresh: true,
    });
  });

  it('updates staged type payloads when data is an array', async () => {
    const dualStorageManager = {
      initializeAdminSession: jest.fn(),
      saveToAdminStorage: jest.fn().mockResolvedValue(true),
      getAllAdminData: jest.fn(),
      saveAllToAdminStorage: jest.fn(),
    };
    const app = buildTestApp({
      dualStorageManager,
      replaceMultipleRecordSets: jest.fn(),
    });
    const agent = await loginAsAdmin(app);
    const payload = [{ id: 1, name: 'Anby' }];

    const response = await agent.put('/api/dual-storage/admin/agents').send({
      data: payload,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'agents admin staging updated.',
    });
    expect(dualStorageManager.saveToAdminStorage).toHaveBeenCalledWith('agents', payload);
  });

  it('rejects staged type payloads that are not arrays', async () => {
    const dualStorageManager = {
      initializeAdminSession: jest.fn(),
      saveToAdminStorage: jest.fn(),
      getAllAdminData: jest.fn(),
      saveAllToAdminStorage: jest.fn(),
    };
    const app = buildTestApp({
      dualStorageManager,
      replaceMultipleRecordSets: jest.fn(),
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.put('/api/dual-storage/admin/agents').send({
      data: { bad: true },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Admin storage payload must be an array.',
      error: 'Admin storage payload must be an array.',
    });
    expect(dualStorageManager.saveToAdminStorage).not.toHaveBeenCalled();
  });

  it('publishes staged data and returns sync counts', async () => {
    const dualStorageManager = {
      initializeAdminSession: jest.fn(),
      saveToAdminStorage: jest.fn(),
      getAllAdminData: jest.fn().mockResolvedValue({
        agents: [{ id: 1, name: 'Anby' }],
        hsrCharacters: [{ id: 7, name: 'March 7th' }],
      }),
      saveAllToAdminStorage: jest.fn().mockResolvedValue(true),
    };
    const replaceMultipleRecordSets = jest.fn().mockResolvedValue({
      agents: [{ id: 1, name: 'Anby' }, { id: 2, name: 'Nicole' }],
      hsrCharacters: [{ id: 7, name: 'March 7th' }],
    });
    const app = buildTestApp({
      dualStorageManager,
      replaceMultipleRecordSets,
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/dual-storage/sync').send({});

    expect(response.status).toBe(200);
    expect(dualStorageManager.getAllAdminData).toHaveBeenCalledTimes(1);
    expect(replaceMultipleRecordSets).toHaveBeenCalledWith({
      agents: [{ id: 1, name: 'Anby' }],
      hsrCharacters: [{ id: 7, name: 'March 7th' }],
    });
    expect(dualStorageManager.saveAllToAdminStorage).toHaveBeenCalledWith({
      agents: [{ id: 1, name: 'Anby' }, { id: 2, name: 'Nicole' }],
      hsrCharacters: [{ id: 7, name: 'March 7th' }],
    });
    expect(response.body).toEqual({
      success: true,
      message: 'Admin staging synced to the database and public storage.',
      syncResults: {
        agents: { success: true, count: 2 },
        hsrCharacters: { success: true, count: 1 },
      },
    });
  });

  it('surfaces sync failures through the shared error response shape', async () => {
    const dualStorageManager = {
      initializeAdminSession: jest.fn(),
      saveToAdminStorage: jest.fn(),
      getAllAdminData: jest.fn().mockResolvedValue({
        agents: [],
      }),
      saveAllToAdminStorage: jest.fn(),
    };
    const replaceMultipleRecordSets = jest.fn().mockRejectedValue(
      new AppError('Admin staging publish failed.', 503),
    );
    const app = buildTestApp({
      dualStorageManager,
      replaceMultipleRecordSets,
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/dual-storage/sync').send({});

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Admin staging publish failed.',
      error: 'Admin staging publish failed.',
    });
    expect(dualStorageManager.saveAllToAdminStorage).not.toHaveBeenCalled();
  });
});
