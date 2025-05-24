/**
 * Environment Variable Scanner
 *
 * Scans the source code for environment variable usage and compares it against
 * the centralized environment template to identify missing variables.
 */
import fs from 'fs';
import path from 'path';
import { createCommandHandler } from '../utils/cli';
import logger from '../utils/logger';
import * as templateModule from '../utils/env-template';
import { getAvailableServices } from '../services';
import { CommandHelp } from '@ws-system/shared';

/**
 * Determines the source code root directory
 * Works in both ts-node and compiled JS environments
 */
function getSourceRoot(): string {
  // Check if we're running in ts-node or compiled JS
  const isTsNode = process.env.TS_NODE_DEV === 'true' || process.argv[0].includes('ts-node');

  // In ts-node, the source is at the same level
  // In compiled JS, the source is one level up from dist/cli/commands
  if (isTsNode) {
    // When running with ts-node, source is at ./src
    return path.join(process.cwd(), 'src');
  } else {
    // When running compiled, we need to access ../../../src from dist/cli/commands
    return path.join(__dirname, '../../../src');
  }
}

/**
 * Scans source code for environment variable usage
 *
 * @returns Array of environment variable names found in source code
 */
export function scanSourceForEnvVars(): string[] {
  const srcDir = getSourceRoot();

  // Enhanced patterns to catch all env variable usage methods
  const envVarPatterns: RegExp[] = [
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

  const foundVars = new Set<string>();
  const skipVars = new Set([
    'NODE_ENV',
    'PATH',
    'PWD',
    'npm_config_node_version',
    'TS_NODE_DEV',
    'VAR_NAME'
  ]);

  // Log the source directory being scanned
  logger.info(`Scanning source directory: ${srcDir}`);

  // Recursive scan function
  function scanDir(dirPath: string): void {
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
      logger.warn(`Error scanning directory ${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
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
 * @returns Array of environment variables defined by services
 */
export function getServiceDefinedVars(): string[] {
  const serviceVars: string[] = [];

  try {
    // Use the imported services module directly
    const services = getAvailableServices();

    // Log available services for debugging
    logger.info(`Found ${Object.keys(services).length} services`);

    for (const serviceId in services) {
      const service = services[serviceId];
      if (service.envVars && Array.isArray(service.envVars)) {
        serviceVars.push(...service.envVars);
      }
    }
  } catch (err) {
    logger.warn(`Error getting service variables: ${err instanceof Error ? err.message : String(err)}`);
  }

  return serviceVars;
}

/**
 * Compares source code env vars with template
 *
 * @returns Boolean indicating if all variables are defined
 */
export function compareWithTemplate(): boolean {
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

/**
 * Command handler implementation for scan-env
 *
 * @param cli - Parsed command line arguments
 * @returns Promise that resolves when scan is complete
 */
async function scanEnvImplementation(
  cli: { flags: Record<string, any>, _: string[] }
): Promise<void> {
  logger.section('Environment Variable Scanner');

  compareWithTemplate();
}

/**
 * Command help documentation
 */
const cmdHelp: CommandHelp = {
  title: 'Environment Variable Scanner',
  command: 'scan-env',
  description: [
    'Scans source code for references to environment variables and',
    'verifies they are properly defined in the central environment',
    'template. Helps maintain consistent environment configuration.'
  ],
  examples: [
    'manager scan-env'
  ],
  options: []
};

/**
 * Export the command handler
 */
export default createCommandHandler(scanEnvImplementation, { help: cmdHelp });
