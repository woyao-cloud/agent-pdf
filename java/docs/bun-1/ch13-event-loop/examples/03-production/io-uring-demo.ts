/**
 * ch13-event-loop / examples/03-production / io-uring-demo.ts
 *
 * io_uring 异步 I/O 基准测试
 * 演示 Bun 使用 io_uring（Linux）进行高效异步 I/O 的核心机制。
 * 对比传统 epoll + 线程池方式与 io_uring 方式的性能差异。
 */

// ============================================================
// 1. io_uring 基础概念演示
// ============================================================
// io_uring 是 Linux 5.1+ 引入的异步 I/O 框架，使用共享环形缓冲区
// 在用户态和内核态之间传递 I/O 请求和完成事件。
//
// 传统方式（epoll + 线程池）：
//   用户态 -> 系统调用 -> 内核态 -> 线程池 -> 等待 -> 返回
//
// io_uring 方式：
//   用户态 -> 提交 SQ (Submission Queue) -> 内核处理 -> CQ (Completion Queue) -> 用户态读取

console.log("=== Bun io_uring 异步 I/O 基准测试 ===");
console.log("平台信息:");
console.log(`  Bun 版本: ${Bun.version}`);
console.log(`  OS 类型: ${process.platform}`);
console.log(`  CPU 架构: ${process.arch}`);

// 检查是否支持 io_uring（仅 Linux 5.1+）
if (process.platform === "linux") {
  console.log("  当前系统支持 io_uring（Linux）");
} else {
  console.log("  当前系统使用 kqueue（macOS）或 IOCP（Windows）替代 io_uring");
}

// ============================================================
// 2. 顺序文件读取（不使用 io_uring 优势）
// ============================================================

console.log("\n=== 2. 基准测试：顺序文件读取 ===");

async function sequentialReadBenchmark() {
  const filePath = "/app/examples/io-uring-demo.ts";
  const ITERATIONS = 100;

  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    const file = Bun.file(filePath);
    const content = await file.text();
    // 防止编译器优化
    if (content.length === 0) {
      console.log("  文件为空");
    }
  }

  const elapsed = performance.now() - start;
  console.log(
    `  顺序读取 ${ITERATIONS} 次: ${elapsed.toFixed(2)}ms` +
      ` (平均 ${(elapsed / ITERATIONS).toFixed(3)}ms/次)`
  );
}

await sequentialReadBenchmark();

// ============================================================
// 3. 并发文件读取（io_uring 优势场景）
// ============================================================
// io_uring 的核心优势：批量提交 I/O 请求，减少系统调用次数

console.log("\n=== 3. 并发文件读取（io_uring 优势场景）===");

async function concurrentReadBenchmark() {
  const filePath = "/app/examples/io-uring-demo.ts";
  const CONCURRENCY = 50;

  const start = performance.now();

  // 同时发起 50 个文件读取请求
  // Bun 的 io_uring 实现可以将这些请求批量提交到内核
  const promises = Array.from({ length: CONCURRENCY }, async (_, i) => {
    const file = Bun.file(filePath);
    const content = await file.text();
    return { index: i, size: content.length };
  });

  const results = await Promise.all(promises);
  const elapsed = performance.now() - start;

  console.log(`  并发读取 ${CONCURRENCY} 个请求: ${elapsed.toFixed(2)}ms`);
  console.log(`  平均 ${(elapsed / CONCURRENCY).toFixed(3)}ms/请求`);
  console.log(`  总读取字节数: ${results.reduce((sum, r) => sum + r.size, 0)} 字节`);

  // 与 Node.js 的对比注释：
  // 在 Node.js 中，上述操作需要通过 libuv 线程池处理，
  // 线程池默认大小为 4，超过 4 个并发 I/O 请求需要排队。
  // 在 Bun 中，io_uring 可以同时处理数千个 I/O 请求，
  // 无需线程池，减少了上下文切换和内存拷贝。
}

await concurrentReadBenchmark();

// ============================================================
// 4. 混合 I/O 工作负载
// ============================================================
// io_uring 支持多种 I/O 操作类型：read、write、open、close、stat、fsync 等

console.log("\n=== 4. 混合 I/O 工作负载 ===");

