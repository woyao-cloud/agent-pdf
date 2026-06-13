import { monitorEventLoopDelay } from 'node:perf_hooks';
import v8 from 'node:v8';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

console.log('=== Node.js 运行状态监控 ===');
console.log('按 Ctrl+C 退出\n');

setInterval(() => {
  const heapStats = v8.getHeapStatistics();
  const cpuUsage = process.cpuUsage();
  const elapsed = process.uptime();

  const lagMetrics = {
    min: (histogram.min / 1e6).toFixed(2),
    p50: (histogram.percentile(50) / 1e6).toFixed(2),
    p95: (histogram.percentile(95) / 1e6).toFixed(2),
    p99: (histogram.percentile(99) / 1e6).toFixed(2),
    max: (histogram.max / 1e6).toFixed(2),
  };

  console.log(`[${new Date().toISOString()}]`);
  console.log(`  Event Loop Lag (ms):        min=${lagMetrics.min}  p50=${lagMetrics.p50}  p95=${lagMetrics.p95}  p99=${lagMetrics.p99}  max=${lagMetrics.max}`);
  console.log(`  Heap:                       ${(heapStats.used_heap_size / 1024 / 1024).toFixed(1)}MB / ${(heapStats.total_heap_size / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Heap Limit:                 ${(heapStats.heap_size_limit / 1024 / 1024).toFixed(0)}MB`);
  console.log(`  CPU:                        user=${(cpuUsage.user / 1e6).toFixed(1)}s  sys=${(cpuUsage.system / 1e6).toFixed(1)}s`);
  console.log(`  Uptime:                     ${elapsed.toFixed(0)}s`);
  console.log('');
}, 5000);

// 模拟一些异步操作产生事件循环负载
setInterval(async () => {
  await Promise.resolve();
  await new Promise(r => setTimeout(r, Math.random() * 50));
}, 100);

// 模拟一些文件 I/O
setInterval(() => {
  import('node:fs').then(({ readFile }) => {
    readFile(new URL(import.meta.url), () => {});
  });
}, 1000);