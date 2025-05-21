/**
 * Client Revocation Command
 *
 * Removes clients from the authorized clients database to prevent
 * them from accessing the WebSocket server. Creates a backup
 * of revoked client data for audit purposes.
 */
import { Interface as ReadlineInterface } from 'readline';
import { confirm, prompt, createCommandHandler } from '../utils/cli';
import { dirs, files } from '../config';
import logger from '../utils/logger';
import { findClient, listClients, revokeClient } from '../utils/client-manager';
import { AuthorizedClient, CommandHelp } from '../types';

/**
 * Process the revocation for a client
 */
async function processRevocation(
  clientsFile: string,
  identifier: string,
  revokedDir: string,
  force: boolean,
  rl: ReadlineInterface
): Promise<AuthorizedClient | null> {
  try {
    // Load client database to check if client exists
    const clients = listClients(clientsFile);

    if (!clients || clients.length === 0) {
      logger.info('No clients registered.');
      return null;
    }

    // Find the client using client manager
    const client = findClient(clients, identifier);

    if (!client) {
      logger.warn(`No client found with ID or name: ${identifier}`);
      return null;
    }

    // Confirm revocation if not forced
    if (!force) {
      const confirmed = await confirm(
        rl,
        `Are you sure you want to revoke access for "${client.name}" (ID: ${client.id})?`,
        false
      );

      if (!confirmed) {
        logger.info('Operation cancelled.');
        return null;
      }
    }

    // Use client manager to revoke the client
    const result = await revokeClient(clientsFile, identifier, revokedDir);

    if (!result) {
      logger.error('Failed to revoke client. See error messages above for details.');
      return null;
    }

    return result;
  } catch (error) {
    logger.error(`Error during revocation process: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Changed to throw instead of return false for consistency
  }
}

/**
 * Main revocation implementation
 */
async function revokeImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<void> {
  // Get options from arguments
  const clientsFile = cli.flags['clients-file'] as string;
  const revokedDir = cli.flags['revoked-dir'] as string;
  const force = cli.flags['force'] === true || cli.flags['force'] === 'true';

  // Get client identifier from args or prompt
  let identifier = cli.flags['client-id'] as string;

  if (!identifier) {
    logger.section('Client Revocation');
    logger.info(`Clients database: ${clientsFile}`);
    logger.info(`Revoked clients dir: ${revokedDir}`);
    logger.log('');

    identifier = await prompt(rl, 'Enter client ID or name to revoke: ');

    // Handle empty input
    if (!identifier) {
      logger.info('No client specified. Exiting.');
      return;
    }
  }

  // Process the revocation
  const revokedClient = await processRevocation(clientsFile, identifier, revokedDir, force, rl);

  if (revokedClient) {
    logger.success(`Client "${revokedClient.name}" (ID: ${revokedClient.id}) has been successfully revoked`);
  } else {
    // Consistent with other commands - throw error when operation fails
    throw new Error(`Failed to revoke client: ${identifier}`);
  }
}

// Create the command handler with proper help information
const revokeClientHandler = createCommandHandler(
  revokeImplementation,
  {
    defaults: {
      'clients-file': files.clients,
      'revoked-dir': dirs.revoked,
      'force': false
    },
    help: {
      title: 'Client Revocation',
      command: 'revoke-client',
      options: [
        { name: 'client-id', description: 'ID or name of the client to revoke' },
        { name: 'clients-file', description: 'Path to clients database file', default: files.clients },
        { name: 'revoked-dir', description: 'Directory to store revoked client data', default: dirs.revoked },
        { name: 'force', description: 'Revoke without confirmation prompt', default: 'false' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Revokes a client\'s access by removing it from the authorized clients',
        'database and creates a backup of the revoked client for audit purposes.'
      ],
      examples: [
        'manager revoke-client --client-id=admin',
        'manager revoke-client --client-id=1234abcd --force'
      ]
    } as CommandHelp
  }
);

// Export the command handler
export default revokeClientHandler;
