#!/usr/bin/env node
/**
 * Client Registration Tool
 *
 * Registers a new client with the Ollama WebSocket server by
 * uploading a public key and receiving a client ID for authentication.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { loadJson, saveJson } = require('./utils/fs');
const { createInterface, parseArgs, confirm } = require('./utils/cli');
const { generateKeyFingerprint } = require('./utils/crypto');
const { defaults } = require('./utils/config');

// Parse command line arguments
const args = process.argv.slice(2);
const cli = parseArgs(args, {
  defaults: {
    'server-url': defaults.serverUrl
  }
});

// Create interactive readline interface
const rl = createInterface();

/**
 * Reads a public key from the specified file path
 *
 * @param {string} keyPath - Path to the public key file
 * @returns {Promise<string>} The public key content
 */
async function readPublicKey(keyPath) {
  if (!keyPath) {
    return promptForKeyPath();
  }

  try {
    return fs.readFileSync(keyPath, 'utf8');
  } catch (error) {
    console.error(`Error reading key file: ${error.message}`);
    return promptForKeyPath();
  }
}

/**
 * Prompts the user to enter a path to a public key file
 *
 * @returns {Promise<string>} The public key content
 */
function promptForKeyPath() {
  return new Promise((resolve) => {
    rl.question('Enter path to public key file: ', (answer) => {
      try {
        const content = fs.readFileSync(answer, 'utf8');
        resolve(content);
      } catch (error) {
        console.error(`Error reading key file: ${error.message}`);
        resolve(promptForKeyPath());
      }
    });
  });
}

/**
 * Prompts the user to enter a client name if not provided
 *
 * @returns {Promise<string>} The client name
 */
function promptForClientName() {
  return new Promise((resolve) => {
    rl.question('Enter client name: ', (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompts the user to enter a signature algorithm if not provided
 *
 * @returns {Promise<string|undefined>} The selected algorithm or undefined for default
 */
function promptForAlgorithm() {
  return new Promise((resolve) => {
    rl.question('Enter signature algorithm (press Enter for default SHA256): ', (answer) => {
      const algorithm = answer.trim();
      resolve(algorithm || undefined);
    });
  });
}

/**
 * Registers a client with the server
 *
 * @param {string} url - The server URL
 * @param {string} name - The client name
 * @param {string} publicKey - The public key content
 * @param {string} [algorithm] - Optional signature algorithm to use
 * @returns {Promise<object>} The server response with clientId
 */
async function registerClient(url, name, publicKey, algorithm) {
  return new Promise((resolve, reject) => {
    // Prepare request data
    const data = JSON.stringify({
      name,
      publicKey,
      signatureAlgorithm: algorithm
    });

    // Parse URL to get protocol, hostname, port, path
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    // Choose http or https based on protocol
    const requester = parsedUrl.protocol === 'https:' ? https : http;

    // Send request
    const req = requester.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const response = JSON.parse(responseData);
            resolve(response);
          } catch (error) {
            reject(new Error(`Invalid response: ${responseData}`));
          }
        } else {
          reject(new Error(`HTTP error ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Saves the client configuration to a JSON file
 *
 * @param {string} clientId - The client ID returned from the server
 * @param {string} name - The client name
 * @param {string} publicKeyPath - Path to the public key file
 * @param {string} serverUrl - The server URL
 * @param {string} [algorithm] - The signature algorithm used
 * @returns {string} Path to the saved configuration file
 */
function saveClientConfig(clientId, name, publicKeyPath, serverUrl, algorithm) {
  // Derive private key path from public key path
  const privateKeyPath = publicKeyPath.replace('.pub', '.pem');
  const configPath = path.join(path.dirname(publicKeyPath), `${name}_config.json`);

  const config = {
    clientId,
    name,
    privateKeyPath,
    serverUrl,
    signatureAlgorithm: algorithm || defaults.signatureAlgorithm
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Client configuration saved to: ${configPath}`);

  return configPath;
}

/**
 * Main function that orchestrates the client registration process
 */
async function main() {
  // Show help if requested
  if (cli.help) {
    console.log('Usage: node register-client.js [options] [clientName] [publicKeyPath] [signatureAlgorithm]');
    console.log('');
    console.log('Options:');
    console.log('  --server-url URL      URL of the server (default: http://localhost:3000)');
    console.log('  --help, -h            Show this help message');
    console.log('');
    console.log('Arguments:');
    console.log('  clientName            Name for the client');
    console.log('  publicKeyPath         Path to public key file (.pub)');
    console.log('  signatureAlgorithm    Signature algorithm to use (default: SHA256)');
    console.log('');
    console.log('Supported algorithms:');
    console.log('  SHA256, SHA384, SHA512 (recommended)');
    console.log('  RSA-SHA256, RSA-SHA384, RSA-SHA512');
    console.log('');
    console.log('Example:');
    console.log('  node register-client.js --server-url http://localhost:3000 my-client ./keys/my-client_key.pub SHA512');
    process.exit(0);
  }

  try {
    // Get server URL and other arguments
    const serverUrl = cli.flags['server-url'];
    const clientName = cli._[0] || await promptForClientName();
    const publicKeyPath = cli._[1];
    const signatureAlgorithm = cli._[2];

    console.log('=== Client Registration Tool ===');
    console.log(`Server URL: ${serverUrl}`);
    console.log(`Client name: ${clientName}`);
    console.log('');

    // Get public key
    console.log('Reading public key...');
    const publicKey = await readPublicKey(publicKeyPath);

    // Display key fingerprint for verification
    const fingerprint = generateKeyFingerprint(publicKey);
    console.log(`Key fingerprint: ${fingerprint}`);

    // Get signature algorithm if not provided
    const algorithm = signatureAlgorithm || await promptForAlgorithm();

    // Register with server
    console.log(`Registering client "${clientName}" with server at ${serverUrl}...`);
    if (algorithm) {
      console.log(`Using signature algorithm: ${algorithm}`);
    } else {
      console.log(`Using default signature algorithm (${defaults.signatureAlgorithm})`);
    }

    const response = await registerClient(serverUrl, clientName, publicKey, algorithm);

    console.log(`\nSuccess! Client registered with ID: ${response.clientId}`);

    // If we have a key path, save the configuration
    if (publicKeyPath) {
      const configPath = saveClientConfig(response.clientId, clientName, publicKeyPath, serverUrl, algorithm);
      console.log(`\nTo use this client, provide these credentials to your application:`);
      console.log(`- Client ID: ${response.clientId}`);
      console.log(`- Private Key: ${publicKeyPath.replace('.pub', '.pem')}`);
      console.log(`- Server URL: ${serverUrl}`);
      console.log(`- Signature Algorithm: ${algorithm || defaults.signatureAlgorithm}`);
      console.log(`\nOr use the generated config file: ${configPath}`);
    } else {
      console.log(`\nTo use this client, provide these credentials to your application:`);
      console.log(`- Client ID: ${response.clientId}`);
      console.log(`- Private Key: (your private key file)`);
      console.log(`- Server URL: ${serverUrl}`);
      console.log(`- Signature Algorithm: ${algorithm || defaults.signatureAlgorithm}`);
    }
  } catch (error) {
    console.error('Registration failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Execute the script
main();
