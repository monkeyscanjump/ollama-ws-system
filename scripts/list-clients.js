#!/usr/bin/env node
/**
 * Client Listing Tool
 *
 * Lists all registered clients with the Ollama WebSocket server.
 * Can display basic or detailed information about each client.
 */
const fs = require('fs');
const path = require('path');
const { loadJson } = require('./utils/fs');
const { generateKeyFingerprint } = require('./utils/crypto');
const { parseArgs } = require('./utils/cli');
const { dirs, files } = require('./utils/config');

// Parse command line arguments
const args = process.argv.slice(2);
const cli = parseArgs(args, {
  defaults: {
    'clients-file': files.clients
  }
});

/**
 * Format date string for display
 *
 * @param {string} dateString - ISO date string to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Format size of key for display
 *
 * @param {string} key - PEM-encoded key
 * @returns {number} Approximate size of the key in bytes
 */
function formatKeySize(key) {
  const lines = key.split('\n').filter(line => !line.includes('BEGIN') && !line.includes('END'));
  const base64Length = lines.join('').length;
  return Math.floor(base64Length * 0.75);  // Approximate size of decoded base64
}

/**
 * Print client details in a formatted way
 *
 * @param {Object} client - Client object
 * @param {boolean} detailed - Whether to include detailed information
 */
function printClientDetails(client, detailed = false) {
  console.log(`\n${client.name} (ID: ${client.id})`);
  console.log(`  Created: ${formatDate(client.createdAt)}`);
  console.log(`  Last connected: ${formatDate(client.lastConnected)}`);

  if (client.signatureAlgorithm) {
    console.log(`  Signature algorithm: ${client.signatureAlgorithm}`);
  }

  if (detailed) {
    const keySize = formatKeySize(client.publicKey);
    console.log(`  Public key: ${keySize} bytes`);
    console.log(`  Key fingerprint: ${generateKeyFingerprint(client.publicKey)}`);

    if (client.lastIP) {
      console.log(`  Last IP: ${client.lastIP}`);
    }
  }
}

/**
 * List all registered clients
 *
 * @param {string} clientsFile - Path to the clients JSON file
 * @param {boolean} detailed - Whether to show detailed information
 */
function listClients(clientsFile, detailed = false) {
  try {
    // Load clients database
    const clients = loadJson(clientsFile);

    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      console.log('No clients registered yet.');
      console.log(`Expected clients file at: ${clientsFile}`);
      return;
    }

    console.log(`\n=== Authorized Clients (${clients.length}) ===`);

    // Sort by creation date (newest first)
    clients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Print each client
    clients.forEach(client => {
      printClientDetails(client, detailed);
    });

    console.log('\n');
  } catch (error) {
    console.error(`Error listing clients: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function to run the client listing process
 */
function main() {
  // Show help if requested
  if (cli.help) {
    console.log('Usage: node list-clients.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --clients-file <file>  Path to clients database file');
    console.log('  --detailed, -d         Show detailed information including key fingerprints');
    console.log('  --help, -h             Show this help message');
    console.log('');
    console.log('Example:');
    console.log('  node list-clients.js --detailed');
    console.log('  node list-clients.js --clients-file ./custom/path/clients.json');
    process.exit(0);
  }

  // Get client file path and detailed flag
  const clientsFile = cli.flags['clients-file'];
  const detailed = cli.flags['detailed'] || cli.flags['d'] || false;

  console.log('=== Client Listing Tool ===');
  console.log(`Clients database: ${clientsFile}`);
  console.log(`Detailed view: ${detailed ? 'Yes' : 'No'}`);
  console.log('');

  // Run the listing
  listClients(clientsFile, detailed);
}

// Execute the script
main();
