/**
 * Security Module
 *
 * This module handles all security-related functionality including
 * authentication, client management, and rate limiting.
 */

// Authentication
export {
  verifyClientSignature,
  generateChallenge
} from './auth';

// Challenge management
export {
  storeChallenge,
  verifyChallenge,
  clearChallenge
} from './challenge';

// Client management
export {
  loadAuthorizedClients,
  getAuthorizedClient,
  registerClient,
  saveClientConnectionState,
  revokeClient,
  clearClientCache,
  type AuthorizedClient
} from './clients';

// Rate limiting
export {
  rateLimiter
} from './rate-limiter';
