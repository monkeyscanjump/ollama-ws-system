/**
 * Environment Configuration Command
 *
 * Generates a comprehensive .env file based on templates and user input.
 * Uses the centralized environment template for configuration.
 */
const fs = require('fs');
const path = require('path');
const { confirm, prompt, createCommandHandler } = require('../utils/cli');
const { projectRoot } = require('../utils/config');
const logger = require('../utils/logger');
const serviceRegistry = require('../services');
const { ENV_TEMPLATE, validateVariable } = require('../utils/env-template');

/**
 * Extract existing configuration from .env file
 *
 * @param {string} envPath - Path to .env file
 * @returns {Object} Extracted configuration values
 */
function extractExistingConfig(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const config = {};

  // Parse .env file line by line
  const lines = envContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      config[key] = value;
    }
  }

  return config;
}

/**
 * Generate the environment file content based on the template and configured values
 *
 * @param {Object} template - Environment template with sections and variables
 * @param {Object} configValues - Configured values for variables
 * @param {Object} enabledServices - Enabled service configurations
 * @returns {string} Generated environment file content
 */
function generateEnvContent(template, configValues, enabledServices = {}) {
  let content = '';

  // Process each section in the template
  for (const section of template.sections) {
    // Add section header
    content += `# ===========================================================================\n`;
    content += `# ${section.title}\n`;
    content += `# ===========================================================================\n\n`;

    // Add section description if provided
    if (section.description) {
      content += `# ${section.description}\n\n`;
    }

    // Process each variable in the section
    for (const variable of section.variables) {
      // Add variable description
      if (variable.description) {
        for (const line of variable.description) {
          content += `# ${line}\n`;
        }
      }

      // Add the variable assignment with its value
      // FIX: Check for empty string values and use default in that case
      const value = configValues[variable.name] !== undefined && configValues[variable.name] !== ''
        ? configValues[variable.name]
        : variable.default;

      content += `${variable.name}=${value}\n\n`;
    }
  }

  // Add service-specific variables
  const availableServices = serviceRegistry.getAvailableServices();

  for (const serviceId in enabledServices) {
    const service = availableServices[serviceId];
    const serviceConfig = enabledServices[serviceId];

    if (!service || !serviceConfig) {
      continue;
    }

    // Add service section header
    content += `# ===========================================================================\n`;
    content += `# ${service.name.toUpperCase()} CONFIGURATION\n`;
    content += `# ===========================================================================\n\n`;

    // Add service description if provided
    if (service.description) {
      content += `# ${service.description}\n\n`;
    }

    // Add service variables
    for (const key in serviceConfig) {
      // Get description if available
      const description = service.getVariableDescription ?
        service.getVariableDescription(key) : null;

      if (description) {
        for (const line of description) {
          content += `# ${line}\n`;
        }
      }

      // FIX: Check for empty string values here too
      const value = serviceConfig[key] !== undefined && serviceConfig[key] !== ''
        ? serviceConfig[key]
        : (service.getDefaultValue ? service.getDefaultValue(key) : '');

      content += `${key}=${value}\n\n`;
    }
  }

  return content;
}

/**
 * Configure values for a section's variables through prompts or CLI flags
 *
 * @param {Object} section - Section containing variables to configure
 * @param {Object} existingConfig - Existing configuration values
 * @param {Object} cliFlags - Command line flags
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<Object>} Configured values for variables
 */
async function configureSection(section, existingConfig, cliFlags, rl) {
  const result = {};

  // Process each variable in the section
  for (const variable of section.variables) {
    // Check if value is provided via CLI flag
    if (cliFlags[variable.name.toLowerCase()]) {
      // Validate CLI provided value
      const value = cliFlags[variable.name.toLowerCase()];
      if (variable.validate) {
        const validationResult = variable.validate(value);
        if (validationResult !== true) {
          logger.warn(`Invalid value for ${variable.name}: ${validationResult}`);
          logger.warn(`Using default value: ${variable.default}`);
          result[variable.name] = variable.default;
          continue;
        }
      }
      result[variable.name] = value;
      continue;
    }

    // Get existing value or default
    // Only use existing value if it's not empty
    const existingValue = existingConfig[variable.name];
    const defaultValue = (existingValue !== undefined && existingValue !== '')
      ? existingValue
      : variable.default;

    // Show options if available
    if (variable.options && variable.options.length > 0) {
      logger.info(`Available options for ${variable.name}: ${variable.options.join(', ')}`);
    }

    // Prompt for value with validation
    let isValid = false;
    let value;

    while (!isValid) {
      const promptText = `${variable.prompt} [${defaultValue}]: `;
      const userInput = await prompt(rl, promptText);

      // If user input is empty, use the default value
      value = (userInput === undefined || userInput === '') ? defaultValue : userInput;

      // Validate the input
      if (variable.validate) {
        const validationResult = variable.validate(value);
        if (validationResult === true) {
          isValid = true;
        } else {
          logger.error(`Invalid input: ${validationResult}`);
          // Loop continues to prompt again
        }
      } else {
        isValid = true; // No validation needed
      }
    }

    result[variable.name] = value;
  }

  return result;
}

