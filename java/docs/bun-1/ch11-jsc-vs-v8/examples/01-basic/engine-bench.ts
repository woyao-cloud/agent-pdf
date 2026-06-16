/**
 * engine-bench.ts — JSC 引擎基准性能测试
 *
 * 本示例通过多个维度的基准测试，展示 JavaScriptCore（JSC）引擎
 * 在不同场景下的性能特性。由于 Bun 使用 JSC 而非 V8，这些测试
 * 结果可以直接反映 JSC 相对于 V8（Node.js 使用的引擎）的差异。
 *
 * 测试维度：
 *   1. 数值运算（整数与浮点）
 *   2. 字符串操作（拼接、正则匹配）
 *   3. 对象属性访问（静态属性 vs 动态属性）
 *   4. 函数调用（高频闭包调用）
 *   5. 数组遍历（不同类型数组）
 *   6. Promise 微任务吞吐
 */

function formatTime(ns: bigint): string {
  if (ns < 1000n) return `${ns}ns`;
  if (ns < 1_000_000n) return `${Number(ns) / 1000}μs`;
  if (ns < 1_000_000_000n) return `${Number(ns) / 1_000_000}ms`;
  return `${Number(ns) / 1_000_000_000}s`;
}

function bench(label: string, fn: () => void, iterations = 1_000_000): void {
  // 预热 JIT
  for (let i = 0; i < 1000; i++) fn();

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();
  const total = end - start;
  const perOp = total / BigInt(iterations);

  console.log(`  ${label}: ${formatTime(total)} total, ${formatTime(perOp)}/op`);
}

console.log("=== JSC 引擎基准性能测试 ===\n");

// -------- 1. 数值运算 --------
console.log("[1/6] 数值运算");

bench("整数加法 (a + b)", () => {
  let x = 0;
  for (let i = 0; i < 100; i++) x += i;
}, 500_000);

bench("浮点乘法 (a * b)", () => {
  let x = 1.0;
  for (let i = 0; i < 100; i++) x *= 1.0001;
}, 500_000);

bench("Math.sin 调用", () => {
  let x = 0;
  for (let i = 0; i < 100; i++) x += Math.sin(i * 0.01);
}, 100_000);

// -------- 2. 字符串操作 --------
console.log("\n[2/6] 字符串操作");

bench("字符串拼接 (短字符串)", () => {
  let s = "";
  for (let i = 0; i < 50; i++) s += "a";
}, 100_000);

bench("正则匹配 (简单模式)", () => {
  /hello/.test("hello world " + Math.random());
}, 500_000);

bench("字符串替换", () => {
  "The quick brown fox jumps over the lazy dog".replace(/o/g, "0");
}, 500_000);

// -------- 3. 对象属性访问 --------
console.log("\n[3/6] 对象属性访问");

// 静态形状（monomorphic）
interface Point {
  x: number;
  y: number;
}
const p: Point = { x: 1, y: 2 };

bench("静态属性访问 (monomorphic)", () => {
  let s = 0;
  for (let i = 0; i < 100; i++) s += p.x + p.y;
}, 500_000);

// 动态形状（polymorphic — 不同形状的对象）
bench("多态属性访问 (polymorphic)", () => {
  const objs = [
    { a: 1, b: 2 },
    { a: 3, c: 4 },
    { a: 5, d: 6 },
    { a: 7, e: 8 },
  ];
  let s = 0;
  for (let i = 0; i < 100; i++) {
    const o = objs[i % 4];
    s += (o as any).a;
  }
}, 200_000);

bench("delete 操作", () => {
  const o = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  delete (o as any).c;
}, 200_000);

// -------- 4. 函数调用 --------
console.log("\n[4/6] 函数调用");

function add(a: number, b: number): number {
  return a + b;
}
const addArrow = (a: number, b: number): number => a + b;

bench("常规函数调用", () => {
  let s = 0;
  for (let i = 0; i < 100; i++) s += add(i, i + 1);
}, 500_000);

bench("箭头函数调用", () => {
  let s = 0;
  for (let i = 0; i < 100; i++) s += addArrow(i, i + 1);
}, 500_000);

// 闭包链
function makeCounter(): () => number {
  let count = 0;
  return () => count++;
}
bench("闭包调用 (深层作用域)", () => {
  const counter = makeCounter();
  let v = 0;
  for (let i = 0; i < 100; i++) v += counter();
}, 200_000);

// -------- 5. 数组遍历 --------
console.log("\n[5/6] 数组遍历");

const arr = new Array(1000).fill(0).map((_, i) => i);

bench("for 循环遍历", () => {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
}, 100_000);

bench("for-of 遍历", () => {
  let s = 0;
  for (const v of arr) s += v;
}, 100_000);

bench("forEach 遍历", () => {
  let s = 0;
  arr.forEach((v) => {
    s += v;
  });
}, 100_000);

bench("TypedArray 遍历", () => {
  const ta = new Int32Array(1000);
  for (let i = 0; i < ta.length; i++) ta[i] = i;
  let s = 0;
  for (let i = 0; i < ta.length; i++) s += ta[i];
}, 100_000);

// -------- 6. Promise 微任务 --------
console.log("\n[6/6] Promise 微任务");

bench("Promise.resolve 链", () => {
  Promise.resolve(42);
}, 200_000);

bench("async/await 开销", () => {
  (async () => {
    await Promise.resolve(42);
  })();
}, 100_000);

console.log("\n=== 基准测试完成 ===");
console.log("提示：将本结果与 Node.js（V8）对比，可观察引擎差异。");
console.log("JSC 在启动速度和单次函数调用上有优势，V8 在长稳吞吐上可能更强。");
