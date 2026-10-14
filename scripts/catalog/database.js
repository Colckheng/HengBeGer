import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { normalizeRows } from './data.js';

export async function connectCatalog() {
  config({ quiet: true });
  if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD is required');
  return mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'hengbeger', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD,
    charset: 'utf8mb4', connectTimeout: 5000 });
}
export async function ensureCatalog(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS catalog_entries (
    entry_key VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY,
    category VARCHAR(96) COLLATE utf8mb4_bin NOT NULL,
    name VARCHAR(255) NOT NULL, payload JSON NOT NULL,
    content_hash CHAR(64) NOT NULL, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_catalog_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
  await connection.query(`CREATE TABLE IF NOT EXISTS catalog_assets (
    hash CHAR(64) PRIMARY KEY, image LONGTEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=ascii`);
}
export async function readRows(connection, lock = false) {
  try {
    const [rows] = await connection.query(`SELECT entry_key AS \`key\`, category, name, payload, content_hash AS contentHash FROM catalog_entries ORDER BY entry_key${lock ? ' FOR UPDATE' : ''}`);
    return normalizeRows(rows);
  } catch (e) { if (!lock && e.code === 'ER_NO_SUCH_TABLE') return []; throw e; }
}
export async function targetIdentity(connection) {
  const [[row]] = await connection.query('SELECT DATABASE() AS db, @@server_uuid AS server');
  if (!row.db) throw new Error('No target database selected');
  return row;
}
export async function putRow(connection, row) {
  await connection.execute(`INSERT INTO catalog_entries(entry_key,category,name,payload,content_hash) VALUES(?,?,?,?,?)
    ON DUPLICATE KEY UPDATE category=VALUES(category),name=VALUES(name),payload=VALUES(payload),content_hash=VALUES(content_hash)`,
  [row.key, row.category, row.name, JSON.stringify(row.payload), row.contentHash]);
}
