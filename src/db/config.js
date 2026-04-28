import { config as loadEnv } from 'dotenv';
import { Sequelize } from 'sequelize';
import process from 'process';

import { logger } from '../utils/logger.js';
import {
  createSecureDbConfig,
  securityManager,
  validateEnvironmentSecurity,
} from '../utils/security.js';

loadEnv();

const isTest = process.env.NODE_ENV === 'test';

export const baseDbConfig = {
  database: process.env.DB_NAME || 'hengbeger',
  username: process.env.DB_USER || 'root',
  host: process.env.DB_HOST || 'localhost',
  dialect: 'mysql',
  port: Number.parseInt(process.env.DB_PORT || '3306', 10),
  retryAttempts: 3,
  retryDelay: 2000,
};

export function createSequelizeInstance(username, password) {
  if (!password) {
    throw new Error('DB_PASSWORD is required to create the MySQL connection.');
  }

  const config = createSecureDbConfig({
    ...baseDbConfig,
    username,
    password,
  });

  const sanitizedConfig = securityManager.sanitizeForLogging(config);
  logger.info('Database configuration loaded', {
    database: sanitizedConfig.database,
    username: sanitizedConfig.username,
    host: `${sanitizedConfig.host}:${sanitizedConfig.port}`,
  });

  return new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    dialect: config.dialect,
    port: config.port,
    logging: (message) => logger.debug(`Sequelize: ${message}`),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: {
      connectTimeout: 10000,
      charset: 'utf8mb4',
    },
    define: {
      charset: 'utf8mb4',
    },
  });
}

const securityValidation = isTest
  ? { isSecure: true, issues: [] }
  : validateEnvironmentSecurity();

if (!securityValidation.isSecure) {
  securityManager.logSecurityEvent('Environment security validation failed', {
    issues: securityValidation.issues,
  });

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Production security validation failed: ${securityValidation.issues.join(', ')}`,
    );
  }

  securityValidation.issues.forEach((issue) => {
    logger.warn(`Security warning: ${issue}`);
  });
}

export const sequelize = !isTest && process.env.DB_PASSWORD
  ? createSequelizeInstance(baseDbConfig.username, process.env.DB_PASSWORD)
  : null;
