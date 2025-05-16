#!/usr/bin/env node
/**
 * Client Database Backup Tool
 *
 * Creates backups of the authorized clients database and manages
 * backup rotation to prevent excessive disk usage.
 */
const fs = require('fs');
const path = require('path');
const { ensureDir, loadJson } = require('./utils/fs');
const { generateRandomId } = require('./utils/crypto');
const { parseArgs } = require('./utils/cli');
const { dirs, files, defaults } = require('./utils/config');

// Parse command line arguments
const args = process.argv.slice(2);
const cli = parseArgs(args, {
  defaults: {
    'max-backups': defaults.maxBackups,
    'source-dir': dirs.data,
    'backup-dir': dirs.backups
  }
});

/**
 * Create a backup of the clients database
 *
 * @param {string} clientsFile - Path to the clients database file
 * @param {string} backupDir - Directory to store backups
 * @returns {string|false} Path to the backup file or false if backup failed
 */
function backupClients(clientsFile, backupDir) {
  try {
    // Check if source file exists
    if (!fs.existsSync(clientsFile)) {
      console.error(`Clients file not found: ${clientsFile}`);
      return false;
    }

    // Ensure backup directory exists
    ensureDir(backupDir);

    // Read clients file
    const clientsData = fs.readFileSync(clientsFile, 'utf8');

    // Parse to verify it's valid JSON
    const clients = JSON.parse(clientsData);

    // Generate timestamp for backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Calculate hash of content (first 8 chars of the hash)
    const hash = require('crypto').createHash('sha256')
      .update(clientsData)
      .digest('hex')
      .substring(0, 8);

    // Create backup filename
    const backupFile = path.join(backupDir, `clients_${timestamp}_${hash}.json`);

    // Write backup file
    fs.writeFileSync(backupFile, clientsData);

    // Create metadata file
    const metadata = {
      timestamp: new Date().toISOString(),
      sourceFile: clientsFile,
      backupFile,
      clientCount: clients.length,
      contentHash: hash,
      id: generateRandomId(8)
    };

    const metadataFile = backupFile.replace('.json', '.meta.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    console.log(`Backup created: ${backupFile}`);
    console.log(`${clients.length} clients backed up successfully`);

    return backupFile;
  } catch (error) {
    console.error('Backup failed:', error.message);
    return false;
  }
}

/**
 * Clean up old backups, keeping only the most recent ones
 *
 * @param {string} backupDir - Directory containing backups
 * @param {number} maxBackups - Maximum number of backups to keep
 */
function cleanupOldBackups(backupDir, maxBackups) {
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
      console.log(`Current backups (${files.length}) are within the limit (${maxBackups})`);
      return;
    }

    // Sort files by modification time (newest first)
    files.sort((a, b) => {
      return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
    });

    // Remove oldest backups
    const filesToRemove = files.slice(maxBackups);
    console.log(`Removing ${filesToRemove.length} old backups (keeping ${maxBackups} most recent)`);

    filesToRemove.forEach(file => {
      // Remove backup file
      fs.unlinkSync(file);

      // Remove metadata file if it exists
      const metaFile = file.replace('.json', '.meta.json');
      if (fs.existsSync(metaFile)) {
        fs.unlinkSync(metaFile);
      }

      console.log(`Removed old backup: ${path.basename(file)}`);
    });

    console.log(`Cleanup complete: ${filesToRemove.length} old backups removed`);
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
}

/**
 * Main function to run the backup process
 */
function main() {
  // Show help if requested
  if (cli.help) {
    console.log('Usage: node backup-clients.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --source-dir <dir>     Directory containing client database (default: ./data)');
    console.log('  --backup-dir <dir>     Directory to store backups (default: ./data/backups)');
    console.log('  --max-backups <num>    Maximum number of backups to keep (default: 10)');
    console.log('  --help, -h             Show this help message');
    console.log('');
    console.log('Example:');
    console.log('  node backup-clients.js --max-backups 5');
    process.exit(0);
  }

  // Get directory paths from arguments or defaults
  const sourceDir = cli.flags['source-dir'];
  const backupDir = cli.flags['backup-dir'];
  const clientsFile = cli.flags['clients-file'] || path.join(sourceDir, 'authorized_clients.json');
  const maxBackups = parseInt(cli.flags['max-backups'], 10);

  console.log('=== Client Database Backup ===');
  console.log(`Source file: ${clientsFile}`);
  console.log(`Backup directory: ${backupDir}`);
  console.log(`Maximum backups: ${maxBackups}`);
  console.log('');

  // Run the backup
  const backupFile = backupClients(clientsFile, backupDir);

  // Clean up old backups if backup was successful
  if (backupFile) {
    cleanupOldBackups(backupDir, maxBackups);
  }
}

// Execute the script
main();
