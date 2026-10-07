import process from 'process';

import storageBackupManager from '../src/db/storageBackupManager.js';

const printUsage = () => {
  console.log(`
Usage:
  npm run restore-storage -- --type <storageType> --file <backupFile>

Example:
  npm run restore-storage -- --type agents --file src/db/storage/backup/agents_2026-04-06T00-00-00-000Z.json

Notes:
  - This restores storage snapshots only. It does not restore database records.
  - The backup file must be a root storage backup with payload source "database".
  `);
};

const parseArgs = (argv) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--help' || current === '-h') {
      parsed.help = true;
      continue;
    }

    if (current === '--type') {
      parsed.type = next;
      index += 1;
      continue;
    }

    if (current === '--file') {
      parsed.file = next;
      index += 1;
      continue;
    }

    if (current === '--skip-web-sync') {
      parsed.skipWebSync = true;
    }
  }

  return parsed;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.type || !args.file) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const result = await storageBackupManager.restoreRootFromBackup({
    type: args.type,
    backupFilePath: args.file,
    syncWeb: args.skipWebSync !== true,
  });

  console.log('Restore completed.');
  console.log(`Type: ${result.type}`);
  console.log(`Restored records: ${result.restoredCount}`);
  console.log(`Backup file: ${result.backupFilePath}`);
  console.log(`Root storage: ${result.rootFilePath}`);

  if (result.preRestoreBackupPath) {
    console.log(`Pre-restore backup: ${result.preRestoreBackupPath}`);
  }

  if (result.syncWeb && result.webFilePath) {
    console.log(`Web storage refreshed: ${result.webFilePath}`);
  }

  console.log('Warning: this command restores storage snapshots only and does not roll back MySQL data.');
  console.log('Warning: local storage files are re-synced from MySQL on the next server restart; apply persistent rollbacks at the database layer.');
};

main().catch((error) => {
  console.error(`Restore failed: ${error.message}`);
  process.exitCode = 1;
});
