import { EventEmitter } from 'events';
import { createLogger } from '../utils';
import {
  ClientOptions,
  TokenEvent,
  GenerationStartEvent,
  GenerationEndEvent,
  ConnectionStatus,
  ErrorObject,
  ModelInfo,
  GenerationOptions,
  MessageType
} from './types';
import {
  CLIENT,
  ERROR_CODES,
  CONNECTION_STATUS,
  CONNECTION_EVENTS
} from './constants';

// Import utilities and handlers
import { createRequestManager } from './utils/request';
import { createReconnectionManager } from './utils/reconnect';
import { createAuthHandler } from './handlers/auth.handler';
import { createErrorHandler } from './handlers/error.handler';
import { createMessageHandler } from './handlers/message.handler';
import { createConnectionHandler } from './handlers/connection.handler';
import { validateMessage } from './utils/message-validator';
import { ConfigManager } from './utils/config-manager';
import { EventManager } from './utils/event-manager';
import { ApiClient } from './api-client';
import { generateId } from './utils/id-generator';

const logger = createLogger('client:ws-client');

export class WSClient extends EventEmitter {
  private isConnected = false;
  private isAuthenticated = false;
  private isConnecting = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;

  // Managers and handlers
  private configManager: ConfigManager;
  private eventManager: EventManager;
  private requestManager: ReturnType<typeof createRequestManager>;
  private reconnectionManager: ReturnType<typeof createReconnectionManager>;
  private connectionHandler: ReturnType<typeof createConnectionHandler>;
  private authHandler: ReturnType<typeof createAuthHandler>;
  private errorHandler: ReturnType<typeof createErrorHandler>;
  private messageHandler: ReturnType<typeof createMessageHandler>;
  private apiClient: ApiClient;

  constructor(options: ClientOptions) {
    super();

    // Initialize managers
    this.configManager = new ConfigManager(options);
    this.eventManager = new EventManager(this);

    // Initialize request manager
    this.requestManager = createRequestManager(this.configManager.requestTimeout);

    // Initialize reconnection manager
    this.reconnectionManager = createReconnectionManager(
      this.configManager.reconnectDelay,
      () => this.connect().catch(err => this.handleReconnectionError(err))
    );

    // Initialize connection handler
    this.connectionHandler = createConnectionHandler(
      this.configManager.serverUrl,
      this.handleConnected.bind(this),
      this.handleMessage.bind(this),
      this.handleDisconnect.bind(this),
      this.handleConnectionError.bind(this)
    );

    // Initialize auth handler
    this.authHandler = createAuthHandler(
      this.configManager.clientId,
      this.configManager.privateKey,
      this.configManager.signatureAlgorithm,
      (msg) => this.connectionHandler.send(msg),
      (err) => this.emit(CONNECTION_EVENTS.ERROR, err)
    );

    // Initialize error handler
    this.errorHandler = createErrorHandler(
      this.requestManager,
      (err) => this.emit(CONNECTION_EVENTS.ERROR, err),
      (options) => {
        this.configManager.updateReconnectSettings(options.autoReconnect, options.delay);
        if (options.delay !== undefined) {
          this.reconnectionManager.setDelay(options.delay);
        }
      }
    );

    // Initialize message handler
    this.messageHandler = createMessageHandler(
      this.authHandler,
      this.errorHandler,
      this.requestManager,
      (event, data) => this.emit(event, data),
      this.handleAuthenticated.bind(this),
      this.handleAuthFailed.bind(this),
      this.startPingInterval.bind(this)
    );

    // Initialize API client
    this.apiClient = new ApiClient(
      this.connectionHandler,
      this.messageHandler,
      this.requestManager,
      () => this.isAuthenticated,
      () => this.connect()
    );

    // Auto-connect if enabled
    if (this.configManager.autoConnect) {
      setTimeout(() => {
        this.connect().catch(err => {
          logger.error(`Auto-connect failed: ${err.message}`);
          this.emit(CONNECTION_EVENTS.ERROR, {
            message: `Auto-connect failed: ${err.message}`,
            code: ERROR_CODES.SERVER_ERROR,
            description: 'Failed to auto-connect to server'
          });
        });
      }, 0);
    }
  }

  // Connection management
  async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.status = CONNECTION_STATUS.CONNECTING;
    this.emit(CONNECTION_EVENTS.CONNECTING);

    return new Promise<void>((resolve, reject) => {
      try {
        this.cleanup(false);

        // Use once() to ensure these handlers only fire once
        this.once(CONNECTION_EVENTS.AUTHENTICATED, () => {
          this.isConnecting = false;
          this.authHandler.clearChallengeTimeout();
          resolve();
        });

        this.once(CONNECTION_EVENTS.AUTH_FAILED, (error) => {
          this.isConnecting = false;
          this.authHandler.clearChallengeTimeout();
          reject(new Error(`Authentication failed: ${error}`));
        });

        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            this.cleanup(false);
            const error = new Error('Connection timeout');
            this.emit(CONNECTION_EVENTS.ERROR, {
              message: error.message,
              code: ERROR_CODES.CONNECTION_TIMEOUT,
              description: 'Failed to connect within timeout period'
            });
            reject(error);
          }
        }, this.configManager.requestTimeout);

        // Clear timeout on either success or failure
        const clearConnectionTimeout = () => {
          clearTimeout(connectionTimeout);
        };
        this.once(CONNECTION_EVENTS.AUTHENTICATED, clearConnectionTimeout);
        this.once(CONNECTION_EVENTS.AUTH_FAILED, clearConnectionTimeout);

