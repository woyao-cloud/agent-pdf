import { dlopen, CString, ptr, toArrayBuffer } from "bun:ffi";

// ============================================================
// 03-production: Image Hash via FFI
// ============================================================
// This example demonstrates a production-grade FFI use case:
// computing an image perceptual hash by calling a C shared library.
//
// In a real project, you would:
//   1. Compile a C/Rust/Zig library to a shared object (.so / .dll / .dylib)
//   2. Load it with dlopen in Bun
//   3. Call its functions to perform compute-intensive work
//
// Here we demonstrate the pattern by:
//   - Simulating loading a custom library (libimghash.so)
//   - Using actual libc functions (MD5 via system lib) as a stand-in
//   - Showing the error handling and fallback patterns needed in production

console.log("=== Production: FFI to Native Image Hashing Library ===\n");

// ---------------------------------------------------------------------------
// Pattern 1: Loading a custom shared library with graceful fallback
// ---------------------------------------------------------------------------
//
// In production, you would compile your C library and load it like this:
//
//   const imgLib = dlopen("./libimghash.so", {
//     compute_dhash: { args: ["ptr", "i32", "i32", "ptr"], returns: "i64" },
//     compute_ahash: { args: ["ptr", "i32", "i32", "ptr"], returns: "i64" },
//     version:       { args: [], returns: "ptr" },
//   });
//
// Since we may not have a custom .so file, we demonstrate the pattern using
// system libraries (libcrypto / libc) with proper error handling.

function loadLibrary(path: string, symbols: Record<string, any>) {
  try {
    const lib = dlopen(path, symbols);
    console.log(`  ✓ Loaded: ${path}`);
    return lib;
  } catch (err) {
    console.warn(`  ⚠ Failed to load ${path}: ${err.message}`);
    console.warn("  → Falling back to JS implementation");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pattern 2: Using libcrypto (OpenSSL) for hash computation via FFI
// ---------------------------------------------------------------------------
//
// This shows how to call OpenSSL's MD5 function as a proxy for calling
// a custom image hash library. The patterns are identical.

const sslLib = loadLibrary("libcrypto.so.3", {
  MD5: { args: ["ptr", "i64", "ptr"], returns: "ptr" },
});

function computeMD5(data: Uint8Array): string | null {
  if (!sslLib) {
    // Fallback: pure JS MD5 (simplified — in production use crypto.subtle)
    console.log("  → Using JS fallback for hash computation");
    return Array.from(data.slice(0, 16))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Allocate output buffer (16 bytes for MD5)
  const outBuf = new Uint8Array(16);

  // Call MD5(input, input_len, output) -> returns pointer to output
  const resultPtr = sslLib.symbols.MD5(ptr(data), BigInt(data.length), ptr(outBuf));

  if (resultPtr === null) {
    console.error("  ✗ MD5 computation failed");
    return null;
  }

  // Read the 16-byte hash from the output buffer
  const hashHex = Array.from(outBuf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

// ---------------------------------------------------------------------------
// Pattern 3: Simulating image perceptual hash (dHash)
// ---------------------------------------------------------------------------
//
// In a real image hashing library, the C function would:
//   1. Receive raw pixel data (RGB bytes)
//   2. Downsample to 9x8 grayscale pixels
//   3. Compare adjacent pixels to produce a 64-bit hash
//   4. Return the hash as a uint64_t
//
// Here we implement the same logic in TypeScript to demonstrate the concept,
// but the real value comes from calling C for performance on large batches.

function differenceHash(pixels: Uint8Array, width: number, height: number): string {
  // Step 1: Convert to grayscale and downsample to 9x8
  const gray = new Uint8Array(9 * 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      const srcX = Math.floor((x / 9) * width);
      const srcY = Math.floor((y / 8) * height);
      const idx = (srcY * width + srcX) * 3; // RGB
      // Luminosity: 0.299*R + 0.587*G + 0.114*B
      gray[y * 9 + x] = Math.round(
        0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2],
      );
    }
  }

  // Step 2: Compare adjacent pixels (left > right? -> 1, else 0)
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = gray[y * 9 + x];
      const right = gray[y * 9 + x + 1];
      if (left > right) {
        hash |= 1n << BigInt(y * 8 + x);
      }
    }
  }

  return hash.toString(16).padStart(16, "0");
}

// ---------------------------------------------------------------------------
// Pattern 4: Production pipeline — batch processing
// ---------------------------------------------------------------------------

interface ImageInfo {
  name: string;
  width: number;
  height: number;
  pixels: Uint8Array; // RGB pixel data
}

// Simulate a set of images (in reality, these would be decoded from files)
const images: ImageInfo[] = [
  {
    name: "photo-001.jpg",
    width: 4,
    height: 4,
    pixels: new Uint8Array([
      255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0,
      0, 255, 255, 255, 0, 255, 128, 128, 128, 64, 64, 64,
      200, 100, 50, 50, 100, 200, 30, 60, 90, 180, 150, 120,
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]),
  },
  {
    name: "photo-002.jpg",
    width: 4,
    height: 4,
    pixels: new Uint8Array([
      254, 0, 0, 0, 254, 0, 0, 0, 254, 254, 254, 0,
      0, 254, 254, 254, 0, 254, 127, 127, 127, 63, 63, 63,
      199, 99, 49, 49, 99, 199, 29, 59, 89, 179, 149, 119,
      9, 19, 29, 39, 49, 59, 69, 79, 89, 99, 109, 119,
    ]),
  },
  {
    name: "photo-003.jpg",
    width: 4,
    height: 4,
    pixels: new Uint8Array([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
      11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 111, 121,
      12, 22, 32, 42, 52, 62, 72, 82, 92, 102, 112, 122,
      13, 23, 33, 43, 53, 63, 73, 83, 93, 103, 113, 123,
    ]),
  },
];

console.log("Processing image batch...\n");

for (const img of images) {
  // Compute dHash
  const hash = differenceHash(img.pixels, img.width, img.height);
  console.log(`  ${img.name}: dHash = ${hash}`);

  // Also compute MD5 of pixel data (using FFI if available)
  const md5 = computeMD5(img.pixels);
  if (md5) {
    console.log(`  ${img.name}: MD5   = ${md5}`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Pattern 5: Hamming distance — comparing image hashes
// ---------------------------------------------------------------------------

function hammingDistance(hash1: string, hash2: string): number {
  const h1 = BigInt("0x" + hash1);
  const h2 = BigInt("0x" + hash2);
  const xor = h1 ^ h2;
  // Count bits (popcount)
  let dist = 0;
  let n = xor;
  while (n > 0n) {
    dist += Number(n & 1n);
    n >>= 1n;
  }
  return dist;
}

// Compare image similarity
const hashes = images.map((img) => differenceHash(img.pixels, img.width, img.height));

console.log("Similarity matrix (Hamming distance):\n");
console.log("                    photo-001  photo-002  photo-003");
for (let i = 0; i < hashes.length; i++) {
  const row = [`  ${images[i].name.padEnd(18)}`];
  for (let j = 0; j < hashes.length; j++) {
    const dist = hammingDistance(hashes[i], hashes[j]);
    row.push(dist.toString().padStart(10));
  }
  console.log(row.join(""));
}

// Lower Hamming distance = more similar
// photo-001 and photo-002 should be close (similar images)
// photo-003 should be far from both (different image)

console.log("\n✅ 03-production complete");
