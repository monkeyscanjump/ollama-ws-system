/**
 * System Status Command
 *
 * Displays the current status of all system services including:
 * - Running/stopped state
 * - Container IDs
 * - Ports and mappings
 * - Health status (if available)
 *
 * Also shows connection information for the WebSocket server
 * and whether Cloudflared tunneling is active.
 */
import { Interface as ReadlineInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import { createCommandHandler } from '../utils/cli';
import { getSystemStatus, isDockerAvailable } from '../services/docker';
import { dirs, defaults } from '../config';
import logger from '../utils/logger';
import { CommandHelp } from '@ws-system/shared';

/**
 * Implementation of the system-status command
 *
 * Retrieves and displays the status of all system services using docker-compose.
 * Shows additional connection information based on the current configuration.
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise resolving to true if status displayed successfully, false otherwise
 */
async function systemStatusImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<boolean> {
  try {
    // Check Docker availability before attempting any operations
    if (!isDockerAvailable()) {
      logger.error('Docker is not running or not installed. Please start Docker and try again.');
      return false;
    }

    // Get system status from docker service
    logger.section('System Status');
    const status = await getSystemStatus();

    if (status) {
      // Display the raw status from docker-compose
      logger.log(status);

      // Check if system is running by looking for container information in the status
      const isRunning = status.includes(defaults.containerPrefix);

      if (isRunning) {
        // Display connection information
        logger.section('Connection Information');

        // Check if cloudflared is configured to show the correct connection URL
        const cloudflaredConfigPath = path.join(dirs.cloudflared, 'config.yml');
        if (fs.existsSync(cloudflaredConfigPath)) {
          logger.info('Secure WebSocket connection available at:');
          logger.info(`  wss://${defaults.cloudflareHostname}`);
          logger.info('Cloudflare tunnel is active');
        } else {
          logger.info('WebSocket connection available at:');
          logger.info(`  ws://${defaults.host}:${defaults.port}`);
          logger.info('Note: No Cloudflare tunnel configured. Connection is not secured.');
          logger.info('Run "manager setup-cloudflared" to set up secure tunneling.');
        }
      } else {
        logger.info('System is not running. Start it with: manager start-system');
      }

      return true;
    } else {
      logger.error('Failed to retrieve system status');
      return false;
    }
  } catch (error) {
    logger.error(`Failed to get status: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Command handler for system-status
 *
 * Defines help documentation and binds the implementation function.
 */
const systemStatusHandler = createCommandHandler(
  systemStatusImplementation,
  {
    defaults: {},
    help: {
      title: 'System Status',
      command: 'system-status',
      options: [
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Shows the current status of all system services:',
        '- WebSocket server',
        '- Ollama',
        '- Cloudflared (if configured)',
        '',
        'Also displays connection information for clients.',
        '',
        'This command requires Docker to be installed and running.'
      ],
      examples: [
        'manager system-status'
      ]
    } as CommandHelp
  }
);

export default systemStatusHandler;
