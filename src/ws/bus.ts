import type { ServerWebSocket } from "bun";
import { EventType, type EventMessage } from "./events";

type Listener = (event: EventMessage) => void;

class EventBus {
  private userClients = new Map<string, Set<ServerWebSocket<unknown>>>();
  private clientToUser = new Map<ServerWebSocket<unknown>, string>();
  private sessionToClient = new Map<string, ServerWebSocket<unknown>>();
  private clientToSession = new Map<ServerWebSocket<unknown>, string>();
  private listeners = new Map<EventType, Set<Listener>>();

  addClient(ws: ServerWebSocket<unknown>, userId: string, sessionId?: string): void {
    // If a session ID is provided, evict any existing socket for the same session
    // This prevents duplicate registrations from reconnects / race conditions
    if (sessionId) {
      const existing = this.sessionToClient.get(sessionId);
      if (existing && existing !== ws) {
        console.log(`[EventBus] Evicting stale socket for session ${sessionId}`);
        this.removeClient(existing);
        try { existing.close(1000, "Replaced by new connection"); } catch { /* already closed */ }
      }
      this.sessionToClient.set(sessionId, ws);
      this.clientToSession.set(ws, sessionId);
    }

    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId)!.add(ws);
    this.clientToUser.set(ws, userId);
  }

  removeClient(ws: ServerWebSocket<unknown>): void {
    const userId = this.clientToUser.get(ws);
    if (userId) {
      const userSet = this.userClients.get(userId);
      if (userSet) {
        userSet.delete(ws);
        if (userSet.size === 0) this.userClients.delete(userId);
      }
      this.clientToUser.delete(ws);
    }
    const sessionId = this.clientToSession.get(ws);
    if (sessionId) {
      // Only remove from session map if this socket is still the current one
      if (this.sessionToClient.get(sessionId) === ws) {
        this.sessionToClient.delete(sessionId);
      }
      this.clientToSession.delete(ws);
    }
  }

  on(event: EventType, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit(event: EventType, payload: any = {}, userId?: string): void {
    const message: EventMessage = {
      event,
      payload,
      timestamp: Date.now(),
      userId,
    };

    const json = JSON.stringify(message);

    if (userId) {
      // Broadcast only to the specified user's connections
      const userSet = this.userClients.get(userId);
      if (!userSet || userSet.size === 0) {
        if (event !== EventType.SETTINGS_UPDATED) {
          console.warn(`[EventBus] No WS clients for user ${userId} — ${event} not delivered`);
        }
      } else {
        for (const ws of userSet) {
          try {
            ws.send(json);
          } catch {
            this.removeClient(ws);
          }
        }
      }
    } else {
      // Broadcast to all connected WebSocket clients (system events)
      for (const [ws] of this.clientToUser) {
        try {
          ws.send(json);
        } catch {
          this.removeClient(ws);
        }
      }
    }

    // Fire in-process listeners
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(message);
        } catch (err) {
          console.error(`Event listener error for ${event}:`, err);
        }
      }
    }
  }

  get clientCount(): number {
    return this.clientToUser.size;
  }
}

export const eventBus = new EventBus();
