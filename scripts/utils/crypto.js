/**
 * Cryptographic utilities for scripts
 */
const crypto = require('crypto');
const fs = require('fs');
const { ensureDir } = require('./fs');
const path = require('path');

/**
 * Generate an RSA key pair
 * @param {number} modulusLength - Size of key in bits
 * @returns {Object} Object containing private and public keys
 */
function generateRsaKeyPair(modulusLength = 2048) {
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
 * @param {Object} keyPair - Object with privateKey and publicKey
 * @param {string} basePath - Base path for key files
 * @param {string} name - Name prefix for the key files
 * @returns {Object} Paths to the saved keys
 */
function saveKeyPair(keyPair, basePath, name) {
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
 * @param {string} publicKey - PEM formatted public key
 * @returns {string} Fingerprint of the key
 */
function generateKeyFingerprint(publicKey) {
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
  return hash.substring(0, 32).match(/.{4}/g).join(':');
}

/**
 * Generate a random ID
 * @param {number} bytes - Number of random bytes to generate
 * @returns {string} Hexadecimal string
 */
function generateRandomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  generateRsaKeyPair,
  saveKeyPair,
  generateKeyFingerprint,
  generateRandomId
};
