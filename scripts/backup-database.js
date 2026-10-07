#!/usr/bin/env node
import { createDatabaseBackup } from '../src/db/databaseBackup.js';

const { filePath, sizeBytes } = await createDatabaseBackup({ reason: 'manual' });
console.log(`Backup written: ${filePath} (${sizeBytes} bytes)`);
