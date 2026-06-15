/**
 * 01-basic: Hello Bun
 *
 * This example demonstrates Bun's key features for running TypeScript
 * directly without compilation, including built-in Web APIs and
 * Bun-specific runtime APIs.
 */

// Bun.version — access the runtime version at any time
console.log("Bun version:", Bun.version);

// Bun.nanoseconds() — high-resolution timer for benchmarking
const start = Bun.nanoseconds();

// Built-in fetch() — Web API, no import required
const response = await fetch("https://httpbin.org/json");
const data = await response.json();

const end = Bun.nanoseconds();
const elapsed = (end - start) / 1_000_000; // convert to milliseconds

console.log("HTTP GET https://httpbin.org/json");
console.log("Status:", response.status);
console.log("Response keys:", Object.keys(data).join(", "));
console.log("Request took:", elapsed.toFixed(2), "ms");

// Demonstrate Bun's built-in hash functions
const input = "Hello, Bun!";
const hash = await Bun.hash(input);
console.log("Bun.hash of", JSON.stringify(input), "=>", hash);

// Bun.env — access environment variables (empty in this context)
console.log("Environment keys:", Object.keys(Bun.env).slice(0, 5).join(", "), "...");

// Demonstrate Bun.file() — filesystem API
const outputPath = "/tmp/bun-hello-output.txt";
await Bun.write(outputPath, `Bun version: ${Bun.version}\nFetched at: ${new Date().toISOString()}\n`);
const content = await Bun.file(outputPath).text();
console.log("Written to", outputPath, "=>", content.trim());

console.log("\n✓ Bun runs TypeScript directly — no tsc, no ts-node, no config!");
