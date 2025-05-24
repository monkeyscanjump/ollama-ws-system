import { ErrorCode } from '../types/base';
/**
 * Core constants shared between server and client
 */

// Security constants
export const SECURITY = {
  CHALLENGE_EXPIRY_MS: 10 * 60 * 1000, // 10 minutes
  DEFAULT_SIGNATURE_ALGORITHM: 'SHA256',
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  AUTH_RECORD_EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_BACKOFF_SECONDS: 1800, // 30 minutes max exponential backoff
};

// WebSocket codes and reasons
export const WEBSOCKET = {
  CLOSE_CODES: {
    NORMAL_CLOSURE: 1000,
    SERVER_ERROR: 1011,
    AUTH_FAILED: 4000,
    AUTH_TIMEOUT: 4001,
    RATE_LIMITED: 4002,
    POLICY_VIOLATION: 1008
  },
  DISCONNECT_REASONS: {
    AUTH_TIMEOUT: 'authentication_timeout',
    AUTH_FAILED: 'authentication_failed',
    RATE_LIMITED: 'rate_limited',
    CLIENT_CLOSED: 'client_closed_connection',
    SERVER_SHUTDOWN: 'server_shutdown',
    NORMAL_CLOSURE: 'normal_closure'
  }
};

// Unified error codes used by both server and client
export const ERROR_CODES: Record<string, ErrorCode> = {
  // Server-side errors
  INVALID_AUTH: 'invalid_authentication' as ErrorCode,
  AUTH_TIMEOUT: 'authentication_timeout' as ErrorCode,
  RATE_LIMITED: 'rate_limited' as ErrorCode,
  INVALID_REQUEST: 'invalid_request' as ErrorCode,
  MISSING_PARAMETERS: 'missing_parameters' as ErrorCode,
  GENERATION_FAILED: 'generation_failed' as ErrorCode,
  SERVER_ERROR: 'server_error' as ErrorCode,

  // Client-side errors
  RECONNECT_FAILED: 'reconnect_failed' as ErrorCode,
  CONNECTION_TIMEOUT: 'connection_timeout' as ErrorCode,
  AUTH_CHALLENGE_TIMEOUT: 'auth_challenge_timeout' as ErrorCode
};
