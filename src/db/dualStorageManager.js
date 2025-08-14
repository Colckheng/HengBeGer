// 双存储系统管理器 - 实现管理员端和网页端分离存储
import fs from 'fs';
import path from 'path';
import initialData from '../initialdata.js';

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
   * 将初始数据保存到网页端存储系统
   */
  async initializeDualStorage() {
    try {
      console.log('🔄 正在初始化双存储系统...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      
      // 初始化网页端存储
      for (const type of dataTypes) {
        const webFilePath = this.getWebStorageFilePath(type);
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
        console.log(`✅ 网页端 ${type} 数据已保存 (${data.length} 条记录)`);
      }
      
      console.log('✅ 双存储系统初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 双存储系统初始化失败:', error);
      return false;
    }
  }

  /**
   * 管理员进入时：复制网页端数据到管理员端
   */
  async initializeAdminSession() {
    try {
      console.log('🔄 正在初始化管理员会话...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      
      for (const type of dataTypes) {
        const webFilePath = this.getWebStorageFilePath(type);
        const adminFilePath = this.getAdminStorageFilePath(type);
        
        if (fs.existsSync(webFilePath)) {
          // 读取网页端数据
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
          console.log(`✅ 管理员端 ${type} 数据已初始化`);
        } else {
          console.log(`⚠️ 网页端 ${type} 数据不存在，使用初始数据`);
          await this.saveToAdminStorage(type, initialData[type] || []);
        }
      }
      
      console.log('✅ 管理员会话初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 管理员会话初始化失败:', error);
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
        console.log(`⚠️ 网页端存储文件不存在: ${type}，使用初始数据`);
        return initialData[type] || [];
      }
      
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const storageData = JSON.parse(fileContent);
      
      return storageData.data || [];
    } catch (error) {
      console.error(`❌ 读取网页端存储数据失败 (${type}):`, error);
      return initialData[type] || [];
    }
  }

  /**
   * 从管理员端存储读取数据
   */
  async readFromAdminStorage(type) {
    try {
      const filePath = this.getAdminStorageFilePath(type);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️ 管理员端存储文件不存在: ${type}，需要先初始化会话`);
        return [];
      }
      
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const storageData = JSON.parse(fileContent);
      
      return storageData.data || [];
    } catch (error) {
      console.error(`❌ 读取管理员端存储数据失败 (${type}):`, error);
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
        console.log(`📦 已创建管理员端备份: ${path.basename(backupPath)}`);
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
      console.log(`✅ 管理员端 ${type} 数据已更新 (${data.length} 条记录)`);
      
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
      console.log('🔄 正在同步管理员端数据到网页端...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      const syncResults = {};
      
      for (const type of dataTypes) {
        const adminFilePath = this.getAdminStorageFilePath(type);
        const webFilePath = this.getWebStorageFilePath(type);
        
        if (fs.existsSync(adminFilePath)) {
          // 备份网页端数据
          if (fs.existsSync(webFilePath)) {
            const backupPath = this.getBackupFilePath(type, 'web');
            await fs.promises.copyFile(webFilePath, backupPath);
            console.log(`📦 已创建网页端备份: ${path.basename(backupPath)}`);
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
          
          console.log(`✅ ${type} 数据已同步到网页端 (${adminData.count} 条记录)`);
        } else {
          syncResults[type] = {
            success: false,
            error: '管理员端数据不存在'
          };
          console.log(`⚠️ 管理员端 ${type} 数据不存在，跳过同步`);
        }
      }
      
      console.log('✅ 数据同步完成');
      return syncResults;
    } catch (error) {
      console.error('❌ 同步数据到网页端失败:', error);
      return { error: error.message };
    }
  }

  /**
   * 获取管理员端所有数据
   */
  async getAllAdminData() {
    try {
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
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
   */
  async getAllWebData() {
    try {
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      const result = {};
      
      for (const type of dataTypes) {
        result[type] = await this.readFromWebStorage(type);
      }
      
      return result;
    } catch (error) {
      console.error('❌ 获取网页端所有数据失败:', error);
      return initialData;
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
      console.error('❌ 获取双存储系统状态失败:', error);
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
      console.log('🔄 正在清理管理员端会话数据...');
      
      const dataTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      
      for (const type of dataTypes) {
        const adminFilePath = this.getAdminStorageFilePath(type);
        
        if (fs.existsSync(adminFilePath)) {
          // 创建备份后删除
          const backupPath = this.getBackupFilePath(type, 'admin_cleanup');
          await fs.promises.copyFile(adminFilePath, backupPath);
          await fs.promises.unlink(adminFilePath);
          console.log(`✅ 管理员端 ${type} 数据已清理`);
        }
      }
      
      console.log('✅ 管理员端会话数据清理完成');
      return true;
    } catch (error) {
      console.error('❌ 清理管理员端会话数据失败:', error);
      return false;
    }
  }
}

// 创建单例实例
const dualStorageManager = new DualStorageManager();

export default dualStorageManager;
export { DualStorageManager };