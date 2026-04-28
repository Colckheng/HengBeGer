import { describe, expect, it } from 'vitest';

import { normalizePaginatedPayload } from './publicLists.js';

describe('publicLists', () => {
  it('normalizes paginated payloads', () => {
    expect(normalizePaginatedPayload({
      items: [{ id: 1 }],
      total: 14,
      limit: 12,
      offset: 12,
    })).toEqual({
      items: [{ id: 1 }],
      total: 14,
      limit: 12,
      offset: 12,
      hasMore: true,
    });
  });

  it('falls back to safe defaults for malformed payloads', () => {
    expect(normalizePaginatedPayload({})).toEqual({
      items: [],
      total: 0,
      limit: 12,
      offset: 0,
      hasMore: false,
    });
  });
});
