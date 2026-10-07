import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { DualStorageManager } from './dualStorageManager.js';

const tempStorageDirs = [];

const createTempStoragePath = () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengbeger-dual-'));
  tempStorageDirs.push(tempDir);
  return tempDir;
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
};

const payloadOf = (type, data, source) => ({
  version: '2.0.0',
  lastUpdated: new Date().toISOString(),
  dataType: type,
  count: data.length,
  source,
  data,
});

afterEach(() => {
  while (tempStorageDirs.length > 0) {
    fs.rmSync(tempStorageDirs.pop(), { recursive: true, force: true });
  }
});

describe('DualStorageManager missing-file semantics', () => {
  it('returns null from readPayload when the file does not exist', async () => {
    const storagePath = createTempStoragePath();
    const manager = new DualStorageManager({ storagePath });

    const payload = await manager.readPayload(
      path.join(storagePath, 'web', 'hsrCharacters.json'),
    );

    expect(payload).toBeNull();
  });

  it('still serves an empty array for a missing web payload', async () => {
    const storagePath = createTempStoragePath();
    const manager = new DualStorageManager({ storagePath });

    expect(await manager.readFromWebStorage('hsrCones')).toEqual([]);
  });

  it('syncs root snapshots into web storage files with backups', async () => {
    const storagePath = createTempStoragePath();
    const manager = new DualStorageManager({ storagePath });

    writeJson(
      path.join(storagePath, 'web', 'agents.json'),
      payloadOf('agents', [{ id: 1, name: 'Old' }], 'web'),
    );

    const results = await manager.syncRootToWeb({
      agents: [{ id: 2, name: 'New' }],
      hsrCharacters: [{ id: 1, name: 'March 7th' }],
    });

    expect(results.agents.count).toBe(1);
    expect(await manager.readFromWebStorage('agents')).toEqual([{ id: 2, name: 'New' }]);
    expect(await manager.readFromWebStorage('hsrCharacters')).toEqual([
      { id: 1, name: 'March 7th' },
    ]);
    expect(
      fs.readdirSync(path.join(storagePath, 'backup'))
        .some((file) => file.startsWith('web_agents_')),
    ).toBe(true);
  });
});
