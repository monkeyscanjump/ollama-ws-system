# Security Model - Ollama WebSocket System

This document provides a detailed explanation of the security architecture and design principles behind the Ollama WebSocket System.

## Table of Contents

- [Security Model - Ollama WebSocket System](#security-model---ollama-websocket-system)
  - [Table of Contents](#table-of-contents)
  - [Security Overview](#security-overview)
  - [Threat Model](#threat-model)
  - [Authentication Architecture](#authentication-architecture)
    - [Public-Key Cryptography](#public-key-cryptography)
    - [Challenge-Response Protocol](#challenge-response-protocol)
    - [Authentication Flow](#authentication-flow)
  - [Client Management](#client-management)
    - [Client Registration](#client-registration)
    - [Client Revocation](#client-revocation)
  - [Rate Limiting \& Brute Force Protection](#rate-limiting--brute-force-protection)
  - [Data Security](#data-security)
  - [Security Recommendations](#security-recommendations)
  - [Future Security Enhancements](#future-security-enhancements)

## Security Overview

The Ollama WebSocket System is designed to address a critical security gap in the Ollama LLM server: the lack of built-in authentication. By adding a secure gateway layer, we can:

1. Authenticate clients using strong cryptographic methods
2. Control which clients can access your language models
3. Protect against common attack vectors
4. Maintain audit logs of client connections and access

This system uses a battle-tested security approach based on asymmetric (public-key) cryptography, similar to SSH and TLS certificates. This approach provides significantly stronger security than password-based authentication.

## Threat Model

The system is designed to protect against the following threats:

- **Unauthorized access**: Preventing unauthorized users from accessing your language models
- **Credential theft**: Mitigating the risk if client credentials are compromised
- **Man-in-the-middle attacks**: Ensuring that authentication cannot be intercepted or replayed
- **Brute force attacks**: Preventing attackers from guessing credentials through rate limiting
- **Denial of service**: Limiting the impact of attempted DoS through rate limiting

## Authentication Architecture

### Public-Key Cryptography

The system uses RSA public-key cryptography, where:

- Each client has a pair of mathematically related keys: one private, one public
- The private key is kept secret by the client
- The public key is registered with the server
- Messages signed with the private key can be verified with the public key, but not created

This asymmetric approach means the server never needs to store sensitive authentication secrets.

### Challenge-Response Protocol

Authentication uses a challenge-response protocol:

1. When a client connects, the server generates a random, unique challenge string
2. The client signs this challenge using its private key, creating a signature
3. The server verifies this signature using the client's registered public key
4. Only a client possessing the correct private key can generate a valid signature

This approach prevents replay attacks (where an attacker captures and replays a previous authentication) because each challenge is unique and used only once.

### Authentication Flow

Here's the detailed authentication process:

1. **Connection Establishment**:
   - Client establishes a WebSocket connection to the server
   - Server assigns a unique connection ID for tracking

2. **Challenge Issuance**:
   - Server generates a cryptographically secure random challenge string
   - Challenge is stored in memory with timestamp and expiration
   - Server sends challenge to the client

3. **Client Authentication**:
   - Client loads its private key from secure storage
   - Client creates a signature by signing the challenge string
   - Client sends its client ID and signature to the server

4. **Server Verification**:
   - Server retrieves the client's public key using the client ID
   - Server verifies the signature against the original challenge
   - Server checks that the challenge hasn't expired (default: 10 minutes)

5. **Authentication Result**:
   - If verification succeeds, the connection is marked as authenticated
   - If verification fails, connection is terminated and the attempt is logged
   - Rate limiting is applied for failed attempts

## Client Management

### Client Registration

The client registration process securely associates a client identity with a public key:

1. **Key Generation**:
   - Client generates an RSA key pair (default: 2048 bits)
   - The private key is stored securely by the client
   - The public key is prepared for registration

2. **Registration**:
   - Client submits its name and public key to the server via the REST API
   - Server validates the public key format
   - Server generates a unique client ID
   - Server stores the client record in its database

3. **Security Controls**:
   - Registration can optionally be restricted to admin clients only
   - Public keys must be valid RSA keys in PEM format
   - Duplicate client names are rejected

### Client Revocation

If a client's credentials are compromised, they can be quickly revoked:

1. **Revocation Process**:
   - Administrator runs the revocation script with client ID or name
   - Client is removed from the authorized clients database
   - A backup of the revoked client's information is stored for audit purposes

2. **Effect of Revocation**:
   - Any active connections for that client are immediately terminated
   - Future connection attempts will fail authentication
   - Revoked clients cannot be re-registered with the same ID

## Rate Limiting & Brute Force Protection

The system implements multiple layers of protection against brute force attacks:

1. **Exponential Backoff**:
   - After a configurable number of failed attempts (default: 5)
   - Blocking duration increases exponentially with each subsequent failure
   - Provides strong defense against automated password guessing

2. **Per-Client Tracking**:
   - Rate limiting is tracked per client ID
   - Additional IP-based rate limiting can be enabled
   - Prevents distributed brute force attempts

3. **Authentication Timeouts**:
   - Connections must complete authentication within a time limit (default: 30 seconds)
   - Incomplete authentications are terminated
   - Prevents resource exhaustion attacks

## Data Security

The system manages several types of sensitive data:

1. **Client Database**:
   - Contains client IDs, names, and public keys
   - Does not contain any sensitive secrets
   - Backups are created automatically with rotation

2. **Challenge Data**:
   - Stored in memory only, never persisted to disk
   - Expires automatically after a short period
   - Contains no sensitive client information

3. **Private Keys**:
   - Never stored on or transmitted to the server
   - Must be protected by the client
   - Used only for signing challenges, never for encrypting data

## Security Recommendations

For optimal security, follow these recommendations:

1. **Private Key Management**:
   - Generate a unique key pair for each client
   - Store private keys securely with appropriate file permissions
   - Consider using a hardware security module for high-security deployments

2. **Key Strength**:
   - Use minimum 2048-bit RSA keys (4096 bits recommended for sensitive applications)
   - Use keys generated with secure random number generators

3. **Server Configuration**:
   - Run the WebSocket server behind a reverse proxy like Nginx for TLS termination
   - Enable HTTPS for all API endpoints
   - Keep the server and all dependencies updated

4. **Client Hygiene**:
   - Revoke client access when no longer needed
   - Rotate keys periodically for sensitive applications
   - Don't share client credentials between applications

## Future Security Enhancements

Planned security improvements include:

1. **Access Control Lists**:
   - Allow/deny specific models for specific clients
   - Rate limits per client or client group
   - Usage quotas and tracking

2. **Transport Security**:
   - Built-in TLS for encrypted communications
   - Certificate validation for both server and clients

3. **Audit Logging**:
   - Comprehensive logs of all client activities
   - Log generation statistics for compliance

4. **Additional Authentication Methods**:
   - Support for ED25519 keys (faster, smaller)
   - Two-factor authentication options

---

For more technical details on implementing clients that work with this security model, see:

- [Node.js Client Implementation](nodejs-client.md)
- [Python Client Implementation](python-client.md)
- [Browser Client Implementation](browser-client.md)
