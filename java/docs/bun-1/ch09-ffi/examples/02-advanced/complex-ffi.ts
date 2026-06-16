import { dlopen, CString, ptr, toArrayBuffer, JSCallback } from "bun:ffi";

// ============================================================
// 02-advanced: String & Struct Handling
// ============================================================
// This example demonstrates more complex FFI patterns:
//   - Passing and receiving C strings
//   - Working with structs (via pointer + manual offset calculation)
//   - Registering JS callbacks for C function pointers
//   - Memory management across the FFI boundary

console.log("=== Part 1: String Passing ===\n");

// --- strlen: receiving a return value from C ---
const libc = dlopen("libc.so.6", {
  strlen: { args: ["ptr"], returns: "i64" },
  strdup: { args: ["ptr"], returns: "ptr" },
  free: { args: ["ptr"], returns: "void" },
});

const hello = new CString("Hello Bun FFI!");
const len = libc.symbols.strlen(hello.ptr);
console.log(`strlen("Hello Bun FFI!") = ${len}`);

// --- strdup: receiving a pointer to C-allocated memory ---
const dupPtr = libc.symbols.strdup(hello.ptr);
if (dupPtr !== null) {
  // Read the duplicated string back
  const dupStr = new CString(dupPtr);
  console.log(`strdup result: "${dupStr}"`);

  // IMPORTANT: Memory allocated by C (strdup uses malloc) MUST be freed by C
  libc.symbols.free(dupPtr);
  console.log("Freed duplicated string");
}

console.log("\n=== Part 2: Working with Structs ===\n");

// Bun's FFI doesn't have native struct support, but we can work with
// structs by allocating a buffer of the right size and reading/writing
// fields at specific offsets.

// Example: C struct timespec { time_t tv_sec; long tv_nsec; }
// On 64-bit Linux: tv_sec = 8 bytes (i64), tv_nsec = 8 bytes (i64)
// Total: 16 bytes

// We'll call clock_gettime to fill a timespec struct
const librt = dlopen("librt.so.1", {
  clock_gettime: { args: ["i32", "ptr"], returns: "i32" },
});

// Allocate a 16-byte buffer for the timespec struct
const ts = new Uint8Array(16);
const CLOCK_MONOTONIC = 1;

const ret = librt.symbols.clock_gettime(CLOCK_MONOTONIC, ptr(ts));
if (ret === 0) {
  // Read tv_sec (first 8 bytes, little-endian) and tv_nsec (next 8 bytes)
  const dv = new DataView(ts.buffer);
  const tv_sec = Number(dv.getBigUint64(0, true));
  const tv_nsec = Number(dv.getBigUint64(8, true));
  console.log(`clock_gettime: ${tv_sec}.${tv_nsec.toString().padStart(9, "0")}s`);
}

console.log("\n=== Part 3: Callbacks (JSCallback) ===\n");

// JSCallback allows registering a JavaScript function as a C function pointer.
// This is useful for:
//   - qsort/bsearch comparison functions
//   - signal handlers
//   - iteration callbacks (e.g., FT_List_Files)
//   - async completion callbacks

// Example: using C's qsort with a JS comparator
// qsort(void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *))

const libc2 = dlopen("libc.so.6", {
  qsort: { args: ["ptr", "i64", "i64", "ptr"], returns: "void" },
});

// Create an array of integers to sort
const arr = new Int32Array([42, 3, 17, 8, 99, 23, 1, 56, 34, 7]);
console.log("Before qsort:", Array.from(arr));

// Create a JS callback as a C function pointer
// The comparator receives two pointers to elements, returns negative/zero/positive
const comparator = new JSCallback(
  (aPtr: number, bPtr: number): number => {
    // Read the 32-bit integer values from the pointers
    const a = new Int32Array(1);
    const b = new Int32Array(1);
    const aArr = new Uint8Array(4);
    const bArr = new Uint8Array(4);

    // Use toArrayBuffer to read memory at the pointer
    const aBuf = toArrayBuffer(aPtr, 4);
    const bBuf = toArrayBuffer(bPtr, 4);
    const aView = new DataView(aBuf);
    const bView = new DataView(bBuf);
    const aVal = aView.getInt32(0, true);
    const bVal = bView.getInt32(0, true);
    return aVal - bVal;
  },
  { args: ["ptr", "ptr"], returns: "i32" },
);

// Call qsort
libc2.symbols.qsort(ptr(arr), BigInt(arr.length), BigInt(4), comparator.ptr);
console.log("After qsort: ", Array.from(arr));

// IMPORTANT: Close the JSCallback to release the C function pointer
// If you don't close it, the function pointer leaks.
comparator.close();

console.log("\n=== Part 4: Passing Typed Arrays as Buffers ===\n");

// Example: calling memset via FFI to zero-fill a buffer
// void *memset(void *s, int c, size_t n);

const libc3 = dlopen("libc.so.6", {
  memset: { args: ["ptr", "i32", "i64"], returns: "ptr" },
});

const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
console.log("Before memset:", Array.from(buf));

libc3.symbols.memset(ptr(buf), 0, BigInt(buf.length));
console.log("After memset: ", Array.from(buf));

console.log("\n✅ 02-advanced complete");
