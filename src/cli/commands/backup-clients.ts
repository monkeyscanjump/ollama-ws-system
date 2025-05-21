/**
 * Client Database Backup Command
 *
 * Creates backups of the authorized clients database and manages
 * backup rotation to prevent excessive disk usage.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Interface as ReadlineInterface } from 'readline';
import { ensureDir } from '../utils/fs';
import { generateRandomId } from '../utils/crypto';
import { createCommandHandler } from '../utils/cli';
import { dirs, files, defaults } from '../config';
import logger from '../utils/logger';
import { listClients } from '../utils/client-manager';
import { CommandHelp, BackupMetadata } from '../types';

/**
 * Create a backup of the clients database
 */
function backupClients(clientsFile: string, backupDir: string): string | false {
  try {
    // Check if source file exists
    if (!fs.existsSync(clientsFile)) {
      logger.error(`Clients database file not found: ${clientsFile}`);
      return false;
    }

    // Ensure backup directory exists
    ensureDir(backupDir);

    // Get clients using client manager
    const clients = listClients(clientsFile);
    if (!clients) {
      logger.error(`Failed to load clients from: ${clientsFile}`);
      return false;
    }

    // Get the raw data for the hash calculation
    const clientsData = JSON.stringify(clients);

    // Generate timestamp for backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Calculate hash of content (first 8 chars of the hash)
    const hash = crypto.createHash('sha256')
      .update(clientsData)
      .digest('hex')
      .substring(0, 8);

    // Create backup filename
    const backupFile = path.join(backupDir, `clients_${timestamp}_${hash}.json`);

    // Write backup file
    fs.writeFileSync(backupFile, clientsData);

    // Create metadata file
    const metadata: BackupMetadata = {
      timestamp: new Date().toISOString(),
      sourceFile: clientsFile,
      backupFile,
      clientCount: clients.length,
      contentHash: hash,
      id: generateRandomId(8)
    };

    const metadataFile = backupFile.replace('.json', '.meta.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    logger.success(`Backup created: ${backupFile}`);
    logger.info(`${clients.length} clients backed up successfully`);

    return backupFile;
  } catch (error) {
    logger.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Clean up old backups, keeping only the most recent ones
 */
function cleanupOldBackups(backupDir: string, maxBackups: number): void {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      return;
    }

    // Read backup directory
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.json') && !file.includes('.meta.'))
      .map(file => path.join(backupDir, file));

    // If we have fewer backups than the maximum, no need to clean up
    if (files.length <= maxBackups) {
      logger.info(`Current backups (${files.length}) are within the limit (${maxBackups})`);
      return;
    }

    // Sort files by modification time (newest first)
    files.sort((a, b) => {
      return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
    });

    // Remove oldest backups
    const filesToRemove = files.slice(maxBackups);
    logger.info(`Removing ${filesToRemove.length} old backups (keeping ${maxBackups} most recent)`);

    filesToRemove.forEach(file => {
      // Remove backup file
      fs.unlinkSync(file);

      // Remove metadata file if it exists
      const metaFile = file.replace('.json', '.meta.json');
      if (fs.existsSync(metaFile)) {
        fs.unlinkSync(metaFile);
      }

      logger.info(`Removed old backup: ${path.basename(file)}`);
    });

    logger.success(`Cleanup complete: ${filesToRemove.length} old backups removed`);
  } catch (error) {
    logger.error(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main implementation for backup clients command
 */
async function backupImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<void> {
  // Get only the parameters we actually use
  const backupDir = cli.flags['backup-dir'] as string;
  const clientsFile = cli.flags['clients-file'] as string;
  const maxBackups = parseInt(cli.flags['max-backups'] as string, 10);

  logger.section('Client Database Backup');
  logger.info(`Clients database: ${clientsFile}`);
  logger.info(`Backup directory: ${backupDir}`);
  logger.info(`Maximum backups: ${maxBackups}`);
  logger.log('');

  // Run the backup
  const backupFile = backupClients(clientsFile, backupDir);

  // Clean up old backups if backup was successful
  if (backupFile) {
    cleanupOldBackups(backupDir, maxBackups);
    logger.success('Backup and cleanup completed successfully');
  } else {
    // This is consistent with other commands now
    throw new Error('Backup operation failed');
  }
}

// Create the command handler with proper help information
const backupClientsHandler = createCommandHandler(
  backupImplementation,
  {
    defaults: {
      'max-backups': defaults.maxBackups,
      'backup-dir': dirs.backups,
      'clients-file': files.clients
    },
    help: {
      title: 'Client Database Backup',
      command: 'backup-clients',
      options: [
        { name: 'clients-file', description: 'Path to clients database file', default: files.clients },
        { name: 'backup-dir', description: 'Directory to store backups', default: dirs.backups },
        { name: 'max-backups', description: 'Maximum number of backups to keep', default: defaults.maxBackups },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Creates a backup of the client database and maintains a rotation policy',
        'to prevent excessive disk usage by automatically removing old backups.'
      ],
      examples: [
        'manager backup-clients',
        'manager backup-clients --max-backups=5',
        'manager backup-clients --clients-file=./custom/path/clients.json'
      ]
    } as CommandHelp
  }
);

// Export the command handler
export default backupClientsHandler;
