import { SECURITY } from './base';
import { ConnectionStatus, ConnectionEvent, DomainEvent } from '../types/client';

// Client configuration defaults
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

  // Signature algorithm
  DEFAULT_SIGNATURE_ALGORITHM: SECURITY.DEFAULT_SIGNATURE_ALGORITHM,
};

// Connection status values
export const CONNECTION_STATUS: Record<string, ConnectionStatus> = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  AUTH_FAILED: 'auth_failed',
  RECONNECTING: 'reconnecting',
  RECONNECT_FAILED: 'reconnect_failed'
};

// Event names for connection state changes
export const CONNECTION_EVENTS: Record<string, ConnectionEvent> = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  AUTHENTICATED: 'authenticated',
  AUTH_FAILED: 'auth_failed',
  RECONNECTING: 'reconnecting',
  RECONNECT_FAILED: 'reconnect_failed',
  ERROR: 'error'
};

// Event names for domain events
export const DOMAIN_EVENTS: Record<string, DomainEvent> = {
  TOKEN: 'token',
  GENERATION_START: 'generation_start',
  GENERATION_END: 'generation_end',
  ACK: 'ack',
  PONG: 'pong'
};
