/**
 * comptime-demo.ts — Zig 编译期计算 (Comptime) 概念演示
 *
 * 本文件模拟 Zig 的 comptime 核心思想：
 *   1. 编译期求值 —— 在编译阶段完成计算，避免运行时开销
 *   2. 类型即参数 —— 基于类型生成专用代码
 *   3. 编译期反射 —— 在编译期检查并生成代码
 *
 * Bun (基于 Zig 构建) 在底层大量使用 comptime 来优化 JS 运行时。
 * 以下示例展示如果 TypeScript 拥有 Zig 级 comptime 能力的等效表达。
 */

// ─── 1. 编译期常量折叠 (Comptime Constant Folding) ──────────────────────
// Zig: 所有 const 声明在编译期求值，不产生运行时指令

/** 模拟 Zig 编译期常量 —— 这些值在 "编译期" 确定 */
const BUFFER_SIZE = 4096;
const ALIGNMENT = 64;
const CACHE_LINE_SIZE = 64;

/** 编译期计算 —— 类似 Zig `comptime { }` 块的效果 */
const PAGE_COUNT = Math.ceil(BUFFER_SIZE / CACHE_LINE_SIZE);
const ALIGNED_SIZE = Math.ceil(BUFFER_SIZE / ALIGNMENT) * ALIGNMENT;

console.log("=== 1. 编译期常量折叠 ===");
console.log(`BUFFER_SIZE:    ${BUFFER_SIZE}`);
console.log(`ALIGNMENT:      ${ALIGNMENT}`);
console.log(`PAGE_COUNT:     ${PAGE_COUNT}  (编译期计算: ceil(${BUFFER_SIZE}/${CACHE_LINE_SIZE}))`);
console.log(`ALIGNED_SIZE:   ${ALIGNED_SIZE}  (编译期计算: ceil(${BUFFER_SIZE}/${ALIGNMENT})*${ALIGNMENT})`);

// ─── 2. 泛型与编译期类型分发 (Generic + Comptime Type Dispatch) ────────
// Zig: fn read(comptime T: type, ptr: [*]T) T { ... }
//       编译期为每个 T 生成专用机器码，消除虚函数表

/** 类型标签 —— Zig 用类型本身作为 comptime 参数 */
type NumericType = "u8" | "u16" | "u32" | "u64" | "f32" | "f64";

