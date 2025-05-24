import WebSocket from 'ws';
import { createLogger, MessageType } from '@ws-system/shared';
import {
  verifyClientSignature,
  verifyChallenge,
  clearChallenge,
  getAuthorizedClient,
  saveClientConnectionState,
  rateLimiter
} from '../security';
import { connectionManager } from './connection.manager';

const logger = createLogger('ws:auth.handler');

/**
 * Handle client authentication requests
 */
export function handleAuthentication(
  ws: WebSocket,
  connectionId: string,
  message: any,
  ip: string | string[]
): void {
  const { clientId, signature } = message;

  if (!clientId || !signature) {
    ws.send(JSON.stringify({
      type: MessageType.AUTH_RESULT,
      success: false,
      error: 'Invalid authentication data',
      timestamp: Date.now()
    }));
    return;
  }

  // Rate limiting for authentication attempts
  // Normalize IP - use first IP if it's an array
  const ipStr = Array.isArray(ip) ? ip[0] : ip;
  const authKey = `${ipStr}:${clientId}`;

  // Check if client is rate limited
  const rateLimitCheck = rateLimiter.checkRateLimit(authKey);
  if (rateLimitCheck.isLimited) {
    logger.warn(`Client ${clientId} from ${ipStr} is rate limited for ${rateLimitCheck.waitTime} seconds`);
    ws.send(JSON.stringify({
      type: MessageType.AUTH_RESULT,
      success: false,
      error: `Too many authentication attempts. Please try again in ${rateLimitCheck.waitTime} seconds.`,
      retryAfter: rateLimitCheck.waitTime,
      timestamp: Date.now()
    }));
    return;
  }

  // Get connection state
  const connState = connectionManager.getConnection(connectionId);
  if (!connState) {
    ws.send(JSON.stringify({
      type: MessageType.AUTH_RESULT,
      success: false,
      error: 'Invalid connection',
      timestamp: Date.now()
    }));
    return;
  }

  // Verify challenge is valid and has not expired
  if (!verifyChallenge(connectionId, connState.challenge)) {
    ws.send(JSON.stringify({
      type: MessageType.AUTH_RESULT,
      success: false,
      error: 'Challenge expired or invalid',
      timestamp: Date.now()
    }));
    return;
  }

  // Verify signature against stored challenge
  const isValid = verifyClientSignature(clientId, signature, connState.challenge);

  // Prevent replay attacks
  clearChallenge(connectionId);

  if (isValid) {
    // Verify client still exists and has not been revoked
    const client = getAuthorizedClient(clientId);
    if (!client) {
      ws.send(JSON.stringify({
        type: MessageType.AUTH_RESULT,
        success: false,
        error: 'Client not found or has been revoked',
        timestamp: Date.now()
      }));

      // Record failure even though client not found
      rateLimiter.recordFailure(authKey);
      return;
    }

    // Success - Update connection state
    connectionManager.authenticateConnection(connectionId, clientId);
    connectionManager.clearAuthTimeout(connectionId);

    // Reset rate limiting for this client
    rateLimiter.recordSuccess(authKey);

    // Record successful connection - properly handle IP array
    saveClientConnectionState(clientId, {
      lastConnected: new Date().toISOString(),
      lastIP: Array.isArray(ip) ? ip.join(', ') : ip
    });

    ws.send(JSON.stringify({
      type: MessageType.AUTH_RESULT,
      success: true,
      timestamp: Date.now()
    }));

    logger.info(`Client ${clientId} authenticated successfully`);
  } else {
    // Failed authentication - apply exponential backoff
    const failure = rateLimiter.recordFailure(authKey);

    if (failure.isLimited) {
      ws.send(JSON.stringify({
        type: MessageType.AUTH_RESULT,
        success: false,
        error: `Too many authentication attempts. Please try again in ${failure.waitTime} seconds.`,
        retryAfter: failure.waitTime,
        timestamp: Date.now()
      }));
    } else {
      // Use the rate limiter's methods to get remaining attempts
      const remainingAttempts = rateLimiter.getRemainingAttempts(authKey);

      ws.send(JSON.stringify({
        type: MessageType.AUTH_RESULT,
        success: false,
        error: 'Invalid signature',
        remainingAttempts,
        timestamp: Date.now()
      }));
    }

    logger.warn(`Authentication failed for client ID ${clientId}`);
  }
}
