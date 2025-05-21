import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '../utils';
import { FILES } from '../constants';

const logger = createLogger('security:clients');

// Storage configuration
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), FILES.DATA_DIR);
const CLIENTS_FILE = path.join(DATA_DIR, FILES.CLIENTS_FILE);

/**
 * Represents an authorized client with authentication and tracking data
 */
export interface AuthorizedClient {
  /** Unique identifier for the client */
  id: string;
  /** Human-readable name for the client */
  name: string;
  /** PEM-encoded public key used for authentication */
  publicKey: string;
  /** ISO timestamp when the client was created */
  createdAt: string;
  /** Signature algorithm to use for verification (default: SHA256) */
  signatureAlgorithm?: string;
  /** ISO timestamp of last successful authentication */
  lastConnected?: string;
  /** IP address of the last connection */
  lastIP?: string;
}

// Cache clients in memory to reduce disk reads
let clientCache: AuthorizedClient[] = [];

/**
 * Loads authorized clients from persistent storage
 *
 * @returns Array of authorized clients
 */
export function loadAuthorizedClients(): AuthorizedClient[] {
  try {
    // Return cached clients if available - FIXED: check for non-empty array
    if (clientCache.length > 0) {
      return clientCache;
    }

    if (!fs.existsSync(CLIENTS_FILE)) {
      logger.info(`No clients file found at ${CLIENTS_FILE}, creating empty database`);

      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      fs.writeFileSync(CLIENTS_FILE, '[]');
      clientCache = [];
      return [];
    }

    const data = fs.readFileSync(CLIENTS_FILE, 'utf8');
    clientCache = JSON.parse(data);
    return clientCache;
  } catch (error) {
    logger.error(`Failed to load authorized clients: ${error}`);
    return [];
  }
}

/**
 * Persists the client list to disk
 *
 * @param clients - Array of clients to save
 * @returns True if save was successful, false otherwise
 */
export function saveAuthorizedClients(clients: AuthorizedClient[]): boolean {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
    clientCache = clients; // Update cache
    return true;
  } catch (error) {
    logger.error(`Failed to save authorized clients: ${error}`);
    return false;
  }
}

/**
 * Registers a new client with the provided public key
 *
 * @param name - Human-readable identifier for the client
 * @param publicKey - PEM-encoded public key for authentication
 * @param signatureAlgorithm - Algorithm to use for signature verification
 * @returns The generated client ID
 */
export function registerClient(
  name: string,
  publicKey: string,
  signatureAlgorithm?: string
): string {
  // Load existing clients
  const clients = loadAuthorizedClients();

  // Generate a new client ID
  const clientId = crypto.randomBytes(16).toString('hex');

  // Create new client record
  const newClient: AuthorizedClient = {
    id: clientId,
    name,
    publicKey,
    createdAt: new Date().toISOString()
  };

  // Add signature algorithm if provided
  if (signatureAlgorithm) {
    newClient.signatureAlgorithm = signatureAlgorithm;
  }

  // Add to client database
  clients.push(newClient);

  // Save updated client database
  saveAuthorizedClients(clients);

  logger.info(`Registered new client: ${name} (${clientId})${
    signatureAlgorithm ? ` with algorithm ${signatureAlgorithm}` : ''
  }`);
  return clientId;
}

/**
 * Retrieves client information by ID
 *
 * @param clientId - The unique ID of the client to find
 * @returns The client object or undefined if not found
 */
export function getAuthorizedClient(clientId: string): AuthorizedClient | undefined {
  const clients = loadAuthorizedClients();
  return clients.find(client => client.id === clientId);
}

/**
 * Revokes a client's access by removing it from the authorized clients list
 *
 * @param clientId - The unique ID of the client to revoke
 * @returns True if client was found and revoked, false otherwise
 */
export function revokeClient(clientId: string): boolean {
  // Load existing clients
  const clients = loadAuthorizedClients();

  // Find client index
  const clientIndex = clients.findIndex(client => client.id === clientId);

  if (clientIndex === -1) {
    logger.warn(`Attempted to revoke non-existent client: ${clientId}`);
    return false;
  }

  // Remove client from array
  clients.splice(clientIndex, 1);

  // Save updated client database
  saveAuthorizedClients(clients);

  logger.info(`Revoked client: ${clientId}`);
  return true;
}

/**
 * Updates connection tracking information for a client
 *
 * @param clientId - The unique ID of the client to update
 * @param connectionData - Object containing connection information
 * @returns True if client was found and updated, false otherwise
 */
export function saveClientConnectionState(
  clientId: string,
  connectionData: { lastConnected: string, lastIP?: string }
): boolean {
  // Load existing clients
  const clients = loadAuthorizedClients();

  // Find client
  const client = clients.find(c => c.id === clientId);

  if (!client) {
    logger.warn(`Attempted to update state for non-existent client: ${clientId}`);
    return false;
  }

  // Update client data
  client.lastConnected = connectionData.lastConnected;
  if (connectionData.lastIP) {
    client.lastIP = connectionData.lastIP;
  }

  // Save updated client database
  saveAuthorizedClients(clients);

  logger.info(`Updated connection state for client: ${clientId}`);
  return true;
}

/**
 * Clears the client cache, forcing reload from disk on next access
 * Used primarily for testing or after external modifications to the client file
 */
export function clearClientCache(): void {
  clientCache = [];
  logger.info('Client cache cleared');
}
