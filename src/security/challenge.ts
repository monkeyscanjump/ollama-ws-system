import crypto from 'crypto';
import { createLogger } from '../utils';
import { SECURITY } from '../constants';

const logger = createLogger('security:challenge');

/**
 * Map to store active challenges with their expiration timestamps and timeout handles
 */
const activeChallenge = new Map<string, {
  challenge: string,
  expiresAt: number,
  timeoutId: NodeJS.Timeout
}>();

/**
 * Generates a cryptographically secure random challenge
 */
export function generateChallenge(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Stores a challenge for a connection with automatic expiration
 */
export function storeChallenge(connectionId: string, challenge: string): void {
  // First clear any existing challenge for this connection
  clearChallenge(connectionId);

  const expiresAt = Date.now() + SECURITY.CHALLENGE_EXPIRY_MS;

  // Create timeout for auto-cleanup
  const timeoutId = setTimeout(() => {
    if (activeChallenge.has(connectionId)) {
      activeChallenge.delete(connectionId);
      logger.info(`Challenge for connection ${connectionId} expired and removed`);
    }
  }, SECURITY.CHALLENGE_EXPIRY_MS);

  // Prevent timer from keeping Node.js alive
  if (timeoutId.unref) {
    timeoutId.unref();
  }

  activeChallenge.set(connectionId, { challenge, expiresAt, timeoutId });

  logger.info(`Stored challenge for connection ${connectionId}`);
}

/**
 * Verifies a challenge is valid and has not expired
 * If valid, removes the challenge to prevent replay attacks
 */
export function verifyChallenge(connectionId: string, challenge: string): boolean {
  const storedData = activeChallenge.get(connectionId);

  if (!storedData) {
    logger.warn(`No challenge found for connection ${connectionId}`);
    return false;
  }

  if (Date.now() > storedData.expiresAt) {
    logger.warn(`Challenge for connection ${connectionId} has expired`);
    clearChallenge(connectionId);
    return false;
  }

  const isValid = storedData.challenge === challenge;

  if (isValid) {
    // Consume the challenge to prevent replay attacks
    clearChallenge(connectionId);
    logger.info(`Challenge for connection ${connectionId} verified successfully and consumed`);
  } else {
    logger.warn(`Invalid challenge for connection ${connectionId}`);
  }

  return isValid;
}

/**
 * Explicitly clears a challenge for a connection
 * Used after authentication or when a connection is closed
 */
export function clearChallenge(connectionId: string): void {
  const storedData = activeChallenge.get(connectionId);

  if (storedData) {
    // Clear the timeout to prevent the callback from executing
    clearTimeout(storedData.timeoutId);
    activeChallenge.delete(connectionId);
    logger.info(`Cleared challenge for connection ${connectionId}`);
  }
}
