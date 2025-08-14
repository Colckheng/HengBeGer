// 数据库连接配置
import { Sequelize } from 'sequelize';
import process from 'process';

// 从环境变量或配置文件中获取数据库连接信息
export const baseDbConfig = {
  database: process.env.DB_NAME || 'hengbeger',
  username: process.env.DB_USER || 'root',
  host: process.env.DB_HOST || 'localhost',
  dialect: 'mysql',
  port: parseInt(process.env.DB_PORT) || 3306,
  retryAttempts: 3, // 连接重试次数
  retryDelay: 2000, // 重试延迟（毫秒）
};

// 创建Sequelize实例的工厂函数
export function createSequelizeInstance(username, password) {
  const config = {
    ...baseDbConfig,
    username,
    password
  };

  console.log('数据库配置信息:');
  console.log(`数据库名: ${config.database}`);
  console.log(`用户名: ${config.username}`);
  console.log(`密码: ${config.password ? '*****' : '未设置'}`);
  console.log(`主机: ${config.host}:${config.port}`);

  return new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    dialect: config.dialect,
    port: config.port,
    logging: (msg) => console.log(`[Sequelize] ${msg}`),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      connectTimeout: 10000,
      charset: 'utf8mb4'
    },
    define: {
      charset: 'utf8mb4'
    }
  });
}

// 创建默认的Sequelize实例（用于向后兼容）
const defaultUsername = 'root';
const defaultPassword = process.env.DB_PASSWORD || 'password';
export const sequelize = createSequelizeInstance(defaultUsername, defaultPassword);

// 检查密码是否为空
if (!defaultPassword) {
  console.warn('⚠️ 警告: 数据库密码未设置，这可能导致连接失败。');
  console.warn('⚠️ 建议: 设置环境变量 DB_PASSWORD 或修改 config.js 中的默认密码。');
}

// 带重试机制的连接函数
const connectWithRetry = async (sequelizeInstance, attempt = 1) => {
  try {
    await sequelizeInstance.authenticate();
    console.log('✅ 数据库连接成功!');
    return true;
  } catch (error) {
    console.error(`❌ 第 ${attempt} 次连接失败:`, error.message);
    
    // 处理特定错误类型
    if (error.name === 'SequelizeAccessDeniedError') {
      console.error('❌ 访问被拒绝: 用户名或密码不正确。');
      console.error('❌ 请确保MySQL root用户密码正确，并具有访问权限。');
      return false; // 不重试，因为密码错误重试也没用
    } else if (error.name === 'SequelizeConnectionRefusedError') {
      console.error('❌ 连接被拒绝: MySQL服务器可能未运行。');
    } else if (error.name === 'SequelizeDatabaseError' && error.parent?.code === 'ER_BAD_DB_ERROR') {
      console.error('❌ 数据库不存在。');
      return false; // 由initializeDatabase处理
    }

    // 如果未达到最大重试次数，则重试
    if (attempt < baseDbConfig.retryAttempts) {
      console.log(`🔄 等待 ${baseDbConfig.retryDelay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, baseDbConfig.retryDelay));
      return connectWithRetry(sequelizeInstance, attempt + 1);
    }

    console.error('❌ 达到最大重试次数，连接失败。');
    return false;
  }
};

// 测试连接并创建数据库（如果不存在）
const initializeDatabase = async (dbInstance = sequelize) => {
  try {
    // 尝试连接（带重试）
    const isConnected = await connectWithRetry(dbInstance);
    if (!isConnected) {
      return false;
    }

    // 同步模型到数据库
    console.log('🚀 开始同步数据库模型...');
    await dbInstance.sync({ alter: true }); // 使用alter: true保护现有数据
    console.log('✅ 数据库模型同步完成!');

    return true;
  } catch (error) {
    console.error('❌ 数据库操作失败:', error.message);
    console.error('错误详情:', error);
    
    // 如果是数据库不存在的错误，尝试创建数据库
    if (error.name === 'SequelizeDatabaseError' && error.parent?.code === 'ER_BAD_DB_ERROR') {
      console.error('❌ 数据库不存在，正在尝试创建...');
      try {
        // 创建数据库连接（不指定数据库名）
        const tempSequelize = new Sequelize('', baseDbConfig.username, baseDbConfig.password, {
          host: baseDbConfig.host,
          dialect: baseDbConfig.dialect,
          port: baseDbConfig.port,
          logging: (msg) => console.log(`[Sequelize] ${msg}`)
        });
        
        // 测试临时连接
        await tempSequelize.authenticate();
        console.log('✅ 临时数据库连接成功!');
        
        // 创建数据库
        await tempSequelize.query(`CREATE DATABASE IF NOT EXISTS ${baseDbConfig.database}`);
        console.log(`✅ 数据库 ${baseDbConfig.database} 创建成功!`);
        await tempSequelize.close();
        
        // 重新连接到新创建的数据库
        return await initializeDatabase(dbInstance);
      } catch (createError) {
        console.error('❌ 创建数据库失败:', createError.message);
        console.error('错误详情:', createError);
        
        if (createError.name === 'SequelizeAccessDeniedError') {
          console.error('❌ 创建数据库时访问被拒绝: 请确保MySQL用户具有创建数据库的权限。');
        }
      }
    }
    return false;
  }
};

export { initializeDatabase };