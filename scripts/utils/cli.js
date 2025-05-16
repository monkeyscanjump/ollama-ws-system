/**
 * Command line interface utilities
 */
const readline = require('readline');

/**
 * Create readline interface for CLI input
 * @returns {readline.Interface} Readline interface
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Parse command line arguments with support for flags and options
 * @param {string[]} args - Raw command line arguments
 * @param {Object} options - Option configurations
 * @returns {Object} Parsed arguments and options
 */
function parseArgs(args, options = {}) {
  const result = {
    _: [],     // Positional arguments
    flags: {}, // Flag options (--flag)
    help: args.includes('--help') || args.includes('-h')
  };

  // Process all arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle options (--option value or --option=value)
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      if (key.includes('=')) {
        const [optKey, optValue] = key.split('=');
        result.flags[optKey] = optValue;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags[key] = args[i + 1];
        i++; // Skip the value in the next iteration
      } else {
        result.flags[key] = true;
      }
    }
    // Handle short flags (-f)
    else if (arg.startsWith('-') && arg.length === 2) {
      result.flags[arg.substring(1)] = true;
    }
    // Handle positional arguments
    else if (!arg.startsWith('-')) {
      result._.push(arg);
    }
  }

  // Apply defaults from options
  if (options.defaults) {
    for (const [key, value] of Object.entries(options.defaults)) {
      if (result.flags[key] === undefined) {
        result.flags[key] = value;
      }
    }
  }

  return result;
}

/**
 * Ask for confirmation from the user
 * @param {readline.Interface} rl - Readline interface
 * @param {string} question - Question to ask
 * @param {boolean} defaultYes - Whether the default (empty) response is yes
 * @returns {Promise<boolean>} User's response
 */
function confirm(rl, question, defaultYes = false) {
  const prompt = defaultYes ? `${question} [Y/n] ` : `${question} [y/N] `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      const normalizedAnswer = answer.trim().toLowerCase();

      if (normalizedAnswer === '') {
        return resolve(defaultYes);
      }

      if (['y', 'yes'].includes(normalizedAnswer)) {
        return resolve(true);
      }

      resolve(false);
    });
  });
}

module.exports = {
  createInterface,
  parseArgs,
  confirm
};
