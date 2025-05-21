/**
 * Console logger utility with colored output
 */
import chalk from 'chalk';

/**
 * Log an info message (blue)
 */
function info(message: string): void {
  console.log(chalk.blue(`[INFO] ${message}`));
}

/**
 * Log a success message (green)
 */
function success(message: string): void {
  console.log(chalk.green(`[SUCCESS] ${message}`));
}

/**
 * Log an error message (red)
 */
function error(message: string): void {
  console.error(chalk.red(`[ERROR] ${message}`));
}

/**
 * Log a warning message (yellow)
 */
function warn(message: string): void {
  console.log(chalk.yellow(`[WARNING] ${message}`));
}

/**
 * Log a plain message (no prefix)
 */
function log(message: string): void {
  console.log(message);
}

/**
 * Log a section header (cyan background)
 */
function section(title: string): void {
  console.log(chalk.black.bgCyan(`\n === ${title} === \n`));
}

const logger = {
  info,
  success,
  error,
  warn,
  log,
  section
};

export default logger;
