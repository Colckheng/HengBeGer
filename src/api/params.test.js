import { describe, expect, it } from 'vitest';

import { serializeApiParams } from './params.js';

describe('serializeApiParams', () => {
  it('joins arrays into comma lists', () => {
    expect(serializeApiParams({ roleIds: [1, 2, 3], elements: ['电', '火'] }))
      .toBe('roleIds=1%2C2%2C3&elements=%E7%94%B5%2C%E7%81%AB');
  });

  it('keeps scalar values', () => {
    expect(serializeApiParams({ limit: 12, offset: 0, q: 'abc' }))
      .toBe('limit=12&offset=0&q=abc');
  });

  it('drops undefined, null and empty entries', () => {
    expect(serializeApiParams({
      roleIds: undefined,
      factionIds: null,
      elements: ['', '冰'],
      rarityIds: [],
    })).toBe('elements=%E5%86%B0');
  });

  it('returns an empty string for empty params', () => {
    expect(serializeApiParams()).toBe('');
    expect(serializeApiParams({})).toBe('');
  });
});
