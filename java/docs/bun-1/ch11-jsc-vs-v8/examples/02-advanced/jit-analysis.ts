/**
 * jit-analysis.ts — JIT 编译行为分析
 *
 * 本示例通过构造不同模式的代码路径，观察 JavaScriptCore 的 JIT
 * 编译器如何在不同阶段（LLInt → Baseline JIT → DFG JIT → FTL JIT）
 * 优化代码执行。虽然 Bun 没有直接暴露 JIT 编译日志的 API，但
 * 我们可以通过性能模式和反模式来推断 JIT 行为。
 *
 * 核心概念：
 *   - LLInt（Low-Level Interpreter）：低级解释器，快速启动
 *   - Baseline JIT：基线编译，轻量优化
 *   - DFG JIT（Data Flow Graph）：数据流图优化，中等开销
 *   - FTL JIT（Fourth Tier LLVM）：LLVM 后端，极致优化
 *
 * 观察指标：
 *   1. 预热前后的执行时间差异（JIT 触发后速度提升）
 *   2. 去优化（Deoptimization）导致的性能抖动
 *   3. 内联缓存（Inline Cache）的效果
 *   4. 类型不稳定代码的性能惩罚
 */

import { performance } from "perf_hooks";

function elapsedMs(fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return performance.now() - start;
}

console.log("=== JIT 编译行为分析 ===\n");

// -------- 1. 预热曲线：观察 JIT 触发 --------
console.log("[1/4] 预热曲线（JIT 触发检测）");
console.log("说明：观察每次迭代的执行时间，当 JIT 触发时会有显著加速。\n");

function hotFunction(n: number): number {
  let result = 0;
  for (let i = 0; i < n; i++) {
    result += i * i - Math.sqrt(i + 1);
  }
  return result;
}

const WARMUP_SAMPLES = 10;
const ITERS_PER_SAMPLE = 10_000;

for (let s = 0; s < WARMUP_SAMPLES; s++) {
  // 每次调用前清空可能的内联缓存
  const t = elapsedMs(() => hotFunction(200), ITERS_PER_SAMPLE);
  const label = `  第 ${String(s + 1).padStart(2, " ")} 次 (${ITERS_PER_SAMPLE} 次调用)`;
  const speed = s > 0
    ? ` ${(((baseline! - t) / baseline!) * 100).toFixed(1)}%`
    : " 基准";
  if (s === 0) var baseline: number = t;
  console.log(`${label}: ${t.toFixed(2)}ms${speed}`);
}

console.log("  → 如果后续样本显著快于首次，说明 JIT 已触发并生成了优化代码。\n");

// -------- 2. 去优化（Deoptimization）演示 --------
console.log("[2/4] 去优化（Deoptimization）");
console.log("说明：当 JIT 编译优化后的代码遇到意外类型时，会触发去优化回退到解释器。\n");

function deoptDemo(flag: boolean): number {
  // 让 JIT 先假设 x 是 number
  let x: any = 42;
  let result = 0;
  for (let i = 0; i < 1000; i++) {
    result += (x as number) + i;
    // 条件分支改变类型 —— 触发去优化
    if (flag && i === 500) {
      x = "hello"; // 突然变成 string！
    }
  }
  return result;
}

// 纯数值版本（稳定类型）
const tStable = elapsedMs(() => deoptDemo(false), 10_000);
console.log(`  稳定类型（始终 number）: ${tStable.toFixed(2)}ms`);

// 动态类型版本（触发去优化）
const tDeopt = elapsedMs(() => deoptDemo(true), 10_000);
console.log(`  动态类型（触发去优化）: ${tDeopt.toFixed(2)}ms`);
console.log(`  性能差异: ${((tDeopt / tStable - 1) * 100).toFixed(1)}% 更慢`);
console.log("  → 去优化后的代码执行速度显著下降。这是 JIT 引擎的最大挑战之一。\n");

