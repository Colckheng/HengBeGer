import fs from 'node:fs';
import {
  IMAGE_ALIASES,
  extFromContentType,
  extFromUrl,
  bwikiOriginal,
  pickBwikiImage,
  pickMihoyoListItem,
  setImageFm,
  createImageResolvers,
} from '../../scripts/crawler/sources/image-sources.js';

const loadJson = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/images/${name}`, import.meta.url), 'utf8'));
const loadText = (name) => fs.readFileSync(new URL(`./fixtures/images/${name}`, import.meta.url), 'utf8');

function mockFetchers({ listJson, wikiHtml } = {}) {
  const listFetcher = {
    getJson: async () => {
      if (listJson instanceof Error) throw listJson;
      return listJson;
    },
  };
  const wikiFetcher = {
    getText: async (url) => {
      const html = typeof wikiHtml === 'function' ? wikiHtml(url) : wikiHtml;
      if (html instanceof Error) throw html;
      if (html === undefined) throw new Error(`no fixture for ${url}`);
      return html;
    },
  };
  return { listFetcher, wikiFetcher };
}

describe('image url helpers', () => {
  test('extFromContentType and extFromUrl', () => {
    expect(extFromContentType('image/png')).toBe('.png');
    expect(extFromContentType('image/jpeg; charset=binary')).toBe('.jpg');
    expect(extFromContentType('text/html')).toBe('');
    expect(extFromUrl('https://x/a/b.png?v=1')).toBe('.png');
    expect(extFromUrl('https://x/a/b.jpeg')).toBe('.jpg');
    expect(extFromUrl('https://x/a/b')).toBe('');
  });

  test('bwikiOriginal converts thumb urls and keeps originals', () => {
    expect(bwikiOriginal('https://patchwiki.biligame.com/images/sr/thumb/6/62/abc.png/60px-x.png')).toBe(
      'https://patchwiki.biligame.com/images/sr/6/62/abc.png',
    );
    expect(bwikiOriginal('https://patchwiki.biligame.com/images/sr/3/3f/shield.png')).toBe(
      'https://patchwiki.biligame.com/images/sr/3/3f/shield.png',
    );
  });
});

describe('pickBwikiImage', () => {
  const rolesHtml = loadText('bwiki-currency-roles.html');
  const agentHtml = loadText('bwiki-zzz-agent.html');

  test('prefers exact filename and converts to original', () => {
    expect(pickBwikiImage(rolesHtml, '三月七')).toBe('https://patchwiki.biligame.com/images/sr/6/62/abc123def.png');
  });

  test('skips icon-like decoys containing the name', () => {
    const u = pickBwikiImage(rolesHtml, '三月七');
    expect(u).not.toContain('face1');
    expect(u).not.toContain('decoy');
  });

  test('prefers character artwork on individual pages', () => {
    expect(pickBwikiImage(agentHtml, '安比')).toBe('https://patchwiki.biligame.com/images/zzz/9/9a/artwork1.png');
  });

  test('returns empty when name absent', () => {
    expect(pickBwikiImage(rolesHtml, '瓦尔特')).toBe('');
  });
});

describe('pickMihoyoListItem', () => {
  const items = loadJson('mihoyo-list.json').data.list[0].list;

  test('matches exact title', () => {
    expect(pickMihoyoListItem(items, '三月七').content_id).toBe(48);
  });

  test('matches alias and does not confuse similar names', () => {
    expect(pickMihoyoListItem(items, '安比').content_id).toBe(379);
    expect(pickMihoyoListItem(items, '零号·安比').content_id).toBe(999);
  });

  test('returns null without match', () => {
    expect(pickMihoyoListItem(items, '不存在')).toBeNull();
  });
});

describe('setImageFm', () => {
  test('replaces existing image line', () => {
    const raw = '---\nname: "安比"\nimage: ""\n---\n\n# 安比\n正文\n';
    const out = setImageFm(raw, 'zzz/agents/1011.png');
    expect(out).toContain('image: "zzz/agents/1011.png"');
    expect(out).toContain('# 安比\n正文');
    expect((out.match(/^image:/gm) || []).length).toBe(1);
  });

  test('inserts image line when missing', () => {
    const raw = '---\nname: "安比"\nid: 1011\n---\n\n# 安比\n正文\n';
    const out = setImageFm(raw, 'zzz/agents/1011.png');
    expect(out).toMatch(/image: "zzz\/agents\/1011.png"\n---/);
    expect(out).toContain('# 安比\n正文');
  });

  test('throws without front-matter', () => {
    expect(() => setImageFm('# 无 front-matter\n', 'x.png')).toThrow();
  });
});

describe('createImageResolvers chain', () => {
  const listJson = loadJson('mihoyo-list.json');
  const agentHtml = loadText('bwiki-zzz-agent.html');
  const rolesHtml = loadText('bwiki-currency-roles.html');

  test('agents yields mihoyo icon first then bwiki page artwork', async () => {
    const resolvers = createImageResolvers(
      mockFetchers({ listJson, wikiHtml: (url) => (url.includes('/zzz/') ? agentHtml : undefined) }),
    );
    const steps = [];
    for await (const s of resolvers.candidateSteps('agents', '安比')) steps.push(s);
    expect(steps).toHaveLength(2);
    expect(steps[0].step.type).toBe('mihoyo');
    expect(steps[0].urls[0]).toBe('https://act-upload.mihoyo.com/nap/agent-anby.png');
    expect(steps[1].step.type).toBe('bwiki-page');
    expect(steps[1].urls).toEqual(['https://patchwiki.biligame.com/images/zzz/9/9a/artwork1.png']);
  });

  test('roles yields bwiki list first then mihoyo fallback', async () => {
    const resolvers = createImageResolvers(
      mockFetchers({ listJson, wikiHtml: (url) => (url.includes('%') ? rolesHtml : undefined) }),
    );
    const steps = [];
    for await (const s of resolvers.candidateSteps('roles', '三月七')) steps.push(s);
    expect(steps).toHaveLength(2);
    expect(steps[0].step.type).toBe('bwiki-list');
    expect(steps[0].urls[0]).toContain('patchwiki.biligame.com/images/sr/6/62/');
    expect(steps[1].step.type).toBe('mihoyo');
    expect(steps[1].urls[0]).toBe('https://act-upload.mihoyo.com/sr/march7th.png');
  });

  test('continues chain when primary source fails', async () => {
    const resolvers = createImageResolvers(
      mockFetchers({ listJson: new Error('boom'), wikiHtml: (url) => (url.includes('/zzz/') ? agentHtml : undefined) }),
    );
    const steps = [];
    for await (const s of resolvers.candidateSteps('agents', '安比')) steps.push(s);
    expect(steps[0].urls).toEqual([]);
    expect(steps[0].error).toBeTruthy();
    expect(steps[1].urls).toHaveLength(1);
  });

  test('unknown alias throws', async () => {
    const resolvers = createImageResolvers(mockFetchers({}));
    await expect(
      (async () => {
        for await (const s of resolvers.candidateSteps('nope', 'x')) void s;
      })(),
    ).rejects.toThrow();
  });
});

describe('alias config sanity', () => {
  test('every alias maps to dirs and chain', () => {
    for (const [, cfg] of Object.entries(IMAGE_ALIASES)) {
      expect(cfg.dir.length).toBeGreaterThan(0);
      expect(cfg.imgDir).toBeTruthy();
      expect(cfg.chain.length).toBeGreaterThan(0);
    }
  });
});