async function mixedIOWorkload() {
  const testDir = "/tmp/bun-iouring-test";
  const FILE_COUNT = 20;
  const WRITE_SIZE = 4096; // 4KB

  // 创建测试目录
  try {
    await Bun.write(Bun.file(testDir), ""); // 确保目录存在
  } catch {}

  // 准备测试数据
  const testData = "x".repeat(WRITE_SIZE);

  // 混合工作负载：写入 + 读取 + 统计信息
  const start = performance.now();

  // 阶段 1：并发写入（使用 io_uring 的 writev 操作）
  console.log("  阶段 1: 并发写入文件...");
  const writePromises = Array.from({ length: FILE_COUNT }, async (_, i) => {
    const filePath = `${testDir}/test-file-${i}.dat`;
    await Bun.write(Bun.file(filePath), testData);
    return filePath;
  });

  const filePaths = await Promise.all(writePromises);
  console.log(`  已写入 ${FILE_COUNT} 个文件，每个 ${WRITE_SIZE} 字节`);

  // 阶段 2：并发读取 + 统计（使用 io_uring 的 readv 和 statx 操作）
  console.log("  阶段 2: 并发读取文件并获取统计信息...");
  const readPromises = filePaths.map(async (filePath) => {
    const file = Bun.file(filePath);
    const [content, stat] = await Promise.all([
      file.text(),
      file.size,
    ]);
    return {
      path: filePath,
      size: stat,
      contentLength: content.length,
    };
  });

  const fileInfos = await Promise.all(readPromises);

  // 验证
  const allValid = fileInfos.every(
    (info) => info.size === WRITE_SIZE && info.contentLength === WRITE_SIZE
  );

  const elapsed = performance.now() - start;
  console.log(`  混合 I/O 完成: ${elapsed.toFixed(2)}ms`);
  console.log(`  数据完整性验证: ${allValid ? "通过" : "失败"}`);

  // 清理
  for (const filePath of filePaths) {
    try {
      Bun.spawnSync(["rm", "-f", filePath]);
    } catch {}
  }
}

await mixedIOWorkload();

// ============================================================
// 5. 大规模 I/O 压力测试
// ============================================================
// 展示 io_uring 在大规模并发下的性能优势

console.log("\n=== 5. 大规模 I/O 压力测试 ===");

async function ioPressureTest() {
  const filePath = "/app/examples/io-uring-demo.ts";
  const TOTAL_REQUESTS = 500;
  const BATCH_SIZE = 50;

  console.log(`  总请求数: ${TOTAL_REQUESTS}, 批次大小: ${BATCH_SIZE}`);

  const start = performance.now();

  // 分批处理，每批并发提交
  for (let batch = 0; batch < TOTAL_REQUESTS / BATCH_SIZE; batch++) {
    const promises = Array.from({ length: BATCH_SIZE }, async () => {
      const file = Bun.file(filePath);
      const content = await file.text();
      return content.length;
    });

    const sizes = await Promise.all(promises);
    const valid = sizes.every((size) => size > 0);
    if (!valid) {
      console.log(`  批次 ${batch + 1}: 数据完整性检查失败`);
    }
  }

  const elapsed = performance.now() - start;
  const throughput = (TOTAL_REQUESTS / (elapsed / 1000)).toFixed(0);
  console.log(`  总耗时: ${elapsed.toFixed(2)}ms`);
  console.log(`  吞吐量: ${throughput} 请求/秒`);
  console.log(`  平均延迟: ${(elapsed / TOTAL_REQUESTS).toFixed(3)}ms/请求`);
}

await ioPressureTest();

// ============================================================
// 6. io_uring 与回调风格对比
// ============================================================
// 演示 io_uring 如何与事件循环集成

console.log("\n=== 6. io_uring 与事件循环集成 ===");

