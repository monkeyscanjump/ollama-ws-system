import { createLogger, CLIENT, ReconnectInfo } from '@ws-system/shared';

const logger = createLogger('client:reconnect');

/**
 * Creates a manager for handling reconnection logic with exponential backoff
 */
export function createReconnectionManager(
  baseDelay: number,
  onReconnect: () => Promise<void>
) {
  let reconnectAttempts = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let maxAttempts: number = CLIENT.MAX_RECONNECT_ATTEMPTS;

  return {
    /**
     * Schedules a reconnection attempt with exponential backoff
     */
    scheduleReconnect(
      onReconnecting: (info: ReconnectInfo) => void,
      onFailed: (error: Error) => void
    ): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      reconnectAttempts++;

      if (reconnectAttempts <= maxAttempts) {
        // Calculate exponential backoff with jitter
        const exponentialDelay = Math.min(
          CLIENT.MAX_RECONNECT_DELAY,
          baseDelay * Math.pow(2, reconnectAttempts - 1)
        );

        // Add jitter (±20%)
        const jitter = exponentialDelay * CLIENT.RECONNECT_JITTER_FACTOR;
        const delay = exponentialDelay - jitter + (Math.random() * jitter * 2);

        logger.info(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxAttempts})`);

        // Use the ReconnectInfo interface for type consistency
        onReconnecting({
          attempt: reconnectAttempts,
          delay,
          maxAttempts
        });

        reconnectTimer = setTimeout(() => {
          onReconnect().catch(err => {
            logger.error(`Reconnection failed: ${err.message}`);
            onFailed(err);
          });
        }, delay);
      } else {
        logger.error(`Maximum reconnection attempts (${maxAttempts}) reached`);
        onFailed(new Error(`Maximum reconnection attempts (${maxAttempts}) reached`));
      }
    },

    /**
     * Resets the reconnection attempts counter
     */
    resetAttempts(): void {
      reconnectAttempts = 0;
    },

    /**
     * Clears any pending reconnection timer
     */
    clearTimer(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    },

    /**
     * Updates the base reconnection delay
     */
    setDelay(delay: number): void {
      baseDelay = delay;
    },

    /**
     * Gets current reconnection attempt count
     */
    getAttempts(): number {
      return reconnectAttempts;
    },

    /**
     * Sets maximum reconnection attempts
     */
    setMaxAttempts(attempts: number): void {
      maxAttempts = attempts;
    }
  };
}

export type ReconnectionManager = ReturnType<typeof createReconnectionManager>;
