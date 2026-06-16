/**
 * allocator-demo.ts — Zig 内存分配器模式演示
 *
 * 本文件演示 Bun 底层使用的 Zig 内存分配策略：
 *   1. 通用目的分配器 (GPA) —— 通用场景的平衡方案
 *   2. 固定缓冲分配器 (FBA) —— 预分配、零碎片
 *   3. 栈分配器 (Stack Allocator) —— LIFO 模式，极致性能
 *   4. 池分配器 (Pool Allocator) —— 固定大小对象，无碎片
 *   5. 页分配器 (Page Allocator) —— 直接 mmap，大对象
 *   6. 分配器组合 —— 多层分配器级联
 *
 * Zig 的分配器接口:
 *   fn allocator: Allocator = .{
 *       .ptr = &self,
 *       .vtable = &.{ .alloc = allocFn, .resize = resizeFn, .free = freeFn },
 *   };
 */

// ─── 基础统计类型 ─────────────────────────────────────────────────────

interface AllocStats {
  allocations: number;
  frees: number;
  totalAllocated: number;
  totalFreed: number;
  currentUsage: number;
  peakUsage: number;
}

interface AllocatorImpl {
  name: string;
  alloc(size: number, alignment: number): ArrayBuffer | null;
  free(ptr: ArrayBuffer): void;
  reset(): void;
  stats(): AllocStats;
}

// ─── 1. 通用目的分配器 (General Purpose Allocator) ─────────────────────
// Zig: std.heap.GeneralPurposeAllocator
// 特点: 线程安全、碎片整理、O(1) 分配/释放、可选的线程缓存

class GeneralPurposeAllocator implements AllocatorImpl {
  name = "GeneralPurposeAllocator";

  private heap: Map<number, { buffer: ArrayBuffer; size: number }> = new Map();
  private nextId = 1;
  private stats_: AllocStats = {
    allocations: 0, frees: 0,
    totalAllocated: 0, totalFreed: 0,
    currentUsage: 0, peakUsage: 0,
  };

  // 最小的分配单元 (Zig GPA 使用 16 字节对齐)
  private readonly MIN_ALIGN = 16;
  // 内存块缓存 —— 重用最近释放的块
  private cache: Array<{ buffer: ArrayBuffer; size: number }> = [];

  alloc(size: number, alignment: number = this.MIN_ALIGN): ArrayBuffer | null {
    // 对齐到 MIN_ALIGN
    const alignedSize = Math.ceil(size / this.MIN_ALIGN) * this.MIN_ALIGN;

    // 尝试从缓存中重用
    for (let i = 0; i < this.cache.length; i++) {
      if (this.cache[i].size >= alignedSize) {
        const entry = this.cache.splice(i, 1)[0];
        const id = this.nextId++;
        this.heap.set(id, entry);
        this.updateStats(entry.size);
        return entry.buffer;
      }
    }

    // 分配新块
    const buffer = new ArrayBuffer(alignedSize);
    const id = this.nextId++;
    this.heap.set(id, { buffer, size: alignedSize });
    this.updateStats(alignedSize);
    return buffer;
  }

  free(ptr: ArrayBuffer): void {
    for (const [id, entry] of this.heap) {
      if (entry.buffer === ptr) {
        this.heap.delete(id);
        this.stats_.frees++;
        this.stats_.totalFreed += entry.size;
        this.stats_.currentUsage -= entry.size;
        // 缓存最近释放的块
        this.cache.push(entry);
        // 限制缓存大小
        if (this.cache.length > 8) {
          this.cache.shift();
        }
        return;
      }
    }
  }

  reset(): void {
    this.heap.clear();
    this.cache = [];
    this.stats_ = { allocations: 0, frees: 0, totalAllocated: 0, totalFreed: 0, currentUsage: 0, peakUsage: 0 };
  }

  stats(): AllocStats {
    return { ...this.stats_ };
  }

