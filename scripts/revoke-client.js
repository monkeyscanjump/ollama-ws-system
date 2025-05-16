#!/usr/bin/env node
/**
 * Client Revocation Tool
 *
 * Removes clients from the authorized clients database to prevent
 * them from accessing the Ollama WebSocket server. Creates a backup
 * of revoked client data for audit purposes.
 */
const fs = require('fs');
const path = require('path');
const { loadJson, saveJson, ensureDir } = require('./utils/fs');
const { createInterface, parseArgs, confirm } = require('./utils/cli');
const { dirs, files } = require('./utils/config');

// Parse command line arguments
const args = process.argv.slice(2);
const cli = parseArgs(args, {
  defaults: {
    'clients-file': files.clients,
    'revoked-dir': dirs.revoked
  }
});

// Create readline interface
const rl = createInterface();

/**
 * Find a client by ID or name
 *
 * @param {Array<Object>} clients - Array of client objects
 * @param {string} identifier - Client ID or name to find
 * @returns {Object|undefined} The client object if found, undefined otherwise
 */
function findClient(clients, identifier) {
  // Try to find by ID first
  const clientById = clients.find(c => c.id === identifier);
  if (clientById) return clientById;

  // Try to find by name (case insensitive)
  return clients.find(c => c.name.toLowerCase() === identifier.toLowerCase());
}

/**
 * Revoke a client's access by removing it from the database
 *
 * @param {string} clientsFile - Path to the clients JSON file
 * @param {string} identifier - Client ID or name to revoke
 * @param {string} revokedDir - Directory to save revoked client backups
 */
async function revokeClient(clientsFile, identifier, revokedDir) {
  try {
    // Load clients
    const clients = loadJson(clientsFile);

    if (!clients || clients.length === 0) {
      console.log('No clients registered.');
      return;
    }

    // Find the client
    const client = findClient(clients, identifier);

    if (!client) {
      console.log(`No client found with ID or name: ${identifier}`);
      return;
    }

    // Confirm revocation
    const confirmed = await confirm(
      rl,
      `Are you sure you want to revoke access for "${client.name}" (ID: ${client.id})?`,
      false
    );

    if (!confirmed) {
      console.log('Operation cancelled.');
      return;
    }

    // Filter out the client
    const updatedClients = clients.filter(c => c.id !== client.id);

    // Save updated clients
    const saveSuccess = saveJson(clientsFile, updatedClients);

    if (saveSuccess) {
      console.log(`\nAccess revoked for client "${client.name}" (ID: ${client.id})`);

      // Save backup of the client data
      ensureDir(revokedDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(revokedDir, `${client.id}_${timestamp}.json`);

      saveJson(backupFile, {
        client,
        revokedAt: new Date().toISOString(),
        reason: 'Manual revocation via CLI tool'
      });

      console.log(`Backup of client data saved to: ${backupFile}`);
    } else {
      console.error('Failed to revoke client due to error saving client database.');
    }
  } catch (error) {
    console.error(`Error revoking client: ${error.message}`);
  }
}

/**
 * Prompt the user to enter a client identifier
 *
 * @returns {Promise<string>} The entered client identifier
 */
function promptForClientIdentifier() {
  return new Promise((resolve) => {
    rl.question('Enter client ID or name to revoke: ', (answer) => {
      const trimmed = answer.trim();
      if (!trimmed) {
        console.log('No client specified. Exiting.');
        resolve('');
      } else {
        resolve(trimmed);
      }
    });
  });
}

/**
 * Main function to run the revocation process
 */
async function main() {
  try {
    // Show help if requested
    if (cli.help) {
      console.log('Usage: node revoke-client.js [options] [client-id-or-name]');
      console.log('');
      console.log('Options:');
      console.log('  --clients-file <file>  Path to clients database file');
      console.log('  --revoked-dir <dir>    Directory to store revoked client data');
      console.log('  --help, -h             Show this help message');
      console.log('');
      console.log('Arguments:');
      console.log('  client-id-or-name      ID or name of the client to revoke');
      console.log('');
      console.log('Example:');
      console.log('  node revoke-client.js my-client');
      console.log('  node revoke-client.js 1234abcd');

      // If help was explicitly requested, exit without prompting
      if (args.includes('--help') || args.includes('-h')) {
        process.exit(0);
      }
    }

    // Get clients file and revoked directory
    const clientsFile = cli.flags['clients-file'];
    const revokedDir = cli.flags['revoked-dir'];

    // Get client identifier from args or prompt
    let identifier = cli._[0];

    if (!identifier) {
      console.log('=== Client Revocation Tool ===');
      console.log(`Clients database: ${clientsFile}`);
      console.log(`Revoked clients dir: ${revokedDir}`);
      console.log('');

      identifier = await promptForClientIdentifier();

      if (!identifier) {
        process.exit(0);
      }
    }

    // Revoke the client
    await revokeClient(clientsFile, identifier, revokedDir);
  } catch (error) {
    console.error('Revocation process failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Execute the script
main();