async function iouringEventLoopIntegration() {
  const filePath = "/app/examples/io-uring-demo.ts";

  // io_uring 的工作流程：
  // 1. 应用程序提交 I/O 请求到 SQ（Submission Queue）
  // 2. 内核处理请求，将结果放入 CQ（Completion Queue）
  // 3. 事件循环在 poll 阶段检查 CQ
  // 4. 完成回调被加入微任务队列
  // 5. 微任务队列执行回调

  console.log("  io_uring 请求生命周期:");
  console.log("  1. [提交] 调用 Bun.file().text()");
  console.log("     -> 请求被添加到 io_uring SQ");

  const file = Bun.file(filePath);

  // 在 await 之前，请求已经提交到 io_uring SQ
  // 但尚未完成（事件循环尚未处理 CQ）
  console.log("  2. [等待] await 暂停当前 async 函数");
  console.log("     -> 控制权返回事件循环");

  const content = await file.text();

  // await 返回后，CQ 已经被事件循环处理
  // 完成回调已经被执行
  console.log("  3. [完成] 事件循环处理 CQ");
  console.log("     -> 回调被加入微任务队列并执行");
  console.log(`     -> 结果: ${content.length} 字节`);

  // 与传统 epoll 的对比：
  //
  // epoll + 线程池:
  //   1. 提交 I/O 请求到线程池
  //   2. 线程池中的线程执行阻塞 I/O
  //   3. 完成后通知事件循环
  //   4. 事件循环执行回调
  //   -> 需要上下文切换和内存拷贝
  //
  // io_uring:
  //   1. 提交 I/O 请求到 SQ（无需系统调用，使用共享内存）
  //   2. 内核直接处理 I/O（无需线程池）
  //   3. 事件循环检查 CQ（无需系统调用）
  //   4. 执行回调
  //   -> 零系统调用（批量化后），零拷贝
}

await iouringEventLoopIntegration();

// ============================================================
// 7. 网络 I/O 与文件 I/O 的协同
// ============================================================
// io_uring 同时支持网络 I/O 和文件 I/O

console.log("\n=== 7. 网络 I/O 与文件 I/O 协同 ===");

async function networkAndFileIO() {
  // 场景：HTTP 服务器读取文件并返回
  // 这是一个典型的 Web 服务器工作负载

  const server = Bun.listen({
    hostname: "localhost",
    port: 0,
    socket: {
      async open(socket) {
        const filePath = "/app/examples/io-uring-demo.ts";
        const file = Bun.file(filePath);
        const content = await file.text();

        // 通过 io_uring 同时处理文件 I/O 和网络 I/O
        socket.write(
          `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${content.length}\r\n\r\n`
        );
        socket.write(content);
        socket.flush();
        socket.close();
      },
      data(socket, data) {
        // 不处理请求体
      },
      error(socket, error) {
        console.error(`  Socket 错误: ${error}`);
      },
    },
  });

  console.log(`  服务器已启动: http://localhost:${server.port}`);

  // 发送测试请求
  const response = await fetch(`http://localhost:${server.port}`);
  const body = await response.text();
  console.log(`  响应长度: ${body.length} 字节`);
  console.log(`  状态码: ${response.status}`);

  server.stop();
  console.log("  服务器已停止");
  console.log("  io_uring 在此场景中同时处理文件读取和网络发送");
}

await networkAndFileIO();

// ============================================================
// 总结
// ============================================================
console.log("\n=== io_uring 基准测试总结 ===");
console.log("");
console.log("1. 核心机制:");
console.log("   - io_uring 使用共享环形缓冲区（SQ/CQ）");
console.log("   - 减少系统调用次数（批量提交）");
console.log("   - 消除不必要的内存拷贝（共享内存）");
console.log("   - 无需线程池（内核直接处理 I/O）");
console.log("");
console.log("2. 性能优势:");
console.log("   - 高并发场景下吞吐量显著提升");
console.log("   - 延迟更低（无需上下文切换）");
console.log("   - 资源消耗更少（无需线程池）");
console.log("   - 可扩展性更好（支持数千并发 I/O）");
console.log("");
console.log("3. 适用场景:");
console.log("   - Web 服务器（静态文件服务）");
console.log("   - 数据库驱动（大量文件 I/O）");
console.log("   - 日志系统（高吞吐写入）");
console.log("   - 代理服务器（网络 I/O 密集）");
console.log("");
console.log("4. 跨平台兼容:");
console.log("   - Linux: io_uring（5.1+）或 epoll（旧版本）");
console.log("   - macOS: kqueue");
console.log("   - Windows: IOCP");
console.log("   - Bun 根据平台自动选择最佳 I/O 引擎");
