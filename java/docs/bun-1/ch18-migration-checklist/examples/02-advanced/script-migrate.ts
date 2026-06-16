#!/usr/bin/env bun

/**
 * Chapter 18: 迁移 Checklist
 * Example 02 - Script Migration
 *
 * Demonstrates migrating common Node.js scripts to Bun equivalents:
 * - package.json scripts migration
 * - Dockerfile migration
 * - CI/CD configuration migration
 * - Development workflow migration
 */

import * as fs from "fs";
import * as path from "path";

// ─── Script Migration Matrix ─────────────────────────────────────────────

interface ScriptMapping {
  nodeCommand: string;
  bunEquivalent: string;
  notes: string;
  category: string;
}

const SCRIPT_MIGRATIONS: ScriptMapping[] = [
  // Running
  { nodeCommand: "node index.js", bunEquivalent: "bun run index.js", notes: "支持 .ts/.tsx 直接运行", category: "运行" },
  { nodeCommand: "node --watch index.js", bunEquivalent: "bun --watch run index.js", notes: "文件变更自动重启", category: "运行" },
  { nodeCommand: "node --inspect index.js", bunEquivalent: "bun --inspect index.ts", notes: "Chrome DevTools 调试", category: "运行" },
  { nodeCommand: "npx ts-node script.ts", bunEquivalent: "bun run script.ts", notes: "原生 TypeScript 支持", category: "运行" },
  { nodeCommand: "node --experimental-vm-modules", bunEquivalent: "bun run", notes: "Bun 原生支持 ESM", category: "运行" },
  { nodeCommand: "nodemon src/index.js", bunEquivalent: "bun --watch run src/index.ts", notes: "内置 watch 模式", category: "运行" },

  // Testing
  { nodeCommand: "jest", bunEquivalent: "bun test", notes: "兼容 Jest API", category: "测试" },
  { nodeCommand: "jest --coverage", bunEquivalent: "bun test --coverage", notes: "内置覆盖率报告", category: "测试" },
  { nodeCommand: "jest --watch", bunEquivalent: "bun test --watch", notes: "文件变更重新运行", category: "测试" },
  { nodeCommand: "jest --ci", bunEquivalent: "bun test --preload ./setup.ts", notes: "CI 模式配置", category: "测试" },
  { nodeCommand: "mocha test/*.js", bunEquivalent: "bun test", notes: "bun test 兼容主流框架", category: "测试" },
  { nodeCommand: "nyc mocha", bunEquivalent: "bun test --coverage", notes: "内置覆盖率", category: "测试" },

  // Building
  { nodeCommand: "tsc", bunEquivalent: "bun build ./src/index.ts --outdir dist", notes: "TypeScript 打包", category: "构建" },
  { nodeCommand: "webpack --mode production", bunEquivalent: "bun build ./src/index.ts --outdir dist --minify", notes: "内置打包器", category: "构建" },
  { nodeCommand: "tsc --noEmit", bunEquivalent: "bun run tsc --noEmit", notes: "仅类型检查", category: "构建" },
  { nodeCommand: "esbuild src/index.ts --outfile=dist/index.js", bunEquivalent: "bun build src/index.ts --outdir dist", notes: "类似 esbuild", category: "构建" },
  { nodeCommand: "rollup -c", bunEquivalent: "bun build src/index.ts --outdir dist --format esm", notes: "支持 ESM/CJS 输出", category: "构建" },

  // Linting & Formatting
  { nodeCommand: "eslint src/", bunEquivalent: "bunx eslint src/", notes: "eslint 本身兼容", category: "质量" },
  { nodeCommand: "prettier --check .", bunEquivalent: "bunx prettier --check .", notes: "prettier 兼容", category: "质量" },
  { nodeCommand: "oxlint", bunEquivalent: "bunx oxlint", notes: "Rust 实现的 linter", category: "质量" },

  // Dev Tools
  { nodeCommand: "npm run dev", bunEquivalent: "bun run dev", notes: "兼容 npm scripts", category: "开发" },
  { nodeCommand: "npm install", bunEquivalent: "bun install", notes: "快 10-30 倍", category: "开发" },
  { nodeCommand: "npm ci", bunEquivalent: "bun install --frozen-lockfile", notes: "冻结锁文件", category: "开发" },
  { nodeCommand: "npm add express", bunEquivalent: "bun add express", notes: "添加依赖", category: "开发" },
  { nodeCommand: "npm remove express", bunEquivalent: "bun remove express", notes: "移除依赖", category: "开发" },
  { nodeCommand: "npm update", bunEquivalent: "bun update", notes: "更新依赖", category: "开发" },
  { nodeCommand: "npm outdated", bunEquivalent: "bun outdated", notes: "检查过期依赖", category: "开发" },
  { nodeCommand: "npx create-react-app", bunEquivalent: "bunx create-react-app", notes: "bunx 替代 npx", category: "开发" },
  { nodeCommand: "cross-env NODE_ENV=production", bunEquivalent: "NODE_ENV=production", notes: "Unix 直接设置", category: "开发" },
  { nodeCommand: "rimraf dist", bunEquivalent: "rm -rf dist", notes: "Bun 支持 shell 命令", category: "开发" },

  // Docker
  { nodeCommand: "FROM node:20-alpine", bunEquivalent: "FROM oven/bun:latest", notes: "更小的镜像基础", category: "Docker" },
  { nodeCommand: "RUN npm ci", bunEquivalent: "RUN bun install --frozen-lockfile", notes: "更快的安装", category: "Docker" },
  { nodeCommand: "CMD [\"node\", \"index.js\"]", bunEquivalent: "CMD [\"bun\", \"run\", \"index.ts\"]", notes: "Bun 入口", category: "Docker" },
];

