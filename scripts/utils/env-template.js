/**
 * Environment Configuration Template
 *
 * Central definition of all environment variables with validation, descriptions,
 * and default values. This is the single source of truth for environment configuration.
 */
const path = require('path');

/**
 * Validation functions for environment variables
 */
const validators = {
  port: (value) => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return 'Port must be a number between 1 and 65535';
    }
    return true;
  },

  logLevel: (value) => {
    const validLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (!validLevels.includes(value.toLowerCase())) {
      return `Log level must be one of: ${validLevels.join(', ')}`;
    }
    return true;
  },

  timeout: (value) => {
    const timeout = parseInt(value, 10);
    if (isNaN(timeout) || timeout < 0) {
      return 'Timeout must be a positive number';
    }
    return true;
  },

  positiveInteger: (value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) {
      return 'Value must be a positive integer';
    }
    return true;
  },

  boolean: (value) => {
    if (value !== 'true' && value !== 'false') {
      return 'Value must be either "true" or "false"';
    }
    return true;
  },

  directory: (value) => {
    // Simple validation - could be enhanced to check if path is valid
    if (!value || value.trim() === '') {
      return 'Directory path cannot be empty';
    }
    return true;
  },

  nodeEnv: (value) => {
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(value)) {
      return `Node environment must be one of: ${validEnvs.join(', ')}`;
    }
    return true;
  }
};

/**
 * Environment template definition
 */
const ENV_TEMPLATE = {
  sections: [
    {
      id: 'server',
      title: 'SERVER CONFIGURATION',
      description: 'Basic server settings for the WebSocket server',
      variables: [
        {
          name: 'PORT',
          description: [
            'The network port the WebSocket server will listen on',
            '- Default: 3000',
            '- Options: Any valid port number (1024-65535, with ports below 1024 requiring admin rights)',
            '- Note: If changed, update any client configurations pointing to this server'
          ],
          default: '3000',
          prompt: 'Enter server port',
          validate: validators.port
        },
        {
          name: 'HOST',
          description: [
            'Controls which network interfaces the server listens on',
            '- 0.0.0.0: Listen on all interfaces (accessible from anywhere, default)',
            '- 127.0.0.1: Listen only on localhost (secure, accessible only from same machine)',
            '- Specific IP: Listen only on one network interface (e.g., 192.168.1.100)',
            '- Security note: Restricting to 127.0.0.1 provides additional network isolation'
          ],
          default: '0.0.0.0',
          prompt: 'Enter server host'
        }
      ]
    },
    {
      id: 'logging',
      title: 'LOGGING CONFIGURATION',
      description: 'Controls how the server generates logs',
      variables: [
        {
          name: 'LOG_LEVEL',
          description: [
            'Controls verbosity of server logs',
            '- error: Only errors (minimal output)',
            '- warn: Warnings and errors',
            '- info: General information plus warnings/errors (recommended for production)',
            '- debug: Detailed information (useful for development, more verbose)',
            '- trace: Extremely detailed logs (very verbose, performance impact)',
            '- Note: Higher levels (debug/trace) may impact performance and create large log files'
          ],
          default: 'info',
          options: ['error', 'warn', 'info', 'debug', 'trace'],
          prompt: 'Enter log level',
          validate: validators.logLevel
        }
      ]
    },
    {
      id: 'security',
      title: 'SECURITY CONFIGURATION',
      description: 'Security settings for authentication and client management',
      variables: [
        {
          name: 'DATA_DIR',
          description: [
            'Directory where client data is stored',
            '- Default: ./data (relative to project root)',
            '- Should be a secure location with appropriate permissions',
            '- For Docker, this is mounted as a volume'
          ],
          default: './data',
          prompt: 'Enter data directory path',
          validate: validators.directory
        },
        {
          name: 'AUTH_TIMEOUT_MS',
          description: [
            'Authentication timeout in milliseconds',
            '- Default: 30000 (30 seconds)',
            '- Clients must complete authentication within this time'
          ],
          default: '30000',
          prompt: 'Enter authentication timeout (milliseconds)',
          validate: validators.timeout
        },
        {
          name: 'MAX_AUTH_ATTEMPTS',
          description: [
            'Maximum failed authentication attempts before rate limiting',
            '- Default: 5',
            '- After this many failures, authentication will be temporarily blocked for that IP/client'
          ],
          default: '5',
          prompt: 'Enter maximum authentication attempts',
          validate: validators.positiveInteger
        },
        {
          name: 'AUTH_WINDOW_MS',
          description: [
            'Time window in milliseconds for counting authentication attempts',
            '- Default: 600000 (10 minutes)',
            '- Failed authentication attempts within this window count toward rate limiting'
          ],
          default: '600000',
          prompt: 'Enter authentication window (milliseconds)',
          validate: validators.timeout
        },
        {
          name: 'DEFAULT_SIGNATURE_ALGORITHM',
          description: [
            'Default signature algorithm used for client authentication',
            '- Default: SHA256',
            '- Used when client does not specify a signature algorithm'
          ],
          default: 'SHA256',
          prompt: 'Enter default signature algorithm',
          validate: (value) => {
            try {
              require('crypto').createVerify(value);
              return true;
            } catch (e) {
              return `Invalid signature algorithm: ${e.message}`;
            }
          }
        }
      ]
    },
    {
      id: 'advanced',
      title: 'ADVANCED CONFIGURATION',
      description: 'Advanced settings for fine-tuning server behavior',
      variables: [
        {
          name: 'NODE_ENV',
          description: [
            'Node.js environment',
            '- development: Enables more verbose logging and warnings',
            '- production: Optimized for production use',
            '- Note: This affects various behaviors including error handling and logging'
          ],
          default: 'production',
          options: ['development', 'production', 'test'],
          prompt: 'Enter Node.js environment',
          validate: validators.nodeEnv
        }
      ]
    }
  ]
};

