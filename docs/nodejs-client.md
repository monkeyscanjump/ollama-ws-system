# Node.js Client Implementation Guide

This guide provides a detailed walkthrough for implementing a Node.js client for the Ollama WebSocket System. We'll build a complete client library that handles authentication, connection management, and text generation.

## Table of Contents

- [Node.js Client Implementation Guide](#nodejs-client-implementation-guide)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Basic Client Implementation](#basic-client-implementation)
  - [Advanced Client Features](#advanced-client-features)
    - [Reconnection Logic](#reconnection-logic)
    - [Connection Pooling](#connection-pooling)
    - [Event Handling](#event-handling)
  - [TypeScript Version](#typescript-version)
  - [Usage Examples](#usage-examples)
    - [Basic Usage](#basic-usage)
    - [Streaming Output](#streaming-output)
    - [Multiple Model Support](#multiple-model-support)
  - [Error Handling](#error-handling)
  - [Performance Considerations](#performance-considerations)
  - [Unit Testing](#unit-testing)
  - [Further Reading](#further-reading)

## Prerequisites

To use this client, you'll need:

- Node.js 14.x or higher
- A client ID and private key registered with the Ollama WebSocket server
- The following npm packages:
  - `ws` for WebSocket connections
  - `crypto` (built-in) for signing challenges

Install the WebSocket library:

```bash
npm install ws
```

## Basic Client Implementation

Here's a complete implementation of a basic Ollama WebSocket client:

```javascript
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const EventEmitter = require('events');

class OllamaClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      serverUrl: 'ws://localhost:3000',
      clientId: null,
      privateKeyPath: null,
      privateKey: null,
      signatureAlgorithm: 'SHA256',
      reconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      ...config
    };

    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.activeRequests = new Map();
  }

  /**
   * Connect to the server and authenticate
   * @returns {Promise<void>} Resolves when authenticated
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        // Load private key if path is provided but key isn't
        if (this.config.privateKeyPath && !this.config.privateKey) {
          this.config.privateKey = fs.readFileSync(this.config.privateKeyPath, 'utf8');
        }

        if (!this.config.privateKey) {
          throw new Error('Private key is required');
        }

        if (!this.config.clientId) {
          throw new Error('Client ID is required');
        }

        this.ws = new WebSocket(this.config.serverUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.emit('connect');
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            this.handleMessage(message, resolve, reject);
          } catch (error) {
            reject(new Error(`Failed to parse message: ${error.message}`));
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          this.connected = false;
          this.authenticated = false;
          this.emit('disconnect', { code, reason });

          // Handle reconnection
          if (this.config.reconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.emit('reconnecting', { attempt: this.reconnectAttempts });

            setTimeout(() => {
              this.connect()
                .then(() => {
                  this.reconnectAttempts = 0;
                  this.emit('reconnect');
                })
                .catch((error) => {
                  this.emit('reconnect_error', error);
                });
            }, this.config.reconnectDelay * this.reconnectAttempts);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  handleMessage(message, resolveAuth, rejectAuth) {
    this.emit('message', message);

    switch (message.type) {
      case 'challenge':
        this.handleChallenge(message.challenge)
          .catch((error) => {
            rejectAuth(error);
          });
        break;

      case 'auth_result':
        if (message.success) {
          this.authenticated = true;
          this.emit('authenticated');
          resolveAuth();
        } else {
          const error = new Error(`Authentication failed: ${message.error}`);
          this.emit('auth_error', error);
          rejectAuth(error);
        }
        break;

      case 'stream_start':
        this.emit('generation_start', {
          id: message.id,
          model: message.model
        });
        break;

      case 'stream_token':
        const request = this.activeRequests.get(message.id);
        if (request) {
          request.result += message.token;
          this.emit('token', {
            id: message.id,
            token: message.token
          });
        }
        break;

      case 'stream_end':
        const completedRequest = this.activeRequests.get(message.id);
        if (completedRequest) {
          completedRequest.resolve({
            text: completedRequest.result,
            totalTokens: message.totalTokens,
            elapsedTime: message.elapsedTime
          });

          this.activeRequests.delete(message.id);

          this.emit('generation_complete', {
            id: message.id,
            totalTokens: message.totalTokens,
            elapsedTime: message.elapsedTime
          });
        }
        break;

      case 'error':
        const failedRequest = this.activeRequests.get(message.id);
        if (failedRequest) {
          failedRequest.reject(new Error(`${message.error} (${message.code})`));
          this.activeRequests.delete(message.id);
        }

        this.emit('error', {
          message: message.error,
          code: message.code,
          id: message.id
        });
        break;

      case 'models_result':
        const modelsRequest = this.activeRequests.get('models');
        if (modelsRequest) {
          modelsRequest.resolve(message.models);
          this.activeRequests.delete('models');
        }
        this.emit('models', message.models);
        break;

      case 'pong':
        this.emit('pong', { timestamp: message.timestamp });
        break;
    }
  }

  /**
   * Handle authentication challenge
   * @private
   */
  handleChallenge(challenge) {
    try {
      // Sign the challenge
      const sign = crypto.createSign(this.config.signatureAlgorithm);
      sign.update(challenge);
      const signature = sign.sign(this.config.privateKey, 'base64');

      // Send authentication response
      this.ws.send(JSON.stringify({
        type: 'authenticate',
        clientId: this.config.clientId,
        signature
      }));

      return Promise.resolve();
    } catch (error) {
      return Promise.reject(new Error(`Failed to sign challenge: ${error.message}`));
    }
  }

  /**
   * Generate text using the language model
   * @param {string} prompt - The prompt to generate from
   * @param {string} model - The model to use
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} - The generated text and metadata
   */
  generate(prompt, model = 'llama2', options = {}) {
    if (!this.authenticated) {
      return Promise.reject(new Error('Not authenticated'));
    }

    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(2, 15);

      this.activeRequests.set(requestId, {
        resolve,
        reject,
        result: ''
      });

      this.ws.send(JSON.stringify({
        type: 'generate',
        id: requestId,
        model,
        prompt,
        options
      }));
    });
  }

  /**
   * Stop an ongoing generation
   * @param {string} requestId - The ID of the request to stop
   */
  stop(requestId) {
    if (!this.authenticated || !this.activeRequests.has(requestId)) {
      return Promise.reject(new Error('No active generation with that ID'));
    }

    this.ws.send(JSON.stringify({
      type: 'stop',
      id: requestId
    }));

    return Promise.resolve();
  }

  /**
   * Get a list of available models
   * @returns {Promise<string[]>} - Array of model names
   */
  getModels() {
    if (!this.authenticated) {
      return Promise.reject(new Error('Not authenticated'));
    }

    return new Promise((resolve, reject) => {
      this.activeRequests.set('models', { resolve, reject });

      this.ws.send(JSON.stringify({
        type: 'models'
      }));
    });
  }

  /**
   * Send a ping to keep the connection alive
   */
  ping() {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected'));
    }

    this.ws.send(JSON.stringify({
      type: 'ping'
    }));

    return Promise.resolve();
  }

  /**
   * Close the WebSocket connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.authenticated = false;
    }
  }
}

module.exports = OllamaClient;
```

## Advanced Client Features

### Reconnection Logic

The client includes automatic reconnection logic when the connection is lost:

```javascript
// Configure reconnection settings
const client = new OllamaClient({
  clientId: 'your-client-id',
  privateKeyPath: './keys/client_key.pem',
  reconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 2000 // 2 seconds, doubled each attempt
});

// Listen for reconnection events
client.on('reconnecting', ({ attempt }) => {
  console.log(`Reconnection attempt ${attempt}...`);
});

client.on('reconnect', () => {
  console.log('Reconnected successfully');
  // Re-initialize any state needed
});

client.on('reconnect_error', (error) => {
  console.error('Failed to reconnect:', error.message);
});
```

### Connection Pooling

For applications that need to handle many concurrent requests, you can implement a simple connection pool:

```javascript
class OllamaConnectionPool {
  constructor(config, poolSize = 5) {
    this.config = config;
    this.poolSize = poolSize;
    this.clients = [];
    this.availableClients = [];
  }

  async initialize() {
    for (let i = 0; i < this.poolSize; i++) {
      const client = new OllamaClient(this.config);
      await client.connect();
      this.clients.push(client);
      this.availableClients.push(client);
    }
    console.log(`Connection pool initialized with ${this.poolSize} clients`);
  }

  async getClient() {
    if (this.availableClients.length === 0) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.availableClients.length > 0) {
            clearInterval(checkInterval);
            resolve(this.availableClients.pop());
          }
        }, 100);
      });
    }

    return this.availableClients.pop();
  }

  releaseClient(client) {
    this.availableClients.push(client);
  }

  async generate(prompt, model, options) {
    const client = await this.getClient();
    try {
      const result = await client.generate(prompt, model, options);
      return result;
    } finally {
      this.releaseClient(client);
    }
  }

  close() {
    this.clients.forEach(client => client.close());
    this.clients = [];
    this.availableClients = [];
  }
}
```

### Event Handling

The client extends `EventEmitter` and emits various events you can listen for:

```javascript
client.on('connect', () => {
  console.log('Connected to server');
});

client.on('authenticated', () => {
  console.log('Authentication successful');
});

client.on('token', ({ id, token }) => {
  process.stdout.write(token); // Print tokens as they arrive
});

client.on('generation_complete', ({ id, totalTokens, elapsedTime }) => {
  console.log(`\nGeneration complete: ${totalTokens} tokens in ${elapsedTime}ms`);
});

client.on('error', (error) => {
  console.error('Error:', error);
});

client.on('disconnect', ({ code, reason }) => {
  console.log(`Disconnected: ${code} - ${reason}`);
});
```

## TypeScript Version

If you're using TypeScript, here's a type-safe client interface:

```typescript
import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import { EventEmitter } from 'events';

interface OllamaClientConfig {
  serverUrl: string;
  clientId: string;
  privateKeyPath?: string;
  privateKey?: string;
  signatureAlgorithm?: string;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

interface GenerationOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  seed?: number;
  stop?: string[];
}

interface GenerationResult {
  text: string;
  totalTokens: number;
  elapsedTime: number;
}

class OllamaClient extends EventEmitter {
  private config: Required<OllamaClientConfig>;
  private ws: WebSocket | null = null;
  private connected = false;
  private authenticated = false;
  private reconnectAttempts = 0;
  private activeRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    result: string;
  }>();

  constructor(config: OllamaClientConfig) {
    super();
    this.config = {
      serverUrl: 'ws://localhost:3000',
      clientId: config.clientId,
      privateKeyPath: config.privateKeyPath || null,
      privateKey: config.privateKey || null,
      signatureAlgorithm: config.signatureAlgorithm || 'SHA256',
      reconnect: config.reconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 1000
    };
  }

  // Implementation methods would be the same as the JavaScript version
  // but with TypeScript type annotations added

  public async generate(prompt: string, model: string = 'llama2', options: GenerationOptions = {}): Promise<GenerationResult> {
    // Same implementation as JS version but with type annotations
  }
}

export default OllamaClient;
```

## Usage Examples

### Basic Usage

Here's a simple example of using the client:

```javascript
const OllamaClient = require('./ollama-client');

async function main() {
  // Load config from file or environment
  const config = {
    clientId: 'your-client-id',
    privateKeyPath: './keys/client_key.pem',
    serverUrl: 'ws://localhost:3000'
  };

  const client = new OllamaClient(config);

  try {
    // Connect and authenticate
    await client.connect();
    console.log('Connected and authenticated!');

    // Generate text
    const result = await client.generate(
      'Explain quantum computing in simple terms',
      'llama2',
      { temperature: 0.7, max_tokens: 200 }
    );

    console.log('\nFull response:');
    console.log(result.text);
    console.log(`\nGenerated ${result.totalTokens} tokens in ${result.elapsedTime}ms`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.close();
  }
}

main();
```

### Streaming Output

To handle streaming output in real-time:

```javascript
const client = new OllamaClient(config);

client.on('token', ({ token }) => {
  process.stdout.write(token); // Print tokens as they arrive
});

try {
  await client.connect();

  // This promise will resolve when generation is complete,
  // but you'll see output in real-time via the event handler
  await client.generate('Write a short story about a robot learning to paint');
} catch (error) {
  console.error('Error:', error.message);
} finally {
  client.close();
}
```

### Multiple Model Support

Working with different models:

```javascript
const client = new OllamaClient(config);

try {
  await client.connect();

  // Get available models
  const models = await client.getModels();
  console.log('Available models:', models);

  // Use specific model
  if (models.includes('codellama')) {
    console.log('Generating code with CodeLlama...');
    const result = await client.generate(
      'Write a Python function to calculate the Fibonacci sequence',
      'codellama'
    );
    console.log(result.text);
  }
} catch (error) {
  console.error('Error:', error.message);
} finally {
  client.close();
}
```

## Error Handling

The client provides detailed error information for various failure scenarios:

```javascript
try {
  await client.connect();
  // Operations...
} catch (error) {
  if (error.message.includes('Authentication failed')) {
    console.error('Authentication error:', error.message);
    console.log('Please check your client ID and private key');
  } else if (error.message.includes('Failed to sign challenge')) {
    console.error('Signature error:', error.message);
    console.log('Your private key may be invalid or in the wrong format');
  } else if (error.message.includes('ECONNREFUSED')) {
    console.error('Connection error:', error.message);
    console.log('The server may be down or the URL is incorrect');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Performance Considerations

For optimal performance:

1. **Connection Reuse**: Keep the connection open for multiple requests rather than connecting each time
2. **Manage Memory**: For long text generations, consider processing tokens as they arrive rather than accumulating the entire text
3. **Connection Pooling**: For high-throughput applications, use a connection pool as shown earlier
4. **Heartbeats**: Send periodic pings to keep the connection alive for long-running applications:

```javascript
// Set up a heartbeat to keep the connection alive
const heartbeatInterval = setInterval(() => {
  if (client.connected) {
    client.ping().catch(err => console.error('Ping failed:', err.message));
  }
}, 30000); // Every 30 seconds

// Remember to clean up when done
clearInterval(heartbeatInterval);
```

## Unit Testing

Here's an example of how to test the client using Jest:

```javascript
// ollama-client.test.js
const OllamaClient = require('./ollama-client');
const WebSocket = require('ws');

// Mock WebSocket
jest.mock('ws');

describe('OllamaClient', () => {
  let client;
  let mockWs;

  beforeEach(() => {
    // Setup mock WebSocket
    mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    };

    WebSocket.mockImplementation(() => mockWs);

    // Create client
    client = new OllamaClient({
      clientId: 'test-client-id',
      privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----'
    });
  });

  test('connect initializes WebSocket connection', async () => {
    // Setup mock to simulate successful connection
    const connectPromise = client.connect();

    // Find the 'open' handler and call it
    const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
    openHandler();

    // Find the 'message' handler and simulate challenge message
    const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];
    messageHandler(JSON.stringify({
      type: 'challenge',
      challenge: 'test-challenge'
    }));

    // Simulate successful authentication
    messageHandler(JSON.stringify({
      type: 'auth_result',
      success: true
    }));

    await connectPromise;

    expect(WebSocket).toHaveBeenCalledWith('ws://localhost:3000');
    expect(client.connected).toBe(true);
    expect(client.authenticated).toBe(true);
  });

  // Add more tests for other methods...
});
```

## Further Reading

- API Reference - Complete WebSocket API documentation
- Security Model - Details on the authentication system
- Python Client Implementation - Python equivalent of this client
- Browser Client Implementation - Browser-based JavaScript implementation
