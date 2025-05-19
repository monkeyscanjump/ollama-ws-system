/**
 * Server Setup Command
 *
 * Initializes the WebSocket server environment by creating required
 * directories, generating admin client credentials, and creating configuration files.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ensureDir } = require('../utils/fs');
const { confirm, createCommandHandler } = require('../utils/cli');
const { generateRsaKeyPair } = require('../utils/crypto');
const { dirs, files, defaults, projectRoot } = require('../utils/config');
const logger = require('../utils/logger');

// Import the command modules
const registerClient = require('./register-client');
const generateKeys = require('./generate-keys');
const configureEnv = require('./configure-env');

/**
 * Create required directories for the server
 *
 * @returns {void}
 */
function setupDirectories() {
  logger.info('Creating required directories...');

  const directories = [
    dirs.data,
    dirs.keys,
    dirs.backups,
    dirs.revoked
  ];

  directories.forEach(dir => {
    const wasCreated = ensureDir(dir);
    if (wasCreated) {
      logger.success(`Created directory: ${dir}`);
    } else {
      logger.info(`Verified existing directory: ${dir}`);
    }
  });
}

/**
 * Check if TypeScript code is compiled and compile it if needed
 *
 * @returns {boolean} Whether compilation succeeded or was already done
 */
function checkCompiledCode() {
  const distDir = path.join(projectRoot, 'dist');
  const indexFile = path.join(distDir, 'index.js');

  if (!fs.existsSync(distDir) || !fs.existsSync(indexFile)) {
    logger.warn('TypeScript code has not been compiled yet.');
    logger.info('Compiling code...');

    try {
      execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
      logger.success('Code compiled successfully');
      return true;
    } catch (error) {
      logger.error('Failed to compile TypeScript code. Please run `npm run build` manually.');
      return false;
    }
  }

  logger.info('TypeScript code is already compiled');
  return true;
}

/**
 * Setup admin client by generating keys and registering
 *
 * @param {string} adminName - Name for the admin client
 * @param {number} keySize - Size of RSA key to generate
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<void>}
 */
async function setupAdminClient(adminName, keySize, rl) {
  // Make sure the directories exist
  ensureDir(dirs.keys);
  ensureDir(dirs.data);

  try {
    // First check if admin already exists
    let existingAdmin = null;

    if (fs.existsSync(files.clients)) {
      // Create a dummy key for checking existing clients by name
      const dummyKeyPair = generateRsaKeyPair(2048);
      existingAdmin = registerClient.checkForExistingClient(
        files.clients,
        adminName,
        dummyKeyPair.publicKey
      );
    }

    // Check for name-based conflict
    if (existingAdmin && existingAdmin.type === 'name') {
      logger.info(`An admin client with name "${adminName}" already exists (ID: ${existingAdmin.client.id})`);

      const shouldRegenerate = await confirm(
        rl,
        'Would you like to revoke this admin and generate a new one?',
        false
      );

      if (!shouldRegenerate) {
        logger.info('Using existing admin client');
        return;
      }

      logger.info('Regenerating admin keys...');

      // Revoke existing client directly
      await registerClient.revokeExistingClient(existingAdmin.client, files.clients);
    }

    // Generate keys using the exported generateClientKeys function
    // This bypasses any potential CLI object issues
    const keyResult = generateKeys.generateClientKeys(
      adminName,  // Explicitly use adminName
      dirs.keys,
      keySize,
      false  // Don't create config file
    );

    // Verify the key file exists (should be guaranteed by generateClientKeys)
    if (!fs.existsSync(keyResult.keyPaths.publicKeyPath)) {
      throw new Error(`Public key file not found at: ${keyResult.keyPaths.publicKeyPath}`);
    }

    logger.info(`Setting up admin client "${adminName}"...`);

    // Register the admin client with force=true to skip confirmation prompts
    const registerCli = {
      flags: {
        'name': adminName,
        'key-path': keyResult.keyPaths.publicKeyPath,
        'algorithm': defaults.signatureAlgorithm,
        'online': false,
        'clients-file': files.clients,
        'server-url': defaults.serverUrl,
        'force': true // Skip additional confirmation prompts
      }
    };

    try {
      await registerClient.registerImplementation(registerCli, rl);
      logger.success('Admin client setup complete');
    } catch (error) {
      if (error.message === 'Registration cancelled by user') {
        logger.info('Admin setup cancelled. Using existing admin client.');
      } else {
        logger.error(`Failed to register admin client: ${error.message}`);
        throw new Error('Admin registration failed');
      }
    }
  } catch (error) {
    logger.error(`Admin setup failed: ${error.message}`);
  }
}

/**
 * Main setup implementation
 *
 * @param {Object} cli - Parsed command line arguments
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<void>}
 */
async function setupImplementation(cli, rl) {
  logger.section('WebSocket Server Setup');

  // Get configuration from arguments
  const adminName = cli.flags['admin-name'];
  const keySize = parseInt(cli.flags['key-size'], 10);

  // Get services to enable using the new approach only
  let servicesToEnable = [];
  if (cli.flags['services']) {
    servicesToEnable = cli.flags['services'].split(',').map(s => s.trim()).filter(Boolean);
  }

  // Setup directories
  setupDirectories();

  // Check compiled code
  const compiled = checkCompiledCode();
  if (!compiled) {
    logger.warn('Continuing setup without compiled code...');
  }

  // Setup admin client
  await setupAdminClient(adminName, keySize, rl);

  // Setup environment file
  try {
    // Use the programmatic API of configure-env
    await configureEnv.configureEnvironment({
      // Default server config
      serverConfig: {
        // Server settings will use defaults or prompt
      },
      // List of services to enable
      services: servicesToEnable,
      // Service-specific configurations (optional)
      serviceConfigs: {
        // You can provide pre-configured settings if needed
        // e.g. ollama: { OLLAMA_API_URL: 'http://localhost:11434', OLLAMA_DEFAULT_MODEL: 'llama2' }
      }
    }, rl, !fs.existsSync(path.join(projectRoot, '.env')));
  } catch (error) {
    logger.error(`Environment configuration failed: ${error.message}`);
  }

  logger.section('Setup Complete');
  logger.log('');
  logger.log('You can now start the server with:');
  logger.log('  npm start');

  logger.log('');
  logger.log('Or using Docker:');
  logger.log('  npm run docker:build');
  logger.log('  npm run docker:start');
}

// Create the command handler with all setup information
const setupHandler = createCommandHandler(
  setupImplementation,
  {
    defaults: {
      'admin-name': 'admin',
      'key-size': defaults.keySize
    },
    help: {
      title: 'Server Setup',
      command: 'setup',
      options: [
        { name: 'admin-name', description: 'Name for the admin client', default: 'admin' },
        { name: 'key-size', description: 'Size of RSA key in bits', default: defaults.keySize },
        { name: 'services', description: 'Comma-separated list of services to enable (e.g., ollama)' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'This command initializes the WebSocket server by:',
        '- Creating required directories',
        '- Compiling TypeScript code if needed',
        '- Generating admin client credentials',
        '- Creating default configuration files',
        '- Configuring optional services based on the --services flag'
      ],
      examples: [
        'manager setup --admin-name=superuser --key-size=4096',
        'manager setup --services=ollama'
      ]
    }
  }
);

// Export the setup function
module.exports = setupHandler;
