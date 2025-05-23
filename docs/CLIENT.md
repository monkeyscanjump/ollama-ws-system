# WebSocket Client Documentation

This document explains how to use the WebSocket client that comes with WebSocket System. The client provides a secure, reliable way to interact with the system's backend services.

## Table of Contents

- Overview
- Importing the Client
- Basic Usage
- Authentication
- API Reference
  - Constructor Options
  - Connection Methods
  - Text Generation Methods
  - Model Management Methods
  - Event Handling
- Error Handling
- Reconnection Behavior
- Examples
- Troubleshooting

## Overview

The WebSocket client enables secure, authenticated communication with the WebSocket System server. It handles:

- Authentication using public key cryptography
- Automatic reconnection with exponential backoff
- Message validation and error handling
- Streaming text generation from Ollama models
- Event-based communication for real-time updates

## Importing the Client

```javascript
// If using within the same project
const { WSClient } = require('./path/to/client');

// If importing from the package
const { WSClient } = require('@monkeyscanjump/ws-system');
```

## Basic Usage

```javascript
// Create a client instance
const client = new WSClient({
  serverUrl: 'wss://your-server-url',
  clientId: 'your-client-id',
  privateKeyPath: './path/to/private_key',
  autoConnect: true // Optional: connect automatically
});

// Handle connection changes
client.onConnectionChange((status) => {
  console.log(`Connection status: ${status}`);
});

// Handle errors
client.onError((error) => {
  console.error(`Error: ${error.message} (${error.code})`);
});

// List available models
async function listModels() {
  try {
    const models = await client.listModels();
    console.log('Available models:', models);
  } catch (err) {
    console.error('Failed to list models:', err);
  }
}

// Generate text
async function generateText() {
  try {
    // Start generation
    const generationId = await client.generate(
      'Write a short story about a robot learning to paint',
      'llama2', // Optional: model name
      { temperature: 0.7 } // Optional: generation options
    );

    // Handle token stream
    client.onToken((event) => {
      if (event.id === generationId) {
        process.stdout.write(event.token);
      }
    });

    // Handle generation completion
    client.onGenerationEnd((event) => {
      if (event.id === generationId) {
        console.log(`\nGeneration complete: ${event.totalTokens} tokens in ${event.elapsedTime}ms`);
      }
    });
  } catch (err) {
    console.error('Generation failed:', err);
  }
}
```

## Authentication

The client uses the same public-key authentication as the main system:

1. The client initiates a WebSocket connection
2. The server sends a random challenge
3. The client signs the challenge using its private key
4. The server verifies the signature using the client's registered public key
5. If valid, the connection is authenticated and ready for use

The client must be registered with the server using the CLI:

```bash
# Generate a key pair
npx manager generate-keys --name=my-client

# Register with the server
npx manager register-client --name=my-client --key-path=./keys/my-client_key.pub
```

## API Reference

### Constructor Options

```javascript
new WSClient(options: ClientOptions)
```

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| serverUrl | string | Yes | - | WebSocket server URL |
| clientId | string | Yes | - | Client identifier registered with the server |
| privateKeyPath | string | Yes | - | Path to the private key file |
| signatureAlgorithm | string | No | 'RSA-SHA256' | Algorithm used for signing challenges |
| autoReconnect | boolean | No | true | Whether to automatically reconnect |
| reconnectDelay | number | No | 1000 | Base delay between reconnection attempts (ms) |
| pingInterval | number | No | 30000 | Interval for sending ping messages (ms) |
| requestTimeout | number | No | 60000 | Timeout for requests (ms) |
| autoConnect | boolean | No | false | Whether to connect automatically on initialization |

### Connection Methods

#### `connect()`

Initiates a connection to the WebSocket server.

```javascript
await client.connect();
```

Returns a Promise that resolves when authentication is complete or rejects if connection fails.

#### `disconnect()`

Disconnects from the WebSocket server.

