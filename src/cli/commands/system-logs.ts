/**
 * System Logs Command
 *
 * Displays logs from running system containers:
 * - websocket-server: Main WebSocket server logs
 * - ollama: LLM inference service logs
 * - cloudflared: Secure tunnel service logs (if configured)
 *
 * Supports filtering by number of lines and specific service.
 * Uses Docker Compose under the hood to retrieve container logs.
 */
import { Interface as ReadlineInterface } from 'readline';
import { createCommandHandler } from '../utils/cli';
import { getServiceLogs, isDockerAvailable } from '../services/docker';
import { defaults } from '../config';
import logger from '../utils/logger';
import { CommandHelp } from '../types';

/**
 * Available service names that can be used with the logs command
 */
const AVAILABLE_SERVICES = ['websocket-server', 'ollama', 'cloudflared'];

/**
 * Implementation of the system-logs command
 *
 * Retrieves and displays logs from a specified system service.
 * Validates service name and handles Docker availability.
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise resolving to true if logs displayed successfully, false otherwise
 */
async function systemLogsImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<boolean> {
  try {
    // Check Docker availability before attempting any operations
    if (!isDockerAvailable()) {
      logger.error('Docker is not running or not installed. Please start Docker and try again.');
      return false;
    }

    // Get service name from arguments with default from config
    const service = cli.flags.service || 'websocket-server';
    const lines = cli.flags.lines ? parseInt(cli.flags.lines, 10) : 100;

    // Validate service name
    if (!AVAILABLE_SERVICES.includes(service)) {
      logger.error(`Invalid service: ${service}`);
      logger.info(`Available services: ${AVAILABLE_SERVICES.join(', ')}`);
      return false;
    }

    // Display information about the logs being retrieved
    logger.section(`Logs for ${service}`);
    logger.info(`Showing last ${lines} lines of logs`);
    logger.info(`Service: ${service}`);
    logger.info(`Container: ${service === 'websocket-server' ? defaults.containerPrefix + '-server' : service}`);
    logger.log('');

    // Retrieve logs from Docker service
    const logs = await getServiceLogs(service, lines);

    if (logs) {
      // If logs were retrieved successfully, display them
      logger.log(logs);
      return true;
    } else {
      // Handle the case where no logs were returned
      logger.error(`Failed to retrieve logs for ${service}`);
      logger.info('The service might not be running.');
      logger.info('Use "manager system-status" to check if services are running.');
      return false;
    }
  } catch (error) {
    logger.error(`Failed to get logs: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Command handler for system-logs
 *
 * Defines help documentation and binds the implementation function.
 */
const systemLogsHandler = createCommandHandler(
  systemLogsImplementation,
  {
    defaults: {
      service: 'websocket-server',
      lines: '100'
    },
    help: {
      title: 'System Logs',
      command: 'system-logs',
      options: [
        { name: 'service', description: 'Service name to show logs for', default: 'websocket-server' },
        { name: 'lines', description: 'Number of log lines to show', default: '100' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Shows logs for a specific system service.',
        '',
        'Available services:',
        '- websocket-server: Main WebSocket server logs',
        '- ollama: LLM inference service logs',
        '- cloudflared: Secure tunnel service logs (if configured)',
        '',
        'This command requires Docker to be installed and running.'
      ],
      examples: [
        'manager system-logs',
        'manager system-logs --service=ollama',
        'manager system-logs --service=cloudflared --lines=50'
      ]
    } as CommandHelp
  }
);

export default systemLogsHandler;