/**
 * Get a flat list of all environment variables defined in the template
 *
 * @returns {Object} Map of variable names to their definitions
 */
function getAllVariables() {
  const variables = {};

  // Loop through all sections
  for (const section of ENV_TEMPLATE.sections) {
    // Loop through all variables in each section
    for (const variable of section.variables) {
      variables[variable.name] = variable;
    }
  }

  return variables;
}

/**
 * Check if a variable exists in the template
 *
 * @param {string} name - Variable name
 * @returns {boolean} Whether the variable exists
 */
function hasVariable(name) {
  const variables = getAllVariables();
  return !!variables[name];
}

/**
 * Validate a value for a specific variable
 *
 * @param {string} name - Variable name
 * @param {string} value - Value to validate
 * @returns {true|string} True if valid, error message if invalid
 */
function validateVariable(name, value) {
  const variables = getAllVariables();
  const variable = variables[name];

  if (!variable) {
    return `Unknown variable: ${name}`;
  }

  if (variable.validate) {
    return variable.validate(value);
  }

  return true;
}

/**
 * Generate suggested additions to the template for new environment variables
 *
 * @param {string[]} newVars - Array of new variable names
 * @returns {string} JavaScript code with suggested additions
 */
function generateTemplateAdditions(newVars) {
  if (!newVars || newVars.length === 0) {
    return 'No new variables to add.';
  }

  let code = '// Suggested additions to env-template.js:\n\n';
  code += '{\n';
  code += '  id: \'new_section\',\n';
  code += '  title: \'NEW VARIABLES\',\n';
  code += '  description: \'New variables found in code that need configuration\',\n';
  code += '  variables: [\n';

  for (const varName of newVars) {
    code += '    {\n';
    code += `      name: '${varName}',\n`;
    code += '      description: [\n';
    code += `        '${varName} configuration',\n`;
    code += '        \'- Add description here\'\n';
    code += '      ],\n';
    code += '      default: \'\',\n';
    code += `      prompt: 'Enter ${varName.toLowerCase().replace(/_/g, ' ')}'\n`;
    code += '    },\n';
  }

  code += '  ]\n';
  code += '}\n';

  return code;
}

module.exports = {
  ENV_TEMPLATE,
  validators,
  getAllVariables,
  hasVariable,
  validateVariable,
  generateTemplateAdditions
};
