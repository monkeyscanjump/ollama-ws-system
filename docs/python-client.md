# Python Client Implementation Guide

This guide provides a detailed walkthrough for implementing a Python client for the Ollama WebSocket System. We'll build a complete client library that handles authentication, connection management, and text generation.

## Table of Contents

- [Python Client Implementation Guide](#python-client-implementation-guide)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Basic Client Implementation](#basic-client-implementation)
  - [Advanced Client Features](#advanced-client-features)
    - [Asynchronous API](#asynchronous-api)
    - [Connection Pooling](#connection-pooling)
    - [Event Callbacks](#event-callbacks)
  - [Usage Examples](#usage-examples)
    - [Basic Usage](#basic-usage)
    - [Streaming Output](#streaming-output)
    - [Multiple Model Support](#multiple-model-support)
    - [Async/Await Usage](#asyncawait-usage)
  - [Error Handling](#error-handling)
  - [Performance Considerations](#performance-considerations)
  - [Testing](#testing)
  - [Further Reading](#further-reading)

## Prerequisites

To use this client, you'll need:

- Python 3.7 or higher
- A client ID and private key registered with the Ollama WebSocket server
- The following Python packages:
  - `websockets` for WebSocket connections
  - `cryptography` for signing challenges

Install the required packages:

```bash
pip install websockets cryptography
```

## Basic Client Implementation

Here's a complete implementation of a basic Ollama WebSocket client in Python:

```python
import json
import asyncio
import base64
import uuid
from typing import Dict, List, Any, Optional, Callable, Union
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key
import websockets

class OllamaClient:
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Ollama WebSocket client.

        Args:
            config: A dictionary containing the client configuration.
                - server_url: WebSocket server URL (default: ws://localhost:3000)
                - client_id: Client ID for authentication
                - private_key_path: Path to the private key file
                - private_key: PEM-encoded private key (alternative to private_key_path)
                - signature_algorithm: Algorithm for signing challenges (default: SHA256)
        """
        self.config = {
            'server_url': 'ws://localhost:3000',
            'client_id': None,
            'private_key_path': None,
            'private_key': None,
            'signature_algorithm': 'SHA256',
            **config
        }

        self.ws = None
        self.connected = False
        self.authenticated = False
        self.private_key = None
        self.message_callbacks = {}
        self.active_requests = {}

    async def connect(self) -> None:
        """
        Connect to the WebSocket server and authenticate.

        Raises:
            ValueError: If required configuration is missing
            ConnectionError: If connection or authentication fails
        """
        if not self.config['client_id']:
            raise ValueError("Client ID is required")

        # Load private key
        if not self.private_key:
            if self.config['private_key']:
                self._load_private_key_from_string(self.config['private_key'])
            elif self.config['private_key_path']:
                self._load_private_key_from_file(self.config['private_key_path'])
            else:
                raise ValueError("Either private_key or private_key_path must be provided")

        try:
            self.ws = await websockets.connect(self.config['server_url'])
            self.connected = True

            # Wait for challenge and authenticate
            challenge_msg = await self.ws.recv()
            challenge_data = json.loads(challenge_msg)

            if challenge_data['type'] != 'challenge':
                raise ConnectionError(f"Expected challenge message, got {challenge_data['type']}")

            # Handle challenge
            challenge = challenge_data['challenge']
            signature = self._sign_challenge(challenge)

            # Send authentication response
            auth_response = {
                'type': 'authenticate',
                'clientId': self.config['client_id'],
                'signature': signature
            }
            await self.ws.send(json.dumps(auth_response))

            # Wait for authentication result
            auth_result_msg = await self.ws.recv()
            auth_result = json.loads(auth_result_msg)

            if auth_result['type'] != 'auth_result':
                raise ConnectionError(f"Expected auth_result message, got {auth_result['type']}")

            if not auth_result['success']:
                raise ConnectionError(f"Authentication failed: {auth_result.get('error', 'Unknown error')}")

            self.authenticated = True

            # Start message handler
            asyncio.create_task(self._message_handler())

            return True
        except (websockets.exceptions.WebSocketException, ConnectionError) as e:
            self.connected = False
            self.authenticated = False
            raise ConnectionError(f"Connection failed: {str(e)}")

    def _load_private_key_from_file(self, filepath: str) -> None:
        """Load a private key from a file."""
        with open(filepath, 'rb') as f:
            private_key_data = f.read()
            self._load_private_key_from_string(private_key_data.decode('utf-8'))

    def _load_private_key_from_string(self, private_key_str: str) -> None:
        """Load a private key from a string."""
        try:
            self.private_key = load_pem_private_key(
                private_key_str.encode('utf-8'),
                password=None
            )
        except Exception as e:
            raise ValueError(f"Failed to load private key: {str(e)}")

    def _sign_challenge(self, challenge: str) -> str:
        """Sign a challenge string with the private key."""
        if self.config['signature_algorithm'] == 'SHA256':
            hash_algorithm = hashes.SHA256()
        elif self.config['signature_algorithm'] == 'SHA384':
            hash_algorithm = hashes.SHA384()
        elif self.config['signature_algorithm'] == 'SHA512':
            hash_algorithm = hashes.SHA512()
        else:
            hash_algorithm = hashes.SHA256()

        signature = self.private_key.sign(
            challenge.encode('utf-8'),
            padding.PKCS1v15(),
            hash_algorithm
        )

        return base64.b64encode(signature).decode('utf-8')

    async def _message_handler(self) -> None:
        """Handle incoming messages from the WebSocket."""
        try:
            while self.connected:
                try:
                    message = await self.ws.recv()
                    data = json.loads(message)
                    await self._process_message(data)
                except json.JSONDecodeError:
                    print(f"Received invalid JSON: {message}")
                except websockets.exceptions.ConnectionClosed:
                    self.connected = False
                    self.authenticated = False
                    break
        except Exception as e:
            print(f"Message handler error: {str(e)}")
            self.connected = False
            self.authenticated = False

    async def _process_message(self, message: Dict[str, Any]) -> None:
        """Process a message from the server."""
        message_type = message.get('type')

        # Call callbacks if registered
        if message_type in self.message_callbacks:
            for callback in self.message_callbacks[message_type]:
                asyncio.create_task(callback(message))

        # Handle specific message types
        if message_type == 'stream_token':
            request_id = message.get('id')
            if request_id in self.active_requests:
                self.active_requests[request_id]['text'] += message.get('token', '')

        elif message_type == 'stream_end':
            request_id = message.get('id')
            if request_id in self.active_requests:
                request = self.active_requests[request_id]
                if 'future' in request:
                    request['future'].set_result({
                        'text': request['text'],
                        'total_tokens': message.get('totalTokens'),
                        'elapsed_time': message.get('elapsedTime')
                    })
                del self.active_requests[request_id]

        elif message_type == 'error':
            request_id = message.get('id')
            if request_id in self.active_requests:
                request = self.active_requests[request_id]
                if 'future' in request:
                    request['future'].set_exception(
                        Exception(f"{message.get('error')} (code: {message.get('code')})")
                    )
                del self.active_requests[request_id]

        elif message_type == 'models_result':
            if 'models' in self.active_requests:
                request = self.active_requests['models']
                if 'future' in request:
                    request['future'].set_result(message.get('models', []))
                del self.active_requests['models']

    def on(self, message_type: str, callback: Callable) -> None:
        """Register a callback for a specific message type."""
        if message_type not in self.message_callbacks:
            self.message_callbacks[message_type] = []
        self.message_callbacks[message_type].append(callback)

    def off(self, message_type: str, callback: Optional[Callable] = None) -> None:
        """Remove a callback for a specific message type."""
        if message_type in self.message_callbacks:
            if callback:
                self.message_callbacks[message_type] = [
                    cb for cb in self.message_callbacks[message_type] if cb != callback
                ]
            else:
                self.message_callbacks[message_type] = []

    async def generate(self, prompt: str, model: str = 'llama2', options: Dict = None) -> Dict[str, Any]:
        """
        Generate text using the language model.

        Args:
            prompt: The prompt to generate from
            model: The model to use (default: llama2)
            options: Generation options (temperature, max_tokens, etc.)

        Returns:
            Dictionary containing generated text and metadata

        Raises:
            ConnectionError: If not connected or authenticated
            Exception: If generation fails
        """
        if not self.connected or not self.authenticated:
            raise ConnectionError("Not connected or authenticated")

        if options is None:
            options = {}

        # Create a unique request ID
        request_id = str(uuid.uuid4())

        # Create a future to wait for the result
        future = asyncio.get_event_loop().create_future()

        # Store request data
        self.active_requests[request_id] = {
            'future': future,
            'text': ''
        }

        # Send generation request
        await self.ws.send(json.dumps({
            'type': 'generate',
            'id': request_id,
            'model': model,
            'prompt': prompt,
            'options': options
        }))

        # Wait for the result
        return await future

    async def stop(self, request_id: str) -> None:
        """
        Stop an ongoing generation.

        Args:
            request_id: The ID of the request to stop

        Raises:
            ConnectionError: If not connected or authenticated
        """
        if not self.connected or not self.authenticated:
            raise ConnectionError("Not connected or authenticated")

        if request_id not in self.active_requests:
            return

        await self.ws.send(json.dumps({
            'type': 'stop',
            'id': request_id
        }))

    async def get_models(self) -> List[str]:
        """
        Get a list of available models.

        Returns:
            List of model names

        Raises:
            ConnectionError: If not connected or authenticated
        """
        if not self.connected or not self.authenticated:
            raise ConnectionError("Not connected or authenticated")

        # Create a future to wait for the result
        future = asyncio.get_event_loop().create_future()

        # Store request data
        self.active_requests['models'] = {
            'future': future
        }

        # Send models request
        await self.ws.send(json.dumps({
            'type': 'models'
        }))

        # Wait for the result
        return await future

    async def ping(self) -> None:
        """
        Send a ping to keep the connection alive.

        Raises:
            ConnectionError: If not connected
        """
        if not self.connected:
            raise ConnectionError("Not connected")

        await self.ws.send(json.dumps({
            'type': 'ping'
        }))

    async def close(self) -> None:
        """Close the WebSocket connection."""
        if self.ws:
            await self.ws.close()
            self.connected = False
            self.authenticated = False
```

## Advanced Client Features

### Asynchronous API

The Python client uses `asyncio` and the `websockets` library to provide a fully asynchronous API. Here's how to create a version that also supports synchronous usage:

```python
import threading
import asyncio
from functools import wraps

class SyncOllamaClient:
    """Synchronous wrapper for the async OllamaClient."""

    def __init__(self, config):
        self.async_client = OllamaClient(config)
        self.loop = asyncio.new_event_loop()
        self.thread = None

    def _start_background_loop(self):
        """Start the event loop in a background thread."""
        if self.thread is not None:
            return

        def run_loop_in_thread():
            asyncio.set_event_loop(self.loop)
            self.loop.run_forever()

        self.thread = threading.Thread(target=run_loop_in_thread, daemon=True)
        self.thread.start()

    def _run_coroutine(self, coro):
        """Run a coroutine in the event loop."""
        if self.thread is None:
            self._start_background_loop()

        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return future.result()

    def connect(self):
        """Connect to the WebSocket server synchronously."""
        return self._run_coroutine(self.async_client.connect())

    def generate(self, prompt, model='llama2', options=None):
        """Generate text synchronously."""
        return self._run_coroutine(self.async_client.generate(prompt, model, options))

    def stop(self, request_id):
        """Stop a generation synchronously."""
        return self._run_coroutine(self.async_client.stop(request_id))

    def get_models(self):
        """Get available models synchronously."""
        return self._run_coroutine(self.async_client.get_models())

    def close(self):
        """Close the connection synchronously."""
        if self.thread is not None:
            result = self._run_coroutine(self.async_client.close())
            self.loop.call_soon_threadsafe(self.loop.stop)
            self.thread.join(timeout=5)
            self.thread = None
            return result
```

### Connection Pooling

For applications that need to handle many concurrent requests, you can implement a connection pool:

```python
import asyncio
from typing import Dict, List, Any, Optional

class OllamaConnectionPool:
    def __init__(self, config: Dict[str, Any], pool_size: int = 5):
        """Initialize a connection pool of Ollama clients."""
        self.config = config
        self.pool_size = pool_size
        self.clients = []
        self.available_clients = []
        self.lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Initialize the connection pool."""
        for _ in range(self.pool_size):
            client = OllamaClient(self.config)
            await client.connect()
            self.clients.append(client)
            self.available_clients.append(client)

        print(f"Connection pool initialized with {self.pool_size} clients")

    async def get_client(self) -> OllamaClient:
        """Get an available client from the pool."""
        async with self.lock:
            while not self.available_clients:
                await asyncio.sleep(0.1)

            return self.available_clients.pop()

    async def release_client(self, client: OllamaClient) -> None:
        """Return a client to the pool."""
        async with self.lock:
            self.available_clients.append(client)

    async def generate(self, prompt: str, model: str = 'llama2', options: Dict = None) -> Dict[str, Any]:
        """Generate text using a client from the pool."""
        client = await self.get_client()
        try:
            result = await client.generate(prompt, model, options)
            return result
        finally:
            await self.release_client(client)

    async def get_models(self) -> List[str]:
        """Get available models using a client from the pool."""
        client = await self.get_client()
        try:
            models = await client.get_models()
            return models
        finally:
            await self.release_client(client)

    async def close(self) -> None:
        """Close all clients in the pool."""
        for client in self.clients:
            await client.close()

        self.clients = []
        self.available_clients = []
```

### Event Callbacks

The client supports event-based programming through callbacks:

```python
async def on_token(message):
    print(message['token'], end='', flush=True)

async def on_complete(message):
    print(f"\nGeneration complete: {message['totalTokens']} tokens in {message['elapsedTime']}ms")

async def on_error(message):
    print(f"Error: {message['error']} (code: {message['code']})")

# Register callbacks
client = OllamaClient(config)
client.on('stream_token', on_token)
client.on('stream_end', on_complete)
client.on('error', on_error)

await client.connect()
```

## Usage Examples

### Basic Usage

Here's a simple example of using the client:

```python
import asyncio
import json
from ollama_client import OllamaClient

async def main():
    # Load config from file
    with open('./keys/my-client_config.json', 'r') as f:
        config_data = json.load(f)

    # Convert to Python-style keys
    config = {
        'server_url': config_data['serverUrl'].replace('http://', 'ws://'),
        'client_id': config_data['clientId'],
        'private_key_path': config_data['privateKeyPath'],
        'signature_algorithm': config_data.get('signatureAlgorithm', 'SHA256')
    }

    client = OllamaClient(config)

    try:
        # Connect and authenticate
        await client.connect()
        print('Connected and authenticated!')

        # Generate text
        result = await client.generate(
            'Explain quantum computing in simple terms',
            'llama2',
            {'temperature': 0.7, 'max_tokens': 200}
        )

        print('\nFull response:')
        print(result['text'])
        print(f"\nGenerated {result['total_tokens']} tokens in {result['elapsed_time']}ms")
    except Exception as e:
        print(f'Error: {str(e)}')
    finally:
        await client.close()

# For Python 3.7+
asyncio.run(main())
```

### Streaming Output

To handle streaming output in real-time:

```python
import asyncio
from ollama_client import OllamaClient

async def main():
    # Load config
    # ...

    client = OllamaClient(config)

    # Set up streaming callback
    async def handle_token(message):
        print(message['token'], end='', flush=True)

    client.on('stream_token', handle_token)

    try:
        await client.connect()

        # Generate text - the tokens will be printed in real-time
        # by the callback while this function runs
        result = await client.generate(
            'Write a short story about a robot learning to paint'
        )

        print(f"\n\nGenerated {result['total_tokens']} tokens in {result['elapsed_time']}ms")
    except Exception as e:
        print(f'Error: {str(e)}')
    finally:
        await client.close()

asyncio.run(main())
```

### Multiple Model Support

Working with different models:

```python
import asyncio
from ollama_client import OllamaClient

async def main():
    # Load config
    # ...

    client = OllamaClient(config)

    try:
        await client.connect()

        # Get available models
        models = await client.get_models()
        print('Available models:', models)

        # Use specific model if available
        if 'codellama' in models:
            print('Generating code with CodeLlama...')
            result = await client.generate(
                'Write a Python function to calculate the Fibonacci sequence',
                'codellama'
            )
            print('\nCode:')
            print(result['text'])
        else:
            print('CodeLlama not available, using default model')
            result = await client.generate(
                'Write a Python function to calculate the Fibonacci sequence'
            )
            print('\nCode:')
            print(result['text'])
    except Exception as e:
        print(f'Error: {str(e)}')
    finally:
        await client.close()

asyncio.run(main())
```

### Async/Await Usage

Using Python's async/await syntax for concurrent operations:

```python
import asyncio
from ollama_client import OllamaClient

async def generate_with_model(client, prompt, model):
    print(f"Generating with {model}...")
    result = await client.generate(prompt, model)
    print(f"\n[{model} result]:\n{result['text'][:100]}...\n")
    return result

async def main():
    # Load config
    # ...

    client = OllamaClient(config)

    try:
        await client.connect()

        models = await client.get_models()
        available_models = models[:2]  # Use first two models

        if len(available_models) >= 2:
            # Run concurrent generations with different models
            tasks = [
                generate_with_model(
                    client,
                    "Explain the concept of recursion",
                    model
                ) for model in available_models
            ]

            results = await asyncio.gather(*tasks)

            # Compare token counts
            for i, result in enumerate(results):
                print(f"Model {available_models[i]}: {result['total_tokens']} tokens")
        else:
            print("Need at least 2 models for comparison")
    except Exception as e:
        print(f'Error: {str(e)}')
    finally:
        await client.close()

asyncio.run(main())
```

## Error Handling

The client provides detailed error information for various failure scenarios:

```python
import asyncio
from ollama_client import OllamaClient

async def main():
    # Load config
    # ...

    client = OllamaClient(config)

    try:
        await client.connect()
        # Operations...
    except ValueError as e:
        print(f"Configuration error: {str(e)}")
        print("Please check your client ID and private key settings")
    except ConnectionError as e:
        if "Authentication failed" in str(e):
            print(f"Authentication error: {str(e)}")
            print("Please check your client ID and private key")
        elif "Failed to load private key" in str(e):
            print(f"Key error: {str(e)}")
            print("Your private key may be invalid or in the wrong format")
        elif "Connection failed" in str(e) and "refused" in str(e).lower():
            print(f"Connection error: {str(e)}")
            print("The server may be down or the URL is incorrect")
        else:
            print(f"Connection error: {str(e)}")
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
    finally:
        if client.connected:
            await client.close()

asyncio.run(main())
```

## Performance Considerations

For optimal performance:

1. **Connection Reuse**: Keep the connection open for multiple requests rather than connecting each time
2. **Use Asyncio**: Take advantage of Python's asyncio for concurrent operations
3. **Connection Pooling**: For high-throughput applications, use a connection pool as shown earlier
4. **Heartbeats**: Send periodic pings to keep the connection alive for long-running applications:

```python
async def heartbeat(client):
    """Keep the connection alive with periodic pings."""
    while client.connected:
        try:
            await client.ping()
        except:
            pass
        await asyncio.sleep(30)  # Every 30 seconds

# Start the heartbeat
heartbeat_task = asyncio.create_task(heartbeat(client))

# Remember to cancel when done
heartbeat_task.cancel()
```

5. **Memory Management**: For handling large responses, process tokens as they arrive instead of accumulating the entire response:

```python
async def process_streaming_tokens():
    client = OllamaClient(config)

    # Custom processing logic
    result_parts = []

    async def token_processor(message):
        token = message['token']
        # Process each token as it arrives
        # For example, classify or filter content in real-time
        if len(token.strip()) > 0:  # Skip empty tokens
            result_parts.append(token)
            # Do real-time processing here

    client.on('stream_token', token_processor)

    await client.connect()
    await client.generate("Generate a long story about space exploration")
    await client.close()

    # Post-process the complete result if needed
    complete_text = ''.join(result_parts)
    return complete_text
```

## Testing

Here's an example of how to test the client using pytest and pytest-asyncio:

```python
# test_ollama_client.py
import pytest
import asyncio
from unittest.mock import MagicMock, patch
import json
import websockets
from ollama_client import OllamaClient

@pytest.fixture
def client_config():
    return {
        'server_url': 'ws://localhost:3000',
        'client_id': 'test-client-id',
        'private_key': """-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
MzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvu
NMoSfm76oqFvAp8Gy0iz5sxjZmSnXyCdPEovGhLa0VzMaQ8s+CLOyS56YyCFGeJZ
agG0Ml66A+UPS6c/Hx3KZy6FzTw3QNxdGV+cdWkw3LiX6Zlf5VVsjt663wTYbbIT
mGEg8xzpZL0tEY29mZRgy0UReuGV2U4Q4jtTHZPZ2pCxydflEWdZIJajWq3iVNiq
SfaiDLHvMSFJzUh/HqMrWcAbKd/RJXUmGJYgzrZLnHBNLbbbMq/JZ0wOzxNMRb77
65  PHEW==
-----END PRIVATE KEY-----"""
    }

@pytest.mark.asyncio
async def test_client_authentication(client_config):
    """Test client authentication process."""

    # Create a mock for websockets client
    mock_ws = MagicMock()

    # Set up the mock to return expected messages
    challenge_msg = json.dumps({
        'type': 'challenge',
        'challenge': 'test-challenge',
        'timestamp': 123456789
    })

    auth_result_msg = json.dumps({
        'type': 'auth_result',
        'success': True,
        'timestamp': 123456789
    })

    # Configure the mock to return these messages in sequence
    mock_ws.recv.side_effect = [challenge_msg, auth_result_msg]

    # Patch the websockets.connect to return our mock
    with patch('websockets.connect', return_value=mock_ws):
        client = OllamaClient(client_config)
        await client.connect()

        # Check that authentication was successful
        assert client.connected == True
        assert client.authenticated == True

        # Verify the mock was called correctly
        mock_ws.send.assert_called()
        send_data = json.loads(mock_ws.send.call_args[0][0])
        assert send_data['type'] == 'authenticate'
        assert send_data['clientId'] == client_config['client_id']
        assert 'signature' in send_data

@pytest.mark.asyncio
async def test_generate_text(client_config):
    """Test text generation functionality."""

    # Create a mock for websockets client
    mock_ws = MagicMock()

    # Auth messages
    challenge_msg = json.dumps({
        'type': 'challenge',
        'challenge': 'test-challenge',
        'timestamp': 123456789
    })

    auth_result_msg = json.dumps({
        'type': 'auth_result',
        'success': True,
        'timestamp': 123456789
    })

    # Generation messages
    token1_msg = json.dumps({
        'type': 'stream_token',
        'id': '123',
        'token': 'Hello',
        'timestamp': 123456789
    })

    token2_msg = json.dumps({
        'type': 'stream_token',
        'id': '123',
        'token': ' world',
        'timestamp': 123456790
    })

    end_msg = json.dumps({
        'type': 'stream_end',
        'id': '123',
        'totalTokens': 2,
        'elapsedTime': 100,
        'timestamp': 123456791
    })

    # Configure the mock
    mock_ws.recv.side_effect = [
        challenge_msg,
        auth_result_msg,
        token1_msg,
        token2_msg,
        end_msg
    ]

    # Patch websockets.connect
    with patch('websockets.connect', return_value=mock_ws):
        client = OllamaClient(client_config)
        await client.connect()

        # Start message handler manually for testing
        message_task = asyncio.create_task(client._message_handler())

        # Generate text
        result = await client.generate('Test prompt')

        # Check the result
        assert result['text'] == 'Hello world'
        assert result['total_tokens'] == 2
        assert result['elapsed_time'] == 100

        # Verify generate request was sent correctly
        calls = mock_ws.send.call_args_list
        generate_call = calls[1]  # First call is authentication
        generate_data = json.loads(generate_call[0][0])
        assert generate_data['type'] == 'generate'
        assert generate_data['prompt'] == 'Test prompt'
        assert generate_data['model'] == 'llama2'  # Default model

        # Clean up
        message_task.cancel()
        await client.close()
```

## Further Reading

- API Reference - Complete WebSocket API documentation
- Security Model - Details on the authentication system
- Node.js Client Implementation - Node.js equivalent of this client
- Browser Client Implementation - Browser-based JavaScript implementation

This comprehensive Python client implementation guide provides a complete framework for developers to build applications that interact with the Ollama WebSocket System. The guide includes both synchronous and asynchronous patterns, error handling strategies, and thorough examples to help Python developers get started quickly.This comprehensive Python client implementation guide provides a complete framework for developers to build applications that interact with the Ollama WebSocket System. The guide includes both synchronous and asynchronous patterns, error handling strategies, and thorough examples to help Python developers get started quickly.
