# Ollama WebSocket System

A secure gateway for Ollama language models that adds authentication, access control, and real-time streaming capabilities.

![System Architecture](docs/architecture.svg)

## Table of Contents

- [Ollama WebSocket System](#ollama-websocket-system)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Features](#features)
  - [Documentation](#documentation)
  - [Quick Start](#quick-start)
    - [Prerequisites](#prerequisites)
    - [Standard Installation](#standard-installation)
    - [Docker Installation](#docker-installation)
  - [Configuration Overview](#configuration-overview)
  - [Basic Usage](#basic-usage)
    - [Setting Up a Client](#setting-up-a-client)
    - [Using the Web Interface](#using-the-web-interface)
    - [Client Libraries](#client-libraries)
  - [Development](#development)
  - [License](#license)

## Overview

Ollama WebSocket System serves as a secure intermediary between clients and an Ollama language model server. It solves several critical problems:

1. **Security**: Ollama itself has no built-in authentication, making it vulnerable when exposed publicly
2. **Access Control**: The system lets you manage which clients can access your models
3. **Real-time Delivery**: Streams generated text to clients as it's created, token by token
4. **Cross-platform Support**: Enables any WebSocket-capable platform to interact with Ollama

For a detailed introduction, see our [Getting Started Guide](docs/getting-started.md).

## Features

- **Public-Key Authentication**: Client authentication using the same proven approach as SSH
- **Real-time Text Streaming**: Delivers model outputs as they're generated
- **Client Management Tools**: Easy-to-use utilities for adding, listing, and revoking clients
- **Rate Limiting**: Built-in protection against brute force attacks
- **Multiple Model Support**: Connect to any model available on your Ollama server
- **Docker Integration**: Run standalone or with Docker/Docker Compose
- **Cross-Platform Compatibility**: Connect from browsers, Node.js, Python, or any WebSocket-capable client

Our [Security Model](docs/security-model.md) documentation explains the authentication system in detail.

## Documentation

We provide comprehensive documentation to help you get started, implement clients, and understand the system:

- [Getting Started Guide](docs/getting-started.md) - First steps for new users
- [API Reference](docs/api-reference.md) - Complete WebSocket and REST API details
- [Security Model](docs/security-model.md) - In-depth explanation of the authentication system
- **Client Implementations**:
  - [Node.js Client](docs/nodejs-client.md) - How to build Node.js clients
  - [Python Client](docs/python-client.md) - How to build Python clients
  - [Browser Client](docs/browser-client.md) - How to build web clients
- [Docker Configuration](docs/docker-configuration.md) - Docker setup and customization
- [Troubleshooting Guide](docs/troubleshooting.md) - Solutions for common issues

## Quick Start

### Prerequisites

- Node.js 16.0.0 or higher
- npm 7.0.0 or higher
- Ollama installed and running (locally or remotely)

### Standard Installation

```bash
# Clone the repository
git clone https://github.com/monkeyscanjump/ollama-ws-system.git
cd ollama-ws-system

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Run the setup script to create directories and an admin client
npm run setup

# Start the server
npm start
```

### Docker Installation

```bash
# Clone the repository
git clone https://github.com/monkeyscanjump/ollama-ws-system.git
cd ollama-ws-system

# Build the Docker image
npm run docker:build

# Start the stack with Docker Compose
npm run docker:start

# View logs
npm run docker:logs
```

The Docker setup includes the WebSocket server, an Ollama container, and persistent volumes. See our Docker Configuration Guide for detailed options.

## Configuration Overview

Configuration is handled via environment variables or a .env file. Key settings include:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | WebSocket server port | `3000` |
| `OLLAMA_API_URL` | URL to the Ollama API | `http://localhost:11434` |
| `OLLAMA_DEFAULT_MODEL` | Default model if not specified | `llama2` |

For a complete list of configuration options, see our Getting Started Guide.

## Basic Usage

### Setting Up a Client

```bash
# Generate a key pair
npm run generate-keys -- my-client

# Register with the server
npm run register-client -- http://localhost:3000 my-client ./keys/my-client_key.pub
```

For full client management details, see our Getting Started Guide.

### Using the Web Interface

The simplest way to test your connection:

1. Open your browser to `http://localhost:3000`
2. Enter your Client ID and private key
3. Click "Connect"
4. Once connected, send prompts to your models

### Client Libraries

We provide detailed implementation guides for building clients:

- Node.js Client Implementation
- Python Client Implementation
- Browser Client Implementation

## Development

To set up a development environment:

```bash
# Install dependencies
npm install

# Start in development mode (with auto-reload)
npm run dev
```

For running tests:

```bash
# Run all tests
npm test

# Generate test coverage report
npm run test:coverage
```

## License

MIT
