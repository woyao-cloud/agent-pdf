/**
 * ch13-event-loop / examples/01-basic / event-loop-phases.ts
 *
 * 事件循环重构 —— 阶段演示
 * 展示 Bun 在重构事件循环后，各阶段的执行顺序与优先级。
 * 与 Node.js 的 libuv 模型对比，突出 Bun 自定义 I/O 引擎的差异。
 */

// ============================================================
// 1. 基础阶段顺序：timers -> I/O callbacks -> idle/prepare -> poll -> check -> close
// ============================================================

console.log("=== 1. 事件循环阶段顺序演示 ===");
console.log("同步代码开始 [第1阶段: timers 之前]");

// setTimeout 回调在 timers 阶段执行
setTimeout(() => {
  console.log("  [timers 阶段] setTimeout(fn, 0) 回调执行");
}, 0);

// setImmediate 回调在 check 阶段执行
setImmediate(() => {
  console.log("  [check 阶段] setImmediate 回调执行");
});

// Promise.then 是微任务，在当前阶段结束后立即执行
Promise.resolve().then(() => {
  console.log("  [微任务] Promise.then 在当前阶段结束后执行");
});

// process.nextTick 是特殊微任务，优先级高于 Promise
process.nextTick(() => {
  console.log("  [微任务/nextTick] process.nextTick 优先于 Promise.then");
});

console.log("同步代码结束 [准备进入事件循环]");

// ============================================================
// 2. 重构后的微任务插入时机
// ============================================================
// Bun 在重构中调整了微任务的执行时机：
// - Node.js：每个阶段之间执行微任务队列
// - Bun：在每个阶段之前 AND 之后都执行微任务队列（更接近规范）
//
// 这意味着在 Bun 中，微任务可能比在 Node.js 中更早被处理。

setTimeout(() => {
  console.log("\n=== 2. 微任务插入时机对比 ===");
  console.log("[timers 阶段] 第一个 setTimeout");

  // 在回调中创建微任务
  Promise.resolve().then(() => {
    console.log("  [微任务] 在 timers 回调内创建的 Promise.then");
  });

  process.nextTick(() => {
    console.log("  [微任务/nextTick] 在 timers 回调内创建的 nextTick");
  });

  // 第二个 setTimeout 将进入下一个 timers 阶段
  setTimeout(() => {
    console.log("[下一个 timers 阶段] 第二个 setTimeout");
  }, 0);
}, 10);

// ============================================================
// 3. I/O 事件处理阶段
// ============================================================
// Bun 重构的核心：使用 io_uring（Linux）或 kqueue（macOS）替代 libuv 的 epoll
// 这使得 I/O 事件处理更加高效，减少了用户态与内核态的切换次数。

setTimeout(() => {
  console.log("\n=== 3. I/O 事件处理阶段（使用 Bun 的文件 API） ===");

  // Bun 内置的 Bun.file() 和异步文件操作
  // 注意：Bun.file() 是同步的，但读取是异步的
  const file = Bun.file("/app/examples/event-loop-phases.ts");
  file.text().then((content) => {
    console.log(`  [I/O 阶段] 文件读取完成，大小: ${content.length} 字节`);
    console.log("  Bun 使用 io_uring 处理此 I/O 操作，无需额外的线程池");
  });

  // 与 Node.js 的对比注释：
  // Node.js 中，fs.readFile 会通过 libuv 的线程池处理
  // Bun 中，Bun.file().text() 通过 io_uring 提交到内核 SQ 队列
  // 这减少了内存拷贝和上下文切换

  console.log("  [同步] I/O 请求已提交，等待事件循环处理完成");
}, 20);

// ============================================================
// 4. close 阶段
// ============================================================
// 当 socket 或 handle 被关闭时，close 回调在此阶段执行

setTimeout(() => {
  console.log("\n=== 4. close 阶段模拟 ===");

  // 使用 Bun 的 TCP listener 演示 close 回调
  const server = Bun.listen({
    hostname: "localhost",
    port: 0, // 随机端口
    socket: {
      open(socket) {
        console.log("  [连接已建立]");
        socket.end();
        socket.close();
      },
      close() {
        console.log("  [close 阶段] socket 关闭回调执行");
      },
      data(socket, data) {
        // 不需要处理
      },
    },
  });

  // 连接自身以触发 close
  const addr = server.hostname + ":" + server.port;
  setTimeout(() => {
    fetch(`http://${addr}`)
      .then(() => {
        console.log("  [I/O 阶段] HTTP 请求完成");
        server.stop();
        console.log("  [close 阶段] 服务器已停止");
      })
      .catch(() => {});
  }, 10);
}, 30);

// ============================================================
// 5. 重构后的优先级调度
// ============================================================
// Bun 在重构中引入了任务优先级队列，将任务分为多个优先级级别：

setTimeout(() => {
  console.log("\n=== 5. 重构后的优先级调度 ===");

  // 高优先级：nextTick
  // 中优先级：Promise
  // 低优先级：setTimeout/setInterval

  function priorityDemo() {
    // 这些任务将在不同优先级队列中排队
    process.nextTick(() => {
      console.log("  优先级 1: process.nextTick");
    });

    Promise.resolve().then(() => {
      console.log("  优先级 2: Promise.then");
    });

    // queueMicrotask 与 Promise 同级
    queueMicrotask(() => {
      console.log("  优先级 2: queueMicrotask");
    });

    setTimeout(() => {
      console.log("  优先级 3: setTimeout(fn, 0)");
    }, 0);

    setImmediate(() => {
      console.log("  优先级 4: setImmediate（在 check 阶段执行）");
    });
  }

  priorityDemo();
  console.log("  [同步] 所有任务已入队，等待调度");
}, 40);

// ============================================================
// 6. 总结输出
// ============================================================
// 在 Bun 重构后的事件循环中：
//
// 1. 阶段顺序：timers -> pending callbacks -> idle/prepare -> poll -> check -> close
// 2. 微任务执行：每个阶段之前 AND 之后（Bun 特有）
// 3. 优先级：nextTick > Promise > queueMicrotask > setTimeout > setImmediate
// 4. I/O 处理：io_uring/kqueue 替代 epoll + 线程池
// 5. close 回调：在 close 阶段统一处理

setTimeout(() => {
  console.log("\n=== 事件循环重构总结 ===");
  console.log("Bun 在 ch13 中重构了事件循环的核心机制：");
  console.log("- 使用自定义 I/O 引擎替代 libuv");
  console.log("- 引入 io_uring（Linux）和 kqueue（macOS）支持");
  console.log("- 优化微任务执行时机");
  console.log("- 实现优先级任务队列");
  console.log("- 减少不必要的内存分配和上下文切换");
}, 100);
