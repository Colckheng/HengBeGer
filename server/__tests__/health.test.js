import request from 'supertest';

import app from '../../server/index.js';

describe('health endpoints', () => {
  it('returns a live response', async () => {
    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('code', 0);
    expect(response.body.data).toHaveProperty('status', 'ok');
  });

  it('returns readiness details', async () => {
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('code', 0);
    expect(response.body.data).toHaveProperty('status', 'ok');
    expect(response.body.data).toHaveProperty('database', 'connected');
    expect(response.body).toHaveProperty('requestId');
  });
});
