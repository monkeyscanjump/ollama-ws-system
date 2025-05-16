#!/usr/bin/env node
/**
 * Server Setup Utility
 *
 * Initializes the Ollama WebSocket server environment by creating required
 * directories, generating admin client credentials, and creating configuration files.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ensureDir, saveJson } = require('./utils/fs');
const { createInterface, parseArgs, confirm } = require('./utils/cli');
const { generateRsaKeyPair, generateRandomId } = require('./utils/crypto');
const { dirs, files, defaults, projectRoot } = require('./utils/config');

// Parse command line arguments
const args = process.argv.slice(2);
const cli = parseArgs(args, {
  defaults: {
    'admin-name': 'admin',
    'key-size': defaults.keySize
  }
});

// Create readline interface
const rl = createInterface();

/**
 * Create required directories for the server
 *
 * @returns {void}
 */
function setupDirectories() {
  console.log('Creating required directories...');

  const directories = [
    dirs.data,
    dirs.keys,
    dirs.backups,
    dirs.revoked
  ];

  directories.forEach(dir => {
    if (ensureDir(dir)) {
      console.log(`Created/verified directory: ${dir}`);
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
    console.log('TypeScript code has not been compiled yet.');
    console.log('Compiling code...');

    try {
      execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
      console.log('Code compiled successfully');
      return true;
    } catch (error) {
      console.error('Failed to compile TypeScript code. Please run `npm run build` manually.');
      return false;
    }
  }

  console.log('TypeScript code is already compiled');
  return true;
}

/**
 * Create admin client credentials
 *
 * @param {string} adminName - Name for the admin client
 * @param {number} keySize - Size of RSA key to generate
 * @returns {Promise<string|null>} Admin client ID if successful, null otherwise
 */
async function generateAdminClient(adminName, keySize) {
  try {
    console.log(`Generating admin client keys (${keySize} bits)...`);

    // Generate key pair
    const keyPair = generateRsaKeyPair(keySize);

    // Save keys
    const adminKeyPath = path.join(dirs.keys, `${adminName}_key`);
    fs.writeFileSync(`${adminKeyPath}.pem`, keyPair.privateKey);
    fs.writeFileSync(`${adminKeyPath}.pub`, keyPair.publicKey);

    console.log(`Admin keys saved to: ${adminKeyPath}.pem and ${adminKeyPath}.pub`);

    // Create clients file with admin client
    const clientId = generateRandomId();

    const adminClient = {
      id: clientId,
      name: adminName,
      publicKey: keyPair.publicKey,
      signatureAlgorithm: defaults.signatureAlgorithm,
      createdAt: new Date().toISOString()
    };

    // Make sure the data directory exists
    ensureDir(dirs.data);

    // Save client to authorized clients file
    saveJson(files.clients, [adminClient]);
    console.log(`Admin client registered with ID: ${clientId}`);

    // Create config file for the admin client
    const configPath = path.join(dirs.keys, `${adminName}_config.json`);
    const config = {
      clientId,
      name: adminName,
      privateKeyPath: `${adminKeyPath}.pem`,
      serverUrl: `ws://${defaults.serverUrl.replace(/^https?:\/\//, '')}`
    };

    saveJson(configPath, config);
    console.log(`Admin config saved to: ${configPath}`);

    return clientId;
  } catch (error) {
    console.error('Failed to generate admin client:', error.message);
    return null;
  }
}

/**
 * Check if admin client already exists and prompt for regeneration if needed
 *
 * @param {string} adminName - Name for the admin client
 * @param {number} keySize - Size of RSA key to generate
 * @returns {Promise<string|null>} Admin client ID if successful, null otherwise
 */
async function setupAdminClient(adminName, keySize) {
  if (fs.existsSync(files.clients)) {
    const shouldRegenerate = await confirm(
      rl,
      'Admin client credentials already exist. Generate a new admin client?',
      false
    );

    if (shouldRegenerate) {
      return generateAdminClient(adminName, keySize);
    } else {
      console.log('Skipping admin client generation');
      return null;
    }
  } else {
    console.log('No client credentials found. Setting up admin client...');
    return generateAdminClient(adminName, keySize);
  }
}

/**
 * Setup environment file with default configuration
 *
 * @returns {void}
 */
function setupEnvFile() {
  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('Created .env file from .env.example');
    } else {
      const defaultEnv = `PORT=3000
HOST=0.0.0.0
OLLAMA_API_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2
LOG_LEVEL=info
`;
      fs.writeFileSync(envPath, defaultEnv);
      console.log('Created default .env file');
    }

    console.log('Please review the .env file and adjust settings as needed');
  } else {
    console.log('.env file already exists');
  }
}

/**
 * Display help information for the script
 */
function showHelp() {
  console.log('Usage: node setup-server.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --admin-name <name>    Name for the admin client (default: admin)');
  console.log('  --key-size <bits>      Size of RSA key in bits (default: 2048)');
  console.log('  --help, -h             Show this help message');
  console.log('');
  console.log('Description:');
  console.log('  This script initializes the Ollama WebSocket server by:');
  console.log('  - Creating required directories');
  console.log('  - Compiling TypeScript code if needed');
  console.log('  - Generating admin client credentials');
  console.log('  - Creating default configuration files');
  console.log('');
  console.log('Example:');
  console.log('  node setup-server.js --admin-name superuser --key-size 4096');
}

/**
 * Main function to run the setup process
 */
async function main() {
  try {
    console.log('=== Ollama WebSocket Server Setup ===\n');

    // Show help if requested
    if (cli.help) {
      showHelp();
      rl.close();
      return;
    }

    // Get configuration from arguments
    const adminName = cli.flags['admin-name'];
    const keySize = parseInt(cli.flags['key-size'], 10);

    // Setup directories
    setupDirectories();

    // Check compiled code
    const compiled = checkCompiledCode();
    if (!compiled) {
      console.log('Continuing setup without compiled code...');
    }

    // Setup admin client
    await setupAdminClient(adminName, keySize);

    // Setup .env file
    setupEnvFile();

    console.log('\n=== Setup Complete ===');
    console.log('\nYou can now start the server with:');
    console.log('  npm start');

    console.log('\nOr using Docker:');
    console.log('  npm run docker:build');
    console.log('  npm run docker:start');

  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Execute the script
main();
