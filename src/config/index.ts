import dotenv from 'dotenv';
import { Config } from '../types';

// Initialize environment variables
dotenv.config();

/**
 * Validates an environment variable and returns its value
 *
 * @param name - Name of the environment variable
 * @param defaultValue - Optional default value if not provided
 * @returns The environment variable value or default
 * @throws Error if variable is required but not found
 */
function validateEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (value === undefined) {
    throw new Error(`Required environment variable ${name} is missing`);
  }
  return value;
}

/**
 * Parses a numeric environment variable
 *
 * @param name - Name of the environment variable
 * @param defaultValue - Default value if not provided or invalid
 * @returns The parsed numeric value
 */
function parseNumericEnv(name: string, defaultValue: number): number {
  const rawValue = process.env[name];
  if (!rawValue) return defaultValue;

  const parsedValue = parseInt(rawValue, 10);
  return isNaN(parsedValue) ? defaultValue : parsedValue;
}

/**
 * Server configuration derived from environment variables
 */
export const config: Config = {
  port: parseNumericEnv('PORT', 3000),
  host: validateEnv('HOST', '0.0.0.0'),
  ollamaUrl: validateEnv('OLLAMA_API_URL', 'http://localhost:11434'),
  defaultModel: validateEnv('OLLAMA_DEFAULT_MODEL', 'llama2')
};

/**
 * Authentication settings
 */
export const authConfig = {
  timeout: parseNumericEnv('AUTH_TIMEOUT_MS', 30000),
  maxAttempts: parseNumericEnv('MAX_AUTH_ATTEMPTS', 5),
  authWindow: parseNumericEnv('AUTH_WINDOW_MS', 10 * 60 * 1000),
  defaultAlgorithm: validateEnv('DEFAULT_SIGNATURE_ALGORITHM', 'SHA256')
};

/**
 * Logging configuration
 */
export const logLevel = validateEnv('LOG_LEVEL', 'info');

/**
 * Environment type (development, production, etc.)
 */
export const nodeEnv = validateEnv('NODE_ENV', 'development');
