import heapdump from 'heapdump';

// 故意制造内存泄漏，用于演示 heapdump 快照对比
const leakedData: string[] = [];

function simulateLeak() {
  const largeString = 'x'.repeat(10_000); // 10KB per entry
  for (let i = 0; i < 1000; i++) {
    leakedData.push(`${i}-${largeString}`);
  }
  console.log(`Leaked ${leakedData.length} entries, ~${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`);

  if (leakedData.length % 5000 === 0) {
    const snapshotFile = `/tmp/heap-leak-${Date.now()}.heapsnapshot`;
    heapdump.writeSnapshot(snapshotFile);
    console.log(`Snapshot saved: ${snapshotFile}`);
  }
}

setInterval(simulateLeak, 2000);

// 限制运行时间，避免撑爆磁盘
setTimeout(() => {
  console.log('Demo finished. Run with: node --expose-gc src/leak-demo.ts');
  process.exit(0);
}, 60_000);