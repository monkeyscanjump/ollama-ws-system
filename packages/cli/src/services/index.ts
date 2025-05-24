/**
 * Service Registry
 *
 * Loads and registers available services for environment configuration.
 * Services are loaded from JavaScript files in the services directory.
 */
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { Service } from '@ws-system/shared';

// Available services registry
const services: Record<string, Service> = {};

/**
 * Load all service modules from the current directory
 *
 * @returns Number of successfully loaded services
 */
function loadServices(): number {
  const servicesDir = __dirname;
  const isTsNode = process.env.TS_NODE_DEV === 'true' || process.argv[0].includes('ts-node');

  try {
    const files = fs.readdirSync(servicesDir);

    for (const file of files) {
      // Determine valid file extensions based on environment
      const validExtension = isTsNode ? '.ts' : '.js';
      const indexFile = `index${validExtension}`;

      // Skip index file, definition files, and files with wrong extension
      if (file === indexFile ||
          file.endsWith('.d.ts') ||
          file.endsWith('.js.map') ||
          !file.endsWith(validExtension)) {
        continue;
      }

      try {
        const servicePath = path.join(servicesDir, file);

        // In ts-node, we need to use require with full path
        const serviceModule = isTsNode
          ? require(servicePath).default || require(servicePath)
          : require(servicePath).default || require(servicePath);

        // Validate service has required interface properties
        if (!serviceModule.id || !serviceModule.name || !serviceModule.configure) {
          continue;
        }

        // Register the service
        services[serviceModule.id] = serviceModule;
      } catch (error) {
        logger.warn(`Failed to load service from ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return Object.keys(services).length;
  } catch (error) {
    logger.error(`Error scanning services directory: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

/**
 * Get all registered services
 *
 * @returns Record of all available services indexed by service ID
 */
export function getAvailableServices(): Record<string, Service> {
  return services;
}

/**
 * Get a specific service by its ID
 *
 * @param serviceId - Unique identifier of the service
 * @returns The requested service or null if not found
 */
export function getService(serviceId: string): Service | null {
  return services[serviceId] || null;
}

// Load services when this module is imported
const servicesCount = loadServices();
logger.info(`Loaded ${servicesCount} service${servicesCount !== 1 ? 's' : ''}`);
