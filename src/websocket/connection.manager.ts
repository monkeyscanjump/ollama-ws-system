import crypto from 'crypto';
import WebSocket from 'ws';
import { EnhancedClientState, GenerationState, MessageType } from '../types';
import { createLogger } from '../utils';
import { clearChallenge } from '../security/challenge';

const logger = createLogger('ws:connection.manager');

/**
 * Manages WebSocket connections and their states
 */
export class ConnectionManager {
  // Active connections and generation tracking
  private connections = new Map<string, EnhancedClientState>();
  private activeGenerations = new Map<string, GenerationState>();
  private authTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Generate a unique connection ID
   */
  generateConnectionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Add a new connection
   */
  addConnection(connectionId: string, state: EnhancedClientState): void {
    this.connections.set(connectionId, state);
  }

  /**
   * Get a connection state by ID
   */
  getConnection(connectionId: string): EnhancedClientState | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Set authentication timeout for a connection
   */
  setAuthTimeout(connectionId: string, ws: WebSocket, timeoutMs: number): void {
    const timeout = setTimeout(() => {
      const connState = this.connections.get(connectionId);
      if (connState && !connState.authenticated) {
        logger.warn(`Authentication timeout for connection ${connectionId}`);

        ws.send(JSON.stringify({
          type: MessageType.ERROR,
          error: 'Authentication timeout',
          code: 'auth_timeout',
          timestamp: Date.now()
        }));

        ws.close();
        this.closeConnection(connectionId);
      }
    }, timeoutMs);

    // Prevent timer from keeping Node process alive
    if (timeout.unref) timeout.unref();

    this.authTimeouts.set(connectionId, timeout);
  }

  /**
   * Clear authentication timeout for a connection
   */
  clearAuthTimeout(connectionId: string): void {
    const timeout = this.authTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.authTimeouts.delete(connectionId);
    }
  }

  /**
   * Update the authentication state of a connection
   */
  authenticateConnection(connectionId: string, clientId: string): void {
    const connState = this.connections.get(connectionId);
    if (connState) {
      connState.authenticated = true;
      connState.clientId = clientId;
    }
  }

  /**
   * Track an active text generation
   */
  addGeneration(
    id: string,
    connectionId: string,
    abortController: AbortController,
    model: string
  ): void {
    this.activeGenerations.set(id, {
      connectionId,
      abortController,
      startTime: Date.now(),
      model
    });
  }

  /**
   * Get an active generation
   */
  getGeneration(id: string): GenerationState | undefined {
    return this.activeGenerations.get(id);
  }

  /**
   * Remove a generation from tracking
   */
  removeGeneration(id: string): void {
    this.activeGenerations.delete(id);
  }

  /**
   * Close a connection and clean up all resources
   */
  closeConnection(connectionId: string): void {
    // Cancel any active generations for this connection
    for (const [genId, gen] of this.activeGenerations.entries()) {
      if (gen.connectionId === connectionId) {
        gen.abortController.abort();
        this.activeGenerations.delete(genId);
      }
    }

    // Clean up resources
    this.clearAuthTimeout(connectionId);
    clearChallenge(connectionId);
    this.connections.delete(connectionId);
  }

  /**
   * Get count of active connections
   */
  get connectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get count of active generations
   */
  get generationCount(): number {
    return this.activeGenerations.size;
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
