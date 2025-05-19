/**
 * Console logger utility with colored output
 */
const chalk = require('chalk');

/**
 * Log an info message (blue)
 * @param {string} message - Message to log
 */
function info(message) {
  console.log(chalk.blue(`[INFO] ${message}`));
}

/**
 * Log a success message (green)
 * @param {string} message - Message to log
 */
function success(message) {
  console.log(chalk.green(`[SUCCESS] ${message}`));
}

/**
 * Log an error message (red)
 * @param {string} message - Message to log
 */
function error(message) {
  console.error(chalk.red(`[ERROR] ${message}`));
}

/**
 * Log a warning message (yellow)
 * @param {string} message - Message to log
 */
function warn(message) {
  console.log(chalk.yellow(`[WARNING] ${message}`));
}

/**
 * Log a plain message (no prefix)
 * @param {string} message - Message to log
 */
function log(message) {
  console.log(message);
}

/**
 * Log a section header (cyan background)
 * @param {string} title - Section title
 */
function section(title) {
  console.log(chalk.black.bgCyan(`\n === ${title} === \n`));
}

module.exports = {
  info,
  success,
  error,
  warn,
  log,
  section
};
