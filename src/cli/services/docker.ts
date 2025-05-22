/**
 * Docker Service
 *
 * Provides a programmatic interface for managing Docker containers and volumes
 * without requiring direct docker-compose interaction from users.
 *
 * This module:
 * - Defines service configurations that would normally be in docker-compose.yml
 * - Generates temporary docker-compose files from code
 * - Provides methods to start, stop, and manage containers
 * - Checks for Docker availability
 * - Manages Docker-related file operations
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { dirs, defaults, projectRoot } from '../config';
import logger from '../utils/logger';

/**
 * Normalize a path for Docker
 *
 * Converts paths to absolute paths with forward slashes,
 * which Docker requires on all platforms.
 *
 * @param filePath - Path to normalize
 * @returns Docker-compatible absolute path
 */
function normalizeDockerPath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}

/**
 * Service definitions for all containers
 * This programmatically replaces a static docker-compose.yml file
 */
const services = {
  /**
   * Cloudflared service configuration
   * Provides secure tunnel for external access
   */
  cloudflared: {
    image: 'cloudflare/cloudflared:latest',
    command: 'tunnel --config /etc/cloudflared/config.yml run',
    volumes: [`${dirs.data.replace(/\\/g, '/')}/cloudflared:/etc/cloudflared:ro`],
    networks: ['cloudflare_network'],
    restart: 'unless-stopped',
    environment: [
      `TUNNEL_NAME=${defaults.cloudflareTunnelName}`,
      `HOSTNAME=${defaults.cloudflareHostname}`
    ],
    user: '0'
  },

  /**
   * Ollama service configuration
   * Provides LLM inference capabilities
   */
  ollama: {
    image: 'ollama/ollama:latest',
    expose: ['11434'],
    volumes: ['ollama_data:/root/.ollama'],
    networks: ['ollama_internal'],
    restart: 'unless-stopped'
  },

  /**
   * WebSocket server service configuration
   * Main application server connecting clients to LLM
   */
  'websocket-server': {
    build: {
      context: projectRoot,
      dockerfile: path.join(projectRoot, 'Dockerfile')
    },
    image: `${defaults.containerPrefix}:${defaults.dockerTag}`,
    container_name: `${defaults.containerPrefix}-server`,
    ports: [`${defaults.port}:3000`],
    volumes: [
      // Use forward slashes directly in the path definitions
      `${projectRoot.replace(/\\/g, '/')}/dist:/app/dist`,
      `${projectRoot.replace(/\\/g, '/')}/node_modules:/app/node_modules`,
      `${dirs.data.replace(/\\/g, '/')}:/app/data`,
      `${projectRoot.replace(/\\/g, '/')}/.env:/app/.env`
    ],
    environment: [
      'NODE_ENV=production',
      'OLLAMA_API_URL=http://ollama:11434',
      `PORT=${defaults.port}`,
      `HOST=${defaults.host}`
    ],
    networks: ['ollama_internal', 'cloudflare_network'],
    restart: 'unless-stopped'
  },
};

/**
 * Network definitions for container communication
 */
const networks = {
  /**
   * Internal network for secure Ollama communication
   * No direct external access
   */
  ollama_internal: {
    internal: true
  },

  /**
   * Bridge network for external communication
   * Allows WebSocket server and Cloudflared to communicate
   */
  cloudflare_network: {
    driver: 'bridge'
  }
};

/**
 * Volume definitions for persistent data storage
 */
const volumes = {
  /**
   * Ollama data volume for storing models and configurations
   */
  ollama_data: {}
};

/**
 * Generate Dockerfile content based on configuration
 *
 * Creates a Dockerfile string customized with values from configuration.
 * This eliminates the need for a static Dockerfile in the project root.
 *
 * @returns String containing Dockerfile content
 */
export function generateDockerfileContent(): string {
  // Get values from defaults or environment
  const nodeVersion = process.env.NODE_VERSION || defaults.nodeVersion || '20.13.1';
  const alpineVersion = defaults.alpineTag || '3.19';

  // Generate the Dockerfile content
  return `# Dynamically generated Dockerfile for ${defaults.containerPrefix}
FROM node:${nodeVersion}-alpine${alpineVersion}

# Update Alpine packages for security
RUN apk update && apk upgrade --available

# Set up application directory
WORKDIR /app
RUN mkdir -p /app/data

# The command will be executed when the container starts
CMD ["node", "dist/index.js"]
`;
}

