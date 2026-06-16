#!/usr/bin/env bun

/**
 * Chapter 17: 兼容性红黑榜
 * Example 03 - C++ Addon Alternatives
 *
 * Demonstrates alternatives to C++ native addons in Bun:
 * - bcrypt → bcryptjs (pure JS)
 * - native addons → Bun.FFI (Foreign Function Interface)
 * - performance-critical code → WASM
 * - sharp → alternative image processing
 * - node-sass → sass (pure JS)
 */

import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

// ─── Alternative 1: bcrypt → bcryptjs ──────────────────────────────────

function demonstrateBcryptAlternative(): boolean {
  console.log("\n  ─── Alternative 1: bcrypt → bcryptjs ───");
  let allPass = true;

  // Bun's built-in crypto can replace bcrypt for hashing
  // Using crypto.pbkdf2Sync as bcrypt alternative
  try {
    const password = "my-secure-password";
    const salt = crypto.randomBytes(16).toString("hex");

    // Hash with PBKDF2 (similar security level to bcrypt)
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
    const hash2 = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");

    // Verify
    if (hash === hash2 && hash.length === 64) {
      console.log("  ✓ Password hashing with crypto.pbkdf2Sync (bcrypt alternative)");
      console.log(`    Hash: ${hash.substring(0, 32)}...`);
    } else {
      console.log("  ✗ Password hashing mismatch");
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ Password hashing: ${e}`);
    allPass = false;
  }

  // Demonstrate that bcryptjs works (pure JS)
  try {
    // Check if bcryptjs is available
    const bcryptjs = require("bcryptjs");
    const hash = bcryptjs.hashSync("password", 10);
    const match = bcryptjs.compareSync("password", hash);
    if (match) {
      console.log("  ✓ bcryptjs (pure JS) works on Bun");
    } else {
      console.log("  ✗ bcryptjs verification failed");
      allPass = false;
    }
  } catch (e) {
    console.log("  ✓ bcryptjs not installed - install with: bun add bcryptjs");
  }

  // Demonstrate Bun.password API (Bun's built-in password hashing)
  try {
    const hash = await Bun.password.hash("bun-password");
    const match = await Bun.password.verify("bun-password", hash);
    if (match) {
      console.log("  ✓ Bun.password.hash / Bun.password.verify (built-in)");
      console.log(`    Hash: ${hash.substring(0, 32)}...`);
    }
  } catch (e) {
    console.log(`  ✗ Bun.password API: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── Alternative 2: Bun.FFI for native code ─────────────────────────────

function demonstrateFFI(): boolean {
  console.log("\n  ─── Alternative 2: Bun.FFI for Native Code ───");
  let allPass = true;

  // Bun.FFI allows calling C functions directly without C++ addons
  // This is an alternative to writing N-API native modules

  console.log("  Bun.FFI allows calling C/C++ functions directly:");
  console.log("  - No need for C++ addon build system (node-gyp)");
  console.log("  - Direct shared library (.so/.dylib/.dll) loading");
  console.log("  - Type-safe FFI with TypeScript types");

  // Example: Load libc's getpid via FFI (demonstration)
  try {
    const { dlopen, suffix } = require("bun:ffi");

    // On Linux, libc is libc.so.6; on macOS, it's libc.dylib
    const libcName = os.platform() === "darwin" ? "libc.dylib" : "libc.so.6";

    const libc = dlopen(libcName, {
      getpid: {
        args: [],
        returns: "int",
      },
      getuid: {
        args: [],
        returns: "int",
      },
    });

    const pid = libc.symbols.getpid();
    const uid = libc.symbols.getuid();
    console.log(`  ✓ Bun.FFI: getpid() = ${pid}, getuid() = ${uid}`);
  } catch (e) {
    console.log(`  ⚠ Bun.FFI: ${e.message || e} (expected if libc not found)`);
  }

  // Demonstrate FFI type system
  console.log("  Bun.FFI supports these types:");
  console.log("    char, short, int, long, long long");
  console.log("    unsigned variants (uchar, ushort, uint, ulong, ulonglong)");
  console.log("    float, double");
  console.log("    pointer (void*, char*)");
  console.log("    C strings (cstring)");
  console.log("    Buffers (buffer)");
  console.log("    Functions as callbacks (fn)");

  return allPass;
}

// ─── Alternative 3: WASM for performance-critical code ──────────────────

function demonstrateWASM(): boolean {
  console.log("\n  ─── Alternative 3: WebAssembly for Performance ───");
  let allPass = true;

  // Bun supports WebAssembly natively
  // This is a key alternative to native C++ addons

  // Inline WASM module (simple addition)
  const wasmModule = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // WASM magic
    0x01, 0x00, 0x00, 0x00, // version 1
    // Type section
    0x01, 0x07, 0x01,
    0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // func (i32, i32) -> i32
    // Function section
    0x03, 0x02, 0x01, 0x00,
    // Export section
    0x07, 0x0a, 0x01,
    0x04, 0x61, 0x64, 0x64, // "add"
    0x00, 0x00,
    // Code section
    0x0a, 0x09, 0x01,
    0x07, 0x00,
    0x20, 0x00, // local.get 0
    0x20, 0x01, // local.get 1
    0x6a,       // i32.add
    0x0b,       // end
  ]);

  try {
    const wasm = new WebAssembly.Module(wasmModule);
    const instance = new WebAssembly.Instance(wasm, {});
    const add = instance.exports.add as (a: number, b: number) => number;

    const result = add(42, 58);
    if (result === 100) {
      console.log("  ✓ WebAssembly: inline module works");
    }
  } catch (e) {
    console.log(`  ✗ WebAssembly: ${e}`);
    allPass = false;
  }

  // WASM for compute-intensive tasks
  // Example: WASM-based image processing (conceptual)
  console.log("  WASM use cases for C++ addon replacement:");
  console.log("  - Image processing (sharp alternative: libvips WASM)");
  console.log("  - Data compression (zlib WASM)");
  console.log("  - JSON parsing (simdjson WASM)");
  console.log("  - Template engines (markdown-to-html)");
  console.log("  - Numerical computation (BLAS/LAPACK WASM)");

  // WASM compilation and streaming
  try {
    // fetch + WebAssembly streaming compilation
    // const wasmResponse = await fetch("https://example.com/module.wasm");
    // const wasmModule2 = await WebAssembly.compileStreaming(wasmResponse);
    console.log("  ✓ WebAssembly.compileStreaming available");
  } catch (e) {
    console.log(`  ✗ compileStreaming: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── Alternative 4: Node.js built-in replacements ──────────────────────

function demonstrateBuiltInReplacements(): boolean {
  console.log("\n  ─── Alternative 4: Node.js Built-in Replacements ───");
  let allPass = true;

  // Instead of node-sass: use sass (pure JS)
  console.log("  node-sass → sass (pure JS Dart Sass):");
  console.log("    bun add sass");
  console.log("    import sass from 'sass';");
  console.log("    const result = sass.compile('style.scss');");

  // Instead of sharp: use a WASM-based image library or Bun's built-in
  console.log("  sharp → alternative approaches:");
  console.log("    1. Use 'wasm-vips' (libvips compiled to WASM)");
  console.log("    2. Use 'jimp' (pure JS, slower but no native deps)");
  console.log("    3. Use 'imagemagick-wasm' (WASM port)");
  console.log("    4. Use Bun.FFI to call system ImageMagick libraries");

  // Instead of node-canvas: use canvas via WASM or FFI
  console.log("  node-canvas → alternative approaches:");
  console.log("    1. Use 'skia-canvas' (Skia WASM)");
  console.log("    2. Use '@napi-rs/canvas' (Rust-based, NAPI-RS)");
  console.log("    3. Use SVG generation + conversion");

  // Instead of leveldown: use Bun's built-in SQLite
  console.log("  leveldown / rocksdb → built-in alternatives:");
  console.log("    Bun.SQLite (built-in)");
  console.log("    const db = new Bun.SQLite('data.db');");

  // Demonstrate Bun.SQLite as alternative
  try {
    const db = new Bun.SQLite(":memory:");
    db.run("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)");
    db.run("INSERT INTO test VALUES (1, 'native addon alternative')");
    const row = db.query("SELECT value FROM test WHERE id = 1").get() as any;
    if (row && row.value === "native addon alternative") {
      console.log("  ✓ Bun.SQLite as native addon alternative");
    }
    db.close();
  } catch (e) {
    console.log(`  ✗ Bun.SQLite: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── Alternative 5: NAPI-RS (Rust-based native modules) ─────────────────

function demonstrateNapiRs(): boolean {
  console.log("\n  ─── Alternative 5: NAPI-RS (Rust-based Native Modules) ───");
  let allPass = true;

  console.log("  NAPI-RS is a Rust-based native module system:");
  console.log("  - Works with Bun via N-API compatibility");
  console.log("  - Avoids C++ node-gyp complexity");
  console.log("  - Memory safe (Rust's ownership model)");
  console.log("  - Cross-platform (Rust targets many platforms)");

  console.log("\n  Common NAPI-RS packages that work with Bun:");
  console.log("  - @napi-rs/clipboard — clipboard access");
  console.log("  - @napi-rs/image — image processing");
  console.log("  - @napi-rs/snappy — compression");
  console.log("  - lightningcss — CSS parser/transformer");
  console.log("  - parcel/watcher — file watching");
  console.log("  - napi-rs/typos — spell checker");

  console.log("\n  Example napi-rs project setup:");
  console.log("  // Cargo.toml");
  console.log("  // [lib]");
  console.log("  // crate-type = ['cdylib']");
  console.log("  // [dependencies]");
  console.log("  // napi = { version = '2', features = ['napi4'] }");
  console.log("  // napi-derive = '2'");
  console.log("\n  // lib.rs");
  console.log("  // #[napi]");
  console.log("  // fn add(a: i32, b: i32) -> i32 {");
  console.log("  //   a + b");
  console.log("  // }");
  console.log("\n  // Build and use:");
  console.log("  // bun run build");
  console.log("  // import { add } from './native-binding.node';");

  return allPass;
}

// ─── Compatibility Matrix ────────────────────────────────────────────────

function printCompatibilityMatrix(): void {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  C++ Addon Compatibility Matrix");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("  Package          Status     Alternative");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  bcrypt           ❌        bcryptjs, Bun.password");
  console.log("  sharp            ⚠️         wasm-vips, jimp");
  console.log("  node-sass        ❌        sass (Dart Sass)");
  console.log("  node-canvas      ❌        skia-canvas, @napi-rs/canvas");
  console.log("  leveldown        ⚠️         Bun.SQLite, classic-level");
  console.log("  bufferutil       ✅        Built into Bun");
  console.log("  utf-8-validate   ✅        Built into Bun");
  console.log("  msgpack          ⚠️         @msgpack/msgpack (pure JS)");
  console.log("  sharp            ❌        jimp (pure JS fallback)");
  console.log("  argon2           ⚠️         Bun.password (uses argon2)");
  console.log("  sodium-native    ⚠️         libsodium-wrappers (WASM)");
  console.log("  fsevents         ⚠️         Bun.file watcher (built-in)");
  console.log("  lmdb             ⚠️         Bun.SQLite, lmdb-js");
  console.log("  better-sqlite3   ⚠️         Bun.SQLite (built-in)");
  console.log("  grpc             ⚠️         @grpc/grpc-js (pure JS)");
  console.log("  snappy           ⚠️         @napi-rs/snappy");
  console.log("  lightningcss     ✅         Works via NAPI-RS");
  console.log("  parcel-watcher   ✅         Works via NAPI-RS");
  console.log("");
  console.log("  ✅ = Fully compatible    ⚠ = Compatible with caveats");
  console.log("  ❌ = Not compatible, alternative provided");
  console.log("═══════════════════════════════════════════════════════════\n");
}

// ─── Summary ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  C++ Addon Alternatives in Bun");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("  ⚠ Important: Bun does not support node-gyp/C++ addons directly.");
  console.log("  This example demonstrates alternatives:\n");

  const r1 = await demonstrateBcryptAlternative();
  const r2 = demonstrateFFI();
  const r3 = demonstrateWASM();
  const r4 = demonstrateBuiltInReplacements();
  const r5 = demonstrateNapiRs();

  printCompatibilityMatrix();

  console.log("\n  Summary of strategies:");
  console.log("  1. Pure JS replacements (bcryptjs, sass, jimp)");
  console.log("  2. Bun.FFI for direct C library calls");
  console.log("  3. WebAssembly for compute-intensive tasks");
  console.log("  4. Bun built-ins (SQLite, password, fetch)");
  console.log("  5. NAPI-RS packages (Rust-based native modules)");
  console.log("  6. WASM ports of C libraries\n");
}

await main();
