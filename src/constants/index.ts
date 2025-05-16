/**
 * Application-wide constants that are not derived from environment variables
 */

// Security constants
export const SECURITY = {
  CHALLENGE_EXPIRY_MS: 10 * 60 * 1000, // 10 minutes
  DEFAULT_SIGNATURE_ALGORITHM: 'SHA256',
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  AUTH_RECORD_EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_BACKOFF_SECONDS: 1800, // 30 minutes max exponential backoff
};

// File system constants
export const FILES = {
  DATA_DIR: 'data',
  CLIENTS_FILE: 'authorized_clients.json',
  BACKUPS_DIR: 'backups',
  REVOKED_DIR: 'revoked',
  DEFAULT_MAX_BACKUPS: 10,
};

// WebSocket message constants
export const WEBSOCKET = {
  DISCONNECT_REASONS: {
    AUTH_TIMEOUT: 'authentication_timeout',
    AUTH_FAILED: 'authentication_failed',
    RATE_LIMITED: 'rate_limited',
    CLIENT_CLOSED: 'client_closed_connection',
    SERVER_SHUTDOWN: 'server_shutdown',
  },
};

// Error codes
export const ERROR_CODES = {
  INVALID_AUTH: 'invalid_authentication',
  AUTH_TIMEOUT: 'authentication_timeout',
  RATE_LIMITED: 'rate_limited',
  INVALID_REQUEST: 'invalid_request',
  MISSING_PARAMETERS: 'missing_parameters',
  GENERATION_FAILED: 'generation_failed',
  SERVER_ERROR: 'server_error',
};
