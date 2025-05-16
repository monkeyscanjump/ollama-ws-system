// Web client for Ollama WebSocket System

// DOM elements
const messageContainer = document.getElementById('message-container');
const promptInput = document.getElementById('prompt-input');
const sendButton = document.getElementById('send-button');
const modelSelect = document.getElementById('model-select');
const stopButton = document.getElementById('stop-button');
const statusIndicator = document.getElementById('status-indicator');
const connectButton = document.getElementById('connect-button');
const loadingSpinner = document.getElementById('loading-spinner');

// Settings elements
const clientIdInput = document.getElementById('client-id');
const privateKeyInput = document.getElementById('private-key');
const serverUrlInput = document.getElementById('server-url');
const saveSettingsButton = document.getElementById('save-settings');
const clearSettingsButton = document.getElementById('clear-settings');
const errorMessage = document.getElementById('error-message');

// State
let ws = null;
let activeGeneration = null;
let availableModels = [];
let settings = {
  clientId: '',
  privateKey: '',
  serverUrl: 'ws://localhost:3000'
};

// Load saved settings
loadSettings();

// Event listeners
sendButton.addEventListener('click', () => {
  const prompt = promptInput.value.trim();
  if (!prompt) return; // Fixed incomplete condition

  addUserMessage(prompt);
  generateText(prompt);
  promptInput.value = '';
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendButton.click();
  }
});

stopButton.addEventListener('click', () => {
  if (activeGeneration) {
    stopGeneration(activeGeneration);
  }
});

connectButton.addEventListener('click', () => {
  const isConnected = ws && ws.readyState === WebSocket.OPEN;

  if (isConnected) {
    ws.close();
  } else {
    connectToServer();
  }
});

saveSettingsButton.addEventListener('click', () => {
  settings.clientId = clientIdInput.value.trim();
  settings.privateKey = privateKeyInput.value.trim();
  settings.serverUrl = serverUrlInput.value.trim() || 'ws://localhost:3000';

  if (!settings.clientId || !settings.privateKey) {
    showError('Client ID and Private Key are required');
    return;
  }

  saveSettings();
  hideError();

  // Try to connect if settings changed
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close(); // Will reconnect with new settings
  } else {
    connectToServer();
  }
});

clearSettingsButton.addEventListener('click', () => {
  localStorage.removeItem('ollama_ws_settings');
  settings = {
    clientId: '',
    privateKey: '',
    serverUrl: 'ws://localhost:3000'
  };
  clientIdInput.value = '';
  privateKeyInput.value = '';
  serverUrlInput.value = 'ws://localhost:3000';

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  updateConnectionStatus('disconnected');
});

// Functions
function loadSettings() {
  try {
    const savedSettings = localStorage.getItem('ollama_ws_settings');
    if (savedSettings) {
      settings = JSON.parse(savedSettings);
      clientIdInput.value = settings.clientId || '';
      privateKeyInput.value = settings.privateKey || '';
      serverUrlInput.value = settings.serverUrl || 'ws://localhost:3000';

      // Auto-connect if we have settings
      if (settings.clientId && settings.privateKey) {
        connectToServer();
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('ollama_ws_settings', JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

function hideError() {
  errorMessage.style.display = 'none';
}

function connectToServer() {
  if (!settings.clientId || !settings.privateKey) {
    showError('Client ID and Private Key are required');
    return;
  }

  // Close existing connection
  if (ws) {
    ws.close();
  }

  try {
    updateConnectionStatus('connecting');

    // Connect to WebSocket server
    ws = new WebSocket(settings.serverUrl);

    ws.onopen = () => {
      console.log('WebSocket connection established');
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      updateConnectionStatus('disconnected');
      ws = null;
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      showError('Connection error. Check server URL and network.');
      updateConnectionStatus('error');
    };
  } catch (error) {
    console.error('Failed to connect:', error);
    showError(`Connection failed: ${error.message}`);
    updateConnectionStatus('error');
  }
}

function handleMessage(event) {
  try {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'challenge':
        handleChallenge(message.challenge);
        break;

      case 'auth_result':
        handleAuthResult(message);
        break;

      case 'stream_start':
        startResponseMessage();
        break;

      case 'stream_token':
        appendResponseToken(message.token);
        break;

      case 'stream_end':
        finishResponseMessage();
        activeGeneration = null;
        updateUI();
        break;

      case 'models_result':
        handleModelsResult(message.models);
        break;

      case 'error':
        handleErrorMessage(message);
        break;

      default:
        console.log('Received message:', message);
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

function handleChallenge(challenge) {
  try {
    console.log('Received challenge, signing...');

    // Create a new instance of SubtleCrypto
    const crypto = window.crypto.subtle;

    // Import the private key
    importPrivateKey(settings.privateKey)
      .then(privateKey => {
        // Convert challenge to ArrayBuffer
        const encoder = new TextEncoder();
        const data = encoder.encode(challenge);

        // Sign the challenge
        return crypto.sign(
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: 'SHA-256' }
          },
          privateKey,
          data
        );
      })
      .then(signature => {
        // Convert signature to base64
        const signatureBase64 = arrayBufferToBase64(signature);

        // Send authentication message
        send({
          type: 'authenticate',
          clientId: settings.clientId,
          signature: signatureBase64,
          timestamp: Date.now()
        });
      })
      .catch(error => {
        console.error('Authentication error:', error);
        showError(`Authentication failed: ${error.message}`);
        updateConnectionStatus('error');
      });
  } catch (error) {
    console.error('Failed to sign challenge:', error);
    showError(`Authentication failed: ${error.message}`);
    updateConnectionStatus('error');
  }
}

function importPrivateKey(pem) {
  // Remove PEM header/footer and convert to base64
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  let pemContents = pem;

  if (pemContents.includes(pemHeader)) {
    pemContents = pemContents
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');
  }

  // Convert base64 to ArrayBuffer
  const binaryString = window.atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Import the key
  return window.crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' }
    },
    false,
    ['sign']
  );
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function handleAuthResult(message) {
  if (message.success) {
    console.log('Authentication successful');
    updateConnectionStatus('connected');
    hideError();

    // Request available models
    requestModels();
  } else {
    console.error('Authentication failed:', message.error);
    showError(`Authentication failed: ${message.error || 'Unknown error'}`);
    updateConnectionStatus('error');
    ws.close();
  }
}

function handleModelsResult(models) {
  availableModels = models;
  updateModelsList();
}

function handleErrorMessage(message) {
  console.error('Server error:', message.error);
  showError(`Server error: ${message.error}`);

  if (message.code === 'unauthorized') {
    updateConnectionStatus('disconnected');
    if (ws) ws.close();
  }
}

function updateModelsList() {
  // Clear existing options
  modelSelect.innerHTML = '';

  // Add available models
  availableModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.name;
    modelSelect.appendChild(option);
  });

  // If no models available, add a placeholder
  if (availableModels.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No models available';
    option.disabled = true;
    option.selected = true;
    modelSelect.appendChild(option);
  }
}

function requestModels() {
  send({
    id: generateId(),
    type: 'models',
    timestamp: Date.now()
  });
}

function generateText(prompt) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showError('Not connected to server');
    return;
  }

  const model = modelSelect.value || 'llama2';
  const requestId = generateId();

  activeGeneration = requestId;
  updateUI();

  send({
    id: requestId,
    type: 'generate',
    prompt,
    model,
    timestamp: Date.now()
  });
}

