/**
 * Command line interface utilities
 *
 * Provides a unified set of utilities for all command-line operations
 * in the WebSocket system, including input/output, argument parsing,
 * help text formatting, and interactive prompts.
 */
const readline = require('readline');
const path = require('path');
const os = require('os');
const logger = require('./logger');

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
 * Validate that all provided arguments use double-dash format
 * @param {string[]} args - Command line arguments to validate
 * @returns {boolean} Whether all arguments use proper format
 */
function validateArgumentSyntax(args) {
  // Skip validation if no arguments
  if (!args || args.length === 0) {
    return true;
  }

  for (const arg of args) {
    // Allow help flag in either format
    if (arg === '-h') continue;

    // Check all other arguments follow double-dash format
    if (arg.startsWith('-') && !arg.startsWith('--')) {
      return false;
    }
  }

  return true;
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

/**
 * Simple prompt for input
 * @param {readline.Interface} rl - Readline interface
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's response
 */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for a file path and read its contents
 * @param {readline.Interface} rl - Readline interface
 * @param {string} question - Question to ask
 * @param {Function} readFunction - Function to read the file
 * @returns {Promise<string>} File contents
 */
function promptForFile(rl, question, readFunction) {
  return new Promise((resolve) => {
    rl.question(question, async (answer) => {
      try {
        const resolvedPath = path.resolve(process.cwd(), answer.trim());
        logger.info(`Attempting to read from: ${resolvedPath}`);
        const content = await readFunction(resolvedPath);
        if (content) {
          resolve(content);
        } else {
          resolve(promptForFile(rl, question, readFunction));
        }
      } catch (error) {
        logger.error(`Error reading file: ${error.message}`);
        resolve(promptForFile(rl, question, readFunction));
      }
    });
  });
}

/**
 * Display command help text with consistent formatting
 *
 * @param {Object} options - Help text configuration
 * @param {string} options.title - Title of the command
 * @param {string} options.command - Command name
 * @param {Array<{name: string, description: string, default?: string}>} options.options - Command options
 * @param {string} options.description - Command description
 * @param {string[]} options.examples - Command examples
 */
function displayHelp({ title, command, options, description, examples }) {
  logger.section(title);
  logger.log(`Usage: manager ${command} [--options]`);
  logger.log('');

  if (options && options.length > 0) {
    logger.log('Options:');

    // Find the longest option name for alignment
    const maxOptionLength = Math.max(...options.map(opt => opt.name.length));

    // Display each option with alignment
    options.forEach(opt => {
      const padding = ' '.repeat(Math.max(0, maxOptionLength - opt.name.length + 2));
      let line = `  --${opt.name}${padding}${opt.description}`;

      // Add default value if specified
      if (opt.default !== undefined) {
        line += ` (default: ${opt.default})`;
      }

      logger.log(line);
    });
    logger.log('');
  }

  if (description) {
    logger.log('Description:');
    // Handle multi-line descriptions
    if (Array.isArray(description)) {
      description.forEach(line => logger.log(`  ${line}`));
    } else {
      const maxLineLength = 76; // Standard terminal width minus some padding

      // Wrap long description text
      let words = description.split(' ');
      let currentLine = '  ';

      words.forEach(word => {
        if (currentLine.length + word.length + 1 > maxLineLength) {
          logger.log(currentLine);
          currentLine = '  ' + word;
        } else {
          if (currentLine.length > 2) {
            currentLine += ' ';
          }
          currentLine += word;
        }
      });

      if (currentLine.length > 2) {
        logger.log(currentLine);
      }
    }
    logger.log('');
  }

  if (examples && examples.length > 0) {
    logger.log('Examples:');
    examples.forEach(example => {
      logger.log(`  ${example}`);
    });
  }
}

/**
 * Format data in a table
 *
 * @param {Array<Array<string>>} rows - Table data as array of rows
 * @param {Object} options - Table formatting options
 * @returns {string} Formatted table
 */
function formatTable(rows, options = {}) {
  if (!rows || rows.length === 0) {
    return '';
  }

  const hasHeaders = options.hasHeaders || false;
  const columnPadding = options.columnPadding || 2;

  // Calculate column widths
  const columnWidths = [];

  rows.forEach(row => {
    row.forEach((cell, i) => {
      const width = String(cell).length;
      if (!columnWidths[i] || width > columnWidths[i]) {
        columnWidths[i] = width;
      }
    });
  });

  // Build the table
  let result = '';

  // Header separator
  const headerSeparator = !hasHeaders ? '' :
    columnWidths.map(width => '-'.repeat(width + columnPadding)).join('') + os.EOL;

  // Build rows
  rows.forEach((row, rowIndex) => {
    let rowText = '';

    row.forEach((cell, i) => {
      const cellText = String(cell);
      const padding = ' '.repeat(columnWidths[i] - cellText.length + columnPadding);
      rowText += cellText + padding;
    });

    result += rowText.trimRight() + os.EOL;

    // Add separator after header
    if (hasHeaders && rowIndex === 0) {
      result += headerSeparator;
    }
  });

  return result;
}

/**
 * Creates a standardized command handler function
 *
 * @param {Function} handler - The command implementation function
 * @param {Object} options - Handler options
 * @returns {Function} Wrapped handler function
 */
function createCommandHandler(handler, options = {}) {
  return async function(args) {
    // Create readline interface
    const rl = createInterface();

    try {
      // Parse args with provided defaults
      const cli = parseArgs(args, {
        defaults: options.defaults || {}
      });

      // Display help if requested
      if (cli.flags.help && options.help) {
        displayHelp(options.help);
        return;
      }

      // Execute handler with parsed arguments
      await handler(cli, rl);
    } catch (error) {
      logger.error(`Command failed: ${error.message}`);
      throw error; // Propagate to manager
    } finally {
      rl.close();
    }
  };
}

module.exports = {
  createInterface,
  parseArgs,
  validateArgumentSyntax,
  confirm,
  prompt,
  promptForFile,
  displayHelp,
  formatTable,
  createCommandHandler
};
