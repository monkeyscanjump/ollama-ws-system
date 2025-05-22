/**
 * Environment Configuration Template
 *
 * Central definition of all environment variables with validation, descriptions,
 * and default values. This is the single source of truth for environment configuration.
 */
import path from 'path';
import { EnvSection, EnvTemplate, EnvVariable } from '../types';

/**
 * Validation function type
 */
type ValidatorFunction = (value: string) => true | string;

/**
 * Validation functions for environment variables
 */
export const validators: Record<string, ValidatorFunction> = {
  port: (value: string): true | string => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return 'Port must be a number between 1 and 65535';
    }
    return true;
  },

  logLevel: (value: string): true | string => {
    const validLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (!validLevels.includes(value.toLowerCase())) {
      return `Log level must be one of: ${validLevels.join(', ')}`;
    }
    return true;
  },

  timeout: (value: string): true | string => {
    const timeout = parseInt(value, 10);
    if (isNaN(timeout) || timeout < 0) {
      return 'Timeout must be a positive number';
    }
    return true;
  },

  positiveInteger: (value: string): true | string => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) {
      return 'Value must be a positive integer';
    }
    return true;
  },

  boolean: (value: string): true | string => {
    if (value !== 'true' && value !== 'false') {
      return 'Value must be either "true" or "false"';
    }
    return true;
  },

  directory: (value: string): true | string => {
    // Simple validation - could be enhanced to check if path is valid
    if (!value || value.trim() === '') {
      return 'Directory path cannot be empty';
    }
    return true;
  },

  nodeEnv: (value: string): true | string => {
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
export const ENV_TEMPLATE: EnvTemplate = {
  sections: [
    {
      id: 'directories',
      title: 'DIRECTORY CONFIGURATION',
      description: 'Paths for data storage and configuration files',
      variables: [
        {
          name: 'DATA_DIR',
          description: [
            'Main data directory for the system',
            '- Default: ./data (relative to project root)',
            '- Contains clients database, configuration files, and credentials',
            '- For Docker, this is mounted as a volume'
          ],
          default: './data',
          prompt: 'Enter data directory path',
          validate: validators.directory
        },
        {
          name: 'KEYS_DIR',
          description: [
            'Directory where client key pairs are stored',
            '- Default: ./keys (relative to project root)',
            '- Contains private and public keys for clients'
          ],
          default: './keys',
          prompt: 'Enter keys directory path',
          validate: validators.directory
        },
        {
          name: 'BACKUPS_DIR',
          description: [
            'Directory for client database backups',
            '- Default: ./data/backups',
            '- Contains timestamped backup files',
            '- Automatic cleanup based on MAX_BACKUPS setting'
          ],
          default: './data/backups',
          prompt: 'Enter backups directory path',
          validate: validators.directory
        },
        {
          name: 'REVOKED_DIR',
          description: [
            'Directory for storing revoked client information',
            '- Default: ./data/revoked',
            '- Contains records of revoked clients for auditing'
          ],
          default: './data/revoked',
          prompt: 'Enter revoked clients directory path',
          validate: validators.directory
        },
        {
          name: 'CLOUDFLARED_DIR',
          description: [
            'Directory for Cloudflare Tunnel configuration',
            '- Default: ./data/cloudflared',
            '- Contains certificates and configuration for the tunnel',
            '- Used by the cloudflared container'
          ],
          default: './data/cloudflared',
          prompt: 'Enter Cloudflare configuration directory',
          validate: validators.directory
        },
        {
          name: 'CLIENTS_FILE',
          description: [
            'Path to the clients database file',
            '- Default: ./data/authorized_clients.json',
            '- Stores all registered client information',
            '- Backed up automatically when using backup-clients command'
          ],
          default: './data/authorized_clients.json',
          prompt: 'Enter clients database file path'
        }
      ]
    },
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
      id: 'client',
      title: 'CLIENT CONFIGURATION',
      description: 'Default settings for client management',
      variables: [
        {
          name: 'DEFAULT_CLIENT_NAME',
          description: [
            'Default name used for client generation',
            '- Default: client',
            '- Used when no name is provided to generate-keys command'
          ],
          default: 'client',
          prompt: 'Enter default client name'
        },
        {
          name: 'KEY_SIZE',
          description: [
            'Default RSA key size in bits for client keys',
            '- Default: 2048',
            '- Higher values (4096) provide more security but slower performance',
            '- Minimum recommended: 2048'
          ],
          default: '2048',
          prompt: 'Enter default key size in bits',
          validate: validators.positiveInteger
        },
        {
          name: 'MAX_BACKUPS',
          description: [
            'Maximum number of client database backups to keep',
            '- Default: 10',
            '- Oldest backups are deleted when this limit is reached',
            '- Set to 0 to disable automatic cleanup'
          ],
          default: '10',
          prompt: 'Enter maximum number of backups to keep',
          validate: validators.positiveInteger
        },
        {
          name: 'SERVER_URL',
          description: [
            'Default server URL for client configuration',
            '- Default: http://localhost:3000',
            '- Used when generating client configuration files',
            '- Change to your actual server address for production'
          ],
          default: 'http://localhost:3000',
          prompt: 'Enter default server URL'
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
          validate: (value: string): true | string => {
            try {
              require('crypto').createVerify(value);
              return true;
            } catch (e) {
              return `Invalid signature algorithm: ${e instanceof Error ? e.message : String(e)}`;
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
    },
    {
      id: 'cloudflare',
      title: 'CLOUDFLARE CONFIGURATION',
      description: 'Settings for Cloudflare Tunnel integration',
      variables: [
        {
          name: 'CLOUDFLARE_HOSTNAME',
          description: [
            'Hostname for the Cloudflare Tunnel',
            '- Default: subdomain.example.com',
            '- The domain name clients will connect to',
            '- Must be a domain you control in Cloudflare'
          ],
          default: 'subdomain.example.com',
          prompt: 'Enter Cloudflare tunnel hostname'
        },
        {
          name: 'CLOUDFLARE_TUNNEL_NAME',
          description: [
            'Name for the Cloudflare Tunnel',
            '- Default: ws-system',
            '- Used to identify the tunnel in Cloudflare dashboard',
            '- Change for multiple tunnels in the same account'
          ],
          default: 'ws-system',
          prompt: 'Enter Cloudflare tunnel name'
        }
      ]
    },
    {
      id: 'docker',
      title: 'DOCKER CONFIGURATION',
      description: 'Settings for Docker containers and image building',
      variables: [
        {
          name: 'DOCKER_TAG',
          description: [
            'Default tag for the Docker image',
            '- Default: latest',
            '- Used when building and referencing the WebSocket server image',
            '- Can be changed for version tracking (e.g., v1.0, dev, etc.)'
          ],
          default: 'latest',
          prompt: 'Enter default Docker image tag'
        },
        {
          name: 'CONTAINER_PREFIX',
          description: [
            'Prefix for container names',
            '- Default: ws-system',
            '- Used for naming Docker containers, networks, and volumes',
            '- Change for multiple installations on the same host'
          ],
          default: 'ws-system',
          prompt: 'Enter container name prefix'
        },
        {
          name: 'NODE_VERSION',
          description: [
            'Node.js version for the Docker image',
            '- Default: 20.13.1',
            '- Used when building the WebSocket server image',
            '- Format: major.minor.patch'
          ],
          default: '20.13.1',
          prompt: 'Enter Node.js version for Docker'
        },
        {
          name: 'ALPINE_TAG',
          description: [
            'Alpine Linux version tag for Docker images',
            '- Default: 3.19',
            '- Used for the base Alpine image in Dockerfiles',
            '- Format: major.minor'
          ],
          default: '3.19',
          prompt: 'Enter Alpine Linux version tag'
        }
      ]
    },
  ]
};

/**
 * Get a flat list of all environment variables defined in the template
 */
export function getAllVariables(): Record<string, EnvVariable> {
  const variables: Record<string, EnvVariable> = {};

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
 */
export function hasVariable(name: string): boolean {
  const variables = getAllVariables();
  return !!variables[name];
}

/**
 * Validate a value for a specific variable
 */
export function validateVariable(name: string, value: string): true | string {
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
 */
export function generateTemplateAdditions(newVars: string[]): string {
  if (!newVars || newVars.length === 0) {
    return 'No new variables to add.';
  }

  let code = '// Suggested additions to env-template.ts:\n\n';
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
