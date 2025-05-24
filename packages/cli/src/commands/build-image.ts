/**
 * Build Docker Image Command
 *
 * Builds the Docker image for the WebSocket server from the project Dockerfile.
 * This command creates a Docker image that can be used by the start-system
 * command to run the WebSocket server.
 *
 * Supports options for custom tagging and cache control to facilitate
 * development and deployment workflows.
 */
import { Interface as ReadlineInterface } from 'readline';
import { execSync } from 'child_process';
import { createCommandHandler } from '../utils/cli';
import { isDockerAvailable, generateDockerfile } from '../services/docker';
import { projectRoot, defaults, dirs } from '../config';
import logger from '../utils/logger';
import { CommandHelp } from '@ws-system/shared';

/**
 * Implementation of the build-image command
 *
 * Builds a Docker image for the WebSocket server using the project Dockerfile.
 * Supports custom tags and cache control options.
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise resolving to true if image built successfully, false otherwise
 */
async function buildImageImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<boolean> {
  try {
    // Check Docker availability before attempting operations
    if (!isDockerAvailable()) {
      logger.error('Docker is not running or not installed. Please start Docker and try again.');
      return false;
    }

    // Get tag from command line or default configuration
    const tag = cli.flags.tag || defaults.dockerTag;
    const nocache = cli.flags.nocache === true || cli.flags.nocache === 'true';
    const imageName = `${defaults.containerPrefix}:${tag}`;

    // Display build information
    logger.section('Building WebSocket Server Image');
    logger.info(`Image Name: ${imageName}`);
    logger.info(`No Cache: ${nocache ? 'Yes' : 'No'}`);
    logger.info(`Docker Context: ${projectRoot}`);
    logger.info(`Dockerfile: ${dirs.data}/Dockerfile.generated`);
    logger.log('');

    // Build Docker image with appropriate options
    const cacheFlag = nocache ? '--no-cache' : '';
    logger.info('Building image, this may take a few minutes...');

    // Generate a temporary Dockerfile
    const dockerfilePath = generateDockerfile();
    logger.info(`Generated Dockerfile at: ${dockerfilePath}`);

    execSync(
      `docker build ${cacheFlag} -t ${imageName} -f ${dockerfilePath} ${projectRoot}`,
      { stdio: 'inherit' }
    );

    // Report success
    logger.success('Docker image built successfully');
    logger.info(`Image: ${imageName}`);
    logger.info('You can now run: manager start-system --build=false');

    return true;
  } catch (error) {
    logger.error(`Failed to build image: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Command handler for build-image
 *
 * Defines help documentation and binds the implementation function.
 */
const buildImageHandler = createCommandHandler(
  buildImageImplementation,
  {
    defaults: {
      tag: defaults.dockerTag,
      nocache: false
    },
    help: {
      title: 'Build Docker Image',
      command: 'build-image',
      options: [
        { name: 'tag', description: 'Tag for the built image', default: defaults.dockerTag },
        { name: 'nocache', description: 'Disable Docker build cache', default: 'false' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Builds the Docker image for the WebSocket server.',
        `Creates an image named ${defaults.containerPrefix}:<tag> using the Dockerfile in the project root.`,
        '',
        'Use --nocache to rebuild from scratch (useful if dependencies changed).',
        'Use --tag to create differently tagged versions (e.g., dev, test, prod).',
        '',
        'This command requires Docker to be installed and running.'
      ],
      examples: [
        'manager build-image',
        `manager build-image --tag=${defaults.dockerTag}`,
        'manager build-image --tag=dev',
        'manager build-image --nocache'
      ]
    } as CommandHelp
  }
);

export default buildImageHandler;
