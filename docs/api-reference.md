# API Reference - Ollama WebSocket System

This document provides a comprehensive reference for the WebSocket and REST APIs offered by the Ollama WebSocket System.

## Table of Contents

- [API Reference - Ollama WebSocket System](#api-reference---ollama-websocket-system)
  - [Table of Contents](#table-of-contents)
  - [Authentication Flow](#authentication-flow)
  - [WebSocket API](#websocket-api)
    - [Connection Establishment](#connection-establishment)
    - [Message Types](#message-types)
      - [Server → Client Messages](#server--client-messages)
      - [Client → Server Messages](#client--server-messages)
    - [Generation Options](#generation-options)
    - [Error Handling](#error-handling)
  - [REST API](#rest-api)
    - [Client Registration](#client-registration)
  - [Status Codes](#status-codes)
  - [Rate Limiting](#rate-limiting)
  - [WebSocket Connection Example](#websocket-connection-example)
  - [Further Reading](#further-reading)

## Authentication Flow

The Ollama WebSocket System uses a challenge-response authentication mechanism based on public-key cryptography:

1. **Connection**: Client connects to the WebSocket server
2. **Challenge**: Server sends a randomly generated challenge string
3. **Response**: Client signs the challenge with its private key and sends the signature
4. **Verification**: Server verifies the signature using the client's registered public key
5. **Result**: Server sends authentication result (success or failure)

This approach prevents replay attacks and ensures only authorized clients can connect.

## WebSocket API

### Connection Establishment

To establish a WebSocket connection:

```javascript
const ws = new WebSocket('ws://localhost:3000');
```

The server immediately sends a challenge upon connection.

### Message Types

#### Server → Client Messages

| Message Type | Description | Payload Example |
|--------------|-------------|----------------|
| `challenge` | Authentication challenge | `{"type":"challenge","challenge":"random-string-here","timestamp":1629123456789}` |
| `auth_result` | Authentication result | `{"type":"auth_result","success":true,"timestamp":1629123456789}` |
| `stream_start` | Start of text generation | `{"type":"stream_start","id":"req-123","model":"llama2","timestamp":1629123456789}` |
| `stream_token` | Generated token | `{"type":"stream_token","id":"req-123","token":" world","timestamp":1629123456789}` |
| `stream_end` | End of text generation | `{"type":"stream_end","id":"req-123","totalTokens":42,"elapsedTime":1234,"timestamp":1629123456789}` |
| `models_result` | Available models | `{"type":"models_result","models":["llama2","codellama"],"timestamp":1629123456789}` |
| `error` | Error message | `{"type":"error","error":"Invalid model specified","code":"invalid_model","timestamp":1629123456789}` |
| `pong` | Response to ping | `{"type":"pong","timestamp":1629123456789}` |

#### Client → Server Messages

| Message Type | Description | Payload Example |
|--------------|-------------|----------------|
| `authenticate` | Authentication response | `{"type":"authenticate","clientId":"client-id-here","signature":"base64-signature-here"}` |
| `generate` | Text generation request | `{"type":"generate","id":"req-123","model":"llama2","prompt":"Hello","options":{"temperature":0.7}}` |
| `stop` | Stop generation request | `{"type":"stop","id":"req-123"}` |
| `models` | Request available models | `{"type":"models"}` |
| `ping` | Connection health check | `{"type":"ping"}` |

### Generation Options

The `generate` message accepts the following options:

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `temperature` | Float | Sampling temperature (higher = more creative) | `0.8` |
| `top_p` | Float | Nucleus sampling threshold | `0.9` |
| `top_k` | Integer | Only sample from top K options | `40` |
| `max_tokens` | Integer | Maximum tokens to generate | `2048` |
| `seed` | Integer | Random seed for reproducibility | Random |
| `stop` | Array | Sequences to stop generation | `[]` |

### Error Handling

All WebSocket errors follow a standard format:

```json
{
  "type": "error",
  "error": "Human-readable error message",
  "code": "machine_readable_error_code",
  "timestamp": 1629123456789
}
```

Common error codes:

| Error Code | Description |
|------------|-------------|
| `auth_failed` | Authentication failed |
| `auth_timeout` | Authentication timed out |
| `rate_limited` | Too many requests (rate limited) |
| `invalid_model` | Requested model doesn't exist |
| `model_loading` | Model is still loading |
| `generation_failed` | Text generation failed |
| `invalid_request` | Malformed request |
| `internal_error` | Server internal error |

## REST API

The system provides a REST API for client registration.

### Client Registration

Register a new client with the server.

**Endpoint**: `POST /api/auth/register`

**Request Body**:

```json
{
  "name": "my-client",
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjA...==\n-----END PUBLIC KEY-----",
  "signatureAlgorithm": "SHA256"
}
```

**Parameters**:

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `name` | String | Client name | Yes |
| `publicKey` | String | PEM-encoded public key | Yes |
| `signatureAlgorithm` | String | Signature algorithm | No (defaults to SHA256) |

**Response** (200 OK):

```json
{
  "success": true,
  "clientId": "e3b0c44298fc1c149afb",
  "message": "Client registered successfully"
}
```

**Error Response** (400 Bad Request):

```json
{
  "success": false,
  "error": "Invalid public key format",
  "code": "invalid_key"
}
```

## Status Codes

The REST API uses standard HTTP status codes:

| Status Code | Description |
|-------------|-------------|
| `200 OK` | Request succeeded |
| `201 Created` | Resource created successfully |
| `400 Bad Request` | Invalid request parameters |
| `401 Unauthorized` | Authentication failed |
| `403 Forbidden` | Client lacks permission |
| `404 Not Found` | Resource not found |
| `429 Too Many Requests` | Rate limited |
| `500 Internal Server Error` | Server-side error |

## Rate Limiting

The system implements rate limiting for authentication attempts:

1. After 5 failed authentication attempts, a client is blocked temporarily
2. The block time uses exponential backoff, increasing with consecutive failures
3. Rate limits are based on client ID and/or IP address

When rate limited, clients receive an error with code `rate_limited` and information about the remaining cooldown period.

## WebSocket Connection Example

Here's a complete example of establishing a connection and authenticating:

```javascript
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');

// Load client configuration
const config = {
  clientId: 'your-client-id',
  privateKeyPath: './path/to/private_key.pem',
  signatureAlgorithm: 'SHA256'
};

// Load private key
const privateKey = fs.readFileSync(config.privateKeyPath, 'utf8');

// Connect to the server
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('Connection established');
});

ws.on('message', (data) => {
  const message = JSON.parse(data);

  switch (message.type) {
    case 'challenge':
      // Sign the challenge
      const sign = crypto.createSign(config.signatureAlgorithm);
      sign.update(message.challenge);
      const signature = sign.sign(privateKey, 'base64');

      // Send authentication response
      ws.send(JSON.stringify({
        type: 'authenticate',
        clientId: config.clientId,
        signature
      }));

      console.log('Authentication response sent');
      break;

    case 'auth_result':
      if (message.success) {
        console.log('Authentication successful');

        // After successful authentication, you can start generating
        ws.send(JSON.stringify({
          type: 'generate',
          id: 'request-1',
          model: 'llama2',
          prompt: 'Hello, world!',
          options: {
            temperature: 0.7,
            max_tokens: 100
          }
        }));
      } else {
        console.error('Authentication failed:', message.error);
      }
      break;

    case 'stream_token':
      process.stdout.write(message.token);
      break;

    case 'stream_end':
      console.log('\nGeneration complete');
      ws.close();
      break;

    case 'error':
      console.error('Error:', message.error, `(${message.code})`);
      break;
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Connection closed');
});
```

## Further Reading

- Security Model - Detailed explanation of the security architecture
- Node.js Client Implementation - Full client implementation in Node.js
