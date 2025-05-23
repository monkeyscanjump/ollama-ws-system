// Configuration
export interface Config {
  port: number;
  host: string;
  ollamaUrl: string;
  defaultModel: string;
}

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

// Client connection state
export interface ClientState {
  connectionId: string;
  authenticated: boolean;
  clientId: string | null;
  challenge: string;
  connectedAt: Date;
  model?: string;
  activeGeneration?: string;
}

// Extended client state for server use
export interface EnhancedClientState extends ClientState {
  ip: string | string[];
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

export interface GenerationState {
  connectionId: string;
  abortController: AbortController;
  startTime: number;
  model: string;
}
