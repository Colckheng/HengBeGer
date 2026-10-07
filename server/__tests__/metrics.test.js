import request from 'supertest'

import app from '../../server/index.js'
import { TEST_AUTH } from '../middleware/auth.js'

describe('metrics endpoint', () => {
  it('rejects unauthenticated scrapes', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(401)
  })

  it('returns prometheus metrics for admins', async () => {
    const agent = request.agent(app)
    const login = await agent
      .post('/api/auth/session')
      .send({ password: TEST_AUTH.password })
    expect(login.status).toBe(200)

    const res = await agent.get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.text).toContain('api_requests_total')
  })
})
