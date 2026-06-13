import express from 'express';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: { level(label) { return { level: label }; } },
  serializers: { err: pino.stdSerializers.err },
});

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
let isShuttingDown = false;

// 健康检查端点 — K8s Liveness Probe
app.get('/health', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting down' });
  }
  res.json({ status: 'ok', pid: process.pid });
});

// 就绪检查端点 — K8s Readiness Probe
app.get('/ready', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'not ready' });
  }
  res.json({ status: 'ready', pid: process.pid });
});

// 示例业务接口
app.get('/api/users/:id', (req, res) => {
  logger.info({ userId: req.params.id }, 'fetching user');
  res.json({ id: req.params.id, name: `User ${req.params.id}` });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, pid: process.pid }, 'Server started');
});

// Graceful Shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');
  isShuttingDown = true;

  // 停止接收新请求
  server.close(() => {
    logger.info('HTTP server closed');
    // 清理资源
    process.exit(0);
  });

  // 超时强制退出
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };