/**
 * File system utilities for script operations
 */
import fs from 'fs';
import path from 'path';
import logger from './logger';

/**
 * Ensures a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true; // Directory was newly created
  }
  return false; // Directory already existed
}

/**
 * Load JSON data from a file
 */
export function loadJson<T = any>(filePath: string, createIfMissing = false): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      if (createIfMissing) {
        ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, '[]');
        return [] as unknown as T;
      }
      return null;
    }

    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T;
  } catch (error) {
    logger.error(`Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Save data to a JSON file
 */
export function saveJson(filePath: string, data: any, pretty = true): boolean {
  try {
    ensureDir(path.dirname(filePath));
    const jsonString = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    fs.writeFileSync(filePath, jsonString);
    return true;
  } catch (error) {
    logger.error(`Error saving ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
