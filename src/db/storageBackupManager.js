import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from '../utils/logger.js';
import { STORAGE_TYPES } from './storageManager.js';

const STORAGE_VERSION = '2.0.0';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const ensureArrayPayload = (payload, label) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label} payload must be an object.`);
  }

  if (!Array.isArray(payload.data)) {
    throw new Error(`${label} payload data must be an array.`);
  }
};

const BACKUP_FILE_PATTERN = /^(?<prefix>.+)_(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/;

class StorageBackupManager {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(MODULE_DIR, 'storage');
    this.backupPath = path.join(this.storagePath, 'backup');
    this.webStoragePath = path.join(this.storagePath, 'web');
    this.ensureDirectories();
  }

  ensureDirectories() {
    for (const directory of [this.storagePath, this.backupPath, this.webStoragePath]) {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
    }
  }

  validateType(type) {
    if (!STORAGE_TYPES.includes(type)) {
      throw new Error(`Unsupported storage type: ${type}`);
    }
  }

  resolveFilePath(filePath) {
    return path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
  }

  getRootStorageFilePath(type) {
    this.validateType(type);
    return path.join(this.storagePath, `${type}.json`);
  }

  getWebStorageFilePath(type) {
    this.validateType(type);
    return path.join(this.webStoragePath, `${type}.json`);
  }

  getPreRestoreBackupPath(type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.backupPath, `restore_before_${type}_${timestamp}.json`);
  }

  parseBackupFileName(fileName) {
    const match = fileName.match(BACKUP_FILE_PATTERN);
    if (!match?.groups) {
      return null;
    }

    return {
      fileName,
      prefix: match.groups.prefix,
      timestamp: match.groups.timestamp,
    };
  }

  async readJson(filePath, label) {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`${label} is not valid JSON: ${error.message}`);
    }
  }

  buildWebPayload(type, data, sourcePayload) {
    return {
      version: sourcePayload.version || STORAGE_VERSION,
      lastUpdated: new Date().toISOString(),
      dataType: type,
      count: data.length,
      source: 'web',
      data,
      lastSyncFromRoot: new Date().toISOString(),
    };
  }

  async backupCurrentRoot(type) {
    const rootFilePath = this.getRootStorageFilePath(type);
    if (!fs.existsSync(rootFilePath)) {
      return null;
    }

    const backupFilePath = this.getPreRestoreBackupPath(type);
    await fs.promises.copyFile(rootFilePath, backupFilePath);
    return backupFilePath;
  }

  validateRootBackupPayload(payload, type, backupFilePath) {
    ensureArrayPayload(payload, `Backup file ${backupFilePath}`);

    if (payload.dataType !== type) {
      throw new Error(
        `Backup file dataType mismatch: expected ${type}, received ${payload.dataType || 'unknown'}.`,
      );
    }

    if (payload.source !== 'database') {
      throw new Error(
        `Only root storage backups can be restored. Received source "${payload.source || 'unknown'}".`,
      );
    }
  }

  async listBackupEntries({ prefix } = {}) {
    if (!fs.existsSync(this.backupPath)) {
      return [];
    }

    const files = await fs.promises.readdir(this.backupPath, { withFileTypes: true });
    const entries = [];

    for (const file of files) {
      if (!file.isFile()) {
        continue;
      }

      const parsed = this.parseBackupFileName(file.name);
      if (!parsed) {
        continue;
      }

      if (prefix && parsed.prefix !== prefix) {
        continue;
      }

      entries.push({
        ...parsed,
        absolutePath: path.join(this.backupPath, file.name),
      });
    }

    return entries;
  }

  async planBackupCleanup({ keep = 10, prefix } = {}) {
    const normalizedKeep = Number(keep);
    if (!Number.isInteger(normalizedKeep) || normalizedKeep < 0) {
      throw new Error('keep must be a non-negative integer.');
    }

    const entries = await this.listBackupEntries({ prefix });
    const groups = new Map();

    for (const entry of entries) {
      if (!groups.has(entry.prefix)) {
        groups.set(entry.prefix, []);
      }
      groups.get(entry.prefix).push(entry);
    }

    const summary = [];
    const deleteCandidates = [];

    for (const [groupPrefix, groupEntries] of groups.entries()) {
      const sortedEntries = [...groupEntries].sort((left, right) => (
        right.timestamp.localeCompare(left.timestamp)
      ));
      const keptEntries = sortedEntries.slice(0, normalizedKeep);
      const removedEntries = sortedEntries.slice(normalizedKeep);

      summary.push({
        prefix: groupPrefix,
        total: sortedEntries.length,
        keep: normalizedKeep,
        keptFiles: keptEntries.map((entry) => entry.fileName),
        deleteFiles: removedEntries.map((entry) => entry.fileName),
      });

      deleteCandidates.push(...removedEntries);
    }

    summary.sort((left, right) => left.prefix.localeCompare(right.prefix));

    return {
      backupDirectory: this.backupPath,
      scannedFiles: entries.length,
      keep: normalizedKeep,
      prefix: prefix || null,
      groups: summary,
      deleteCandidates,
    };
  }

  async cleanupBackups({ keep = 10, prefix, dryRun = false } = {}) {
    const plan = await this.planBackupCleanup({ keep, prefix });

    if (!dryRun) {
      for (const entry of plan.deleteCandidates) {
        await fs.promises.unlink(entry.absolutePath);
      }
    }

    logger.info('Storage backup cleanup completed', {
      keep: plan.keep,
      prefix: plan.prefix,
      dryRun,
      scannedFiles: plan.scannedFiles,
      deletedFiles: plan.deleteCandidates.length,
    });

    return {
      ...plan,
      dryRun,
      deletedFiles: dryRun ? [] : plan.deleteCandidates.map((entry) => entry.fileName),
    };
  }

  async restoreRootFromBackup({ type, backupFilePath, syncWeb = true }) {
    this.validateType(type);

    if (!backupFilePath) {
      throw new Error('backupFilePath is required.');
    }

    const resolvedBackupPath = this.resolveFilePath(backupFilePath);
    if (!fs.existsSync(resolvedBackupPath)) {
      throw new Error(`Backup file not found: ${resolvedBackupPath}`);
    }

    const payload = await this.readJson(resolvedBackupPath, `Backup file ${resolvedBackupPath}`);
    this.validateRootBackupPayload(payload, type, resolvedBackupPath);

    const preRestoreBackupPath = await this.backupCurrentRoot(type);
    const rootFilePath = this.getRootStorageFilePath(type);
    await fs.promises.copyFile(resolvedBackupPath, rootFilePath);

    let webFilePath = null;
    if (syncWeb) {
      webFilePath = this.getWebStorageFilePath(type);
      const webPayload = this.buildWebPayload(type, payload.data, payload);
      await fs.promises.writeFile(webFilePath, JSON.stringify(webPayload, null, 2), 'utf-8');
    }

    logger.warn('Root storage restored from backup', {
      type,
      backupFile: path.basename(resolvedBackupPath),
      restoredCount: payload.data.length,
      syncWeb,
      preRestoreBackupFile: preRestoreBackupPath ? path.basename(preRestoreBackupPath) : null,
    });

    return {
      type,
      restoredCount: payload.data.length,
      backupFilePath: resolvedBackupPath,
      rootFilePath,
      preRestoreBackupPath,
      webFilePath,
      syncWeb,
    };
  }
}

const storageBackupManager = new StorageBackupManager();

export default storageBackupManager;
export { StorageBackupManager };
