#!/usr/bin/env node
/**
 * Key Generation Utility
 *
 * Generates RSA key pairs for client authentication with the Ollama WebSocket server.
 * Creates both private and public keys in PEM format.
 */
const path = require('path');
const { generateRsaKeyPair, saveKeyPair, generateKeyFingerprint } = require('./utils/crypto');
const { parseArgs } = require('./utils/cli');
const { dirs, defaults } = require('./utils/config');

// Parse command line arguments
const args = process.argv.slice(2);
const cli = parseArgs(args, {
  defaults: {
    'output-dir': dirs.keys,
    'key-size': defaults.keySize
  }
});

/**
 * Displays help information for the script
 */
function showHelp() {
  console.log('Usage: node generate-keys.js [name] [options]');
  console.log('');
  console.log('Arguments:');
  console.log('  name              Client name (default: "client")');
  console.log('');
  console.log('Options:');
  console.log('  --output-dir DIR  Directory to save keys (default: ./keys)');
  console.log('  --key-size SIZE   Key size in bits (default: 2048)');
  console.log('  --help, -h        Show this help message');
  console.log('');
  console.log('Example:');
  console.log('  node generate-keys.js my-client --key-size 4096');
  console.log('  node generate-keys.js admin-client --output-dir ./secure/keys');
}

/**
 * Main function to run the key generation process
 */
function main() {
  // Show help if requested
  if (cli.help) {
    showHelp();
    return;
  }

  // Get client name and configuration
  const clientName = cli._[0] || 'client';
  const outputDir = cli.flags['output-dir'];
  const keySize = parseInt(cli.flags['key-size'], 10);

  console.log('=== RSA Key Pair Generator ===');
  console.log(`Generating ${keySize}-bit keys for client: ${clientName}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('');

  try {
    // Generate the key pair
    const keyPair = generateRsaKeyPair(keySize);

    // Save keys to files
    const keyPaths = saveKeyPair(keyPair, outputDir, clientName);

    // Generate and display fingerprint
    const fingerprint = generateKeyFingerprint(keyPair.publicKey);

    console.log('\nKeys generated successfully!');
    console.log(`Private key: ${keyPaths.privateKeyPath}`);
    console.log(`Public key: ${keyPaths.publicKeyPath}`);
    console.log(`Key fingerprint: ${fingerprint}`);
    console.log('\nKeep your private key secure and use the public key to register with the server.');
    console.log('Register your client with:');
    console.log(`  node register-client.js ${defaults.serverUrl} ${clientName} ${keyPaths.publicKeyPath}`);
  } catch (error) {
    console.error('Error generating keys:', error.message);
    process.exit(1);
  }
}

// Execute the script
main();
