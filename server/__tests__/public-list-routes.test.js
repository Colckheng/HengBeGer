import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

import { catchAsync, errorMiddleware } from '../../src/utils/errorHandler.js';
import {
  parseNonNegativeIntQuery,
  parseNumberListQuery,
  parsePositiveIntQuery,
  parseStringListQuery,
} from '../utils/publicListQuery.js';

const buildTestApp = ({ listAgents, listHsrRelics }) => {
  const app = express();

  app.use((req, res, next) => {
    req.requestId = 'test-request-id';
    res.success = (data, message = '', code = 0) => {
      res.json({ code, message, data, requestId: req.requestId });
    };
    next();
  });

  app.get('/api/agents/list', catchAsync(async (req, res) => {
    res.success(await listAgents({
      factionIds: parseNumberListQuery(req.query.factionIds),
      roleIds: parseNumberListQuery(req.query.roleIds),
      rarityIds: parseNumberListQuery(req.query.rarityIds),
      elements: parseStringListQuery(req.query.elements),
      limit: parsePositiveIntQuery(req.query.limit),
      offset: parseNonNegativeIntQuery(req.query.offset),
    }));
  }));

  app.get('/api/hsr/relics/list', catchAsync(async (req, res) => {
    res.success(await listHsrRelics({
      typeIds: parseNumberListQuery(req.query.typeIds ?? req.query.typeId),
      parts: parseStringListQuery(req.query.parts ?? req.query.part),
      limit: parsePositiveIntQuery(req.query.limit),
      offset: parseNonNegativeIntQuery(req.query.offset),
    }));
  }));

  app.use(errorMiddleware);

  return app;
};

describe('public list routes', () => {
  it('parses ZZZ list filters and returns the normalized payload shape', async () => {
    const listAgents = jest.fn().mockResolvedValue({
      items: [{ id: 1, name: 'Anby' }],
      total: 7,
      limit: 20,
      offset: 40,
      hasMore: false,
    });
    const app = buildTestApp({
      listAgents,
      listHsrRelics: jest.fn(),
    });

    const response = await request(app).get('/api/agents/list').query({
      factionIds: '3,4',
      roleIds: '1,2',
      rarityIds: '5',
      elements: '电,火',
      limit: '20',
      offset: '40',
    });

    expect(response.status).toBe(200);
    expect(listAgents).toHaveBeenCalledWith({
      factionIds: [3, 4],
      roleIds: [1, 2],
      rarityIds: [5],
      elements: ['电', '火'],
      limit: 20,
      offset: 40,
    });
    expect(response.body).toEqual({
      code: 0,
      message: '',
      data: {
        items: [{ id: 1, name: 'Anby' }],
        total: 7,
        limit: 20,
        offset: 40,
        hasMore: false,
      },
      requestId: 'test-request-id',
    });
  });

  it('supports the legacy single-value HSR relic query names', async () => {
    const listHsrRelics = jest.fn().mockResolvedValue({
      items: [{ id: 9, name: '流星' }],
      total: 1,
      limit: 12,
      offset: 0,
      hasMore: false,
    });
    const app = buildTestApp({
      listAgents: jest.fn(),
      listHsrRelics,
    });

    const response = await request(app).get('/api/hsr/relics/list').query({
      typeId: '2',
      part: '头',
    });

    expect(response.status).toBe(200);
    expect(listHsrRelics).toHaveBeenCalledWith({
      typeIds: [2],
      parts: ['头'],
      limit: undefined,
      offset: 0,
    });
  });
});
