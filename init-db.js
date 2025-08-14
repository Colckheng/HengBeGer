// init-db.js - 交互式数据库初始化脚本
import readline from 'readline';
import { Sequelize } from 'sequelize';
import initializeData from './src/db/initializeData.js';
import { baseDbConfig, createSequelizeInstance } from './src/db/config.js';

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 询问用户数据库密码
const askPassword = () => {
  return new Promise((resolve) => {
    rl.question('请输入MySQL数据库root用户密码: ', (password) => {
      resolve(password.trim());
    });
  });
};

// 不再使用此函数，已内联到代码中
// function createSequelizeInstance(password, database = '') {
//   return new Sequelize(database, dbConfig.username, password, {
//     host: dbConfig.host,
//     dialect: dbConfig.dialect,
//     port: dbConfig.port,
//     logging: (msg) => console.log(`[Sequelize] ${msg}`) // 启用详细日志
//   });
// }

// 测试数据库连接并检查权限
const testConnection = async (password) => {
  try {
    // 尝试创建新用户并授予权限
    console.log('🔍 尝试创建新用户并授予权限...');
    let sequelize;
    try {
      // 使用管理员连接创建新用户
      const adminSequelize = new Sequelize('mysql', baseDbConfig.username, password, {
    host: baseDbConfig.host,
    port: baseDbConfig.port,
        dialect: 'mysql',
        logging: false
      });

      await adminSequelize.authenticate();
      console.log('✅ 管理员连接成功');

      // 创建新用户
      const newUser = 'hengbeger_user';
      const newPassword = 'secure_password';

      await adminSequelize.query(
        `CREATE USER IF NOT EXISTS '${newUser}'@'localhost' IDENTIFIED BY '${newPassword}'`
      );
      console.log(`✅ 创建用户 ${newUser} 成功`);

      // 授予权限
      await adminSequelize.query(
        `GRANT ALL PRIVILEGES ON ${baseDbConfig.database}.* TO '${newUser}'@'localhost' WITH GRANT OPTION`
      );
      await adminSequelize.query('FLUSH PRIVILEGES');
      console.log(`✅ 授予用户 ${newUser} 权限成功`);

      // 关闭管理员连接
      await adminSequelize.close();

      // 保存新用户信息供后续使用
      global.newUser = newUser;
      global.newPassword = newPassword;

      // 使用新用户重新创建连接
      console.log('🔍 使用新用户重新连接数据库...');
      sequelize = new Sequelize(baseDbConfig.database, newUser, newPassword, {
      host: baseDbConfig.host,
      port: baseDbConfig.port,
        dialect: 'mysql',
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        },
        retry: {
          match: [/Deadlock/i],
          name: 'query',
          max: 3
        },
        logging: (msg) => console.log(`[Sequelize] ${msg}`)
      });

      // 测试新连接
      await sequelize.authenticate();
      console.log('✅ 新用户数据库连接成功!');
    } catch (userError) {
      console.error('❌ 创建用户或授予权限失败:', userError.message);
      console.error('用户错误详情:', userError);
      // 继续使用原用户尝试连接
      console.log('🔍 尝试使用原用户连接数据库...');
      try {
        sequelize = createSequelizeInstance(password, baseDbConfig.database);
        await sequelize.authenticate();
        console.log('✅ 原用户数据库连接成功!');
      } catch (authError) {
        console.error('❌ 原用户数据库连接失败:', authError.message);
        console.error('连接错误详情:', authError);
        return false;
      }
    }

    // 检查HengBeGer数据库是否存在
    const [results] = await sequelize.query(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'HengBeGer'"
    );

    if (results.length > 0) {
      console.log('✅ HengBeGer数据库已存在!');
    } else {
      console.log('❌ HengBeGer数据库不存在!');
      // 尝试创建数据库
      try {
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS ${baseDbConfig.database}`);
    console.log(`✅ 已创建数据库 ${baseDbConfig.database}`);
      } catch (err) {
        console.error(`❌ 创建数据库失败: ${err.message}`);
      }
    }

    // 检查用户权限
    const [privileges] = await sequelize.query("SHOW GRANTS FOR CURRENT_USER");
    console.log('当前用户权限:');
    privileges.forEach(grant => {
      console.log(`- ${Object.values(grant)[0]}`);
    });

    await sequelize.close();
    return true;
  } catch (error) {
    console.error('❌ 数据库连接测试失败:', error.message);
    if (error.name === 'SequelizeAccessDeniedError') {
      console.error('❌ 访问被拒绝，请检查用户名和密码是否正确。');
    } else if (error.name === 'SequelizeConnectionRefusedError') {
      console.error('❌ 连接被拒绝，请检查MySQL服务器是否正在运行。');
    } else if (error.name === 'SequelizeConnectionError') {
      console.error('❌ 连接错误，请检查MySQL服务器地址和端口是否正确。');
    }
    console.error('错误详情:', error);
    return false;
  }
};

// 运行初始化
const runInit = async () => {
  try {
    console.log('=== 数据库初始化工具 ===');
    console.log(`数据库配置: ${baseDbConfig.username}@${baseDbConfig.host}:${baseDbConfig.port}`);
  console.log(`目标数据库: ${baseDbConfig.database}`);

    let password;
    let connectionSuccess = false;
    let maxRetries = 3;
    let retryCount = 0;

    // 尝试连接数据库，允许重试
    while (!connectionSuccess && retryCount < maxRetries) {
      password = await askPassword();
      connectionSuccess = await testConnection(password);
      retryCount++;

      if (!connectionSuccess && retryCount < maxRetries) {
        console.log(`
连接失败，还剩 ${maxRetries - retryCount} 次重试机会。
`);
      }
    }

    if (!connectionSuccess) {
      console.error('❌ 多次尝试连接数据库失败，程序退出。');
      rl.close();
      process.exit(1);
    }

    // 设置环境变量
    process.env.DB_PASSWORD = password;
    console.log('✅ 已设置环境变量DB_PASSWORD');

        // 确定要使用的用户（优先使用新创建的用户）
    let finalUsername = baseDbConfig.username;
    let finalPassword = password;
    
    // 如果我们成功创建了新用户，使用新用户
    if (typeof newUser !== 'undefined') {
      finalUsername = newUser;
      finalPassword = newPassword;
      console.log(`🔍 切换到新用户: ${newUser}`);
    }
    
    // 创建数据库连接实例
    const sequelize = new Sequelize(baseDbConfig.database, finalUsername, finalPassword, {
      host: baseDbConfig.host,
      port: baseDbConfig.port,
      dialect: 'mysql',
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      logging: (msg) => console.log(`[Sequelize] ${msg}`)
    });
    
    console.log(`✅ 已使用用户 ${finalUsername} 连接到数据库 ${baseDbConfig.database}`);

    // 重新导入initializeDatabase，因为它依赖于环境变量
    const { initializeDatabase } = await import('./src/db/config.js');

    // 初始化数据库（创建表结构）
    console.log('\n开始初始化数据库...');
    const dbInitialized = await initializeDatabase(sequelize);
    if (!dbInitialized) {
      console.error('❌ 数据库初始化失败，无法继续导入数据。');
      await sequelize.close();
      rl.close();
      process.exit(1);
    }

    // 导入数据
    console.log('🚀 开始导入初始数据...');
    const dataImported = await initializeData(sequelize);
    if (!dataImported) {
      console.error('❌ 数据导入失败，数据库初始化过程中断。');
      await sequelize.close();
      rl.close();
      process.exit(1);
    }

    console.log('✅ 数据导入成功！');
    console.log('\n🎉 数据库初始化和数据导入完成！');
    console.log('✅ 您现在可以启动应用程序并使用数据库了。');
    console.log('💡 提示: 运行 `npm run dev` 启动开发服务器。');
    await sequelize.close();
    rl.close();
  } catch (error) {
    console.error('❌ 数据库初始化过程中发生错误:', error.message);
    console.error('错误详情:', error);
    rl.close();
    process.exit(1);
  }
};

runInit();