import fs from 'fs';
import path from 'path';
import { ClientOptions } from '../types';
import { CLIENT } from '../constants';
import { createLogger } from '../../utils';

const logger = createLogger('client:config');

export class ConfigManager {
  readonly serverUrl: string;
  readonly clientId: string;
  readonly privateKey: string;
  readonly signatureAlgorithm: string;
  autoReconnect: boolean;
  reconnectDelay: number;
  readonly pingIntervalMs: number;
  readonly requestTimeout: number;
  readonly autoConnect: boolean;

  constructor(options: ClientOptions) {
    this.serverUrl = options.serverUrl;
    this.clientId = options.clientId;
    this.signatureAlgorithm = options.signatureAlgorithm || CLIENT.DEFAULT_SIGNATURE_ALGORITHM;
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectDelay = options.reconnectDelay || CLIENT.DEFAULT_RECONNECT_DELAY;
    this.pingIntervalMs = options.pingInterval || CLIENT.DEFAULT_PING_INTERVAL;
    this.requestTimeout = options.requestTimeout || CLIENT.DEFAULT_REQUEST_TIMEOUT;
    this.autoConnect = options.autoConnect || false;
    this.privateKey = this.loadPrivateKey(options.privateKeyPath);
  }

  private loadPrivateKey(keyPath: string): string {
    try {
      const resolvedPath = path.isAbsolute(keyPath)
        ? keyPath
        : path.resolve(process.cwd(), keyPath);

      logger.debug(`Loading private key from: ${resolvedPath}`);
      return fs.readFileSync(resolvedPath, 'utf8');
    } catch (err) {
      logger.error(`Failed to read private key: ${(err as Error).message}`);
      throw new Error(`Failed to read private key file: ${(err as Error).message}`);
    }
  }

  updateReconnectSettings(autoReconnect?: boolean, delay?: number): void {
    if (autoReconnect !== undefined) {
      this.autoReconnect = autoReconnect;
    }
    if (delay !== undefined) {
      this.reconnectDelay = delay;
    }
  }
}
