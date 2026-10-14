import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { compileCatalog, hash, databaseHash, planChanges } from './data.js';
import { connectCatalog, ensureCatalog, readRows, targetIdentity, putRow } from './database.js';
import { loadReport, assertSyncAllowed, markConfirmed } from '../crawler/report.js';
import { imageExtension } from '../crawler/image-batch.js';

function review(root, id, catalog, apply) {
  const report = loadReport(root, id);
  if (!report || report.treeHash !== catalog.treeHash) throw new Error('Report missing or does not match current data/ state');
  if (report.blockers?.length) throw new Error(`Report contains blocking anomalies: ${report.blockers.join('; ')}`);
  if (!report.confirmed && apply) assertSyncAllowed(root, id, catalog.treeHash);
  // Informational notes are recorded by the crawler for humans; they must not gate a sync.
  return report;
}
const save = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); };
export function confirmReviewedReport(root, id) {
  review(root, id, compileCatalog(root), false);
  return markConfirmed(root, id);
}
export async function previewImport(root, { report: id, offline = false, output }, supplied) {
  const catalog = compileCatalog(root);
  review(root, id, catalog, false);
  const connection = offline ? null : supplied || await connectCatalog();
  try {
    const current = connection ? await readRows(connection) : [];
    const plan = { format: 1, report: id, treeHash: catalog.treeHash,
      target: connection ? await targetIdentity(connection) : null,
      beforeHash: connection ? databaseHash(current) : null,
      changes: planChanges(catalog.entries, current), total: catalog.entries.length,
      images: catalog.images.size, skipped: catalog.skipped, offline };
    if (output) save(path.resolve(root, output), plan);
    return plan;
  } finally { if (connection && !supplied) await connection.end(); }
}

async function locked(connection, work) {
  const target = await targetIdentity(connection);
  const lock = `hbg-catalog-${hash(target).slice(0,40)}`;
  const [[row]] = await connection.execute('SELECT GET_LOCK(?, 0) AS acquired', [lock]);
  if (row.acquired !== 1) throw new Error('Another catalog import is running');
  try { return await work(target); } finally { await connection.execute('SELECT RELEASE_LOCK(?)', [lock]); }
}

export async function applyImport(root, { report: id, plan: planFile }, supplied) {
  if (!planFile) throw new Error('--apply requires --plan from a connected preview');
  const plan = JSON.parse(fs.readFileSync(path.resolve(root, planFile), 'utf8'));
  const catalog = compileCatalog(root);
  review(root, id, catalog, true);
  if (plan.format !== 1 || plan.offline || plan.report !== id || plan.treeHash !== catalog.treeHash || !plan.target) throw new Error('Plan does not match reviewed data');
  const connection = supplied || await connectCatalog();
  try { return await locked(connection, async target => {
    if (hash(target) !== hash(plan.target)) throw new Error('Plan targets a different database');
    await ensureCatalog(connection);
    await connection.beginTransaction();
    let backupFile;
    try {
      const before = await readRows(connection, true);
      if (databaseHash(before) !== plan.beforeHash) throw new Error('Database changed after preview; generate a new plan');
      const changes = planChanges(catalog.entries, before);
      if (changes.conflicts.length) throw new Error(`Database edits conflict: ${changes.conflicts.join(', ')}`);
      if (hash(changes) !== hash(plan.changes)) throw new Error('Plan changes differ from current preview');
      const changed = new Set([...changes.added, ...changes.updated]);
      // Assets are immutable, content-addressed and written inside the same transaction.
      const [known] = await connection.query('SELECT hash FROM catalog_assets');
      const hashes = new Set(known.map(r => r.hash));
      const missingAssets = [...catalog.images.keys()].filter(h => !hashes.has(h));
      if (!changed.size && !missingAssets.length) { await connection.rollback(); return { changes, applied: 0, backup: null }; }
      const final = new Map(before.map(r => [r.key,r]));
      for (const row of catalog.entries) final.set(row.key,row);
      backupFile = path.join(root, 'db-backups', `catalog-${Date.now()}-${crypto.randomUUID()}.json`);
      const backup = { format: 1, target, report: id, before, afterHash: databaseHash([...final.values()]) };
      save(backupFile, { ...backup, checksum: hash(backup) });
      for (const h of missingAssets) {
        const bytes = fs.readFileSync(catalog.images.get(h).file);
        if (hash(bytes) !== h) throw new Error('Image changed during import');
        const ext = imageExtension(bytes).slice(1);
        await connection.execute('INSERT INTO catalog_assets(hash,image) VALUES(?,?)', [h, `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${bytes.toString('base64')}`]);
      }
      for (const row of catalog.entries) if (changed.has(row.key)) await putRow(connection,row);
      const finalCatalog = compileCatalog(root);
      review(root, id, finalCatalog, true);
      if (finalCatalog.treeHash !== catalog.treeHash) throw new Error('Data changed during import');
      const after = await readRows(connection, true);
      if (databaseHash(after) !== backup.afterHash) throw new Error('Post-import verification failed');
      await connection.commit();
      return { changes, applied: changed.size, imagesAdded: missingAssets.length, backup: backupFile };
    } catch (e) { await connection.rollback(); throw e; }
  }); } finally { if (!supplied) await connection.end(); }
}

export async function rollbackImport(root, file, supplied) {
  const backup = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
  const { checksum, ...content } = backup;
  if (backup.format !== 1 || hash(content) !== checksum) throw new Error('Invalid backup checksum');
  const connection = supplied || await connectCatalog();
  try { return await locked(connection, async target => {
    if (hash(target) !== hash(backup.target)) throw new Error('Backup targets a different database');
    await connection.beginTransaction();
    try {
      const current = await readRows(connection, true);
      if (databaseHash(current) !== backup.afterHash) throw new Error('Database changed since import; rollback refused');
      await connection.query('DELETE FROM catalog_entries');
      for (const row of backup.before) await putRow(connection, row);
      if (databaseHash(await readRows(connection,true)) !== databaseHash(backup.before)) throw new Error('Rollback verification failed');
      await connection.commit();
      return { restored: backup.before.length, retainedAssets: true };
    } catch(e) { await connection.rollback(); throw e; }
  }); } finally { if (!supplied) await connection.end(); }
}
