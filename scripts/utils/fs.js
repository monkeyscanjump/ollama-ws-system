/**
 * File system utilities for script operations
 */
const fs = require('fs');
const path = require('path');

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Path to ensure exists
 * @returns {boolean} True if successful
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    } catch (error) {
      console.error(`Failed to create directory ${dirPath}: ${error.message}`);
      return false;
    }
  }
  return true;
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
    console.error(`Error reading ${filePath}: ${error.message}`);
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
    console.error(`Error saving ${filePath}: ${error.message}`);
    return false;
  }
}

module.exports = {
  ensureDir,
  loadJson,
  saveJson
};