  private updateStats(size: number): void {
    this.stats_.allocations++;
    this.stats_.totalAllocated += size;
    this.stats_.currentUsage += size;
    if (this.stats_.currentUsage > this.stats_.peakUsage) {
      this.stats_.peakUsage = this.stats_.currentUsage;
    }
  }
}

// ─── 2. 固定缓冲分配器 (Fixed Buffer Allocator) ────────────────────────
// Zig: std.heap.FixedBufferAllocator
// 特点: 预分配固定大小缓冲区，零系统调用，零碎片

class FixedBufferAllocator implements AllocatorImpl {
  name = "FixedBufferAllocator";

  private buffer: ArrayBuffer;
  private offset = 0;
  private readonly allocations: Array<{ offset: number; size: number }> = [];
  private stats_: AllocStats = {
    allocations: 0, frees: 0,
    totalAllocated: 0, totalFreed: 0,
    currentUsage: 0, peakUsage: 0,
  };

  constructor(capacity: number) {
    this.buffer = new ArrayBuffer(capacity);
  }

  alloc(size: number, _alignment: number = 8): ArrayBuffer | null {
    const alignedSize = Math.ceil(size / 8) * 8;
    if (this.offset + alignedSize > this.buffer.byteLength) {
      return null; // 空间不足
    }

    // 创建指向预分配缓冲区子区域的视图
    const slice = this.buffer.slice(this.offset, this.offset + alignedSize);
    this.allocations.push({ offset: this.offset, size: alignedSize });
    this.offset += alignedSize;

    this.stats_.allocations++;
    this.stats_.totalAllocated += alignedSize;
    this.stats_.currentUsage += alignedSize;
    if (this.stats_.currentUsage > this.stats_.peakUsage) {
      this.stats_.peakUsage = this.stats_.currentUsage;
    }

    return slice;
  }

  free(_ptr: ArrayBuffer): void {
    // FBA: 不支持单个释放，全部一起 reset
    // 这是 Zig FBA 的真实行为 —— 适合临时分配
  }

  reset(): void {
    this.offset = 0;
    this.allocations.length = 0;
    this.stats_ = { allocations: 0, frees: 0, totalAllocated: 0, totalFreed: 0, currentUsage: 0, peakUsage: 0 };
  }

  stats(): AllocStats {
    return { ...this.stats_ };
  }

  get usage(): number {
    return this.offset;
  }

  get capacity(): number {
    return this.buffer.byteLength;
  }

  get remaining(): number {
    return this.buffer.byteLength - this.offset;
  }
}

// ─── 3. 栈分配器 (Stack Allocator) ──────────────────────────────────────
// Zig: std.heap.StackFallbackAllocator / arena 模式
// 特点: LIFO 释放，分配 O(1)，释放 O(1)，极致缓存局部性

class StackAllocator implements AllocatorImpl {
  name = "StackAllocator";

  private chunks: Array<{ buffer: ArrayBuffer; size: number }> = [];
  private stats_: AllocStats = {
    allocations: 0, frees: 0,
    totalAllocated: 0, totalFreed: 0,
    currentUsage: 0, peakUsage: 0,
  };

  alloc(size: number, _alignment: number = 8): ArrayBuffer | null {
    const alignedSize = Math.ceil(size / 8) * 8;
    const buffer = new ArrayBuffer(alignedSize);
    this.chunks.push({ buffer, size: alignedSize });

    this.stats_.allocations++;
    this.stats_.totalAllocated += alignedSize;
    this.stats_.currentUsage += alignedSize;
    if (this.stats_.currentUsage > this.stats_.peakUsage) {
      this.stats_.peakUsage = this.stats_.currentUsage;
    }

    return buffer;
  }

  free(ptr: ArrayBuffer): void {
    // LIFO: 只允许释放最后一个分配的块
    if (this.chunks.length > 0) {
      const last = this.chunks[this.chunks.length - 1];
      if (last.buffer === ptr) {
        this.chunks.pop();
        this.stats_.frees++;
        this.stats_.totalFreed += last.size;
        this.stats_.currentUsage -= last.size;
      }
    }
  }

