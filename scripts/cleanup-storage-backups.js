import process from 'process';

import storageBackupManager from '../src/db/storageBackupManager.js';

const printUsage = () => {
  console.log(`
Usage:
  npm run cleanup-storage-backups -- [--keep <count>] [--prefix <group>] [--dry-run]

Examples:
  npm run cleanup-storage-backups -- --dry-run
  npm run cleanup-storage-backups -- --keep 5
  npm run cleanup-storage-backups -- --prefix agents --keep 3

Notes:
  - Backups are grouped by filename prefix.
  - Each group keeps the most recent N files.
  - --dry-run prints the cleanup plan without deleting files.
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

    if (current === '--keep') {
      parsed.keep = next;
      index += 1;
      continue;
    }

    if (current === '--prefix') {
      parsed.prefix = next;
      index += 1;
      continue;
    }

    if (current === '--dry-run') {
      parsed.dryRun = true;
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

  const result = await storageBackupManager.cleanupBackups({
    keep: args.keep === undefined ? 10 : Number(args.keep),
    prefix: args.prefix,
    dryRun: args.dryRun === true,
  });

  console.log(`Backup directory: ${result.backupDirectory}`);
  console.log(`Scanned files: ${result.scannedFiles}`);
  console.log(`Retention per group: ${result.keep}`);
  if (result.prefix) {
    console.log(`Filtered prefix: ${result.prefix}`);
  }
  console.log(`Mode: ${result.dryRun ? 'dry-run' : 'delete'}`);

  if (result.groups.length === 0) {
    console.log('No matching backup groups found.');
    return;
  }

  for (const group of result.groups) {
    console.log(`Group ${group.prefix}: total=${group.total}, keep=${group.keep}, delete=${group.deleteFiles.length}`);
    if (group.deleteFiles.length > 0) {
      for (const fileName of group.deleteFiles) {
        console.log(`  - ${fileName}`);
      }
    }
  }

  console.log(`${result.dryRun ? 'Would delete' : 'Deleted'} ${result.deleteCandidates.length} file(s).`);
};

main().catch((error) => {
  console.error(`Cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