/**
 * Main environment configuration implementation
 *
 * @param {Array} args - Command line arguments
 * @param {readline.Interface} rl - Readline interface
 * @param {Object} cli - Parsed command line options
 * @returns {Promise<void>}
 */
async function configureEnvImplementation(args, rl, cli) {
  if (!cli) cli = { flags: {} };
  if (!cli.flags) cli.flags = {};

  // Get options from command line
  const force = cli.flags.force === true || cli.flags.force === 'true';
  const envPath = path.join(projectRoot, '.env');

  logger.section('Environment Configuration');

  // Check if .env already exists and we're not forcing overwrite
  if (fs.existsSync(envPath) && !force) {
    logger.warn('.env file already exists');
    const shouldOverwrite = await confirm(
      rl,
      'Would you like to overwrite the existing .env file?',
      false
    );

    if (!shouldOverwrite) {
      logger.info('Keeping existing .env file');
      return;
    }
  }

  // Extract existing configuration if available
  const existingConfig = extractExistingConfig(envPath);

  // Configure each section in the template
  const configValues = {};

  for (const section of ENV_TEMPLATE.sections) {
    logger.info(`Configuring ${section.title}...`);

    const sectionValues = await configureSection(
      section,
      existingConfig,
      cli.flags,
      rl
    );

    Object.assign(configValues, sectionValues);
  }

  // Configure services
  let servicesToEnable = [];
  const enabledServices = {};

  // Parse services from CLI flags
  if (cli.flags.services) {
    servicesToEnable = cli.flags.services
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // List available services if none specified
  const availableServices = serviceRegistry.getAvailableServices();

  if (servicesToEnable.length === 0) {
    logger.info('Available services:');

    for (const serviceId in availableServices) {
      const service = availableServices[serviceId];
      logger.info(`- ${service.name} (${serviceId}): ${service.description}`);
    }

    // Ask which services to enable
    const servicesInput = await prompt(
      rl,
      'Enter comma-separated list of services to enable (or leave empty for none): '
    );

    if (servicesInput.trim()) {
      servicesInput.split(',').forEach(s => {
        const serviceId = s.trim();
        if (serviceId && availableServices[serviceId]) {
          servicesToEnable.push(serviceId);
        } else if (serviceId) {
          logger.warn(`Unknown service: ${serviceId}`);
        }
      });
    }
  }

  // Configure each enabled service
  for (const serviceId of servicesToEnable) {
    const service = availableServices[serviceId];

    if (!service) {
      logger.warn(`Unknown service: ${serviceId}, skipping`);
      continue;
    }

    logger.info(`Configuring ${service.name}...`);

    // Get configuration for this service
    // First check if CLI provided all required config
    const cliConfig = service.parseCliConfig ? service.parseCliConfig(cli.flags) : null;

    if (cliConfig) {
      // Use CLI config if provided
      enabledServices[serviceId] = cliConfig;
      logger.info(`Using provided configuration for ${service.name}`);
    } else {
      // Extract existing config for this service
      const existingServiceConfig = {};

      if (service.envVars) {
        for (const envVar of service.envVars) {
          if (existingConfig[envVar] !== undefined) {
            existingServiceConfig[envVar] = existingConfig[envVar];
          }
        }
      }

      // Prompt for configuration
      const serviceConfig = await service.configure(rl, existingServiceConfig);

      if (serviceConfig) {
        enabledServices[serviceId] = serviceConfig;
      }
    }
  }

  // Generate environment file content
  const envContent = generateEnvContent(ENV_TEMPLATE, configValues, enabledServices);

  // Write to file
  fs.writeFileSync(envPath, envContent);
  logger.success('Environment configuration saved to .env file');

  // Show instructions for enabled services
  for (const serviceId in enabledServices) {
    const service = availableServices[serviceId];

    if (service && service.getInstructions) {
      logger.success(`${service.name} enabled`);

      const instructions = service.getInstructions(enabledServices[serviceId]);
      for (const instruction of instructions) {
        logger.info(instruction);
      }

      logger.log('');
    }
  }
}

/**
 * Direct API for programmatic configuration
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.values - Pre-configured values for variables
 * @param {string[]} options.services - List of service IDs to enable
 * @param {Object} options.serviceConfigs - Configurations for specific services
 * @param {readline.Interface} rl - Readline interface
 * @param {boolean} force - Whether to force overwrite existing .env
 * @returns {Promise<boolean>} Success status
 */
async function configureEnvironment(options, rl, force = false) {
  try {
    const envPath = path.join(projectRoot, '.env');

    // Check for existing .env
    if (fs.existsSync(envPath) && !force) {
      logger.warn('.env file already exists');
      const shouldOverwrite = await confirm(
        rl,
        'Would you like to overwrite the existing .env file?',
        false
      );

      if (!shouldOverwrite) {
        logger.info('Keeping existing .env file');
        return true;
      }
    }

    // Extract existing configuration if available
    const existingConfig = extractExistingConfig(envPath);

    // Prepare configuration values
    const configValues = {
      ...existingConfig,
      ...options.values
    };

    // Validate provided values
    for (const key in configValues) {
      const validationResult = validateVariable(key, configValues[key]);
      if (validationResult !== true) {
        logger.warn(`Invalid value for ${key}: ${validationResult}`);
      }
    }

    // Configure services
    const enabledServices = {};
    const availableServices = serviceRegistry.getAvailableServices();

    // Process each requested service
    if (options.services && options.services.length > 0) {
      for (const serviceId of options.services) {
        const service = availableServices[serviceId];

        if (!service) {
          logger.warn(`Unknown service: ${serviceId}, skipping`);
          continue;
        }

        // Use provided config or prompt for configuration
        if (options.serviceConfigs && options.serviceConfigs[serviceId]) {
          enabledServices[serviceId] = options.serviceConfigs[serviceId];
        } else {
          // Extract existing config for this service
          const existingServiceConfig = {};

          if (service.envVars) {
            for (const envVar of service.envVars) {
              if (existingConfig[envVar] !== undefined) {
                existingServiceConfig[envVar] = existingConfig[envVar];
              }
            }
          }

          // Prompt for configuration
          const serviceConfig = await service.configure(rl, existingServiceConfig);

          if (serviceConfig) {
            enabledServices[serviceId] = serviceConfig;
          }
        }
      }
    }

    // Generate environment file content
    const envContent = generateEnvContent(ENV_TEMPLATE, configValues, enabledServices);

    // Write to file
    fs.writeFileSync(envPath, envContent);
    logger.success('Environment configuration saved to .env file');

    // Show instructions for enabled services
    for (const serviceId in enabledServices) {
      const service = availableServices[serviceId];

      if (service && service.getInstructions) {
        logger.success(`${service.name} enabled`);

        const instructions = service.getInstructions(enabledServices[serviceId]);
        for (const instruction of instructions) {
          logger.info(instruction);
        }

        logger.log('');
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to configure environment: ${error.message}`);
    return false;
  }
}

// Build help options based on template and available services
function buildHelpOptions() {
  const options = [
    { name: 'force', description: 'Overwrite existing .env file without confirmation', default: 'false' },
    { name: 'services', description: 'Comma-separated list of services to enable (e.g., ollama)' }
  ];

  // Add options for all template variables
  for (const section of ENV_TEMPLATE.sections) {
    for (const variable of section.variables) {
      options.push({
        name: variable.name.toLowerCase(),
        description: Array.isArray(variable.description)
          ? variable.description[0]
          : variable.description,
        default: variable.default
      });
    }
  }

  // Add service-specific options
  const availableServices = serviceRegistry.getAvailableServices();

  for (const serviceId in availableServices) {
    const service = availableServices[serviceId];

    if (service.getCliFlags) {
      const flags = service.getCliFlags();

      for (const flagName in flags) {
        options.push({
          name: flagName,
          description: flags[flagName].description,
          default: flags[flagName].default
        });
      }
    }
  }

  return options;
}

// Build examples based on template and available services
function buildHelpExamples() {
  const examples = [
    'manager configure-env',
    'manager configure-env --port=8080 --host=127.0.0.1',
    'manager configure-env --force',
    'manager configure-env --log-level=debug --node_env=development'
  ];

  // Add service-specific examples
  const availableServices = serviceRegistry.getAvailableServices();
  const serviceIds = Object.keys(availableServices);

  if (serviceIds.length > 0) {
    examples.push(`manager configure-env --services=${serviceIds.join(',')}`);

    for (const serviceId in availableServices) {
      const service = availableServices[serviceId];

      if (service.getCliFlags) {
        const flags = service.getCliFlags();
        const flagsStr = Object.keys(flags)
          .map(flag => `--${flag}=${flags[flag].default || 'value'}`)
          .join(' ');

        examples.push(`manager configure-env --services=${serviceId} ${flagsStr}`);
      }
    }
  }

  return examples;
}

// Create the command handler
const configureEnvHandler = createCommandHandler(
  configureEnvImplementation,
  {
    defaults: {
      'force': false
    },
    help: {
      title: 'Environment Configuration',
      command: 'configure-env',
      options: buildHelpOptions(),
      description: [
        'Sets up the environment configuration (.env file) for the WebSocket server',
        'with comprehensive configuration options and service integrations.',
        '',
        'The command guides you through configuring all settings with sensible defaults',
        'and allows enabling optional services for additional functionality.',
        '',
        'Available services:',
        ...Object.values(serviceRegistry.getAvailableServices()).map(
          service => `- ${service.name} (${service.id}): ${service.description}`
        )
      ],
      examples: buildHelpExamples()
    }
  }
);

// Export the command handler and direct function
module.exports = configureEnvHandler;
module.exports.configureEnvironment = configureEnvironment;
