import WebSocket from 'ws';
import { MessageType } from '../types';
import { createLogger } from '../utils';
import { connectionManager } from './connection.manager';
import { handleAuthentication } from './auth.handler';

const logger = createLogger('ws:message.handler');

/**
 * Handle WebSocket messages
 * @param ws WebSocket connection
 * @param data Raw message data
 * @param connectionId Unique connection identifier
 * @param ip Client IP address
 * @param ollamaClient Ollama API client
 * @param defaultModel Default model to use
 */
export async function handleMessage(
  ws: WebSocket,
  data: WebSocket.Data,
  connectionId: string,
  ip: string | string[],
  ollamaClient: any,
  defaultModel: string
): Promise<void> {
  try {
    const message = JSON.parse(data.toString());

    // Handle authentication
    if (message.type === MessageType.AUTHENTICATE) {
      handleAuthentication(ws, connectionId, message, ip);
      return;
    }

    // Verify authentication for all other messages
    const connState = connectionManager.getConnection(connectionId);
    if (!connState || !connState.authenticated) {
      ws.send(JSON.stringify({
        type: MessageType.ERROR,
        error: 'Not authenticated',
        code: 'unauthorized',
        timestamp: Date.now()
      }));
      return;
    }

    // Handle message types
    switch (message.type) {
      case MessageType.GENERATE: {
        await handleGenerateMessage(ws, message, connectionId, ollamaClient, defaultModel);
        break;
      }

      case MessageType.STOP: {
        handleStopMessage(ws, message, connectionId);
        break;
      }

      case MessageType.MODELS: {
        await handleModelsMessage(ws, message, ollamaClient);
        break;
      }

      case MessageType.PING: {
        const { id } = message;
        ws.send(JSON.stringify({
          id,
          type: MessageType.PONG,
          timestamp: Date.now()
        }));
        break;
      }

      default: {
        ws.send(JSON.stringify({
          type: MessageType.ERROR,
          error: `Unsupported message type: ${message.type}`,
          timestamp: Date.now()
        }));
      }
    }
  } catch (error) {
    logger.error('Error handling message:', error);

    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      error: 'Server error: ' + (error as Error).message,
      code: 'server_error',
      timestamp: Date.now()
    }));
  }
}

/**
 * Handle text generation request
 */
async function handleGenerateMessage(
  ws: WebSocket,
  message: any,
  connectionId: string,
  ollamaClient: any,
  defaultModel: string
): Promise<void> {
  const { id, prompt, model, options } = message;

  if (!id || !prompt) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      id,
      error: 'Missing required fields',
      timestamp: Date.now()
    }));
    return;
  }

  const modelToUse = model || defaultModel || 'llama2';

  try {
    // Signal generation start to client
    ws.send(JSON.stringify({
      id,
      type: MessageType.STREAM_START,
      model: modelToUse,
      timestamp: Date.now()
    }));

    // Setup cancellation
    const abortController = new AbortController();

    // Track active generation
    connectionManager.addGeneration(id, connectionId, abortController, modelToUse);

    let totalTokens = 0;

    // Generate text with streaming
    const result = await ollamaClient.generate({
      model: modelToUse,
      prompt,
      options: options || {},
      abortSignal: abortController.signal,
      onToken: (token: string) => {
        totalTokens++;

        ws.send(JSON.stringify({
          id,
          type: MessageType.STREAM_TOKEN,
          token,
          timestamp: Date.now()
        }));
      }
    });

    // Generation complete
    const endTime = Date.now();
    const generation = connectionManager.getGeneration(id);

    ws.send(JSON.stringify({
      id,
      type: MessageType.STREAM_END,
      totalTokens,
      elapsedTime: generation ? endTime - generation.startTime : null,
      timestamp: endTime
    }));

    connectionManager.removeGeneration(id);
  } catch (error) {
    // Handle cancellation vs error
    if ((error as any).cancelled) {
      ws.send(JSON.stringify({
        id,
        type: MessageType.STREAM_END,
        isCancelled: true,
        timestamp: Date.now()
      }));
    } else {
      logger.error('Generation error:', error);
      ws.send(JSON.stringify({
        id,
        type: MessageType.ERROR,
        error: 'Generation failed: ' + (error as Error).message,
        code: 'generation_error',
        timestamp: Date.now()
      }));
    }

    connectionManager.removeGeneration(id);
  }
}

/**
 * Handle generation stop request
 */
function handleStopMessage(ws: WebSocket, message: any, connectionId: string): void {
  const { id, requestId } = message;

  if (!requestId) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      id,
      error: 'Missing requestId',
      timestamp: Date.now()
    }));
    return;
  }

  // Validate generation exists
  const generation = connectionManager.getGeneration(requestId);

  if (!generation) {
    ws.send(JSON.stringify({
      id,
      type: MessageType.ERROR,
      error: 'No active generation with that ID',
      timestamp: Date.now()
    }));
    return;
  }

  // Verify ownership
  if (generation.connectionId !== connectionId) {
    ws.send(JSON.stringify({
      id,
      type: MessageType.ERROR,
      error: 'Not authorized to stop this generation',
      timestamp: Date.now()
    }));
    return;
  }

  // Cancel generation
  generation.abortController.abort();

  ws.send(JSON.stringify({
    id,
    type: MessageType.ACK,
    requestId,
    action: 'stop',
    timestamp: Date.now()
  }));

  logger.info(`Cancelled generation ${requestId}`);
}

/**
 * Handle models listing request
 */
async function handleModelsMessage(ws: WebSocket, message: any, ollamaClient: any): Promise<void> {
  const { id } = message;

  try {
    const models = await ollamaClient.listModels();

    ws.send(JSON.stringify({
      id,
      type: MessageType.MODELS_RESULT,
      models,
      timestamp: Date.now()
    }));
  } catch (error) {
    logger.error('Error listing models:', error);
    ws.send(JSON.stringify({
      id,
      type: MessageType.ERROR,
      error: 'Failed to list models: ' + (error as Error).message,
      timestamp: Date.now()
    }));
  }
}
