import { createServer } from 'node:http';

// 模拟正则回溯导致的 CPU 飙高
const VULNERABLE_REGEX = /(a|aa)+b/;

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname === '/safe') {
    // 安全路径，快速响应
    res.writeHead(200);
    res.end('OK');
    return;
  }

  if (url.pathname === '/evil') {
    // 危险路径：正则回溯
    const input = 'a'.repeat(30); // 30个a就足以引发严重回溯
    const start = Date.now();
    VULNERABLE_REGEX.test(input);
    const elapsed = Date.now() - start;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ regex: '/a|aa/+b', inputLength: input.length, elapsedMs: elapsed }));
    return;
  }

  // CPU 密集路径：大量 JSON 序列化
  if (url.pathname === '/json-bomb') {
    const data: Record<string, string> = {};
    for (let i = 0; i < 10000; i++) {
      data[`key${i}`] = 'x'.repeat(100);
    }
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      JSON.stringify(data);
    }
    const elapsed = Date.now() - start;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ operation: 'JSON.stringify x100', elapsedMs: elapsed }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`CPU Demo running on port ${PORT}`);
  console.log(`  http://localhost:${PORT}/safe       — 快速响应`);
  console.log(`  http://localhost:${PORT}/evil       — 正则回溯（慢）`);
  console.log(`  http://localhost:${PORT}/json-bomb  — JSON 序列化（CPU 密集）`);
  console.log('\nUse clinic.js to profile:');
  console.log('  clinic flame -- node src/cpu-demo.ts');
  console.log('  # Then curl http://localhost:3001/evil');
});