  reset(): void {
    this.chunks = [];
    this.stats_ = { allocations: 0, frees: 0, totalAllocated: 0, totalFreed: 0, currentUsage: 0, peakUsage: 0 };
  }

  stats(): AllocStats {
    return { ...this.stats_ };
  }
}

// ─── 4. 池分配器 (Pool Allocator) ──────────────────────────────────────
// Zig: std.heap.MemoryPool
// 特点: 固定大小对象，预分配页面，O(1) 分配/释放，零碎片

class PoolAllocator implements AllocatorImpl {
  name = "PoolAllocator";

  private readonly itemSize: number;
  private readonly itemsPerPage: number;
  private freeList: number[] = []; // 空闲索引
  private pages: ArrayBuffer[] = [];
  private stats_: AllocStats = {
    allocations: 0, frees: 0,
    totalAllocated: 0, totalFreed: 0,
    currentUsage: 0, peakUsage: 0,
  };

  constructor(itemSize: number, itemsPerPage: number = 64) {
    this.itemSize = itemSize;
    this.itemsPerPage = itemsPerPage;
  }

  alloc(_size?: number, _alignment?: number): ArrayBuffer | null {
    const size = _size ?? this.itemSize;

    // 从空闲列表获取
    if (this.freeList.length > 0) {
      const index = this.freeList.pop()!;
      const pageIdx = Math.floor(index / this.itemsPerPage);
      const offset = (index % this.itemsPerPage) * this.itemSize;
      const buffer = this.pages[pageIdx].slice(offset, offset + size);
      this.updateStatsOnAlloc(size);
      return buffer;
    }

    // 分配新页面
    const pageSize = this.itemSize * this.itemsPerPage;
    const page = new ArrayBuffer(pageSize);
    const pageIdx = this.pages.length;
    this.pages.push(page);

    // 将新页面中除第一个槽位外的所有槽位加入空闲列表
    for (let i = 1; i < this.itemsPerPage; i++) {
      this.freeList.push(pageIdx * this.itemsPerPage + i);
    }

    // 使用第一个槽位
    const buffer = page.slice(0, size);
    this.updateStatsOnAlloc(size);
    return buffer;
  }

  free(ptr: ArrayBuffer): void {
    // 找到包含此 buffer 的页面
    for (let p = 0; p < this.pages.length; p++) {
      const page = this.pages[p];
      const pageStart = 0;
      const pageEnd = page.byteLength;

      // 通过比较地址范围判断是否属于此页面
      if (ptr.byteLength <= this.itemSize) {
        // 尝试找到对应的槽位
        for (let i = 0; i < this.itemsPerPage; i++) {
          const slotOffset = i * this.itemSize;
          const slotEnd = slotOffset + this.itemSize;
          // 这是一个简化的方式 —— 实际 Zig 使用指针运算
          if (ptr.byteLength <= this.itemSize) {
            const index = p * this.itemsPerPage + i;
            if (!this.freeList.includes(index)) {
              this.freeList.push(index);
              this.stats_.frees++;
              this.stats_.totalFreed += this.itemSize;
              this.stats_.currentUsage -= this.itemSize;
              return;
            }
          }
        }
      }
    }
  }

  reset(): void {
    this.freeList = [];
    this.pages = [];
    this.stats_ = { allocations: 0, frees: 0, totalAllocated: 0, totalFreed: 0, currentUsage: 0, peakUsage: 0 };
  }

  stats(): AllocStats {
    return { ...this.stats_ };
  }

  private updateStatsOnAlloc(size: number): void {
    this.stats_.allocations++;
    this.stats_.totalAllocated += size;
    this.stats_.currentUsage += size;
    if (this.stats_.currentUsage > this.stats_.peakUsage) {
      this.stats_.peakUsage = this.stats_.currentUsage;
    }
  }
}

// ─── 5. 页分配器 (Page Allocator) ──────────────────────────────────────
// Zig: std.heap.PageAllocator
// 特点: 直接 mmap，大对象分配，返回整页

