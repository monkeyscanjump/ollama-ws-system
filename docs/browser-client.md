# Browser Client Implementation Guide

This guide provides a detailed walkthrough for implementing a browser-based client for the Ollama WebSocket System. We'll build a complete client library that handles authentication, connection management, and text generation—all running directly in a web browser.

## Table of Contents

- [Browser Client Implementation Guide](#browser-client-implementation-guide)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Basic Client Implementation](#basic-client-implementation)
  - [Advanced Client Features](#advanced-client-features)
    - [React Integration](#react-integration)
    - [Vue Integration](#vue-integration)
    - [Reconnection Logic](#reconnection-logic)
    - [Stream Processing](#stream-processing)
  - [Usage Examples](#usage-examples)
    - [Basic Usage](#basic-usage)
    - [Chat Interface](#chat-interface)
    - [Code Generation](#code-generation)
  - [Security Considerations](#security-considerations)

## Prerequisites

For this browser client implementation, you'll need:

- A modern web browser that supports WebSockets
- A client ID and private key registered with the Ollama WebSocket server
- Basic knowledge of JavaScript and browser APIs

If you're using a module bundler like Webpack or a framework like React/Vue, you'll also need those development tools set up.

## Basic Client Implementation

Here's a complete implementation of a browser-based Ollama WebSocket client:

```javascript
/**
 * Browser-based client for Ollama WebSocket System
 */
class OllamaClient {
  /**
   * Create a new OllamaClient
   * @param {Object} config - Client configuration
   * @param {string} config.serverUrl - WebSocket server URL
   * @param {string} config.clientId - Client ID for authentication
   * @param {string} config.privateKey - PEM-encoded private key
   * @param {string} [config.signatureAlgorithm='SHA-256'] - Signature algorithm
   */
  constructor(config) {
    this.config = {
      serverUrl: 'ws://localhost:3000',
      clientId: null,
      privateKey: null,
      signatureAlgorithm: 'SHA-256',
      ...config
    };

    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this.eventListeners = {
      connect: [],
      disconnect: [],
      error: [],
      authenticated: [],
      token: [],
      generation_start: [],
      generation_complete: [],
      models: []
    };
    this.activeRequests = new Map();
  }

  /**
   * Connect to the server and authenticate
   * @returns {Promise<void>} Resolves when authenticated
   */
  async connect() {
    if (!this.config.clientId) {
      throw new Error('Client ID is required');
    }

    if (!this.config.privateKey) {
      throw new Error('Private key is required');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket connection
        this.ws = new WebSocket(this.config.serverUrl);

        this.ws.onopen = () => {
          this.connected = true;
          this._emit('connect');
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this._handleMessage(message, resolve, reject);
          } catch (error) {
            reject(new Error(`Failed to parse message: ${error.message}`));
          }
        };

        this.ws.onerror = (error) => {
          this._emit('error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          this.authenticated = false;
          this._emit('disconnect', { code: event.code, reason: event.reason });
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  _handleMessage(message, resolveAuth, rejectAuth) {
    switch (message.type) {
      case 'challenge':
        this._handleChallenge(message.challenge)
          .catch((error) => {
            rejectAuth(error);
          });
        break;

      case 'auth_result':
        if (message.success) {
          this.authenticated = true;
          this._emit('authenticated');
          resolveAuth();
        } else {
          const error = new Error(`Authentication failed: ${message.error}`);
          this._emit('error', error);
          rejectAuth(error);
        }
        break;

      case 'stream_start':
        this._emit('generation_start', {
          id: message.id,
          model: message.model
        });
        break;

      case 'stream_token':
        const request = this.activeRequests.get(message.id);
        if (request) {
          request.result += message.token;
        }
        this._emit('token', {
          id: message.id,
          token: message.token
        });
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
        }

        this._emit('generation_complete', {
          id: message.id,
          totalTokens: message.totalTokens,
          elapsedTime: message.elapsedTime
        });
        break;

      case 'error':
        const failedRequest = this.activeRequests.get(message.id);
        if (failedRequest) {
          failedRequest.reject(new Error(`${message.error} (${message.code})`));
          this.activeRequests.delete(message.id);
        }

        this._emit('error', {
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
        this._emit('models', message.models);
        break;
    }
  }

  /**
   * Sign a challenge string with the private key
   * @private
   */
  async _handleChallenge(challenge) {
    try {
      // Parse the private key
      const privateKey = await this._importPrivateKey(this.config.privateKey);

      // Convert challenge to ArrayBuffer
      const encoder = new TextEncoder();
      const data = encoder.encode(challenge);

      // Create signature
      const signature = await window.crypto.subtle.sign(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: { name: this.config.signatureAlgorithm },
        },
        privateKey,
        data
      );

      // Convert signature to base64
      const signatureBase64 = this._arrayBufferToBase64(signature);

      // Send authentication response
      this.ws.send(JSON.stringify({
        type: 'authenticate',
        clientId: this.config.clientId,
        signature: signatureBase64
      }));
    } catch (error) {
      throw new Error(`Failed to sign challenge: ${error.message}`);
    }
  }

  /**
   * Import a PEM-formatted private key
   * @private
   */
  async _importPrivateKey(pem) {
    // Remove header, footer, and line breaks
    const pemContents = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\r?\n/g, '');

    // Convert from base64 to ArrayBuffer
    const binaryDer = this._base64ToArrayBuffer(pemContents);

    // Import the key
    return window.crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: this.config.signatureAlgorithm },
      },
      false,
      ['sign']
    );
  }

  /**
   * Convert base64 to ArrayBuffer
   * @private
   */
  _base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Convert ArrayBuffer to base64
   * @private
   */
  _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
    return this;
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event]
        .filter(cb => cb !== callback);
    }
    return this;
  }

  /**
   * Emit an event
   * @private
   */
  _emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
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
```

This implementation works in modern browsers and provides all the core functionality needed to interact with the Ollama WebSocket server.

## Advanced Client Features

### React Integration

Here's how to integrate the client with a React application:

```jsx
import React, { useState, useEffect, useRef } from 'react';
import OllamaClient from './ollama-client';

function OllamaChat({ clientId, privateKey }) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('llama2');

  const clientRef = useRef(null);
  const activeGeneration = useRef(null);

  // Initialize client and connect
  useEffect(() => {
    const client = new OllamaClient({
      clientId,
      privateKey,
    });

    client.on('connect', () => console.log('Connected'));
    client.on('authenticated', () => {
      setConnected(true);
      client.getModels().then(setModels);
    });
    client.on('error', (error) => console.error('Error:', error));
    client.on('disconnect', () => setConnected(false));

    // Stream handling
    let currentResponse = '';
    let currentMessageIndex = -1;

    client.on('generation_start', () => {
      setGenerating(true);
      currentResponse = '';
      setMessages(msgs => [...msgs, { role: 'assistant', content: '' }]);
      currentMessageIndex = messages.length;
    });

    client.on('token', ({ token }) => {
      currentResponse += token;
      setMessages(msgs => msgs.map((msg, i) =>
        i === currentMessageIndex ? { ...msg, content: currentResponse } : msg
      ));
    });

    client.on('generation_complete', () => {
      setGenerating(false);
      activeGeneration.current = null;
    });

    clientRef.current = client;

    // Connect to the server
    client.connect().catch(error => {
      console.error('Connection failed:', error);
    });

    // Cleanup on unmount
    return () => {
      if (clientRef.current) {
        clientRef.current.close();
      }
    };
  }, [clientId, privateKey]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || generating) return;

    // Add user message
    setMessages(msgs => [...msgs, { role: 'user', content: prompt }]);

    // Generate response
    try {
      const requestId = Math.random().toString(36).substring(2, 15);
      activeGeneration.current = requestId;

      await clientRef.current.generate(prompt, selectedModel);
      setPrompt('');
    } catch (error) {
      console.error('Generation failed:', error);
      setGenerating(false);
    }
  };

  // Handle stop generation
  const handleStop = () => {
    if (activeGeneration.current && clientRef.current) {
      clientRef.current.stop(activeGeneration.current);
    }
  };

  return (
    <div className="ollama-chat">
      <div className="chat-status">
        Status: {connected ? 'Connected' : 'Disconnected'}
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-role">{msg.role === 'user' ? 'You' : 'AI'}</div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="chat-input">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={generating}
        >
          {models.map(model => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>

        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type your message..."
          disabled={generating || !connected}
        />

        {generating ? (
          <button type="button" onClick={handleStop}>Stop</button>
        ) : (
          <button type="submit" disabled={!connected || !prompt.trim()}>Send</button>
        )}
      </form>
    </div>
  );
}

export default OllamaChat;
```

### Vue Integration

Here's how to integrate the client with a Vue application:

```vue
<template>
  <div class="ollama-chat">
    <div class="chat-status">
      Status: {{ connected ? 'Connected' : 'Disconnected' }}
    </div>

    <div class="chat-messages">
      <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.role]">
        <div class="message-role">{{ msg.role === 'user' ? 'You' : 'AI' }}</div>
        <div class="message-content">{{ msg.content }}</div>
      </div>
    </div>

    <form @submit.prevent="handleSubmit" class="chat-input">
      <select v-model="selectedModel" :disabled="generating">
        <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
      </select>

      <input
        type="text"
        v-model="prompt"
        placeholder="Type your message..."
        :disabled="generating || !connected"
      />

      <button v-if="generating" type="button" @click="handleStop">Stop</button>
      <button v-else type="submit" :disabled="!connected || !prompt.trim()">Send</button>
    </form>
  </div>
</template>

<script>
import OllamaClient from './ollama-client';

export default {
  name: 'OllamaChat',
  props: {
    clientId: String,
    privateKey: String
  },
  data() {
    return {
      client: null,
      connected: false,
      messages: [],
      prompt: '',
      generating: false,
      models: [],
      selectedModel: 'llama2',
      activeGeneration: null,
      currentResponse: ''
    };
  },
  mounted() {
    this.initClient();
  },
  beforeUnmount() {
    if (this.client) {
      this.client.close();
    }
  },
  methods: {
    initClient() {
      this.client = new OllamaClient({
        clientId: this.clientId,
        privateKey: this.privateKey
      });

      this.client.on('connect', () => console.log('Connected'));
      this.client.on('authenticated', () => {
        this.connected = true;
        this.client.getModels().then(models => {
          this.models = models;
        });
      });
      this.client.on('error', error => console.error('Error:', error));
      this.client.on('disconnect', () => this.connected = false);

      // Stream handling
      this.client.on('generation_start', () => {
        this.generating = true;
        this.currentResponse = '';
        this.messages.push({ role: 'assistant', content: '' });
      });

      this.client.on('token', ({ token }) => {
        this.currentResponse += token;
        this.messages[this.messages.length - 1].content = this.currentResponse;
      });

      this.client.on('generation_complete', () => {
        this.generating = false;
        this.activeGeneration = null;
      });

      // Connect to the server
      this.client.connect().catch(error => {
        console.error('Connection failed:', error);
      });
    },
    async handleSubmit() {
      if (!this.prompt.trim() || this.generating) return;

      // Add user message
      this.messages.push({ role: 'user', content: this.prompt });

      // Generate response
      try {
        const requestId = Math.random().toString(36).substring(2, 15);
        this.activeGeneration = requestId;

        await this.client.generate(this.prompt, this.selectedModel);
        this.prompt = '';
      } catch (error) {
        console.error('Generation failed:', error);
        this.generating = false;
      }
    },
    handleStop() {
      if (this.activeGeneration && this.client) {
        this.client.stop(this.activeGeneration);
      }
    }
  }
};
</script>
```

### Reconnection Logic

For a more resilient browser client that handles connection interruptions:

```javascript
class ResilientOllamaClient extends OllamaClient {
  constructor(config) {
    super({
      reconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      ...config
    });

    this.reconnectAttempts = 0;
    this.reconnecting = false;
  }

  async connect() {
    try {
      await super.connect();
      this.reconnectAttempts = 0;
      return true;
    } catch (error) {
      if (this.config.reconnect && !this.reconnecting) {
        return this._attemptReconnect();
      }
      throw error;
    }
  }

  async _attemptReconnect() {
    this.reconnecting = true;

    while (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this._emit('reconnecting', { attempt: this.reconnectAttempts });

      await new Promise(resolve => setTimeout(resolve,
        this.config.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1)));

      try {
        await super.connect();
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        this._emit('reconnected');
        return true;
      } catch (error) {
        console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      }
    }

    this.reconnecting = false;
    throw new Error(`Failed to reconnect after ${this.config.maxReconnectAttempts} attempts`);
  }
}
```

### Stream Processing

For more advanced stream handling, you can process tokens in different ways:

```javascript
const client = new OllamaClient(config);

// Markdown rendering
const markdownContainer = document.getElementById('markdown-output');
let currentText = '';
const markdownRenderer = new marked.Renderer();

client.on('token', ({ token }) => {
  currentText += token;
  markdownContainer.innerHTML = marked(currentText, { renderer: markdownRenderer });
});

// Code syntax highlighting
const codeContainer = document.getElementById('code-output');
let codeText = '';
let language = 'javascript';

client.on('token', ({ token }) => {
  codeText += token;
  // Detect language from code block markers
  if (codeText.match(/```([a-z]+)/)) {
    language = codeText.match(/```([a-z]+)/)[1];
  }
  codeContainer.innerHTML = Prism.highlight(codeText, Prism.languages[language], language);
});

// Typewriter effect
const typewriterContainer = document.getElementById('typewriter-output');
let typewriterQueue = [];
let isTyping = false;

client.on('token', ({ token }) => {
  // Queue up characters
  for (const char of token) {
    typewriterQueue.push(char);
  }

  // Start typing if not already in progress
  if (!isTyping) {
    typeChar();
  }
});

function typeChar() {
  isTyping = true;
  if (typewriterQueue.length === 0) {
    isTyping = false;
    return;
  }

  const char = typewriterQueue.shift();
  typewriterContainer.textContent += char;
  setTimeout(typeChar, Math.random() * 30 + 10); // Random delay for natural effect
}
```

## Usage Examples

### Basic Usage

Here's a simple example of using the client in a plain HTML/JavaScript page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ollama Client Demo</title>
  <style>
    #output {
      white-space: pre-wrap;
      border: 1px solid #ccc;
      padding: 10px;
      height: 300px;
      overflow-y: auto;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    textarea {
      width: 100%;
      height: 100px;
    }
    .controls {
      display: flex;
      margin-top: 10px;
      gap: 10px;
    }
    select {
      flex: 1;
    }
    button {
      padding: 5px 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Ollama WebSocket Client</h1>

    <div id="auth-form">
      <h2>Authentication</h2>
      <div>
        <label for="client-id">Client ID:</label>
        <input type="text" id="client-id">
      </div>
      <div>
        <label for="private-key">Private Key:</label>
        <textarea id="private-key"></textarea>
      </div>
      <button id="connect-btn">Connect</button>
      <div id="status">Status: Disconnected</div>
    </div>

    <div id="generation-form" style="display: none;">
      <h2>Text Generation</h2>
      <textarea id="prompt" placeholder="Enter your prompt here..."></textarea>
      <div class="controls">
        <select id="model-select"></select>
        <button id="generate-btn">Generate</button>
        <button id="stop-btn" disabled>Stop</button>
      </div>
      <h3>Output:</h3>
      <div id="output"></div>
    </div>
  </div>

  <script src="ollama-client.js"></script>
  <script>
    const client = new OllamaClient();
    let activeRequestId = null;

    // DOM elements
    const clientIdInput = document.getElementById('client-id');
    const privateKeyInput = document.getElementById('private-key');
    const connectBtn = document.getElementById('connect-btn');
    const statusEl = document.getElementById('status');
    const authForm = document.getElementById('auth-form');
    const generationForm = document.getElementById('generation-form');
    const promptInput = document.getElementById('prompt');
    const modelSelect = document.getElementById('model-select');
    const generateBtn = document.getElementById('generate-btn');
    const stopBtn = document.getElementById('stop-btn');
    const outputEl = document.getElementById('output');

    // Connect button handler
    connectBtn.addEventListener('click', async () => {
      const clientId = clientIdInput.value.trim();
      const privateKey = privateKeyInput.value.trim();

      if (!clientId || !privateKey) {
        alert('Please enter both client ID and private key');
        return;
      }

      try {
        connectBtn.disabled = true;
        statusEl.textContent = 'Status: Connecting...';

        // Configure and connect client
        client.config.clientId = clientId;
        client.config.privateKey = privateKey;

        await client.connect();

        statusEl.textContent = 'Status: Connected';
        authForm.style.display = 'none';
        generationForm.style.display = 'block';

        // Load available models
        const models = await client.getModels();
        modelSelect.innerHTML = models.map(model =>
          `<option value="${model}">${model}</option>`
        ).join('');
      } catch (error) {
        console.error('Connection failed:', error);
        statusEl.textContent = 'Status: Connection failed';
        connectBtn.disabled = false;
      }
    });

    // Generate button handler
    generateBtn.addEventListener('click', async () => {
      const prompt = promptInput.value.trim();
      const model = modelSelect.value;

      if (!prompt) return;

      try {
        outputEl.textContent = '';
        generateBtn.disabled = true;
        stopBtn.disabled = false;

        // Set up listeners for this generation
        const handleToken = ({ token }) => {
          outputEl.textContent += token;
          // Scroll to bottom
          outputEl.scrollTop = outputEl.scrollHeight;
        };

        const handleComplete = () => {
          generateBtn.disabled = false;
          stopBtn.disabled = true;
          activeRequestId = null;
          client.off('token', handleToken);
          client.off('generation_complete', handleComplete);
        };

        client.on('token', handleToken);
        client.on('generation_complete', handleComplete);

        // Start generation
        await client.generate(prompt, model);
      } catch (error) {
        console.error('Generation failed:', error);
        outputEl.textContent += `\n\nError: ${error.message}`;
        generateBtn.disabled = false;
        stopBtn.disabled = true;
      }
    });

    // Stop button handler
    stopBtn.addEventListener('click', () => {
      if (activeRequestId) {
        client.stop(activeRequestId);
      }
    });

    // Handle disconnection
    client.on('disconnect', () => {
      statusEl.textContent = 'Status: Disconnected';
      authForm.style.display = 'block';
      generationForm.style.display = 'none';
      connectBtn.disabled = false;
    });
  </script>
</body>
</html>
```

### Chat Interface

Here's a more sophisticated chat interface implementation:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ollama Chat</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/styles/github.min.css">
  <script src="https://cdn.jsdelivr.net/npm/marked@5.0.2/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/highlight.min.js"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto p-4 max-w-4xl">
    <h1 class="text-2xl font-bold mb-4">Ollama Chat</h1>

    <!-- Auth Panel -->
    <div id="auth-panel" class="bg-white p-4 rounded shadow mb-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="client-id" class="block text-sm font-medium text-gray-700">Client ID</label>
          <input type="text" id="client-id" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
        </div>
        <div>
          <label for="server-url" class="block text-sm font-medium text-gray-700">Server URL</label>
          <input type="text" id="server-url" value="ws://localhost:3000" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
        </div>
      </div>
      <div class="mt-4">
        <label for="private-key" class="block text-sm font-medium text-gray-700">Private Key</label>
        <textarea id="private-key" rows="5" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"></textarea>
      </div>
      <div class="mt-4 flex justify-between items-center">
        <span id="connection-status" class="text-gray-600">Not connected</span>
        <button id="connect-btn" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          Connect
        </button>
      </div>
    </div>

    <!-- Chat Interface - Hidden initially -->
    <div id="chat-interface" class="hidden">
      <div id="chat-messages" class="bg-white rounded shadow mb-4 p-4 h-96 overflow-y-auto">
        <div class="py-20 text-center text-gray-500">
          Start a conversation with the AI assistant
        </div>
      </div>

      <div class="bg-white p-4 rounded shadow">
        <div class="flex items-center mb-4">
          <label for="model-select" class="block text-sm font-medium text-gray-700 mr-2">Model:</label>
          <select id="model-select" class="border border-gray-300 rounded-md shadow-sm p-2">
            <option value="llama2">Loading models...</option>
          </select>

          <div class="ml-auto flex items-center">
            <label for="temperature" class="block text-sm font-medium text-gray-700 mr-2">Temperature:</label>
            <input type="range" id="temperature" min="0" max="1" step="0.1" value="0.7"
              class="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer">
            <span id="temp-value" class="text-sm ml-1">0.7</span>
          </div>
        </div>

        <div class="flex">
          <textarea id="user-input" rows="2" placeholder="Type your message here..."
            class="flex-grow border border-gray-300 rounded-md shadow-sm p-2 mr-2"></textarea>
          <button id="send-btn" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Send
          </button>
          <button id="stop-btn" class="hidden bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded ml-2">
            Stop
          </button>
        </div>
      </div>
    </div>
  </div>

  <script src="ollama-client.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const client = new OllamaClient();
      let activeRequestId = null;
      let isGenerating = false;

      // Elements
      const connectBtn = document.getElementById('connect-btn');
      const clientIdInput = document.getElementById('client-id');
      const privateKeyInput = document.getElementById('private-key');
      const serverUrlInput = document.getElementById('server-url');
      const connectionStatus = document.getElementById('connection-status');
      const authPanel = document.getElementById('auth-panel');
      const chatInterface = document.getElementById('chat-interface');
      const chatMessages = document.getElementById('chat-messages');
      const userInput = document.getElementById('user-input');
      const sendBtn = document.getElementById('send-btn');
      const stopBtn = document.getElementById('stop-btn');
      const modelSelect = document.getElementById('model-select');
      const temperatureInput = document.getElementById('temperature');
      const tempValue = document.getElementById('temp-value');

      // Load saved auth info from localStorage
      if (localStorage.getItem('ollamaClientId')) {
        clientIdInput.value = localStorage.getItem('ollamaClientId');
      }
      if (localStorage.getItem('ollamaServerUrl')) {
        serverUrlInput.value = localStorage.getItem('ollamaServerUrl');
      }

      // Connect button
      connectBtn.addEventListener('click', async () => {
        const clientId = clientIdInput.value.trim();
        const privateKey = privateKeyInput.value.trim();
        const serverUrl = serverUrlInput.value.trim();

        if (!clientId || !privateKey || !serverUrl) {
          alert('Please fill in all fields');
          return;
        }

        // Save to localStorage (except private key)
        localStorage.setItem('ollamaClientId', clientId);
        localStorage.setItem('ollamaServerUrl', serverUrl);

        try {
          connectBtn.disabled = true;
          connectionStatus.textContent = 'Connecting...';
          connectionStatus.classList.add('text-yellow-500');

          client.config.clientId = clientId;
          client.config.privateKey = privateKey;
          client.config.serverUrl = serverUrl;

          await client.connect();

          connectionStatus.textContent = 'Connected';
          connectionStatus.classList.remove('text-yellow-500');
          connectionStatus.classList.add('text-green-500');

          // Show chat interface
          authPanel.classList.add('hidden');
          chatInterface.classList.remove('hidden');

          // Load models
          try {
            const models = await client.getModels();
            modelSelect.innerHTML = models.map(model =>
              `<option value="${model}">${model}</option>`
            ).join('');
          } catch (error) {
            console.error('Failed to load models:', error);
            addSystemMessage('Failed to load models. Using default model.');
          }

          // Clear chat and add welcome message
          chatMessages.innerHTML = '';
          addSystemMessage('Connected to Ollama. You can now start chatting with the AI.');
        } catch (error) {
          console.error('Connection failed:', error);
          connectionStatus.textContent = 'Connection failed';
          connectionStatus.classList.remove('text-yellow-500');
          connectionStatus.classList.add('text-red-500');
          connectBtn.disabled = false;
        }
      });

      // Send button
      sendBtn.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (!message || isGenerating) return;

        addUserMessage(message);
        generateResponse(message);
        userInput.value = '';
      });

      // User input enter key
      userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });

      // Stop button
      stopBtn.addEventListener('click', () => {
        if (activeRequestId) {
          client.stop(activeRequestId);
        }
      });

      // Temperature slider
      temperatureInput.addEventListener('input', () => {
        tempValue.textContent = temperatureInput.value;
      });

      // Client event handlers
      client.on('disconnect', () => {
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.classList.remove('text-green-500', 'text-yellow-500');
        connectionStatus.classList.add('text-red-500');
        chatInterface.classList.add('hidden');
        authPanel.classList.remove('hidden');
        connectBtn.disabled = false;
      });

      // Helper functions
      function addUserMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'flex mb-4';
        messageDiv.innerHTML = `
          <div class="flex-shrink-0 bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center mr-2">
            <span class="text-sm font-semibold">You</span>
          </div>
          <div class="bg-blue-100 rounded-lg p-3 flex-grow">
            <p class="text-sm">${escapeHtml(text)}</p>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
        scrollToBottom();
      }

      function addAIMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'flex mb-4';
        messageDiv.innerHTML = `
          <div class="flex-shrink-0 bg-green-200 rounded-full w-8 h-8 flex items-center justify-center mr-2">
            <span class="text-sm font-semibold">AI</span>
          </div>
          <div class="bg-gray-100 rounded-lg p-3 flex-grow">
            <div class="ai-response prose prose-sm max-w-none"></div>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
        return messageDiv.querySelector('.ai-response');
      }

      function addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'flex justify-center my-4';
        messageDiv.innerHTML = `
          <div class="bg-gray-200 rounded-lg px-3 py-1">
            <p class="text-xs text-gray-600">${text}</p>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
        scrollToBottom();
      }

      async function generateResponse(prompt) {
        isGenerating = true;
        sendBtn.disabled = true;
        stopBtn.classList.remove('hidden');
        sendBtn.classList.add('hidden');

        const responseElement = addAIMessage();
        let fullResponse = '';

        try {
          const model = modelSelect.value;
          const temperature = parseFloat(temperatureInput.value);

          const handleToken = ({ token }) => {
            fullResponse += token;
            // Render markdown with syntax highlighting
            responseElement.innerHTML = marked.parse(fullResponse);
            // Apply syntax highlighting to code blocks
            responseElement.querySelectorAll('pre code').forEach((block) => {
              hljs.highlightElement(block);
            });
            scrollToBottom();
          };

          client.on('token', handleToken);

          const requestId = Math.random().toString(36).substring(2, 15);
          activeRequestId = requestId;

          await client.generate(prompt, model, { temperature });

          client.off('token', handleToken);
        } catch (error) {
          console.error('Generation failed:', error);
          responseElement.innerHTML += `\n\n<div class="text-red-500">Error: ${error.message}</div>`;
        } finally {
          isGenerating = false;
          activeRequestId = null;
          sendBtn.disabled = false;
          stopBtn.classList.add('hidden');
          sendBtn.classList.remove('hidden');
          scrollToBottom();
        }
      }

      function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      function escapeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
      }
    });
  </script>
</body>
</html>
```

### Code Generation

Here's a specialized interface for code generation:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ollama Code Generator</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/styles/github-dark.min.css">
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/highlight.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/javascript.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/python.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/java.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/cpp.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/lib/languages/rust.min.js"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Ollama Code Generator</h1>

    <!-- Connection Form -->
    <div id="connection-form" class="bg-gray-800 p-4 rounded-lg shadow-lg mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Client ID</label>
          <input type="text" id="client-id" class="bg-gray-700 text-white w-full p-2 rounded">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Server URL</label>
          <input type="text" id="server-url" value="ws://localhost:3000" class="bg-gray-700 text-white w-full p-2 rounded">
        </div>
        <div class="flex items-end">
          <button id="connect-btn" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">Connect</button>
          <span id="status-indicator" class="ml-3 text-red-500">Disconnected</span>
        </div>
      </div>
      <div class="mt-4">
        <label class="block text-sm font-medium mb-1">Private Key</label>
        <textarea id="private-key" rows="3" class="bg-gray-700 text-white w-full p-2 rounded"></textarea>
      </div>
    </div>

    <!-- Code Generation Interface -->
    <div id="code-interface" class="hidden">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Input Panel -->
        <div>
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center">
              <label class="text-sm font-medium mr-2">Model:</label>
              <select id="model-select" class="bg-gray-700 text-white p-1 rounded">
                <option value="codellama">codellama</option>
              </select>
            </div>
            <div class="flex items-center">
              <label class="text-sm font-medium mr-2">Language:</label>
              <select id="language-select" class="bg-gray-700 text-white p-1 rounded">
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="rust">Rust</option>
              </select>
            </div>
          </div>

          <div class="mb-4">
            <textarea id="prompt-input" rows="6" placeholder="Describe the code you want to generate..."
              class="bg-gray-700 text-white w-full p-3 rounded font-mono text-sm"></textarea>
          </div>

          <div class="flex justify-between items-center mb-4">
            <div class="flex items-center">
              <input type="checkbox" id="comments-toggle" checked class="mr-2">
              <label for="comments-toggle" class="text-sm">Include comments</label>
            </div>
            <div>
              <button id="generate-btn" class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded mr-2">Generate</button>
              <button id="stop-btn" class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded hidden">Stop</button>
            </div>
          </div>

          <div>
            <h3 class="text-lg font-semibold mb-2">Examples:</h3>
            <div class="grid grid-cols-1 gap-2">
              <button class="example-btn bg-gray-700 hover:bg-gray-600 p-2 rounded text-left text-sm">
                Create a function to sort an array of objects by a specific property
              </button>
              <button class="example-btn bg-gray-700 hover:bg-gray-600 p-2 rounded text-left text-sm">
                Write a recursive function to calculate Fibonacci numbers with memoization
              </button>
              <button class="example-btn bg-gray-700 hover:bg-gray-600 p-2 rounded text-left text-sm">
                Create a class that implements a simple HTTP client
              </button>
            </div>
          </div>
        </div>

        <!-- Output Panel -->
        <div>
          <div class="mb-3 flex justify-between items-center">
            <h3 class="text-lg font-semibold">Generated Code</h3>
            <button id="copy-btn" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm">Copy Code</button>
          </div>

          <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
            <pre><code id="code-output" class="hljs p-4 overflow-auto max-h-[500px] text-sm">// Generated code will appear here</code></pre>
          </div>

          <div class="mt-4">
            <h4 class="text-md font-semibold mb-2">Execution Result:</h4>
            <div id="execution-output" class="bg-black rounded p-3 font-mono text-xs text-green-400 h-20 overflow-auto">
              > Output from code execution will appear here
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="ollama-client.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const client = new OllamaClient();
      let activeRequestId = null;

      // Elements
      const connectionForm = document.getElementById('connection-form');
      const codeInterface = document.getElementById('code-interface');
      const clientIdInput = document.getElementById('client-id');
      const privateKeyInput = document.getElementById('private-key');
      const serverUrlInput = document.getElementById('server-url');
      const connectBtn = document.getElementById('connect-btn');
      const statusIndicator = document.getElementById('status-indicator');
      const modelSelect = document.getElementById('model-select');
      const languageSelect = document.getElementById('language-select');
      const promptInput = document.getElementById('prompt-input');
      const commentsToggle = document.getElementById('comments-toggle');
      const generateBtn = document.getElementById('generate-btn');
      const stopBtn = document.getElementById('stop-btn');
      const codeOutput = document.getElementById('code-output');
      const copyBtn = document.getElementById('copy-btn');
      const executionOutput = document.getElementById('execution-output');
      const exampleBtns = document.querySelectorAll('.example-btn');

      // Load saved auth info
      if (localStorage.getItem('ollamaClientId')) {
        clientIdInput.value = localStorage.getItem('ollamaClientId');
      }

      // Connect button
      connectBtn.addEventListener('click', async () => {
        const clientId = clientIdInput.value.trim();
        const privateKey = privateKeyInput.value.trim();
        const serverUrl = serverUrlInput.value.trim();

        if (!clientId || !privateKey) {
          alert('Please enter client ID and private key');
          return;
        }

        // Save client ID for convenience
        localStorage.setItem('ollamaClientId', clientId);

        try {
          connectBtn.disabled = true;
          statusIndicator.textContent = 'Connecting...';
          statusIndicator.className = 'ml-3 text-yellow-500';

          client.config.clientId = clientId;
          client.config.privateKey = privateKey;
          client.config.serverUrl = serverUrl;

          await client.connect();

          statusIndicator.textContent = 'Connected';
          statusIndicator.className = 'ml-3 text-green-500';

          connectionForm.classList.add('hidden');
          codeInterface.classList.remove('hidden');

          // Load models
          try {
            const models = await client.getModels();
            modelSelect.innerHTML = models
              .filter(model => model.includes('code') || model.includes('starcoder'))
              .map(model => `<option value="${model}">${model}</option>`)
              .join('');

            if (modelSelect.options.length === 0) {
              // If no code-specific models, show all models
              modelSelect.innerHTML = models
                .map(model => `<option value="${model}">${model}</option>`)
                .join('');
            }
          } catch (error) {
            console.error('Failed to load models:', error);
          }
        } catch (error) {
          console.error('Connection failed:', error);
          statusIndicator.textContent = 'Connection failed';
          statusIndicator.className = 'ml-3 text-red-500';
          connectBtn.disabled = false;
        }
      });

      // Example buttons
      exampleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          promptInput.value = btn.textContent.trim();
        });
      });

      // Generate button
      generateBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        const model = modelSelect.value;
        const language = languageSelect.value;
        const includeComments = commentsToggle.checked;

        generateBtn.disabled = true;
        generateBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');

        codeOutput.textContent = 'Generating...';
        executionOutput.textContent = '> Waiting for code generation...';

        // Create a targeted prompt for code generation
        const formattedPrompt = createCodePrompt(prompt, language, includeComments);

        let generatedCode = '';

        const handleToken = ({ token }) => {
          generatedCode += token;

          // Try to extract just the code part (between triple backticks)
          let codeToDisplay = generatedCode;
          const codeBlockMatch = generatedCode.match(/```[\w]*\n([\s\S]*?)```/);
          if (codeBlockMatch) {
            codeToDisplay = codeBlockMatch[1];
          }

          // Update code display with syntax highlighting
          codeOutput.textContent = codeToDisplay;
          codeOutput.className = `hljs language-${language} p-4 overflow-auto max-h-[500px] text-sm`;
          hljs.highlightElement(codeOutput);
        };

        client.on('token', handleToken);

        try {
          const requestId = Math.random().toString(36).substring(2, 15);
          activeRequestId = requestId;

          await client.generate(formattedPrompt, model, {
            temperature: 0.2, // Lower temperature for more precise code
            max_tokens: 2000
          });

          // Try to execute the code if it's JavaScript
          if (language === 'javascript') {
            tryExecuteJavaScript(generatedCode);
          }
        } catch (error) {
          console.error('Generation failed:', error);
          codeOutput.textContent += `\n\n// Error: ${error.message}`;
        } finally {
          client.off('token', handleToken);
          generateBtn.disabled = false;
          generateBtn.classList.remove('hidden');
          stopBtn.classList.add('hidden');
          activeRequestId = null;
        }
      });

      // Stop button
      stopBtn.addEventListener('click', () => {
        if (activeRequestId) {
          client.stop(activeRequestId);
        }
      });

      // Copy button
      copyBtn.addEventListener('click', () => {
        const textToCopy = codeOutput.textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 2000);
        });
      });

      // Helper functions
      function createCodePrompt(userPrompt, language, includeComments) {
        return `Write ${language} code for the following task: ${userPrompt}

${includeComments ? 'Include detailed comments explaining the code.' : 'Keep comments minimal.'}

Ensure the code is:
- Efficient and follows best practices
- Easy to understand
- Free of bugs and edge cases
- Complete and ready to use

Only respond with the code in a single code block without explanations outside the code block.
`;
      }

      function tryExecuteJavaScript(code) {
        try {
          // Extract just the code part if it's in a markdown block
          let codeToExecute = code;
          const codeBlockMatch = code.match(/```[\w]*\n([\s\S]*?)```/);
          if (codeBlockMatch) {
            codeToExecute = codeBlockMatch[1];
          }

          // Create a safe execution environment with console capture
          const originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
          };

          let output = [];

          // Override console methods to capture output
          console.log = (...args) => {
            output.push('> ' + args.map(arg =>
              typeof arg === 'object' ? JSON.stringify(arg) : arg
            ).join(' '));
            originalConsole.log(...args);
          };
          console.error = (...args) => {
            output.push('> Error: ' + args.map(arg =>
              typeof arg === 'object' ? JSON.stringify(arg) : arg
            ).join(' '));
            originalConsole.error(...args);
          };
          console.warn = (...args) => {
            output.push('> Warning: ' + args.map(arg =>
              typeof arg === 'object' ? JSON.stringify(arg) : arg
            ).join(' '));
            originalConsole.warn(...args);
          };
          console.info = (...args) => {
            output.push('> Info: ' + args.map(arg =>
              typeof arg === 'object' ? JSON.stringify(arg) : arg
            ).join(' '));
            originalConsole.info(...args);
          };

          // Add a header message
          output.push('> Executing JavaScript code...');

          // Execute the code in a try/catch block
          try {
            // Use Function constructor to create a sandboxed function
            // This is not fully secure but provides basic isolation
            const result = new Function(codeToExecute)();
            if (result !== undefined) {
              output.push(`> Result: ${typeof result === 'object' ? JSON.stringify(result) : result}`);
            }
            output.push('> Execution completed successfully.');
          } catch (e) {
            output.push(`> Runtime error: ${e.message}`);
          }

          // Restore original console functions
          console.log = originalConsole.log;
          console.error = originalConsole.error;
          console.warn = originalConsole.warn;
          console.info = originalConsole.info;

          // Update the execution output
          executionOutput.textContent = output.join('\n');
        } catch (error) {
          executionOutput.textContent = `> Error trying to execute code: ${error.message}`;
        }
      }
    });
  </script>
</body>
</html>
```

## Security Considerations

When implementing a browser-based client, be aware of these important security considerations:

1. **Private Key Storage**:
   - Never store private keys in `localStorage` or `sessionStorage`
   - Private keys should be inputted by the user for each session
   - Consider using WebAuthn/FIDO2 for more secure client-side key

Similar code found with 4 license types
