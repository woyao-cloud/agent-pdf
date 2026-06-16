import { existsSync } from "fs";
import { resolve } from "path";

const cacheDir = process.env.BUN_INSTALL_CACHE_DIR || resolve(process.env.HOME || "/root", ".bun/install/cache");

console.log("=== Bun Cache Analysis ===");
console.log(`Cache directory: ${cacheDir}`);
console.log(`Cache exists: ${existsSync(cacheDir)}`);

if (existsSync(cacheDir)) {
  const { readdir, stat } = require("fs").promises;
  const entries = await readdir(cacheDir);
  console.log(`Total packages in cache: ${entries.length}`);

  let totalSize = 0;
  for (const entry of entries.slice(0, 20)) {
    const stats = await stat(resolve(cacheDir, entry));
    totalSize += stats.size;
    console.log(`  ${entry}: ${(stats.size / 1024).toFixed(1)} KB`);
  }
  if (entries.length > 20) {
    console.log(`  ... and ${entries.length - 20} more entries`);
  }
  console.log(`\nSampled cache size: ${(totalSize / 1024 / 1024).toFixed(2)} MB (from ${Math.min(entries.length, 20)} packages)`);
}

// Demonstrate key concepts
console.log("\n=== Key Concepts ===");
console.log("1. Global Cache: ~/.bun/install/cache/ stores all downloaded packages");
console.log("2. Hard Links: Multiple projects share same physical file on disk");
console.log("3. Binary Lockfile: bun.lockb is a protobuf-format lockfile");
console.log("4. Parallel Downloads: bun downloads packages concurrently");
console.log("5. Zero Config: No .npmrc needed for basic usage");
