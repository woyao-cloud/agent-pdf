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

const PORT = 9080;
let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  process.env.PORT = String(PORT);
  server = await createServer();
});

afterAll(async () => {
  server.wss.close();
  await server.redis.disconnect();
});

describe('WebSocket Connection', () => {
  it('should reject connection without userId', (done) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);

    ws.on('close', (code) => {
      expect(code).toBe(4001);
      done();
    });

    ws.on('error', () => {
      // Expected — connection is rejected by the server
    });
  });

  it('should establish connection with userId', (done) => {
    const ws = new WebSocket(`ws://localhost:${PORT}?userId=${randomUUID()}`);

    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      done();
    });

    ws.on('error', done);
  });

  it('should deliver message between two users', (done) => {
    const userId1 = randomUUID();
    const userId2 = randomUUID();
    const ws1 = new WebSocket(`ws://localhost:${PORT}?userId=${userId1}`);
    const ws2 = new WebSocket(`ws://localhost:${PORT}?userId=${userId2}`);

    let opened1 = false;
    let opened2 = false;

    function trySend() {
      if (!opened1 || !opened2) return;
      ws1.send(JSON.stringify({
        id: randomUUID(),
        from: userId1,
        to: userId2,
        content: 'Hello from Alice!',
        type: 'text',
        timestamp: Date.now(),
      }));
    }

    ws1.on('open', () => {
      opened1 = true;
      trySend();
    });

    ws2.on('open', () => {
      opened2 = true;
      trySend();
    });

    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg.from).toBe(userId1);
      expect(msg.content).toBe('Hello from Alice!');
      ws1.close();
      ws2.close();
      done();
    });

    ws1.on('error', done);
    ws2.on('error', done);
  });
});