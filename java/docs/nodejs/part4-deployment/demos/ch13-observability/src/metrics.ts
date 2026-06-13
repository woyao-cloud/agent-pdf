import client from 'prom-client';
import { monitorEventLoopDelay } from 'node:perf_hooks';

// 默认指标收集
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register, prefix: 'node_' });

// 自定义指标
const httpRequestDuration = new client.Histogram({
  name: 'node_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const httpRequestsTotal = new client.Counter({
  name: 'node_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const activeConnections = new client.Gauge({
  name: 'node_active_connections',
  help: 'Number of active connections',
});

// 事件循环延迟直方图
const eventLoopLag = new client.Gauge({
  name: 'node_event_loop_lag_ms',
  help: 'Event loop lag in milliseconds',
  labelNames: ['percentile'],
});

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setInterval(() => {
  eventLoopLag.set({ percentile: 'p50' }, histogram.percentile(50) / 1e6);
  eventLoopLag.set({ percentile: 'p95' }, histogram.percentile(95) / 1e6);
  eventLoopLag.set({ percentile: 'p99' }, histogram.percentile(99) / 1e6);
}, 5000);

export {
  client,
  httpRequestDuration,
  httpRequestsTotal,
  activeConnections,
  eventLoopLag,
};