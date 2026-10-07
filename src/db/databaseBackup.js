import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import { AppError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { baseDbConfig } from './config.js';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'db-backups');
const KEEP_BACKUPS = 30;

const DUMP_CANDIDATES = [
  process.env.MYSQLDUMP_PATH,
  'mysqldump',
  'C:\\Program Files\\MySQL\\MySQL Server 9.0\\bin\\mysqldump.exe',
  'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
  'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe',
  'C:\\xampp\\mysql\\bin\\mysqldump.exe',
  '/usr/bin/mysqldump',
  '/usr/local/bin/mysqldump',
].filter(Boolean);

const isExplicitPath = (candidate) => (
  candidate.includes('/') || candidate.includes('\\') || candidate.endsWith('.exe')
);

async function locateMysqldump() {
  for (const candidate of DUMP_CANDIDATES) {
    if (isExplicitPath(candidate)) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    try {
      await execFileAsync(candidate, ['--version'], { windowsHide: true });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new AppError(
    'mysqldump was not found. Set MYSQLDUMP_PATH to the mysqldump binary '
    + '(required before any database sync can run).',
    503,
  );
}

async function pruneOldBackups() {
  const entries = await fs.promises.readdir(BACKUP_DIR);
  const backups = entries
    .filter((name) => /^hengbeger-.*\.sql$/.test(name))
    .sort();

  const excess = backups.length - KEEP_BACKUPS;
  for (const name of backups.slice(0, Math.max(excess, 0))) {
    await fs.promises.unlink(path.join(BACKUP_DIR, name));
  }
}

export async function createDatabaseBackup({ reason = 'manual' } = {}) {
  const password = process.env.DB_PASSWORD;
  if (!password) {
    throw new AppError('DB_PASSWORD is required to create a database backup.', 503);
  }

  const binary = await locateMysqldump();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `hengbeger-${timestamp}.sql`;
  const filePath = path.join(BACKUP_DIR, fileName);

  const args = [
    `--host=${baseDbConfig.host}`,
    `--port=${baseDbConfig.port}`,
    `--user=${baseDbConfig.username}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--no-tablespaces',
    baseDbConfig.database,
  ];

  let stdout;
  try {
    ({ stdout } = await execFileAsync(binary, args, {
      env: { ...process.env, MYSQL_PWD: password },
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
    }));
  } catch (error) {
    const detail = (error.stderr || error.message || '').toString().trim();
    logger.error('Database backup failed', { reason, detail });
    throw new AppError(
      `Database backup failed (${detail || 'unknown error'}). Operation aborted. `
      + 'Set MYSQLDUMP_PATH if mysqldump is not on PATH.',
      503,
    );
  }

  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  await fs.promises.writeFile(filePath, stdout, 'utf-8');
  await pruneOldBackups();

  const sizeBytes = Buffer.byteLength(stdout, 'utf-8');
  logger.info('Database backup created', { reason, fileName, sizeBytes });

  return { fileName, filePath, sizeBytes };
}
