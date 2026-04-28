#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function showProgress(step, total, message) {
  const progress = `[${step}/${total}]`;
  colorLog('blue', `${progress} ${message}`);
}

function checkNodeVersion() {
  return new Promise((resolve) => {
    exec('node --version', (error, stdout) => {
      if (error) {
        colorLog('red', '❌ Node.js 未安装');
        resolve(false);
      } else {
        colorLog('green', `✅ Node.js 版本: ${stdout.trim()}`);
        resolve(true);
      }
    });
  });
}

function checkDependencies() {
  const nodeModulesExists = fs.existsSync('node_modules');
  
  if (!nodeModulesExists) {
    colorLog('yellow', '📦 需要安装依赖');
    return false;
  }
  
  colorLog('green', '✅ 依赖已安装');
  return true;
}

function installDependencies() {
  return new Promise((resolve, reject) => {
    colorLog('blue', '正在安装依赖...');
    const npm = spawn('npm', ['install', '--legacy-peer-deps'], {
      stdio: 'inherit',
      shell: true
    });
    
    npm.on('close', (code) => {
      if (code === 0) {
        colorLog('green', '✅ 依赖安装完成');
        resolve();
      } else {
        colorLog('red', '❌ 依赖安装失败');
        reject(new Error('依赖安装失败'));
      }
    });
  });
}

function checkEnvFile() {
  if (!fs.existsSync('.env')) {
    if (fs.existsSync('.env.example')) {
      fs.copyFileSync('.env.example', '.env');
      colorLog('yellow', '📝 已创建 .env 文件，请配置数据库密码');
      colorLog('cyan', `文件位置: ${path.resolve('.env')}`);
    } else {
      colorLog('red', '❌ .env.example 文件不存在');
      return false;
    }
  } else {
    colorLog('green', '✅ 环境配置文件存在');
  }
  return true;
}

function checkMySQLService() {
  return new Promise((resolve) => {
    const isWindows = os.platform() === 'win32';
    const command = isWindows ? 'sc query mysql' : 'systemctl is-active mysql';
    
    exec(command, (error, stdout) => {
      if (error) {
        colorLog('yellow', '⚠️  MySQL 服务状态未知或未运行');
        colorLog('cyan', '提示: 请确保MySQL已安装并启动服务');
        colorLog('cyan', 'Windows: 在服务管理器中启动MySQL服务');
        colorLog('cyan', '或运行: net start mysql');
        colorLog('cyan', '配置完成后运行: npm run init-db 初始化数据库');
        resolve(false);
      } else {
        if (isWindows) {
          const isRunning = stdout.includes('RUNNING');
          if (isRunning) {
            colorLog('green', '✅ MySQL 服务正在运行');
          } else {
            colorLog('yellow', '⚠️  MySQL 服务未运行');
            colorLog('cyan', '请启动MySQL服务: net start mysql');
          }
          resolve(isRunning);
        } else {
          const isActive = stdout.trim() === 'active';
          if (isActive) {
            colorLog('green', '✅ MySQL 服务正在运行');
          } else {
            colorLog('yellow', '⚠️  MySQL 服务未运行');
            colorLog('cyan', '请启动MySQL服务: sudo systemctl start mysql');
          }
          resolve(isActive);
        }
      }
    });
  });
}

function startServices(mode = 'both') {
  colorLog('blue', '🚀 启动服务中...');
  
  let command, args;
  
  switch (mode) {
    case 'frontend':
      command = 'npm';
      args = ['run', 'dev'];
      colorLog('cyan', '启动前端服务: http://localhost:5173/');
      break;
    case 'backend':
      command = 'npm';
      args = ['run', 'server'];
      colorLog('cyan', '启动后端服务: http://localhost:3001/');
      break;
    case 'both':
    default:
      command = 'npm';
      args = ['start'];
      colorLog('cyan', '前端地址: http://localhost:5173/');
      colorLog('cyan', '后端地址: http://localhost:3001/');
      break;
  }
  
  console.log('\n========================================');
  colorLog('green', '服务启动完成！按 Ctrl+C 停止服务');
  console.log('========================================\n');
  
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true
  });
  
  process.on('SIGINT', () => {
    colorLog('yellow', '\n正在停止服务...');
    child.kill('SIGINT');
    process.exit(0);
  });
}

async function main() {
  console.log('========================================');
  colorLog('magenta', '    HengBeGer 项目启动器');
  console.log('========================================\n');
  
  // 解析命令行参数
  const args = process.argv.slice(2);
  const mode = args[0] || 'both';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  node launcher.js [模式]');
    console.log('');
    console.log('模式:');
    console.log('  both      - 启动前端和后端 (默认)');
    console.log('  frontend  - 仅启动前端');
    console.log('  backend   - 仅启动后端');
    console.log('');
    console.log('选项:');
    console.log('  --help, -h  显示帮助信息');
    return;
  }
  
  try {
    // 检查步骤
    showProgress(1, 5, '检查 Node.js 环境...');
    const nodeOk = await checkNodeVersion();
    if (!nodeOk) {
      colorLog('red', '❌ 请先安装 Node.js: https://nodejs.org/');
      process.exit(1);
    }
    colorLog('green', '✅ Node.js 环境检查通过');
    
    showProgress(2, 5, '检查项目依赖...');
    const depsOk = checkDependencies();
    if (!depsOk) {
      colorLog('yellow', '⚠️  正在安装缺失的依赖...');
      await installDependencies();
    }
    colorLog('green', '✅ 项目依赖检查完成');
    
    showProgress(3, 5, '检查环境配置...');
    const envOk = checkEnvFile();
    if (!envOk) {
      process.exit(1);
    }
    colorLog('green', '✅ 环境配置检查完成');
    
    showProgress(4, 5, '检查 MySQL 服务...');
    await checkMySQLService();
    
    showProgress(5, 5, '启动项目服务...');
    startServices(mode);
    
  } catch (error) {
    colorLog('red', `❌ 启动失败: ${error.message}`);
    process.exit(1);
  }
}

// 检查是否为主模块
if (import.meta.url.startsWith('file:')) {
  const modulePath = fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    main();
  }
}

export { main, startServices, checkNodeVersion, checkDependencies };
