import request from 'supertest';

import app from '../../server/index.js';
import { TEST_AUTH } from '../middleware/auth.js';

describe('admin authentication', () => {
  it('rejects unauthenticated write requests', async () => {
    const response = await request(app).post('/api/agents').send({
      name: 'Test',
      element: '物理',
      faction: 'Faction',
      role: 'Role',
      rarity: 'A',
    });

    expect(response.status).toBe(401);
  });

  it('creates a cookie session with the configured admin password', async () => {
    const agent = request.agent(app);

    const loginResponse = await agent.post('/api/auth/session').send({
      password: TEST_AUTH.password,
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toMatchObject({
      success: true,
      authenticated: true,
      configured: true,
    });
    expect(typeof loginResponse.body.sessionToken).toBe('string');
    expect(loginResponse.body.sessionToken.length).toBeGreaterThan(10);

    const statusResponse = await agent.get('/api/auth/session');
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toMatchObject({
      success: true,
      authenticated: true,
      configured: true,
    });
  });

  it('accepts a signed session token in the Authorization header', async () => {
    const loginResponse = await request(app).post('/api/auth/session').send({
      password: TEST_AUTH.password,
    });

    const statusResponse = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${loginResponse.body.sessionToken}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toMatchObject({
      success: true,
      authenticated: true,
      configured: true,
    });
    expect(typeof statusResponse.body.expiresAt).toBe('number');
  });

  it('clears the admin session on logout', async () => {
    const agent = request.agent(app);

    const loginResponse = await agent.post('/api/auth/session').send({
      password: TEST_AUTH.password,
    });

    expect(loginResponse.status).toBe(200);

    const logoutResponse = await agent.delete('/api/auth/session');

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({
      success: true,
      authenticated: false,
      expiresAt: null,
    });

    const statusResponse = await agent.get('/api/auth/session');

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toMatchObject({
      success: true,
      configured: true,
      authenticated: false,
      expiresAt: null,
    });
  });
});
