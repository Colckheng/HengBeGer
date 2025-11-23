#!/usr/bin/env node
/**
 * 安全配置检查脚本
 * 用于验证项目的安全配置
 */

import { config } from 'dotenv';
import { securityManager, validateEnvironmentSecurity } from './src/utils/security.js';
import { logger } from './src/utils/logger.js';

// 加载环境变量
config();

/**
 * 执行安全检查
 */
async function runSecurityCheck() {
  console.log('🔒 开始安全配置检查...');
  console.log('=' .repeat(50));
  
  let hasIssues = false;
  
  try {
    // 1. 环境变量安全检查
    console.log('\n📋 检查环境变量配置...');
    const envValidation = validateEnvironmentSecurity();
    
    if (envValidation.isSecure) {
      console.log('✅ 环境变量配置安全');
    } else {
      console.log('❌ 环境变量配置存在安全问题:');
      envValidation.issues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
      hasIssues = true;
    }
    
    // 2. 密码强度检查
    console.log('\n🔐 检查密码强度...');
    const dbPassword = process.env.DB_PASSWORD;
    
    if (dbPassword) {
      const passwordValidation = securityManager.validatePasswordStrength(dbPassword);
      console.log(`   密码强度: ${passwordValidation.strength} (得分: ${passwordValidation.score}/5)`);
      
      if (passwordValidation.isValid) {
        console.log('✅ 数据库密码强度符合要求');
      } else {
        console.log('❌ 数据库密码强度不足:');
        passwordValidation.issues.forEach(issue => {
          console.log(`   - ${issue}`);
        });
        hasIssues = true;
      }
    } else {
      console.log('❌ 数据库密码未设置');
      hasIssues = true;
    }
    
    // 3. 生产环境特殊检查
    if (process.env.NODE_ENV === 'production') {
      console.log('\n🏭 生产环境安全检查...');
      
      const productionIssues = [];
      
      // 检查数据库配置
      if (process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1') {
        productionIssues.push('数据库主机不应使用 localhost');
      }
      
      if (process.env.DB_USER === 'root') {
        productionIssues.push('不应使用 root 用户连接数据库');
      }
      
      if (process.env.PORT === '3000' || process.env.PORT === '3001') {
        productionIssues.push('生产环境应使用标准端口 (80/443)');
      }
      
      if (productionIssues.length === 0) {
        console.log('✅ 生产环境配置安全');
      } else {
        console.log('❌ 生产环境配置存在问题:');
        productionIssues.forEach(issue => {
          console.log(`   - ${issue}`);
        });
        hasIssues = true;
      }
    }
    
    // 4. 文件权限检查（仅在非Windows系统）
    if (process.platform !== 'win32') {
      console.log('\n📁 检查敏感文件权限...');
      
      const sensitiveFiles = ['.env', 'server/index.cjs'];
      const fs = await import('fs');
      
      for (const file of sensitiveFiles) {
        try {
          const stats = fs.statSync(file);
          const mode = stats.mode & parseInt('777', 8);
          
          if (mode & parseInt('044', 8)) {
            console.log(`❌ ${file} 对其他用户可读，存在安全风险`);
            hasIssues = true;
          } else {
            console.log(`✅ ${file} 权限设置安全`);
          }
        } catch (error) {
          console.log(`⚠️  无法检查 ${file} 的权限: ${error.message}`);
        }
      }
    }
    
    // 5. 依赖安全检查建议
    console.log('\n📦 依赖安全建议...');
    console.log('   建议定期运行以下命令检查依赖漏洞:');
    console.log('   - npm audit');
    console.log('   - npm audit fix');
    
    // 总结
    console.log('\n' + '=' .repeat(50));
    if (hasIssues) {
      console.log('❌ 安全检查发现问题，请根据上述建议进行修复');
      
      if (process.env.NODE_ENV === 'production') {
        console.log('⚠️  生产环境存在安全风险，强烈建议立即修复');
        process.exit(1);
      }
    } else {
      console.log('✅ 安全检查通过，配置符合安全要求');
    }
    
  } catch (error) {
    console.error('❌ 安全检查过程中发生错误:', error.message);
    logger.error('安全检查失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * 生成安全密码的辅助函数
 */
function generateSecurePassword() {
  console.log('\n🔑 生成安全密码建议...');
  
  try {
    const password = securityManager.generateSecurePassword(16, {
      includeUppercase: true,
      includeLowercase: true,
      includeNumbers: true,
      includeSymbols: true,
      excludeSimilar: true
    });
    
    console.log('建议使用以下安全密码:');
    console.log(`${password}`);
    console.log('\n请将此密码保存到安全的地方，并设置为 DB_PASSWORD 环境变量');
    
    const validation = securityManager.validatePasswordStrength(password);
    console.log(`密码强度: ${validation.strength} (${validation.score}/5)`);
    
  } catch (error) {
    console.error('生成密码时发生错误:', error.message);
  }
}

// 处理命令行参数
const args = process.argv.slice(2);

if (args.includes('--generate-password')) {
  generateSecurePassword();
} else {
  runSecurityCheck();
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
使用方法:
  node security-check.js                 # 运行安全检查
  node security-check.js --generate-password  # 生成安全密码
  node security-check.js --help          # 显示帮助信息
`);
}