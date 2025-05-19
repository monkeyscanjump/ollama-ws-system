/**
 * Ollama LLM Service
 *
 * Configuration and setup for Ollama language model integration
 */
const { prompt } = require('../utils/cli');
const logger = require('../utils/logger');

/**
 * Service metadata and configuration
 */
module.exports = {
  // Service identity
  id: 'ollama',
  name: 'Ollama LLM Integration',
  description: 'Lightweight local large language model server',

  // Environment variables this service manages
  envVars: ['OLLAMA_API_URL', 'OLLAMA_DEFAULT_MODEL'],

  /**
   * Get default value for an environment variable
   * This ensures defaults are used when values are empty/not provided
   */
  getDefaultValue(variableName) {
    const defaults = {
      'OLLAMA_API_URL': 'http://localhost:11434',
      'OLLAMA_DEFAULT_MODEL': 'llama2'
    };

    return defaults[variableName] || '';
  },

  /**
   * Get description for environment variables (shown in .env file)
   */
  getVariableDescription(variableName) {
    const descriptions = {
      'OLLAMA_API_URL': [
        'Connection URL for the Ollama API server',
        '- Default for standalone deployments: http://localhost:11434',
        '- Docker Compose override: http://ollama:11434 (internal container network)',
        '- Can point to remote Ollama instances for distributed deployments',
        '- Format: protocol://hostname:port',
        '- Note: For Docker deployment, this is typically overridden in docker-compose.yml'
      ],
      'OLLAMA_DEFAULT_MODEL': [
        'The default model to use when not specified by client',
        '- Common options: llama2, mistral, gemma, phi, etc.',
        '- Must be a model name that exists on your Ollama instance',
        '- Clients can override this by explicitly specifying a model',
        '- Tip: Choose a model that balances quality and speed for your use case'
      ]
    };

    return descriptions[variableName] || null;
  },

  /**
   * Interactive configuration flow
   */
  async configure(rl, existingConfig = {}) {
    logger.section('Ollama Integration Setup');
    logger.info('Ollama is a lightweight local large language model server');
    logger.info('This integration allows the WebSocket server to use Ollama for text generation');
    logger.log('');

    // Get API URL with default
    const defaultApiUrl = existingConfig.OLLAMA_API_URL || this.getDefaultValue('OLLAMA_API_URL');
    const apiUrl = await prompt(
      rl,
      `Enter Ollama API URL [${defaultApiUrl}]: `,
      defaultApiUrl
    );

    // Display model options to help users
    logger.log('');
    logger.info('Common Ollama models:');
    logger.info('- llama2       : Meta\'s Llama 2 model (balanced performance/quality)');
    logger.info('- mistral      : Mistral AI\'s model (high quality, efficient)');
    logger.info('- orca-mini    : Smaller model with good performance');
    logger.info('- codellama    : Specialized for code generation');
    logger.log('');

    // Get default model
    const defaultModel = existingConfig.OLLAMA_DEFAULT_MODEL || this.getDefaultValue('OLLAMA_DEFAULT_MODEL');
    const model = await prompt(
      rl,
      `Enter default Ollama model to use [${defaultModel}]: `,
      defaultModel
    );

    return {
      OLLAMA_API_URL: apiUrl,
      OLLAMA_DEFAULT_MODEL: model
    };
  },

  /**
   * Post-setup instructions shown to the user
   */
  getInstructions(config) {
    return [
      'To use Ollama:',
      '1. Install Ollama from https://ollama.ai',
      `2. Run "ollama pull ${config.OLLAMA_DEFAULT_MODEL}" to download the model`,
      '3. Start the Ollama server with "ollama serve"'
    ];
  },

  /**
   * Parse configuration from command line arguments
   */
  parseCliConfig(flags) {
    if (flags['ollama-api'] && flags['ollama-model']) {
      return {
        OLLAMA_API_URL: flags['ollama-api'],
        OLLAMA_DEFAULT_MODEL: flags['ollama-model']
      };
    }

    // If only one flag is provided, use default for the other
    if (flags['ollama-api'] || flags['ollama-model']) {
      return {
        OLLAMA_API_URL: flags['ollama-api'] || this.getDefaultValue('OLLAMA_API_URL'),
        OLLAMA_DEFAULT_MODEL: flags['ollama-model'] || this.getDefaultValue('OLLAMA_DEFAULT_MODEL')
      };
    }

    return null;
  },

  /**
   * CLI flag definitions for this service
   */
  getCliFlags() {
    return {
      'ollama-api': {
        description: 'Ollama API URL',
        default: 'http://localhost:11434'
      },
      'ollama-model': {
        description: 'Default Ollama model',
        default: 'llama2'
      }
    };
  }
};
