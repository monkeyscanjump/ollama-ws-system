/**
 * Stop System Command
 *
 * Stops all running system services managed by Docker Compose:
 * - WebSocket server
 * - Ollama LLM service
 * - Cloudflared tunnel (if configured)
 *
 * This command properly shuts down all services, preserving data and
 * ensuring a clean state for the next startup.
 */
import { Interface as ReadlineInterface } from 'readline';
import { createCommandHandler } from '../utils/cli';
import { stopSystem, isDockerAvailable } from '../services/docker';
import { defaults } from '../config';
import logger from '../utils/logger';
import { CommandHelp } from '@ws-system/shared';

/**
 * Implementation of the stop-system command
 *
 * Checks Docker availability and stops all system services using docker-compose.
 * Handles error cases and provides appropriate user feedback.
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise resolving to true if system stopped successfully, false otherwise
 */
async function stopSystemImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<boolean> {
  try {
    // Verify Docker is available before attempting operations
    if (!isDockerAvailable()) {
      logger.error('Docker is not running or not installed. Please start Docker and try again.');
      return false;
    }

    // Display what containers will be stopped
    logger.info(`Stopping ${defaults.containerPrefix} services...`);
    logger.info('This will shut down:');
    logger.info(`- ${defaults.containerPrefix}-server (WebSocket Server)`);
    logger.info('- ollama (LLM Service)');
    logger.info('- cloudflared (if configured)');

    // Execute the stop operation
    const success = await stopSystem();

    if (success) {
      logger.success('All services stopped successfully');
      logger.info('To start the system again, run: manager start-system');
    }

    return success;
  } catch (error) {
    logger.error(`Failed to stop system: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Command handler for stop-system
 *
 * Defines help documentation and binds the implementation function.
 */
const stopSystemHandler = createCommandHandler(
  stopSystemImplementation,
  {
    defaults: {},
    help: {
      title: 'Stop System',
      command: 'stop-system',
      options: [
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Stops all system services:',
        '- WebSocket server',
        '- Ollama LLM service',
        '- Cloudflared tunnel (if configured)',
        '',
        'This command uses Docker Compose to properly shut down all containers,',
        'networks, and services while preserving all data volumes.',
        '',
        'This command requires Docker to be installed and running.'
      ],
      examples: [
        'manager stop-system'
      ]
    } as CommandHelp
  }
);

export default stopSystemHandler;
