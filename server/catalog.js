import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildEntry,
  buildIndex,
  CATEGORIES,
  createEntryLookup,
  IMAGE_MODE,
  parsePayload,
  sha256Hex,
} from './openIndex.js';

// /index is assembled from ~18 MB of JSON payloads; keep the result for 60s
// in-process so a burst of visitors cannot re-run the whole assembly.
const INDEX_TTL_MS = 60 * 1000;
const indexCache = { at: 0, body: null };

// file 模式下图片由 Nginx 从磁盘直出（/img/ -> 这个目录），所以「这张图有没有」的真相
// 也在磁盘上：只信 catalog_assets 会漏掉「表里说有、文件其实没传上去」的情况。
// 目录清单缓存 60s，与 /index 同一节奏；导入完最多等一分钟生效。
export const IMAGES_ROOT = process.env.IMAGES_ROOT || '/srv/images';
const THUMB_DIR = 't';
const THUMB_SUFFIX = '.webp';
const assetCache = { at: 0, set: null };

/**
 * 扫一档缩略图目录，文件名去掉 .webp 就是 hash。
 * 目录不存在（图片还没导入）返回空集合，不抛错；其它错误照抛。
 */
export async function scanThumbHashes(root = IMAGES_ROOT) {
  const set = new Set();
  try {
    for (const name of await fs.readdir(path.join(root, THUMB_DIR))) {
      if (name.endsWith(THUMB_SUFFIX)) set.add(name.slice(0, -THUMB_SUFFIX.length));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return set;
}

export function createCatalogRouter({ query }) {
  const router = express.Router();
  const handle = fn => async (req,res,next) => {
    try { await fn(req,res); } catch(e) {
      if (e.code === 'ER_NO_SUCH_TABLE' || e.original?.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ error: '资料库尚未导入，请完成数据同步。' });
      next(e);
    }
  };
  const loadAssetHashes = async () => {
    const [rows] = await query('SELECT hash FROM catalog_assets', []);
    return new Set(rows.map(r => r.hash));
  };
  // file 模式：t 档存在即认为图片可用（列表和详情都依赖它），目录清单缓存 60s。
  const loadFileAssetHashes = async () => {
    if (assetCache.set && Date.now() - assetCache.at < INDEX_TTL_MS) return assetCache.set;
    const set = await scanThumbHashes();
    assetCache.at = Date.now();
    assetCache.set = set;
    return set;
  };
  const resolveAssetHashes = () => (IMAGE_MODE === 'file' ? loadFileAssetHashes() : loadAssetHashes());
  const loadEntries = async () => {
    const [rows] = await query('SELECT entry_key AS `key`, category, name, payload FROM catalog_entries', []);
    return rows.map(row => ({ ...row, payload: parsePayload(row.payload) }));
  };
  router.get('/categories', handle(async (_req,res) => {
    const [rows] = await query('SELECT category, COUNT(*) AS count FROM catalog_entries GROUP BY category', []);
    res.json(Object.entries(CATEGORIES).map(([id,name]) => ({id,name,count:Number(rows.find(r=>r.category===id)?.count || 0)})));
  }));
  router.get('/entries', handle(async (req,res) => {
    const category = req.query.category, q = req.query.q || '';
    const page = Number(req.query.page || 1), limit = Number(req.query.limit || 24);
    if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES,category) || typeof q !== 'string' || q.length > 100 || !Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({error:'无效的分类或分页参数'});
    const where = 'category = ? AND LOCATE(?,name) > 0';
    const [[total]] = await query(`SELECT COUNT(*) AS count FROM catalog_entries WHERE ${where}`, [category,q]);
    const [rows] = await query(`SELECT entry_key AS \`key\`, name, JSON_UNQUOTE(JSON_EXTRACT(payload,'$.imageHash')) AS imageHash, JSON_EXTRACT(payload,'$.issues') AS issues FROM catalog_entries WHERE ${where} ORDER BY entry_key LIMIT ? OFFSET ?`, [category,q,limit,(page-1)*limit]);
    res.json({ total:Number(total.count),page,limit,items:rows.map(r=>({...r,imageHash:r.imageHash==='null'?null:r.imageHash,issues:typeof r.issues==='string'?JSON.parse(r.issues):r.issues})) });
  }));
  // Open index detail: the frozen contract shape (item + sections + body).
  router.get('/entry', handle(async (req,res) => {
    if (typeof req.query.key !== 'string' || req.query.key.length > 191) return res.status(400).json({error:'无效的条目'});
    const [[row]] = await query('SELECT entry_key AS `key`, category, name, payload FROM catalog_entries WHERE entry_key = ?', [req.query.key]);
    if (!row) return res.status(404).json({error:'未找到条目'});
    const [entries, assetHashes] = await Promise.all([loadEntries(), resolveAssetHashes()]);
    res.set('Cache-Control','private, max-age=30').json(buildEntry({ ...row, payload: parsePayload(row.payload) }, assetHashes, createEntryLookup(entries)));
  }));
  // Legacy raw-payload access, kept under its own path.
  router.get('/entry/raw', handle(async (req,res) => {
    if (typeof req.query.key !== 'string' || req.query.key.length > 191) return res.status(400).json({error:'无效的条目'});
    const [[row]] = await query('SELECT payload FROM catalog_entries WHERE entry_key = ?', [req.query.key]);
    if (!row) return res.status(404).json({error:'未找到条目'});
    res.json(typeof row.payload==='string'?JSON.parse(row.payload):row.payload);
  }));
  router.get('/index', handle(async (_req,res) => {
    if (!indexCache.body || Date.now() - indexCache.at > INDEX_TTL_MS) {
      const [rows, assetHashes] = await Promise.all([loadEntries(), resolveAssetHashes()]);
      indexCache.body = buildIndex(rows, assetHashes);
      indexCache.at = Date.now();
    }
    res.set('Cache-Control','private, max-age=30').json(indexCache.body);
  }));
  router.get('/images/:hash', handle(async (req,res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.hash)) return res.status(404).end();
    const [[row]] = await query('SELECT image FROM catalog_assets WHERE hash = ?', [req.params.hash]);
    if (!row) return res.status(404).end();
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(row.image);
    if (!m) throw new Error('Invalid stored catalog image');
    const bytes = Buffer.from(m[2],'base64');
    if (sha256Hex(bytes)!==req.params.hash) throw new Error('Stored catalog image failed integrity check');
    res.set('Cache-Control','public, max-age=31536000, immutable').type(m[1]).send(bytes);
  }));
  return router;
}