class PageAllocator implements AllocatorImpl {
  name = "PageAllocator";

  private readonly PAGE_SIZE = 4096;
  private pages: Array<{ buffer: ArrayBuffer; size: number }> = [];
  private stats_: AllocStats = {
    allocations: 0, frees: 0,
    totalAllocated: 0, totalFreed: 0,
    currentUsage: 0, peakUsage: 0,
  };

  alloc(size: number, _alignment?: number): ArrayBuffer | null {
    // 页对齐：向上取整到页大小
    const pageCount = Math.ceil(size / this.PAGE_SIZE);
    const alignedSize = pageCount * this.PAGE_SIZE;
    const buffer = new ArrayBuffer(alignedSize);

    this.pages.push({ buffer, size: alignedSize });
    this.stats_.allocations++;
    this.stats_.totalAllocated += alignedSize;
    this.stats_.currentUsage += alignedSize;
    if (this.stats_.currentUsage > this.stats_.peakUsage) {
      this.stats_.peakUsage = this.stats_.currentUsage;
    }
    return buffer;
  }

  free(ptr: ArrayBuffer): void {
    const idx = this.pages.findIndex(p => p.buffer === ptr);
    if (idx !== -1) {
      const entry = this.pages[idx];
      this.pages.splice(idx, 1);
      this.stats_.frees++;
      this.stats_.totalFreed += entry.size;
      this.stats_.currentUsage -= entry.size;
    }
  }

  reset(): void {
    this.pages = [];
    this.stats_ = { allocations: 0, frees: 0, totalAllocated: 0, totalFreed: 0, currentUsage: 0, peakUsage: 0 };
  }

  stats(): AllocStats {
    return { ...this.stats_ };
  }
}

// ─── 6. 分配器组合 (Arena + Fallback) ────────────────────────────────────
// Zig: arena_allocator + fallback 模式
// 特点: 先尝试快速路径 (arena)，失败则回退到慢速路径 (GPA)

class ArenaFallbackAllocator implements AllocatorImpl {
  name = "ArenaFallbackAllocator";

  private arena: FixedBufferAllocator;
  private fallback: GeneralPurposeAllocator;
  private arenaHits = 0;
  private fallbackHits = 0;

  constructor(arenaSize: number) {
    this.arena = new FixedBufferAllocator(arenaSize);
    this.fallback = new GeneralPurposeAllocator();
  }

  alloc(size: number, alignment?: number): ArrayBuffer | null {
    // 先尝试 arena —— 快速路径
    const result = this.arena.alloc(size, alignment);
    if (result !== null) {
      this.arenaHits++;
      return result;
    }
    // arena 空间不足，回退到 GPA
    this.fallbackHits++;
    return this.fallback.alloc(size, alignment);
  }

  free(ptr: ArrayBuffer): void {
    // arena 部分不支持单释放，尝试回退
    this.fallback.free(ptr);
  }

  reset(): void {
    this.arena.reset();
    this.fallback.reset();
    this.arenaHits = 0;
    this.fallbackHits = 0;
  }

  stats(): AllocStats {
    const a = this.arena.stats();
    const f = this.fallback.stats();
    return {
      allocations: a.allocations + f.allocations,
      frees: a.frees + f.frees,
      totalAllocated: a.totalAllocated + f.totalAllocated,
      totalFreed: a.totalFreed + f.totalFreed,
      currentUsage: a.currentUsage + f.currentUsage,
      peakUsage: a.peakUsage + f.peakUsage,
    };
  }

  get allocationStats(): { arenaHits: number; fallbackHits: number; hitRate: string } {
    const total = this.arenaHits + this.fallbackHits;
    return {
      arenaHits: this.arenaHits,
      fallbackHits: this.fallbackHits,
      hitRate: total > 0 ? `${(this.arenaHits / total * 100).toFixed(1)}%` : "N/A",
    };
  }
}

// ─── 运行演示 ────────────────────────────────────────────────────────────

