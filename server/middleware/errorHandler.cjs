// 统一错误处理中间件
const errorHandler = (err, req, res, next) => {
  // 记录详细错误信息到服务器日志（仅用于调试）
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // 根据错误类型返回适当的响应
  let statusCode = 500;
  let message = '服务器内部错误';

  // 数据库连接错误
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    statusCode = 503;
    message = '数据库连接失败';
  }
  // 数据库查询错误
  else if (err.code && err.code.startsWith('ER_')) {
    statusCode = 400;
    message = '数据操作失败';
  }
  // 验证错误
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = '输入数据验证失败';
  }
  // 权限错误
  else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = '未授权访问';
  }
  // 资源未找到
  else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = '请求的资源不存在';
  }
  // 自定义错误消息（安全的）
  else if (err.isOperational) {
    statusCode = err.statusCode || 400;
    message = err.message;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  });
};

// 创建操作性错误的辅助函数
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 异步错误捕获包装器
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = {
  errorHandler,
  AppError,
  catchAsync
};