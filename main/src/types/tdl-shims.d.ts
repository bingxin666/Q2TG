declare module 'tdl' {
  import { EventEmitter } from 'events';

  export interface ConfigureOptions {
    tdjson?: string;
    libdir?: string;
    verbosityLevel?: number;
    useOldTdjsonInterface?: boolean;
    receiveTimeout?: number;
  }

  export interface ClientOptions {
    apiId: number;
    apiHash: string;
    databaseDirectory?: string;
    filesDirectory?: string;
    databaseEncryptionKey?: string;
    useTestDc?: boolean;
    tdlibParameters?: Record<string, unknown>;
    skipOldUpdates?: boolean;
  }

  export interface Client extends EventEmitter {
    loginAsBot(token: string | (() => string | Promise<string>)): Promise<void>;
    close(): Promise<void>;
    invoke<T = unknown>(query: Record<string, unknown>): Promise<T>;
  }

  export function configure(options: ConfigureOptions): void;
  export function createClient(options: ClientOptions): Client;
}

declare module 'prebuilt-tdlib' {
  export function getTdjson(): string;
}
