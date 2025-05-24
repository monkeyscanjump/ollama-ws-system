/**
 * Command line interface utilities
 *
 * Provides a unified set of utilities for all command-line operations
 * in the WebSocket system, including input/output, argument parsing,
 * help text formatting, and interactive prompts.
 */
import { Interface as ReadlineInterface, createInterface as createNodeInterface } from 'readline';
import path from 'path';
import os from 'os';
import logger from './logger';
import { CommandHelp } from '@ws-system/shared';

let globalRl: ReadlineInterface | null = null;

/**
 * Create readline interface for CLI input
 * This ensures only one readline interface exists at a time
 *
 * @returns Readline interface for user input/output
 */
export function createInterface(): ReadlineInterface {
  // If we already have an interface, return it
  if (globalRl) {
    return globalRl;
  }

  globalRl = createNodeInterface({
    input: process.stdin,
    output: process.stdout
  });

  // When closing, release the global reference
  globalRl.on('close', () => {
    globalRl = null;
  });

  return globalRl;
}

/**
 * Parse command line arguments with support for flags and options
 *
 * @param args - Command line arguments to parse
 * @param options - Configuration options for parsing
 * @returns Parsed arguments object with positional args, flags, and help status
 */
export function parseArgs(args: string[], options: { defaults?: Record<string, any> } = {}): {
  _: string[];
  flags: Record<string, any>;
  help: boolean;
} {
  const result = {
    _: [] as string[],     // Positional arguments
    flags: {} as Record<string, any>, // Flag options (--flag)
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
 *
 * @param args - Command line arguments to validate
 * @returns Boolean indicating if all arguments use correct syntax
 */
export function validateArgumentSyntax(args: string[]): boolean {
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
 *
 * @param rl - Readline interface
 * @param question - Question to ask user
 * @param defaultYes - Whether the default answer is Yes
 * @returns Promise resolving to boolean based on user response
 */
export function confirm(
  rl: ReadlineInterface,
  question: string,
  defaultYes = false
): Promise<boolean> {
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
 * Simple prompt for input with default value support
 *
 * @param rl - Readline interface
 * @param question - Question to ask user
 * @param defaultValue - Optional default value if user input is empty
 * @returns Promise resolving to user input string
 */
export function prompt(
  rl: ReadlineInterface,
  question: string,
  defaultValue?: string
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const trimmedAnswer = answer.trim();
      resolve(trimmedAnswer === '' && defaultValue !== undefined ? defaultValue : trimmedAnswer);
    });
  });
}

/**
 * Prompt for a file path and read its contents
 *
 * @param rl - Readline interface
 * @param question - Question to ask user
 * @param readFunction - Function to read and process the file
 * @returns Promise resolving to the file contents processed by readFunction
 */
export function promptForFile<T>(
  rl: ReadlineInterface,
  question: string,
  readFunction: (path: string) => Promise<T> | T
): Promise<T> {
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
        logger.error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
        resolve(promptForFile(rl, question, readFunction));
      }
    });
  });
}

/**
 * Display command help text with consistent formatting
 *
 * @param options - Help text configuration
 */
export function displayHelp(options: CommandHelp): void {
  const { title, command, options: cmdOptions, description, examples } = options;

  logger.section(title);
  logger.log(`Usage: manager ${command} [--options]`);
  logger.log('');

  if (cmdOptions && cmdOptions.length > 0) {
    logger.log('Options:');

    // Find the longest option name for alignment
    const maxOptionLength = Math.max(...cmdOptions.map(opt => opt.name.length));

    // Display each option with alignment
    cmdOptions.forEach(opt => {
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
 * @param rows - Array of string arrays representing table rows
 * @param options - Table formatting options
 * @returns Formatted table string
 */
export function formatTable(
  rows: string[][],
  options: { hasHeaders?: boolean; columnPadding?: number } = {}
): string {
  if (!rows || rows.length === 0) {
    return '';
  }

  const hasHeaders = options.hasHeaders || false;
  const columnPadding = options.columnPadding || 2;

  // Calculate column widths
  const columnWidths: number[] = [];

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
 * @param handler - Function to handle command execution
 * @param options - Configuration options for the command
 * @returns Command handler function
 */
export function createCommandHandler<T>(
  handler: (cli: { flags: Record<string, any>, _: string[] }, rl: ReadlineInterface) => Promise<T>,
  options: {
    defaults?: Record<string, any>;
    help?: CommandHelp;
  } = {}
): (args: string[]) => Promise<void> {
  return async function(args: string[]): Promise<void> {
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
      logger.error(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Propagate to manager
    } finally {
      rl.close();
    }
  };
}
