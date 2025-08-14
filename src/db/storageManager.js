// 存储管理系统 - 实现数据同步逻辑
import fs from 'fs';
import path from 'path';
import initialData from '../initialdata.js';

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
      console.log('🔄 正在初始化存储系统...');
      
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
        console.log(`✅ ${type} 数据已保存到存储系统 (${data.length} 条记录)`);
      }
      
      console.log('✅ 存储系统初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 存储系统初始化失败:', error);
      return false;
    }
  }

  /**
   * 从存储系统读取数据
   */
  async readFromStorage(type) {
    try {
      const filePath = this.getStorageFilePath(type);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️ 存储文件不存在: ${type}，使用初始数据`);
        return initialData[type] || [];
      }
      
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const storageData = JSON.parse(fileContent);
      
      return storageData.data || [];
    } catch (error) {
      console.error(`❌ 读取存储数据失败 (${type}):`, error);
      return initialData[type] || [];
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
        console.log(`📦 已创建备份: ${path.basename(backupPath)}`);
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
      console.log(`✅ ${type} 数据已更新到存储系统 (${data.length} 条记录)`);
      
      return true;
    } catch (error) {
      console.error(`❌ 保存存储数据失败 (${type}):`, error);
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
      console.error('❌ 获取所有存储数据失败:', error);
      return initialData;
    }
  }

  /**
   * 同步数据到数据库
   * 管理员更新数据时调用
   */
  async syncToDatabase(sequelize, type, data) {
    try {
      console.log(`🔄 正在同步 ${type} 数据到数据库...`);
      
      // 这里可以添加具体的数据库同步逻辑
      // 例如：清空现有数据，插入新数据
      
      // 保存到存储系统
      await this.saveToStorage(type, data);
      
      console.log(`✅ ${type} 数据同步完成`);
      return true;
    } catch (error) {
      console.error(`❌ 同步 ${type} 数据到数据库失败:`, error);
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
      console.error('❌ 获取存储系统状态失败:', error);
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
      console.log('🔄 正在重置存储系统...');
      
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
      
      console.log(`✅ 存储系统已重置，备份保存在: ${fullBackupPath}`);
      return true;
    } catch (error) {
      console.error('❌ 重置存储系统失败:', error);
      return false;
    }
  }
}

// 创建单例实例
const storageManager = new StorageManager();

export default storageManager;
export { StorageManager };