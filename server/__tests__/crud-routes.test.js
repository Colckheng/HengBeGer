import express from 'express';
import request from 'supertest';

import {
  createAdminSession,
  getAdminAuthStatus,
  requireAdmin,
  TEST_AUTH,
} from '../middleware/auth.js';
import validationModule from '../middleware/validation.cjs';
import { errorMiddleware } from '../../src/utils/errorHandler.js';

const {
  validateAgentData,
  validateBody,
  validateHsrCharacterData,
} = validationModule;

const buildTestApp = () => {
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

  app.post(
    '/api/agents',
    requireAdmin,
    validateBody(validateAgentData),
    (req, res) => {
      res.status(201).json({
        success: true,
        payload: req.body,
      });
    },
  );

  app.post(
    '/api/hsr/characters',
    requireAdmin,
    validateBody(validateHsrCharacterData),
    (req, res) => {
      res.status(201).json({
        success: true,
        payload: req.body,
      });
    },
  );

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

describe('representative authenticated create routes', () => {
  it('rejects invalid agent payloads with a shared 400 error shape', async () => {
    const app = buildTestApp();
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/agents').send({
      name: 'Anby',
      element: 'Electric',
      factionId: 'bad-id',
      roleId: 1,
      rarityId: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(typeof response.body.message).toBe('string');
    expect(response.body.message).toBe(response.body.error);
  });

  it('accepts valid agent payloads and normalizes numeric ids', async () => {
    const app = buildTestApp();
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/agents').send({
      name: 'Anby',
      element: 'Electric',
      factionId: '1',
      roleId: '2',
      rarityId: '3',
      description: '<b>Leader</b>',
    });

    expect(response.status).toBe(201);
    expect(response.body.payload).toMatchObject({
      name: 'Anby',
      element: 'Electric',
      factionId: 1,
      roleId: 2,
      rarityId: 3,
      description: 'Leader',
    });
  });

  it('rejects invalid HSR character payloads with a shared 400 error shape', async () => {
    const app = buildTestApp();
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/hsr/characters').send({
      name: 'March 7th',
      elementId: 'bad-id',
      pathId: 1,
      rarityId: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(typeof response.body.message).toBe('string');
    expect(response.body.message).toBe(response.body.error);
  });

  it('accepts valid HSR character payloads and normalizes numeric ids', async () => {
    const app = buildTestApp();
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/hsr/characters').send({
      name: 'March 7th',
      elementId: '1',
      pathId: '2',
      rarityId: '4',
      image: '/assets/march.png',
    });

    expect(response.status).toBe(201);
    expect(response.body.payload).toMatchObject({
      name: 'March 7th',
      elementId: 1,
      pathId: 2,
      rarityId: 4,
      image: '/assets/march.png',
    });
  });
});
