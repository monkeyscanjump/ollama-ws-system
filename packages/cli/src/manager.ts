#!/usr/bin/env node
/**
 * WebSocket System Manager
 *
 * Unified command line interface for managing the WebSocket system.
 * Provides access to all management functions through a single entry point.
 */
import { validateArgumentSyntax } from './utils/cli';
import logger from './utils/logger';
import { CommandRegistry } from '@ws-system/shared';

// Import command handlers
import listClients from './commands/list-clients';
import backupClients from './commands/backup-clients';
import revokeClient from './commands/revoke-client';
import setupServer from './commands/setup';
import generateKeys from './commands/generate-keys';
import registerClient from './commands/register-client';
import configureEnv from './commands/configure-env';
import scanEnv from './commands/scan-env';
import setupCloudflared from './commands/setup-cloudflared';
import startSystem from './commands/start-system';
import stopSystem from './commands/stop-system';
import systemStatus from './commands/system-status';
import systemLogs from './commands/system-logs';
import buildImage from './commands/build-image';

/**
 * Registry of all available commands with their handlers and descriptions
 */
const commands: CommandRegistry = {
  'setup': {
    handler: setupServer,
    description: 'Initialize the server environment',
    usage: 'manager setup [--admin-name=NAME] [--key-size=SIZE]'
  },
  'generate-keys': {
    handler: generateKeys,
    description: 'Generate new client key pair',
    usage: 'manager generate-keys [--name=NAME] [--output-dir=DIR] [--key-size=SIZE] [--create-config]'
  },
  'register-client': {
    handler: registerClient,
    description: 'Register a new client',
    usage: 'manager register-client [--name=NAME] [--key-path=PATH] [--online] [--server-url=URL] [--algorithm=ALG]'
  },
  'list-clients': {
    handler: listClients,
    description: 'List all registered clients',
    usage: 'manager list-clients [--detailed] [--clients-file=PATH]'
  },
  'revoke-client': {
    handler: revokeClient,
    description: 'Revoke client access',
    usage: 'manager revoke-client [--client-id=ID] [--clients-file=PATH] [--force]'
  },
  'backup-clients': {
    handler: backupClients,
    description: 'Backup client database',
    usage: 'manager backup-clients [--clients-file=PATH] [--backup-dir=DIR] [--max-backups=NUM]'
  },
  'configure-env': {
    handler: configureEnv,
    description: 'Configure environment settings',
    usage: 'manager configure-env [--port=PORT] [--host=HOST] [--enable-ollama] [--force]'
  },
  'scan-env': {
    handler: scanEnv,
    description: 'Scan environment variables in source code',
    usage: 'manager scan-env'
  },
  'setup-cloudflared': {
    handler: setupCloudflared,
    description: 'Setup Cloudflare Tunnel for secure connections',
    usage: 'manager setup-cloudflared [--tunnel-name=NAME] [--hostname=HOST] [--data-dir=DIR]'
  },
  'start-system': {
    handler: startSystem,
    description: 'Start all system services',
    usage: 'manager start-system'
  },
  'stop-system': {
    handler: stopSystem,
    description: 'Stop all system services',
    usage: 'manager stop-system'
  },
  'system-status': {
    handler: systemStatus,
    description: 'Show status of all system services',
    usage: 'manager system-status'
  },
  'system-logs': {
    handler: systemLogs,
    description: 'Show logs for a system service',
    usage: 'manager system-logs [--service=NAME] [--lines=COUNT]'
  },
  'build-image': {
    handler: buildImage,
    description: 'Build Docker image for WebSocket server',
    usage: 'manager build-image [--tag=TAG] [--nocache]'
  }
};

/**
 * Display general help information
 */
function showHelp(): void {
  logger.section('WebSocket System Manager');
  logger.log('Usage: manager <command> [--options]');
  logger.log('');
  logger.log('Available commands:');

  // Find the maximum command name length for nice formatting
  const maxLength = Math.max(...Object.keys(commands).map(cmd => cmd.length));

  // Display each command with its description
  Object.entries(commands).forEach(([cmd, info]) => {
    logger.log(`  ${cmd.padEnd(maxLength + 2)}${info.description}`);
  });

  logger.log('');
  logger.log('For command-specific help, use:');
  logger.log('  manager <command> --help');
  logger.log('');
  logger.log('Examples:');
  logger.log('  manager setup --admin-name=admin');
  logger.log('  manager register-client --online --name=my-client --key-path=./keys/my_key.pub');
  logger.log('  manager list-clients --detailed');
  logger.log('  manager revoke-client --client-id=1234abcd');
}

/**
 * Main function to parse command and execute the appropriate handler
 *
 * @returns Promise that resolves when command execution is complete
 */
async function main(): Promise<void> {
  // Get all arguments after the script name
  const args = process.argv.slice(2);

  // If no command or help requested, show help
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  // Extract the command (first argument)
  const commandName = args[0];

  // Check if the command starts with a dash (which is invalid)
  if (commandName.startsWith('-')) {
    logger.error('Invalid command syntax. Commands should not start with dashes.');
    logger.info('Use "manager --help" to see available commands');
    process.exit(1);
  }

  // Check if the command exists
  const command = commands[commandName];
  if (!command) {
    logger.error(`Unknown command: ${commandName}`);
    logger.info('Use "manager --help" to see available commands');
    process.exit(1);
  }

  // Remove the command name from args before passing to handler
  const commandArgs = args.slice(1);

  // Use the cli utility for argument validation
  if (!validateArgumentSyntax(commandArgs)) {
    logger.error('Invalid parameter syntax. All parameters must use double-dash format.');
    logger.error('Example: --parameter=value or --flag');
    logger.info(`Use "manager ${commandName} --help" for correct usage`);
    process.exit(1);
  }

  try {
    // Execute the command handler - no readline interface needed
    await command.handler(commandArgs);
  } catch (error) {
    logger.error(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Execute the script with error handling
 */
main().catch(error => {
  logger.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
