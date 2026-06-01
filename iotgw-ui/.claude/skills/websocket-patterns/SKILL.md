---
name: websocket-patterns
description: This skill provides guidance for implementing WebSocket communication patterns for real-time features. Use when building real-time updates, live data feeds, or bidirectional communication.
---

# WebSocket Patterns

Real-time bidirectional communication between client and server.

## Server-Side (Fastify)

### Basic WebSocket Setup

```typescript
import Fastify from "fastify";
import websocket from "@fastify/websocket";

const server = Fastify({ logger: true });

await server.register(websocket, {
  options: {
    maxPayload: 1048576, // 1MB
    clientTracking: true,
  },
});

// WebSocket route
server.get("/ws", { websocket: true }, (socket, request) => {
  request.log.info("Client connected");

  socket.on("message", (message) => {
    const data = JSON.parse(message.toString());
    request.log.info({ data }, "Received message");

    // Echo back
    socket.send(JSON.stringify({ type: "echo", data }));
  });

  socket.on("close", () => {
    request.log.info("Client disconnected");
  });

  socket.on("error", (error) => {
    request.log.error({ error }, "WebSocket error");
  });
});
```

### Connection Management

```typescript
interface Client {
  id: string;
  socket: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
}

class ConnectionManager {
  private clients = new Map<string, Client>();

  add(socket: WebSocket, userId?: string): string {
    const id = crypto.randomUUID();
    this.clients.set(id, {
      id,
      socket,
      userId,
      subscriptions: new Set(),
    });
    return id;
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  get(id: string): Client | undefined {
    return this.clients.get(id);
  }

  getByUserId(userId: string): Client[] {
    return Array.from(this.clients.values()).filter(
      (client) => client.userId === userId
    );
  }

  broadcast(message: object, filter?: (client: Client) => boolean): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (!filter || filter(client)) {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.send(payload);
        }
      }
    }
  }

  sendTo(clientId: string, message: object): boolean {
    const client = this.clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  subscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(channel);
    }
  }

  unsubscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.delete(channel);
    }
  }

  broadcastToChannel(channel: string, message: object): void {
    this.broadcast(message, (client) => client.subscriptions.has(channel));
  }
}

const connections = new ConnectionManager();
```

### Message Protocol

```typescript
// Message types
interface BaseMessage {
  type: string;
  id?: string; // For request-response correlation
}

interface SubscribeMessage extends BaseMessage {
  type: "subscribe";
  channel: string;
}

interface UnsubscribeMessage extends BaseMessage {
  type: "unsubscribe";
  channel: string;
}

interface DataMessage extends BaseMessage {
  type: "data";
  channel: string;
  payload: unknown;
}

interface ErrorMessage extends BaseMessage {
  type: "error";
  code: string;
  message: string;
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage;
type ServerMessage = DataMessage | ErrorMessage;

// Message handler
function handleMessage(clientId: string, raw: string): void {
  try {
    const message = JSON.parse(raw) as ClientMessage;

    switch (message.type) {
      case "subscribe":
        connections.subscribe(clientId, message.channel);
        connections.sendTo(clientId, {
          type: "subscribed",
          channel: message.channel,
          id: message.id,
        });
        break;

      case "unsubscribe":
        connections.unsubscribe(clientId, message.channel);
        connections.sendTo(clientId, {
          type: "unsubscribed",
          channel: message.channel,
          id: message.id,
        });
        break;

      default:
        connections.sendTo(clientId, {
          type: "error",
          code: "UNKNOWN_MESSAGE_TYPE",
          message: `Unknown message type: ${(message as BaseMessage).type}`,
        });
    }
  } catch (error) {
    connections.sendTo(clientId, {
      type: "error",
      code: "INVALID_MESSAGE",
      message: "Failed to parse message",
    });
  }
}
```

### Heartbeat/Ping-Pong

```typescript
server.get("/ws", { websocket: true }, (socket, request) => {
  const clientId = connections.add(socket);
  let isAlive = true;

  // Ping interval
  const pingInterval = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      return;
    }
    isAlive = false;
    socket.ping();
  }, 30000);

  socket.on("pong", () => {
    isAlive = true;
  });

  socket.on("close", () => {
    clearInterval(pingInterval);
    connections.remove(clientId);
  });
});
```

## Client-Side (React)

### useWebSocket Hook

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  send: (data: unknown) => void;
  isConnected: boolean;
  reconnect: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnect = true,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch {
        onMessage?.(event.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      onClose?.();

      if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, reconnectInterval);
      }
    };

    ws.onerror = (error) => {
      onError?.(error);
    };

    wsRef.current = ws;
  }, [url, onMessage, onOpen, onClose, onError, reconnect, reconnectInterval, maxReconnectAttempts]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const manualReconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    wsRef.current?.close();
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { send, isConnected, reconnect: manualReconnect };
}
```

### Subscription Hook

```typescript
interface UseSubscriptionOptions<T> {
  channel: string;
  onData: (data: T) => void;
}

export function useSubscription<T>({ channel, onData }: UseSubscriptionOptions<T>) {
  const { send, isConnected } = useWebSocket({
    url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`,
    onMessage: (message) => {
      const msg = message as { type: string; channel: string; payload: T };
      if (msg.type === "data" && msg.channel === channel) {
        onData(msg.payload);
      }
    },
  });

  useEffect(() => {
    if (isConnected) {
      send({ type: "subscribe", channel });

      return () => {
        send({ type: "unsubscribe", channel });
      };
    }
  }, [isConnected, channel, send]);

  return { isConnected };
}
```

### Usage Example

```tsx
function DeviceStatus({ deviceId }: { deviceId: string }) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);

  const { isConnected } = useSubscription<DeviceStatus>({
    channel: `device:${deviceId}`,
    onData: setStatus,
  });

  return (
    <div>
      <span className={isConnected ? "text-green-500" : "text-red-500"}>
        {isConnected ? "Connected" : "Disconnected"}
      </span>
      {status && (
        <div>
          <p>Status: {status.online ? "Online" : "Offline"}</p>
          <p>Last seen: {status.lastSeen}</p>
        </div>
      )}
    </div>
  );
}
```

## Integration with Supabase Realtime

```typescript
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useRealtimeDevices(onUpdate: (device: Device) => void) {
  useEffect(() => {
    const channel = supabase
      .channel("devices-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            onUpdate(payload.new as Device);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}
```

## Best Practices

1. **Use JSON protocol** - Structured messages with type field
2. **Implement heartbeat** - Detect dead connections
3. **Auto-reconnect** - Handle network interruptions
4. **Subscription model** - Client subscribes to channels
5. **Error handling** - Send error messages back to client
6. **Connection cleanup** - Remove clients on disconnect
7. **Rate limiting** - Prevent message flooding
8. **Authentication** - Verify token on connection

## Message Queue Pattern

```typescript
// For handling offline/reconnection scenarios
class MessageQueue {
  private queue: unknown[] = [];
  private maxSize = 100;

  enqueue(message: unknown): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift(); // Remove oldest
    }
    this.queue.push(message);
  }

  flush(): unknown[] {
    const messages = [...this.queue];
    this.queue = [];
    return messages;
  }
}

// Usage in hook
const queueRef = useRef(new MessageQueue());

const send = useCallback((data: unknown) => {
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify(data));
  } else {
    queueRef.current.enqueue(data);
  }
}, []);

// On reconnect, flush queue
ws.onopen = () => {
  const pending = queueRef.current.flush();
  pending.forEach((msg) => ws.send(JSON.stringify(msg)));
};
```
