import { MessageType, OllamaGenerateParams, ErrorCode, OllamaModel } from './base';

/**
 * Base message interface
 */
export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: number;
}

/**
 * Client -> Server messages
 */

export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface AuthenticationMessage extends BaseMessage {
  type: MessageType.AUTHENTICATE;
  clientId: string;
  signature: string;
}

export interface GenerationRequest extends BaseMessage {
  type: MessageType.GENERATE;
  prompt: string;
  model?: string;
  options?: OllamaGenerateParams['options'];
}

export interface StopGenerationRequest extends BaseMessage {
  type: MessageType.STOP;
  requestId: string;
}

export interface ModelsRequest extends BaseMessage {
  type: MessageType.MODELS;
}

export interface BatchRequest extends BaseMessage {
  type: MessageType.BATCH;
  messages: any[];
}

/**
 * Server -> Client messages
 */

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

export interface ChallengeMessage extends BaseMessage {
  type: MessageType.CHALLENGE;
  challenge: string;
}

export interface AuthResultMessage extends BaseMessage {
  type: MessageType.AUTH_RESULT;
  success: boolean;
  message?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string | object;
  code: ErrorCode;
  requestId?: string;
}

export interface StreamStartMessage extends BaseMessage {
  type: MessageType.STREAM_START;
  model: string;
  requestId: string;
}

export interface TokenMessage extends BaseMessage {
  type: MessageType.STREAM_TOKEN;
  token: string;
  requestId: string;
}

export interface StreamEndMessage extends BaseMessage {
  type: MessageType.STREAM_END;
  requestId: string;
  totalTokens: number;
  elapsedTime: number;
  isCancelled?: boolean;
}

export interface ModelsResultMessage extends BaseMessage {
  type: MessageType.MODELS_RESULT;
  models: OllamaModel[];
  requestId: string;
}

export interface AckMessage extends BaseMessage {
  type: MessageType.ACK;
  requestId: string;
  success: boolean;
  message?: string;
}

/**
 * Type guard to check if a message is a specific type
 */
export function isMessageType<T extends BaseMessage>(
  message: BaseMessage,
  type: MessageType
): message is T {
  return message.type === type;
}
