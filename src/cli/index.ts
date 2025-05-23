/**
 * WebSocket System CLI Module
 *
 * Provides programmatic access to all CLI functionality.
 */

// Export command handlers
export { default as setupServer } from './commands/setup';
export { default as generateKeys, generateClientKeys } from './commands/generate-keys';
export { default as registerClient, checkForExistingClient } from './commands/register-client';
export { default as listClients } from './commands/list-clients';
export { default as revokeClient } from './commands/revoke-client';
export { default as backupClients } from './commands/backup-clients';
export { default as configureEnv, configureEnvironment } from './commands/configure-env';
export { default as scanEnv, scanSourceForEnvVars } from './commands/scan-env';
export { default as setupCloudflared, isCloudflaredConfigured } from './commands/setup-cloudflared';
export { default as startSystem } from './commands/start-system';
export { default as stopSystem } from './commands/stop-system';
export { default as systemStatus } from './commands/system-status';
export { default as systemLogs } from './commands/system-logs';
export { default as buildImage } from './commands/build-image';

// Export utilities
export * from './utils/client-manager';
export * from './utils/crypto';
export * from './utils/cli';
export * from './utils/fs';

// Export services
export { getAvailableServices, getService } from './services';
export { default as ollamaService } from './services/ollama';
export * from './services/docker';

// Export configuration
export { dirs, files, defaults, projectRoot } from './config';

// Export types
export * from './types';
