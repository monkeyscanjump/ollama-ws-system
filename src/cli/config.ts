/**
 * Common configuration values for server management scripts
 */
import path from 'path';

// Root project directory
const projectRoot = path.resolve(__dirname, '../..');

// Common directories
const dirs = {
  data: path.join(projectRoot, 'data'),
  keys: path.join(projectRoot, 'keys'),
  backups: path.join(projectRoot, 'data', 'backups'),
  revoked: path.join(projectRoot, 'data', 'revoked')
};

// Common files
const files = {
  clients: path.join(dirs.data, 'authorized_clients.json')
};

// Default values
const defaults = {
  client: 'client',
  maxBackups: 10,
  signatureAlgorithm: 'SHA256',
  keySize: 2048,
  serverUrl: 'http://localhost:3000'
};

export {
  dirs,
  files,
  defaults,
  projectRoot
};
