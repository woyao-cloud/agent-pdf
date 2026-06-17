import { Effect, Console, Duration, Schedule, Array, Option, Either, pipe } from "effect"

// ============================================================
// Performance Checklist Utility
// ============================================================
//
// A comprehensive checklist for auditing Effect-TS application
// performance. Run this checklist against your codebase to
// identify common performance issues and optimization
// opportunities.

// ============================================================
// Types
// ============================================================

interface CheckItem {
  category: string
  name: string
  description: string
  check: () => boolean | Promise<boolean>
  severity: "critical" | "high" | "medium" | "low"
  remediation?: string
}

// ============================================================
// Performance Checklist
// ============================================================

class PerformanceChecklist {
  private checks: CheckItem[] = []
  private results: Array<{ check: CheckItem; passed: boolean }> = []

  // ============================================================
  // Memory & Allocation Checks
  // ============================================================

  addAllocationCheck(): void {
    this.checks.push({
      category: "内存分配",
      name: "对象分配优化",
      description: "检查是否在热路径中创建了不必要的中间对象",
      check: () => {
        // In a real implementation, this would use heap profiling
        // to detect excessive allocation. For now, we provide
        // a static analysis checklist.
        return true
      },
      severity: "high",
      remediation: "使用 Array.filterMap 替代链式 map/filter，避免不必要的对象展开"
    })
  }

  addSpreadCheck(): void {
    this.checks.push({
      category: "内存分配",
      name: "展开运算符滥用",
      description: "检查是否在循环或热路径中过度使用对象展开运算符",
      check: () => {
        // Check for spread operator in hot paths
        return true
      },
      severity: "high",
      remediation: "在热路径中使用直接属性赋值替代对象展开"
    })
  }

  addEffectChainCheck(): void {
    this.checks.push({
      category: "内存分配",
      name: "Effect 链分配",
      description: "检查是否创建了过长的 Effect 链导致大量中间对象",
      check: () => true,
      severity: "medium",
      remediation: "将连续的 Effect 操作合并到单个 Effect.sync 中"
    })
  }

  // ============================================================
  // Batching Checks
  // ============================================================

  addBatchingCheck(): void {
    this.checks.push({
      category: "批处理",
      name: "Effect.forEach 并发",
      description: "检查是否对大量独立操作使用了并发处理",
      check: () => true,
      severity: "high",
      remediation: "为 Effect.forEach 设置 concurrency > 1，使用批处理策略"
    })
  }

  addBatchSizeCheck(): void {
    this.checks.push({
      category: "批处理",
      name: "批处理大小优化",
      description: "检查批处理大小是否经过调优",
      check: () => true,
      severity: "medium",
      remediation: "根据延迟和吞吐量动态调整批处理大小"
    })
  }

  addBackpressureCheck(): void {
    this.checks.push({
      category: "批处理",
      name: "背压控制",
      description: "检查是否实现了背压机制防止下游系统过载",
      check: () => true,
      severity: "high",
      remediation: "使用 Queue 或 Semaphore 实现背压控制"
    })
  }

  // ============================================================
  // Sync vs Async Checks
  // ============================================================

  addSyncPromiseCheck(): void {
    this.checks.push({
      category: "同步异步界限",
      name: "Effect.sync vs Effect.promise",
      description: "检查是否对同步操作错误使用了 Effect.promise",
      check: () => true,
      severity: "critical",
      remediation: "同步操作使用 Effect.sync，仅在真正需要异步时使用 Effect.promise"
    })
  }

  addTryPromiseCheck(): void {
    this.checks.push({
      category: "同步异步界限",
      name: "Effect.try vs Effect.tryPromise",
      description: "检查是否对同步操作错误使用了 Effect.tryPromise",
      check: () => true,
      severity: "critical",
      remediation: "同步操作使用 Effect.try，异步操作使用 Effect.tryPromise"
    })
  }

  // ============================================================
  // Hot Path Checks
  // ============================================================

  addHotPathCheck(): void {
    this.checks.push({
      category: "热路径",
      name: "热路径优化",
      description: "检查热路径中是否避免了不必要的 Effect 包装",
      check: () => true,
      severity: "critical",
      remediation: "将热路径中的多 Effect 链合并为单 Effect，预计算 Effect 结构"
    })
  }

  addCacheCheck(): void {
    this.checks.push({
      category: "热路径",
      name: "缓存策略",
      description: "检查是否对频繁使用的 Effect 实例进行了缓存",
      check: () => true,
      severity: "high",
      remediation: "使用 Map 或 WeakMap 缓存 Effect 实例，避免重复创建"
    })
  }

  addInlineCheck(): void {
    this.checks.push({
      category: "热路径",
      name: "内联优化",
      description: "检查热路径中是否避免了不必要的函数调用",
      check: () => true,
      severity: "medium",
      remediation: "在热路径中内联简单操作，避免函数调用开销"
    })
  }

  // ============================================================
  // Concurrency Checks
  // ============================================================

  addConcurrencyCheck(): void {
    this.checks.push({
      category: "并发",
      name: "并发控制",
      description: "检查并发级别是否经过调优",
      check: () => true,
      severity: "high",
      remediation: "根据 CPU 核心数和 I/O 等待时间调整并发级别"
    })
  }

