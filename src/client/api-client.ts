import { createLogger } from '../utils';
import {
  MessageType,
  GenerationOptions,
  ModelInfo
} from './types';
import { generateId } from './utils/id-generator';
import { MessageHandler } from './handlers/message.handler';
import { ConnectionHandler } from './handlers/connection.handler';
import { RequestManager } from './utils/request';

const logger = createLogger('client:api');

export class ApiClient {
  private connectionHandler: ConnectionHandler;
  private messageHandler: MessageHandler;
  private requestManager: RequestManager;
  private getIsAuthenticated: () => boolean;
  private connect: () => Promise<void>;

  /**
   * Creates an API client for interacting with the Ollama service
   */
  constructor(
    connectionHandler: ConnectionHandler,
    messageHandler: MessageHandler,
    requestManager: RequestManager,
    getIsAuthenticated: () => boolean,
    connect: () => Promise<void>
  ) {
    this.connectionHandler = connectionHandler;
    this.messageHandler = messageHandler;
    this.requestManager = requestManager;
    this.getIsAuthenticated = getIsAuthenticated;
    this.connect = connect;
  }

  /**
   * Fetches available models from the server
   */
  async listModels(): Promise<ModelInfo[]> {
    if (!this.getIsAuthenticated()) {
      await this.connect();
    }

    const id = generateId('models');
    logger.info('Requesting model list');

    try {
      this.connectionHandler.send({
        type: MessageType.MODELS,
        id,
        timestamp: Date.now()
      });

      return this.requestManager.createRequest<ModelInfo[]>(id);
    } catch (err) {
      logger.error(`Failed to list models: ${(err as Error).message}`);
      throw new Error(`Failed to list models: ${(err as Error).message}`);
    }
  }

  /**
   * Starts text generation with the specified model and options
   */
  async generate(prompt: string, model?: string, options?: GenerationOptions): Promise<string> {
    if (!this.getIsAuthenticated()) {
      await this.connect();
    }

    const id = generateId('gen');
    logger.info(`Generating text with ${model || 'default model'}`);

    try {
      this.connectionHandler.send({
        type: MessageType.GENERATE,
        id,
        prompt,
        ...(model && { model }),
        ...(options && { options }),
        timestamp: Date.now()
      });

      return id;
    } catch (err) {
      logger.error(`Failed to start generation: ${(err as Error).message}`);
      throw new Error(`Failed to start generation: ${(err as Error).message}`);
    }
  }

  /**
   * Stops an active text generation
   */
  async stopGeneration(generationId: string): Promise<void> {
    if (!this.getIsAuthenticated()) {
      await this.connect();
    }

    if (!this.messageHandler.isGenerationActive(generationId)) {
      logger.warn(`Attempted to stop unknown generation: ${generationId}`);
      return;
    }

    logger.info(`Stopping generation: ${generationId}`);

    try {
      this.connectionHandler.send({
        type: MessageType.STOP,
        id: generateId('stop'),
        requestId: generationId,
        timestamp: Date.now()
      });
    } catch (err) {
      logger.error(`Failed to stop generation: ${(err as Error).message}`);
      throw new Error(`Failed to stop generation: ${(err as Error).message}`);
    }
  }

  /**
   * Sends multiple messages in a single batch
   */
  async sendBatch(messages: any[]): Promise<void> {
    if (!this.getIsAuthenticated()) {
      await this.connect();
    }

    if (!this.connectionHandler.isConnected()) {
      throw new Error('WebSocket is not connected');
    }

    const prepared = messages.map(msg => ({
      ...msg,
      id: msg.id || generateId('batch'),
      timestamp: msg.timestamp || Date.now()
    }));

    this.connectionHandler.send({
      type: MessageType.BATCH,
      messages: prepared,
      id: generateId('batch'),
      timestamp: Date.now()
    });
  }
}
