import crypto from 'crypto';
import { getAuthorizedClient } from './clients';
import { generateChallenge as generateCryptoChallenge } from './challenge';
import { createLogger } from '../utils';
import { authConfig } from '../config';

const logger = createLogger('security:auth');

/**
 * Verifies a client's signature against a challenge using their registered public key
 *
 * @param clientId - The ID of the client to verify
 * @param signature - The challenge signature in base64 format
 * @param challenge - The original challenge string to verify against
 * @param defaultAlgorithm - Default algorithm to use if not specified for client
 * @returns True if signature is valid, false otherwise
 */
export function verifyClientSignature(
  clientId: string,
  signature: string,
  challenge: string,
  defaultAlgorithm: string = authConfig.defaultAlgorithm
): boolean {
  const client = getAuthorizedClient(clientId);
  if (!client) {
    logger.warn(`Verification attempted for unknown client: ${clientId}`);
    return false;
  }

  try {
    // Use client-specific algorithm if available, otherwise use default
    const algorithm = client.signatureAlgorithm || defaultAlgorithm;

    logger.debug(`Using signature algorithm ${algorithm} for client ${clientId}`);

    const verify = crypto.createVerify(algorithm);
    verify.update(challenge);
    const isValid = verify.verify(client.publicKey, Buffer.from(signature, 'base64'));

    logger.debug(`Signature verification for client ${clientId}: ${isValid ? 'success' : 'failed'}`);
    return isValid;
  } catch (error) {
    logger.error(`Signature verification error for client ${clientId}: ${error}`);
    return false;
  }
}

/**
 * Generates a secure random challenge string
 * Re-exports the implementation from challenge.ts for API compatibility
 *
 * @returns A cryptographically secure random challenge string
 */
export function generateChallenge(): string {
  return generateCryptoChallenge();
}