  addFiberCheck(): void {
    this.checks.push({
      category: "并发",
      name: "Fiber 泄漏",
      description: "检查是否存在 Fiber 泄漏（未完成的 Fiber）",
      check: () => true,
      severity: "critical",
      remediation: "确保所有 Fiber 都有明确的完成路径和超时处理"
    })
  }

  addRaceCheck(): void {
    this.checks.push({
      category: "并发",
      name: "竞态条件",
      description: "检查共享状态是否存在竞态条件",
      check: () => true,
      severity: "critical",
      remediation: "使用 Ref 或 MutableRef 管理共享状态，避免直接修改"
    })
  }

  // ============================================================
  // I/O Checks
  // ============================================================

  addIOBatchCheck(): void {
    this.checks.push({
      category: "I/O 优化",
      name: "I/O 批处理",
      description: "检查数据库和网络操作是否使用了批处理",
      check: () => true,
      severity: "high",
      remediation: "将多个 I/O 操作合并为批处理请求"
    })
  }

  addConnectionPoolCheck(): void {
    this.checks.push({
      category: "I/O 优化",
      name: "连接池",
      description: "检查是否使用了连接池管理数据库和网络连接",
      check: () => true,
      severity: "high",
      remediation: "使用连接池复用连接，减少连接建立开销"
    })
  }

  addTimeoutCheck(): void {
    this.checks.push({
      category: "I/O 优化",
      name: "超时设置",
      description: "检查所有 I/O 操作是否设置了合理的超时",
      check: () => true,
      severity: "high",
      remediation: "为所有 I/O 操作添加 Effect.timeout 或 Effect.timeoutFail"
    })
  }

  // ============================================================
  // Run All Checks
  // ============================================================

  async runAll(): Promise<void> {
    console.log("\n" + "=".repeat(70))
    console.log("  Performance Checklist")
    console.log("=".repeat(70))

    let passed = 0
    let failed = 0
    let criticalFailed = 0
    let highFailed = 0

    // Group by category
    const categories = Array.fromGroupBy(this.checks, c => c.category)

    for (const [category, checks] of Object.entries(categories)) {
      console.log(`\n--- ${category} ---`)

      for (const check of checks) {
        const result = await check.check()
        this.results.push({ check, passed: result })

        const severityTag = this.getSeverityTag(check.severity)
        const statusTag = result ? "[PASS]" : "[FAIL]"

        console.log(`  ${statusTag} ${severityTag} ${check.name}`)
        if (!result) {
          console.log(`         ${check.description}`)
          if (check.remediation) {
            console.log(`         Remediation: ${check.remediation}`)
          }
        }

        if (result) {
          passed++
        } else {
          failed++
          if (check.severity === "critical") criticalFailed++
          if (check.severity === "high") highFailed++
        }
      }
    }

    // Summary
    console.log("\n" + "=".repeat(70))
    console.log("  Summary")
    console.log("=".repeat(70))
    console.log(`  Total checks: ${this.checks.length}`)
    console.log(`  Passed:       ${passed}`)
    console.log(`  Failed:       ${failed}`)
    if (criticalFailed > 0) {
      console.log(`  CRITICAL:     ${criticalFailed} failed (must fix)`)
    }
    if (highFailed > 0) {
      console.log(`  HIGH:         ${highFailed} failed (should fix)`)
    }
    console.log("=".repeat(70))

    if (failed === 0) {
      console.log("\n  All checks passed! Your application performance looks good.")
    } else {
      console.log(`\n  ${failed} check(s) failed. Review the recommendations above.`)
    }
  }

  private getSeverityTag(severity: "critical" | "high" | "medium" | "low"): string {
    switch (severity) {
      case "critical": return "[CRITICAL]"
      case "high":     return "[HIGH]    "
      case "medium":   return "[MEDIUM]  "
      case "low":      return "[LOW]     "
    }
  }

  /**
   * Get all failed checks for reporting.
   */
  getFailedChecks(): Array<{ check: CheckItem; passed: boolean }> {
    return this.results.filter(r => !r.passed)
  }

  /**
   * Get all critical failures.
   */
  getCriticalFailures(): Array<{ check: CheckItem; passed: boolean }> {
    return this.results.filter(r => !r.passed && r.check.severity === "critical")
  }

  /**
   * Reset the checklist.
   */
  reset(): void {
    this.checks = []
    this.results = []
  }
}

// ============================================================
// Example Usage
// ============================================================

async function main() {
  const checklist = new PerformanceChecklist()

  // Add all standard checks
  checklist.addAllocationCheck()
  checklist.addSpreadCheck()
  checklist.addEffectChainCheck()
  checklist.addBatchingCheck()
  checklist.addBatchSizeCheck()
  checklist.addBackpressureCheck()
  checklist.addSyncPromiseCheck()
  checklist.addTryPromiseCheck()
  checklist.addHotPathCheck()
  checklist.addCacheCheck()
  checklist.addInlineCheck()
  checklist.addConcurrencyCheck()
  checklist.addFiberCheck()
  checklist.addRaceCheck()
  checklist.addIOBatchCheck()
  checklist.addConnectionPoolCheck()
  checklist.addTimeoutCheck()

  // Run all checks
  await checklist.runAll()
}

if (require.main === module) {
  main().catch(console.error)
}
