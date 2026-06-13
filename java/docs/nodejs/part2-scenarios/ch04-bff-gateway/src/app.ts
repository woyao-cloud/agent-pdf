import Fastify from 'fastify';
import { Pool } from 'undici';
import CircuitBreaker from 'opossum';
import type { AggregatedUserResponse, User, Order } from './types.js';

// ---------------------------------------------------------------------------
// Downstream microservice connection pool
// ---------------------------------------------------------------------------

const downstreamPool = new Pool('http://localhost:4000', {
  connections: 100,
  pipelining: 10,
  requestTimeout: 3000,
});

// ---------------------------------------------------------------------------
// Circuit breaker – wraps the aggregation call
// ---------------------------------------------------------------------------

async function fetchAggregated(userId: string): Promise<AggregatedUserResponse> {
  const [userRes, ordersRes] = await Promise.all([
    downstreamPool.request({ path: `/users/${userId}`, method: 'GET' }),
    downstreamPool.request({ path: `/users/${userId}/orders`, method: 'GET' }),
  ]);

  const user = (await userRes.body.json()) as User;
  const orders = (await ordersRes.body.json()) as Order[];

  const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);

  return { user, orders, orderCount: orders.length, totalAmount };
}

const breaker = new CircuitBreaker(fetchAggregated, {
  timeout: 2000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

breaker.fallback((userId: string) => {
  return Promise.reject(new Error('Service temporarily unavailable'));
});

// ---------------------------------------------------------------------------
// Fastify app
// ---------------------------------------------------------------------------

const app = Fastify({ logger: true });

// Health check
app.get('/health', async () => {
  return { status: 'ok' };
});

// Aggregated user endpoint
app.get<{ Params: { id: string } }>('/users/:id/aggregated', async (request, reply) => {
  try {
    const result = await breaker.fire(request.params.id);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message === 'Service temporarily unavailable' || breaker.opened) {
      reply.code(503);
      return { error: 'Service temporarily unavailable' };
    }

    reply.code(502);
    return { error: 'Bad gateway', message };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start() {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// 仅在非测试环境下启动服务器
// 测试时通过 app.inject() 模拟 HTTP 请求
if (process.env.NODE_ENV !== 'test') {
  start();
}

export { app, breaker, downstreamPool };