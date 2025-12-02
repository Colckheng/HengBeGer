// 数据库索引优化配置
// 根据查询模式和性能需求添加必要的索引

/**
 * 为数据库表添加索引以优化查询性能
 * @param {Sequelize} sequelize - Sequelize实例
 */
import { logger, logDatabase, logPerformance } from '../utils/logger.js';

export async function createIndexes(sequelize) {
  try {
    logger.info('开始创建数据库索引...');
    const [dbResult] = await sequelize.query('SELECT DATABASE() as db_name');
    const dbName = dbResult[0].db_name;

    const ensureIndex = async (table, indexName, columns) => {
      const [exists] = await sequelize.query(`
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${table}' AND INDEX_NAME = '${indexName}'
        LIMIT 1
      `);
      if (exists.length === 0) {
        try {
          await sequelize.query(`CREATE INDEX ${indexName} ON ${table}(${columns})`);
        } catch (e) {
          await sequelize.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columns})`);
        }
      }
    };

    await ensureIndex('agents', 'idx_agents_faction_id', 'factionId');
    await ensureIndex('agents', 'idx_agents_role_id', 'roleId');
    await ensureIndex('agents', 'idx_agents_rarity_id', 'rarityId');
    await ensureIndex('agents', 'idx_agents_faction_role', 'factionId, roleId');
    await ensureIndex('agents', 'idx_agents_role_rarity', 'roleId, rarityId');
    await ensureIndex('agents', 'idx_agents_name', 'name');
    await ensureIndex('agents', 'idx_agents_element', 'element');
    await ensureIndex('sound_engines', 'idx_sound_engines_rarity_id', 'rarityId');
    await ensureIndex('sound_engines', 'idx_sound_engines_role_id', 'roleId');
    await ensureIndex('sound_engines', 'idx_sound_engines_role_rarity', 'roleId, rarityId');
    await ensureIndex('sound_engines', 'idx_sound_engines_name', 'name');
    await ensureIndex('bumbos', 'idx_bumbos_rarity_id', 'rarityId');
    await ensureIndex('bumbos', 'idx_bumbos_name', 'name');
    await ensureIndex('drive_disks', 'idx_drive_disks_name', 'name');
    await ensureIndex('agents', 'idx_agents_created_at', 'createdAt');
    await ensureIndex('agents', 'idx_agents_updated_at', 'updatedAt');
    await ensureIndex('sound_engines', 'idx_sound_engines_created_at', 'createdAt');
    await ensureIndex('bumbos', 'idx_bumbos_created_at', 'createdAt');
    await ensureIndex('drive_disks', 'idx_drive_disks_created_at', 'createdAt');
    // HSR tables
    await ensureIndex('hsr_characters', 'idx_hsr_characters_element', 'elementId');
    await ensureIndex('hsr_characters', 'idx_hsr_characters_path', 'pathId');
    await ensureIndex('hsr_characters', 'idx_hsr_characters_rarity', 'rarityId');
    await ensureIndex('hsr_characters', 'idx_hsr_characters_name', 'name');
    await ensureIndex('hsr_cones', 'idx_hsr_cones_path', 'pathId');
    await ensureIndex('hsr_cones', 'idx_hsr_cones_rarity', 'rarityId');
    await ensureIndex('hsr_cones', 'idx_hsr_cones_name', 'name');
    await ensureIndex('hsr_relics', 'idx_hsr_relics_type', 'typeId');
    await ensureIndex('hsr_relics', 'idx_hsr_relics_name', 'name');
    
    logger.info('数据库索引创建完成');
    return true;
  } catch (error) {
    logger.error('创建索引失败', { message: error.message, stack: error.stack });
    return false;
  }
}

/**
 * 删除所有自定义索引（用于重置）
 * @param {Sequelize} sequelize - Sequelize实例
 */
export async function dropIndexes(sequelize) {
  try {
    logger.info('开始删除自定义索引...');
    const indexTableMap = {
      idx_agents_faction_id: 'agents',
      idx_agents_role_id: 'agents',
      idx_agents_rarity_id: 'agents',
      idx_agents_faction_role: 'agents',
      idx_agents_role_rarity: 'agents',
      idx_agents_name: 'agents',
      idx_agents_element: 'agents',
      idx_agents_created_at: 'agents',
      idx_agents_updated_at: 'agents',
      idx_sound_engines_rarity_id: 'sound_engines',
      idx_sound_engines_role_id: 'sound_engines',
      idx_sound_engines_role_rarity: 'sound_engines',
      idx_sound_engines_name: 'sound_engines',
      idx_sound_engines_created_at: 'sound_engines',
      idx_bumbos_rarity_id: 'bumbos',
      idx_bumbos_name: 'bumbos',
      idx_bumbos_created_at: 'bumbos',
      idx_drive_disks_name: 'drive_disks',
      idx_drive_disks_created_at: 'drive_disks'
    };

    for (const [indexName, tableName] of Object.entries(indexTableMap)) {
      try {
        await sequelize.query(`DROP INDEX ${indexName} ON ${tableName}`);
        logger.info('删除索引完成', { indexName, tableName });
      } catch (error) {
        try {
          await sequelize.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
          logger.info('兼容方式删除索引完成', { indexName, tableName });
        } catch (fallbackError) {
          logger.warn('删除索引失败', { indexName, tableName, message: fallbackError.message });
        }
      }
    }
    
    logger.info('自定义索引删除完成');
    return true;
  } catch (error) {
    logger.error('删除索引失败', { message: error.message, stack: error.stack });
    return false;
  }
}

// 上移到文件顶部

/**
 * 检查索引状态
 * @param {Sequelize} sequelize - Sequelize实例
 */
export async function checkIndexes(sequelize) {
  try {
    logger.info('检查数据库索引状态...');
    
    // 获取当前数据库名
    const [dbResult] = await sequelize.query('SELECT DATABASE() as db_name');
    const dbName = dbResult[0].db_name;
    
    // 查询所有索引
    const [indexes] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE,
        INDEX_TYPE
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = '${dbName}'
        AND TABLE_NAME IN ('agents', 'sound_engines', 'bumbos', 'drive_disks', 'factions', 'roles', 'rarities')
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `);
    
    logger.info('当前数据库索引状态', { indexCount: indexes.length });
    if (process.env.NODE_ENV === 'development') {
      console.table(indexes);
    }
    
    logDatabase('索引检查', { status: 'success', indexCount: indexes.length });
    return indexes;
  } catch (error) {
    logger.error('检查索引状态失败', {
      message: error.message,
      stack: error.stack
    });
    return [];
  }
}

