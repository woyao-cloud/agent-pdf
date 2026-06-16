// Bun.file basics: lazy evaluation, reading, writing
import { write } from "bun";

// Lazy evaluation: Bun.file() doesn't read until .text()/.json()/.arrayBuffer() is called
const file = Bun.file("/tmp/hello.txt");
console.log("Bun.file created (lazy — no disk access yet)");
console.log("File exists?", file.exists()); // true/false
console.log("File size:", file.size);       // 0 before write

// Write a file
await Bun.write("/tmp/hello.txt", "Hello, Bun I/O!");
console.log("Written: 'Hello, Bun I/O!'");

// Read back (triggers actual disk I/O)
const content = await Bun.file("/tmp/hello.txt").text();
console.log("Read back:", content);

// Stream reading
const stream = Bun.file("/tmp/hello.txt").stream();
const reader = stream.getReader();
const { value } = await reader.read();
console.log("Stream read:", new TextDecoder().decode(value));

console.log("\n✓ Bun.file: lazy, zero-copy, streaming-ready");
