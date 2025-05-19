/**
 * Service Registry
 *
 * Loads and registers all available services for environment configuration
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Available services registry
const services = {};

// Load all service modules
function loadServices() {
  const servicesDir = __dirname;

  // Read all files in the services directory
  const files = fs.readdirSync(servicesDir);

  // Load each service module
  for (const file of files) {
    // Skip this index file and any non-js files
    if (file === 'index.js' || !file.endsWith('.js')) {
      continue;
    }

    try {
      const servicePath = path.join(servicesDir, file);
      const serviceModule = require(servicePath);

      // Skip modules without proper service interface
      if (!serviceModule.id || !serviceModule.name || !serviceModule.configure) {
        continue;
      }

      // Register the service
      services[serviceModule.id] = serviceModule;
    } catch (error) {
      logger.warn(`Failed to load service from ${file}: ${error.message}`);
    }
  }

  return Object.keys(services).length;
}

/**
 * Get a list of all available services
 *
 * @returns {Object} Map of service IDs to service objects
 */
function getAvailableServices() {
  return services;
}

/**
 * Get a specific service by ID
 *
 * @param {string} serviceId - Service identifier
 * @returns {Object|null} The service module or null if not found
 */
function getService(serviceId) {
  return services[serviceId] || null;
}

// Load services when this module is imported
const servicesCount = loadServices();

// Export the API
module.exports = {
  getAvailableServices,
  getService
};
