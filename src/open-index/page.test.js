import {describe, expect, it} from 'vitest';
import {entryUrl, INDEX_PATH, INDEX_URL, isIndexPath, pageHref, pageUrl, updatePage} from './page.js';

// The archive answers on "/" and keeps "/index" as an alias; both must be
// recognised as the open-index shell, and every other route must stay legacy.
describe('open index routing contract', () => {
  it('claims the product entry point and its alias', () => {
    expect(isIndexPath('/')).toBe(true);
    expect(isIndexPath(INDEX_PATH)).toBe(true);
    expect(isIndexPath(`${INDEX_PATH}/`)).toBe(true);
  });

  it('leaves the legacy wiki routes alone', () => {
    for (const path of ['/zzz-wiki', '/zzz-wiki/agent/1011', '/hsr-wiki', '/hsr-wiki/admin', '/zzz-wiki/admin', '/data-test', '/nope']) {
      expect(isIndexPath(path)).toBe(false);
    }
  });

  it('builds hash links inside the archive', () => {
    // With no parameters the demo grammar omits the query marker entirely.
    expect(pageHref()).toBe('#/orbital');
    expect(pageHref({view: 'list', category: 'hsr/characters'})).toBe('#/orbital?view=list&category=hsr%2Fcharacters');
    expect(pageUrl({view: 'list'})).toBe(`${INDEX_PATH}#/orbital?view=list`);
  });

  it('points entries at the cleaned detail endpoint', () => {
    expect(INDEX_URL).toBe('/api/catalog/index');
    expect(entryUrl('hsr/characters/1415')).toBe('/api/catalog/entry?key=hsr%2Fcharacters%2F1415');
  });

  it('writes the hash without leaving the route', () => {
    window.location.hash = '';
    updatePage({view: 'list'}, {entry: 'zzz/agents/1011'});
    expect(window.location.hash).toBe('#/orbital?view=list&entry=zzz%2Fagents%2F1011');
  });
});
