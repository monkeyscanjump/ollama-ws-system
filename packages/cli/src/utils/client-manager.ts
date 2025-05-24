/**
 * Client Management Utility
 *
 * Handles client registration, offline and online modes
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { loadJson, saveJson, ensureDir } from './fs';
import { generateRandomId } from './crypto';
import { defaults } from '../config';
import logger from './logger';
import { AuthorizedClient } from '@ws-system/shared';

/**
 * Validates a public key format
 */
export function validatePublicKey(publicKey: string): boolean {
  try {
    crypto.createPublicKey(publicKey);
    return true;
  } catch (error) {
    logger.error(`Invalid public key format: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Validates a signature algorithm
 */
export function validateAlgorithm(algorithm?: string): boolean {
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
 */
export async function registerClientOffline(
  clientsFile: string,
  name: string,
  publicKey: string,
  algorithm?: string
): Promise<{ clientId: string }> {
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
    const client: AuthorizedClient = {
      id: clientId,
      name,
      publicKey,
      signatureAlgorithm: algorithm || defaults.signatureAlgorithm,
      createdAt: new Date().toISOString()
    };

    // Load existing clients
    let clients = loadJson<AuthorizedClient[]>(clientsFile, true) || [];

    // Add new client
    clients.push(client);

    // Save updated clients
    if (!saveJson(clientsFile, clients)) {
      throw new Error('Failed to save client database');
    }

    logger.success(`Client registered directly to database at: ${clientsFile}`);
    return { clientId };
  } catch (error) {
    throw new Error(`Offline registration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Registers a client with the server API (online mode)
 */
export async function registerClientOnline(
  url: string,
  name: string,
  publicKey: string,
  algorithm?: string
): Promise<any> {
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
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
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
 */
export function saveClientConfig(
  clientId: string,
  name: string,
  publicKeyPath: string,
  serverUrl: string,
  algorithm?: string
): string | null {
  try {
    // Derive private key path from public key path
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
    logger.error(`Failed to save client configuration: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Reads a public key from the specified file path
 */
export function readPublicKey(keyPath: string): string | null {
  if (!keyPath) {
    return null;
  }

  try {
    // Resolve path (handle both absolute and relative paths)
    const resolvedPath = path.resolve(process.cwd(), keyPath);
    logger.info(`Attempting to read key from: ${resolvedPath}`);

    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    logger.error(`Error reading key file: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Find a client by ID or name
 */
export function findClient(
  clients: AuthorizedClient[],
  identifier: string
): AuthorizedClient | undefined {
  // Try to find by ID first
  const clientById = clients.find(c => c.id === identifier);
  if (clientById) return clientById;

  // Try to find by name (case insensitive)
  return clients.find(c => c.name.toLowerCase() === identifier.toLowerCase());
}

/**
 * Revoke a client's access by removing it from the database
 */
export async function revokeClient(
  clientsFile: string,
  identifier: string,
  revokedDir: string,
  reason = 'Manual revocation via CLI tool'
): Promise<AuthorizedClient | null> {
  try {
    // Load clients
    const clients = loadJson<AuthorizedClient[]>(clientsFile);

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
    logger.error(`Error revoking client: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Changed to throw error for consistency
  }
}

/**
 * Format date string for display
 */
export function formatDate(dateString?: string): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Format size of key for display
 */
export function formatKeySize(key: string): number {
  const lines = key.split('\n').filter(line => !line.includes('BEGIN') && !line.includes('END'));
  const base64Length = lines.join('').length;
  return Math.floor(base64Length * 0.75);  // Approximate size of decoded base64
}

/**
 * List all clients in the database
 */
export function listClients(clientsFile: string): AuthorizedClient[] | null {
  try {
    const clients = loadJson<AuthorizedClient[]>(clientsFile);

    if (!clients || !Array.isArray(clients)) {
      return null;
    }

    // Sort by creation date (newest first)
    return clients.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    logger.error(`Error listing clients: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
