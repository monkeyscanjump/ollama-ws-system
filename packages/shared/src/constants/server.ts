/**
 * Server-specific constants
 */

// File system paths
export const FILES = {
  DATA_DIR: 'data',
  CLIENTS_FILE: 'authorized_clients.json',
  BACKUPS_DIR: 'backups',
  REVOKED_DIR: 'revoked',
  DEFAULT_MAX_BACKUPS: 10,
};

// Server defaults
export const SERVER = {
  DEFAULT_PORT: 3000,
  DEFAULT_HOST: '127.0.0.1',
  DEFAULT_OLLAMA_URL: 'http://localhost:11434',
  DEFAULT_MODEL: 'llama2',
  AUTH_TIMEOUT_MS: 30000, // 30 seconds
  PING_INTERVAL_MS: 30000, // 30 seconds
};