function simulateWorkload(allocator: AllocatorImpl, iterations: number, label: string): void {
  console.log(`\n--- ${label} (${allocator.name}) ---`);

  const allocs: ArrayBuffer[] = [];

  // 分配
  for (let i = 0; i < iterations; i++) {
    const size = (i % 5 + 1) * 64; // 64, 128, 192, 256, 320 字节
    const buf = allocator.alloc(size);
    if (buf) allocs.push(buf);
  }

  // 释放一半
  for (let i = 0; i < Math.floor(allocs.length / 2); i++) {
    allocator.free(allocs[i]);
  }

  const s = allocator.stats();
  console.log(`  分配次数:       ${s.allocations}`);
  console.log(`  释放次数:       ${s.frees}`);
  console.log(`  总分配量:       ${s.totalAllocated} bytes`);
  console.log(`  当前使用量:     ${s.currentUsage} bytes`);
  console.log(`  峰值使用量:     ${s.peakUsage} bytes`);

  // 额外统计
  if (allocator instanceof FixedBufferAllocator) {
    console.log(`  缓冲区容量:     ${allocator.capacity} bytes`);
    console.log(`  剩余空间:       ${allocator.remaining} bytes`);
  }
  if (allocator instanceof ArenaFallbackAllocator) {
    const stats = allocator.allocationStats;
    console.log(`  Arena 命中:     ${stats.arenaHits}`);
    console.log(`  Fallback 命中:  ${stats.fallbackHits}`);
    console.log(`  命中率:         ${stats.hitRate}`);
  }
  if (allocator instanceof PoolAllocator) {
    console.log(`  对象大小:       ${(allocator as any).itemSize} bytes`);
  }

  allocator.reset();
}

console.log("========================================");
console.log("  Zig 内存分配器模式演示 (JavaScript 模拟)");
console.log("========================================");

console.log("\nZig 分配器接口:");
console.log(`  pub const Allocator = struct {
      ptr: *anyopaque,
      vtable: *const VTable,
  };`);
console.log(`  每个分配器提供 alloc / resize / free 三个方法`);

simulateWorkload(new GeneralPurposeAllocator(), 20, "1. 通用目的分配器 (GPA)");
simulateWorkload(new FixedBufferAllocator(4096), 20, "2. 固定缓冲分配器 (FBA)");
simulateWorkload(new StackAllocator(), 20, "3. 栈分配器 (Stack)");
simulateWorkload(new PoolAllocator(64), 20, "4. 池分配器 (Pool, 64B)");
simulateWorkload(new PageAllocator(), 5, "5. 页分配器 (Page)");
simulateWorkload(new ArenaFallbackAllocator(1024), 30, "6. Arena+Fallback 组合分配器");

console.log("\n=== 分配策略对比总结 ===");
console.log(`
分配器类型        | 适用场景              | 分配速度 | 碎片率 | 系统调用
──────────────────┼───────────────────────┼──────────┼────────┼─────────
GPA              | 通用场景              | 快       | 低     | 偶尔
FBA              | 临时/单次分配         | 极快     | 零     | 零
Stack            | LIFO 模式             | 极快     | 零     | 频繁
Pool             | 固定大小对象          | 极快     | 零     | 低频
Page             | 大对象 (>=4KB)        | 中等     | 零     | 一次
Arena+Fallback   | 混合模式              | 快       | 低     | 按需

Bun 在以下场景使用了这些模式:
  - JavaScript 对象分配: Pool Allocator (固定大小 JSCell)
  - HTTP 请求处理: Arena (请求生命周期内分配，结束后整体释放)
  - 文件读取缓冲: Fixed Buffer (预分配 64KB 缓冲区)
  - 大文件处理: Page Allocator (直接 mmap)
  - 通用运行时分配: GPA + thread-local 缓存
`);

export {
  AllocatorImpl, AllocStats,
  GeneralPurposeAllocator,
  FixedBufferAllocator,
  StackAllocator,
  PoolAllocator,
  PageAllocator,
  ArenaFallbackAllocator,
};
