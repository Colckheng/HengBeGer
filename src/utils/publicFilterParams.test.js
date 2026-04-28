import { describe, expect, it } from 'vitest';

import { buildHsrListRequest, buildZzzListRequest } from './publicFilterParams.js';

const baseData = {
  factions: [{ id: 1, name: '狡兔屋' }],
  roles: [{ id: 2, name: '强攻' }],
  rarities: [{ id: 3, name: 'S' }],
  hsr: {
    elements: [{ id: 4, name: '冰' }],
    paths: [{ id: 5, name: '巡猎' }],
    rarities: [{ id: 6, name: '五星' }],
    relicTypes: [{ id: 7, name: '位面饰品' }],
    relicParts: ['位面球'],
  },
};

describe('publicFilterParams', () => {
  it('builds ZZZ list requests from selected display names', () => {
    expect(buildZzzListRequest('agents', {
      role: ['强攻'],
      faction: ['狡兔屋'],
      rarity: ['S'],
      element: ['电'],
    }, baseData)).toEqual({
      roleIds: [2],
      factionIds: [1],
      rarityIds: [3],
      elements: ['电'],
    });
  });

  it('builds HSR list requests from selected display names', () => {
    expect(buildHsrListRequest('hsrRelics', {
      type: ['位面饰品'],
      part: ['位面球'],
    }, baseData)).toEqual({
      typeIds: [7],
      parts: ['位面球'],
    });
  });
});