/** 模拟 Zig 编译期类型分发 —— 每种类型生成专用代码路径 */
function readNumeric<T extends number>(type: NumericType, buffer: ArrayBuffer, offset: number): T {
  // Zig: 此 switch 在编译期展开，仅保留匹配分支
  switch (type) {
    case "u8": {
      const view = new DataView(buffer);
      return view.getUint8(offset) as T;
    }
    case "u16": {
      const view = new DataView(buffer);
      return view.getUint16(offset, true) as T; // little-endian
    }
    case "u32": {
      const view = new DataView(buffer);
      return view.getUint32(offset, true) as T;
    }
    case "f32": {
      const view = new DataView(buffer);
      return view.getFloat32(offset, true) as T;
    }
    case "f64": {
      const view = new DataView(buffer);
      return view.getFloat64(offset, true) as T;
    }
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

// Zig 编译期展开后相当于生成:
//   fn readU8(ptr: [*]u8) u8 { return ptr[0]; }
//   fn readU32(ptr: [*]u32) u32 { return ptr[0]; }
//   无虚表、无分支、无间接调用

const testBuf = new ArrayBuffer(8);
const testView = new DataView(testBuf);
testView.setUint32(0, 0xDEADBEEF, true);

console.log("\n=== 2. 编译期类型分发 ===");
console.log(`readNumeric<u32>:  0x${readNumeric<number>("u32", testBuf, 0).toString(16)}`);
console.log(`readNumeric<u16>:  0x${readNumeric<number>("u16", testBuf, 0).toString(16)}`);
console.log(`readNumeric<u8>:   0x${readNumeric<number>("u8", testBuf, 0).toString(16)}`);

// ─── 3. 编译期字符串处理 (Comptime String Processing) ──────────────────
// Zig: const name = comptime std.fs.path.basename(@src().file);
//       编译期提取路径，零运行时开销

/** 模拟编译期字符串处理 —— 路径提取 */
function comptimeBasename(path: string): string {
  const segments = path.replace(/\\/g, "/").split("/");
  return segments[segments.length - 1] ?? "unknown";
}

// 在 Zig 中以下提取完全在编译期完成
const SOURCE_FILE = comptimeBasename("examples/01-basic/comptime-demo.ts");
const FUNCTION_NAME = "comptimeBasename";

console.log("\n=== 3. 编译期字符串处理 ===");
console.log(`Source file:      ${SOURCE_FILE}  (编译期确定的文件名)`);
console.log(`Function name:    ${FUNCTION_NAME}  (编译期确定的函数名)`);

// ─── 4. 编译期断言与安全检查 (Comptime Assertions) ──────────────────────
// Zig: comptime assert(@sizeOf(T) == 4);
//       编译期验证类型约束，0 运行时开销

/** 模拟编译期断言 —— 在 "编译期" 验证常量约束 */
function comptimeAssert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[COMPTIME ASSERT FAILED] ${message}`);
  }
  console.log(`  [OK] ${message}`);
}

console.log("\n=== 4. 编译期断言与安全检查 ===");

// 验证对齐要求
comptimeAssert(
  ALIGNED_SIZE % ALIGNMENT === 0,
  `ALIGNED_SIZE(${ALIGNED_SIZE}) 必须是 ALIGNMENT(${ALIGNMENT}) 的整数倍`
);
comptimeAssert(
  BUFFER_SIZE > 0,
  `BUFFER_SIZE(${BUFFER_SIZE}) 必须大于 0`
);
comptimeAssert(
  Number.isInteger(PAGE_COUNT),
  `PAGE_COUNT(${PAGE_COUNT}) 必须是整数`
);

// ─── 5. 编译期哈希计算 (Comptime Hash Computation) ─────────────────────
// Zig: const hash = comptime std.hash.Wyhash.hash(secret);
//       编译期计算哈希，运行时直接使用常量

/** 简化的 FNV-1a 哈希 —— 模拟编译期哈希计算 */
function comptimeHash(input: string): number {
  let hash = 0x811C9DC5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // 转为无符号 32 位
}

/** 编译期字符串到标识符的映射表 */
const STRING_TABLE = {
  GET: comptimeHash("GET"),
  POST: comptimeHash("POST"),
  PUT: comptimeHash("PUT"),
  DELETE: comptimeHash("DELETE"),
  CONTENT_TYPE: comptimeHash("content-type"),
  AUTHORIZATION: comptimeHash("authorization"),
} as const;

console.log("\n=== 5. 编译期哈希计算 ===");
console.log("编译期生成的 HTTP 标识符哈希表:");
for (const [key, hash] of Object.entries(STRING_TABLE)) {
  console.log(`  ${key.padEnd(15)} => 0x${hash.toString(16).padStart(8, "0")}`);
}

// ─── 6. 编译期数组生成 (Comptime Array Generation) ──────────────────────
// Zig: const lookup = comptime blk: { ... };
//       编译期生成查找表

/** 编译期生成 256 字节的位反转查找表 */
function generateBitReverseTable(bits: number): Uint8Array {
  const size = 1 << bits;
  const table = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    let reversed = 0;
    let n = i;
    for (let j = 0; j < bits; j++) {
      reversed = (reversed << 1) | (n & 1);
      n >>= 1;
    }
    table[i] = reversed;
  }
  return table;
}

// Zig 编译期执行，运行时无循环
const BIT_REVERSE_TABLE = generateBitReverseTable(8);

console.log("\n=== 6. 编译期数组生成 (位反转查找表) ===");
console.log("BIT_REVERSE_TABLE[0..8]:", Array.from(BIT_REVERSE_TABLE.slice(0, 8)));
console.log("表大小:", BIT_REVERSE_TABLE.length, "字节 (编译期预计算)");

// ─── 总结 ────────────────────────────────────────────────────────────────
console.log("\n=== 总结 ===");
console.log(`
Zig 的 comptime 将以下工作从运行时移到编译期:
  1. 常量折叠       — 常量表达式的值在编译期确定
  2. 类型分发       — 为每种类型生成专用代码，消除分支
  3. 字符串处理     — 路径、标识符等在编译期解析
  4. 编译期断言     — 不满足条件的代码无法通过编译
  5. 哈希计算       — 字符串哈希在编译期完成
  6. 查找表生成     — 复杂数据结构在编译期构建

Bun 利用这些特性:
  - JavaScript 解析器本身由 Zig 编写，comptime 消除了解析中的分支预测
  - HTTP 路由表在编译期生成哈希键
  - 内存分配器的元数据在编译期计算
  - syscall 包装器在编译期选择最佳调用方式
`);

export { comptimeHash, comptimeAssert, generateBitReverseTable, readNumeric };