        // Establish connection
        this.connectionHandler.connect();

        // Start challenge timeout after connection is initiated
        this.authHandler.startChallengeTimeout(() => {
          this.disconnect();
          reject(new Error('Authentication challenge timeout'));
        });
      } catch (err) {
        this.isConnecting = false;
        this.status = CONNECTION_STATUS.DISCONNECTED;
        logger.error(`Connection error: ${(err as Error).message}`);
        reject(new Error(`Connection failed: ${(err as Error).message}`));
      }
    });
  }

  disconnect(): void {
    logger.info('Disconnecting from WebSocket server');
    this.cleanup(true);
    this.status = CONNECTION_STATUS.DISCONNECTED;
    this.emit(CONNECTION_EVENTS.DISCONNECTED, {
      code: CLIENT.NORMAL_CLOSURE,
      reason: 'Client disconnected'
    });
  }

  // Event handlers
  private handleConnected(): void {
    this.isConnected = true;
    this.status = CONNECTION_STATUS.CONNECTED;
    this.emit(CONNECTION_EVENTS.CONNECTED);
  }

  private handleMessage(message: any): void {
    if (validateMessage(message)) {
      this.messageHandler.handleMessage(message);
    }
  }

  private handleAuthenticated(): void {
    this.isAuthenticated = true;
    this.status = CONNECTION_STATUS.AUTHENTICATED;
    this.reconnectionManager.resetAttempts();
    this.emit(CONNECTION_EVENTS.AUTHENTICATED);
    this.startPingInterval();
  }

  private handleAuthFailed(error: string): void {
    this.status = CONNECTION_STATUS.AUTH_FAILED;
    this.emit(CONNECTION_EVENTS.AUTH_FAILED, error);
  }

  private handleDisconnect(code?: number, reason?: string): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.status = CONNECTION_STATUS.DISCONNECTED;

    logger.info(`WebSocket disconnected: ${code} ${reason || ''}`);

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (wasConnected) {
      this.emit(CONNECTION_EVENTS.DISCONNECTED, { code, reason });
    }

    if (this.configManager.autoReconnect && !this.isConnecting) {
      this.status = CONNECTION_STATUS.RECONNECTING;
      this.reconnectionManager.scheduleReconnect(
        (info) => this.emit(CONNECTION_EVENTS.RECONNECTING, info),
        (error) => {
          this.status = CONNECTION_STATUS.RECONNECT_FAILED;
          this.emit(CONNECTION_EVENTS.RECONNECT_FAILED, error);
        }
      );
    }
  }

  private handleConnectionError(error: Error): void {
    this.emit(CONNECTION_EVENTS.ERROR, {
      message: error.message,
      code: ERROR_CODES.SERVER_ERROR,
      description: 'WebSocket connection error'
    });
  }

  private handleReconnectionError(err: Error): void {
    logger.error(`Reconnection failed: ${err.message}`);
    this.emit(CONNECTION_EVENTS.ERROR, {
      message: `Reconnection failed: ${err.message}`,
      code: ERROR_CODES.RECONNECT_FAILED,
      description: 'Failed to reconnect to server'
    });
  }

  // Utilities
  private cleanup(complete: boolean): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.reconnectionManager.clearTimer();
    this.authHandler.clearChallengeTimeout();
    this.requestManager.rejectAll('Connection closed');
    this.messageHandler.clearActiveGenerations();

    if (complete) {
      this.connectionHandler.disconnect();
    }

    this.isConnected = false;
    this.isAuthenticated = false;
    this.isConnecting = false;
  }

  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    logger.info(`Starting ping interval (${this.configManager.pingIntervalMs}ms)`);

    this.pingInterval = setInterval(() => {
      if (this.isAuthenticated && this.connectionHandler.isConnected()) {
        try {
          this.connectionHandler.send({
            type: MessageType.PING,
            id: generateId('ping'),
            timestamp: Date.now()
          });
        } catch (err) {
          logger.error(`Failed to send ping: ${(err as Error).message}`);
        }
      }
    }, this.configManager.pingIntervalMs);
  }

  // Public API
  async listModels(): Promise<ModelInfo[]> {
    return this.apiClient.listModels();
  }

  async generate(prompt: string, model?: string, options?: GenerationOptions): Promise<string> {
    return this.apiClient.generate(prompt, model, options);
  }

  async stopGeneration(generationId: string): Promise<void> {
    return this.apiClient.stopGeneration(generationId);
  }

  async sendBatch(messages: any[]): Promise<void> {
    return this.apiClient.sendBatch(messages);
  }

  // Status methods
  getStatus(): ConnectionStatus {
    return this.status;
  }

  isReady(): boolean {
    return this.isConnected && this.isAuthenticated;
  }

  // Event subscription methods
  onToken(callback: (event: TokenEvent) => void): () => void {
    return this.eventManager.onToken(callback);
  }

  onGenerationStart(callback: (event: GenerationStartEvent) => void): () => void {
    return this.eventManager.onGenerationStart(callback);
  }

  onGenerationEnd(callback: (event: GenerationEndEvent) => void): () => void {
    return this.eventManager.onGenerationEnd(callback);
  }

  onError(callback: (error: ErrorObject) => void): () => void {
    return this.eventManager.onError(callback);
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    return this.eventManager.setupConnectionChangeHandler(callback);
  }
}
