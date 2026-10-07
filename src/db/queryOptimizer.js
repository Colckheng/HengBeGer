// 查询优化工具
// 提供常见查询的优化版本和性能分析

import { Op } from 'sequelize';

import { logger, logDatabase, logPerformance } from '../utils/logger.js';

/**
 * 优化的查询构建器
 * 提供高性能的数据库查询方法
 */
export class QueryOptimizer {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.queryStats = {
      totalQueries: 0,
      averageResponseTime: 0,
      slowQueries: [],
      cacheHits: 0,
      cacheMisses: 0
    };
    
    this.logger = logger;
    this.logDatabase = logDatabase;
    this.logPerformance = logPerformance;
    this.logger.info('查询优化器已初始化');
  }

  /**
   * 优化的代理人查询
   * 使用索引优化多条件筛选
   */
  async getAgentsOptimized(filters = {}) {
    const { factionId, roleId, rarityId, element, limit = 50, offset = 0 } = filters;
    
    let whereClause = {};
    let includeClause = [];
    
    // 构建WHERE条件（利用索引）
    if (factionId) whereClause.factionId = factionId;
    if (roleId) whereClause.roleId = roleId;
    if (rarityId) whereClause.rarityId = rarityId;
    if (element) whereClause.element = element;
    
    // 构建关联查询
    if (Object.keys(filters).some(key => ['factionName', 'roleName', 'rarityName'].includes(key))) {
      includeClause = [
        { model: this.sequelize.models.Faction, attributes: ['name'] },
        { model: this.sequelize.models.Role, attributes: ['name'] },
        { model: this.sequelize.models.Rarity, attributes: ['name'] }
      ];
    }
    
    const query = {
      where: whereClause,
      include: includeClause,
      limit,
      offset,
      order: [['createdAt', 'DESC']] // 利用时间戳索引
    };
    
    try {
      const result = await this.sequelize.models.Agent.findAndCountAll(query);
      
      // 记录查询性能
      logger.debug(`代理人查询完成: 返回 ${result.rows.length}/${result.count} 条记录`);
      
      return result;
    } catch (error) {
      console.error('❌ 代理人查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 优化的音擎查询
   */
  async getSoundEnginesOptimized(filters = {}) {
    const { roleId, rarityId, limit = 50, offset = 0 } = filters;
    
    let whereClause = {};
    
    if (roleId) whereClause.roleId = roleId;
    if (rarityId) whereClause.rarityId = rarityId;
    
    const query = {
      where: whereClause,
      include: [
        { model: this.sequelize.models.Role, attributes: ['name'] },
        { model: this.sequelize.models.Rarity, attributes: ['name'] }
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    };
    
    try {
      const result = await this.sequelize.models.SoundEngine.findAndCountAll(query);
      logger.debug(`音擎查询完成: 返回 ${result.rows.length}/${result.count} 条记录`);
      return result;
    } catch (error) {
      console.error('❌ 音擎查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 优化的邦布查询
   */
  async getBumbosOptimized(filters = {}) {
    const { rarityId, limit = 50, offset = 0 } = filters;
    
    let whereClause = {};
    if (rarityId) whereClause.rarityId = rarityId;
    
    const query = {
      where: whereClause,
      include: [
        { model: this.sequelize.models.Rarity, attributes: ['name'] }
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    };
    
    try {
      const result = await this.sequelize.models.Bumbo.findAndCountAll(query);
      logger.debug(`邦布查询完成: 返回 ${result.rows.length}/${result.count} 条记录`);
      return result;
    } catch (error) {
      console.error('❌ 邦布查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 优化的驱动盘查询
   */
  async getDriveDisksOptimized(filters = {}) {
    const { limit = 50, offset = 0 } = filters;
    
    const query = {
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    };
    
    try {
      const result = await this.sequelize.models.DriveDisk.findAndCountAll(query);
      logger.debug(`驱动盘查询完成: 返回 ${result.rows.length}/${result.count} 条记录`);
      return result;
    } catch (error) {
      console.error('❌ 驱动盘查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量查询优化
   * 减少数据库往返次数
   */
  async getAllDataOptimized() {
    try {
      logger.debug('开始批量查询所有数据...');
      
      // 并行执行多个查询
      const [agents, soundEngines, bumbos, driveDisks, factions, roles, rarities] = await Promise.all([
        this.sequelize.models.Agent.findAll({
          include: [
            { model: this.sequelize.models.Faction, attributes: ['name'] },
            { model: this.sequelize.models.Role, attributes: ['name'] },
            { model: this.sequelize.models.Rarity, attributes: ['name'] }
          ],
          order: [['createdAt', 'DESC']]
        }),
        this.sequelize.models.SoundEngine.findAll({
          include: [
            { model: this.sequelize.models.Role, attributes: ['name'] },
            { model: this.sequelize.models.Rarity, attributes: ['name'] }
          ],
          order: [['createdAt', 'DESC']]
        }),
        this.sequelize.models.Bumbo.findAll({
          include: [
            { model: this.sequelize.models.Rarity, attributes: ['name'] }
          ],
          order: [['createdAt', 'DESC']]
        }),
        this.sequelize.models.DriveDisk.findAll({
          order: [['createdAt', 'DESC']]
        }),
        this.sequelize.models.Faction.findAll({ order: [['name', 'ASC']] }),
        this.sequelize.models.Role.findAll({ order: [['name', 'ASC']] }),
        this.sequelize.models.Rarity.findAll({ order: [['name', 'ASC']] })
      ]);
      
      logger.debug('批量查询完成');
      logger.debug(`查询结果: 代理人${agents.length}个, 音擎${soundEngines.length}个, 邦布${bumbos.length}个, 驱动盘${driveDisks.length}个`);
      
      return {
        agents,
        soundEngines,
        bumbos,
        driveDisks,
        factions,
        roles,
        rarities
      };
    } catch (error) {
      console.error('❌ 批量查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 搜索功能优化
   * 使用索引进行快速文本搜索
   */
  async searchOptimized(searchTerm, type = 'all') {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return { agents: [], soundEngines: [], bumbos: [], driveDisks: [] };
    }
    
    const startTime = Date.now();
    const searchPattern = `%${searchTerm.trim()}%`;
    const results = {};
    
    try {
      if (type === 'all' || type === 'agents') {
        results.agents = await this.sequelize.models.Agent.findAll({
          where: {
            name: { [Op.like]: searchPattern }
          },
          include: [
            { model: this.sequelize.models.Faction, attributes: ['name'] },
            { model: this.sequelize.models.Role, attributes: ['name'] },
            { model: this.sequelize.models.Rarity, attributes: ['name'] }
          ],
          limit: 20
        });
      }
      
      if (type === 'all' || type === 'soundEngines') {
        results.soundEngines = await this.sequelize.models.SoundEngine.findAll({
          where: {
            name: { [Op.like]: searchPattern }
          },
          include: [
            { model: this.sequelize.models.Role, attributes: ['name'] },
            { model: this.sequelize.models.Rarity, attributes: ['name'] }
          ],
          limit: 20
        });
      }
      
      if (type === 'all' || type === 'bumbos') {
        results.bumbos = await this.sequelize.models.Bumbo.findAll({
          where: {
            name: { [Op.like]: searchPattern }
          },
          include: [
            { model: this.sequelize.models.Rarity, attributes: ['name'] }
          ],
          limit: 20
        });
      }
      
      if (type === 'all' || type === 'driveDisks') {
        results.driveDisks = await this.sequelize.models.DriveDisk.findAll({
          where: {
            name: { [Op.like]: searchPattern }
          },
          limit: 20
        });
      }
      
      const totalResults = Object.values(results).reduce((sum, arr) => sum + (arr?.length || 0), 0);
      if (this.logger) {
        this.logger.info(`搜索完成: 找到 ${totalResults} 条结果`, {
          searchTerm,
          type,
          totalResults
        });
        this.logPerformance('搜索操作', Date.now() - startTime, { searchTerm, type });
      } else {
        logger.debug(`搜索 "${searchTerm}" 完成: 找到 ${totalResults} 条结果`);
      }
      
      return results;
    } catch (error) {
      if (this.logger) {
        this.logger.error('搜索失败', {
          message: error.message,
          searchTerm,
          type,
          stack: error.stack
        });
      } else {
        console.error('❌ 搜索失败:', error.message);
      }
      throw error;
    }
  }

  /**
   * 获取查询统计信息
   */
  async getQueryStats() {
    try {
      const [stats] = await this.sequelize.query(`
        SELECT 
          table_name,
          table_rows,
          data_length,
          index_length,
          (data_length + index_length) as total_size
        FROM information_schema.tables 
        WHERE table_schema = DATABASE()
          AND table_name IN ('agents', 'sound_engines', 'bumbos', 'drive_disks', 'factions', 'roles', 'rarities')
        ORDER BY total_size DESC
      `);
      
      logger.debug('数据库表统计信息', { stats });
      
      return stats;
    } catch (error) {
      logger.error('获取查询统计失败', { message: error.message });
      return [];
    }
  }
}

export default QueryOptimizer;