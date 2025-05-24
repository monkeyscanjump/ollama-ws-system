/**
 * Shared logging utilities
 */

// Import a logger library that works in both Node and browser environments
// For Node, we'll use pino, but we need to handle this properly
// This is a simplified version - we'll need to enhance for browser compatibility
import pino from 'pino';

// Logger instances cache to avoid creating duplicate loggers
const loggers: Record<string, pino.Logger> = {};

// Default log level from environment or fallback to 'info'
let globalLogLevel: string = process.env.LOG_LEVEL || 'info';

/**
 * Creates or retrieves a logger instance for the specified module
 *
 * @param module - The module name to identify the logger source
 * @returns A configured logger instance
 */
export function createLogger(module: string): pino.Logger {
  if (!loggers[module]) {
    loggers[module] = pino({
      name: module,
      level: globalLogLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return loggers[module];
}

/**
 * Sets the global log level for all existing and future loggers
 *
 * @param level - The log level to set ('trace', 'debug', 'info', 'warn', 'error', 'fatal')
 */
export function setLogLevel(level: string): void {
  globalLogLevel = level;
  Object.values(loggers).forEach(logger => {
    logger.level = level;
  });
}
