import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

import { catchAsync, errorMiddleware } from '../../src/utils/errorHandler.js';
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

  app.get('/api/dual-storage/status', requireAdmin, catchAsync(async (req, res) => {
    res.json({
      success: true,
      status: await dualStorageManager.getDualStorageStatus(),
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
  it('returns dual storage status metadata', async () => {
    const status = {
      initialized: true,
      lastCheck: '2026-04-07T00:00:00.000Z',
      web: {
        agents: { exists: true, count: 2 },
      },
    };
    const dualStorageManager = {
      getDualStorageStatus: jest.fn().mockResolvedValue(status),
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

  it('requires admin authentication for status', async () => {
    const dualStorageManager = {
      getDualStorageStatus: jest.fn(),
    };
    const app = buildTestApp({ dualStorageManager });

    const response = await request(app).get('/api/dual-storage/status');

    expect(response.status).toBe(401);
    expect(dualStorageManager.getDualStorageStatus).not.toHaveBeenCalled();
  });
});