```javascript
client.disconnect();
```

#### `getStatus()`

Returns the current connection status.

```javascript
const status = client.getStatus();
// Possible values: 'disconnected', 'connecting', 'connected',
// 'authenticated', 'auth_failed', 'reconnecting', 'reconnect_failed'
```

#### `isReady()`

Returns whether the client is connected and authenticated.

```javascript
if (client.isReady()) {
  // Client is ready to send requests
}
```

### Text Generation Methods

#### `generate(prompt, model?, options?)`

Starts text generation with the provided prompt.

```javascript
const generationId = await client.generate(
  'Explain quantum computing',
  'llama2',
  { temperature: 0.7, max_tokens: 500 }
);
```

Parameters:
- `prompt`: The text prompt to generate from
- `model` (optional): The model to use
- `options` (optional): Generation options

Returns a Promise that resolves to a generation ID string.

#### `stopGeneration(generationId)`

Stops an active text generation.

```javascript
await client.stopGeneration(generationId);
```

### Model Management Methods

#### `listModels()`

Fetches available models from the server.

```javascript
const models = await client.listModels();
```

Returns a Promise that resolves to an array of model information objects.

### Batch Operations

#### `sendBatch(messages)`

Sends multiple messages in a single batch.

```javascript
await client.sendBatch([
  {
    type: 'generate',
    prompt: 'Hello world',
    model: 'llama2'
  },
  {
    type: 'models'
  }
]);
```

### Event Handling

#### `onConnectionChange(callback)`

```javascript
const unsubscribe = client.onConnectionChange((status) => {
  console.log(`Connection status changed: ${status}`);
});

// Later to unsubscribe:
unsubscribe();
```

#### `onToken(callback)`

Fired when a token is received during text generation.

```javascript
client.onToken((event) => {
  console.log(`Received token for ${event.id}: ${event.token}`);
});
```

#### `onGenerationStart(callback)`

Fired when text generation begins.

```javascript
client.onGenerationStart((event) => {
  console.log(`Generation started with model ${event.model}`);
});
```

#### `onGenerationEnd(callback)`

Fired when text generation completes.

```javascript
client.onGenerationEnd((event) => {
  console.log(`Generation complete: ${event.totalTokens} tokens`);
  console.log(`Time taken: ${event.elapsedTime}ms`);
  if (event.isCancelled) {
    console.log('Generation was cancelled');
  }
});
```

#### `onError(callback)`

```javascript
client.onError((error) => {
  console.error(`Error: ${error.message}`);
  console.error(`Code: ${error.code}`);
  console.error(`Description: ${error.description}`);
});
```

## Error Handling

The client provides standardized error objects with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `message` | string | Human-readable error message |
| `code` | string | Error code identifying the type of error |
| `description` | string | Detailed description of the error |
| `id` | string | Optional ID of the request that caused the error |

Common error codes:

| Error Code | Description |
|------------|-------------|
| `server_error` | Generic server error |
| `auth_timeout` | Authentication timed out |
| `invalid_auth` | Invalid authentication credentials |
| `rate_limited` | Client is being rate limited |
| `invalid_request` | Invalid request format |
| `model_not_found` | Requested model not found |
| `reconnect_failed` | Failed to reconnect after disconnection |
| `connection_timeout` | Connection attempt timed out |
| `auth_challenge_timeout` | Server did not send challenge in time |

## Reconnection Behavior

The client implements exponential backoff with jitter for reliable reconnection:

1. Initial delay is set by `reconnectDelay` option (default: 1000ms)
2. Each subsequent attempt doubles the delay time
3. A random jitter (±20%) is applied to prevent reconnection storms
4. Maximum delay is capped at 30 seconds
5. Maximum 10 reconnection attempts by default

You can disable automatic reconnection by setting `autoReconnect: false` in the options.

## Examples

### Multiple Concurrent Generations

