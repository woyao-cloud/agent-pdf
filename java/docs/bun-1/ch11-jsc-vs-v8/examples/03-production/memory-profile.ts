/**
 * memory-profile.ts — 内存分配模式分析
 *
 * 本示例通过模拟不同内存分配模式，展示 JavaScriptCore 的垃圾回收
 * 行为特征。JSC 使用保守的标记-清除（Mark-Sweep）GC，与 V8 的
 * 分代式（Generational）GC 有本质区别。
 *
 * 关键差异：
 *   - JSC: 保守 GC，不移动对象，适合低暂停时间
 *   - V8: 分代 GC，新生代频繁回收 + 老年代标记压缩
 *
 * 观察指标：
 *   1. 大量短生命周期对象的 GC 行为
 *   2. 长生命周期对象的 GC 行为
 *   3. 闭包导致的内存泄漏模式
 *   4. 大型数组的内存管理
 */

import { performance } from "perf_hooks";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function gc(): void {
  // Bun 支持强制 GC（需要 --expose-gc 标志）
  if (typeof Bun !== "undefined" && Bun.gc) {
    Bun.gc(true);
  }
}

function elapsedMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

console.log("=== 内存分配模式分析 ===\n");
console.log("运行时:", typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "Unknown");
console.log("引擎: JavaScriptCore (JSC)\n");

// -------- 1. 短生命周期对象（临时分配） --------
console.log("[1/4] 短生命周期对象（临时分配）");
console.log("说明：大量创建临时对象，观察 GC 回收频率。\n");

function createTemporaryObjects(count: number): void {
  for (let i = 0; i < count; i++) {
    // 这些对象在函数返回后变成垃圾
    const obj = {
      id: i,
      name: `temp-${i}`,
      data: new Uint8Array(64),
      timestamp: Date.now(),
    };
    // 模拟一些操作
    const _ = obj.id + obj.name.length;
  }
}

for (const count of [100_000, 500_000, 1_000_000]) {
  const t = elapsedMs(() => createTemporaryObjects(count));
  console.log(`  创建 ${count.toLocaleString()} 个临时对象: ${t.toFixed(2)}ms`);
}

// -------- 2. 长生命周期对象（驻留对象） --------
console.log("\n[2/4] 长生命周期对象（驻留对象）");
console.log("说明：创建并持有大量对象引用，观察 GC 压力。\n");

function createRetainedObjects(count: number): { data: any[]; size: number } {
  const retained: any[] = [];
  for (let i = 0; i < count; i++) {
    retained.push({
      id: i,
      buffer: new Uint8Array(256),
      payload: `retained-payload-${i}-${"x".repeat(50)}`,
      nested: {
        created: Date.now(),
        metadata: { type: "retained", index: i },
      },
    });
  }
  return { data: retained, size: count };
}

// 逐步创建并持有对象
let retainedData: any[] = [];
const BATCH_SIZE = 10_000;
const BATCHES = 5;

for (let b = 0; b < BATCHES; b++) {
  const t = elapsedMs(() => {
    const result = createRetainedObjects(BATCH_SIZE);
    retainedData = retainedData.concat(result.data);
  });
  const totalObjs = (b + 1) * BATCH_SIZE;
  // 估算内存（粗略）
  const estBytes = totalObjs * (256 + 100);
  console.log(
    `  批次 ${b + 1}/${BATCHES}: ${totalObjs.toLocaleString()} 个对象保留, ` +
    `耗时 ${t.toFixed(2)}ms, 估算 ${formatBytes(estBytes)}`
  );
}

// 清理
retainedData = [];
gc();
console.log("  → 已清理所有引用，触发 GC\n");

// -------- 3. 闭包泄漏模式 --------
console.log("[3/4] 闭包内存泄漏模式");
console.log("说明：闭包会捕获外部作用域的变量，可能导致意外内存持有。\n");

// 泄漏版本：闭包持有大对象引用
function createLeakyClosure(): () => number {
  const hugeData = new Uint8Array(1_000_000); // 1MB 数据
  const captured = { data: hugeData, timestamp: Date.now() };

  return () => {
    // 只使用了 captured.timestamp，但整个 captured 都被持有
    return captured.timestamp;
  };
}

