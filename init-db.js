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
  const forceRequested = process.argv.includes('--force');
  if (forceRequested) {
    process.env.INIT_DB = 'true';
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'development';
    }
  }
  const willRebuild =
    forceRequested &&
    process.env.NODE_ENV === 'development' &&
    process.env.INIT_DB === 'true';

  const sequelize = createSequelizeInstance(username, password);

  try {
    initializeModels(sequelize);
    const initialized = await initializeData(sequelize);
    if (!initialized) {
      throw new Error('数据库初始化失败。');
    }

    if (forceRequested && !willRebuild) {
      console.warn(
        `--force 未生效：重建表结构要求 NODE_ENV=development，当前为 ${process.env.NODE_ENV}。已按安全模式执行。`,
      );
    }
    console.log(
      willRebuild
        ? '数据库初始化完成（--force：已重建表结构并重播种子）。'
        : '数据库初始化完成（安全模式，未删表；如需清库重建请加 --force）。',
    );
  } finally {
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
