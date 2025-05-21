import { createLogger } from '../utils';
import { authConfig } from '../config';
import { SECURITY } from '../constants';

const logger = createLogger('security:rate-limiter');

interface RateLimitAttempt {
  consecutiveFailures: number;
  lastAttempt: number;
  blockedUntil: number;
}

/**
 * Rate limiter with exponential backoff for authentication attempts
 */
class RateLimiter {
  private attempts = new Map<string, RateLimitAttempt>();
  private readonly authWindow: number;
  public readonly maxAttempts: number;
  private cleanupInterval: NodeJS.Timeout;

  /**
   * Create a new rate limiter
   * @param authWindow - Time window in ms for considering consecutive attempts
   * @param maxAttempts - Maximum number of attempts allowed in the window
   */
  constructor(authWindow = authConfig.authWindow, maxAttempts = authConfig.maxAttempts) {
    this.authWindow = authWindow;
    this.maxAttempts = maxAttempts;

    // Set up cleanup of expired records
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredRecords(),
      SECURITY.CLEANUP_INTERVAL_MS
    );

    // Prevent timer from keeping Node process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Generate a consistent key for rate limiting from client ID and IP
   * @param clientId Client identifier
   * @param ip IP address (string or array)
   * @returns Rate limiting key
   */
  generateKey(clientId: string, ip: string | string[]): string {
    const ipStr = Array.isArray(ip) ? ip[0] : ip;
    return `${ipStr}:${clientId}`;
  }

  /**
   * Record an authentication attempt and check if the client is rate limited
   * @param key - Unique key identifying the client (e.g. ip:clientId)
   * @returns Object with isLimited and waitTime properties
   */
  checkRateLimit(key: string): { isLimited: boolean; waitTime: number } {
    const now = Date.now();
    const attempt = this.attempts.get(key) || {
      consecutiveFailures: 0,
      lastAttempt: 0,
      blockedUntil: 0
    };

    // Check if currently blocked
    if (attempt.blockedUntil > now) {
      const waitTime = Math.ceil((attempt.blockedUntil - now) / 1000);
      return { isLimited: true, waitTime };
    }

    // Reset count after window expires
    if (now - attempt.lastAttempt > this.authWindow) {
      attempt.consecutiveFailures = 0;
    }

    attempt.lastAttempt = now;
    this.attempts.set(key, attempt);

    return { isLimited: false, waitTime: 0 };
  }

  /**
   * Get the number of remaining attempts before rate limiting
   * @param key Client identifier key
   * @returns Number of remaining attempts
   */
  getRemainingAttempts(key: string): number {
    const attempt = this.attempts.get(key);
    if (!attempt) {
      return this.maxAttempts;
    }
    return Math.max(0, this.maxAttempts - attempt.consecutiveFailures);
  }

  /**
   * Record a failed authentication attempt and apply exponential backoff
   * @param key - Unique key identifying the client
   * @returns Object with isLimited and waitTime properties
   */
  recordFailure(key: string): { isLimited: boolean; waitTime: number } {
    const now = Date.now();
    const attempt = this.attempts.get(key) || {
      consecutiveFailures: 0,
      lastAttempt: now,
      blockedUntil: 0
    };

    attempt.consecutiveFailures++;

    // Calculate exponential backoff (2^(failures-1) seconds)
    // Cap at maximum backoff time (default: 30 minutes)
    const backoffSeconds = Math.min(
      Math.pow(2, attempt.consecutiveFailures - 1),
      SECURITY.MAX_BACKOFF_SECONDS
    );

    if (attempt.consecutiveFailures >= this.maxAttempts) {
      attempt.blockedUntil = now + (backoffSeconds * 1000);
      this.attempts.set(key, attempt);

      logger.warn(`Client ${key} blocked for ${backoffSeconds} seconds after ${attempt.consecutiveFailures} failed attempts`);
      return { isLimited: true, waitTime: backoffSeconds };
    }

    this.attempts.set(key, attempt);
    return {
      isLimited: false,
      waitTime: 0
    };
  }

  /**
   * Record a successful authentication and reset failure count
   * @param key - Unique key identifying the client
   */
  recordSuccess(key: string): void {
    const attempt = this.attempts.get(key);
    if (attempt) {
      attempt.consecutiveFailures = 0;
      attempt.blockedUntil = 0;
      this.attempts.set(key, attempt);
    }
  }

  /**
   * Clean up expired rate limit records to prevent memory leaks
   */
  private cleanupExpiredRecords(): void {
    const now = Date.now();
    let removedRecords = 0;

    for (const [key, attempt] of this.attempts.entries()) {
      // Remove entries that haven't been used in 24 hours and aren't blocked
      if (now - attempt.lastAttempt > SECURITY.AUTH_RECORD_EXPIRY_MS &&
          attempt.blockedUntil < now) {
        this.attempts.delete(key);
        removedRecords++;
      }
    }

    if (removedRecords > 0) {
      logger.info(`Cleaned up ${removedRecords} expired rate limit records`);
    }
  }

  /**
   * Dispose of the rate limiter and its resources
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Export singleton instance with default settings
export const rateLimiter = new RateLimiter();