// 优化版本：只捕获需要的内容
function createOptimizedClosure(): () => number {
  const timestamp = Date.now(); // 只捕获需要的值
  // hugeData 不会被闭包捕获
  const _hugeData = new Uint8Array(1_000_000);

  return () => {
    return timestamp;
  };
}

const leakyClosures: (() => number)[] = [];
const optimizedClosures: (() => number)[] = [];

const CLOSURE_COUNT = 1000;

// 创建泄漏闭包
const tLeaky = elapsedMs(() => {
  for (let i = 0; i < CLOSURE_COUNT; i++) {
    leakyClosures.push(createLeakyClosure());
  }
});

// 创建优化闭包
const tOptimized = elapsedMs(() => {
  for (let i = 0; i < CLOSURE_COUNT; i++) {
    optimizedClosures.push(createOptimizedClosure());
  }
});

console.log(`  创建 ${CLOSURE_COUNT} 个泄漏闭包: ${tLeaky.toFixed(2)}ms（每个持有 ~1MB）`);
console.log(`  创建 ${CLOSURE_COUNT} 个优化闭包: ${tOptimized.toFixed(2)}ms（仅持有必要值）`);
console.log(`  → 泄漏版本总估算内存: ${formatBytes(CLOSURE_COUNT * 1_000_000)}`);
console.log(`  → 优化版本总估算内存: ${formatBytes(CLOSURE_COUNT * 8)}`);
console.log("  提示：JSC 的闭包捕获是整个作用域链，注意避免捕获大对象。\n");

// 清理
leakyClosures.length = 0;
optimizedClosures.length = 0;
gc();

// -------- 4. 大型数组与 TypedArray --------
console.log("[4/4] 大型数组与 TypedArray");
console.log("说明：JSC 对不同类型的数组有不同的内存布局优化。\n");

// 普通数组（可能存储为稀疏或密集）
function createLargeArray(size: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < size; i++) arr.push(i);
  return arr;
}

// TypedArray（固定类型，连续内存）
function createLargeTypedArray(size: number): Int32Array {
  const arr = new Int32Array(size);
  for (let i = 0; i < size; i++) arr[i] = i;
  return arr;
}

const ARRAY_SIZE = 5_000_000;

const tArr = elapsedMs(() => createLargeArray(ARRAY_SIZE));
const tTA = elapsedMs(() => createLargeTypedArray(ARRAY_SIZE));

console.log(`  普通数组 (${ARRAY_SIZE.toLocaleString()} 个元素): ${tArr.toFixed(2)}ms`);
console.log(`  TypedArray (${ARRAY_SIZE.toLocaleString()} 个元素): ${tTA.toFixed(2)}ms`);
console.log(`  TypedArray 快 ${(tArr / tTA).toFixed(1)}x`);
console.log("  → TypedArray 使用连续内存，分配和访问都更快。");
console.log("  → JSC 对普通数组使用 JSValue 存储（8 字节/元素），TypedArray 使用原生类型。\n");

// 内存占用对比
const arr2 = createLargeArray(ARRAY_SIZE);
const ta2 = createLargeTypedArray(ARRAY_SIZE);

// 使用 process.memoryUsage 获取粗略的内存信息
if (typeof process !== "undefined" && process.memoryUsage) {
  const memBefore = process.memoryUsage();
  // 强制保留引用
  const _holdArr = arr2;
  const _holdTA = ta2;
  const memAfter = process.memoryUsage();

  console.log("  RSS 变化:", formatBytes(memAfter.rss - memBefore.rss));
  console.log("  Heap Used:", formatBytes(memAfter.heapUsed));
  console.log("  Heap Total:", formatBytes(memAfter.heapTotal));
}

console.log("\n=== 内存分析完成 ===");
console.log("关键发现：");
console.log("  1. JSC 的保守 GC 在短生命周期对象回收上表现良好");
console.log("  2. 闭包会捕获整个作用域链 —— 注意避免捕获大对象");
console.log("  3. TypedArray 比普通数组更高效 —— 优先使用");
console.log("  4. 大量长生命周期对象会增加 GC 暂停时间");
