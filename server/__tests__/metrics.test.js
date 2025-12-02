import request from 'supertest'
import app from '../../server/index.js'

describe('metrics endpoint', () => {
  it('returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.text).toContain('api_requests_total')
  })
})
