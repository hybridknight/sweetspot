import WebSocket from "ws";
import { bounded, checkAbort, SignInError } from "./async";

/** An owned browser connection. No endpoint or protocol payload escapes this module. */
export class CdpConnection {
  private serial = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new SignInError("browser"));
        else pending.resolve(message.result);
      } catch {
        this.close();
      }
    });
    socket.on("error", () => this.close());
    socket.on("close", () => this.rejectPending());
  }
  static async connect(endpoint: string, signal: AbortSignal): Promise<CdpConnection> {
    checkAbort(signal);
    const url = new URL(endpoint);
    if (
      url.protocol !== "ws:" ||
      url.hostname !== "127.0.0.1" ||
      !/^\/devtools\/browser\/[a-z0-9-]+$/i.test(url.pathname)
    )
      throw new SignInError("browser");
    const socket = new WebSocket(endpoint, {
      handshakeTimeout: 5000,
      maxPayload: 8 * 1024 * 1024,
      perMessageDeflate: false,
    });
    const connection = new CdpConnection(socket);
    try {
      await bounded(
        new Promise<void>((resolve, reject) => {
          socket.once("open", resolve);
          socket.once("error", () => reject(new SignInError("browser")));
          socket.once("close", () => reject(new SignInError("browser")));
        }),
        signal,
        6000,
      );
      return connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }
  call<T = any>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (this.socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new SignInError("browser"));
    const id = ++this.serial;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SignInError("timeout"));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
        (error) => {
          if (error) {
            this.pending.delete(id);
            clearTimeout(timer);
            reject(new SignInError("browser"));
          }
        },
      );
    });
  }
  private rejectPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new SignInError("browser"));
    }
    this.pending.clear();
  }
  close() {
    this.rejectPending();
    this.socket.terminate();
  }
}