/**
 * 分析查询性能
 * @param {Sequelize} sequelize - Sequelize实例
 * @param {string} query - 要分析的SQL查询
 */
export async function analyzeQuery(sequelize, query) {
  const startTime = Date.now();
  try {
    logger.info('分析查询性能...', { query });
    
    // 使用EXPLAIN分析查询
    const [result] = await sequelize.query(`EXPLAIN ${query}`);
    
    if (process.env.NODE_ENV === 'development') {
      console.table(result);
    }
    
    // 检查是否使用了索引
    const hasIndex = result.some(row => row.key && row.key !== 'NULL');
    const hasFullTableScan = result.some(row => row.type === 'ALL');
    
    const analysisResult = {
      executionPlan: result,
      hasIndex,
      hasFullTableScan,
      recommendations: generateRecommendations(result)
    };
    
    logger.info('查询性能分析完成', {
      hasIndex,
      hasFullTableScan,
      planSteps: result.length
    });
    
    logPerformance('查询分析', Date.now() - startTime, {
      query: query.substring(0, 100) + '...',
      hasIndex,
      hasFullTableScan
    });
    
    return analysisResult;
  } catch (error) {
    logger.error('查询分析失败', {
      message: error.message,
      query: query.substring(0, 100) + '...',
      stack: error.stack
    });
    return null;
  }
}

/**
 * 生成优化建议
 * @param {Array} executionPlan - 执行计划
 */
function generateRecommendations(executionPlan) {
  const recommendations = [];
  
  executionPlan.forEach(row => {
    if (row.type === 'ALL') {
      recommendations.push(`表 ${row.table} 正在进行全表扫描，建议为 ${row.Extra || '查询条件'} 添加索引`);
    }
    
    if (row.rows > 1000) {
      recommendations.push(`表 ${row.table} 扫描行数过多 (${row.rows} 行)，建议优化查询条件或添加索引`);
    }
    
    if (row.Extra && row.Extra.includes('Using temporary')) {
      recommendations.push(`查询使用了临时表，建议优化 ORDER BY 或 GROUP BY 子句`);
    }
    
    if (row.Extra && row.Extra.includes('Using filesort')) {
      recommendations.push(`查询使用了文件排序，建议为排序字段添加索引`);
    }
  });
  
  return recommendations;
}

export default {
  createIndexes,
  dropIndexes,
  checkIndexes,
  analyzeQuery
};
