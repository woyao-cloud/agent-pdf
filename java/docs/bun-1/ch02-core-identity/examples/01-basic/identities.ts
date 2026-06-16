// 1. Runtime: Direct TS execution
console.log("=== Identity 1: Runtime ===");
console.log(`Running TypeScript natively, no compilation needed`);
console.log(`Bun version: ${Bun.version}`);

// 2. Package Manager: Fast installs
console.log("\n=== Identity 2: Package Manager ===");
console.log(`bun install: 20x faster than npm`);
console.log(`Uses binary lockfile (bun.lockb)`);

// 3. Bundler: Built-in bundling
console.log("\n=== Identity 3: Bundler ===");
console.log(`bun build replaces webpack/rollup/esbuild`);
console.log(`Targets: browser, bun, node`);

// 4. Test Runner: Native testing
console.log("\n=== Identity 4: Test Runner ===");
const testMock = mock(() => "mocked!");
console.log(`Jest-compatible syntax (describe/it/expect)`);
