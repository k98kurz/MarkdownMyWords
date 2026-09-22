/**
 * Relay Socket Monitor
 *
 * Holster (2.2.1) exposes NO peer connection events and no public reconnect
 * API: its browser client creates peer WebSockets inside a closure in
 * node_modules/@mblaney/holster/src/wire.js and never surfaces them. The only
 * way to report the REAL relay connection state is to observe those sockets
 * directly, so this module wraps `window.WebSocket` before Holster is
 * constructed and tracks every socket whose URL matches a configured relay.
 *
 * Observation + reconnect mediation only: the wrapper delegates to the native
 * constructor and adds passive `onopen`/`onclose` handling, so Holster's
 * socket behavior is unchanged EXCEPT that Holster's close handler (which
 * schedules the retry) is invoked after a real exponential backoff. This is
 * necessary because wire.js's `start()` creates a new `createRetryHandler()`
 * on every attempt, so Holster's own `maxRetries`/backoff never apply and it
 * otherwise retries forever at ~1s.
 */

import type { RelayStatus } from '@/types/gun';

/** Base delay for reconnect backoff; doubles per consecutive failure. */
const BASE_RECONNECT_DELAY = 1000;
/** Cap for reconnect backoff. */
const MAX_RECONNECT_DELAY = 30000;

class RelaySocketMonitor {
  /** Native constructor to restore on uninstall; null when not installed. */
  private nativeWebSocket: typeof WebSocket | null = null;
  /** Relay URLs (ws:// format) we report on. */
  private configured = new Set<string>();
  /** Current socket Holster is using for each relay (replaced on reconnect). */
  private currentSockets = new Map<string, WebSocket>();
  /** Timestamp of the current open connection per relay. */
  private connectedAt = new Map<string, number>();
  /** Consecutive failed connection attempts per relay (reset on open). */
  private failures = new Map<string, number>();
  /** Incremented on every socket transition, so pollers can skip no-ops. */
  private revision = 0;

  /**
   * Start observing the relay sockets Holster creates. MUST be called before
   * `Gun()` constructs its peers, otherwise the initial sockets are missed.
   */
  install(relayUrls: string[]): void {
    if (this.nativeWebSocket) return;
    this.configured = new Set(relayUrls);

    const Native = window.WebSocket;
    this.nativeWebSocket = Native;

    const isRelay = this.configured.has.bind(this.configured);
    const register = this.register.bind(this);
    const handleOpen = this.handleOpen.bind(this);
    const handleClose = this.handleClose.bind(this);
    const reconnectDelay = this.reconnectDelay.bind(this);

    class TrackedWebSocket extends Native {
      private readonly relayUrl: string;
      private openHandler: ((this: WebSocket, ev: Event) => void) | null = null;
      private closeHandler:
        | ((this: WebSocket, ev: CloseEvent) => void)
        | null = null;

      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.relayUrl = String(url);
        if (isRelay(this.relayUrl)) {
          register(this, this.relayUrl);
        }
      }

      get onopen(): ((this: WebSocket, ev: Event) => void) | null {
        return this.openHandler;
      }

      set onopen(handler: ((this: WebSocket, ev: Event) => void) | null) {
        this.openHandler = handler;
        if (!isRelay(this.relayUrl)) {
          super.onopen = handler;
          return;
        }
        super.onopen = (ev: Event) => {
          handleOpen(this, this.relayUrl);
          if (handler) handler.call(this, ev);
        };
      }

      get onclose(): ((this: WebSocket, ev: CloseEvent) => void) | null {
        return this.closeHandler;
      }

      set onclose(handler: ((this: WebSocket, ev: CloseEvent) => void) | null) {
        this.closeHandler = handler;
        if (!isRelay(this.relayUrl)) {
          super.onclose = handler;
          return;
        }
        super.onclose = (ev: CloseEvent) => {
          handleClose(this, this.relayUrl);
          if (!handler) return;
          // Holster's close handler is what schedules the retry, and its own
          // backoff never grows (fresh retry handler per attempt), so delay
          // invoking it to enforce a real exponential backoff.
          const delay = reconnectDelay(this.relayUrl);
          if (delay > 0) {
            window.setTimeout(() => handler.call(this, ev), delay);
          } else {
            handler.call(this, ev);
          }
        };
      }
    }

    window.WebSocket = TrackedWebSocket;
  }

  /** Restore the native constructor and drop all observed state. */
  uninstall(): void {
    if (!this.nativeWebSocket) return;
    window.WebSocket = this.nativeWebSocket;
    this.nativeWebSocket = null;
    this.configured.clear();
    this.currentSockets.clear();
    this.connectedAt.clear();
    this.failures.clear();
  }

  private register(socket: WebSocket, url: string): void {
    this.currentSockets.set(url, socket);
    this.bump();
  }

  private handleOpen(socket: WebSocket, url: string): void {
    if (this.currentSockets.get(url) !== socket) return;
    this.connectedAt.set(url, Date.now());
    this.failures.delete(url);
    this.bump();
  }

  private handleClose(socket: WebSocket, url: string): void {
    if (this.currentSockets.get(url) !== socket) return;
    this.connectedAt.delete(url);
    this.failures.set(url, (this.failures.get(url) ?? 0) + 1);
    this.bump();
  }

  /**
   * Delay before letting Holster schedule its next attempt. The first retry
   * uses Holster's own ~1s; each subsequent consecutive failure doubles up to
   * the cap. Resets to 0 when a connection opens.
   */
  private reconnectDelay(url: string): number {
    const failures = this.failures.get(url) ?? 0;
    if (failures <= 1) return 0;
    return Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, failures - 2),
      MAX_RECONNECT_DELAY
    );
  }

  private bump(): void {
    this.revision++;
  }

  private statusFor(url: string): RelayStatus {
    const socket = this.currentSockets.get(url);
    if (!socket) return 'init';
    if (socket.readyState === WebSocket.OPEN) return 'connected';
    if (socket.readyState === WebSocket.CONNECTING) return 'connecting';
    return 'disconnected';
  }

  /** Monotonic counter; changes whenever any relay status changes. */
  getRevision(): number {
    return this.revision;
  }

  /** Fresh snapshot of every configured relay's status. */
  getRelayStatuses(): Map<string, RelayStatus> {
    return new Map(
      [...this.configured].map(url => [url, this.statusFor(url)])
    );
  }

  /** Time the current relay connection opened, if connected. */
  getPeerConnectionTime(url: string): number | undefined {
    return this.connectedAt.get(url);
  }

  getConnectionState(): 'connected' | 'connecting' | 'disconnected' {
    const statuses = [...this.configured].map(url => this.statusFor(url));
    if (statuses.some(status => status === 'connected')) return 'connected';
    if (statuses.some(status => status === 'connecting' || status === 'init')) {
      return 'connecting';
    }
    return 'disconnected';
  }
}

export const relayMonitor = new RelaySocketMonitor();
