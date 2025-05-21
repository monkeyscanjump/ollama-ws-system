import fetch from 'node-fetch';
import { createLogger } from '../utils';
import { OllamaGenerateParams, OllamaModel } from '../types';

const logger = createLogger('services:ollama');

// Map to track active generations for cancellation
const activeRequests = new Map<string, AbortController>();

/**
 * Creates an Ollama API client with streaming text generation support
 *
 * @param baseUrl - The base URL of the Ollama API (e.g., http://localhost:11434)
 * @returns Object with methods to interact with Ollama API
 */
export function createOllamaClient(baseUrl: string) {
  const apiUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  /**
   * Lists available models from the Ollama API
   *
   * @returns Promise resolving to array of available models
   */
  async function listModels(): Promise<OllamaModel[]> {
    logger.info('Listing models');

    const response = await fetch(`${apiUrl}/api/tags`, {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Failed to list models:', error);
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    const data = await response.json() as { models: OllamaModel[] };
    return data.models;
  }

  /**
   * Generates text using a specified model with streaming support
   *
   * @param params - Generation parameters including model, prompt, and options
   * @returns Promise resolving to the complete generated text
   */
  async function generate(params: OllamaGenerateParams & {
    requestId?: string;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const { model, prompt, options = {}, onToken, requestId, abortSignal } = params;
    const id = requestId || Math.random().toString(36).substring(2, 15);

    logger.info({ model, requestId: id }, 'Generating text');

    const controller = new AbortController();

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort());
    }

    activeRequests.set(id, controller);

    try {
      const response = await fetch(`${apiUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          ...options
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ model, requestId: id }, `Generation error: ${response.status} ${errorText}`);
        throw new Error(`Ollama API error: ${response.status} ${errorText}`);
      }

      let fullResponse = '';
      const stream = response.body;
      const decoder = new TextDecoder();
      let buffer = '';

      if (!stream) {
        throw new Error('Response body stream is null');
      }

      // Return a Promise that handles the stream with events instead of async iteration
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          try {
            buffer += decoder.decode(Buffer.from(chunk), { stream: true });
            let boundary = buffer.indexOf('\n');

            while (boundary !== -1) {
              const line = buffer.substring(0, boundary);
              buffer = buffer.substring(boundary + 1);

              if (line.trim()) {
                try {
                  const data = JSON.parse(line);

                  if (data.response) {
                    fullResponse += data.response;
                    onToken?.(data.response);
                  }

                  if (data.done) {
                    logger.info({ requestId: id }, 'Generation complete');
                  }
                } catch (e) {
                  logger.error({ requestId: id }, `Error parsing JSON: ${e}`);
                }
              }

              boundary = buffer.indexOf('\n');
            }
          } catch (err) {
            reject(err);
          }
        });

        stream.on('end', () => {
          // Process any remaining data in buffer
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              if (data.response) {
                fullResponse += data.response;
                onToken?.(data.response);
              }
            } catch (e) {
              // Ignore parsing errors in final buffer
            }
          }

          activeRequests.delete(id);
          logger.info({ model, requestId: id, chars: fullResponse.length }, 'Generation finished');
          resolve(fullResponse);
        });

        stream.on('error', (err) => {
          activeRequests.delete(id);
          logger.error({ requestId: id }, `Stream error: ${err}`);
          reject(err);
        });
      });
    } catch (error) {
      activeRequests.delete(id);

      if ((error as any).name === 'AbortError') {
        logger.info({ requestId: id }, 'Generation cancelled');
        const cancelledError = new Error('Generation cancelled');
        (cancelledError as any).cancelled = true;
        throw cancelledError;
      }

      logger.error({ requestId: id }, `Generation error: ${error}`);
      throw error;
    }
  }

  /**
   * Cancels an ongoing text generation
   *
   * @param requestId - The ID of the generation to cancel
   * @returns True if generation was found and cancelled, false otherwise
   */
  function cancelGeneration(requestId: string): boolean {
    if (activeRequests.has(requestId)) {
      logger.info(`Cancelling generation ${requestId}`);
      activeRequests.get(requestId)!.abort();
      activeRequests.delete(requestId);
      return true;
    }

    logger.warn(`Attempted to cancel unknown generation ${requestId}`);
    return false;
  }

  return {
    listModels,
    generate,
    cancelGeneration
  };
}
