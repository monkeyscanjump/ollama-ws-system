import { OllamaModel, OllamaGenerateParams, ErrorCode } from './base';

// Generation options type
export type GenerationOptions = OllamaGenerateParams['options'];

// Model information
export type ModelInfo = OllamaModel;

// Connection status
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'auth_failed'
  | 'reconnecting'
  | 'reconnect_failed';

// Connection event names
export type ConnectionEvent =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'authenticated'
  | 'auth_failed'
  | 'reconnecting'
  | 'reconnect_failed'
  | 'error';

// Domain event names
export type DomainEvent =
  | 'token'
  | 'generation_start'
  | 'generation_end'
  | 'ack'
  | 'pong';

// Client configuration options
export interface ClientOptions {
  serverUrl: string;
  clientId: string;
  privateKeyPath: string;
  signatureAlgorithm?: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  pingInterval?: number;
  requestTimeout?: number;
  autoConnect?: boolean;
}

// Token generation event
export interface TokenEvent {
  id: string;
  token: string;
  timestamp: number;
}

// Generation start event
export interface GenerationStartEvent {
  id: string;
  model: string;
  timestamp: number;
}

// Generation end event
export interface GenerationEndEvent {
  id: string;
  totalTokens: number;
  elapsedTime: number;
  isCancelled?: boolean;
  timestamp: number;
}

// Error object structure
export interface ErrorObject {
  message: string;
  code: ErrorCode;
  description: string;
  id?: string;
}

// Reconnection information
export interface ReconnectInfo {
  attempt: number;
  delay: number;
  maxAttempts: number;
}

// Disconnection information
export interface DisconnectInfo {
  code?: number;
  reason?: string;
}
