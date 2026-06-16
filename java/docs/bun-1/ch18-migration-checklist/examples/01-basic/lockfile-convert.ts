#!/usr/bin/env bun

/**
 * Chapter 18: 迁移 Checklist
 * Example 01 - Lockfile Conversion
 *
 * Demonstrates converting package-lock.json / yarn.lock to bun.lock
 * and handling lockfile-related migration tasks.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── Lockfile Detection ──────────────────────────────────────────────────

function detectLockfiles(projectDir: string): Record<string, boolean> {
  const lockfiles = {
    "package-lock.json": false,
    "yarn.lock": false,
    "pnpm-lock.yaml": false,
    "bun.lock": false,
    "bun.lockb": false,
  };

  for (const name of Object.keys(lockfiles)) {
    const fullPath = path.join(projectDir, name);
    lockfiles[name] = fs.existsSync(fullPath);
  }

  return lockfiles;
}

// ─── Package.json Analysis ───────────────────────────────────────────────

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  type?: string;
  workspaces?: string[];
  [key: string]: unknown;
}

function analyzePackageJson(projectDir: string): PackageJson | null {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.log("  ✗ package.json not found");
    return null;
  }
  try {
    const content = fs.readFileSync(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.log(`  ✗ Error parsing package.json: ${e}`);
    return null;
  }
}

// ─── Script Compatibility Checker ────────────────────────────────────────

interface ScriptInfo {
  name: string;
  command: string;
  compatible: boolean;
  notes: string;
}

const KNOWN_INCOMPATIBLE_PATTERNS = [
  { pattern: /node\s+-r\s+(ts-node|tsconfig-paths)/, reason: "ts-node register not needed" },
  { pattern: /node\s+--experimental-vm-modules/, reason: "VM modules flag not needed" },
  { pattern: /node\s+--experimental-specifier-resolution/, reason: "Specifier resolution not needed" },
  { pattern: /nodemon/, reason: "Use bun --watch instead" },
  { pattern: /ts-node/, reason: "Use bun directly" },
  { pattern: /tsc\b/, reason: "Use bun build instead" },
  { pattern: /jest\b/, reason: "Use bun test instead" },
  { pattern: /eslint\s/, reason: "Use oxlint or eslint with bun" },
  { pattern: /nyc\b/, reason: "Use bun test --coverage" },
  { pattern: /node\s+--inspect/, reason: "Use bun --inspect" },
  { pattern: /NODE_ENV/, reason: "May need BUN_ENV equivalent" },
  { pattern: /cross-env/, reason: "Not needed on Unix/Bun" },
  { pattern: /rimraf/, reason: "Use rm -rf or bun shell" },
  { pattern: /concurrently/, reason: "May work, consider bun shell pipes" },
  { pattern: /wait-on/, reason: "Consider using bun shell's wait" },
];

function analyzeScripts(pkg: PackageJson): ScriptInfo[] {
  const results: ScriptInfo[] = [];
  if (!pkg.scripts) return results;

  for (const [name, command] of Object.entries(pkg.scripts)) {
    let compatible = true;
    let notes = "";

    for (const { pattern, reason } of KNOWN_INCOMPATIBLE_PATTERNS) {
      if (pattern.test(command)) {
        compatible = false;
        notes = reason;
        break;
      }
    }

    results.push({ name, command, compatible, notes });
  }

  return results;
}

// ─── Dependency Compatibility Check ──────────────────────────────────────

const KNOWN_COMPATIBLE_PACKAGES = [
  "express", "koa", "fastify", "hono", "itty-router",
  "react", "react-dom", "vue", "svelte", "solid-js",
  "lodash", "moment", "dayjs", "date-fns", "uuid",
  "axios", "got", "node-fetch", "undici",
  "pg", "mysql2", "redis", "ioredis", "mongodb",
  "prisma", "drizzle-orm", "typeorm", "knex",
  "zod", "yup", "joi", "ajv",
  "pino", "winston", "bunyan",
  "dotenv", "chalk", "ora", "inquirer", "commander",
  "socket.io", "ws",
  "graphql", "apollo-server", "mercurius",
  "passport", "jsonwebtoken", "bcryptjs",
  "ejs", "pug", "handlebars",
  "sharp", "jimp",
  "cheerio", "jsdom",
  "nanoid", "slugify", "mime-types",
];

const KNOWN_INCOMPATIBLE_PACKAGES: Record<string, string> = {
  "bcrypt": "Use bcryptjs instead",
  "node-sass": "Use sass (Dart Sass) instead",
  "node-canvas": "Use skia-canvas or @napi-rs/canvas",
  "leveldown": "Use classic-level or Bun.SQLite",
  "bufferutil": "Built into Bun",
  "utf-8-validate": "Built into Bun",
  "fsevents": "Built into Bun (macOS)",
};

interface DepInfo {
  name: string;
  version: string;
  status: "compatible" | "incompatible" | "unknown";
  notes: string;
}

function analyzeDependencies(
  deps: Record<string, string> | undefined,
  type: string
): DepInfo[] {
  const results: DepInfo[] = [];
  if (!deps) return results;

  for (const [name, version] of Object.entries(deps)) {
    let status: "compatible" | "incompatible" | "unknown" = "unknown";
    let notes = "";

    if (KNOWN_COMPATIBLE_PACKAGES.includes(name)) {
      status = "compatible";
    } else if (name in KNOWN_INCOMPATIBLE_PACKAGES) {
      status = "incompatible";
      notes = KNOWN_INCOMPATIBLE_PACKAGES[name];
    } else {
      // Check if it's a native module (likely problematic)
      if (name.startsWith("@")) {
        // Scoped packages - harder to determine
        status = "unknown";
      } else {
        status = "unknown";
      }
    }

    results.push({ name, version, status, notes });
  }

  return results;
}

// ─── Migration Checklist Generator ───────────────────────────────────────

interface MigrationStep {
  phase: string;
  step: string;
  status: "pending" | "completed" | "optional";
  details: string;
}

function generateChecklist(pkg: PackageJson): MigrationStep[] {
  const checklist: MigrationStep[] = [];

  // Phase 1: Preparation
  checklist.push({ phase: "准备阶段", step: "备份项目", status: "pending", details: "确保所有代码已提交到 Git" });
  checklist.push({ phase: "准备阶段", step: "记录当前行为", status: "pending", details: "记录 Node.js 版本的构建、测试、运行行为" });
  checklist.push({ phase: "准备阶段", step: "安装 Bun", status: "pending", details: "curl -fsSL https://bun.sh/install | bash" });

  // Phase 2: Dependency Migration
  checklist.push({ phase: "依赖迁移", step: "删除 node_modules", status: "pending", details: "rm -rf node_modules" });
  checklist.push({ phase: "依赖迁移", step: "删除旧锁文件", status: "pending", details: "移除 package-lock.json / yarn.lock" });
  checklist.push({ phase: "依赖迁移", step: "运行 bun install", status: "pending", details: "生成 bun.lock" });

  // Phase 3: Configuration
  checklist.push({ phase: "配置迁移", step: "检查 tsconfig.json", status: "pending", details: "Bun 支持大多数 tsconfig 选项" });
  checklist.push({ phase: "配置迁移", step: "检查 .env 文件", status: "pending", details: "Bun 自动加载 .env 文件" });

  // Phase 4: Script Migration
  if (pkg.scripts) {
    const scripts = analyzeScripts(pkg);
    for (const script of scripts) {
      const status = script.compatible ? "completed" : "pending";
      const details = script.compatible
        ? `脚本 "${script.name}" 兼容`
        : `需要替换: ${script.notes}`;
      checklist.push({ phase: "脚本迁移", step: `检查 "${script.name}"`, status: status as any, details });
    }
  }

  // Phase 5: Testing
  checklist.push({ phase: "测试验证", step: "运行测试", status: "pending", details: "bun test 替代 npm test" });
  checklist.push({ phase: "测试验证", step: "构建验证", status: "pending", details: "bun build 替代 tsc / webpack" });
  checklist.push({ phase: "测试验证", step: "基准测试", status: "pending", details: "对比迁移前后的性能" });

  return checklist;
}

// ─── Bun.lock vs package-lock.json Comparison ───────────────────────────

function compareLockfileFormats(): void {
  console.log("\n  ─── Lockfile Format Comparison ───\n");

  const comparison = [
    { feature: "文件格式", "package-lock.json": "JSON (可读)", "bun.lockb": "二进制 (更快解析)" },
    { feature: "解析速度", "package-lock.json": "10-50ms", "bun.lockb": "< 1ms" },
    { feature: "文件大小", "package-lock.json": "50-500KB", "bun.lockb": "20-200KB (压缩)" },
    { feature: "人类可读", "package-lock.json": "是", "bun.lockb": "否 (但可转为 JSON)" },
    { feature: "Git diff", "package-lock.json": "大 diff", "bun.lockb": "小 diff (二进制)" },
    { feature: "版本锁定", "package-lock.json": "精确版本", "bun.lockb": "精确版本 + 完整性哈希" },
    { feature: "依赖完整性", "package-lock.json": "sha1 校验", "bun.lockb": "sha512 + 完整性映射" },
    { feature: "Monorepo 支持", "package-lock.json": "有限", "bun.lockb": "原生 workspace 支持" },
  ];

  console.log("  Lockfile Feature Comparison:");
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log("  Feature            | package-lock.json | bun.lockb");
  console.log("  ─────────────────────────────────────────────────────────────");
  for (const row of comparison) {
    console.log(
      `  ${row.feature.padEnd(20)}| ${row["package-lock.json"].padEnd(18)}| ${row["bun.lockb"]}`
    );
  }
  console.log("  ─────────────────────────────────────────────────────────────\n");
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Lockfile Conversion & Migration Preparation");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log("═══════════════════════════════════════════════\n");

  // 1. Detect existing lockfiles
  const projectDir = process.cwd();
  console.log("  1. Detecting existing lockfiles...");
  const lockfiles = detectLockfiles(projectDir);
  for (const [name, exists] of Object.entries(lockfiles)) {
    console.log(`     ${exists ? "✓" : " "} ${name}${exists ? "" : " (not found)"}`);
  }

  // 2. Analyze package.json
  console.log("\n  2. Analyzing package.json...");
  const pkg = analyzePackageJson(projectDir);
  if (pkg) {
    console.log(`     Project: ${pkg.name || "unnamed"} v${pkg.version || "?"}`);
    console.log(`     Scripts: ${Object.keys(pkg.scripts || {}).length} defined`);
    console.log(`     Dependencies: ${Object.keys(pkg.dependencies || {}).length}`);
    console.log(`     DevDependencies: ${Object.keys(pkg.devDependencies || {}).length}`);
  }

  // 3. Analyze scripts
  console.log("\n  3. Analyzing script compatibility...");
  if (pkg) {
    const scriptResults = analyzeScripts(pkg);
    let compatCount = 0;
    let incompCount = 0;
    for (const s of scriptResults) {
      if (s.compatible) {
        console.log(`     ✓ ${s.name}: ${s.command.substring(0, 50)}`);
        compatCount++;
      } else {
        console.log(`     ✗ ${s.name}: ${s.command.substring(0, 50)}`);
        console.log(`       → ${s.notes}`);
        incompCount++;
      }
    }
    console.log(`     ${compatCount} compatible, ${incompCount} need changes`);
  }

  // 4. Analyze dependencies
  console.log("\n  4. Analyzing dependency compatibility...");
  if (pkg) {
    const allDeps = {
      ...analyzeDependencies(pkg.dependencies, "dependencies"),
      ...analyzeDependencies(pkg.devDependencies, "devDependencies"),
    };
    let compatDeps = 0;
    let incompDeps = 0;
    let unknownDeps = 0;
    for (const dep of Object.values(allDeps)) {
      if (dep.status === "compatible") compatDeps++;
      else if (dep.status === "incompatible") incompDeps++;
      else unknownDeps++;
    }
    console.log(`     Compatible: ${compatDeps}`);
    console.log(`     Incompatible: ${incompDeps}`);
    console.log(`     Unknown (check needed): ${unknownDeps}`);

    if (incompDeps > 0) {
      console.log("\n     Incompatible packages:");
      for (const dep of Object.values(allDeps)) {
        if (dep.status === "incompatible") {
          console.log(`       ✗ ${dep.name}@${dep.version}: ${dep.notes}`);
        }
      }
    }
  }

  // 5. Lockfile comparison
  compareLockfileFormats();

  // 6. Generate migration checklist
  console.log("\n  5. Migration Checklist:");
  if (pkg) {
    const checklist = generateChecklist(pkg);
    let currentPhase = "";
    for (const item of checklist) {
      if (item.phase !== currentPhase) {
        currentPhase = item.phase;
        console.log(`\n  [${item.phase}]`);
      }
      const icon = item.status === "completed" ? "✓" : item.status === "optional" ? "○" : " ";
      console.log(`  ${icon} ${item.step}`);
      console.log(`     ${item.details}`);
    }
  }

  // 7. Conversion commands
  console.log("\n\n  6. Recommended Migration Commands:");
  console.log("\n  # Step 1: Backup");
  console.log("  git checkout -b migrate-to-bun");
  console.log("  git commit -am 'checkpoint before bun migration'");
  console.log("\n  # Step 2: Convert lockfile");
  console.log("  rm -rf node_modules package-lock.json yarn.lock");
  console.log("  bun install");
  console.log("\n  # Step 3: Test");
  console.log("  bun test");
  console.log("  bun run build");
  console.log("\n  # Step 4: Clean up old config files");
  console.log("  rm -f .npmrc .yarnrc .yarnrc.yml");
  console.log("  rm -f .nvmrc .node-version");
  console.log("\n  # Step 5: Run benchmark comparison");
  console.log("  hyperfine 'node src/index.js' 'bun run src/index.ts'");

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Migration preparation complete.");
  console.log("  See Chapter 18 README for detailed guide.");
  console.log("═══════════════════════════════════════════════\n");
}

await main();