/**
 * Generate a temporary Dockerfile
 *
 * Writes the Dockerfile content to a temporary file in the data directory.
 * This file will be used for building the image.
 *
 * @returns Path to the generated Dockerfile
 */
export function generateDockerfile(): string {
  // Create the Dockerfile content
  const dockerfileContent = generateDockerfileContent();

  // Write to a temporary file in the data directory
  const dockerfilePath = path.join(dirs.data, 'Dockerfile.generated');
  fs.writeFileSync(dockerfilePath, dockerfileContent);

  return dockerfilePath;
}

/**
 * Generate a temporary docker-compose.yml file from code definitions
 *
 * This enables dynamic configuration based on current environment
 * without requiring users to edit YAML files directly.
 *
 * @param outputPath - Optional custom path for docker-compose file
 * @returns Path to the generated docker-compose file
 */
export function generateDockerComposeFile(outputPath?: string): string {
  // Set default output path if not provided
  const composePath = outputPath || path.join(dirs.data, 'docker-compose.generated.yml');

  // Deep clone services to avoid modifying the original
  const normalizedServices: Record<string, any> = JSON.parse(JSON.stringify(services));

  // Normalize all volume paths to use forward slashes and absolute paths
  Object.keys(normalizedServices).forEach(serviceName => {
    const service = normalizedServices[serviceName];

    // Simple normalization that respects the original format
    if (service.build?.context) {
      service.build.context = service.build.context.replace(/\\/g, '/');
    }

    if (service.build?.dockerfile) {
      service.build.dockerfile = service.build.dockerfile.replace(/\\/g, '/');
    }
  });

  // Create the complete compose configuration
  const composeConfig = {
    services: normalizedServices,
    networks,
    volumes
  };

  // Use js-yaml to convert to YAML format
  try {
    // Try to load js-yaml dynamically
    const yaml = require('js-yaml');
    const yamlContent = yaml.dump(composeConfig, {
      indent: 2,
      lineWidth: -1
    });

    // Write the YAML content
    fs.writeFileSync(composePath, yamlContent);
  } catch (error) {
    // Fallback to JSON if js-yaml is not available
    logger.warn('js-yaml module not found, using JSON format');
    fs.writeFileSync(composePath, JSON.stringify(composeConfig, null, 2));
  }

  return composePath;
}

/**
 * Start all system services using Docker Compose
 *
 * Optionally builds the WebSocket server image before starting services.
 * Generates a temporary docker-compose file based on current configuration.
 *
 * @param buildImage - Whether to build the WebSocket server image (default: true)
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function startSystem(buildImage: boolean = true): Promise<boolean> {
  try {
    logger.section('Starting System Services');

    // Build the WebSocket server image if requested
    if (buildImage) {
      logger.info('Building WebSocket server image...');
      try {
        // Generate a temporary Dockerfile
        const dockerfilePath = generateDockerfile();
        logger.info(`Generated Dockerfile at: ${dockerfilePath}`);

        // Build the image with the generated Dockerfile
        execSync(
          `docker build -t ${defaults.containerPrefix}:${defaults.dockerTag} -f ${dockerfilePath} ${normalizeDockerPath(projectRoot)}`,
          { stdio: 'pipe' }
        );
        logger.success(`Image ${defaults.containerPrefix}:${defaults.dockerTag} built successfully`);
      } catch (error) {
        // Continue even if build fails - might use existing image
        logger.warn('Failed to build image, will try using existing image');
      }
    }

    // Generate the docker-compose file based on current configuration
    const composeFile = generateDockerComposeFile();
    logger.info('Generated Docker configuration');

    // Start all services in detached mode
    logger.info('Starting containers...');
    execSync(`docker compose -f ${composeFile} up -d`, { stdio: 'inherit' });

    logger.success('System started successfully');

    // Display access information
    logger.info('WebSocket server is now available at:');

    // If cloudflared is enabled, show the tunnel URL
    if (fs.existsSync(path.join(dirs.cloudflared, 'config.yml'))) {
      logger.info(`  wss://${defaults.cloudflareHostname}`);
    } else {
      logger.info(`  ws://${defaults.host}:${defaults.port}`);
    }

    return true;
  } catch (error) {
    logger.error(`Failed to start system: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Stop all system services using Docker Compose
 *
 * Generates a temporary docker-compose file and stops all services.
 * Also removes networks and containers (but preserves volumes).
 *
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function stopSystem(): Promise<boolean> {
  try {
    logger.section('Stopping System Services');

    // Generate the docker-compose file based on current configuration
    const composeFile = generateDockerComposeFile();

    // Stop and remove services, networks, and containers
    logger.info('Stopping containers...');
    execSync(`docker compose -f ${composeFile} down`, { stdio: 'inherit' });

    logger.success('System stopped successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to stop system: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Get status of all system services
 *
 * Lists running containers, their ports, and status
 * using Docker Compose ps command.
 *
 * @returns Promise resolving to string containing status output
 */