// ─── Dockerfile Migration ────────────────────────────────────────────────

function generateMigratedDockerfile(): string {
  return `# === Bun Dockerfile (migrated from Node.js) ===

# Build stage
FROM oven/bun:latest AS builder
WORKDIR /app

# Copy dependency files
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun build ./src/index.ts --outdir dist --target bun

# Production stage
FROM oven/bun:alpine
WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Expose port
EXPOSE 3000

# Run
CMD ["bun", "run", "dist/index.js"]
`;
}

// ─── CI/CD Migration ─────────────────────────────────────────────────────

function generateGithubActionsConfig(): string {
  return `# .github/workflows/ci.yml — Bun CI/CD
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bun test --coverage
      - run: bunx prettier --check .

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run build
      # Add deploy step (e.g., docker build and push)
`;
}

// ─── VSCode Configuration Migration ──────────────────────────────────────

function generateVSCodeConfig(): string {
  return `// .vscode/launch.json — Bun debug configuration
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "bun",
      "request": "launch",
      "name": "Debug Bun",
      "program": "src/index.ts",
      "cwd": "\${workspaceFolder}",
      "stopOnEntry": false,
      "watchMode": false
    },
    {
      "type": "bun",
      "request": "launch",
      "name": "Debug Bun Tests",
      "program": "src/index.test.ts",
      "cwd": "\${workspaceFolder}",
      "stopOnEntry": false
    }
  ]
}
`;
}

// ─── Migration Validation ────────────────────────────────────────────────

interface ValidationResult {
  check: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

function validateMigration(): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Check 1: Bun is installed
  try {
    const version = Bun.version;
    results.push({
      check: "Bun 运行时",
      status: "pass",
      message: `Bun ${version} 已安装`,
    });
  } catch {
    results.push({
      check: "Bun 运行时",
      status: "fail",
      message: "Bun 未安装，请运行 curl -fsSL https://bun.sh/install | bash",
    });
  }

