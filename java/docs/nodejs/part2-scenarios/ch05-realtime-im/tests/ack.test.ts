import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { createServer } from '../src/server';

// Mock RedisAdapter to avoid requiring a real Redis instance in tests
jest.mock('../src/redis-adapter', () => {
  const RedisAdapter = jest.fn().mockImplementation(() => {
    const handlers = new Map<string, Array<(channel: string, message: string) => void>>();
    return {
      subscribe: jest.fn(async (channel: string, handler: (ch: string, msg: string) => void) => {
        const existing = handlers.get(channel) ?? [];
        existing.push(handler);
        handlers.set(channel, existing);
      }),
      publish: jest.fn(async () => {}),
      persistMessage: jest.fn(async () => {}),
      disconnect: jest.fn(async () => {}),
    };
  });
  return { RedisAdapter };
});

const PORT = 9081;
let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  process.env.PORT = String(PORT);
  server = await createServer();
});

afterAll(async () => {
  server.wss.close();
  await server.redis.disconnect();
});

describe('Message ACK', () => {
  it('should receive ACK with status "received" after sending a message', (done) => {
    const userId = randomUUID();
    const ws = new WebSocket(`ws://localhost:${PORT}?userId=${userId}`);
    const messageId = randomUUID();

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: messageId,
        from: userId,
        to: randomUUID(),
        content: 'Test ACK message',
        type: 'text',
        timestamp: Date.now(),
      }));
    });

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString());

      // The first message might be the ACK (if the target is offline, nothing else arrives)
      // Or if the server delivers something else — we check that at least one response
      // has the ACK structure with matching messageId
      if (response.messageId === messageId) {
        expect(response.status).toBe('received');
        expect(response.timestamp).toBeGreaterThan(0);
        ws.close();
        done();
      }
    });

    ws.on('error', done);
  });
});