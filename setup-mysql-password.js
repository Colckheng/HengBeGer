#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('========================================');
console.log('    MySQL密码配置助手');
console.log('========================================');
console.log('');
console.log('此工具将帮助您配置.env文件中的MySQL密码');
console.log('请确保您知道MySQL root用户的密码');
console.log('');

rl.question('请输入您的MySQL root密码: ', (password) => {
  if (!password.trim()) {
    console.log('❌ 密码不能为空');
    rl.close();
    return;
  }

  const envPath = path.join(__dirname, '.env');
  
  try {
    // 读取现有的.env文件
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // 替换密码
    envContent = envContent.replace(
      /DB_PASSWORD=.*/,
      `DB_PASSWORD=${password}`
    );
    
    // 写回文件
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ MySQL密码配置成功!');
    console.log('现在可以运行以下命令:');
    console.log('1. npm run init-db        # 初始化数据库');
    console.log('2. npm run launch         # 启动项目');
    console.log('3. npm start              # 传统方式启动项目');
    
  } catch (error) {
    console.error('❌ 配置失败:', error.message);
  }
  
  rl.close();
});