import { dlopen, CString, ptr } from "bun:ffi";

// ============================================================
// 01-basic: C Library FFI
// ============================================================
// This example demonstrates the simplest possible FFI call:
// invoking libc's printf function from Bun via bun:ffi.
//
// Key concepts:
//   - dlopen: loads a shared library and binds symbols
//   - CString: a Bun class that allocates a C-compatible null-terminated string
//   - ptr: a raw pointer to the CString's memory (usable as an FFI argument)
//   - Type mapping: JS "ptr"  -> C "char*", JS "int" -> C "int"

// --- Step 1: Load the shared library and declare the symbol signature ---
//
// dlopen(libraryPath, symbolTable):
//   - libraryPath: path to the .so / .dll / .dylib file (or just the soname for system libs)
//   - symbolTable: an object mapping function names to their type signatures
//
// Each symbol entry has:
//   - args: array of argument types ("ptr", "int", "float", "i32", "u64", etc.)
//   - returns: return type ("void", "int", "ptr", "float", etc.)
const lib = dlopen("libc.so.6", {
  printf: { args: ["ptr", "ptr"], returns: "int" },
});

// --- Step 2: Create C-compatible data ---
//
// CString(str) allocates a buffer in Bun's FFI-managed memory containing
// the string content + a null terminator. The .ptr property gives you a
// pointer value that C functions can read.
const msg = new CString("Hello from Bun FFI!\n");

// --- Step 3: Call the C function ---
//
// lib.symbols.printf is a callable JS function that marshals arguments
// across the FFI boundary, calls the real C printf, and returns the result.
//
// printf(format: char*, ...) -> int  (returns number of chars printed)
const result = lib.symbols.printf(msg.ptr, 0);

// --- Step 4: Report ---
console.log(`printf returned ${result} (characters written)`);

// --- Additional examples: calling other libc functions ---
//
// Let's also demonstrate getting the current process ID via getpid,
// and checking the hostname via uname/gethostname.

const lib2 = dlopen("libc.so.6", {
  getpid: { args: [], returns: "int" },
  getuid: { args: [], returns: "int" },
});

const pid = lib2.symbols.getpid();
const uid = lib2.symbols.getuid();
console.log(`Process ID: ${pid}, User ID: ${uid}`);

// --- Demonstrating pointer arithmetic: reading /dev/urandom ---
//
// This shows how to allocate a buffer, pass it to a C function that
// fills it, and then read the result.

import { toArrayBuffer } from "bun:ffi";

const lib3 = dlopen("libc.so.6", {
  getrandom: { args: ["ptr", "i64", "i32"], returns: "i64" },
});

// Allocate a 16-byte buffer
const buf = new Uint8Array(16);
const bytesRead = lib3.symbols.getrandom(ptr(buf), BigInt(16), 0);
console.log(`getrandom: read ${bytesRead} bytes`, Array.from(buf.slice(0, Number(bytesRead))));

console.log("\n✅ 01-basic complete");
