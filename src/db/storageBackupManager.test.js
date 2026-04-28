import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { StorageBackupManager } from './storageBackupManager.js';

const tempStorageDirs = [];

const createTempStoragePath = () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengbeger-storage-'));
  tempStorageDirs.push(tempDir);
  fs.mkdirSync(path.join(tempDir, 'backup'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'web'), { recursive: true });
  return tempDir;
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
};

afterEach(() => {
  while (tempStorageDirs.length > 0) {
    const tempDir = tempStorageDirs.pop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('StorageBackupManager', () => {
  it('restores root storage from a root backup and refreshes web storage', async () => {
    const storagePath = createTempStoragePath();
    const manager = new StorageBackupManager({ storagePath });

    const currentRootPayload = {
      version: '2.0.0',
      lastUpdated: '2026-04-06T00:00:00.000Z',
      dataType: 'agents',
      count: 1,
      source: 'database',
      data: [{ id: 99, name: 'Old Agent' }],
    };
    const backupPayload = {
      version: '2.0.0',
      lastUpdated: '2026-04-06T01:00:00.000Z',
      dataType: 'agents',
      count: 2,
      source: 'database',
      data: [
        { id: 1, name: 'Anby' },
        { id: 2, name: 'Billy' },
      ],
    };

    const rootFilePath = path.join(storagePath, 'agents.json');
    const webFilePath = path.join(storagePath, 'web', 'agents.json');
    const backupFilePath = path.join(storagePath, 'backup', 'agents_restore_point.json');

    writeJson(rootFilePath, currentRootPayload);
    writeJson(webFilePath, {
      ...currentRootPayload,
      source: 'web',
      lastSyncFromRoot: '2026-04-06T00:00:00.000Z',
    });
    writeJson(backupFilePath, backupPayload);

    const result = await manager.restoreRootFromBackup({
      type: 'agents',
      backupFilePath,
    });

    const restoredRootPayload = JSON.parse(fs.readFileSync(rootFilePath, 'utf-8'));
    const refreshedWebPayload = JSON.parse(fs.readFileSync(webFilePath, 'utf-8'));
    const backupDirEntries = fs.readdirSync(path.join(storagePath, 'backup'));

    expect(result.type).toBe('agents');
    expect(result.restoredCount).toBe(2);
    expect(restoredRootPayload).toEqual(backupPayload);
    expect(refreshedWebPayload.data).toEqual(backupPayload.data);
    expect(refreshedWebPayload.source).toBe('web');
    expect(refreshedWebPayload.count).toBe(2);
    expect(refreshedWebPayload).toHaveProperty('lastSyncFromRoot');
    expect(
      backupDirEntries.some((entry) => entry.startsWith('restore_before_agents_')),
    ).toBe(true);
  });

  it('rejects backups that do not come from root storage', async () => {
    const storagePath = createTempStoragePath();
    const manager = new StorageBackupManager({ storagePath });

    const rootFilePath = path.join(storagePath, 'agents.json');
    const invalidBackupFilePath = path.join(storagePath, 'backup', 'web_agents_snapshot.json');

    writeJson(rootFilePath, {
      version: '2.0.0',
      lastUpdated: '2026-04-06T00:00:00.000Z',
      dataType: 'agents',
      count: 1,
      source: 'database',
      data: [{ id: 99, name: 'Old Agent' }],
    });
    writeJson(invalidBackupFilePath, {
      version: '2.0.0',
      lastUpdated: '2026-04-06T01:00:00.000Z',
      dataType: 'agents',
      count: 1,
      source: 'web',
      data: [{ id: 1, name: 'Anby' }],
    });

    await expect(manager.restoreRootFromBackup({
      type: 'agents',
      backupFilePath: invalidBackupFilePath,
    })).rejects.toThrow('Only root storage backups can be restored.');

    const rootPayloadAfterFailure = JSON.parse(fs.readFileSync(rootFilePath, 'utf-8'));
    expect(rootPayloadAfterFailure.data).toEqual([{ id: 99, name: 'Old Agent' }]);
  });

  it('dry-run cleanup keeps files untouched while reporting candidates', async () => {
    const storagePath = createTempStoragePath();
    const manager = new StorageBackupManager({ storagePath });

    const backupDir = path.join(storagePath, 'backup');
    writeJson(path.join(backupDir, 'agents_2026-04-06T00-00-00-000Z.json'), { data: [] });
    writeJson(path.join(backupDir, 'agents_2026-04-06T00-00-01-000Z.json'), { data: [] });
    writeJson(path.join(backupDir, 'agents_2026-04-06T00-00-02-000Z.json'), { data: [] });

    const result = await manager.cleanupBackups({
      keep: 1,
      dryRun: true,
    });

    expect(result.deleteCandidates.map((entry) => entry.fileName)).toEqual([
      'agents_2026-04-06T00-00-01-000Z.json',
      'agents_2026-04-06T00-00-00-000Z.json',
    ]);
    expect(fs.readdirSync(backupDir).sort()).toEqual([
      'agents_2026-04-06T00-00-00-000Z.json',
      'agents_2026-04-06T00-00-01-000Z.json',
      'agents_2026-04-06T00-00-02-000Z.json',
    ]);
  });

  it('cleanup deletes older backups and keeps the latest N per prefix', async () => {
    const storagePath = createTempStoragePath();
    const manager = new StorageBackupManager({ storagePath });

    const backupDir = path.join(storagePath, 'backup');
    writeJson(path.join(backupDir, 'agents_2026-04-06T00-00-00-000Z.json'), { data: [] });
    writeJson(path.join(backupDir, 'agents_2026-04-06T00-00-01-000Z.json'), { data: [] });
    writeJson(path.join(backupDir, 'agents_2026-04-06T00-00-02-000Z.json'), { data: [] });
    writeJson(path.join(backupDir, 'web_agents_2026-04-06T00-00-00-000Z.json'), { data: [] });
    writeJson(path.join(backupDir, 'web_agents_2026-04-06T00-00-01-000Z.json'), { data: [] });
    writeJson(path.join(backupDir, 'notes.txt'), 'ignored');

    const result = await manager.cleanupBackups({
      keep: 1,
    });

    expect(result.deletedFiles.sort()).toEqual([
      'agents_2026-04-06T00-00-00-000Z.json',
      'agents_2026-04-06T00-00-01-000Z.json',
      'web_agents_2026-04-06T00-00-00-000Z.json',
    ]);
    expect(fs.readdirSync(backupDir).sort()).toEqual([
      'agents_2026-04-06T00-00-02-000Z.json',
      'notes.txt',
      'web_agents_2026-04-06T00-00-01-000Z.json',
    ]);
  });
});
