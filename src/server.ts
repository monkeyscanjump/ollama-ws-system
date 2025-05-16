import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createLogger } from './utils';
import {
  loadAuthorizedClients,
  generateChallenge,
  storeChallenge,
  rateLimiter
} from './security';
import { createOllamaClient } from './services/ollama.client';
import { Config, MessageType } from './types';
import { connectionManager } from './websocket/connection.manager';
import { handleMessage } from './websocket/message.handler';
import { authConfig } from './config';
import authRoutes from './api/routes/auth.routes';

const logger = createLogger('server');

/**
 * Creates the HTTP and WebSocket server with authentication and Ollama API integration
 * @param config Server configuration
 * @returns HTTP server instance
 */
export async function createServer(config: Config): Promise<http.Server> {
  // Preload authorized clients from storage
  loadAuthorizedClients();

  // Validate critical configuration
  if (!config.ollamaUrl) {
    throw new Error('Ollama API URL not configured');
  }

  // Create Express app
  const app = express();

  // Setup middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../public')));

  // Setup API routes
  app.use('/api/auth', authRoutes);

  // Create HTTP server and Ollama client
  const server = http.createServer(app);
  const ollamaClient = createOllamaClient(config.ollamaUrl);
  const wss = new WebSocketServer({ server });

  // Handle new WebSocket connections
  wss.on('connection', (ws, req) => {
    const connectionId = connectionManager.generateConnectionId();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    logger.info(`New connection from ${ip} (ID: ${connectionId})`);

    // Initialize challenge-response authentication
    const challenge = generateChallenge();
    storeChallenge(connectionId, challenge);

    // Initialize connection state
    connectionManager.addConnection(connectionId, {
      connectionId,
      authenticated: false,
      clientId: null,
      challenge,
      connectedAt: new Date(),
      ip
    });

    // Send challenge to client
    ws.send(JSON.stringify({
      type: MessageType.CHALLENGE,
      challenge,
      timestamp: Date.now()
    }));

    // Set authentication timeout
    connectionManager.setAuthTimeout(connectionId, ws, authConfig.timeout);

    // Handle WebSocket messages
    ws.on('message', async (data) => {
      await handleMessage(ws, data, connectionId, ip, ollamaClient, config.defaultModel);
    });

    // Handle WebSocket disconnection
    ws.on('close', () => {
      logger.info(`Connection closed: ${connectionId}`);
      connectionManager.closeConnection(connectionId);
    });
  });

  // Clean up when server closes
  server.on('close', () => {
    rateLimiter.dispose();
  });

  return server;
}
