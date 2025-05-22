/**
 * Cloudflared Setup Command
 *
 * Sets up a Cloudflare Tunnel for the WebSocket server by:
 * - Authenticating with Cloudflare
 * - Creating a new tunnel
 * - Configuring DNS routing
 * - Saving configuration files to the data directory
 *
 * This enables secure WebSocket connections through Cloudflare's network.
 */
import { Interface as ReadlineInterface } from 'readline';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { createCommandHandler } from '../utils/cli';
import { dirs, defaults } from '../config';
import logger from '../utils/logger';
import { CommandHelp } from '../types';

// Load environment variables
dotenv.config();

/**
 * Check if Cloudflare tunnel is already configured
 *
 * @param dataDir - Directory containing Cloudflare configuration
 * @returns Boolean indicating if valid configuration exists
 */
function isCloudflaredConfigured(dataDir: string = dirs.data): boolean {
  const { configPath, certPath } = getCloudflaredPaths(dataDir);
  return fs.existsSync(configPath) && fs.existsSync(certPath);
}

/**
 * Get Cloudflare configuration paths
 *
 * @param dataDir - Directory containing Cloudflare configuration
 * @returns Object containing paths to Cloudflare configuration files
 */
function getCloudflaredPaths(dataDir: string = dirs.data): {
  configDir: string;
  configPath: string;
  certPath: string;
} {
  const cloudflaredDir = path.resolve(path.join(dataDir, 'cloudflared'));
  return {
    configDir: cloudflaredDir,
    configPath: path.join(cloudflaredDir, 'config.yml'),
    certPath: path.join(cloudflaredDir, 'cert.pem')
  };
}

/**
 * Check if Docker is available on the system
 *
 * @returns Boolean indicating if Docker is running
 */
function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Core cloudflared setup function
 *
 * Handles the entire process of setting up a Cloudflare Tunnel:
 * 1. Checks if Docker is available
 * 2. Creates required directories
 * 3. Runs the cloudflared setup in a Docker container
 * 4. Verifies the generated configuration files
 *
 * @param tunnelName - Name for the Cloudflare tunnel
 * @param hostname - Hostname to be used for the tunnel
 * @param dataDir - Directory where config files will be saved
 * @param force - Whether to force setup even if configuration exists
 * @returns Object containing setup status and config paths
 */
