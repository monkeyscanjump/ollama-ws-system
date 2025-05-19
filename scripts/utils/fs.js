/**
 * File system utilities for script operations
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Ensures a directory exists, creating it if necessary
 *
 * @param {string} dirPath - Path to directory
 * @returns {boolean} true if directory was created, false if it already existed
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true; // Directory was newly created
  }
  return false; // Directory already existed
}

/**
 * Load JSON data from a file
 * @param {string} filePath - Path to the JSON file
 * @param {boolean} createIfMissing - Create empty array if file doesn't exist
 * @returns {any} Parsed JSON data or null if error
 */
function loadJson(filePath, createIfMissing = false) {
  try {
    if (!fs.existsSync(filePath)) {
      if (createIfMissing) {
        ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, '[]');
        return [];
      }
      return null;
    }

    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error reading ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Save data to a JSON file
 * @param {string} filePath - Path to save the file
 * @param {any} data - Data to save
 * @param {boolean} pretty - Format JSON with indentation
 * @returns {boolean} True if successful
 */
function saveJson(filePath, data, pretty = true) {
  try {
    ensureDir(path.dirname(filePath));
    const jsonString = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    fs.writeFileSync(filePath, jsonString);
    return true;
  } catch (error) {
    logger.error(`Error saving ${filePath}: ${error.message}`);
    return false;
  }
}

module.exports = {
  ensureDir,
  loadJson,
  saveJson
};
