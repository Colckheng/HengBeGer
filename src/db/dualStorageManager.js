// 双存储系统管理器 - 实现管理员端和网页端分离存储
import fs from 'fs';
import path from 'path';
import initialData from '../initialdata.js';
import { logger } from '../utils/logger.js';

/**
 * 双存储系统管理器类
 * 管理员端存储系统和网页端存储系统分离
 * 管理员进入时复制网页数据，修改时只影响管理员端，点击更新时同步到网页端
 */
class DualStorageManager {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'src', 'db', 'storage');
    this.webStoragePath = path.join(this.storagePath, 'web'); // 网页端存储
    this.adminStoragePath = path.join(this.storagePath, 'admin'); // 管理员端存储
    this.backupPath = path.join(this.storagePath, 'backup');
    this.ensureDirectories();
  }

  /**
   * 确保存储目录存在
   */
  ensureDirectories() {
    [this.storagePath, this.webStoragePath, this.adminStoragePath, this.backupPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 获取网页端存储文件路径
   */
  getWebStorageFilePath(type) {
    return path.join(this.webStoragePath, `${type}.json`);
  }

  /**
   * 获取管理员端存储文件路径
   */
  getAdminStorageFilePath(type) {
    return path.join(this.adminStoragePath, `${type}.json`);
  }

  /**
   * 获取备份文件路径
   */
  getBackupFilePath(type, source = 'web') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.backupPath, `${source}_${type}_${timestamp}.json`);
  }

  /**
   * 初始化双存储系统
   * 只在文件不存在时使用初始数据，否则保留用户现有数据
   */
  async initializeDualStorage() {
    try {
      logger.info('正在检查双存储系统状态...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks', 'hsrCharacters', 'hsrCones', 'hsrRelics'];
      let hasInitialized = false;
      
      // 检查并初始化网页端存储（仅在文件不存在时）
      for (const type of dataTypes) {
        const webFilePath = this.getWebStorageFilePath(type);
        
        if (!fs.existsSync(webFilePath)) {
          // 文件不存在，使用初始数据创建
          const data = initialData[type] || [];
          
          const storageData = {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            dataType: type,
            count: data.length,
            source: 'web',
            data: data
          };
          
          await fs.promises.writeFile(webFilePath, JSON.stringify(storageData, null, 2), 'utf-8');
          logger.info('网页端数据已初始化', { type, count: data.length });
          hasInitialized = true;
        } else {
          // 文件已存在，保留用户数据
          const existingContent = await fs.promises.readFile(webFilePath, 'utf-8');
          const existingData = JSON.parse(existingContent);
          logger.info('网页端数据已存在，保留用户数据', { type, count: existingData.count || 0 });
        }
      }
      
      if (hasInitialized) {
        logger.info('双存储系统初始化完成');
      } else {
        logger.info('双存储系统检查完成，用户数据已保留');
      }
      return true;
    } catch (error) {
      logger.error('双存储系统初始化失败', { message: error.message });
      return false;
    }
  }

  /**
   * 管理员进入时：检查并初始化管理员会话数据
   * 优先保留现有管理员数据，仅在不存在时从网页端复制
   */
  async initializeAdminSession() {
    try {
      logger.info('正在检查管理员会话状态...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks', 'hsrCharacters', 'hsrCones', 'hsrRelics'];
      let hasInitialized = false;
      
      for (const type of dataTypes) {
        const webFilePath = this.getWebStorageFilePath(type);
        const adminFilePath = this.getAdminStorageFilePath(type);
        
        if (fs.existsSync(adminFilePath)) {
          // 管理员端数据已存在，保留现有数据
          const adminContent = await fs.promises.readFile(adminFilePath, 'utf-8');
          const adminData = JSON.parse(adminContent);
          logger.info('管理员端数据已存在，保留现有数据', { type, count: adminData.count || 0 });
        } else if (fs.existsSync(webFilePath)) {
          // 管理员端数据不存在，从网页端复制
          const webContent = await fs.promises.readFile(webFilePath, 'utf-8');
          const webData = JSON.parse(webContent);
          
          // 复制到管理员端，标记为管理员数据
          const adminData = {
            ...webData,
            source: 'admin',
            sessionStarted: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          };
          
          await fs.promises.writeFile(adminFilePath, JSON.stringify(adminData, null, 2), 'utf-8');
          logger.info('管理员端数据已从网页端复制', { type, count: adminData.count || 0 });
          hasInitialized = true;
        } else {
          // 网页端和管理员端都不存在，使用初始数据
          logger.warn('网页端数据不存在，使用初始数据', { type });
          await this.saveToAdminStorage(type, initialData[type] || []);
          hasInitialized = true;
        }
      }
      
      if (hasInitialized) {
        logger.info('管理员会话初始化完成');
      } else {
        logger.info('管理员会话检查完成，现有数据已保留');
      }
      return true;
    } catch (error) {
      logger.error('管理员会话初始化失败', { message: error.message });
      return false;
    }
  }

  /**
   * 从网页端存储读取数据
   */
  async readFromWebStorage(type) {
    try {
      const filePath = this.getWebStorageFilePath(type);
      
      if (!fs.existsSync(filePath)) {
        logger.warn('网页端存储文件不存在，返回空数据', { type });
        return [];
      }
      
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const storageData = JSON.parse(fileContent);
      
      logger.info('读取网页端数据', { type, count: storageData.count || 0 });
      return storageData.data || [];
    } catch (error) {
      logger.error('读取网页端存储数据失败', { type, message: error.message });
      // 读取失败时返回空数组，避免意外覆盖用户数据
      return [];
    }
  }

  /**
   * 从管理员端存储读取数据
   */
  async readFromAdminStorage(type) {
    try {
      const filePath = this.getAdminStorageFilePath(type);
      
      if (!fs.existsSync(filePath)) {
        logger.warn('管理员端存储文件不存在，需要先初始化会话', { type });
        return [];
      }
      
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const storageData = JSON.parse(fileContent);
      
      return storageData.data || [];
    } catch (error) {
      logger.error('读取管理员端存储数据失败', { type, message: error.message });
      return [];
    }
  }

  /**
   * 保存数据到管理员端存储
   * 管理员的每个修改都直接修改管理员端存储
   */
  async saveToAdminStorage(type, data) {
    try {
      const filePath = this.getAdminStorageFilePath(type);
      
      // 创建备份
      if (fs.existsSync(filePath)) {
        const backupPath = this.getBackupFilePath(type, 'admin');
        await fs.promises.copyFile(filePath, backupPath);
        logger.info('已创建管理员端备份', { file: path.basename(backupPath) });
      }
      
      // 保存新数据
      const storageData = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        dataType: type,
        count: data.length,
        source: 'admin',
        data: data
      };
      
      await fs.promises.writeFile(filePath, JSON.stringify(storageData, null, 2), 'utf-8');
      logger.info('管理员端数据已更新', { type, count: data.length });
      
      return true;
    } catch (error) {
      console.error(`❌ 保存管理员端存储数据失败 (${type}):`, error);
      return false;
    }
  }

  /**
   * 同步管理员端数据到网页端
   * 点击更新数据时调用
   */
  async syncAdminToWeb() {
    try {
      logger.info('正在同步管理员端数据到网页端...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks', 'hsrCharacters', 'hsrCones', 'hsrRelics'];
      const syncResults = {};
      
      for (const type of dataTypes) {
        const adminFilePath = this.getAdminStorageFilePath(type);
        const webFilePath = this.getWebStorageFilePath(type);
        
        if (fs.existsSync(adminFilePath)) {
          // 备份网页端数据
          if (fs.existsSync(webFilePath)) {
            const backupPath = this.getBackupFilePath(type, 'web');
            await fs.promises.copyFile(webFilePath, backupPath);
            logger.info('已创建网页端备份', { file: path.basename(backupPath) });
          }
          
          // 读取管理员端数据
          const adminContent = await fs.promises.readFile(adminFilePath, 'utf-8');
          const adminData = JSON.parse(adminContent);
          
          // 转换为网页端格式
          const webData = {
            ...adminData,
            source: 'web',
            lastSyncFromAdmin: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          };
          
          // 保存到网页端
          await fs.promises.writeFile(webFilePath, JSON.stringify(webData, null, 2), 'utf-8');
          
          syncResults[type] = {
            success: true,
            count: adminData.count,
            lastUpdated: webData.lastUpdated
          };
          
          logger.info('数据已同步到网页端', { type, count: adminData.count });
        } else {
          syncResults[type] = {
            success: false,
            error: '管理员端数据不存在'
          };
          logger.warn('管理员端数据不存在，跳过同步', { type });
        }
      }
      
      logger.info('数据同步完成');
      return syncResults;
    } catch (error) {
      logger.error('同步数据到网页端失败', { message: error.message });
      return { error: error.message };
    }
  }

  /**
   * 获取管理员端所有数据
   */
  async getAllAdminData() {
    try {
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks', 'hsrCharacters', 'hsrCones', 'hsrRelics'];
      const result = {};
      
      for (const type of dataTypes) {
        result[type] = await this.readFromAdminStorage(type);
      }
      
      return result;
    } catch (error) {
      console.error('❌ 获取管理员端所有数据失败:', error);
      return {};
    }
  }

  /**
   * 获取网页端所有数据
   * 返回用户保存的数据，不会自动返回初始数据
   */
  async getAllWebData() {
    try {
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks', 'hsrCharacters', 'hsrCones', 'hsrRelics'];
      const result = {};
      
      for (const type of dataTypes) {
        result[type] = await this.readFromWebStorage(type);
      }
      
      logger.info('获取网页端所有数据完成', { summary: Object.keys(result).map(key => `${key}: ${result[key].length}`).join(', ') });
      return result;
    } catch (error) {
      logger.error('获取网页端所有数据失败', { message: error.message });
      // 返回空数据结构，避免意外覆盖用户数据
      return {
        agents: [],
        soundEngines: [],
        bumbos: [],
        driveDisks: []
      };
    }
  }

  /**
   * 获取双存储系统状态
   */
  async getDualStorageStatus() {
    try {
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      const status = {
        initialized: true,
        lastCheck: new Date().toISOString(),
        web: {},
        admin: {}
      };
      
      // 检查网页端存储状态
      for (const type of dataTypes) {
        const webFilePath = this.getWebStorageFilePath(type);
        const adminFilePath = this.getAdminStorageFilePath(type);
        
        // 网页端状态
        if (fs.existsSync(webFilePath)) {
          const webStats = await fs.promises.stat(webFilePath);
          const webContent = await fs.promises.readFile(webFilePath, 'utf-8');
          const webData = JSON.parse(webContent);
          
          status.web[type] = {
            exists: true,
            size: webStats.size,
            lastModified: webStats.mtime.toISOString(),
            version: webData.version,
            count: webData.count,
            lastUpdated: webData.lastUpdated
          };
        } else {
          status.web[type] = { exists: false };
          status.initialized = false;
        }
        
        // 管理员端状态
        if (fs.existsSync(adminFilePath)) {
          const adminStats = await fs.promises.stat(adminFilePath);
          const adminContent = await fs.promises.readFile(adminFilePath, 'utf-8');
          const adminData = JSON.parse(adminContent);
          
          status.admin[type] = {
            exists: true,
            size: adminStats.size,
            lastModified: adminStats.mtime.toISOString(),
            version: adminData.version,
            count: adminData.count,
            lastUpdated: adminData.lastUpdated,
            sessionStarted: adminData.sessionStarted
          };
        } else {
          status.admin[type] = { exists: false };
        }
      }
      
      return status;
    } catch (error) {
      logger.error('获取双存储系统状态失败', { message: error.message });
      return {
        initialized: false,
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  /**
   * 清理管理员端会话数据
   */
  async cleanupAdminSession() {
    try {
      logger.info('正在清理管理员端会话数据...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      
      for (const type of dataTypes) {
        const adminFilePath = this.getAdminStorageFilePath(type);
        
        if (fs.existsSync(adminFilePath)) {
          // 创建备份后删除
          const backupPath = this.getBackupFilePath(type, 'admin_cleanup');
          await fs.promises.copyFile(adminFilePath, backupPath);
          await fs.promises.unlink(adminFilePath);
          logger.info('管理员端数据已清理', { type });
        }
      }
      
      logger.info('管理员端会话数据清理完成');
      return true;
    } catch (error) {
      logger.error('清理管理员端会话数据失败', { message: error.message });
      return false;
    }
  }
}

// 创建单例实例
const dualStorageManager = new DualStorageManager();

export default dualStorageManager;
export { DualStorageManager };