export function setupCloudflared(
  tunnelName: string,
  hostname: string,
  dataDir: string = dirs.data,
  force: boolean = false
): {
  success: boolean;
  configPath: string;
  certPath: string;
} {
  // Log setup information
  logger.section('Cloudflare Tunnel Setup');
  logger.info(`Setting up tunnel: ${tunnelName}`);
  logger.info(`Using hostname: ${hostname}`);
  logger.info(`Data directory: ${dataDir}`);
  logger.log('');

  // Get configuration paths
  const { configDir, configPath, certPath } = getCloudflaredPaths(dataDir);

  // Ensure cloudflared directory exists
  if (!fs.existsSync(configDir)) {
    logger.info(`Creating directory: ${configDir}`);
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Check if configuration already exists
  if (!force && isCloudflaredConfigured(dataDir)) {
    logger.info('Cloudflare Tunnel already configured.');
    logger.info(`Using existing configuration at: ${configDir}`);
    logger.info('To reconfigure, use --force flag or delete the existing configuration files.');

    return {
      success: true,
      configPath,
      certPath
    };
  }

  // Check if Docker is installed and running
  if (!isDockerAvailable()) {
    logger.error('Docker is not running or not installed. Please start Docker and try again.');
    return {
      success: false,
      configPath: '',
      certPath: ''
    };
  }

  // Provide instructions for the authentication flow
  logger.info('You will be prompted to authenticate with Cloudflare:');
  logger.info('1. A URL will appear in the terminal');
  logger.info('2. Open this URL in your browser');
  logger.info('3. Log in to your Cloudflare account');
  logger.info('4. Grant access to create tunnels');
  logger.info('5. Return to this terminal to complete the setup\n');

  try {
    logger.info('Starting cloudflared setup container...');

    // Create a temporary script file to avoid shell escaping issues
    const setupScriptPath = path.resolve(path.join(dataDir, 'cloudflared-setup.sh'));
    const setupScript = `#!/bin/sh
# Install required tools
apk add --no-cache curl grep

# Download cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Create config directory
mkdir -p /etc/cloudflared

echo "\\n>> AUTHENTICATION REQUIRED <<"
echo "Follow the authentication link shown below..."
cloudflared login

# Verify authentication succeeded
if [ ! -f /root/.cloudflared/cert.pem ]; then
  echo "Authentication failed! Certificate not found."
  exit 1
fi

# Copy certificate
cp /root/.cloudflared/cert.pem /etc/cloudflared/
export TUNNEL_ORIGIN_CERT=/etc/cloudflared/cert.pem

echo "\\n>> CREATING TUNNEL <<"
echo "Setting up tunnel: ${tunnelName}"
cloudflared tunnel create ${tunnelName} > /tmp/tunnel_output.txt
cat /tmp/tunnel_output.txt
TUNNEL_ID=$(grep 'id' /tmp/tunnel_output.txt | grep -o '[0-9a-f]\\{8\\}-[0-9a-f]\\{4\\}-[0-9a-f]\\{4\\}-[0-9a-f]\\{4\\}-[0-9a-f]\\{12\\}')

if [ -z "$TUNNEL_ID" ]; then
  echo "Failed to extract tunnel ID!"
  exit 1
fi

echo "Extracted tunnel ID: $TUNNEL_ID"
echo "\\n>> CREATING CONFIG <<"
echo "tunnel: $TUNNEL_ID" > /etc/cloudflared/config.yml
echo "credentials-file: /etc/cloudflared/$TUNNEL_ID.json" >> /etc/cloudflared/config.yml
echo "ingress:" >> /etc/cloudflared/config.yml
echo "  - hostname: ${hostname}" >> /etc/cloudflared/config.yml
echo "    service: http://websocket-server:${defaults.port}" >> /etc/cloudflared/config.yml
echo "  - service: http_status:404" >> /etc/cloudflared/config.yml

echo "\\n>> CONFIGURING DNS <<"
cloudflared tunnel route dns $TUNNEL_ID ${hostname}

# Fix permissions on all files to ensure they're readable by any user
echo "\\n>> FIXING PERMISSIONS <<"
chmod -R 644 /etc/cloudflared/*.json /etc/cloudflared/*.yml /etc/cloudflared/*.pem
chmod 755 /etc/cloudflared

echo "\\n>> SETUP COMPLETE! <<"
`;

    // Write the script file
    fs.writeFileSync(setupScriptPath, setupScript, { mode: 0o755 });

    // Cross-platform path normalization for Docker (always use forward slashes)
    const dockerCloudflaredPath = path.resolve(configDir).replace(/\\/g, '/');
    const dockerScriptPath = path.resolve(setupScriptPath).replace(/\\/g, '/');

    // Build a simple, consistent Docker command that works on all platforms
    const dockerArgs = [
      'run',
      '--rm',
      '-it',
      `--name=${defaults.containerPrefix}-cloudflared-setup`,
      `-v`, `${dockerCloudflaredPath}:/etc/cloudflared`,
      `-v`, `${dockerScriptPath}:/setup.sh`,
      `-e`, `TUNNEL_NAME=${tunnelName}`,
      `-e`, `HOSTNAME=${hostname}`,
      `alpine:${defaults.alpineTag}`,
      'sh', '/setup.sh'
    ];

    // Execute docker with the args array to avoid shell parsing issues
    logger.info(`Running docker ${dockerArgs.join(' ')}`);
    execSync(`docker ${dockerArgs.join(' ')}`, { stdio: 'inherit' });

    // Clean up the temporary script
    try {
      fs.unlinkSync(setupScriptPath);
    } catch (err) {
      // Ignore cleanup errors
    }

    // Verify files were created successfully
    if (!fs.existsSync(configPath) || !fs.existsSync(certPath)) {
      logger.error('Configuration files were not created properly.');
      return {
        success: false,
        configPath: '',
        certPath: ''
      };
    }

    logger.log('');
    logger.success('Cloudflare Tunnel setup completed successfully!');
    logger.info(`Config file: ${configPath}`);
    logger.info(`Certificate: ${certPath}`);

    return {
      success: true,
      configPath,
      certPath
    };
  } catch (error) {
    logger.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      configPath: '',
      certPath: ''
    };
  }
}

