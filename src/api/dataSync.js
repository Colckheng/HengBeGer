// 数据同步API - 管理员界面数据更新接口
import storageManager from '../db/storageManager.js';
import { createSequelizeInstance } from '../db/config.js';
import { 
  addAgent, updateAgent, deleteAgent,
  addSoundEngine, updateSoundEngine, deleteSoundEngine,
  addBumbo, updateBumbo, deleteBumbo,
  addDriveDisk, updateDriveDisk, deleteDriveDisk,
  getAllAgents, getAllSoundEngines, getAllBumbos, getAllDriveDisks
} from '../db/api.js';
import { logger, logDatabase } from '../utils/logger.js';
import { catchAsync, AppError } from '../utils/errorHandler.js';

/**
 * 数据同步控制器
 * 处理管理员界面的数据更新请求
 */
class DataSyncController {
  /**
   * 获取所有数据
   */
  static async getAllData(req, res) {
    try {
      logger.info('获取所有数据');
      const data = await storageManager.getAllStorageData();
      
      res.json({
        success: true,
        message: '数据获取成功',
        data: data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('获取数据失败', { message: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: '获取数据失败',
        error: error.message
      });
    }
  }

  /**
   * 获取特定类型的数据
   */
  static async getDataByType(req, res) {
    try {
      const { type } = req.params;
      logger.info(`获取 ${type} 数据`);
      
      const validTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: '无效的数据类型',
          validTypes: validTypes
        });
      }
      
      const data = await storageManager.readFromStorage(type);
      
      res.json({
        success: true,
        message: `${type} 数据获取成功`,
        data: data,
        count: data.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`获取 ${req.params.type} 数据失败`, { message: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: '获取数据失败',
        error: error.message
      });
    }
  }

