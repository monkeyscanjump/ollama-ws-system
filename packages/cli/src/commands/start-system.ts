/**
 * Start System Command
 *
 * Starts all system services using Docker Compose:
 * - WebSocket server
 * - Ollama LLM service
 * - Cloudflared tunnel (if configured)
 *
 * This command builds the Docker image if needed and starts all containers
 * in the correct configuration based on environment settings.
 */
import { Interface as ReadlineInterface } from 'readline';
import { createCommandHandler } from '../utils/cli';
import { startSystem, isDockerAvailable } from '../services/docker';
import { defaults } from '../config';
import logger from '../utils/logger';
import { CommandHelp } from '@ws-system/shared';

/**
 * Implementation of the start-system command
 *
 * Checks Docker availability and starts all system services.
 * Provides user feedback on service URLs and container status.
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise resolving to true if system started successfully, false otherwise
 */
async function startSystemImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<boolean> {
  try {
    // Check Docker availability before attempting operations
    if (!isDockerAvailable()) {
      logger.error('Docker is not running or not installed. Please start Docker and try again.');
      return false;
    }

    // Whether to build or rebuild the image
    const buildImage = cli.flags.build !== false;

    // Display what containers will be started
    logger.info(`Starting ${defaults.containerPrefix} services...`);
    logger.info('This will start:');
    logger.info(`- ${defaults.containerPrefix}-server (WebSocket Server) on port ${defaults.port}`);
    logger.info('- ollama (LLM Service)');
    logger.info('- cloudflared (if configured)');

    if (buildImage) {
      logger.info(`Will build/update image: ${defaults.containerPrefix}:${defaults.dockerTag}`);
    } else {
      logger.info('Using existing image (skipping build)');
    }

    // Start the system with the specified build option
    return await startSystem(buildImage);
  } catch (error) {
    logger.error(`Failed to start system: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Command handler for start-system
 *
 * Defines help documentation and binds the implementation function.
 */
const startSystemHandler = createCommandHandler(
  startSystemImplementation,
  {
    defaults: {
      build: true
    },
    help: {
      title: 'Start System',
      command: 'start-system',
      options: [
        { name: 'build', description: 'Build/update the Docker image before starting', default: 'true' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Starts all system services:',
        `- ${defaults.containerPrefix}-server (WebSocket Server on port ${defaults.port})`,
        '- ollama (LLM Service)',
        '- cloudflared (if configured)',
        '',
        'This command builds the Docker image by default before starting containers.',
        'Use --build=false to skip image building and use existing images.',
        '',
        'This command requires Docker to be installed and running.'
      ],
      examples: [
        'manager start-system',
        'manager start-system --build=false'
      ]
    } as CommandHelp
  }
);

export default startSystemHandler;
