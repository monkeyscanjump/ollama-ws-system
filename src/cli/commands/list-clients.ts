/**
 * Client Listing Command
 *
 * Lists all registered clients with the WebSocket system.
 * Can display basic or detailed information about each client.
 */
import { Interface as ReadlineInterface } from 'readline';
import { createCommandHandler, formatTable } from '../utils/cli';
import { generateKeyFingerprint } from '../utils/crypto';
import { files } from '../config';
import logger from '../utils/logger';
import * as clientManager from '../utils/client-manager';
import { CommandHelp } from '../types';

/**
 * Main implementation for the list-clients command
 */
async function listImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<void> {
  // Get client file path and detailed flag
  const clientsFile = cli.flags['clients-file'] as string;
  const detailed = cli.flags['detailed'] === true || cli.flags['detailed'] === 'true';

  logger.section('Client Listing');
  logger.info(`Clients database: ${clientsFile}`);
  logger.info(`Detailed view: ${detailed ? 'Yes' : 'No'}`);
  logger.log('');

  try {
    // Load clients database using client manager
    const clients = clientManager.listClients(clientsFile);

    if (!clients || clients.length === 0) {
      logger.warn('No clients registered yet.');
      logger.info(`Expected clients file at: ${clientsFile}`);
      return;
    }

    logger.section(`Authorized Clients (${clients.length})`);

    // If detailed view is off, display clients in a table format
    if (!detailed) {
      // Prepare table data with headers
      const tableRows = [
        ['Name', 'ID', 'Created', 'Last Connection', 'Algorithm']
      ];

      // Add each client as a row in the table
      clients.forEach(client => {
        tableRows.push([
          client.name,
          client.id,
          clientManager.formatDate(client.createdAt),
          clientManager.formatDate(client.lastConnected),
          client.signatureAlgorithm || 'default'
        ]);
      });

      // Log the formatted table
      const table = formatTable(tableRows, { hasHeaders: true });
      logger.log(table);
    }
    // Otherwise use detailed view with all client information
    else {
      clients.forEach(client => {
        logger.log('');
        logger.log(`${client.name} (ID: ${client.id})`);
        logger.info(`  Created: ${clientManager.formatDate(client.createdAt)}`);
        logger.info(`  Last connected: ${clientManager.formatDate(client.lastConnected)}`);

        if (client.signatureAlgorithm) {
          logger.info(`  Signature algorithm: ${client.signatureAlgorithm}`);
        }

        const keySize = clientManager.formatKeySize(client.publicKey);
        logger.info(`  Public key: ${keySize} bytes`);
        logger.info(`  Key fingerprint: ${generateKeyFingerprint(client.publicKey)}`);

        if (client.lastIP) {
          logger.info(`  Last IP: ${client.lastIP}`);
        }

        // Add support for tags and allowedIPs which are in the TypeScript interface
        if (client.tags && client.tags.length > 0) {
          logger.info(`  Tags: ${client.tags.join(', ')}`);
        }

        if (client.allowedIPs && client.allowedIPs.length > 0) {
          logger.info(`  Allowed IPs: ${client.allowedIPs.join(', ')}`);
        }
      });
    }

    logger.log('');
  } catch (error) {
    logger.error(`Error listing clients: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Create the command handler with proper help information
const listClientsHandler = createCommandHandler(
  listImplementation,
  {
    defaults: {
      'clients-file': files.clients,
      'detailed': false
    },
    help: {
      title: 'Client Listing',
      command: 'list-clients',
      options: [
        { name: 'detailed', description: 'Show detailed information including key fingerprints', default: 'false' },
        { name: 'clients-file', description: 'Path to clients database file', default: files.clients },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Lists all registered clients with their status and authentication information.',
        'By default, displays a table with basic information.',
        'Use the --detailed flag to see more information including key fingerprints.'
      ],
      examples: [
        'manager list-clients',
        'manager list-clients --detailed',
        'manager list-clients --clients-file=./custom/path/clients.json'
      ]
    } as CommandHelp
  }
);

// Export the command handler
export default listClientsHandler;
