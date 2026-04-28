import express from 'express';
import request from 'supertest';

import { AppError, errorMiddleware } from '../../src/utils/errorHandler.js';

describe('error response payload', () => {
  it('returns both message and error fields for shared middleware errors', async () => {
    const app = express();

    app.get('/boom', (_req, _res, next) => {
      next(new AppError('Bad request.', 400));
    });

    app.use(errorMiddleware);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Bad request.',
      error: 'Bad request.',
    });
  });
});
