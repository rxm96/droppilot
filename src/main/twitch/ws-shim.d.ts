declare module "ws" {
  export type RawData = string | ArrayBuffer | ArrayBufferView | Uint8Array | Uint8Array[];

  export class WebSocket {
    static readonly OPEN: number;
    readyState: number;

    constructor(url: string);

    on(event: string, listener: (...args: unknown[]) => void): this;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }

  export class WebSocketServer {
    constructor(options?: { host?: string; port?: number });

    once(event: "listening", listener: () => void): this;
    address(): string | { port: number } | null;
    close(callback?: (err?: Error) => void): void;
  }

  export default WebSocket;
}
