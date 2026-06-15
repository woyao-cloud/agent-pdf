/**
 * 02-advanced: Express Compatibility
 *
 * This example demonstrates running Express.js on Bun.
 * Bun is designed to be a drop-in replacement for Node.js,
 * so most Express apps work without modification.
 *
 * Note: In a real development workflow, you'd use `bun --watch`
 * to auto-restart on file changes, but we omit it here since
 * this runs as a one-shot self-test.
 */

import express from "express";

const app = express();
const PORT = 3001;

// Middleware: parse JSON bodies
app.use(express.json());

// Routes
app.get("/", (_req, res) => {
  res.json({
    message: "Hello from Express running on Bun!",
    bunVersion: Bun.version,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", runtime: "bun" });
});

app.post("/echo", (req, res) => {
  res.json({
    echo: req.body,
    headers: req.headers,
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Express server listening on http://localhost:${PORT}`);
  console.log(`Running on Bun ${Bun.version}`);

  // Self-test: verify the server works by making a request
  // Using Bun's built-in fetch (Web API)
  runSelfTest();
});

async function runSelfTest() {
  try {
    // Test GET /
    const res1 = await fetch(`http://localhost:${PORT}/`);
    const data1 = await res1.json();
    console.log("\n✓ Self-test GET / =>", data1.message);

    // Test GET /health
    const res2 = await fetch(`http://localhost:${PORT}/health`);
    const data2 = await res2.json();
    console.log("✓ Self-test GET /health =>", JSON.stringify(data2));

    // Test POST /echo
    const res3 = await fetch(`http://localhost:${PORT}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "bun" }),
    });
    const data3 = await res3.json();
    console.log("✓ Self-test POST /echo =>", JSON.stringify(data3.echo));

    console.log("\n✓ All Express compatibility tests passed!");
    console.log("  Bun runs Express.js without any code changes.");
  } catch (err) {
    console.error("✗ Self-test failed:", err);
  } finally {
    server.close();
  }
}
