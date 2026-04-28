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

const buildTestApp = ({ dualStorageManager }) => {
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

  app.post('/api/dual-storage/initialize', requireAdmin, catchAsync(async (req, res) => {
    await dualStorageManager.initializeDualStorage();
    res.json({ success: true, message: 'Web storage initialized.' });
  }));

  app.get('/api/dual-storage/admin/data', requireAdmin, catchAsync(async (req, res) => {
    res.json({
      success: true,
      data: await dualStorageManager.getAllAdminData(),
    });
  }));

  app.get('/api/dual-storage/status', requireAdmin, catchAsync(async (req, res) => {
    res.json({
      success: true,
      status: await dualStorageManager.getDualStorageStatus(),
    });
  }));

  app.delete('/api/dual-storage/admin/session', requireAdmin, catchAsync(async (req, res) => {
    await dualStorageManager.cleanupAdminSession();
    res.json({
      success: true,
      message: 'Admin storage session cleaned up.',
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

describe('admin maintenance routes', () => {
  it('initializes public storage from the current database snapshot', async () => {
    const dualStorageManager = {
      initializeDualStorage: jest.fn().mockResolvedValue(true),
      getAllAdminData: jest.fn(),
      getDualStorageStatus: jest.fn(),
      cleanupAdminSession: jest.fn(),
    };
    const app = buildTestApp({ dualStorageManager });
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/dual-storage/initialize').send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Web storage initialized.',
    });
    expect(dualStorageManager.initializeDualStorage).toHaveBeenCalledTimes(1);
  });

  it('returns all staged admin data', async () => {
    const stagedData = {
      agents: [{ id: 1, name: 'Anby' }],
      soundEngines: [],
    };
    const dualStorageManager = {
      initializeDualStorage: jest.fn(),
      getAllAdminData: jest.fn().mockResolvedValue(stagedData),
      getDualStorageStatus: jest.fn(),
      cleanupAdminSession: jest.fn(),
    };
    const app = buildTestApp({ dualStorageManager });
    const agent = await loginAsAdmin(app);

    const response = await agent.get('/api/dual-storage/admin/data');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: stagedData,
    });
    expect(dualStorageManager.getAllAdminData).toHaveBeenCalledTimes(1);
  });

  it('returns dual storage status metadata', async () => {
    const status = {
      initialized: true,
      lastCheck: '2026-04-07T00:00:00.000Z',
      web: {
        agents: { exists: true, count: 2 },
      },
      admin: {
        agents: { exists: true, count: 2, sessionStarted: '2026-04-07T00:00:00.000Z' },
      },
    };
    const dualStorageManager = {
      initializeDualStorage: jest.fn(),
      getAllAdminData: jest.fn(),
      getDualStorageStatus: jest.fn().mockResolvedValue(status),
      cleanupAdminSession: jest.fn(),
    };
    const app = buildTestApp({ dualStorageManager });
    const agent = await loginAsAdmin(app);

    const response = await agent.get('/api/dual-storage/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      status,
    });
    expect(dualStorageManager.getDualStorageStatus).toHaveBeenCalledTimes(1);
  });

  it('cleans up the admin staging session files', async () => {
    const dualStorageManager = {
      initializeDualStorage: jest.fn(),
      getAllAdminData: jest.fn(),
      getDualStorageStatus: jest.fn(),
      cleanupAdminSession: jest.fn().mockResolvedValue(true),
    };
    const app = buildTestApp({ dualStorageManager });
    const agent = await loginAsAdmin(app);

    const response = await agent.delete('/api/dual-storage/admin/session');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Admin storage session cleaned up.',
    });
    expect(dualStorageManager.cleanupAdminSession).toHaveBeenCalledTimes(1);
  });

  it('surfaces cleanup failures through the shared error response shape', async () => {
    const dualStorageManager = {
      initializeDualStorage: jest.fn(),
      getAllAdminData: jest.fn(),
      getDualStorageStatus: jest.fn(),
      cleanupAdminSession: jest.fn().mockRejectedValue(
        new AppError('Admin session cleanup failed.', 503),
      ),
    };
    const app = buildTestApp({ dualStorageManager });
    const agent = await loginAsAdmin(app);

    const response = await agent.delete('/api/dual-storage/admin/session');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Admin session cleanup failed.',
      error: 'Admin session cleanup failed.',
    });
  });
});
