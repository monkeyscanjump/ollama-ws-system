import { ERROR_CODES as SERVER_ERROR_CODES, SECURITY, WEBSOCKET } from '../constants';

/**
 * All error codes - combining server and client-specific codes
 */
export const ERROR_CODES = {
  // Server error codes
  ...SERVER_ERROR_CODES,

  // Client-specific error codes
  RECONNECT_FAILED: 'reconnect_failed',
  CONNECTION_TIMEOUT: 'connection_timeout',
  AUTH_CHALLENGE_TIMEOUT: 'auth_challenge_timeout',
  INVALID_AUTH: 'invalid_auth'
};

/**
 * Default client configuration
 */
export const CLIENT = {
  // Connection parameters
  DEFAULT_RECONNECT_DELAY: 1000,
  DEFAULT_PING_INTERVAL: 30000,
  DEFAULT_REQUEST_TIMEOUT: 60000,
  MAX_RECONNECT_ATTEMPTS: 10,
  MAX_RECONNECT_DELAY: 30000,
  RECONNECT_JITTER_FACTOR: 0.2,

  // Authentication parameters
  AUTH_CHALLENGE_TIMEOUT: 10000,

  // WebSocket close codes
  NORMAL_CLOSURE: 1000,

  // Signature algorithm
  DEFAULT_SIGNATURE_ALGORITHM: SECURITY.DEFAULT_SIGNATURE_ALGORITHM,
};

/**
 * Connection status values
 */
export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  AUTH_FAILED: 'auth_failed',
  RECONNECTING: 'reconnecting',
  RECONNECT_FAILED: 'reconnect_failed'
};

/**
 * Event names for connection state changes
 */
export const CONNECTION_EVENTS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  AUTHENTICATED: 'authenticated',
  AUTH_FAILED: 'auth_failed',
  RECONNECTING: 'reconnecting',
  RECONNECT_FAILED: 'reconnect_failed',
  ERROR: 'error'
};

/**
 * Event names for domain events
 */
export const DOMAIN_EVENTS = {
  TOKEN: 'token',
  GENERATION_START: 'generation_start',
  GENERATION_END: 'generation_end',
  ACK: 'ack',
  PONG: 'pong'
};

// Re-export server constants
export { WEBSOCKET };
