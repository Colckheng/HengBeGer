import fs from 'fs';
import path from 'path';

import initialData from '../initialdata.js';
import { logger } from '../utils/logger.js';
import storageManager, { STORAGE_TYPES } from './storageManager.js';

const STORAGE_VERSION = '2.0.0';

class DualStorageManager {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'src', 'db', 'storage');
    this.webStoragePath = path.join(this.storagePath, 'web');
    this.adminStoragePath = path.join(this.storagePath, 'admin');
    this.backupPath = path.join(this.storagePath, 'backup');
    this.ensureDirectories();
  }

  ensureDirectories() {
    for (const directory of [
      this.storagePath,
      this.webStoragePath,
      this.adminStoragePath,
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

  getAdminStorageFilePath(type) {
    this.validateType(type);
    return path.join(this.adminStoragePath, `${type}.json`);
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

  async readPayload(filePath, type, source) {
    if (!fs.existsSync(filePath)) {
      return this.buildPayload(type, [], source);
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

  async initializeAdminSession({ forceRefresh = false } = {}) {
    for (const type of STORAGE_TYPES) {
      const adminFilePath = this.getAdminStorageFilePath(type);
      if (!forceRefresh && fs.existsSync(adminFilePath)) {
        continue;
      }

      const webPayload = await this.readPayload(this.getWebStorageFilePath(type), type, 'web');
      await this.writePayload(adminFilePath, type, webPayload.data || [], 'admin', {
        extra: {
          sessionStarted: new Date().toISOString(),
        },
      });
    }

    logger.info('Admin storage session initialized', { forceRefresh });
    return true;
  }

  async readFromWebStorage(type) {
    this.validateType(type);
    const payload = await this.readPayload(this.getWebStorageFilePath(type), type, 'web');
    return Array.isArray(payload.data) ? payload.data : [];
  }

  async readFromAdminStorage(type) {
    this.validateType(type);
    const payload = await this.readPayload(this.getAdminStorageFilePath(type), type, 'admin');
    return Array.isArray(payload.data) ? payload.data : [];
  }

  async saveToAdminStorage(type, data) {
    this.validateType(type);
    await this.backupIfExists(this.getAdminStorageFilePath(type), type, 'admin');
    await this.writePayload(
      this.getAdminStorageFilePath(type),
      type,
      Array.isArray(data) ? data : [],
      'admin',
      {
        extra: {
          sessionStarted: new Date().toISOString(),
        },
      },
    );
    return true;
  }

  async saveAllToAdminStorage(dataMap, options = {}) {
    const sessionStarted = options.sessionStarted || new Date().toISOString();

    for (const type of STORAGE_TYPES) {
      if (!Object.prototype.hasOwnProperty.call(dataMap, type)) {
        continue;
      }

      await this.backupIfExists(this.getAdminStorageFilePath(type), type, 'admin');
      await this.writePayload(
        this.getAdminStorageFilePath(type),
        type,
        Array.isArray(dataMap[type]) ? dataMap[type] : [],
        'admin',
        {
          extra: {
            sessionStarted,
          },
        },
      );
    }

    return true;
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

  async syncAdminToWeb() {
    throw new Error(
      'Legacy admin-to-web sync was removed. Publish staged changes through the database API instead.',
    );
  }

  async getAllAdminData() {
    const result = {};
    for (const type of STORAGE_TYPES) {
      result[type] = await this.readFromAdminStorage(type);
    }
    return result;
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
      admin: {},
    };

    for (const type of STORAGE_TYPES) {
      const webFilePath = this.getWebStorageFilePath(type);
      const adminFilePath = this.getAdminStorageFilePath(type);

      if (fs.existsSync(webFilePath)) {
        const webStats = await fs.promises.stat(webFilePath);
        const webPayload = await this.readPayload(webFilePath, type, 'web');
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

      if (fs.existsSync(adminFilePath)) {
        const adminStats = await fs.promises.stat(adminFilePath);
        const adminPayload = await this.readPayload(adminFilePath, type, 'admin');
        status.admin[type] = {
          exists: true,
          size: adminStats.size,
          lastModified: adminStats.mtime.toISOString(),
          version: adminPayload.version,
          count: adminPayload.count || 0,
          lastUpdated: adminPayload.lastUpdated || null,
          sessionStarted: adminPayload.sessionStarted || null,
        };
      } else {
        status.admin[type] = { exists: false, count: 0 };
      }
    }

    return status;
  }

  async cleanupAdminSession() {
    for (const type of STORAGE_TYPES) {
      const adminFilePath = this.getAdminStorageFilePath(type);
      if (!fs.existsSync(adminFilePath)) {
        continue;
      }

      await this.backupIfExists(adminFilePath, type, 'admin_cleanup');
      await fs.promises.unlink(adminFilePath);
    }

    logger.info('Admin storage session cleaned up');
    return true;
  }
}

const dualStorageManager = new DualStorageManager();

export default dualStorageManager;
export { DualStorageManager };
