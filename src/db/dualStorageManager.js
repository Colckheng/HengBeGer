import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import initialData from '../initialdata.js';
import { logger } from '../utils/logger.js';
import storageManager, { STORAGE_TYPES } from './storageManager.js';

const STORAGE_VERSION = '2.0.0';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

class DualStorageManager {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(MODULE_DIR, 'storage');
    this.webStoragePath = path.join(this.storagePath, 'web');
    this.backupPath = path.join(this.storagePath, 'backup');
    this.ensureDirectories();
  }

  ensureDirectories() {
    for (const directory of [
      this.storagePath,
      this.webStoragePath,
      this.backupPath,
    ]) {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
    }
  }

  validateType(type) {
    if (!STORAGE_TYPES.includes(type)) {
      throw new Error(`Unsupported dual storage type: ${type}`);
    }
  }

  getWebStorageFilePath(type) {
    this.validateType(type);
    return path.join(this.webStoragePath, `${type}.json`);
  }

  getBackupFilePath(type, source) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.backupPath, `${source}_${type}_${timestamp}.json`);
  }

  buildPayload(type, data, source, extra = {}) {
    return {
      version: STORAGE_VERSION,
      lastUpdated: new Date().toISOString(),
      dataType: type,
      count: data.length,
      source,
      data,
      ...extra,
    };
  }

  async readPayload(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }

  async writePayload(filePath, type, data, source, options = {}) {
    const payload = this.buildPayload(type, data, source, options.extra);
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return payload;
  }

  async backupIfExists(filePath, type, source) {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const backupPath = this.getBackupFilePath(type, source);
    await fs.promises.copyFile(filePath, backupPath);
    logger.info('Dual storage backup created', {
      type,
      source,
      file: path.basename(backupPath),
    });
  }

  async initializeDualStorage() {
    for (const type of STORAGE_TYPES) {
      const webFilePath = this.getWebStorageFilePath(type);
      if (fs.existsSync(webFilePath)) {
        continue;
      }

      const rootPayload = await storageManager.readRawFromStorage(type);
      const data = Array.isArray(rootPayload.data)
        ? rootPayload.data
        : Array.isArray(initialData[type])
          ? initialData[type]
          : [];

      await this.writePayload(webFilePath, type, data, 'web');
    }

    logger.info('Web storage initialized');
    return true;
  }

  async readFromWebStorage(type) {
    this.validateType(type);
    const payload = await this.readPayload(this.getWebStorageFilePath(type));
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  async syncRootToWeb(dataMap) {
    const results = {};

    for (const type of STORAGE_TYPES) {
      if (!Object.prototype.hasOwnProperty.call(dataMap, type)) {
        continue;
      }

      const normalizedData = Array.isArray(dataMap[type]) ? dataMap[type] : [];
      await this.backupIfExists(this.getWebStorageFilePath(type), type, 'web');
      const payload = await this.writePayload(
        this.getWebStorageFilePath(type),
        type,
        normalizedData,
        'web',
        {
          extra: {
            lastSyncFromRoot: new Date().toISOString(),
          },
        },
      );

      results[type] = {
        success: true,
        count: payload.count,
        lastUpdated: payload.lastUpdated,
      };
    }

    return results;
  }

  async getAllWebData() {
    const result = {};
    for (const type of STORAGE_TYPES) {
      result[type] = await this.readFromWebStorage(type);
    }
    return result;
  }

  async getDualStorageStatus() {
    const status = {
      initialized: true,
      lastCheck: new Date().toISOString(),
      web: {},
    };

    for (const type of STORAGE_TYPES) {
      const webFilePath = this.getWebStorageFilePath(type);

      if (fs.existsSync(webFilePath)) {
        const webStats = await fs.promises.stat(webFilePath);
        const webPayload = await this.readPayload(webFilePath);
        status.web[type] = {
          exists: true,
          size: webStats.size,
          lastModified: webStats.mtime.toISOString(),
          version: webPayload.version,
          count: webPayload.count || 0,
          lastUpdated: webPayload.lastUpdated || null,
        };
      } else {
        status.web[type] = { exists: false, count: 0 };
        status.initialized = false;
      }
    }

    return status;
  }
}

const dualStorageManager = new DualStorageManager();

export default dualStorageManager;
export { DualStorageManager };