  // Check 2: Node.js scripts
  const pkgPath = path.join(process.cwd(), "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.scripts) {
      const nodeRefs = Object.values(pkg.scripts).filter(
        (s: string) => s.startsWith("node ") || s.includes("ts-node") || s.includes("nodemon")
      );
      if (nodeRefs.length === 0) {
        results.push({
          check: "package.json 脚本",
          status: "pass",
          message: "没有发现需要迁移的 Node.js 脚本",
        });
      } else {
        results.push({
          check: "package.json 脚本",
          status: "warn",
          message: `${nodeRefs.length} 个脚本需要迁移到 Bun 等价命令`,
        });
      }
    }
  }

  // Check 3: Lockfiles
  const hasPackageLock = fs.existsSync("package-lock.json");
  const hasYarnLock = fs.existsSync("yarn.lock");
  const hasBunLock = fs.existsSync("bun.lockb") || fs.existsSync("bun.lock");
  if (hasBunLock) {
    results.push({
      check: "锁文件",
      status: "pass",
      message: "已使用 bun.lock",
    });
  } else if (hasPackageLock || hasYarnLock) {
    results.push({
      check: "锁文件",
      status: "warn",
      message: "需要转换到 bun.lock（bun install 自动完成）",
    });
  }

  // Check 4: .nvmrc
  if (fs.existsSync(".nvmrc")) {
    results.push({
      check: ".nvmrc 文件",
      status: "warn",
      message: "可以移除（Bun 不依赖 nvm）",
    });
  }

  // Check 5: tsconfig
  if (fs.existsSync("tsconfig.json")) {
    const tsconfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf-8"));
    const problemFields = ["outDir", "rootDir", "module", "target"];
    const hasProblems = problemFields.some((f) => tsconfig.compilerOptions?.[f]);
    if (hasProblems) {
      results.push({
        check: "tsconfig.json",
        status: "warn",
        message: "部分 compilerOptions 可能不需要（Bun 有自己的默认值）",
      });
    } else {
      results.push({
        check: "tsconfig.json",
        status: "pass",
        message: "配置简洁，Bun 兼容",
      });
    }
  }

  // Check 6: Environment
  const hasNvmrc = fs.existsSync(".node-version");
  if (hasNvmrc) {
    results.push({
      check: ".node-version",
      status: "warn",
      message: "可以移除或添加 Bun 版本文件",
    });
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Script Migration — Node.js to Bun");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log("═══════════════════════════════════════════════════\n");

  // 1. Migration Matrix
  console.log("  1. Script Migration Matrix");
  console.log("  ──────────────────────────────────────────────────────");

  const categories = [...new Set(SCRIPT_MIGRATIONS.map((m) => m.category))];
  for (const category of categories) {
    console.log(`\n  [${category}]`);
    const items = SCRIPT_MIGRATIONS.filter((m) => m.category === category);
    for (const item of items) {
      console.log(`  Node:    ${item.nodeCommand}`);
      console.log(`  Bun:     ${item.bunEquivalent}`);
      console.log(`  Note:    ${item.notes}`);
      console.log("");
    }
  }

  // 2. Dockerfile Migration
  console.log("\n  2. Dockerfile Migration");
  console.log("  ──────────────────────────────────────────────────────");
  console.log(generateMigratedDockerfile());

  // 3. CI/CD Migration
  console.log("\n  3. CI/CD Migration — GitHub Actions");
  console.log("  ──────────────────────────────────────────────────────");
  console.log(generateGithubActionsConfig());

  // 4. VSCode Configuration
  console.log("\n  4. VSCode Debug Configuration");
  console.log("  ──────────────────────────────────────────────────────");
  console.log(generateVSCodeConfig());

  // 5. Validation
  console.log("\n  5. Migration Validation");
  console.log("  ──────────────────────────────────────────────────────");
  const validation = validateMigration();
  for (const result of validation) {
    const icon = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "⚠";
    console.log(`  ${icon} ${result.check}: ${result.message}`);
  }

  // 6. Quick Reference
  console.log("\n\n  6. Quick Reference — Most Common Migrations");
  console.log("  ──────────────────────────────────────────────────────");
  console.log("  Instead of                   Use");
  console.log("  ──────────────────────────────────────────────────────");
  console.log("  npm install                   bun install");
  console.log("  npx <pkg>                     bunx <pkg>");
  console.log("  node index.js                 bun run index.ts");
  console.log("  nodemon src/index.js          bun --watch run src/index.ts");
  console.log("  jest                          bun test");
  console.log("  tsc                           bun build");
  console.log("  node --inspect                bun --inspect");
  console.log("  npm run dev                   bun run dev");
  console.log("  npm test                      bun test");
  console.log("  npm run build                 bun build");
  console.log("  cross-env VAR=value           VAR=value");
  console.log("  rimraf dist                   rm -rf dist");
  console.log("  concurrently                  bun shell pipes");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Script migration reference complete.");
  console.log("  See Chapter 18 README for detailed migration guide.");
  console.log("═══════════════════════════════════════════════════\n");
}

await main();
