import { createLogger } from '@ws-system/shared';

const logger = createLogger('client:request');

/**
 * Creates a manager for tracking pending requests with automatic timeout handling
 *
 * @param requestTimeout - Timeout in milliseconds after which requests are automatically rejected
 * @returns Request manager object
 */
export function createRequestManager(requestTimeout: number) {
  const pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }>();

  return {
    /**
     * Creates a new request with automatic timeout
     *
     * @param id - Unique identifier for the request
     * @returns Promise that resolves with the request result or rejects on timeout
     */
    createRequest<T>(id: string): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pendingRequests.has(id)) {
            logger.warn(`Request ${id} timed out after ${requestTimeout}ms`);
            pendingRequests.delete(id);
            reject(new Error(`Request timed out after ${requestTimeout}ms`));
          }
        }, requestTimeout);

        pendingRequests.set(id, { resolve, reject, timeout });
      });
    },

    /**
     * Resolves a pending request with the provided result
     *
     * @param id - Identifier of the request to resolve
     * @param result - Result value to resolve the request with
     * @returns True if the request was found and resolved, false otherwise
     */
    resolveRequest<T>(id: string, result: T): boolean {
      const request = pendingRequests.get(id);
      if (request) {
        clearTimeout(request.timeout);
        request.resolve(result);
        pendingRequests.delete(id);
        return true;
      }
      return false;
    },

    /**
     * Rejects a pending request with the provided error
     *
     * @param id - Identifier of the request to reject
     * @param error - Error to reject the request with
     * @returns True if the request was found and rejected, false otherwise
     */
    rejectRequest(id: string, error: Error): boolean {
      const request = pendingRequests.get(id);
      if (request) {
        clearTimeout(request.timeout);
        request.reject(error);
        pendingRequests.delete(id);
        return true;
      }
      return false;
    },

    /**
     * Rejects all pending requests with the same error message
     *
     * @param reason - Error message for rejecting all requests
     */
    rejectAll(reason: string): void {
      for (const [id, request] of pendingRequests.entries()) {
        clearTimeout(request.timeout);
        request.reject(new Error(reason));
        pendingRequests.delete(id);
      }
    },

    /**
     * Checks if a request with the given ID is pending
     *
     * @param id - Request identifier to check
     * @returns True if the request exists and is pending
     */
    hasPendingRequest(id: string): boolean {
      return pendingRequests.has(id);
    }
  };
}

export type RequestManager = ReturnType<typeof createRequestManager>;
