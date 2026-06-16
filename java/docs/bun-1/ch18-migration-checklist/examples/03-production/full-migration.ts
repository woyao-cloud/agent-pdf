#!/usr/bin/env bun

/**
 * Chapter 18: 迁移 Checklist
 * Example 03 - Full Migration Simulation
 *
 * Simulates a complete Node.js to Bun migration workflow:
 * 1. Pre-migration audit
 * 2. Lockfile conversion
 * 3. Script migration
 * 4. Build verification
 * 5. Test suite validation
 * 6. Performance benchmark comparison
 * 7. Production readiness check
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Colors for Terminal Output ──────────────────────────────────────────

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ─── Simulated Project Structure ─────────────────────────────────────────

interface SimulatedProject {
  name: string;
  version: string;
  files: Record<string, string>;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

function createSimulatedProject(): SimulatedProject {
  return {
    name: "my-node-app",
    version: "2.3.1",
    files: {
      "src/index.ts": `
import express from "express";
import { router } from "./routes";
const app = express();
app.use(router);
app.listen(3000, () => console.log("Server running"));
`,
      "src/routes.ts": `
import { Router } from "express";
export const router = Router();
router.get("/", (req, res) => res.json({ status: "ok" }));
`,
      "src/index.test.ts": `
import { describe, it, expect } from "bun:test";
describe("App", () => {
  it("should work", () => {
    expect(1 + 1).toBe(2);
  });
});
`,
      "Dockerfile": `
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc
CMD ["node", "dist/index.js"]
`,
    },
    scripts: {
      "start": "node dist/index.js",
      "dev": "nodemon src/index.ts",
      "build": "tsc",
      "test": "jest --coverage",
      "lint": "eslint src/",
      "clean": "rimraf dist",
      "typecheck": "tsc --noEmit",
    },
    dependencies: {
      "express": "^4.18.2",
      "bcrypt": "^5.1.0",
      "lodash": "^4.17.21",
      "pino": "^8.15.0",
      "dotenv": "^16.3.1",
    },
    devDependencies: {
      "typescript": "^5.3.0",
      "jest": "^29.7.0",
      "eslint": "^8.50.0",
      "nodemon": "^3.0.0",
      "rimraf": "^5.0.0",
      "ts-node": "^10.9.0",
      "@types/express": "^4.17.20",
      "@types/node": "^20.10.0",
    },
  };
}

// ─── Phase 1: Pre-Migration Audit ────────────────────────────────────────

interface AuditIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  issue: string;
  recommendation: string;
}

function performAudit(project: SimulatedProject): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Check for incompatible dependencies
  if (project.dependencies.bcrypt) {
    issues.push({
      severity: "critical",
      category: "依赖兼容性",
      issue: "bcrypt 使用 C++ 原生模块，在 Bun 中不可用",
      recommendation: "替换为 bcryptjs 或使用 Bun.password API",
    });
  }

  // Check for problematic scripts
  if (project.scripts.dev?.includes("nodemon")) {
    issues.push({
      severity: "warning",
      category: "开发脚本",
      issue: "nodemon 在 Bun 中可用但非必要",
      recommendation: "使用 bun --watch 替代",
    });
  }

  if (project.scripts.build === "tsc") {
    issues.push({
      severity: "warning",
      category: "构建脚本",
      issue: "使用 tsc 编译而非 Bun 内置打包器",
      recommendation: "使用 bun build 替代 tsc",
    });
  }

  if (project.scripts.test?.includes("jest")) {
    issues.push({
      severity: "warning",
      category: "测试脚本",
      issue: "使用 Jest 而非 Bun 内置测试框架",
      recommendation: "使用 bun test（兼容 Jest API）",
    });
  }

  if (project.scripts.clean?.includes("rimraf")) {
    issues.push({
      severity: "info",
      category: "工具脚本",
      issue: "rimraf 用于删除目录",
      recommendation: "使用 rm -rf（Bun 支持 shell 命令）",
    });
  }

  // Check for ts-node
  if (project.devDependencies["ts-node"]) {
    issues.push({
      severity: "info",
      category: "开发依赖",
      issue: "ts-node 用于直接运行 TypeScript",
      recommendation: "Bun 原生支持 TypeScript，无需 ts-node",
    });
  }

  // Check nodemon in devDependencies
  if (project.devDependencies.nodemon) {
    issues.push({
      severity: "info",
      category: "开发依赖",
      issue: "nodemon 作为开发依赖",
      recommendation: "可移除，使用 bun --watch",
    });
  }

  // Check rimraf
  if (project.devDependencies.rimraf) {
    issues.push({
      severity: "info",
      category: "开发依赖",
      issue: "rimraf 作为开发依赖",
      recommendation: "可移除，使用 rm -rf",
    });
  }

  // Check Dockerfile
  issues.push({
    severity: "warning",
    category: "Docker 部署",
    issue: "Dockerfile 使用 node:20-alpine 基础镜像",
    recommendation: "使用 oven/bun:alpine，构建和运行阶段分离",
  });

  return issues;
}

// ─── Phase 2: Lockfile Conversion ────────────────────────────────────────

interface ConversionResult {
  originalLockfile: string;
  originalSize: number;
  bunLockfileSize: number;
  packagesCount: number;
  conversionTime: number;
  warnings: string[];
}

function simulateLockfileConversion(project: SimulatedProject): ConversionResult {
  const allDeps = {
    ...project.dependencies,
    ...project.devDependencies,
  };

  // Simulate conversion
  const startTime = Date.now();

  // Simulate reading original lockfile
  const originalSize = Object.keys(allDeps).length * 250 + 500; // Simulated bytes
  const bunLockfileSize = Object.keys(allDeps).length * 100 + 200; // Simulated bytes (compressed)

  const conversionTime = Date.now() - startTime + 235; // Simulated 235ms conversion

  const warnings: string[] = [];
  if (project.dependencies.bcrypt) {
    warnings.push("bcrypt 需要替换为 bcryptjs");
  }
  if (project.devDependencies["ts-node"]) {
    warnings.push("ts-node 不需要安装");
  }

  return {
    originalLockfile: "package-lock.json",
    originalSize,
    bunLockfileSize,
    packagesCount: Object.keys(allDeps).length,
    conversionTime,
    warnings,
  };
}

// ─── Phase 3: Build Verification ─────────────────────────────────────────

interface BuildResult {
  success: boolean;
  duration: number;
  outputSize: number;
  errors: string[];
}

function simulateBuild(project: SimulatedProject): BuildResult {
  const start = Date.now();

  // Simulate build process
  const errors: string[] = [];

  // Simulate checking TypeScript compilation
  const hasTsErrors = false;

  // Simulate bundling
  const duration = Date.now() - start + 847; // Simulated 847ms

  if (hasTsErrors) {
    errors.push("TypeScript 编译错误");
  }

  return {
    success: errors.length === 0,
    duration,
    outputSize: 128 * 1024, // 128KB simulated output
    errors,
  };
}

// ─── Phase 4: Test Suite Validation ──────────────────────────────────────

interface TestResult {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  coverage: {
    lines: number;
    branches: number;
    functions: number;
  };
}

function simulateTests(): TestResult {
  return {
    total: 42,
    passed: 42,
    failed: 0,
    duration: 1234, // 1.234s
    coverage: {
      lines: 87.5,
      branches: 79.3,
      functions: 91.2,
    },
  };
}

// ─── Phase 5: Performance Benchmark ──────────────────────────────────────

interface BenchmarkResult {
  metric: string;
  nodeValue: string;
  bunValue: string;
  improvement: string;
}

function runBenchmark(): BenchmarkResult[] {
  return [
    { metric: "依赖安装", nodeValue: "8.2s", bunValue: "0.9s", improvement: "9.1x faster" },
    { metric: "测试执行 (42 tests)", nodeValue: "3.4s", bunValue: "1.2s", improvement: "2.8x faster" },
    { metric: "构建时间", nodeValue: "5.7s", bunValue: "0.85s", improvement: "6.7x faster" },
    { metric: "冷启动", nodeValue: "180ms", bunValue: "45ms", improvement: "4.0x faster" },
    { metric: "镜像体积", nodeValue: "325MB", bunValue: "182MB", improvement: "1.8x smaller" },
    { metric: "请求吞吐 (RPS)", nodeValue: "22,000", bunValue: "28,000", improvement: "1.27x higher" },
    { metric: "P50 延迟", nodeValue: "3.1ms", bunValue: "2.4ms", improvement: "1.29x lower" },
    { metric: "内存占用 (idle)", nodeValue: "42MB", bunValue: "28MB", improvement: "1.5x less" },
  ];
}

// ─── Phase 6: Production Readiness ───────────────────────────────────────

interface ProductionCheck {
  area: string;
  status: "ready" | "needs-work" | "not-applicable";
  details: string;
}

function checkProductionReadiness(project: SimulatedProject): ProductionCheck[] {
  return [
    {
      area: "运行时兼容性",
      status: "ready",
      details: "Express + Pino + Lodash 均兼容 Bun",
    },
    {
      area: "原生模块",
      status: "needs-work",
      details: "bcrypt 需要替换为 bcryptjs 或 Bun.password",
    },
    {
      area: "构建流程",
      status: "ready",
      details: "bun build 替代 tsc 完成构建",
    },
    {
      area: "测试流程",
      status: "ready",
      details: "bun test 替代 Jest（兼容 Jest API）",
    },
    {
      area: "CI/CD 配置",
      status: "needs-work",
      details: "需要更新 GitHub Actions 配置",
    },
    {
      area: "Docker 部署",
      status: "needs-work",
      details: "需要更新 Dockerfile 使用 oven/bun 镜像",
    },
    {
      area: "监控与日志",
      status: "ready",
      details: "Pino 日志框架兼容",
    },
    {
      area: "进程管理",
      status: "ready",
      details: "Bun 可作为 PM2 替代方案",
    },
    {
      area: "环境变量",
      status: "ready",
      details: "Bun 自动加载 .env 文件",
    },
    {
      area: "TypeScript 支持",
      status: "ready",
      details: "Bun 原生支持，无需 tsc",
    },
  ];
}

// ─── Main Migration Simulation ───────────────────────────────────────────

async function main() {
  console.log(colors.bold("\n═══════════════════════════════════════════════════════════════"));
  console.log(colors.bold("      Full Migration Simulation: Node.js → Bun"));
  console.log(colors.bold("═══════════════════════════════════════════════════════════════\n"));

  const project = createSimulatedProject();
  console.log(`  Project: ${colors.cyan(project.name)} v${project.version}`);
  console.log(`  Dependencies: ${Object.keys(project.dependencies).length}`);
  console.log(`  Dev Dependencies: ${Object.keys(project.devDependencies).length}`);
  console.log(`  Scripts: ${Object.keys(project.scripts).length}`);

  // ── Phase 1: Audit ──────────────────────────────────────────────────
  console.log(colors.bold("\n  ── Phase 1: Pre-Migration Audit ──\n"));

  const issues = performAudit(project);
  const criticals = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  console.log(`  Found ${criticals.length} critical, ${warnings.length} warnings, ${infos.length} info items\n`);

  for (const issue of issues) {
    const sev = issue.severity === "critical" ? colors.red("CRITICAL")
      : issue.severity === "warning" ? colors.yellow("WARNING")
      : colors.blue("INFO");
    console.log(`  [${sev}] ${issue.category}`);
    console.log(`        ${issue.issue}`);
    console.log(`        → ${issue.recommendation}\n`);
  }

  // ── Phase 2: Lockfile Conversion ────────────────────────────────────
  console.log(colors.bold("  ── Phase 2: Lockfile Conversion ──\n"));

  const conversion = simulateLockfileConversion(project);
  console.log(`  Original: ${conversion.originalLockfile} (${(conversion.originalSize / 1024).toFixed(1)}KB)`);
  console.log(`  Bun lock: bun.lockb (${(conversion.bunLockfileSize / 1024).toFixed(1)}KB)`);
  console.log(`  Size reduction: ${((1 - conversion.bunLockfileSize / conversion.originalSize) * 100).toFixed(0)}%`);
  console.log(`  Packages: ${conversion.packagesCount}`);
  console.log(`  Conversion: ${conversion.conversionTime}ms`);

  if (conversion.warnings.length > 0) {
    console.log(colors.yellow("\n  Warnings:"));
    for (const w of conversion.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  // ── Phase 3: Build Verification ─────────────────────────────────────
  console.log(colors.bold("\n  ── Phase 3: Build Verification ──\n"));

  const build = simulateBuild(project);
  if (build.success) {
    console.log(colors.green(`  ✓ Build successful in ${build.duration}ms`));
    console.log(`    Output: ${(build.outputSize / 1024).toFixed(1)}KB`);
  } else {
    console.log(colors.red(`  ✗ Build failed with ${build.errors.length} errors`));
    for (const err of build.errors) {
      console.log(`    ${err}`);
    }
  }

  // ── Phase 4: Test Suite ─────────────────────────────────────────────
  console.log(colors.bold("\n  ── Phase 4: Test Suite Validation ──\n"));

  const tests = simulateTests();
  const testIcon = tests.failed === 0 ? colors.green("✓") : colors.red("✗");
  console.log(`  ${testIcon} ${tests.passed}/${tests.total} tests passed in ${(tests.duration / 1000).toFixed(2)}s`);
  console.log(`  Coverage: ${tests.coverage.lines}% lines, ${tests.coverage.branches}% branches, ${tests.coverage.functions}% functions`);

  // ── Phase 5: Benchmark ──────────────────────────────────────────────
  console.log(colors.bold("\n  ── Phase 5: Performance Benchmark ──\n"));

  const benchmarks = runBenchmark();
  console.log("  Metric              | Node.js  | Bun      | Improvement");
  console.log("  ─────────────────────────────────────────────────────────");
  for (const b of benchmarks) {
    console.log(`  ${b.metric.padEnd(20)}| ${b.nodeValue.padEnd(9)}| ${b.bunValue.padEnd(9)}| ${colors.green(b.improvement)}`);
  }

  // ── Phase 6: Production Readiness ───────────────────────────────────
  console.log(colors.bold("\n  ── Phase 6: Production Readiness Check ──\n"));

  const readiness = checkProductionReadiness(project);
  const readyCount = readiness.filter((r) => r.status === "ready").length;
  const needsWork = readiness.filter((r) => r.status === "needs-work").length;

  for (const check of readiness) {
    const icon = check.status === "ready" ? colors.green("✓")
      : check.status === "needs-work" ? colors.yellow("⚠")
      : colors.dim("○");
    console.log(`  ${icon} ${check.area.padEnd(22)} ${check.details}`);
  }

  console.log(`\n  Readiness: ${colors.green(`${readyCount} ready`)}${needsWork > 0 ? `, ${colors.yellow(`${needsWork} need work`)}` : ""}`);

  // ── Final Summary ───────────────────────────────────────────────────
  console.log(colors.bold("\n═══════════════════════════════════════════════════════════════"));
  console.log(colors.bold("  Migration Summary"));
  console.log(colors.bold("═══════════════════════════════════════════════════════════════\n"));

  const totalChecks = readiness.length;
  const passPercent = (readyCount / totalChecks * 100).toFixed(0);
  const migrationTime = "30-60 minutes (estimated for this project size)";

  console.log(`  Project: ${project.name} v${project.version}`);
  console.log(`  Migration readiness: ${passPercent}% (${readyCount}/${totalChecks} checks passed)`);
  console.log(`  Estimated migration time: ${migrationTime}`);
  console.log(`  Estimated improvements:`);
  console.log(`    • Install speed: 9.1x faster`);
  console.log(`    • Build speed: 6.7x faster`);
  console.log(`    • Test speed: 2.8x faster`);
  console.log(`    • Cold start: 4.0x faster`);
  console.log(`    • Image size: 1.8x smaller`);
  console.log(`    • Throughput: 1.27x higher`);

  console.log(colors.bold("\n  Recommended migration order:"));
  console.log("  1. Replace bcrypt → bcryptjs or Bun.password");
  console.log("  2. Update Dockerfile → oven/bun:alpine");
  console.log("  3. Migrate scripts → bun equivalents");
  console.log("  4. Update CI/CD → oven-sh/setup-bun");
  console.log("  5. Run tests → verify all pass");
  console.log("  6. Performance benchmark → compare results");
  console.log("  7. Deploy → canary release to production");

  console.log(colors.bold("\n═══════════════════════════════════════════════════════════════\n"));
}

await main();
