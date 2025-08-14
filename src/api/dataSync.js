// 数据同步API - 管理员界面数据更新接口
import storageManager from '../db/storageManager.js';
import { createSequelizeInstance } from '../db/config.js';

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
      console.log('📖 API: 获取所有数据');
      const data = await storageManager.getAllStorageData();
      
      res.json({
        success: true,
        message: '数据获取成功',
        data: data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ API: 获取数据失败:', error);
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
      console.log(`📖 API: 获取 ${type} 数据`);
      
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
      console.error(`❌ API: 获取 ${req.params.type} 数据失败:`, error);
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
      
      console.log(`🔄 API: 更新 ${type} 数据`);
      
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
      
      // TODO: 这里可以添加数据库同步逻辑
      // await DataSyncController.syncToDatabase(type, data);
      
      console.log(`✅ API: ${type} 数据更新成功`);
      
      res.json({
        success: true,
        message: `${type} 数据更新成功`,
        count: data.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`❌ API: 更新 ${req.params.type} 数据失败:`, error);
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
      
      console.log('🔄 API: 批量更新所有数据');
      
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
      
      console.log('✅ API: 批量数据更新完成');
      
      res.json({
        success: true,
        message: '批量数据更新成功',
        results: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ API: 批量更新数据失败:', error);
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
      console.log('📊 API: 获取存储系统状态');
      const status = await storageManager.getStorageStatus();
      
      res.json({
        success: true,
        message: '存储系统状态获取成功',
        status: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ API: 获取存储系统状态失败:', error);
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
      console.log('🔄 API: 重置存储系统');
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
      console.error('❌ API: 重置存储系统失败:', error);
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
   * 同步数据到数据库（预留接口）
   */
  static async syncToDatabase(type, data) {
    try {
      // 这里可以添加具体的数据库同步逻辑
      console.log(`🔄 同步 ${type} 数据到数据库...`);
      // TODO: 实现数据库同步逻辑
      return true;
    } catch (error) {
      console.error(`❌ 同步 ${type} 数据到数据库失败:`, error);
      return false;
    }
  }
}

export default DataSyncController;