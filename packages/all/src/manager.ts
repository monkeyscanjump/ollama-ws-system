#!/usr/bin/env node

// This is just a proxy to the CLI manager
import { run } from '@ws-system/cli/dist/manager';

// Set the project root to the current directory
process.env.WS_PROJECT_ROOT = process.cwd();

// Run the CLI manager
run();
