import {
  MessageType as ServerMessageType,
  OllamaModel,
  OllamaGenerateParams
} from '../types';
import {
  ERROR_CODES,
  CONNECTION_STATUS,
  CONNECTION_EVENTS,
  DOMAIN_EVENTS
} from './constants';

/**
 * Re-export server message types
 */
export const MessageType = ServerMessageType;

/**
 * Error code type - restricted to values from ERROR_CODES
 * This enforces that only valid error codes can be used
 */
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Generation options for LLM requests
 */
export type GenerationOptions = OllamaGenerateParams['options'];

/**
 * Model information
 */
export type ModelInfo = OllamaModel;

/**
 * Connection status
 */
export type ConnectionStatus = typeof CONNECTION_STATUS[keyof typeof CONNECTION_STATUS];

/**
 * Connection event names
 */
export type ConnectionEvent = typeof CONNECTION_EVENTS[keyof typeof CONNECTION_EVENTS];

/**
 * Domain event names
 */
export type DomainEvent = typeof DOMAIN_EVENTS[keyof typeof DOMAIN_EVENTS];

/**
 * Client configuration options
 */
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

/**
 * Token generation event
 */
export interface TokenEvent {
  id: string;
  token: string;
  timestamp: number;
}

/**
 * Generation start event
 */
export interface GenerationStartEvent {
  id: string;
  model: string;
  timestamp: number;
}

/**
 * Generation end event
 */
export interface GenerationEndEvent {
  id: string;
  totalTokens: number;
  elapsedTime: number;
  isCancelled?: boolean;
  timestamp: number;
}

/**
 * Error object structure
 */
export interface ErrorObject {
  message: string;
  code: ErrorCode;
  description: string;
  id?: string;
}

/**
 * Reconnection information
 */
export interface ReconnectInfo {
  attempt: number;
  delay: number;
  maxAttempts: number;
}

/**
 * Disconnection information
 */
export interface DisconnectInfo {
  code?: number;
  reason?: string;
}

/**
 * Generation request message
 */
export interface GenerationRequest {
  id: string;
  type: typeof MessageType.GENERATE;
  prompt: string;
  model?: string;
  options?: GenerationOptions;
  timestamp: number;
}

/**
 * Stop generation request message
 */
export interface StopGenerationRequest {
  id: string;
  type: typeof MessageType.STOP;
  requestId: string;
  timestamp: number;
}

/**
 * Models list request message
 */
export interface ModelsRequest {
  id: string;
  type: typeof MessageType.MODELS;
  timestamp: number;
}

/**
 * Batch message request
 */
export interface BatchRequest {
  id: string;
  type: typeof MessageType.BATCH;
  messages: any[];
  timestamp: number;
}
