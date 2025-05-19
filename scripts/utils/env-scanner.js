/**
 * Environment Variable Scanner
 *
 * Scans the source code for environment variable usage and compares it against
 * the centralized environment template to identify missing variables.
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const templateModule = require('./env-template');

/**
 * Scans source code for environment variable usage
 *
 * @returns {string[]} Array of environment variables found in code
 */
function scanSourceForEnvVars() {
  const srcDir = path.join(__dirname, '../../src');

  // Enhanced patterns to catch all env variable usage methods
  const envVarPatterns = [
    // Standard process.env.VAR_NAME
    /process\.env\.([A-Z0-9_]+)/g,
    // Destructuring: const { VAR_NAME } = process.env
    /\{\s*([A-Z0-9_,\s]+)\s*\}\s*=\s*process\.env/g,
    // String access: process.env['VAR_NAME']
    /process\.env\[\s*['"]([A-Z0-9_]+)['"]\s*\]/g,
    // String access with bracket notation: process.env[name]
    /process\.env\[\s*([A-Z0-9_]+)\s*\]/g,
    // Helper function: validateEnv('VAR_NAME', ...)
    /validate(?:Env|NumericEnv)\s*\(\s*['"]([A-Z0-9_]+)['"]/g,
    // Helper function: parseNumericEnv('VAR_NAME', ...)
    /parse(?:NumericEnv)\s*\(\s*['"]([A-Z0-9_]+)['"]/g
  ];

  const foundVars = new Set();
  const skipVars = new Set(['NODE_ENV', 'PATH', 'PWD', 'npm_config_node_version']);

  // Recursive scan function
  function scanDir(dirPath) {
    try {
      // Read directory contents
      const files = fs.readdirSync(dirPath);

      // Process each file
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          scanDir(filePath);
        } else if ((file.endsWith('.js') || file.endsWith('.ts')) &&
          !file.endsWith('.test.js') && !file.endsWith('.test.ts')) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');

            // Try all patterns
            for (const pattern of envVarPatterns) {
              let match;
              pattern.lastIndex = 0; // Reset regex state
              while ((match = pattern.exec(content)) !== null) {
                if (match[1].includes(',')) {
                  const vars = match[1].split(',').map(v => v.trim());
                  vars.forEach(v => {
                    if (v && !skipVars.has(v)) {
                      foundVars.add(v);
                    }
                  });
                } else {
                  const varName = match[1].trim();
                  if (varName && !skipVars.has(varName)) {
                    foundVars.add(varName);
                  }
                }
              }
            }
          } catch (err) {
            // Skip errors in individual files
          }
        }
      }
    } catch (err) {
      logger.warn(`Error scanning directory ${dirPath}: ${err.message}`);
    }
  }

  if (fs.existsSync(srcDir)) {
    scanDir(srcDir);
  } else {
    logger.warn(`Source directory not found: ${srcDir}`);
  }

  return Array.from(foundVars);
}

/**
 * Get service-defined environment variables
 *
 * @returns {string[]} Array of service-defined variables
 */
function getServiceDefinedVars() {
  const serviceVars = [];

  try {
    const serviceRegistry = require('../services');
    const services = serviceRegistry.getAvailableServices();

    for (const serviceId in services) {
      const service = services[serviceId];
      if (service.envVars && Array.isArray(service.envVars)) {
        serviceVars.push(...service.envVars);
      }
    }
  } catch (err) {
    logger.warn(`Error getting service variables: ${err.message}`);
  }

  return serviceVars;
}

/**
 * Compares source code env vars with template
 */
function compareWithTemplate() {
  // Get variables used in code
  const codeVars = scanSourceForEnvVars();

  // Get template variables
  const templateVars = templateModule.getAllVariables();
  const templateVarNames = Object.keys(templateVars);

  // Get service variables
  const serviceVars = getServiceDefinedVars();

  // Combined defined variables
  const definedVars = new Set([...templateVarNames, ...serviceVars]);

  // Print debug info
  logger.info('Template Variables:');
  templateVarNames.sort().forEach(v => logger.info(`- ${v}`));
  logger.log('');

  logger.info('Service Variables:');
  serviceVars.sort().forEach(v => logger.info(`- ${v}`));
  logger.log('');

  // Log variables found in code
  if (codeVars.length > 0) {
    logger.info(`Found ${codeVars.length} environment variables in your source code:`);
    codeVars.sort().forEach(v => logger.info(`- ${v}`));
    logger.log('');
  } else {
    logger.warn('No environment variables found in source code.');
    logger.log('');
  }

  // Find undefined variables
  const undefinedVars = codeVars.filter(v => !definedVars.has(v));

  if (undefinedVars.length > 0) {
    logger.warn(`Found ${undefinedVars.length} variables used in code but not defined in template:`);
    undefinedVars.sort().forEach(v => logger.warn(`- ${v}`));

    // Generate template suggestions
    const suggestions = templateModule.generateTemplateAdditions(undefinedVars);
    logger.log('');
    logger.info('Suggested additions to env-template.js:');
    logger.log(suggestions);

    return false;
  } else {
    logger.success('All environment variables used in code are properly defined in templates!');
    return true;
  }
}

// Run automatically if called directly
if (require.main === module) {
  compareWithTemplate();
}

module.exports = {
  scanSourceForEnvVars,
  getServiceDefinedVars,
  compareWithTemplate
};
