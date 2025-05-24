/**
 * Shared error utilities
 */
import { ErrorCode } from '../types';

/**
 * Creates an Error with an additional code property for more specific error handling
 *
 * @param message - The error message
 * @param code - An error code identifier, defaults to 'server_error'
 * @returns An Error object with a code property
 */
export function createError(message: string, code: ErrorCode = 'server_error'): Error {
  const error = new Error(message);
  (error as any).code = code;
  return error;
}
