/**
 * Server Setup Command
 *
 * Initializes the WebSocket server environment by creating required
 * directories, generating admin client credentials, and creating configuration files.
 * Also offers Docker setup and system startup options.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Interface as ReadlineInterface } from 'readline';
import { ensureDir } from '../utils/fs';
import { confirm, createCommandHandler } from '../utils/cli';
import { generateRsaKeyPair } from '../utils/crypto';
import { dirs, files, defaults, projectRoot } from '../config';
import logger from '../utils/logger';

// Import the command modules
import {
  checkForExistingClient,
  revokeExistingClient,
  registerImplementation
} from './register-client';
import * as generateKeysModule from './generate-keys';
import * as configureEnvModule from './configure-env';
import { CommandHelp } from '@ws-system/shared';

/**
 * Create required directories for the server
 */
function setupDirectories(): void {
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
 * @returns Boolean indicating if code is compiled or compilation succeeded
 */
function checkCompiledCode(): boolean {
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
 * @param adminName - Name for the admin client
 * @param keySize - Size of RSA key in bits
 * @param rl - Readline interface for user input
 * @returns Promise that resolves when setup is complete
 */
async function setupAdminClient(
  adminName: string,
  keySize: number,
  rl: ReadlineInterface
): Promise<void> {
  // Make sure the directories exist
  ensureDir(dirs.keys);
  ensureDir(dirs.data);

  try {
    // First check if admin already exists
    let existingAdmin = null;

    if (fs.existsSync(files.clients)) {
      // Create a dummy key for checking existing clients by name
      const dummyKeyPair = generateRsaKeyPair(2048);
      existingAdmin = checkForExistingClient(
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
      await revokeExistingClient(existingAdmin.client, files.clients);
    }

    // Generate keys using the exported generateClientKeys function
    const keyResult = generateKeysModule.generateClientKeys(
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
      },
      _: [] // Add empty positional arguments array
    };

    try {
      await registerImplementation(registerCli, rl);
      logger.success('Admin client setup complete');
    } catch (error) {
      if (error instanceof Error && error.message === 'Registration cancelled by user') {
        logger.info('Admin setup cancelled. Using existing admin client.');
      } else {
        logger.error(`Failed to register admin client: ${error instanceof Error ? error.message : String(error)}`);
        throw new Error('Admin registration failed');
      }
    }
  } catch (error) {
    logger.error(`Admin setup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main setup implementation
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise that resolves when setup is complete
 */
async function setupImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<void> {
  logger.section('WebSocket Server Setup');

  // Get configuration from arguments
  const adminName = cli.flags['admin-name'] as string;
  const keySize = parseInt(cli.flags['key-size'] as string, 10);
  const useDocker = cli.flags['use-docker'] !== false; // Default to true

  // Get services to enable using the new approach only
  let servicesToEnable: string[] = [];
  if (cli.flags['services']) {
    servicesToEnable = (cli.flags['services'] as string)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
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
  let envConfigResult = false;
  try {
    // Use the programmatic API of configure-env
    envConfigResult = await configureEnvModule.configureEnvironment({
      // Default server configuration values
      values: {},
      // List of services to enable
      services: servicesToEnable,
      // Service-specific configurations (optional)
      serviceConfigs: {}
    }, rl, !fs.existsSync(path.join(projectRoot, '.env')));
  } catch (error) {
    logger.error(`Environment configuration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Docker setup section
  if (useDocker) {
    logger.section('Docker Configuration');

    // Check if Docker is available
    const { isDockerAvailable } = await import('../services/docker');
    const dockerAvailable = isDockerAvailable();

    if (!dockerAvailable) {
      logger.warn('Docker is not running or not installed. Please install Docker to use containerized deployment.');
      logger.info('You can still run the server directly with: npm start');
    } else {
      logger.success('Docker is available on your system');

      // Ask if user wants to build the Docker image now
      const buildNow = await confirm(
        rl,
        'Would you like to build the Docker image now?',
        true
      );

      if (buildNow) {
        // Import the docker service directly
        const { generateDockerfile } = await import('../services/docker');
        const dockerfilePath = generateDockerfile();

        logger.section('Building WebSocket Server Image');
        logger.info(`Image Name: ${defaults.containerPrefix}:${defaults.dockerTag}`);
        logger.info('No Cache: Yes');
        logger.info(`Docker Context: ${projectRoot}`);
        logger.info(`Dockerfile: ${dockerfilePath}`);
        logger.log('');

        try {
          logger.info('Building image, this may take a few minutes...');
          execSync(
            `docker build --no-cache -t ${defaults.containerPrefix}:${defaults.dockerTag} -f ${dockerfilePath} ${projectRoot}`,
            { stdio: 'inherit' }
          );
          logger.success('Docker image built successfully');
          logger.info(`Image: ${defaults.containerPrefix}:${defaults.dockerTag}`);
        } catch (error) {
          logger.error(`Failed to build image: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Import the utility functions from setup-cloudflared
      const { isCloudflaredConfigured, setupCloudflared, getCloudflaredPaths } = await import('./setup-cloudflared');

      // Check if Cloudflare is already configured
      if (isCloudflaredConfigured(dirs.data)) {
        const { configDir } = getCloudflaredPaths(dirs.data);
        logger.info('Cloudflare Tunnel is already configured.');
        logger.info(`Using existing configuration at: ${configDir}`);
      } else {
        // Ask if user wants to set up Cloudflare (only if not already configured)
        const setupCloudflarePrompt = await confirm(
          rl,
          'Would you like to set up a Cloudflare Tunnel for secure connections?',
          false
        );

        if (setupCloudflarePrompt) {
          // Use the modular setupCloudflared function
          const tunnelName = defaults.cloudflareTunnelName;
          const hostname = defaults.cloudflareHostname;

          const cloudflareResult = setupCloudflared(tunnelName, hostname, dirs.data);
          if (!cloudflareResult.success) {
            logger.error('Failed to set up Cloudflare Tunnel.');
          }
        }
      }

      // Ask if user wants to start the system now
      const startNow = await confirm(
        rl,
        'Would you like to start the system now?',
        true
      );

      if (startNow) {
        // Import and call the startSystem function directly
        const { startSystem } = await import('../services/docker');
        const startResult = await startSystem(false); // No need to rebuild

        if (startResult) {
          logger.success('System is now running!');
          logger.info('Access your WebSocket server at:');

          // Check if Cloudflare is configured to show the correct URL
          if (isCloudflaredConfigured(dirs.data)) {
            const hostname = defaults.cloudflareHostname;
            logger.info(`  wss://${hostname}`);
          } else {
            const host = process.env.HOST || defaults.host || 'localhost';
            const port = process.env.PORT || defaults.port || '3000';
            logger.info(`  ws://${host}:${port}`);
          }
        } else {
          logger.error('Failed to start the system.');
        }
      } else {
        logger.info('To start the system later, run:');
        logger.info('  manager start-system');
      }
    }
  } else {
    // Standard non-Docker instructions
    logger.section('Setup Complete');
    logger.log('');
    logger.log('You can now start the server with:');
    logger.log('  npm start');
  }
}

/**
 * Create the command handler with all setup information
 */
const setupHandler = createCommandHandler(
  setupImplementation,
  {
    defaults: {
      'admin-name': 'admin',
      'key-size': defaults.keySize,
      'use-docker': true
    },
    help: {
      title: 'Server Setup',
      command: 'setup',
      options: [
        { name: 'admin-name', description: 'Name for the admin client', default: 'admin' },
        { name: 'key-size', description: 'Size of RSA key in bits', default: String(defaults.keySize) },
        { name: 'services', description: 'Comma-separated list of services to enable (e.g., ollama)' },
        { name: 'use-docker', description: 'Configure Docker for deployment', default: 'true' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'This command initializes the WebSocket server by:',
        '- Creating required directories',
        '- Compiling TypeScript code if needed',
        '- Generating admin client credentials',
        '- Creating default configuration files',
        '- Configuring optional services based on the --services flag',
        '- Setting up Docker containers (if --use-docker=true)',
        '- Configuring Cloudflare Tunnel (optional)'
      ],
      examples: [
        'manager setup --admin-name=superuser --key-size=4096',
        'manager setup --services=ollama',
        'manager setup --use-docker=false'
      ]
    } as CommandHelp
  }
);

// Export the setup function
export default setupHandler;
