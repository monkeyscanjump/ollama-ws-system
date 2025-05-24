process.setMaxListeners(20); // Increase maximum listeners to prevent warning during development

import { config, logLevel, nodeEnv } from './config';
import { createServer } from './server';
import { createLogger, setLogLevel } from '@ws-system/shared';

// Initialize logging
const logger = createLogger('main');
setLogLevel(logLevel);

// Security warning for non-production environments
if (nodeEnv !== 'production') {
  logger.warn(
    'Running in development mode without TLS/SSL encryption. ' +
    'For production environments, use HTTPS with a reverse proxy like Nginx or use WSS.'
  );
}

/**
 * Handles graceful server shutdown
 *
 * @param server - HTTP server instance to close
 * @param signal - Signal that triggered the shutdown
 */
function handleShutdown(server: any, signal: string): void {
  logger.info(`Received ${signal}, shutting down server...`);
  server.close(() => {
    logger.info('Server shutdown complete');
    process.exit(0);
  });
}

/**
 * Starts the server with the configured settings
 */
async function start(): Promise<void> {
  try {
    const server = await createServer(config);

    server.listen(config.port, config.host, () => {
      logger.info(`Server listening on ${config.host}:${config.port}`);
      logger.info(`Using Ollama API at ${config.ollamaUrl}`);
    });

    // Register shutdown handlers
    process.on('SIGINT', () => handleShutdown(server, 'SIGINT'));
    process.on('SIGTERM', () => handleShutdown(server, 'SIGTERM'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server only if run directly
if (require.main === module) {
  start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
