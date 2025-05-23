import { createLogger } from '../../utils';
import { MessageType } from '../types';
import { DOMAIN_EVENTS } from '../constants';
import { RequestManager } from '../utils/request';
import { AuthHandler } from './auth.handler';
import { ErrorHandler } from './error.handler';

const logger = createLogger('client:message');

/**
 * Creates a handler for processing WebSocket messages
 */
export function createMessageHandler(
  authHandler: AuthHandler,
  errorHandler: ErrorHandler,
  requestManager: RequestManager,
  emitEvent: (event: string, data: any) => void,
  onAuthenticated: () => void,
  onAuthFailed: (error: string) => void,
  startPingInterval: () => void
) {
  const activeGenerations = new Set<string>();

  return {
    /**
     * Processes an incoming message based on its type
     */
    handleMessage(message: any): void {
      const { type } = message;

      switch (type) {
        case MessageType.CHALLENGE:
          authHandler.handleChallenge(message.challenge);
          break;

        case MessageType.AUTH_RESULT:
          if (message.success) {
            logger.info('Authentication successful');
            onAuthenticated();
            startPingInterval();
          } else {
            logger.error(`Authentication failed: ${message.error}`);
            onAuthFailed(message.error);
          }
          break;

        case MessageType.PONG:
          emitEvent(DOMAIN_EVENTS.PONG, {
            latency: Date.now() - message.timestamp,
            id: message.id,
            timestamp: message.timestamp
          });
          break;

        case MessageType.ERROR:
          errorHandler.handleError(message);
          break;

        case MessageType.STREAM_START:
          activeGenerations.add(message.id);
          emitEvent(DOMAIN_EVENTS.GENERATION_START, {
            id: message.id,
            model: message.model,
            timestamp: message.timestamp
          });
          break;

        case MessageType.STREAM_TOKEN:
          emitEvent(DOMAIN_EVENTS.TOKEN, {
            id: message.id,
            token: message.token,
            timestamp: message.timestamp
          });
          break;

        case MessageType.STREAM_END:
          activeGenerations.delete(message.id);
          emitEvent(DOMAIN_EVENTS.GENERATION_END, {
            id: message.id,
            totalTokens: message.totalTokens,
            elapsedTime: message.elapsedTime,
            isCancelled: message.isCancelled || false,
            timestamp: message.timestamp
          });
          break;

        case MessageType.MODELS_RESULT:
          requestManager.resolveRequest(message.id, message.models);
          break;

        case MessageType.ACK:
          emitEvent(DOMAIN_EVENTS.ACK, message);
          break;

        case MessageType.BATCH:
          logger.info(`Received batch message with ${message.messages?.length || 0} items`);
          break;

        default:
          logger.debug(`Received unknown message type: ${type}`);
          emitEvent(type, message);
      }
    },

    /**
     * Checks if a generation with the given ID is active
     */
    isGenerationActive(id: string): boolean {
      return activeGenerations.has(id);
    },

    /**
     * Gets a copy of the set of all active generation IDs
     */
    getActiveGenerations(): Set<string> {
      return new Set(activeGenerations);
    },

    /**
     * Clears all active generations tracking
     */
    clearActiveGenerations(): void {
      activeGenerations.clear();
    }
  };
}

export type MessageHandler = ReturnType<typeof createMessageHandler>;
