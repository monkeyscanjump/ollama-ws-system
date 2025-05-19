# Docker Configuration Guide

This guide provides detailed information about running the Ollama WebSocket System using Docker and Docker Compose, including configuration options, volume management, and advanced deployment scenarios.

## Table of Contents

- [Docker Configuration Guide](#docker-configuration-guide)
  - [Table of Contents](#table-of-contents)
  - [Docker Overview](#docker-overview)
  - [Prerequisites](#prerequisites)
  - [Basic Docker Setup](#basic-docker-setup)
    - [Building the Docker Image](#building-the-docker-image)
    - [Starting the Container Stack](#starting-the-container-stack)
    - [Viewing Logs](#viewing-logs)
    - [Stopping the Containers](#stopping-the-containers)
  - [Docker Compose Configuration](#docker-compose-configuration)
    - [Default Configuration](#default-configuration)
    - [Configuration Options](#configuration-options)
    - [Volume Management](#volume-management)
  - [Using External Ollama Server](#using-external-ollama-server)
  - [Environment Variables](#environment-variables)
  - [Docker Network Configuration](#docker-network-configuration)
  - [Production Deployment](#production-deployment)
    - [Security Considerations](#security-considerations)
    - [Reverse Proxy Integration](#reverse-proxy-integration)
    - [Health Checks](#health-checks)
  - [Troubleshooting Docker Deployments](#troubleshooting-docker-deployments)
  - [Advanced Docker Usage](#advanced-docker-usage)
    - [Docker Secrets](#docker-secrets)
    - [Resource Limits](#resource-limits)
    - [Multi-Container Architecture](#multi-container-architecture)

## Docker Overview

The Ollama WebSocket System can be run as a containerized application using Docker, which offers several advantages:

- **Isolation**: Run the application in a consistent environment regardless of host setup
- **Portability**: Easily deploy on any system that supports Docker
- **Easy Setup**: Bundled with Ollama in a ready-to-use configuration
- **Resource Management**: Control CPU, memory, and GPU access
- **Version Control**: Easily switch between different versions of the system

The Docker setup includes two main containers:

1. **WebSocket Server**: The primary application that handles clients and authentication
2. **Ollama Server**: The language model server that processes generation requests

## Prerequisites

Before proceeding, ensure you have:

- Docker Engine (version 20.10.0 or higher)
- Docker Compose (version 2.0.0 or higher)
- At least 8GB of RAM for running models
- At least 10GB of free disk space
- Internet access for pulling images and models

For GPU support, you'll additionally need:

- NVIDIA GPU with CUDA support
- NVIDIA Container Toolkit (nvidia-docker2)

## Basic Docker Setup

### Building the Docker Image

The WebSocket server image can be built using the included Dockerfile:

```bash
# From the project directory
docker build -t ws-system .

# Or using npm script
npm run docker:build
```

This builds an image containing the WebSocket server. The Ollama image is pulled directly from Docker Hub.

### Starting the Container Stack

Start both containers using Docker Compose:

```bash
# Start in detached mode
docker-compose up -d

# Or using npm script
npm run docker:start
```

This starts both the WebSocket server and Ollama containers, creating the necessary volumes and network.

### Viewing Logs

To view logs from both containers:

```bash
# View all logs
docker-compose logs

# Follow log output
docker-compose logs -f

# View logs for a specific service
docker-compose logs -f websocket-server
docker-compose logs -f ollama

# Or using npm script
npm run docker:logs
```

### Stopping the Containers

To stop and remove the containers:

```bash
# Stop containers
docker-compose down

# Stop containers and remove volumes
docker-compose down -v

# Or using npm script
npm run docker:stop
```

## Docker Compose Configuration

### Default Configuration

The default docker-compose.yml file includes:

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "11434:11434"
    networks:
      - ollama_internal
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  websocket-server:
    image: ws-system:latest
    container_name: ws-system
    depends_on:
      - ollama
    volumes:
      - ./data:/app/data
      - ./keys:/app/keys
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - OLLAMA_API_URL=http://ollama:11434
    networks:
      - ollama_internal
    restart: unless-stopped

volumes:
  ollama_data:

networks:
  ollama_internal:
    driver: bridge
```

### Configuration Options

You can customize the Docker setup by editing the docker-compose.yml file:

- **Ports**: Change the exposed ports (e.g., `-"8080:3000"` to expose on port 8080)
- **Volumes**: Map additional volumes for data persistence
- **Environment Variables**: Set configuration options (see Environment Variables)
- **Restart Policy**: Configure container restart behavior
- **Resource Limits**: Add memory and CPU constraints

### Volume Management

The Docker setup uses the following volumes:

1. **ollama_data**: Stores Ollama models and configuration
   - Managed by Docker, persists between restarts
   - Contains downloaded model files (potentially large)

2. **./data**: Mounts to /app/data in the container
   - Contains client database and settings
   - Backup this directory to preserve client registrations

3. **./keys**: Mounts to /app/keys in the container
   - Contains key pairs and client configurations
   - Critical for client authentication

To back up Docker volumes:

```bash
# Backup the Ollama data volume
docker run --rm -v ollama_data:/source -v $(pwd):/backup alpine tar -czf /backup/ollama_data_backup.tar.gz -C /source .

# Restore the Ollama data volume
docker run --rm -v ollama_data:/target -v $(pwd):/backup alpine sh -c "rm -rf /target/* && tar -xzf /backup/ollama_data_backup.tar.gz -C /target"
```

For the direct mounts, simply back up the data and keys directories on the host.

## Using External Ollama Server

If you already have an Ollama server running elsewhere, you can configure the WebSocket server to use it:

1. Edit docker-compose.yml to remove the Ollama service:

```yaml
version: '3.8'

services:
  websocket-server:
    image: ws-system:latest
    container_name: ws-system
    volumes:
      - ./data:/app/data
      - ./keys:/app/keys
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - OLLAMA_API_URL=http://your-ollama-server:11434
    restart: unless-stopped

volumes:
  data:
  keys:
```

2. Update the `OLLAMA_API_URL` environment variable to point to your external Ollama server
3. Start only the WebSocket server: `docker-compose up -d`

## Environment Variables

You can configure the Docker container using environment variables in the docker-compose.yml file:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port the WebSocket server listens on | `3000` |
| `HOST` | Host binding address | `0.0.0.0` |
| `OLLAMA_API_URL` | URL of the Ollama API server | `http://ollama:11434` |
| `OLLAMA_DEFAULT_MODEL` | Default model to use | `llama2` |
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` |
| `NODE_ENV` | Environment (development, production) | `production` |
| `AUTH_TIMEOUT_MS` | Authentication timeout in milliseconds | `30000` |
| `MAX_AUTH_ATTEMPTS` | Max auth attempts before rate limiting | `5` |
| `AUTH_WINDOW_MS` | Time window for auth attempts | `600000` |

Example of setting environment variables:

```yaml
environment:
  - PORT=8080
  - LOG_LEVEL=debug
  - OLLAMA_DEFAULT_MODEL=mistral
```

## Docker Network Configuration

By default, Docker Compose creates a bridge network (`ollama_internal`) that allows the WebSocket server and Ollama to communicate.

To use a custom network:

```yaml
networks:
  ollama_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

Then update both services to use this network:

```yaml
services:
  ollama:
    # ...other settings...
    networks:
      - ollama_network

  websocket-server:
    # ...other settings...
    networks:
      - ollama_network
```

## Production Deployment

### Security Considerations

For production deployments:

1. **Use a Reverse Proxy**: Place the WebSocket server behind Nginx or Traefik for TLS termination
2. **Set Access Controls**: Limit container access to necessary resources
3. **Use Proper Networking**: Isolate containers with appropriate network configuration
4. **Regular Updates**: Keep images updated with security patches
5. **Resource Limits**: Set appropriate CPU and memory limits

### Reverse Proxy Integration

Example Nginx configuration for proxying WebSocket connections:

```nginx
server {
    listen 443 ssl;
    server_name ws.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Health Checks

Add health checks to ensure services are running properly:

```yaml
services:
  websocket-server:
    # ...other settings...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  ollama:
    # ...other settings...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Troubleshooting Docker Deployments

Common issues and solutions:

1. **Container fails to start**:
   - Check logs: `docker-compose logs websocket-server`
   - Verify environment variables and volumes
   - Ensure ports are not already in use

2. **WebSocket server can't connect to Ollama**:
   - Check network configuration
   - Verify Ollama is running: `docker-compose ps`
   - Check Ollama logs: `docker-compose logs ollama`
   - Ensure `OLLAMA_API_URL` is correctly set

3. **Permissions issues with volumes**:
   - Ensure the host directories have appropriate permissions
   - Try using Docker managed volumes instead of directory mounts

4. **Performance issues**:
   - Check resource usage: `docker stats`
   - Adjust resource limits
   - Consider GPU acceleration for Ollama

5. **Model loading errors**:
   - Ensure Ollama has enough disk space for models
   - Check Ollama logs for downloading or loading errors

## Advanced Docker Usage

### Docker Secrets

For sensitive configuration like API keys, use Docker secrets:

1. Create a secrets file:

   ```bash
   echo "your-api-key" > api_key.secret
   ```

2. Update docker-compose.yml:

   ```yaml
   version: '3.8'

   services:
     websocket-server:
       # ...other settings...
       secrets:
         - api_key

   secrets:
     api_key:
       file: ./api_key.secret
   ```

3. Access in the container at `/run/secrets/api_key`

### Resource Limits

Control container resource usage:

```yaml
services:
  websocket-server:
    # ...other settings...
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  ollama:
    # ...other settings...
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### Multi-Container Architecture

For high-availability setups:

```yaml
version: '3.8'

services:
  ollama:
    # ...ollama settings...
    deploy:
      replicas: 1

  websocket-server:
    # ...websocket settings...
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first

  nginx:
    image: nginx:latest
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - websocket-server
```

This setup uses multiple WebSocket server instances behind Nginx for load balancing and high availability.

---

For more information about using Docker with the Ollama WebSocket System, see:

- Getting Started Guide
- Advanced Configuration
- Troubleshooting Guide
