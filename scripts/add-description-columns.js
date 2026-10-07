import 'dotenv/config';

import { createSequelizeInstance } from '../src/db/config.js';
import { ensureColumns } from '../src/db/ensureSchema.js';

const username = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD;

if (!password) {
  console.error('必须提供 DB_PASSWORD。');
  process.exit(1);
}

const sequelize = createSequelizeInstance(username, password);

try {
  const applied = await ensureColumns(sequelize);
  console.log(applied > 0 ? `列迁移完成，应用 ${applied} 处变更。` : '列已是最新，无需变更。');
} finally {
  await sequelize.close();
}
