/**
 * Cryptographic utilities for scripts
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ensureDir } from './fs';

/**
 * Generate an RSA key pair
 */
export function generateRsaKeyPair(modulusLength = 2048): {
  privateKey: string;
  publicKey: string;
} {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
}

/**
 * Save key pair to files
 */
export function saveKeyPair(
  keyPair: { privateKey: string; publicKey: string },
  basePath: string,
  name: string
): {
  privateKeyPath: string;
  publicKeyPath: string;
} {
  ensureDir(basePath);

  const privateKeyPath = path.join(basePath, `${name}_key.pem`);
  const publicKeyPath = path.join(basePath, `${name}_key.pub`);

  fs.writeFileSync(privateKeyPath, keyPair.privateKey);
  fs.writeFileSync(publicKeyPath, keyPair.publicKey);

  return {
    privateKeyPath,
    publicKeyPath
  };
}

/**
 * Generate a fingerprint for a public key
 */
export function generateKeyFingerprint(publicKey: string): string {
  // Clean up the key
  const cleanKey = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');

  // Generate SHA256 hash of the key
  const hash = crypto.createHash('sha256')
    .update(Buffer.from(cleanKey, 'base64'))
    .digest('hex');

  // Format as fingerprint (take first 16 bytes, format as 8 groups of 4 chars)
  return hash.substring(0, 32).match(/.{4}/g)?.join(':') || hash.substring(0, 32);
}

/**
 * Generate a random ID
 */
export function generateRandomId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}