export async function getSystemStatus(): Promise<string> {
  try {
    // Generate the docker-compose file based on current configuration
    const composeFile = generateDockerComposeFile();

    // Execute the ps command to get container status
    return execSync(`docker compose -f ${composeFile} ps`, { encoding: 'utf-8' });
  } catch (error) {
    logger.error(`Failed to get system status: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

/**
 * Get logs for a specific service
 *
 * Retrieves container logs using Docker Compose
 * with customizable number of lines.
 *
 * @param service - Name of the service to get logs for (e.g., 'websocket-server', 'ollama', 'cloudflared')
 * @param lines - Number of recent log lines to retrieve (default: 100)
 * @returns Promise resolving to string containing log output
 */
export async function getServiceLogs(service: string, lines: number = 100): Promise<string> {
  try {
    // Generate the docker-compose file based on current configuration
    const composeFile = generateDockerComposeFile();

    // Get logs for the specified service with tail limit
    return execSync(`docker compose -f ${composeFile} logs --tail=${lines} ${service}`, { encoding: 'utf-8' });
  } catch (error) {
    logger.error(`Failed to get logs: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

/**
 * Check if Docker is available and running
 *
 * Uses docker info command to verify Docker daemon is accessible.
 * Used to provide better error messages before attempting Docker operations.
 *
 * @returns true if Docker is available, false otherwise
 */
export function isDockerAvailable(): boolean {
  try {
    // Try to run docker info to check if Docker is running
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch (error) {
    // Docker is not available if command fails
    return false;
  }
}

/**
 * Export the Dockerfile to a specific location
 *
 * Copies the project's Dockerfile to a user-specified location
 * for inspection or modification.
 *
 * @param outputPath - Destination path for the exported Dockerfile
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function exportDockerfile(outputPath: string): Promise<boolean> {
  try {
    // Generate the Dockerfile content
    const dockerfileContent = generateDockerfileContent();

    // Write to the user-specified location
    fs.writeFileSync(outputPath, dockerfileContent);
    logger.success(`Dockerfile exported to: ${outputPath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to export Dockerfile: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Remove Docker resources (containers, images, volumes) related to the system
 *
 * Useful for clean reinstalls or troubleshooting.
 *
 * @param removeVolumes - Whether to also remove persistent volumes (default: false)
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function cleanupDocker(removeVolumes: boolean = false): Promise<boolean> {
  try {
    logger.section('Cleaning Docker Resources');

    // Stop any running containers first
    await stopSystem();

    // Remove the custom image
    logger.info(`Removing ${defaults.containerPrefix} images...`);
    try {
      execSync(`docker rmi ${defaults.containerPrefix}:${defaults.dockerTag}`, { stdio: 'pipe' });
      logger.success(`Removed image ${defaults.containerPrefix}:${defaults.dockerTag}`);
    } catch (error) {
      logger.info('No custom images to remove');
    }

    // Remove volumes if requested
    if (removeVolumes) {
      logger.info('Removing persistent volumes...');
      try {
        execSync('docker volume rm ollama_data', { stdio: 'pipe' });
        logger.success('Removed ollama_data volume');
      } catch (error) {
        logger.info('No ollama_data volume to remove');
      }
    }

    logger.success('Docker cleanup completed successfully');
    return true;
  } catch (error) {
    logger.error(`Docker cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
