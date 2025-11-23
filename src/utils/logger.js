// 统一日志记录工具
import fs from 'fs';
import path from 'path';

/**
 * 日志级别枚举
 */
export const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

/**
 * 日志记录器类
 */
class Logger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || LogLevel.INFO;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile || false;
    this.logDir = options.logDir || './logs';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    // 确保日志目录存在
    if (this.enableFile) {
      this.ensureLogDir();
    }
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('创建日志目录失败:', error.message);
    }
  }

  /**
   * 格式化日志消息
   */
  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    
    // 安全处理上下文信息，自动掩码敏感数据
    let sanitizedContext = context;
    if (Object.keys(context).length > 0) {
      // 使用基本的敏感信息掩码（避免循环依赖）
      sanitizedContext = this.basicSanitize(context);
    }
    
    const contextStr = Object.keys(sanitizedContext).length > 0 ? ` | ${JSON.stringify(sanitizedContext)}` : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  /**
   * 基本的敏感信息清理（备用方案）
   */
  basicSanitize(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sensitiveFields = ['password', 'secret', 'key', 'token', 'auth', 'credential'];
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
      
      if (isSensitive) {
        sanitized[key] = typeof value === 'string' && value ? '*****' : '***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.basicSanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * 写入文件日志
   */
  writeToFile(level, formattedMessage) {
    if (!this.enableFile) return;

    try {
      const logFile = path.join(this.logDir, `${level.toLowerCase()}.log`);
      
      // 检查文件大小，如果超过限制则轮转
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxFileSize) {
          this.rotateLogFile(logFile);
        }
      }
      
      fs.appendFileSync(logFile, formattedMessage + '\n');
    } catch (error) {
      console.error('写入日志文件失败:', error.message);
    }
  }

  /**
   * 轮转日志文件
   */
  rotateLogFile(logFile) {
    try {
      const ext = path.extname(logFile);
      const basename = path.basename(logFile, ext);
      const dirname = path.dirname(logFile);
      
      // 删除最旧的文件
      const oldestFile = path.join(dirname, `${basename}.${this.maxFiles}${ext}`);
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }
      
      // 重命名现有文件
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const currentFile = path.join(dirname, `${basename}.${i}${ext}`);
        const nextFile = path.join(dirname, `${basename}.${i + 1}${ext}`);
        if (fs.existsSync(currentFile)) {
          fs.renameSync(currentFile, nextFile);
        }
      }
      
      // 重命名当前文件
      const firstBackup = path.join(dirname, `${basename}.1${ext}`);
      fs.renameSync(logFile, firstBackup);
    } catch (error) {
      console.error('轮转日志文件失败:', error.message);
    }
  }

  /**
   * 通用日志记录方法
   */
  log(level, message, context = {}) {
    const formattedMessage = this.formatMessage(level, message, context);
    
    // 控制台输出
    if (this.enableConsole) {
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }
    
    // 文件输出
    this.writeToFile(level, formattedMessage);
  }

  /**
   * 错误日志
   */
  error(message, context = {}) {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * 警告日志
   */
  warn(message, context = {}) {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * 信息日志
   */
  info(message, context = {}) {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * 调试日志
   */
  debug(message, context = {}) {
    if (this.logLevel === LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, message, context);
    }
  }

  /**
   * 数据库操作日志
   */
  database(operation, details = {}) {
    this.info(`数据库操作: ${operation}`, {
      type: 'database',
      operation,
      ...details
    });
  }

  /**
   * API请求日志
   */
  api(method, path, statusCode, duration, details = {}) {
    const level = statusCode >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    this.log(level, `API请求: ${method} ${path}`, {
      type: 'api',
      method,
      path,
      statusCode,
      duration,
      ...details
    });
  }

  /**
   * 性能监控日志
   */
  performance(operation, duration, details = {}) {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.INFO;
    this.log(level, `性能监控: ${operation} 耗时 ${duration}ms`, {
      type: 'performance',
      operation,
      duration,
      ...details
    });
  }

  /**
   * 安全相关日志
   */
  security(event, details = {}) {
    this.error(`安全事件: ${event}`, {
      type: 'security',
      event,
      ...details
    });
  }
}

// 创建默认日志记录器实例
export const logger = new Logger({
  logLevel: process.env.LOG_LEVEL || LogLevel.INFO,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  logDir: './logs'
});

// 导出Logger类供自定义使用
export { Logger };

// 便捷的错误处理函数
export const logError = (error, context = '') => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code
  };
  
  if (context) {
    errorInfo.context = context;
  }
  
  logger.error('应用错误', errorInfo);
};

// 便捷的性能监控函数
export const logPerformance = (operation, startTime, details = {}) => {
  const duration = Date.now() - startTime;
  logger.performance(operation, duration, details);
};

// 便捷的数据库操作日志函数
export const logDatabase = (operation, details = {}) => {
  logger.database(operation, details);
};

// 便捷的API日志函数
export const logAPI = (req, res, startTime) => {
  const duration = Date.now() - startTime;
  logger.api(req.method, req.path, res.statusCode, duration, {
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
};