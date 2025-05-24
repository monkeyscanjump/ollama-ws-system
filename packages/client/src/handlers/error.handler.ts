import { createLogger, ERROR_CODES, ErrorObject } from '@ws-system/shared';
import { RequestManager } from '../utils/request';

const logger = createLogger('client:error');

/**
 * Creates a handler for processing error messages from the server
 *
 * @param requestManager - Manager for tracking and resolving requests
 * @param emitError - Function to emit error events
 * @param setReconnectOptions - Function to configure reconnection behavior
 * @returns Error handler object
 */
export function createErrorHandler(
  requestManager: RequestManager,
  emitError: (error: ErrorObject) => void,
  setReconnectOptions: (options: { autoReconnect?: boolean, delay?: number }) => void
) {
  return {
    /**
     * Processes an error message from the server
     *
     * @param message - The error message to process
     */
    handleError(message: any): void {
      const { error, code, id } = message;

      // Use provided code or fallback to server_error
      const errorCode = code || ERROR_CODES.SERVER_ERROR;

      // Extract a meaningful error message
      const errorMessage = typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : 'Unknown server error';

      // Log with all available context
      logger.error(`Server error: ${errorMessage} (${errorCode})`);

      // Handle specific error types
      switch(errorCode) {
        case ERROR_CODES.INVALID_AUTH:
        case ERROR_CODES.AUTH_TIMEOUT:
          setReconnectOptions({ autoReconnect: false });
          break;

        case ERROR_CODES.RATE_LIMITED:
          if (message.retryAfter) {
            setReconnectOptions({ delay: message.retryAfter * 1000 });
          }
          break;
      }

      // Reject the promise if this error is for a specific request
      if (id && requestManager.hasPendingRequest(id)) {
        requestManager.rejectRequest(id, new Error(`${errorMessage} (${errorCode})`));
      }

      // Create a detailed description for the error object
      const description = typeof error === 'object' && error !== null
        ? (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return 'Error object could not be serialized';
            }
          })()
        : typeof error === 'string' ? error : 'No additional details';

      // Emit standardized error object
      emitError({
        message: errorMessage,
        code: errorCode,
        description,
        id
      });
    }
  };
}

export type ErrorHandler = ReturnType<typeof createErrorHandler>;
