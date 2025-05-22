/**
 * Common configuration values for server management scripts
 * Reads from environment variables when available, with fallbacks to defaults
 */
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Root project directory
const projectRoot = path.resolve(__dirname, '../..');

// Get data directory from environment or use default
const dataDir = process.env.DATA_DIR
  ? path.isAbsolute(process.env.DATA_DIR)
    ? process.env.DATA_DIR
    : path.join(projectRoot, process.env.DATA_DIR)
  : path.join(projectRoot, 'data');

// Common directories - respecting DATA_DIR from environment
const dirs = {
  data: dataDir,
  keys: process.env.KEYS_DIR ? path.join(projectRoot, process.env.KEYS_DIR) : path.join(projectRoot, 'keys'),
  backups: process.env.BACKUPS_DIR ? path.join(process.env.BACKUPS_DIR) : path.join(dataDir, 'backups'),
  revoked: process.env.REVOKED_DIR ? path.join(process.env.REVOKED_DIR) : path.join(dataDir, 'revoked'),
  cloudflared: process.env.CLOUDFLARED_DIR ? path.join(process.env.CLOUDFLARED_DIR) : path.join(dataDir, 'cloudflared')
};

// Common files
const files = {
  clients: process.env.CLIENTS_FILE ? path.join(process.env.CLIENTS_FILE) : path.join(dirs.data, 'authorized_clients.json'),
  env: path.join(projectRoot, '.env')
};

// Default values - with environment overrides
const defaults = {
  client: process.env.DEFAULT_CLIENT_NAME || 'client',
  maxBackups: process.env.MAX_BACKUPS ? parseInt(process.env.MAX_BACKUPS) : 10,
  signatureAlgorithm: process.env.DEFAULT_SIGNATURE_ALGORITHM || 'SHA256',
  keySize: process.env.KEY_SIZE ? parseInt(process.env.KEY_SIZE) : 2048,
  serverUrl: process.env.SERVER_URL || process.env.HOST
    ? `http://${process.env.HOST}:${process.env.PORT || '3000'}`
    : 'http://localhost:3000',
  cloudflareHostname: process.env.CLOUDFLARE_HOSTNAME || 'subdomain.example.com',
  cloudflareTunnelName: process.env.CLOUDFLARE_TUNNEL_NAME || 'ws-system',
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  host: process.env.HOST || '0.0.0.0',
  dockerTag: process.env.DOCKER_TAG || 'latest',
  containerPrefix: process.env.CONTAINER_PREFIX || 'ws-system',
  alpineTag: process.env.ALPINE_TAG || '3.19',
  nodeVersion: process.env.NODE_VERSION || '20.13.1'
};

export {
  dirs,
  files,
  defaults,
  projectRoot
};
