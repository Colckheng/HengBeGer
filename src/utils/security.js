/**
 * 安全工具模块
 * 处理密码、敏感信息的安全操作
 */

import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * 安全配置类
 */
export class SecurityManager {
  constructor() {
    this.sensitiveFields = new Set([
      'password', 'secret', 'key', 'token', 'auth', 'credential',
      'pass', 'pwd', 'authentication', 'authorization', 'session'
    ]);
  }

  /**
   * 检查字段是否为敏感信息
   * @param {string} fieldName - 字段名
   * @returns {boolean}
   */
  isSensitiveField(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') return false;
    
    const lowerField = fieldName.toLowerCase();
    return this.sensitiveFields.has(lowerField) || 
           Array.from(this.sensitiveFields).some(sensitive => 
             lowerField.includes(sensitive)
           );
  }

  /**
   * 掩码敏感信息
   * @param {string} value - 原始值
   * @param {number} visibleChars - 可见字符数（默认0）
   * @returns {string}
   */
  maskSensitiveData(value, visibleChars = 0) {
    if (!value || typeof value !== 'string') return '***';
    
    if (value.length <= visibleChars) {
      return '*'.repeat(Math.max(3, value.length));
    }
    
    if (visibleChars === 0) {
      return '*****';
    }
    
    const visible = value.substring(0, visibleChars);
    const masked = '*'.repeat(Math.max(3, value.length - visibleChars));
    return visible + masked;
  }

  /**
   * 清理对象中的敏感信息（用于日志记录）
   * @param {Object} obj - 要清理的对象
   * @param {number} visibleChars - 敏感字段可见字符数
   * @returns {Object} 清理后的对象
   */
  sanitizeForLogging(obj, visibleChars = 0) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = this.maskSensitiveData(String(value), visibleChars);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value, visibleChars);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * 验证密码强度
   * @param {string} password - 密码
   * @returns {Object} 验证结果
   */
  validatePasswordStrength(password) {
    if (!password || typeof password !== 'string') {
      return {
        isValid: false,
        score: 0,
        issues: ['密码不能为空']
      };
    }

    const issues = [];
    let score = 0;

    // 长度检查
    if (password.length < 8) {
      issues.push('密码长度至少8位');
    } else {
      score += 1;
    }

    // 复杂度检查
    if (!/[a-z]/.test(password)) {
      issues.push('密码应包含小写字母');
    } else {
      score += 1;
    }

    if (!/[A-Z]/.test(password)) {
      issues.push('密码应包含大写字母');
    } else {
      score += 1;
    }

    if (!/\d/.test(password)) {
      issues.push('密码应包含数字');
    } else {
      score += 1;
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      issues.push('密码应包含特殊字符');
    } else {
      score += 1;
    }

    // 常见弱密码检查
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'root', 'user', '111111'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      issues.push('不能使用常见弱密码');
      score = 0;
    }

    return {
      isValid: issues.length === 0,
      score,
      issues,
      strength: this.getPasswordStrengthLabel(score)
    };
  }

  /**
   * 获取密码强度标签
   * @param {number} score - 密码得分
   * @returns {string}
   */
  getPasswordStrengthLabel(score) {
    if (score <= 1) return '很弱';
    if (score <= 2) return '弱';
    if (score <= 3) return '中等';
    if (score <= 4) return '强';
    return '很强';
  }

  /**
   * 生成安全的随机密码
   * @param {number} length - 密码长度
   * @param {Object} options - 选项
   * @returns {string}
   */
  generateSecurePassword(length = 12, options = {}) {
    const {
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeSimilar = true
    } = options;

    let charset = '';
    
    if (includeLowercase) {
      charset += excludeSimilar ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
    }
    
    if (includeUppercase) {
      charset += excludeSimilar ? 'ABCDEFGHJKMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    
    if (includeNumbers) {
      charset += excludeSimilar ? '23456789' : '0123456789';
    }
    
    if (includeSymbols) {
      charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    }

    if (!charset) {
      throw new Error('至少需要选择一种字符类型');
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }

    return password;
  }

  /**
   * 安全地比较两个字符串（防止时序攻击）
   * @param {string} a - 字符串A
   * @param {string} b - 字符串B
   * @returns {boolean}
   */
  secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }
    
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * 记录安全事件
   * @param {string} event - 事件类型
   * @param {Object} details - 事件详情
   */
  logSecurityEvent(event, details = {}) {
    const sanitizedDetails = this.sanitizeForLogging(details);
    logger.warn(`安全事件: ${event}`, {
      event,
      timestamp: new Date().toISOString(),
      ...sanitizedDetails
    });
  }
}

// 创建全局安全管理器实例
export const securityManager = new SecurityManager();

/**
 * 环境变量安全检查
 */
export function validateEnvironmentSecurity() {
  const issues = [];
  if (process.env.SECURITY_SILENCE === 'true') {
    return { isSecure: true, issues: [] };
  }
  
  // 检查数据库密码
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword) {
    issues.push('DB_PASSWORD 环境变量未设置');
  } else if (dbPassword === 'password' || dbPassword === 'your_mysql_password_here') {
    issues.push('DB_PASSWORD 使用了默认值，存在安全风险');
  } else {
    const passwordValidation = securityManager.validatePasswordStrength(dbPassword);
    if (!passwordValidation.isValid) {
      issues.push(`DB_PASSWORD 强度不足: ${passwordValidation.issues.join(', ')}`);
    }
  }
  
  // 检查生产环境配置
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DB_HOST === 'localhost') {
      issues.push('生产环境不应使用 localhost 作为数据库主机');
    }
    
    if (!process.env.DB_USER || process.env.DB_USER === 'root') {
      issues.push('生产环境不应使用 root 用户连接数据库');
    }
  }
  
  return {
    isSecure: issues.length === 0,
    issues
  };
}

/**
 * 安全的数据库配置创建器
 * @param {Object} config - 配置对象
 * @returns {Object} 安全的配置对象
 */
export function createSecureDbConfig(config) {
  const secureConfig = { ...config };
  
  // 验证必要字段
  if (!secureConfig.password) {
    securityManager.logSecurityEvent('数据库密码缺失', { config: securityManager.sanitizeForLogging(config) });
    throw new Error('数据库密码不能为空');
  }
  
  // 在非开发环境下验证密码强度
  if (process.env.NODE_ENV !== 'development' && process.env.SECURITY_SILENCE !== 'true') {
    const passwordValidation = securityManager.validatePasswordStrength(secureConfig.password);
    if (!passwordValidation.isValid) {
      securityManager.logSecurityEvent('数据库密码强度不足', {
        issues: passwordValidation.issues,
        strength: passwordValidation.strength
      });
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`数据库密码强度不足: ${passwordValidation.issues.join(', ')}`);
      }
    }
  }
  
  return secureConfig;
}