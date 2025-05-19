/**
 * Client Management Utility
 *
 * Handles client registration, offline and online modes
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { loadJson, saveJson, ensureDir } = require('./fs');
const { generateRandomId } = require('./crypto');
const { defaults } = require('./config');
const logger = require('./logger');

/**
 * Validates a public key format
 *
 * @param {string} publicKey - The public key content
 * @returns {boolean} Whether the key is valid
 */
function validatePublicKey(publicKey) {
  try {
    crypto.createPublicKey(publicKey);
    return true;
  } catch (error) {
    logger.error(`Invalid public key format: ${error.message}`);
    return false;
  }
}

/**
 * Validates a signature algorithm
 *
 * @param {string} algorithm - The algorithm to validate
 * @returns {boolean} Whether the algorithm is valid
 */
function validateAlgorithm(algorithm) {
  if (!algorithm) return true;

  try {
    crypto.createVerify(algorithm);
    return true;
  } catch (error) {
    logger.error(`Unsupported signature algorithm: ${algorithm}`);
    return false;
  }
}

/**
 * Registers a client directly in the database (offline mode)
 *
 * @param {string} clientsFile - Path to the clients database file
 * @param {string} name - The client name
 * @param {string} publicKey - The public key content
 * @param {string} [algorithm] - Optional signature algorithm to use
 * @returns {Promise<object>} The client data with clientId
 * @throws {Error} If registration fails
 */
async function registerClientOffline(clientsFile, name, publicKey, algorithm) {
  try {
    // Validate inputs
    if (!validatePublicKey(publicKey)) {
      throw new Error('Invalid public key format');
    }

    if (!validateAlgorithm(algorithm)) {
      throw new Error(`Unsupported signature algorithm: ${algorithm}`);
    }

    // Generate client ID
    const clientId = generateRandomId();

    // Create client object
    const client = {
      id: clientId,
      name,
      publicKey,
      signatureAlgorithm: algorithm || defaults.signatureAlgorithm,
      createdAt: new Date().toISOString()
    };

    // Load existing clients
    let clients = loadJson(clientsFile, true) || [];

    // Add new client
    clients.push(client);

    // Save updated clients
    if (!saveJson(clientsFile, clients)) {
      throw new Error('Failed to save client database');
    }

    logger.success(`Client registered directly to database at: ${clientsFile}`);
    return { clientId };
  } catch (error) {
    throw new Error(`Offline registration failed: ${error.message}`);
  }
}

/**
 * Registers a client with the server API (online mode)
 *
 * @param {string} url - The server URL
 * @param {string} name - The client name
 * @param {string} publicKey - The public key content
 * @param {string} [algorithm] - Optional signature algorithm to use
 * @returns {Promise<object>} The server response with clientId
 * @throws {Error} If registration fails
 */
async function registerClientOnline(url, name, publicKey, algorithm) {
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
 * @returns {string|null} Path to the saved configuration file or null if save failed
 */
function saveClientConfig(clientId, name, publicKeyPath, serverUrl, algorithm) {
  try {
    // Derive private key path from public key path
    // Resolve path to ensure it's absolute
    const resolvedKeyPath = path.resolve(process.cwd(), publicKeyPath);
    const privateKeyPath = resolvedKeyPath.replace('.pub', '.pem');
    const configPath = path.join(path.dirname(resolvedKeyPath), `${name}_config.json`);

    const config = {
      clientId,
      name,
      privateKeyPath,
      serverUrl,
      signatureAlgorithm: algorithm || defaults.signatureAlgorithm
    };

    const saveSuccess = saveJson(configPath, config);
    if (saveSuccess) {
      logger.success(`Client configuration saved to: ${configPath}`);
      return configPath;
    } else {
      logger.error(`Failed to save client configuration to: ${configPath}`);
      return null;
    }
  } catch (error) {
    logger.error(`Failed to save client configuration: ${error.message}`);
    return null;
  }
}

/**
 * Reads a public key from the specified file path
 *
 * @param {string} keyPath - Path to the public key file
 * @returns {string|null} The public key content or null if error
 */
function readPublicKey(keyPath) {
  if (!keyPath) {
    return null;
  }

  try {
    // Resolve path (handle both absolute and relative paths)
    const resolvedPath = path.resolve(process.cwd(), keyPath);
    logger.info(`Attempting to read key from: ${resolvedPath}`);

    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    logger.error(`Error reading key file: ${error.message}`);
    return null;
  }
}

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
 * @param {string} clientsFile - Path to the clients database file
 * @param {string} identifier - Client ID or name to revoke
 * @param {string} revokedDir - Directory to save revoked client backups
 * @param {string} [reason] - Reason for revocation
 * @returns {Promise<Object|null>} The revoked client or null if failed
 * @throws {Error} If there's an unexpected error during revocation
 */
async function revokeClient(clientsFile, identifier, revokedDir, reason = 'Manual revocation via CLI tool') {
  try {
    // Load clients
    const clients = loadJson(clientsFile);

    if (!clients || clients.length === 0) {
      logger.info('No clients registered.');
      return null;
    }

    // Find the client
    const client = findClient(clients, identifier);

    if (!client) {
      logger.warn(`No client found with ID or name: ${identifier}`);
      return null;
    }

    // Filter out the client
    const updatedClients = clients.filter(c => c.id !== client.id);

    // Save updated clients
    const saveSuccess = saveJson(clientsFile, updatedClients);

    if (saveSuccess) {
      logger.success(`Access revoked for client "${client.name}" (ID: ${client.id})`);

      // Save backup of the client data
      ensureDir(revokedDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(revokedDir, `${client.id}_${timestamp}.json`);

      saveJson(backupFile, {
        client,
        revokedAt: new Date().toISOString(),
        reason
      });

      logger.info(`Backup of client data saved to: ${backupFile}`);
      return client;
    } else {
      logger.error('Failed to revoke client due to error saving client database.');
      return null;
    }
  } catch (error) {
    logger.error(`Error revoking client: ${error.message}`);
    throw error; // Changed to throw error for consistency
  }
}

/**
 * Format date string for display
 *
 * @param {string} dateString - ISO date string to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Format size of key for display
 *
 * @param {string} key - PEM-encoded key
 * @returns {number} Approximate size of the key in bytes
 */
function formatKeySize(key) {
  const lines = key.split('\n').filter(line => !line.includes('BEGIN') && !line.includes('END'));
  const base64Length = lines.join('').length;
  return Math.floor(base64Length * 0.75);  // Approximate size of decoded base64
}

/**
 * List all clients in the database
 *
 * @param {string} clientsFile - Path to the clients database
 * @returns {Array|null} Array of clients or null if error
 */
function listClients(clientsFile) {
  try {
    const clients = loadJson(clientsFile);

    if (!clients || !Array.isArray(clients)) {
      return null;
    }

    // Sort by creation date (newest first)
    return clients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    logger.error(`Error listing clients: ${error.message}`);
    return null;
  }
}

module.exports = {
  validatePublicKey,
  validateAlgorithm,
  registerClientOffline,
  registerClientOnline,
  saveClientConfig,
  readPublicKey,
  findClient,
  revokeClient,
  formatDate,
  formatKeySize,
  listClients
};
