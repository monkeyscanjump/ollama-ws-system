// WebSocket message types
export enum MessageType {
  PING = 'ping',
  PONG = 'pong',
  CHALLENGE = 'challenge',
  AUTHENTICATE = 'authenticate',
  AUTH_RESULT = 'auth_result',
  ERROR = 'error',
  GENERATE = 'generate',
  MODELS = 'models',
  MODELS_RESULT = 'models_result',
  STOP = 'stop',
  STREAM_START = 'stream_start',
  STREAM_TOKEN = 'stream_token',
  STREAM_END = 'stream_end',
  ACK = 'ack',
  BATCH = 'batch'
}

// Ollama model information
export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
  quantization_level?: string;
}

// Ollama generation parameters
export interface OllamaGenerateParams {
  model: string;
  prompt: string;
  options?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  onToken?: (token: string) => void;
}

// Error codes from constants
export type ErrorCode =
  // Server-side errors
  | 'invalid_authentication'
  | 'authentication_timeout'
  | 'rate_limited'
  | 'invalid_request'
  | 'missing_parameters'
  | 'generation_failed'
  | 'server_error'

  // Client-side errors
  | 'reconnect_failed'
  | 'connection_timeout'
  | 'auth_challenge_timeout'
  | 'invalid_auth';
