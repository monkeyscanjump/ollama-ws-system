/**
 * Key Generation Command
 *
 * Generates RSA key pairs for client authentication.
 * Creates both private and public keys in PEM format.
 */
import { Interface as ReadlineInterface } from 'readline';
import { createCommandHandler } from '../utils/cli';
import { generateRsaKeyPair, saveKeyPair, generateKeyFingerprint } from '../utils/crypto';
import { dirs, defaults } from '../config';
import logger from '../utils/logger';
import * as clientManager from '../utils/client-manager';
import { CommandHelp } from '@ws-system/shared';

/**
 * Creates a template config file for a client
 *
 * @param clientName - Name of the client
 * @param publicKeyPath - Path to the client's public key file
 * @returns Path to the created config file or null if creation failed
 */
function createConfigTemplate(clientName: string, publicKeyPath: string): string | null {
  try {
    logger.info('Creating configuration template...');

    // Generate a placeholder client ID
    const placeholderId = 'REPLACE_WITH_ACTUAL_CLIENT_ID';

    // Create a template config
    const configPath = clientManager.saveClientConfig(
      placeholderId,
      clientName,
      publicKeyPath,
      defaults.serverUrl,
      defaults.signatureAlgorithm
    );

    if (configPath) {
      logger.success(`Configuration template created at: ${configPath}`);
      logger.info('Note: This is a template. Replace the client ID after registration.');
      return configPath;
    }

    return null;
  } catch (error) {
    logger.error(`Failed to create config template: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Core key generation function - separated to handle both direct calls and CLI calls
 *
 * @param clientName - Name for the client keys
 * @param outputDir - Directory where keys will be saved
 * @param keySize - Size of RSA key in bits
 * @param createConfig - Whether to create a config template file
 * @returns Object containing key paths and fingerprint
 */
function generateClientKeys(
  clientName: string,
  outputDir: string,
  keySize: number,
  createConfig: boolean
): {
  keyPaths: { privateKeyPath: string; publicKeyPath: string },
  fingerprint: string
} {
  // Log what we're about to do
  logger.section('RSA Key Pair Generator');
  logger.info(`Generating ${keySize}-bit keys for client: ${clientName}`);
  logger.info(`Output directory: ${outputDir}`);
  if (createConfig) {
    logger.info('Will create a configuration template file');
  }
  logger.log('');

  // Generate the key pair
  const keyPair = generateRsaKeyPair(keySize);

  // Save keys to files
  const keyPaths = saveKeyPair(keyPair, outputDir, clientName);

  // Generate and display fingerprint
  const fingerprint = generateKeyFingerprint(keyPair.publicKey);

  logger.log('');
  logger.success('Keys generated successfully!');
  logger.info(`Private key: ${keyPaths.privateKeyPath}`);
  logger.info(`Public key: ${keyPaths.publicKeyPath}`);
  logger.info(`Key fingerprint: ${fingerprint}`);

  // Create config template if requested
  if (createConfig) {
    createConfigTemplate(clientName, keyPaths.publicKeyPath);
  }

  return {
    keyPaths,
    fingerprint
  };
}

/**
 * Main implementation for key generation - handles CLI arguments
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise resolving to object with key paths and fingerprint
 */
async function generateKeysImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<{
  keyPaths: { privateKeyPath: string; publicKeyPath: string },
  fingerprint: string
}> {
  try {
    // Extract client name with fallback handling
    let clientName = 'client'; // Default

    // Check if name exists in flags and is not undefined/empty
    if (cli && cli.flags && cli.flags.name && cli.flags.name.trim()) {
      clientName = cli.flags.name.trim();
    }

    // Get other parameters from the double-dash flags or use defaults
    const outputDir = (cli && cli.flags && cli.flags['output-dir']) || dirs.keys;
    const keySize = parseInt((cli && cli.flags && cli.flags['key-size']) || String(defaults.keySize), 10);
    const createConfig = (cli && cli.flags && (cli.flags['create-config'] === true || cli.flags['create-config'] === 'true')) || false;

    // Generate the keys using our core function
    const result = generateClientKeys(clientName, outputDir, keySize, createConfig);

    // Display usage instructions
    logger.log('');
    logger.log('Keep your private key secure and use the public key to register with the server.');
    logger.log('Register your client with:');
    logger.log(`  # Using the manager CLI tool (default is offline registration):`);
    logger.log(`  manager register-client --name=${clientName} --key-path=${result.keyPaths.publicKeyPath}`);
    logger.log(`  # Using online registration with the server API:`);
    logger.log(`  manager register-client --online --server-url=${defaults.serverUrl} --name=${clientName} --key-path=${result.keyPaths.publicKeyPath}`);

    return result;
  } catch (error) {
    logger.error(`Error generating keys: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Create the command handler with proper help information
 */
const generateKeysHandler = createCommandHandler(
  generateKeysImplementation,
  {
    defaults: {
      'name': defaults.client,
      'output-dir': dirs.keys,
      'key-size': defaults.keySize,
      'create-config': false
    },
    help: {
      title: 'Key Generation',
      command: 'generate-keys',
      options: [
        { name: 'name', description: 'Name for the key pair', default: 'client' },
        { name: 'output-dir', description: 'Directory to save keys', default: dirs.keys },
        { name: 'key-size', description: 'Key size in bits', default: defaults.keySize },
        { name: 'create-config', description: 'Create a config template file for the client', default: 'false' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Generates an RSA key pair for client authentication with the',
        'WebSocket server. The private key should be kept secure while the',
        'public key is registered with the server.'
      ],
      examples: [
        'manager generate-keys --name=my-client',
        'manager generate-keys --name=admin --key-size=4096',
        'manager generate-keys --name=test-client --create-config'
      ]
    } as CommandHelp
  }
);

// Export the command handler and direct function for programmatic use
export default generateKeysHandler;
export { generateClientKeys };
