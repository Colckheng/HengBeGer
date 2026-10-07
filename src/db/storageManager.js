import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import initialData from '../initialdata.js';
import { logger } from '../utils/logger.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const STORAGE_TYPES = [
  'agents',
  'soundEngines',
  'bumbos',
  'driveDisks',
  'hsrCharacters',
  'hsrCones',
  'hsrRelics',
];

const STORAGE_VERSION = '2.0.0';

class StorageManager {
  constructor() {
    this.storagePath = path.join(MODULE_DIR, 'storage');
    this.backupPath = path.join(this.storagePath, 'backup');
    this.ensureDirectories();
  }

  ensureDirectories() {
    for (const directory of [this.storagePath, this.backupPath]) {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
    }
  }

  getStorageFilePath(type) {
    return path.join(this.storagePath, `${type}.json`);
  }

  getBackupFilePath(type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.backupPath, `${type}_${timestamp}.json`);
  }

  buildStoragePayload(type, data = []) {
    return {
      version: STORAGE_VERSION,
      lastUpdated: new Date().toISOString(),
      dataType: type,
      count: data.length,
      source: 'database',
      data,
    };
  }

  async backupIfExists(type) {
    const filePath = this.getStorageFilePath(type);
    if (!fs.existsSync(filePath)) {
      return;
    }

    const backupPath = this.getBackupFilePath(type);
    await fs.promises.copyFile(filePath, backupPath);
    logger.info('Storage backup created', {
      type,
      file: path.basename(backupPath),
    });
  }

  async writeJsonAtomic(filePath, payload) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
    try {
      await fs.promises.rename(tmpPath, filePath);
    } catch (renameError) {
      await fs.promises.unlink(tmpPath).catch(() => undefined);
      throw renameError;
    }
  }

  async initializeStorage({ force = false, seedData = initialData } = {}) {
    for (const type of STORAGE_TYPES) {
      const filePath = this.getStorageFilePath(type);
      if (!force && fs.existsSync(filePath)) {
        continue;
      }

      const data = Array.isArray(seedData[type]) ? seedData[type] : [];
      await this.writeJsonAtomic(filePath, this.buildStoragePayload(type, data));
    }

    logger.info('Root storage initialized', { force });
    return true;
  }

  async readRawFromStorage(type) {
    const filePath = this.getStorageFilePath(type);
    if (!fs.existsSync(filePath)) {
      return this.buildStoragePayload(type, []);
    }

    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }

  async readFromStorage(type) {
    const payload = await this.readRawFromStorage(type);
    return Array.isArray(payload.data) ? payload.data : [];
  }

  async saveToStorage(type, data) {
    if (!STORAGE_TYPES.includes(type)) {
      throw new Error(`Unsupported storage type: ${type}`);
    }

    const normalizedData = Array.isArray(data) ? data : [];
    await this.backupIfExists(type);
    await this.writeJsonAtomic(
      this.getStorageFilePath(type),
      this.buildStoragePayload(type, normalizedData),
    );

    logger.info('Root storage updated', { type, count: normalizedData.length });
    return true;
  }

  async saveAllData(dataMap) {
    const result = {};

    for (const type of STORAGE_TYPES) {
      if (!Object.prototype.hasOwnProperty.call(dataMap, type)) {
        continue;
      }

      await this.saveToStorage(type, dataMap[type]);
      result[type] = Array.isArray(dataMap[type]) ? dataMap[type].length : 0;
    }

    return result;
  }

  async getAllStorageData() {
    const result = {};

    for (const type of STORAGE_TYPES) {
      result[type] = await this.readFromStorage(type);
    }

    return result;
  }

  async getStorageStatus() {
    const status = {
      initialized: true,
      lastCheck: new Date().toISOString(),
      files: {},
    };

    for (const type of STORAGE_TYPES) {
      const filePath = this.getStorageFilePath(type);
      if (!fs.existsSync(filePath)) {
        status.files[type] = { exists: false, count: 0 };
        status.initialized = false;
        continue;
      }

      const stats = await fs.promises.stat(filePath);
      const payload = await this.readRawFromStorage(type);
      status.files[type] = {
        exists: true,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        version: payload.version,
        count: payload.count || 0,
        lastUpdated: payload.lastUpdated || null,
      };
    }

    return status;
  }

  async resetStorage(seedData = initialData) {
    await this.initializeStorage({ force: true, seedData });
    return true;
  }
}

const storageManager = new StorageManager();

export default storageManager;
export { StorageManager };
