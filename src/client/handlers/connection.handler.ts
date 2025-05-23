import WebSocket from 'ws';
import { createLogger } from '../../utils';

const logger = createLogger('client:connection');

/**
 * Creates a handler for managing WebSocket connections
 *
 * @param serverUrl - The WebSocket server URL to connect to
 * @param onOpen - Callback triggered when connection is established
 * @param onMessage - Callback triggered when a message is received
 * @param onClose - Callback triggered when connection is closed
 * @param onError - Callback triggered when a connection error occurs
 * @returns Connection handler object
 */
export function createConnectionHandler(
  serverUrl: string,
  onOpen: () => void,
  onMessage: (data: any) => void,
  onClose: (code?: number, reason?: string) => void,
  onError: (error: Error) => void
) {
  let socket: WebSocket | null = null;

  return {
    /**
     * Connects to the WebSocket server
     */
    connect(): void {
      // Clean up any existing connection
      this.disconnect();

      logger.info(`Connecting to WebSocket server at ${serverUrl}`);
      socket = new WebSocket(serverUrl);

      socket.on('open', onOpen);

      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          onMessage(message);
        } catch (err) {
          logger.error(`Failed to parse message: ${(err as Error).message}`);
          onError(new Error(`Failed to parse message: ${(err as Error).message}`));
        }
      });

      socket.on('close', (code, reason) => {
        onClose(code, reason?.toString());
      });

      socket.on('error', (err) => {
        logger.error(`WebSocket error: ${err.message}`);
        onError(err);
      });
    },

    /**
     * Disconnects from the server and cleans up resources
     */
    disconnect(): void {
      if (socket) {
        try {
          socket.removeAllListeners();
          if (socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        } catch (err) {
          // Ignore errors during cleanup
        }
        socket = null;
      }
    },

    /**
     * Sends a message to the server
     *
     * @param message - The message to send
     * @throws Error if the socket is not connected
     */
    send(message: any): void {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not connected');
      }

      socket.send(JSON.stringify(message));
    },

    /**
     * Checks if the socket is connected
     *
     * @returns True if the connection is established and open
     */
    isConnected(): boolean {
      return socket !== null && socket.readyState === WebSocket.OPEN;
    }
  };
}

export type ConnectionHandler = ReturnType<typeof createConnectionHandler>;
