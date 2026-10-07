// 数据库索引优化配置
// 根据查询模式和性能需求添加必要的索引

/**
 * 为数据库表添加索引以优化查询性能
 * @param {Sequelize} sequelize - Sequelize实例
 */
import { logger, logDatabase } from '../utils/logger.js';

export async function createIndexes(sequelize) {
  try {
    logger.info('开始创建数据库索引...');
    const [dbResult] = await sequelize.query('SELECT DATABASE() as db_name');
    const dbName = dbResult[0].db_name;

    const ensureIndex = async (table, indexName, columns, options = {}) => {
      const wantUnique = options.unique === true;
      const [rows] = await sequelize.query(`
        SELECT NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${table}' AND INDEX_NAME = '${indexName}'
        LIMIT 1
      `);
      const existing = rows[0];

      if (!existing) {
        try {
          await sequelize.query(`CREATE ${wantUnique ? 'UNIQUE ' : ''}INDEX ${indexName} ON ${table}(${columns})`);
        } catch {
          await sequelize.query(`ALTER TABLE ${table} ADD ${wantUnique ? 'UNIQUE ' : ''}INDEX ${indexName} (${columns})`);
        }
        return;
      }

      if (!wantUnique || existing.NON_UNIQUE === 0) {
        return;
      }

      const [dupRows] = await sequelize.query(`
        SELECT COUNT(*) AS dupCount FROM (
          SELECT name FROM ${table} GROUP BY name HAVING COUNT(*) > 1
        ) duplicates
      `);
      if (Number(dupRows[0].dupCount) > 0) {
        logger.warn('存在重复 name，保留普通索引，修复重复后重启可升级为唯一索引', {
          table,
          indexName,
          duplicateGroups: Number(dupRows[0].dupCount),
        });
        return;
      }

      try {
        await sequelize.query(`DROP INDEX ${indexName} ON ${table}`);
        await sequelize.query(`CREATE UNIQUE INDEX ${indexName} ON ${table}(${columns})`);
        logger.info('名称索引已升级为唯一索引', { table, indexName });
      } catch (error) {
        logger.warn('名称唯一索引升级失败，已回退为普通索引', {
          table,
          indexName,
          message: error.message,
        });
        try {
          await sequelize.query(`CREATE INDEX ${indexName} ON ${table}(${columns})`);
        } catch {
          logger.error('回退普通索引失败', { table, indexName });
        }
      }
    };

    await ensureIndex('agents', 'idx_agents_faction_id', 'factionId');
    await ensureIndex('agents', 'idx_agents_role_id', 'roleId');
    await ensureIndex('agents', 'idx_agents_rarity_id', 'rarityId');
    await ensureIndex('agents', 'idx_agents_faction_role', 'factionId, roleId');
    await ensureIndex('agents', 'idx_agents_role_rarity', 'roleId, rarityId');
    await ensureIndex('agents', 'idx_agents_name', 'name', { unique: true });
    await ensureIndex('agents', 'idx_agents_element', 'element');
    await ensureIndex('sound_engines', 'idx_sound_engines_rarity_id', 'rarityId');
    await ensureIndex('sound_engines', 'idx_sound_engines_role_id', 'roleId');
    await ensureIndex('sound_engines', 'idx_sound_engines_role_rarity', 'roleId, rarityId');
    await ensureIndex('sound_engines', 'idx_sound_engines_name', 'name', { unique: true });
    await ensureIndex('bumbos', 'idx_bumbos_rarity_id', 'rarityId');
    await ensureIndex('bumbos', 'idx_bumbos_name', 'name', { unique: true });
    await ensureIndex('drive_disks', 'idx_drive_disks_name', 'name', { unique: true });
    await ensureIndex('agents', 'idx_agents_created_at', 'createdAt');
    await ensureIndex('agents', 'idx_agents_updated_at', 'updatedAt');
    await ensureIndex('sound_engines', 'idx_sound_engines_created_at', 'createdAt');
    await ensureIndex('bumbos', 'idx_bumbos_created_at', 'createdAt');
    await ensureIndex('drive_disks', 'idx_drive_disks_created_at', 'createdAt');
    // HSR tables
    await ensureIndex('hsr_characters', 'idx_hsr_characters_element', 'elementId');
    await ensureIndex('hsr_characters', 'idx_hsr_characters_path', 'pathId');
    await ensureIndex('hsr_characters', 'idx_hsr_characters_rarity', 'rarityId');
    await ensureIndex('hsr_characters', 'idx_hsr_characters_name', 'name', { unique: true });
    await ensureIndex('hsr_cones', 'idx_hsr_cones_path', 'pathId');
    await ensureIndex('hsr_cones', 'idx_hsr_cones_rarity', 'rarityId');
    await ensureIndex('hsr_cones', 'idx_hsr_cones_name', 'name', { unique: true });
    await ensureIndex('hsr_relics', 'idx_hsr_relics_type', 'typeId');
    await ensureIndex('hsr_relics', 'idx_hsr_relics_name', 'name', { unique: true });
    
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
      } catch {
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

export default {
  createIndexes,
  dropIndexes,
  checkIndexes
};
