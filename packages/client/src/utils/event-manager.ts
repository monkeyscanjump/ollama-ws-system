import { EventEmitter } from 'events';
import {
  ConnectionStatus,
  TokenEvent,
  GenerationStartEvent,
  GenerationEndEvent,
  ErrorObject,
  CONNECTION_STATUS,
  CONNECTION_EVENTS,
  DOMAIN_EVENTS
} from '@ws-system/shared';

export class EventManager {
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  emit(event: string, data: any): void {
    this.emitter.emit(event, data);
  }

  setupConnectionChangeHandler(
    callback: (status: ConnectionStatus) => void
  ): () => void {
    const handlers = new Map<string, () => void>([
      [CONNECTION_EVENTS.CONNECTED, () => callback(CONNECTION_STATUS.CONNECTED)],
      [CONNECTION_EVENTS.DISCONNECTED, () => callback(CONNECTION_STATUS.DISCONNECTED)],
      [CONNECTION_EVENTS.AUTHENTICATED, () => callback(CONNECTION_STATUS.AUTHENTICATED)],
      [CONNECTION_EVENTS.AUTH_FAILED, () => callback(CONNECTION_STATUS.AUTH_FAILED)],
      [CONNECTION_EVENTS.CONNECTING, () => callback(CONNECTION_STATUS.CONNECTING)],
      [CONNECTION_EVENTS.RECONNECTING, () => callback(CONNECTION_STATUS.RECONNECTING)],
      [CONNECTION_EVENTS.RECONNECT_FAILED, () => callback(CONNECTION_STATUS.RECONNECT_FAILED)]
    ]);

    // Register all handlers
    handlers.forEach((handler, event) => {
      this.emitter.on(event, handler);
    });

    // Return cleanup function
    return () => {
      handlers.forEach((handler, event) => {
        this.emitter.off(event, handler);
      });
    };
  }

  // Event subscriptions
  onToken(callback: (event: TokenEvent) => void): () => void {
    const handler = (event: TokenEvent) => callback(event);
    this.emitter.on(DOMAIN_EVENTS.TOKEN, handler);
    return () => this.emitter.off(DOMAIN_EVENTS.TOKEN, handler);
  }

  onGenerationStart(callback: (event: GenerationStartEvent) => void): () => void {
    const handler = (event: GenerationStartEvent) => callback(event);
    this.emitter.on(DOMAIN_EVENTS.GENERATION_START, handler);
    return () => this.emitter.off(DOMAIN_EVENTS.GENERATION_START, handler);
  }

  onGenerationEnd(callback: (event: GenerationEndEvent) => void): () => void {
    const handler = (event: GenerationEndEvent) => callback(event);
    this.emitter.on(DOMAIN_EVENTS.GENERATION_END, handler);
    return () => this.emitter.off(DOMAIN_EVENTS.GENERATION_END, handler);
  }

  onError(callback: (error: ErrorObject) => void): () => void {
    this.emitter.on(CONNECTION_EVENTS.ERROR, callback);
    return () => this.emitter.off(CONNECTION_EVENTS.ERROR, callback);
  }
}
