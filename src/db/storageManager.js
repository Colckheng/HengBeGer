// 存储管理系统 - 实现数据同步逻辑
import fs from 'fs';
import path from 'path';
import initialData from '../initialdata.js';
import { logger } from '../utils/logger.js';

/**
 * 存储管理器类
 * 负责管理初始化数据、存储系统数据和展示数据的同步
 */
class StorageManager {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'src', 'db', 'storage');
    this.backupPath = path.join(this.storagePath, 'backup');
    this.ensureDirectories();
  }

  /**
   * 确保存储目录存在
   */
  ensureDirectories() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
    }
  }

  /**
   * 获取存储文件路径
   */
  getStorageFilePath(type) {
    return path.join(this.storagePath, `${type}.json`);
  }

  /**
   * 获取备份文件路径
   */
  getBackupFilePath(type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.backupPath, `${type}_${timestamp}.json`);
  }

  /**
   * 初始化存储系统
   * 将初始数据保存到存储系统
   */
  async initializeStorage() {
    try {
      logger.info('正在初始化存储系统...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      
      for (const type of dataTypes) {
        const filePath = this.getStorageFilePath(type);
        const data = initialData[type] || [];
        
        // 添加元数据
        const storageData = {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          dataType: type,
          count: data.length,
          data: data
        };
        
        await fs.promises.writeFile(filePath, JSON.stringify(storageData, null, 2), 'utf-8');
        logger.info('数据已保存到存储系统', { type, count: data.length });
      }
      
      logger.info('存储系统初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 存储系统初始化失败:', error);
      return false;
    }
  }

  /**
   * 从存储系统读取数据
   * 优先返回用户保存的数据，仅在首次使用时返回初始数据
   */
  async readFromStorage(type) {
    try {
      const filePath = this.getStorageFilePath(type);
      
      if (!fs.existsSync(filePath)) {
        logger.warn('存储文件不存在，返回空数据', { type });
        return [];
      }
      
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const storageData = JSON.parse(fileContent);
      
      logger.info('读取存储数据', { type, count: storageData.count || 0 });
      return storageData.data || [];
    } catch (error) {
      logger.error('读取存储数据失败', { type, message: error.message });
      // 读取失败时返回空数组，避免意外覆盖用户数据
      return [];
    }
  }

  /**
   * 保存数据到存储系统
   */
  async saveToStorage(type, data) {
    try {
      const filePath = this.getStorageFilePath(type);
      
      // 创建备份
      if (fs.existsSync(filePath)) {
        const backupPath = this.getBackupFilePath(type);
        await fs.promises.copyFile(filePath, backupPath);
        logger.info('已创建备份', { file: path.basename(backupPath) });
      }
      
      // 保存新数据
      const storageData = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        dataType: type,
        count: data.length,
        data: data
      };
      
      await fs.promises.writeFile(filePath, JSON.stringify(storageData, null, 2), 'utf-8');
      logger.info('数据已更新到存储系统', { type, count: data.length });
      
      return true;
    } catch (error) {
      logger.error('保存存储数据失败', { type, message: error.message });
      return false;
    }
  }

  /**
   * 获取所有存储数据
   */
  async getAllStorageData() {
    try {
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      const result = {};
      
      for (const type of dataTypes) {
        result[type] = await this.readFromStorage(type);
      }
      
      return result;
    } catch (error) {
      logger.error('获取所有存储数据失败', { message: error.message });
      return initialData;
    }
  }

  /**
   * 同步数据到数据库
   * 管理员更新数据时调用
   */
  async syncToDatabase(sequelize, type, data) {
    try {
      logger.info('正在同步数据到数据库...', { type, count: data?.length || 0 });
      
      // 这里可以添加具体的数据库同步逻辑
      // 例如：清空现有数据，插入新数据
      
      // 保存到存储系统
      await this.saveToStorage(type, data);
      
      logger.info('数据同步完成', { type });
      return true;
    } catch (error) {
      logger.error('同步数据到数据库失败', { type, message: error.message });
      return false;
    }
  }

  /**
   * 获取存储系统状态
   */
  async getStorageStatus() {
    try {
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      const status = {
        initialized: true,
        lastCheck: new Date().toISOString(),
        files: {}
      };
      
      for (const type of dataTypes) {
        const filePath = this.getStorageFilePath(type);
        
        if (fs.existsSync(filePath)) {
          const stats = await fs.promises.stat(filePath);
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          
          status.files[type] = {
            exists: true,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            version: data.version,
            count: data.count,
            lastUpdated: data.lastUpdated
          };
        } else {
          status.files[type] = {
            exists: false
          };
          status.initialized = false;
        }
      }
      
      return status;
    } catch (error) {
      logger.error('获取存储系统状态失败', { message: error.message });
      return {
        initialized: false,
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  /**
   * 重置存储系统
   * 恢复到初始数据
   */
  async resetStorage() {
    try {
      logger.info('正在重置存储系统...');
      
      // 创建完整备份
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fullBackupPath = path.join(this.backupPath, `full_backup_${timestamp}`);
      
      if (!fs.existsSync(fullBackupPath)) {
        fs.mkdirSync(fullBackupPath, { recursive: true });
      }
      
      // 备份现有文件
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      for (const type of dataTypes) {
        const filePath = this.getStorageFilePath(type);
        if (fs.existsSync(filePath)) {
          const backupFilePath = path.join(fullBackupPath, `${type}.json`);
          await fs.promises.copyFile(filePath, backupFilePath);
        }
      }
      
      // 重新初始化
      await this.initializeStorage();
      
      logger.info('存储系统已重置', { backupDir: fullBackupPath });
      return true;
    } catch (error) {
      logger.error('重置存储系统失败', { message: error.message });
      return false;
    }
  }
}

// 创建单例实例
const storageManager = new StorageManager();

export default storageManager;
export { StorageManager };