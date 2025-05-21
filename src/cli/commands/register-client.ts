/**
 * Client Registration Command
 *
 * Registers a new client with the WebSocket system either by:
 * 1. Directly updating the clients database file (offline mode) - DEFAULT
 * 2. Using the server API if a server is running (online mode) - Requires --online flag
 */
import { Interface as ReadlineInterface } from 'readline';
import { prompt, promptForFile, confirm, createCommandHandler } from '../utils/cli';
import { generateKeyFingerprint } from '../utils/crypto';
import { files, dirs, defaults } from '../config';
import logger from '../utils/logger';
import * as clientManager from '../utils/client-manager';
import { AuthorizedClient, CommandHelp } from '../types';

/**
 * Check if a client with the given name or public key already exists
 *
 * @param clientsFile - Path to the clients database file
 * @param name - Name to check for duplicates
 * @param publicKey - Public key to check for duplicates
 * @returns Object containing the duplicate type and client info, or null if no duplicates
 */
function checkForExistingClient(
  clientsFile: string,
  name: string,
  publicKey: string
): { type: 'key' | 'name', client: AuthorizedClient } | null {
  try {
    // Get existing clients
    const clients = clientManager.listClients(clientsFile);
    if (!clients || clients.length === 0) {
      return null;
    }

    // First check for duplicate public key (highest priority)
    const keyFingerprint = generateKeyFingerprint(publicKey);

    for (const client of clients) {
      const existingFingerprint = generateKeyFingerprint(client.publicKey);
      if (existingFingerprint === keyFingerprint) {
        return {
          type: 'key',
          client
        };
      }
    }

    // Then check for duplicate name (also important now)
    const duplicateName = clients.find(c =>
      c.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicateName) {
      return {
        type: 'name',
        client: duplicateName
      };
    }

    return null;
  } catch (error) {
    logger.error(`Error checking for existing clients: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Revoke an existing client using the client manager directly
 *
 * @param existingClient - Client to revoke
 * @param clientsFile - Path to the clients database file
 * @returns Promise resolving to boolean indicating success
 */
async function revokeExistingClient(
  existingClient: AuthorizedClient,
  clientsFile: string
): Promise<boolean> {
  try {
    logger.info(`Revoking existing client "${existingClient.name}" (ID: ${existingClient.id})...`);

    // Use the client manager directly instead of the command handler
    const result = await clientManager.revokeClient(
      clientsFile,
      existingClient.id,
      dirs.revoked
    );

    if (result) {
      logger.success(`Client "${existingClient.name}" revoked successfully`);
      return true;
    } else {
      logger.error(`Failed to revoke client directly`);
      return false;
    }
  } catch (error) {
    logger.error(`Error during revocation: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Main registration implementation
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise that resolves when registration is complete
 */
async function registerImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<void> {
  // Get parameters from the double-dash flags
  const serverUrl = cli.flags['server-url'] as string;
  const clientName = cli.flags['name'] as string;
  const publicKeyPath = cli.flags['key-path'] as string;
  const signatureAlgorithm = cli.flags['algorithm'] as string;
  // Reversed logic: Default is offline, only use online mode if specifically requested
  const isOnline = cli.flags['online'] === true || cli.flags['online'] === 'true';
  const clientsFile = cli.flags['clients-file'] as string;
  // Flag to skip confirmation prompts (useful for non-interactive scripts)
  const forceRegister = cli.flags['force'] === true || cli.flags['force'] === 'true';

  // Prompt for any missing required parameters
  const finalClientName = clientName || await prompt(rl, 'Enter client name: ');

  // Start registration process
  logger.section('Client Registration');
  logger.info(`Mode: ${isOnline ? 'Online (API)' : 'Offline (direct database)'}`);
  if (isOnline) {
    logger.info(`Server URL: ${serverUrl}`);
  } else {
    logger.info(`Clients database: ${clientsFile}`);
  }
  logger.info(`Client name: ${finalClientName}`);
  if (publicKeyPath) {
    logger.info(`Key path: ${publicKeyPath}`);
  }
  logger.log('');

  // Get public key
  logger.info('Reading public key...');
  let publicKey: string;

  if (publicKeyPath) {
    // If path is provided, try to read it
    logger.info(`Attempting to read key from: ${publicKeyPath}`);
    const readKey = clientManager.readPublicKey(publicKeyPath);
    if (!readKey) {
      logger.warn(`Could not read public key from ${publicKeyPath}`);
      throw new Error(`Failed to read public key from ${publicKeyPath}`);
    }
    publicKey = readKey;
  } else {
    // If we don't have a key path, prompt for one
    const keyInput = await promptForFile(rl, 'Enter path to public key file: ', clientManager.readPublicKey);
    if (!keyInput) {
      throw new Error('Valid public key file is required');
    }
    publicKey = keyInput;
  }

  // Display key fingerprint for verification
  const fingerprint = generateKeyFingerprint(publicKey);
  logger.info(`Key fingerprint: ${fingerprint}`);

  // Get signature algorithm if not provided
  const algorithm = signatureAlgorithm ||
    (await prompt(rl, 'Enter signature algorithm (press Enter for default SHA256): ')).trim() || undefined;

  let response;

  if (!isOnline) {
    // DEFAULT: Register directly to database in offline mode
    logger.info(`Registering client "${finalClientName}" directly to database...`);

    // Check for existing clients with the same key or name
    const existingClient = checkForExistingClient(clientsFile, finalClientName, publicKey);

    if (existingClient) {
      if (existingClient.type === 'key') {
        // Duplicate key found
        logger.warn(`This public key is already registered to client "${existingClient.client.name}" (ID: ${existingClient.client.id})`);

        // If forceRegister is true, skip confirmation and directly revoke
        if (forceRegister) {
          logger.info(`Auto-revoking existing client due to force flag`);
          const revoked = await revokeExistingClient(existingClient.client, clientsFile);
          if (!revoked) {
            throw new Error('Failed to revoke existing client');
          }
        } else {
          // Otherwise ask for confirmation
          const shouldRevoke = await confirm(
            rl,
            `Would you like to revoke the existing client and register this one instead?`,
            false
          );

          if (shouldRevoke) {
            const revoked = await revokeExistingClient(existingClient.client, clientsFile);
            if (!revoked) {
              throw new Error('Failed to revoke existing client');
            }
            // Continue with registration after revocation
          } else {
            logger.info('Registration cancelled');
            throw new Error('Registration cancelled by user');
          }
        }
      } else if (existingClient.type === 'name') {
        // Duplicate name found
        logger.warn(`A client with the name "${finalClientName}" already exists (ID: ${existingClient.client.id})`);

        // If forceRegister is true, skip confirmation and directly revoke
        if (forceRegister) {
          logger.info(`Auto-revoking existing client due to force flag`);
          const revoked = await revokeExistingClient(existingClient.client, clientsFile);
          if (!revoked) {
            throw new Error('Failed to revoke existing client');
          }
        } else {
          // Otherwise ask for confirmation
          const shouldRevoke = await confirm(
            rl,
            `Would you like to revoke the existing client and register this one instead?`,
            false
          );

          if (shouldRevoke) {
            const revoked = await revokeExistingClient(existingClient.client, clientsFile);
            if (!revoked) {
              throw new Error('Failed to revoke existing client');
            }
            // Continue with registration after revocation
          } else {
            logger.info('Registration cancelled');
            throw new Error('Registration cancelled by user');
          }
        }
      }
    }

    if (algorithm) {
      logger.info(`Using signature algorithm: ${algorithm}`);
    } else {
      logger.info(`Using default signature algorithm (${defaults.signatureAlgorithm})`);
    }

    response = await clientManager.registerClientOffline(clientsFile, finalClientName, publicKey, algorithm);
  } else {
    // Online mode - we'll let the server handle duplicate checking
    logger.info(`Registering client "${finalClientName}" with server at ${serverUrl}...`);
    if (algorithm) {
      logger.info(`Using signature algorithm: ${algorithm}`);
    } else {
      logger.info(`Using default signature algorithm (${defaults.signatureAlgorithm})`);
    }

    try {
      response = await clientManager.registerClientOnline(serverUrl, finalClientName, publicKey, algorithm);
    } catch (error) {
      // The server might reject due to duplicates, just propagate the error
      throw error;
    }
  }

  logger.log('');
  logger.success(`Success! Client registered with ID: ${response.clientId}`);

  // If we have a key path, save the configuration
  if (publicKeyPath) {
    const configPath = clientManager.saveClientConfig(
      response.clientId,
      finalClientName,
      publicKeyPath,
      serverUrl,
      algorithm
    );

    if (configPath) {
      logger.log('');
      logger.log('To use this client, provide these credentials to your application:');
      logger.info(`- Client ID: ${response.clientId}`);
      logger.info(`- Private Key: ${publicKeyPath.replace('.pub', '.pem')}`);
      logger.info(`- Server URL: ${serverUrl}`);
      logger.info(`- Signature Algorithm: ${algorithm || defaults.signatureAlgorithm}`);
      logger.log('');
      logger.log(`Or use the generated config file: ${configPath}`);
    }
  } else {
    logger.log('');
    logger.log('To use this client, provide these credentials to your application:');
    logger.info(`- Client ID: ${response.clientId}`);
    logger.info(`- Private Key: (your private key file)`);
    logger.info(`- Server URL: ${serverUrl}`);
    logger.info(`- Signature Algorithm: ${algorithm || defaults.signatureAlgorithm}`);
  }
}

/**
 * Create the command handler with detailed help information
 */
const registerClientHandler = createCommandHandler(
  registerImplementation,
  {
    defaults: {
      'server-url': defaults.serverUrl,
      'clients-file': files.clients,
      'force': false
    },
    help: {
      title: 'Client Registration',
      command: 'register-client',
      options: [
        { name: 'name', description: 'Name for the client' },
        { name: 'key-path', description: 'Path to public key file (.pub)' },
        { name: 'server-url', description: 'URL of the server (only used with --online)', default: defaults.serverUrl },
        { name: 'algorithm', description: 'Signature algorithm to use', default: defaults.signatureAlgorithm },
        { name: 'online', description: 'Register using the server API (default is offline direct database registration)' },
        { name: 'clients-file', description: 'Path to clients database file (for offline mode)', default: files.clients },
        { name: 'force', description: 'Skip confirmation prompts and automatically replace existing clients', default: 'false' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Registers a new client with the WebSocket system.',
        'By default, it operates in offline mode, directly updating the database file.',
        'With the --online flag, it connects to a running server to register the client.',
        'Each client must have a unique name and public key for security reasons.',
        'When a duplicate is found, you\'ll be prompted to revoke the existing client first.'
      ],
      examples: [
        'manager register-client --name=my-client --key-path=./keys/my-client_key.pub',
        'manager register-client --name=admin --key-path=./keys/admin_key.pub --algorithm=SHA512',
        'manager register-client --online --server-url=http://example.com:3000 --name=remote-client --key-path=./keys/remote_key.pub',
        'manager register-client --name=admin --key-path=./keys/new_admin_key.pub --force'
      ]
    } as CommandHelp
  }
);

// Export the handler and helper functions
export default registerClientHandler;
export { checkForExistingClient, revokeExistingClient, registerImplementation };
