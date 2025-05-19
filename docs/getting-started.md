# Getting Started with Ollama WebSocket System

This guide will walk you through the initial setup and basic usage of the Ollama WebSocket System, a secure gateway for Ollama language models.

## What You'll Learn

- How to install and configure the system
- How to create your first client
- How to connect to the server
- How to generate your first completion

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (version 16.0.0 or higher)
- **npm** (version 7.0.0 or higher)
- **Ollama** installed and running on your local machine or a remote server

If you don't have Ollama installed, visit [ollama.ai](https://ollama.ai) for installation instructions for your operating system.

## Installation Options

You can install the Ollama WebSocket System using either the standard installation process or Docker. Choose the option that best fits your environment.

### Standard Installation

```bash
# Clone the repository
git clone https://github.com/monkeyscanjump/ws-system.git
cd ws-system

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Run the setup script to create directories and an admin client
npm run setup

# Start the server
npm start
```

After running these commands, the WebSocket server will be available at `http://localhost:3000`.

### Docker Installation

If you prefer using Docker:

```bash
# Clone the repository
git clone https://github.com/monkeyscanjump/ws-system.git
cd ws-system

# Build the Docker image
npm run docker:build

# Start the stack with Docker Compose
npm run docker:start

# View logs
npm run docker:logs
```

The Docker setup includes both the WebSocket server and an Ollama container, with persistent volumes for data and keys.

## Initial Configuration

The system is configurable through environment variables or a .env file in the project root. The setup script creates a default .env file that works for most installations.

Key configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `OLLAMA_API_URL` | URL to Ollama API | `http://localhost:11434` |
| `OLLAMA_DEFAULT_MODEL` | Default model | `llama2` |

You can modify these settings in the .env file if needed.

## Creating Your First Client

The system uses public-key authentication to secure access to your Ollama models. Follow these steps to create your first client:

### Step 1: Generate a Key Pair

```bash
npm run generate-keys -- my-first-client
```

This creates:

- `keys/my-first-client_key.pem` (private key - keep this secure!)
- `keys/my-first-client_key.pub` (public key - share with server)

### Step 2: Register with the Server

```bash
npm run register-client -- http://localhost:3000 my-first-client ./keys/my-first-client_key.pub
```

The server will respond with a client ID and create a configuration file at `keys/my-first-client_config.json`.

## Connecting to the Server

### Using the Web Interface

The simplest way to test your connection:

1. Open your browser to `http://localhost:3000`
2. Enter your Client ID (from the registration step)
3. Paste your private key content (from `my-first-client_key.pem`)
4. Click "Connect"

If authentication is successful, you'll see "Connected" status and can start sending prompts.

### Using the Command Line

You can verify your setup using curl:

```bash
# Check if the server is running
curl http://localhost:3000

# Check if Ollama is accessible
curl http://localhost:11434/api/tags
```

## Generating Your First Completion

Once connected through the web interface:

1. Type a prompt in the input box (e.g., "Explain how the solar system formed")
2. Select a model from the dropdown (defaults to "llama2")
3. Click "Generate"

The response will stream in real-time, token by token.

## Next Steps

Now that you have the system running:

- Learn about client management to create, list, and revoke clients
- Explore the API Reference to integrate with your own applications
- See the Node.js Client Implementation for programmatic access
- Check out Advanced Configuration for performance tuning

## Troubleshooting

If you encounter issues:

- Verify that Ollama is running and accessible
- Check the server logs for error messages
- Ensure your client credentials are correct
- See our Troubleshooting Guide for common issues

## Getting Help

If you need further assistance, please [open an issue](https://github.com/monkeyscanjump/ws-system/issues) on our GitHub repository.