```javascript
// Track active generations
const activeGenerations = new Map();

// Setup token handler once
client.onToken((event) => {
  const generation = activeGenerations.get(event.id);
  if (generation) {
    generation.tokens.push(event.token);
    if (generation.onToken) {
      generation.onToken(event.token);
    }
  }
});

// Setup completion handler once
client.onGenerationEnd((event) => {
  const generation = activeGenerations.get(event.id);
  if (generation && generation.onComplete) {
    const fullText = generation.tokens.join('');
    generation.onComplete({
      text: fullText,
      totalTokens: event.totalTokens,
      elapsedTime: event.elapsedTime
    });
  }
  activeGenerations.delete(event.id);
});

// Function to generate text
async function generate(prompt, model, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const id = await client.generate(prompt, model, options);

      activeGenerations.set(id, {
        prompt,
        model,
        tokens: [],
        onToken: options.onToken,
        onComplete: (result) => resolve(result)
      });

      // Add timeout for safety
      setTimeout(() => {
        if (activeGenerations.has(id)) {
          activeGenerations.delete(id);
          reject(new Error('Generation timed out'));
        }
      }, options.timeout || 60000);

    } catch (err) {
      reject(err);
    }
  });
}

// Example usage
async function runMultipleGenerations() {
  try {
    // Start multiple generations in parallel
    const results = await Promise.all([
      generate('Write a poem about the ocean', 'llama2', {
        onToken: (token) => process.stdout.write('\u001b[34m' + token + '\u001b[0m')
      }),
      generate('Write a short story about robots', 'llama2:7b', {
        onToken: (token) => process.stdout.write('\u001b[32m' + token + '\u001b[0m')
      })
    ]);

    console.log('\nAll generations complete!');
    console.log(`Generated ${results.length} texts with a total of ${
      results.reduce((sum, r) => sum + r.totalTokens, 0)
    } tokens`);
  } catch (err) {
    console.error('Generation failed:', err);
  }
}
```

### Custom Reconnection Logic

```javascript
const client = new WSClient({
  serverUrl: 'wss://your-server-url',
  clientId: 'your-client-id',
  privateKeyPath: './path/to/private_key',
  autoReconnect: false // Disable automatic reconnection
});

let reconnectAttempts = 0;

client.onConnectionChange((status) => {
  if (status === 'disconnected') {
    // Ask user if they want to reconnect
    if (shouldReconnect() && reconnectAttempts < 3) {
      reconnectAttempts++;
      console.log(`Manual reconnect attempt ${reconnectAttempts}...`);
      setTimeout(() => {
        client.connect().catch(console.error);
      }, 2000);
    }
  } else if (status === 'authenticated') {
    reconnectAttempts = 0;
  }
});

function shouldReconnect() {
  // In a real app, you might prompt the user
  return true;
}
```

## Troubleshooting

### Connection Issues

If you're having trouble connecting to the server:

1. **Check your client ID and private key**: Ensure the client is registered with the server and the private key matches.
2. **Verify the server URL**: Make sure the WebSocket URL is correct (should start with `ws://` or `wss://`).
3. **Check server logs**: Look at the server logs to see if there are authentication errors.
4. **Test with the CLI**: Use the manager tool to verify the client is properly registered:
   ```bash
   npx manager list-clients | grep your-client-id
   ```

### Authentication Failures

If you're receiving authentication errors:

1. **Key mismatch**: The client might be using a private key that doesn't match the registered public key.
2. **Client revoked**: The client might have been revoked. Check with `npx manager list-clients`.
3. **Wrong signature algorithm**: Ensure you're using the correct signature algorithm.

### Generation Issues

If text generation isn't working correctly:

1. **Check model availability**: Use `client.listModels()` to ensure the requested model is available.
2. **Monitor token events**: Make sure you're correctly handling token events.
3. **Check for error events**: Register an error handler to catch any errors during generation.