function stopGeneration(requestId) {
  send({
    id: generateId(),
    type: 'stop',
    requestId,
    timestamp: Date.now()
  });
}

function send(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('Cannot send message, WebSocket is not open');
  }
}

function generateId() {
  return 'msg_' + Math.random().toString(36).substring(2, 15);
}

function addUserMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user-message';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'U';

  const content = document.createElement('div');
  content.className = 'content';
  content.textContent = text;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  messageContainer.appendChild(messageDiv);

  messageContainer.scrollTop = messageContainer.scrollHeight;
}

let currentResponseMessage = null;
let currentResponseContent = null;

function startResponseMessage() {
  currentResponseMessage = document.createElement('div');
  currentResponseMessage.className = 'message bot-message';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';

  currentResponseContent = document.createElement('div');
  currentResponseContent.className = 'content';

  currentResponseMessage.appendChild(avatar);
  currentResponseMessage.appendChild(currentResponseContent);
  messageContainer.appendChild(currentResponseMessage);
}

function appendResponseToken(token) {
  if (!currentResponseContent) {
    startResponseMessage();
  }

  // Append token to the response
  currentResponseContent.textContent += token;

  // Scroll to bottom
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

function finishResponseMessage() {
  // Convert any markdown in the response to HTML
  if (currentResponseContent && typeof markdownit === 'function') {
    const md = markdownit();
    const rawText = currentResponseContent.textContent;
    currentResponseContent.innerHTML = md.render(rawText);

    // Add syntax highlighting
    if (typeof hljs !== 'undefined') {
      document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightBlock(block);
      });
    }
  }

  currentResponseMessage = null;
  currentResponseContent = null;

  // Scroll to bottom
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

function updateConnectionStatus(status) {
  statusIndicator.className = `status-indicator ${status}`;

  switch (status) {
    case 'connected':
      statusIndicator.title = 'Connected';
      connectButton.textContent = 'Disconnect';
      loadingSpinner.style.display = 'none';
      break;

    case 'connecting':
      statusIndicator.title = 'Connecting...';
      connectButton.textContent = 'Connecting...';
      loadingSpinner.style.display = 'inline-block';
      break;

    case 'disconnected':
      statusIndicator.title = 'Disconnected';
      connectButton.textContent = 'Connect';
      loadingSpinner.style.display = 'none';
      break;

    case 'error':
      statusIndicator.title = 'Connection Error';
      connectButton.textContent = 'Reconnect';
      loadingSpinner.style.display = 'none';
      break;
  }
}

function updateUI() {
  const isConnected = ws && ws.readyState === WebSocket.OPEN;
  const isGenerating = activeGeneration !== null;

  // Enable/disable controls based on connection state
  sendButton.disabled = !isConnected || isGenerating;
  promptInput.disabled = !isConnected;
  modelSelect.disabled = !isConnected || isGenerating;
  stopButton.disabled = !isGenerating;

  // Show/hide stop button
  stopButton.style.display = isGenerating ? 'inline-block' : 'none';
  sendButton.style.display = isGenerating ? 'none' : 'inline-block';
}

// Initial UI update
updateUI();
