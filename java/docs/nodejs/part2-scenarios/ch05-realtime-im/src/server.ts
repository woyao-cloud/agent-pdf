import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { RedisAdapter } from './redis-adapter.js';
import type { Message, AckMessage } from './types.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);

// Track connections per user: userId -> Set<WebSocket>
const userConnections = new Map<string, Set<WebSocket>>();

function addConnection(userId: string, ws: WebSocket): void {
  let connections = userConnections.get(userId);
  if (!connections) {
    connections = new Set();
    userConnections.set(userId, connections);
  }
  connections.add(ws);
}

function removeConnection(userId: string, ws: WebSocket): void {
  const connections = userConnections.get(userId);
  if (!connections) return;
  connections.delete(ws);
  if (connections.size === 0) {
    userConnections.delete(userId);
  }
}

function deliverLocal(userId: string, data: string): void {
  const connections = userConnections.get(userId);
  if (!connections) return;
  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function sendAck(ws: WebSocket, messageId: string, status: AckMessage['status']): void {
  const ack: AckMessage = {
    messageId,
    status,
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(ack));
}

export async function createServer() {
  const redis = new RedisAdapter();

  // Subscribe to cross-node message channel
  await redis.subscribe('chat:messages', (_channel, raw) => {
    // Relay to local clients of the target user
    try {
      const msg: Message = JSON.parse(raw);
      deliverLocal(msg.to, raw);
    } catch {
      // ignore malformed messages
    }
  });

  const wss = new WebSocketServer({ port: PORT });

  wss.on('connection', (ws, req) => {
    // Parse userId from URL query param, e.g. ws://host:8080?userId=alice
    const parsedUrl = parse(req.url ?? '', true);
    const userId = parsedUrl.query.userId as string | undefined;

    if (!userId) {
      ws.close(4001, 'userId query parameter is required');
      return;
    }

    addConnection(userId, ws);

    ws.on('message', async (raw) => {
      let msg: Message;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }

      // Ensure message has an id
      if (!msg.id) {
        msg.id = uuidv4();
      }
      if (!msg.timestamp) {
        msg.timestamp = Date.now();
      }

      try {
        // Persist to Redis
        await redis.persistMessage(msg.from, msg);
        await redis.persistMessage(msg.to, msg);

        // Send ACK back to sender
        sendAck(ws, msg.id, 'received');

        // Publish to Redis Pub/Sub for cross-node delivery
        const serialized = JSON.stringify(msg);
        await redis.publish('chat:messages', serialized);

        // Also deliver locally if target is on this node
        deliverLocal(msg.to, serialized);
      } catch (err) {
        sendAck(ws, msg.id, 'failed');
        console.error('Failed to process message:', err);
      }
    });

    ws.on('close', () => {
      removeConnection(userId, ws);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for user ${userId}:`, err);
      removeConnection(userId, ws);
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down…');
    wss.close();
    await redis.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`IM server listening on port ${PORT}`);

  return { wss, redis, userConnections };
}

// Allow running directly or importing for testing
const isMain = process.argv[1]?.endsWith('server.ts');
if (isMain) {
  createServer().catch(console.error);
}