/**
 * CLI command implementation
 *
 * Processes command line arguments and passes them to the core setup function.
 * Handles displaying additional information and usage instructions.
 *
 * @param cli - Object containing command line flags and arguments
 * @param rl - Readline interface for user input
 * @returns Promise resolving to object with setup status and config paths
 */
async function setupCloudflaredImplementation(
  cli: { flags: Record<string, any>, _: string[] },
  rl: ReadlineInterface
): Promise<{
  success: boolean;
  configPath: string;
  certPath: string;
}> {
  try {
    // Get parameters from flags or use config defaults
    // Config defaults already include environment variable checks
    const tunnelName = cli.flags['tunnel-name'] || defaults.cloudflareTunnelName;
    const hostname = cli.flags['hostname'] || defaults.cloudflareHostname;
    const dataDir = cli.flags['data-dir'] || dirs.data;
    const force = cli.flags['force'] === true;

    // Run the setup process
    const result = setupCloudflared(tunnelName, hostname, dataDir, force);

    // Display usage instructions if successful
    if (result.success) {
      logger.log('');
      logger.log('You can now start the system with:');
      logger.log('  manager start-system');
      logger.log('');
      logger.log('Your WebSocket server will be available at:');
      logger.log(`  wss://${hostname}`);
    }

    return result;
  } catch (error) {
    logger.error(`Error setting up cloudflared: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Command handler configuration
 *
 * Defines the command's help information, default values, and binds
 * the implementation function.
 */
const setupCloudflaredHandler = createCommandHandler(
  setupCloudflaredImplementation,
  {
    defaults: {
      // Use config defaults directly - they already include env var checks
      'tunnel-name': defaults.cloudflareTunnelName,
      'hostname': defaults.cloudflareHostname,
      'data-dir': dirs.data,
      'force': false
    },
    help: {
      title: 'Cloudflare Tunnel Setup',
      command: 'setup-cloudflared',
      options: [
        { name: 'tunnel-name', description: 'Name for the Cloudflare tunnel', default: defaults.cloudflareTunnelName },
        { name: 'hostname', description: 'Hostname to use for the tunnel', default: defaults.cloudflareHostname },
        { name: 'data-dir', description: 'Directory to save config files', default: dirs.data },
        { name: 'force', description: 'Force setup even if configuration exists', default: 'false' },
        { name: 'help', description: 'Show this help message' }
      ],
      description: [
        'Sets up a Cloudflare Tunnel for secure WebSocket connections.',
        'This command will authenticate with Cloudflare, create a tunnel,',
        'and configure the necessary files for connecting your server.',
        '',
        'Note: This command requires Docker to be installed and running.'
      ],
      examples: [
        'manager setup-cloudflared',
        'manager setup-cloudflared --tunnel-name=my-websocket',
        'manager setup-cloudflared --hostname=ws.example.com',
        'manager setup-cloudflared --data-dir=/custom/data/path',
        'manager setup-cloudflared --force'
      ]
    } as CommandHelp
  }
);

// Export the command handler for use in the CLI manager
export default setupCloudflaredHandler;

// Export all utility functions and the core setup function for programmatic use
export { isCloudflaredConfigured, getCloudflaredPaths, isDockerAvailable };
