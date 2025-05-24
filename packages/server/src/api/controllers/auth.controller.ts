import { Request, Response } from 'express';
import crypto from 'crypto';
import { registerClient as registerClientInDb } from '../../security/clients';
import { createLogger } from '../../utils';
import { ERROR_CODES } from '../../constants';

const logger = createLogger('api:auth');

/**
 * Handles client registration by validating and storing their public key
 *
 * @param req Express request object
 * @param res Express response object
 */
export function registerClient(req: Request, res: Response): void {
  try {
    const { name, publicKey, signatureAlgorithm } = req.body;

    if (!name || !publicKey) {
      res.status(400).json({
        error: 'Missing required fields: name and publicKey',
        code: ERROR_CODES.MISSING_PARAMETERS
      });
      return;
    }

    // Validate public key format
    try {
      crypto.createPublicKey(publicKey);
    } catch (e) {
      res.status(400).json({
        error: 'Invalid public key format',
        code: ERROR_CODES.INVALID_REQUEST
      });
      return;
    }

    // Validate algorithm if provided
    if (signatureAlgorithm) {
      try {
        // Test if algorithm is supported
        crypto.createVerify(signatureAlgorithm);
      } catch (e) {
        res.status(400).json({
          error: `Unsupported signature algorithm: ${signatureAlgorithm}`,
          code: ERROR_CODES.INVALID_REQUEST
        });
        return;
      }
    }

    // Use renamed import to avoid naming conflict
    const clientId = registerClientInDb(name, publicKey, signatureAlgorithm);
    res.status(201).json({ clientId });
  } catch (error) {
    logger.error('Client registration error:', error);
    res.status(500).json({
      error: 'Failed to register client',
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}
