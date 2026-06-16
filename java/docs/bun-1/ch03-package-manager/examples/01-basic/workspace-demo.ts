import { $ } from "bun";
import { existsSync } from "fs";

// Create temporary monorepo structure
const tmpDir = "/tmp/bun-workspace-demo";
await $`rm -rf ${tmpDir} && mkdir -p ${tmpDir}/packages/{utils,app}`;

// Root package.json with workspaces
await Bun.write(`${tmpDir}/package.json`, JSON.stringify({
  name: "workspace-demo",
  private: true,
  workspaces: ["packages/*"],
}, null, 2));

// Utils package
await Bun.write(`${tmpDir}/packages/utils/package.json`, JSON.stringify({
  name: "@demo/utils",
  version: "1.0.0",
  main: "index.ts",
}, null, 2));
await Bun.write(`${tmpDir}/packages/utils/index.ts`, "export const greet = (name: string) => `Hello, ${name}!`;");

// App package depends on utils
await Bun.write(`${tmpDir}/packages/app/package.json`, JSON.stringify({
  name: "@demo/app",
  version: "1.0.0",
  dependencies: { "@demo/utils": "*" },
}, null, 2));
await Bun.write(`${tmpDir}/packages/app/index.ts`,
  'import { greet } from "@demo/utils";\nconsole.log(greet("Bun Workspace"));\n');

// Install and test
console.log("=== Installing workspace... ===");
await $`cd ${tmpDir} && bun install`;
console.log("\n=== Running app with workspace dependency... ===");
await $`cd ${tmpDir}/packages/app && bun run index.ts`;

console.log("\n=== Linking structure ===");
await $`ls -la ${tmpDir}/node_modules/@demo/`;
await $`rm -rf ${tmpDir}`;
