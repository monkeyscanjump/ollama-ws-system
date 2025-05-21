/**
 * Core types for CLI system
 */
import { Interface as ReadlineInterface } from 'readline';

/**
 * Command handler function that processes CLI arguments
 */
export interface CommandHandler {
  (args: string[], rl?: ReadlineInterface): Promise<any>;
}

/**
 * Command definition with metadata and handler
 */
export interface Command {
  handler: CommandHandler;
  description: string;
  usage: string;
}

/**
 * Registry of available commands
 */
export type CommandRegistry = Record<string, Command>;

/**
 * Client definition for the authentication system
 */
export interface AuthorizedClient {
  id: string;
  name: string;
  publicKey: string;
  signatureAlgorithm?: string;
  createdAt: string;
  lastConnected?: string;
  lastIP?: string;
  tags?: string[];
  allowedIPs?: string[];
}

/**
 * Base service interface for pluggable services
 */
export interface Service {
  id: string;
  name: string;
  description: string;
  envVars: string[];

  // Methods
  getDefaultValue(variableName: string): string;
  getVariableDescription(variableName: string): string[] | null;
  configure(rl: ReadlineInterface, existingConfig?: Record<string, string>): Promise<Record<string, string>>;
  getInstructions(config: Record<string, string>): string[];
  parseCliConfig?(flags: Record<string, any>): Record<string, string> | null;
  getCliFlags?(): Record<string, { description: string, default?: string }>;
}

/**
 * Variable definition for environment template
 */
export interface EnvVariable {
  name: string;
  description: string | string[];
  default: string;
  prompt: string;
  options?: string[];
  validate?: (value: string) => true | string;
}

/**
 * Section of environment variables
 */
export interface EnvSection {
  id: string;
  title: string;
  description: string;
  variables: EnvVariable[];
}

/**
 * Environment template structure
 */
export interface EnvTemplate {
  sections: EnvSection[];
}

/**
 * CLI utility types
 */
export interface CommandOption {
  name: string;
  description: string;
  default?: string | number | boolean;
}

export interface CommandHelp {
  title: string;
  command: string;
  options: CommandOption[];
  description: string | string[];
  examples: string[];
}

/**
 * Backup metadata structure
 */
export interface BackupMetadata {
  timestamp: string;
  sourceFile: string;
  backupFile: string;
  clientCount: number;
  contentHash: string;
  id: string;
}
