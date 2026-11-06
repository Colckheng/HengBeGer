import { describe, it, expect } from 'vitest';
import index from '../demo/__fixtures__/index.json';
import { changeSeason, matchesFacets, readLocation, shouldRestoreScroll, toggleFacet } from './state';

const groups = index.groups;

describe('概念页浏览状态', () => {
  it('从地址恢复分类、搜索、筛选和详情身份', () => {
    expect(readLocation('?category=hsr%2Fcharacters&q=三月七&f.%E5%91%BD%E9%80%94=巡猎&item=1224', groups)).toMatchObject({
      world: 'hsr', category: 'hsr/characters', query: '三月七', facets: {命途: ['巡猎']}, itemId: '1224',
    });
  });

  it('从全部结果进入详情时保留列表范围和条目分类', () => {
    expect(readLocation('?q=三月七&item=1224&itemCategory=hsr%2Fcharacters', groups)).toMatchObject({
      world: 'all', category: 'all', query: '三月七', itemCategory: 'hsr/characters', itemId: '1224',
    });
  });

  it('同一筛选字段支持多个值并从地址恢复', () => {
    expect(readLocation('?category=hsr%2Fcharacters&f.%E5%B1%9E%E6%80%A7=冰&f.%E5%B1%9E%E6%80%A7=虚数', groups).facets).toEqual({属性: ['冰', '虚数']});
  });

  it('货币战争支持可核对的星阶字段', () => {
    expect(readLocation('?category=currency%2Fseason1%2Froles&f.%E6%98%9F%E9%98%B6=1', groups).facets).toEqual({星阶: ['1']});
  });

  it('忽略未知分类和该分类没有的筛选字段', () => {
    const state = readLocation('?category=zzz%2Funknown&f.%E5%B1%9E%E6%80%A7=冰', groups);
    expect(state.category).toBe('all');
    expect(state.facets).toEqual({});
  });

  it('切换赛季保留分类和搜索并清除旧筛选', () => {
    expect(changeSeason({world: 'currency', category: 'currency/season1/roles', query: '阿哈', facets: {站位: ['前排']}, itemId: '1502'}, 'season2')).toMatchObject({
      category: 'currency/season2/roles', query: '阿哈', facets: {}, itemId: null,
    });
  });

  it('同一字段多选按或匹配，不同字段按且匹配', () => {
    const items = index.items.filter(entry => entry.category === 'hsr/characters');
    const both = matchesFacets(items[0], {属性: ['冰', '虚数']});
    expect(both).toBe(true);
    expect(matchesFacets(items[0], {属性: ['冰', '虚数'], 命途: ['巡猎']})).toBe(false);
  });

  it('逐项取消筛选条件', () => {
    const facets = toggleFacet({}, '属性', '冰');
    expect(toggleFacet(facets, '属性', '虚数')).toEqual({属性: ['冰', '虚数']});
    expect(toggleFacet({属性: ['冰', '虚数']}, '属性', '冰')).toEqual({属性: ['虚数']});
  });

  it('只有列表条件变化时才恢复滚动位置', () => {
    expect(shouldRestoreScroll('?category=hsr%2Fcharacters', '?category=hsr%2Fcharacters')).toBe(false);
    expect(shouldRestoreScroll('?category=hsr%2Fcharacters', '?category=zzz%2Fagents')).toBe(true);
  });
});
