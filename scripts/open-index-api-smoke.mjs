// Smoke-test the production Open Index API against a running server.
// Usage: node scripts/open-index-api-smoke.mjs [base]
const base = process.argv[2] || 'http://127.0.0.1:3001';
const out = {base, checks: [], failures: []};
const check = (name, ok, detail) => {
  out.checks.push({name, ok, detail});
  if (!ok) out.failures.push(name + ': ' + detail);
};

const t0 = Date.now();
const indexRes = await fetch(base + '/api/catalog/index');
const indexBytes = (await indexRes.clone().arrayBuffer()).byteLength;
const index = await indexRes.json();
const indexMs = Date.now() - t0;

check('index.status', indexRes.status === 200, String(indexRes.status));
check('index.items', Array.isArray(index.items) && index.items.length === 2675, 'items=' + index.items?.length);
check('index.groups', Array.isArray(index.groups) && index.groups.length === 23, 'groups=' + index.groups?.length);
check('index.generatedAt', typeof index.generatedAt === 'string' && !Number.isNaN(Date.parse(index.generatedAt)), String(index.generatedAt));
check('index.cacheControl', /max-age/.test(indexRes.headers.get('cache-control') || ''), String(indexRes.headers.get('cache-control')));
check('index.gzip', (indexRes.headers.get('content-encoding') || '') === 'gzip', String(indexRes.headers.get('content-encoding')));

const sample = index.items.find(item => item.key === 'hsr/characters/1415') || index.items[0];
check('item.shape', ['key', 'id', 'category', 'name', 'rawName', 'image', 'fields', 'issues', 'sourceCheck', 'detailFile'].every(key => key in sample), Object.keys(sample).join(','));
check('item.detailFile', typeof sample.detailFile === 'string' && sample.detailFile.startsWith('/api/catalog/entry?key='), String(sample.detailFile));
const withImage = index.items.filter(item => item.image);
check('item.image.null-tolerant', withImage.length > 0 && index.items.length - withImage.length === 157, 'with=' + withImage.length + ' null=' + (index.items.length - withImage.length));

const detailRes = await fetch(base + sample.detailFile);
const detail = await detailRes.json();
check('detail.status', detailRes.status === 200, String(detailRes.status));
check('detail.sections', Array.isArray(detail.sections) && detail.sections.length > 0, 'sections=' + detail.sections?.length);
check('detail.sectionIds', detail.sections?.[0]?.id === 'section-0', String(detail.sections?.[0]?.id));
check('detail.body', typeof detail.body === 'string' && detail.body.length > 0, 'bodyLen=' + detail.body?.length);
check('detail.noGridfight', !/<gridfightinfo/i.test(detail.body || ''), 'residual markup');
check('detail.keys', ['sections', 'body'].every(key => key in detail), Object.keys(detail).join(','));

if (withImage[0]) {
  const imageRes = await fetch(base + withImage[0].image);
  const imageBytes = await imageRes.arrayBuffer();
  check('image.status', imageRes.status === 200, String(imageRes.status));
  check('image.type', /^image\//.test(imageRes.headers.get('content-type') || ''), String(imageRes.headers.get('content-type')));
  check('image.bytes', imageBytes.byteLength > 100, String(imageBytes.byteLength));
  check('image.cache', /immutable/.test(imageRes.headers.get('cache-control') || ''), String(imageRes.headers.get('cache-control')));
}

const badDetailRes = await fetch(base + '/api/catalog/entry?key=does/not/exist');
check('detail.404', badDetailRes.status === 404, String(badDetailRes.status));
const badImageRes = await fetch(base + '/api/catalog/images/zzz');
check('image.404', badImageRes.status === 404, String(badImageRes.status));

out.indexMs = indexMs;
out.indexBytes = indexBytes;
out.pass = out.failures.length === 0;
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
