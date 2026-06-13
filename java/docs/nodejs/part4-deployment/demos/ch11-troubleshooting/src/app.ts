import express from 'express';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { appendFile } from 'node:fs/promises';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 事件循环延迟监控
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// 延迟告警阈值（毫秒）
const LAG_THRESHOLD_MS = 100;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/metrics', async (req, res) => {
  const p50 = histogram.percentile(50) / 1e6;
  const p95 = histogram.percentile(95) / 1e6;
  const p99 = histogram.percentile(99) / 1e6;

  const metrics = { event_loop_lag_ms: { p50, p95, p99 } };

  if (p99 > LAG_THRESHOLD_MS) {
    await appendFile(
      'event-loop-alert.log',
      `${new Date().toISOString()} P99=${p99.toFixed(2)}ms exceeds ${LAG_THRESHOLD_MS}ms\n`,
    );
  }

  res.json(metrics);
});

app.get('/heap-snapshot', async (req, res) => {
  const heapdump = (await import('heapdump')).default;
  const filename = `/tmp/heap-${Date.now()}.heapsnapshot`;
  heapdump.writeSnapshot(filename, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ snapshot: filename });
  });
});

app.listen(PORT, () => {
  console.log(`Troubleshooting demo running on port ${PORT}`);
  console.log(`  http://localhost:${PORT}/health`);
  console.log(`  http://localhost:${PORT}/metrics`);
  console.log(`  http://localhost:${PORT}/heap-snapshot`);
});