// tracing 必须在 express 之前 import
import './tracing.js';
import express from 'express';
import { logger } from './logger.js';
import { client, httpRequestDuration, httpRequestsTotal, activeConnections } from './metrics.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 指标收集中间件
app.use((req, res, next) => {
  const start = Date.now();
  activeConnections.inc();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;

    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode.toString() }, duration);
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode.toString() });
    activeConnections.dec();

    logger.info({
      req: { method: req.method, url: req.url },
      res: { statusCode: res.statusCode },
      durationMs: Date.now() - start,
    }, 'request completed');
  });

  next();
});

// Metrics 端点 (Prometheus scrape)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

// 健康检查
app.get('/health', (req, res) => {
  logger.debug('health check');
  res.json({ status: 'ok' });
});

// 模拟用户服务
app.get('/api/users/:id', (req, res) => {
  const user = { id: req.params.id, name: `User ${req.params.id}`, email: `user${req.params.id}@test.com` };
  logger.info({ userId: req.params.id }, 'fetched user');
  res.json(user);
});

// 模拟慢查询
app.get('/api/slow', async (req, res) => {
  await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
  logger.warn({ delayMs: 500 }, 'slow query detected');
  res.json({ message: 'slow response', duration: '500-1500ms' });
});

// 模拟错误
app.get('/api/error', (req, res) => {
  logger.error({ error: new Error('simulated error') }, 'simulated error endpoint');
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, pid: process.pid }, 'Observability demo started');
  logger.info(`  Health:    http://localhost:${PORT}/health`);
  logger.info(`  Metrics:   http://localhost:${PORT}/metrics`);
  logger.info(`  Users:     http://localhost:${PORT}/api/users/1`);
  logger.info(`  Slow:      http://localhost:${PORT}/api/slow`);
  logger.info(`  Error:     http://localhost:${PORT}/api/error`);
});