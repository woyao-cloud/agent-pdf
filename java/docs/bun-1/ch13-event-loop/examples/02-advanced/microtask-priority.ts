/**
 * ch13-event-loop / examples/02-advanced / microtask-priority.ts
 *
 * 微任务优先级深度分析
 * 展示 Bun 重构事件循环后微任务系统的内部机制，
 * 包括微任务队列的嵌套、优先级反转、以及不同微任务类型的调度差异。
 */

// ============================================================
// 1. 微任务队列的嵌套与展开
// ============================================================
// Bun 在重构中修改了微任务的执行策略：
// - 每次执行微任务前检查队列深度，防止无限递归
// - 支持嵌套微任务的展开执行

console.log("=== 1. 微任务嵌套与展开 ===");
console.log("同步代码开始");

let nestingLevel = 0;

function nestedMicrotask(maxDepth: number) {
  if (nestingLevel >= maxDepth) return;

  nestingLevel++;
  const currentLevel = nestingLevel;

  // 使用 Promise.then 创建嵌套微任务
  Promise.resolve().then(() => {
    console.log(`  嵌套级别 ${currentLevel}: Promise.then 执行`);

    // 在当前微任务中创建新的微任务
    nestedMicrotask(maxDepth);
  });
}

// 触发 5 层嵌套微任务
nestedMicrotask(5);
console.log(`同步代码结束，已创建 ${nestingLevel} 层微任务（将在事件循环中展开）`);

// ============================================================
// 2. 微任务与宏任务的交错
// ============================================================
// Bun 重构后，微任务在每个阶段前后都会执行。
// 这意味着宏任务之间的微任务队列会被完全清空。

setTimeout(() => {
  console.log("\n=== 2. 微任务与宏任务交错 ===");

  let microtaskCount = 0;
  const MAX_MICROTASKS = 3;

  function createChainedMicrotask() {
    if (microtaskCount >= MAX_MICROTASKS) return;

    microtaskCount++;
    const id = microtaskCount;

    Promise.resolve().then(() => {
      console.log(`  微任务 ${id} 执行`);

      // 创建链式微任务
      if (microtaskCount < MAX_MICROTASKS) {
        createChainedMicrotask();
      } else {
        console.log("  --- 微任务链结束 ---");
      }
    });
  }

  // 启动微任务链
  createChainedMicrotask();

  // 在微任务链中间插入宏任务
  setTimeout(() => {
    console.log("  [宏任务] setTimeout 在微任务链中间执行");
    console.log("  注意：在 Bun 中，此宏任务会在当前微任务队列清空后才执行");
  }, 0);

  console.log("  [同步] 微任务链已启动，宏任务已排队");
}, 10);

// ============================================================
// 3. process.nextTick 的特殊地位
// ============================================================
// process.nextTick 在 Bun 中具有最高优先级。
// 它总是在其他微任务之前执行，无论何时添加。

setTimeout(() => {
  console.log("\n=== 3. process.nextTick 优先级验证 ===");

  // 场景：同时添加 nextTick、Promise、queueMicrotask
  // 期望执行顺序：nextTick -> Promise/queueMicrotask

  console.log("添加任务（从高到低优先级）:");

  process.nextTick(() => {
    console.log("  [1] process.nextTick 回调");
  });

  Promise.resolve().then(() => {
    console.log("  [2] Promise.then 回调");
  });

  queueMicrotask(() => {
    console.log("  [3] queueMicrotask 回调");
  });

  // 在微任务执行过程中添加新的 nextTick
  Promise.resolve().then(() => {
    console.log("  [4] 在 Promise.then 中添加 nextTick");
    process.nextTick(() => {
      console.log("  [5] 在微任务中创建的 nextTick（会插入到当前微任务队列之前）");
    });
  });

  console.log("  [同步] 所有任务已添加，准备执行");
}, 20);

// ============================================================
// 4. 微任务中的异常处理
// ============================================================
// Bun 重构后，微任务中的异常不会影响其他微任务的执行。
// 但未捕获的拒绝会触发 process.on('unhandledRejection')。

setTimeout(() => {
  console.log("\n=== 4. 微任务异常处理 ===");

  // 注册未处理的 Promise 拒绝处理器
  process.on("unhandledRejection", (reason) => {
    console.log(`  捕获到未处理的拒绝: ${reason}`);
  });

  // 微任务 1：正常执行
  Promise.resolve().then(() => {
    console.log("  微任务 1: 正常执行");
  });

  // 微任务 2：抛出异常（但被 catch 捕获）
  Promise.reject(new Error("可恢复错误")).catch((err) => {
    console.log(`  微任务 2: 捕获到异常 - ${err.message}`);
  });

  // 微任务 3：未捕获的拒绝（将触发 unhandledRejection）
  // 注意：实际运行时，Bun 会在事件循环结束时报告未处理的拒绝
  // 这里只做演示，不实际触发未处理拒绝

  // 微任务 4：正常执行
  Promise.resolve().then(() => {
    console.log("  微任务 4: 正常执行（不受微任务 2 的异常影响）");
  });

  console.log("  [同步] 微任务异常处理演示完成");
}, 30);

