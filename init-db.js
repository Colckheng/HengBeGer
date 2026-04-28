import readline from 'readline';

import dotenv from 'dotenv';

import { createSequelizeInstance } from './src/db/config.js';
import initializeData from './src/db/initializedata.js';
import { initializeModels } from './src/db/api.js';

dotenv.config();

const askQuestion = (prompt) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const run = async () => {
  const username = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || await askQuestion('请输入 MySQL 密码: ');

  if (!password) {
    throw new Error('必须提供 DB_PASSWORD。');
  }

  process.env.DB_PASSWORD = password;
  process.env.INIT_DB = process.env.INIT_DB || 'true';

  const sequelize = createSequelizeInstance(username, password);

  try {
    initializeModels(sequelize);
    const initialized = await initializeData(sequelize);
    if (!initialized) {
      throw new Error('数据库初始化失败。');
    }

    console.log('数据库初始化完成。');
  } finally {
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