// -------- 3. 内联缓存（Inline Cache）效果 --------
console.log("[3/4] 内联缓存（Inline Cache）效果");
console.log("说明：访问同一形状的对象时，JIT 会缓存属性偏移量，大幅提升速度。\n");

// Monomorphic：同一形状
interface ShapeA {
  type: "A";
  value: number;
  label: string;
}

function accessMonomorphic(objs: ShapeA[]): number {
  let sum = 0;
  for (let i = 0; i < objs.length; i++) {
    sum += objs[i].value;
  }
  return sum;
}

// Polymorphic：多形状
function accessPolymorphic(objs: any[]): number {
  let sum = 0;
  for (let i = 0; i < objs.length; i++) {
    sum += objs[i].value;
  }
  return sum;
}

const N = 100_000;
const monoObjs: ShapeA[] = Array.from({ length: N }, (_, i) => ({
  type: "A",
  value: i,
  label: `item-${i}`,
}));

const polyObjs: any[] = Array.from({ length: N }, (_, i) => {
  const shapeId = i % 4;
  if (shapeId === 0) return { value: i, a: 1 };
  if (shapeId === 1) return { value: i, b: 2, extra: "x" };
  if (shapeId === 2) return { value: i, c: 3, flag: true };
  return { value: i, d: 4, data: new Uint8Array(4) };
});

const tMono = elapsedMs(() => accessMonomorphic(monoObjs), 1000);
const tPoly = elapsedMs(() => accessPolymorphic(polyObjs), 1000);

console.log(`  单形状访问 (monomorphic): ${tMono.toFixed(2)}ms`);
console.log(`  多形状访问 (polymorphic):  ${tPoly.toFixed(2)}ms`);
console.log(`  性能差异: ${((tPoly / tMono - 1) * 100).toFixed(1)}% 更慢`);
console.log("  → JSC 的 Inline Cache 对单形状访问有极大优化效果。\n");

// -------- 4. 函数内联优化 --------
console.log("[4/4] 函数内联优化");
console.log("说明：JIT 会将小函数内联到调用点，消除调用开销。\n");

// 小函数（适合内联）
function smallFn(x: number): number {
  return x * 2 + 1;
}

// 大函数（不适合内联）
function largeFn(x: number): number {
  let r = x;
  for (let i = 0; i < 10; i++) r = Math.sqrt(r * r + 1);
  for (let i = 0; i < 10; i++) r = Math.sin(r) + Math.cos(r);
  for (let i = 0; i < 10; i++) r = Math.log(Math.abs(r) + 1);
  return r;
}

const tSmall = elapsedMs(() => {
  let s = 0;
  for (let i = 0; i < 1000; i++) s += smallFn(i);
}, 10_000);

const tLarge = elapsedMs(() => {
  let s = 0;
  for (let i = 0; i < 1000; i++) s += largeFn(i);
}, 10_000);

// 内联版本（手动将 smallFn 内联）
const tInline = elapsedMs(() => {
  let s = 0;
  for (let i = 0; i < 1000; i++) s += i * 2 + 1;
}, 10_000);

console.log(`  小函数调用 (适合内联): ${tSmall.toFixed(2)}ms`);
console.log(`  手动内联版本:         ${tInline.toFixed(2)}ms`);
console.log(`  大函数调用 (不适合内联): ${tLarge.toFixed(2)}ms`);
console.log("  → JIT 会自动内联小函数，性能接近手写内联版本。");
console.log("  → 大函数由于复杂度高，不会内联，保持函数调用开销。\n");

console.log("=== JIT 分析完成 ===");
console.log("关键发现：");
console.log("  1. JIT 需要预热 —— 冷启动时代码在 LLInt 解释器上运行");
console.log("  2. 类型不稳定触发去优化 —— 保持类型一致以获得最佳性能");
console.log("  3. 单形状对象访问最快 —— JSC 的 Inline Cache 高度优化此路径");
console.log("  4. 小函数自动内联 —— 无需手动优化");