  /**
   * 更新特定类型的数据
   * 管理员界面调用此接口更新数据
   */
  static async updateDataByType(req, res) {
    try {
      const { type } = req.params;
      const { data } = req.body;
      
      logger.info(`更新 ${type} 数据`, { count: data.length });
      
      const validTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: '无效的数据类型',
          validTypes: validTypes
        });
      }
      
      if (!Array.isArray(data)) {
        return res.status(400).json({
          success: false,
          message: '数据格式错误，应为数组格式'
        });
      }
      
      // 验证数据格式
      const validationResult = DataSyncController.validateData(type, data);
      if (!validationResult.valid) {
        return res.status(400).json({
          success: false,
          message: '数据验证失败',
          errors: validationResult.errors
        });
      }
      
      // 保存到存储系统
      const saveResult = await storageManager.saveToStorage(type, data);
      if (!saveResult) {
        return res.status(500).json({
          success: false,
          message: '保存到存储系统失败'
        });
      }
      
      // 同步数据到数据库
      const syncResult = await DataSyncController.syncToDatabase(type, data);
      if (!syncResult) {
        logger.warn('数据库同步失败，但存储系统更新成功', { type, count: data.length });
      }
      
      logger.info(`${type} 数据更新成功`, { count: data.length, syncResult });
      
      res.json({
        success: true,
        message: `${type} 数据更新成功`,
        count: data.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`更新 ${req.params.type} 数据失败`, { message: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: '更新数据失败',
        error: error.message
      });
    }
  }

  /**
   * 批量更新所有数据
   */
  static async updateAllData(req, res) {
    try {
      const { data } = req.body;
      
      logger.info('批量更新所有数据');
      
      if (!data || typeof data !== 'object') {
        return res.status(400).json({
          success: false,
          message: '数据格式错误'
        });
      }
      
      const validTypes = ['agents', 'soundEngines', 'bumbos', 'driveDisks'];
      const results = {};
      
      for (const type of validTypes) {
        if (data[type] && Array.isArray(data[type])) {
          // 验证数据
          const validationResult = DataSyncController.validateData(type, data[type]);
          if (!validationResult.valid) {
            return res.status(400).json({
              success: false,
              message: `${type} 数据验证失败`,
              errors: validationResult.errors
            });
          }
          
          // 保存数据
          const saveResult = await storageManager.saveToStorage(type, data[type]);
          results[type] = {
            success: saveResult,
            count: data[type].length
          };
        }
      }
      
      logger.info('批量数据更新完成', { results });
      
      res.json({
        success: true,
        message: '批量数据更新成功',
        results: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('批量更新数据失败', { message: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: '批量更新数据失败',
        error: error.message
      });
    }
  }

  /**
   * 获取存储系统状态
   */
  static async getStorageStatus(req, res) {
    try {
      logger.info('获取存储系统状态');
      const status = await storageManager.getStorageStatus();
      
      res.json({
        success: true,
        message: '存储系统状态获取成功',
        status: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('获取存储系统状态失败', { message: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: '获取存储系统状态失败',
        error: error.message
      });
    }
  }

  /**
   * 重置存储系统
   */
  static async resetStorage(req, res) {
    try {
      logger.info('重置存储系统');
      const resetResult = await storageManager.resetStorage();
      
      if (resetResult) {
        res.json({
          success: true,
          message: '存储系统重置成功',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          message: '存储系统重置失败'
        });
      }
    } catch (error) {
      logger.error('重置存储系统失败', { message: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: '重置存储系统失败',
        error: error.message
      });
    }
  }

  /**
   * 数据验证函数
   */
  static validateData(type, data) {
    const errors = [];
    
    if (!Array.isArray(data)) {
      return { valid: false, errors: ['数据必须是数组格式'] };
    }
    
    data.forEach((item, index) => {
      if (!item.id || !item.name) {
        errors.push(`第 ${index + 1} 项缺少必要字段 id 或 name`);
      }
      
      switch (type) {
        case 'agents':
          if (!item.faction || !item.role || !item.rarity || !item.element) {
            errors.push(`第 ${index + 1} 项代理人缺少必要字段`);
          }
          if (item.rarity && !['S', 'A'].includes(item.rarity)) {
            errors.push(`第 ${index + 1} 项代理人等级必须是 S 或 A`);
          }
          break;
          
        case 'soundEngines':
          if (!item.rarity || !item.role) {
            errors.push(`第 ${index + 1} 项音擎缺少必要字段`);
          }
          if (item.rarity && !['S', 'A', 'B'].includes(item.rarity)) {
            errors.push(`第 ${index + 1} 项音擎等级必须是 S、A 或 B`);
          }
          break;
          
        case 'bumbos':
          if (!item.rarity) {
            errors.push(`第 ${index + 1} 项邦布缺少等级字段`);
          }
          if (item.rarity && !['S', 'A'].includes(item.rarity)) {
            errors.push(`第 ${index + 1} 项邦布等级必须是 S 或 A`);
          }
          break;
          
        case 'driveDisks':
          if (!item.description) {
            errors.push(`第 ${index + 1} 项驱动盘缺少描述字段`);
          }
          break;
      }
    });
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * 同步数据到数据库
   */
  static async syncToDatabase(type, data) {
    try {
      logger.info(`开始同步 ${type} 数据到数据库`, { count: data.length });
      
      // 根据数据类型选择对应的同步策略
      switch (type) {
        case 'agents':
          return await DataSyncController.syncAgents(data);
        case 'soundEngines':
          return await DataSyncController.syncSoundEngines(data);
        case 'bumbos':
          return await DataSyncController.syncBumbos(data);
        case 'driveDisks':
          return await DataSyncController.syncDriveDisks(data);
        default:
          throw new AppError(`不支持的数据类型: ${type}`, 400);
      }
    } catch (error) {
      logger.error(`同步 ${type} 数据到数据库失败`, {
        message: error.message,
        stack: error.stack,
        type,
        dataCount: data?.length || 0
      });
      return false;
    }
  }

  /**
   * 同步代理人数据
   */
  static async syncAgents(agents) {
    try {
      const existingAgents = await getAllAgents();
      const existingIds = new Set(existingAgents.map(agent => agent.id));
      
      let syncCount = 0;
      for (const agent of agents) {
        try {
          if (existingIds.has(agent.id)) {
            await updateAgent(agent.id, agent);
          } else {
            await addAgent(agent);
          }
          syncCount++;
        } catch (error) {
          logger.warn(`同步代理人失败`, { agentId: agent.id, error: error.message });
        }
      }
      
      logDatabase('代理人同步', { status: 'success', syncCount, totalCount: agents.length });
      return true;
    } catch (error) {
      logger.error('代理人数据同步失败', { message: error.message });
      return false;
    }
  }

  /**
   * 同步音擎数据
   */
  static async syncSoundEngines(soundEngines) {
    try {
      const existingSoundEngines = await getAllSoundEngines();
      const existingIds = new Set(existingSoundEngines.map(engine => engine.id));
      
      let syncCount = 0;
      for (const engine of soundEngines) {
        try {
          if (existingIds.has(engine.id)) {
            await updateSoundEngine(engine.id, engine);
          } else {
            await addSoundEngine(engine);
          }
          syncCount++;
        } catch (error) {
          logger.warn(`同步音擎失败`, { engineId: engine.id, error: error.message });
        }
      }
      
      logDatabase('音擎同步', { status: 'success', syncCount, totalCount: soundEngines.length });
      return true;
    } catch (error) {
      logger.error('音擎数据同步失败', { message: error.message });
      return false;
    }
  }

  /**
   * 同步邦布数据
   */
  static async syncBumbos(bumbos) {
    try {
      const existingBumbos = await getAllBumbos();
      const existingIds = new Set(existingBumbos.map(bumbo => bumbo.id));
      
      let syncCount = 0;
      for (const bumbo of bumbos) {
        try {
          if (existingIds.has(bumbo.id)) {
            await updateBumbo(bumbo.id, bumbo);
          } else {
            await addBumbo(bumbo);
          }
          syncCount++;
        } catch (error) {
          logger.warn(`同步邦布失败`, { bumboId: bumbo.id, error: error.message });
        }
      }
      
      logDatabase('邦布同步', { status: 'success', syncCount, totalCount: bumbos.length });
      return true;
    } catch (error) {
      logger.error('邦布数据同步失败', { message: error.message });
      return false;
    }
  }

  /**
   * 同步驱动盘数据
   */
  static async syncDriveDisks(driveDisks) {
    try {
      const existingDriveDisks = await getAllDriveDisks();
      const existingIds = new Set(existingDriveDisks.map(disk => disk.id));
      
      let syncCount = 0;
      for (const disk of driveDisks) {
        try {
          if (existingIds.has(disk.id)) {
            await updateDriveDisk(disk.id, disk);
          } else {
            await addDriveDisk(disk);
          }
          syncCount++;
        } catch (error) {
          logger.warn(`同步驱动盘失败`, { diskId: disk.id, error: error.message });
        }
      }
      
      logDatabase('驱动盘同步', { status: 'success', syncCount, totalCount: driveDisks.length });
      return true;
    } catch (error) {
      logger.error('驱动盘数据同步失败', { message: error.message });
      return false;
    }
  }
}

export default DataSyncController;