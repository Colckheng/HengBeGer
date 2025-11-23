// 通用错误处理工具
import { logger, logError } from './logger.js';

/**
 * 自定义应用错误类
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = 'AppError';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 数据库错误类
 */
export class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, true);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, true);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * 权限错误类
 */
export class AuthorizationError extends AppError {
  constructor(message = '未授权访问') {
    super(message, 401, true);
    this.name = 'AuthorizationError';
  }
}

/**
 * 资源未找到错误类
 */
export class NotFoundError extends AppError {
  constructor(resource = '资源') {
    super(`${resource}不存在`, 404, true);
    this.name = 'NotFoundError';
  }
}

/**
 * 异步错误捕获包装器
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 通用错误处理函数
 */
export const handleError = (error, context = '') => {
  // 记录错误日志
  logError(error, context);
  
  // 根据错误类型返回适当的信息
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      isOperational: error.isOperational
    };
  }
  
  // 数据库相关错误
  if (error.name === 'SequelizeError' || error.name?.startsWith('Sequelize')) {
    return handleDatabaseError(error);
  }
  
  // 其他已知错误类型
  if (error.code) {
    return handleSystemError(error);
  }
  
  // 未知错误
  return {
    statusCode: 500,
    message: '服务器内部错误',
    isOperational: false
  };
};

/**
 * 处理数据库错误
 */
const handleDatabaseError = (error) => {
  logger.error('数据库错误', {
    name: error.name,
    message: error.message,
    sql: error.sql,
    parameters: error.parameters
  });
  
  // 根据具体的数据库错误类型返回用户友好的消息
  if (error.name === 'SequelizeValidationError') {
    return {
      statusCode: 400,
      message: '数据验证失败',
      isOperational: true
    };
  }
  
  if (error.name === 'SequelizeUniqueConstraintError') {
    return {
      statusCode: 409,
      message: '数据已存在，不能重复创建',
      isOperational: true
    };
  }
  
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return {
      statusCode: 400,
      message: '关联数据不存在',
      isOperational: true
    };
  }
  
  if (error.name === 'SequelizeConnectionError') {
    return {
      statusCode: 503,
      message: '数据库连接失败',
      isOperational: true
    };
  }
  
  return {
    statusCode: 500,
    message: '数据库操作失败',
    isOperational: true
  };
};

/**
 * 处理系统错误
 */
const handleSystemError = (error) => {
  logger.error('系统错误', {
    code: error.code,
    message: error.message,
    errno: error.errno,
    syscall: error.syscall
  });
  
  // 根据错误代码返回适当的消息
  switch (error.code) {
    case 'ENOENT':
      return {
        statusCode: 404,
        message: '文件或资源不存在',
        isOperational: true
      };
    case 'EACCES':
      return {
        statusCode: 403,
        message: '权限不足',
        isOperational: true
      };
    case 'ECONNREFUSED':
      return {
        statusCode: 503,
        message: '服务连接被拒绝',
        isOperational: true
      };
    case 'ETIMEDOUT':
      return {
        statusCode: 408,
        message: '请求超时',
        isOperational: true
      };
    default:
      return {
        statusCode: 500,
        message: '系统错误',
        isOperational: false
      };
  }
};

/**
 * Express错误处理中间件
 */
export const errorMiddleware = (err, req, res, next) => {
  const startTime = Date.now();
  
  // 处理错误
  const errorInfo = handleError(err, `${req.method} ${req.path}`);
  
  // 记录API错误日志
  logger.api(req.method, req.path, errorInfo.statusCode, Date.now() - startTime, {
    error: err.message,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  // 返回错误响应
  res.status(errorInfo.statusCode).json({
    success: false,
    error: errorInfo.message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err
    })
  });
};

/**
 * 处理未捕获的异常
 */
export const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常', {
      message: error.message,
      stack: error.stack
    });
    
    // 优雅关闭应用
    process.exit(1);
  });
};

/**
 * 处理未处理的Promise拒绝
 */
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString()
    });
    
    // 优雅关闭应用
    process.exit(1);
  });
};

/**
 * 初始化全局错误处理
 */
export const initializeErrorHandling = () => {
  handleUncaughtException();
  handleUnhandledRejection();
  
  logger.info('全局错误处理已初始化');
};

/**
 * 创建带有错误处理的异步函数包装器
 */
export const withErrorHandling = (fn, context = '') => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const errorInfo = handleError(error, context);
      throw new AppError(errorInfo.message, errorInfo.statusCode);
    }
  };
};

/**
 * 验证数据的辅助函数
 */
export const validateRequired = (data, requiredFields) => {
  const missingFields = [];
  
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      missingFields.push(field);
    }
  }
  
  if (missingFields.length > 0) {
    throw new ValidationError(`缺少必填字段: ${missingFields.join(', ')}`);
  }
};

/**
 * 验证数据类型的辅助函数
 */
export const validateTypes = (data, typeMap) => {
  for (const [field, expectedType] of Object.entries(typeMap)) {
    if (data[field] !== undefined && typeof data[field] !== expectedType) {
      throw new ValidationError(`字段 ${field} 类型错误，期望 ${expectedType}，实际 ${typeof data[field]}`);
    }
  }
};