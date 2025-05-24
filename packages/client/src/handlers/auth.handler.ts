import crypto from 'crypto';
import {
  createLogger,
  CLIENT,
  ERROR_CODES,
  MessageType,
  ErrorObject
} from '@ws-system/shared';

const logger = createLogger('client:auth');

/**
 * Creates an authentication handler with challenge-response functionality
 */
export function createAuthHandler(
  clientId: string,
  privateKey: string,
  signatureAlgorithm: string,
  sendMessage: (message: any) => void,
  emitError: (error: ErrorObject) => void
) {
  let challengeTimer: NodeJS.Timeout | null = null;
  let isChallengeSent = false;

  return {
    /**
     * Starts a timer for receiving the authentication challenge
     */
    startChallengeTimeout(onTimeout: () => void, timeout: number = CLIENT.AUTH_CHALLENGE_TIMEOUT): void {
      this.clearChallengeTimeout();

      logger.info(`Starting challenge timeout (${timeout}ms)`);
      isChallengeSent = false;

      challengeTimer = setTimeout(() => {
        if (!isChallengeSent) {
          logger.error('Authentication challenge timeout');
          emitError({
            message: 'Authentication challenge timeout',
            code: ERROR_CODES.AUTH_CHALLENGE_TIMEOUT,
            description: 'Server did not send challenge within timeout period'
          });
          onTimeout();
        }
      }, timeout);
    },

    /**
     * Clears the challenge timeout if it exists
     */
    clearChallengeTimeout(): void {
      if (challengeTimer) {
        clearTimeout(challengeTimer);
        challengeTimer = null;
        logger.debug('Challenge timeout cleared');
      }
    },

    /**
     * Handles an authentication challenge by signing it and sending a response
     */
    handleChallenge(challenge: string): void {
      try {
        // Mark that we received the challenge
        isChallengeSent = true;

        // Clear the challenge timeout since we received the challenge
        this.clearChallengeTimeout();

        logger.info(`Received authentication challenge: ${challenge.substring(0, 10)}...`);

        // Create signature using the private key
        const sign = crypto.createSign(signatureAlgorithm);
        sign.update(challenge);
        const signature = sign.sign(privateKey, 'base64');

        // Send authentication response
        sendMessage({
          type: MessageType.AUTHENTICATE,
          clientId,
          signature,
          timestamp: Date.now()
        });

        logger.info('Sent authentication response');
      } catch (err) {
        logger.error(`Authentication error: ${(err as Error).message}`);
        emitError({
          message: `Authentication error: ${(err as Error).message}`,
          code: ERROR_CODES.INVALID_AUTH,
          description: 'Failed to sign authentication challenge'
        });
      }
    },

    /**
     * Checks if a challenge has been sent by the server
     */
    isChallengeSent(): boolean {
      return isChallengeSent;
    },

    /**
     * Resets the authentication state
     */
    reset(): void {
      this.clearChallengeTimeout();
      isChallengeSent = false;
    }
  };
}

export type AuthHandler = ReturnType<typeof createAuthHandler>;
