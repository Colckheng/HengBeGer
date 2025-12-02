import request from 'supertest'
import app from '../../server/index.js'

describe('health endpoint', () => {
  it('returns ok with database state', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('code', 0)
    expect(res.body).toHaveProperty('data')
    expect(res.body.data).toHaveProperty('status', 'ok')
    expect(res.body.data).toHaveProperty('database')
    expect(res.body).toHaveProperty('requestId')
  })
})
