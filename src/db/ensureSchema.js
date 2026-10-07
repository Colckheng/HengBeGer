import { logger } from '../utils/logger.js';

const COLUMN_MIGRATIONS = [
  { table: 'agents', column: 'description', add: 'TEXT NULL', keepTypes: ['text', 'mediumtext', 'longtext'] },
  { table: 'hsr_characters', column: 'description', add: 'TEXT NULL', keepTypes: ['text', 'mediumtext', 'longtext'] },
  { table: 'sound_engines', column: 'image', add: 'LONGTEXT NULL', keepTypes: ['longtext'] },
  { table: 'bumbos', column: 'image', add: 'LONGTEXT NULL', keepTypes: ['longtext'] },
];

export async function ensureColumns(sequelize) {
  let applied = 0;
  for (const migration of COLUMN_MIGRATIONS) {
    try {
      const [rows] = await sequelize.query(
        'SELECT DATA_TYPE AS dataType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column',
        { replacements: { table: migration.table, column: migration.column } },
      );
      const existing = rows[0];
      if (!existing) {
        await sequelize.query(
          `ALTER TABLE \`${migration.table}\` ADD COLUMN \`${migration.column}\` ${migration.add}`,
        );
        applied += 1;
        logger.info('Added missing column', { table: migration.table, column: migration.column });
        continue;
      }
      if (migration.keepTypes.includes(existing.dataType)) {
        continue;
      }
      await sequelize.query(
        `ALTER TABLE \`${migration.table}\` MODIFY COLUMN \`${migration.column}\` ${migration.add}`,
      );
      applied += 1;
      logger.info('Adjusted column type', {
        table: migration.table,
        column: migration.column,
        from: existing.dataType,
      });
    } catch (error) {
      logger.warn('Column migration failed', {
        table: migration.table,
        column: migration.column,
        message: error.message,
      });
    }
  }
  return applied;
}

export default { ensureColumns };