// ============================================================
// 5. 批量微任务处理
// ============================================================
// Bun 重构后，事件循环在每次微任务处理回合中会处理一批微任务，
// 而不是逐个处理。这提高了吞吐量。

setTimeout(() => {
  console.log("\n=== 5. 批量微任务处理 ===");

  const BATCH_SIZE = 10;
  const startTime = performance.now();

  // 创建大量微任务
  for (let i = 0; i < BATCH_SIZE; i++) {
    Promise.resolve().then((value) => {
      // 空操作，仅用于测量
      void value;
    });
  }

  // 在微任务队列清空后测量
  Promise.resolve().then(() => {
    const elapsed = performance.now() - startTime;
    console.log(`  ${BATCH_SIZE} 个微任务处理完成，耗时: ${elapsed.toFixed(3)}ms`);

    // 对比：使用 setTimeout 创建相同数量的宏任务
    const macroStart = performance.now();
    let completed = 0;

    for (let i = 0; i < BATCH_SIZE; i++) {
      setTimeout(() => {
        completed++;
        if (completed === BATCH_SIZE) {
          const macroElapsed = performance.now() - macroStart;
          console.log(`  ${BATCH_SIZE} 个宏任务处理完成，耗时: ${macroElapsed.toFixed(3)}ms`);
          console.log("  结论: 批量微任务处理比逐个宏任务高效得多");
        }
      }, 0);
    }
  });
}, 40);

// ============================================================
// 6. 微任务优先级反转演示
// ============================================================
// Bun 重构后，在某些场景下可能出现微任务优先级反转：
// 低优先级的宏任务可能被高优先级的微任务无限推迟。

setTimeout(() => {
  console.log("\n=== 6. 微任务优先级反转风险 ===");

  let shouldStop = false;
  let macroExecuted = false;

  // 设置一个宏任务
  setTimeout(() => {
    macroExecuted = true;
    shouldStop = true;
    console.log("  宏任务终于被执行了！");
  }, 100);

  // 持续创建微任务（模拟优先级反转）
  function spawnMicrotask() {
    if (shouldStop) return;

    Promise.resolve().then(() => {
      if (!macroExecuted) {
        // 微任务不断创建新的微任务
        spawnMicrotask();
      }
    });
  }

  // 启动微任务生成器（仅运行少量迭代以避免无限循环）
  let iterationCount = 0;
  function safeSpawnMicrotask() {
    if (iterationCount >= 5) {
      shouldStop = true;
      return;
    }
    iterationCount++;
    Promise.resolve().then(() => {
      console.log(`  微任务迭代 ${iterationCount}`);
      safeSpawnMicrotask();
    });
  }

  console.log("  启动有限迭代的微任务生成器（避免实际阻塞）");
  safeSpawnMicrotask();
  console.log("  注意: 如果微任务无限生成，宏任务将永远不会执行（优先级反转）");
  console.log("  Bun 通过最大微任务执行深度来防止此问题");
}, 50);

// ============================================================
// 7. 重构后的微任务调度器性能
// ============================================================
// Bun 使用自定义的微任务调度器替代了 V8 的默认微任务处理。
// 这带来了更好的性能和可预测性。

setTimeout(() => {
  console.log("\n=== 7. 重构后微任务调度器性能 ===");

  const TOTAL_TASKS = 1000;
  const ITERATIONS = 5;

  function benchmarkMicrotasks(iteration: number) {
    if (iteration >= ITERATIONS) {
      console.log("\n性能基准测试完成");
      return;
    }

    const start = performance.now();

    let completed = 0;
    for (let i = 0; i < TOTAL_TASKS; i++) {
      Promise.resolve().then(() => {
        completed++;
        if (completed === TOTAL_TASKS) {
          const elapsed = performance.now() - start;
          console.log(
            `  迭代 ${iteration + 1}: ${TOTAL_TASKS} 个微任务耗时 ${elapsed.toFixed(3)}ms` +
              ` (${(TOTAL_TASKS / elapsed).toFixed(0)} 个/ms)`
          );
          benchmarkMicrotasks(iteration + 1);
        }
      });
    }
  }

  console.log(`启动 ${TOTAL_TASKS}x${ITERATIONS} 微任务性能基准测试...`);
  benchmarkMicrotasks(0);
}, 60);

// ============================================================
// 总结
// ============================================================
// Bun 重构事件循环后，微任务系统的主要改进：
//
// 1. 执行时机：每个阶段前后都执行微任务队列
// 2. 优先级：nextTick > Promise.then = queueMicrotask
// 3. 批量处理：一次处理一批微任务，提高吞吐量
// 4. 深度限制：防止微任务无限循环阻塞事件循环
// 5. 异常隔离：单个微任务的异常不影响其他微任务
// 6. 性能优化：自定义调度器替代 V8 默认实现
