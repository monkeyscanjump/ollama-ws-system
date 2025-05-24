// Configuration
export interface Config {
  port: number;
  host: string;
  ollamaUrl: string;
  defaultModel: string;
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

// Active generation tracking
export interface GenerationState {
  connectionId: string;
  abortController: AbortController;
  startTime: number;
  model: string;
}
