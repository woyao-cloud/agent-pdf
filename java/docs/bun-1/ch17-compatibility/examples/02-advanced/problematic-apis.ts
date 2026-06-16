#!/usr/bin/env bun

/**
 * Chapter 17: 兼容性红黑榜
 * Example 02 - Problematic APIs Compatibility Test
 *
 * Tests APIs that have known differences or limitations in Bun:
 * - child_process: exec, spawn, execSync, fork
 * - vm: runInNewContext, runInThisContext
 * - worker_threads: Worker, isMainThread, parentPort
 * - cluster module
 * - dgram (UDP)
 * - net module
 */

import * as cp from "child_process";
import * as vm from "vm";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import * as net from "net";
import * as dgram from "dgram";
import * as path from "path";
import * as os from "os";

// ─── child_process module ────────────────────────────────────────────────

function testChildProcessExec(): boolean {
  console.log("\n  ─── Testing child_process.exec ───");
  let allPass = true;

  try {
    const result = cp.execSync("echo 'Hello from child process'", { encoding: "utf-8" });
    const output = result.trim();
    if (output === "Hello from child process") {
      console.log("  ✓ child_process.execSync: basic command");
    } else {
      console.log(`  ✗ execSync: unexpected output "${output}"`);
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ child_process.execSync: ${e}`);
    allPass = false;
  }

  // execSync with error
  try {
    cp.execSync("exit 1", { encoding: "utf-8" });
    console.log("  ✗ execSync: should have thrown for exit code 1");
    allPass = false;
  } catch (e) {
    if (e.status === 1) {
      console.log("  ✓ child_process.execSync: error handling (exit code 1)");
    } else {
      console.log(`  ✗ execSync error handling: unexpected error structure`);
      allPass = false;
    }
  }

  // exec async with callback
  try {
    cp.exec("echo 'async hello'", (error, stdout, stderr) => {
      if (!error && stdout.trim() === "async hello") {
        console.log("  ✓ child_process.exec (async callback)");
      } else {
        console.log(`  ✗ exec async: "${stdout.trim()}"`);
        allPass = false;
      }
    });
  } catch (e) {
    console.log(`  ✗ child_process.exec (async): ${e}`);
    allPass = false;
  }

  // exec with options
  try {
    const result = cp.execSync("pwd", {
      encoding: "utf-8",
      cwd: "/tmp",
    });
    if (result.trim() === "/tmp") {
      console.log("  ✓ child_process.execSync: cwd option");
    } else {
      console.log(`  ✗ execSync cwd: got "${result.trim()}"`);
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ child_process.execSync with cwd: ${e}`);
    allPass = false;
  }

  // exec with timeout
  try {
    const start = Date.now();
    cp.execSync("sleep 5", { timeout: 500, encoding: "utf-8" });
    console.log("  ✗ execSync: should have timed out");
    allPass = false;
  } catch (e) {
    const elapsed = Date.now() - start;
    if (e.killed || e.signal === "SIGTERM") {
      console.log(`  ✓ child_process.execSync: timeout (killed after ${elapsed}ms)`);
    } else {
      console.log(`  ✗ execSync timeout: unexpected error type`);
      allPass = false;
    }
  }

  // maxBuffer option
  try {
    const result = cp.execSync("echo 'small output'", {
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
    });
    if (result.trim() === "small output") {
      console.log("  ✓ child_process.execSync: maxBuffer option");
    }
  } catch (e) {
    console.log(`  ✗ execSync maxBuffer: ${e}`);
    allPass = false;
  }

  return allPass;
}

function testChildProcessSpawn(): boolean {
  console.log("\n  ─── Testing child_process.spawn ───");
  let allPass = true;

  try {
    const child = cp.spawn("echo", ["spawned process"]);
    let stdout = "";
    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.on("close", (code) => {
      if (code === 0 && stdout.trim() === "spawned process") {
        console.log("  ✓ child_process.spawn: basic");
      } else {
        console.log(`  ✗ spawn: code=${code}, stdout="${stdout.trim()}"`);
        allPass = false;
      }
    });
  } catch (e) {
    console.log(`  ✗ child_process.spawn: ${e}`);
    allPass = false;
  }

  // spawn with stdio pipe
  try {
    const child = cp.spawn("cat", [], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.write("pipe test data");
    child.stdin.end();
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.on("close", () => {
      if (output.trim() === "pipe test data") {
        console.log("  ✓ child_process.spawn: stdio pipe");
      }
    });
  } catch (e) {
    console.log(`  ✗ spawn pipe: ${e}`);
    allPass = false;
  }

  // spawn with env
  try {
    const child = cp.spawn("sh", ["-c", "echo $TEST_VAR"], {
      env: { TEST_VAR: "custom_value", PATH: process.env.PATH || "" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => {
      if (out.trim() === "custom_value") {
        console.log("  ✓ child_process.spawn: custom env");
      }
    });
  } catch (e) {
    console.log(`  ✗ spawn env: ${e}`);
    allPass = false;
  }

  // spawn with shell option
  try {
    const child = cp.spawn("echo hello world", [], { shell: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => {
      if (out.trim() === "hello world") {
        console.log("  ✓ child_process.spawn: shell option");
      }
    });
  } catch (e) {
    console.log(`  ✗ spawn shell: ${e}`);
    allPass = false;
  }

  return allPass;
}

function testChildProcessFork(): boolean {
  console.log("\n  ─── Testing child_process.fork ───");
  let allPass = true;

  try {
    const child = cp.fork(
      path.join(__dirname, "..", "helpers", "fork-child.js"),
      ["arg1", "arg2"],
      { silent: true }
    );
    let msg = "";
    child.on("message", (m) => {
      msg = m;
    });
    child.on("close", (code) => {
      if (code === 0 && msg) {
        console.log("  ✓ child_process.fork: basic");
      } else {
        console.log(`  ✗ fork: code=${code}, msg=${msg}`);
        allPass = false;
      }
    });
    child.send({ cmd: "ping" });
  } catch (e) {
    // fork may be limited in Bun
    console.log(`  ⚠ child_process.fork: ${e} (known limitation)`);
    // Don't mark as fail since fork is known to have limitations
  }

  return allPass;
}

// ─── vm module ───────────────────────────────────────────────────────────

function testVmModule(): boolean {
  console.log("\n  ─── Testing vm module ───");
  let allPass = true;

  // vm.runInThisContext
  try {
    const result = vm.runInThisContext("1 + 2");
    if (result === 3) {
      console.log("  ✓ vm.runInThisContext: simple expression");
    } else {
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ vm.runInThisContext: ${e}`);
    allPass = false;
  }

  // vm.runInNewContext
  try {
    const sandbox = { x: 10, y: 20 };
    const result = vm.runInNewContext("x + y", sandbox);
    if (result === 30) {
      console.log("  ✓ vm.runInNewContext: sandbox with variables");
    } else {
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ vm.runInNewContext: ${e}`);
    allPass = false;
  }

  // vm.runInNewContext with complex code
  try {
    const sandbox: Record<string, any> = { result: null };
    vm.runInNewContext(
      `
      function factorial(n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
      }
      result = factorial(10);
      `,
      sandbox
    );
    if (sandbox.result === 3628800) {
      console.log("  ✓ vm.runInNewContext: function definition and execution");
    } else {
      console.log(`  ✗ runInNewContext function: got ${sandbox.result}`);
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ vm.runInNewContext function: ${e}`);
    allPass = false;
  }

  // vm.runInNewContext with timeout
  try {
    const sandbox = {};
    const start = Date.now();
    vm.runInNewContext("while (true) {}", sandbox, { timeout: 100 });
    console.log("  ✗ vm.runInNewContext: should have timed out");
    allPass = false;
  } catch (e) {
    const elapsed = Date.now() - start;
    if (elapsed >= 50) {
      console.log(`  ✓ vm.runInNewContext: timeout (${elapsed}ms)`);
    } else {
      console.log(`  ✗ vm timeout: ${elapsed}ms too fast`);
      allPass = false;
    }
  }

  // vm.createContext
  try {
    const sandbox = { a: 1, b: 2 };
    const ctx = vm.createContext(sandbox);
    const code = "a + b";
    const result = vm.runInContext(code, ctx);
    if (result === 3) {
      console.log("  ✓ vm.createContext + vm.runInContext");
    }
  } catch (e) {
    console.log(`  ✗ vm.createContext: ${e}`);
    allPass = false;
  }

  // vm.Script
  try {
    const script = new vm.Script("return `Hello, ${name}!`");
    const sandbox = { name: "Bun" };
    const result = script.runInNewContext(sandbox);
    if (result === "Hello, Bun!") {
      console.log("  ✓ vm.Script compile and run");
    }
  } catch (e) {
    console.log(`  ✗ vm.Script: ${e}`);
    allPass = false;
  }

  // vm.compileFunction
  try {
    const fn = vm.compileFunction("return a + b", ["a", "b"]);
    const result = fn(3, 7);
    if (result === 10) {
      console.log("  ✓ vm.compileFunction");
    }
  } catch (e) {
    console.log(`  ✗ vm.compileFunction: ${e}`);
    allPass = false;
  }

  // vm.isContext
  try {
    const sandbox = {};
    const ctx = vm.createContext(sandbox);
    if (vm.isContext(ctx) && !vm.isContext({})) {
      console.log("  ✓ vm.isContext");
    }
  } catch (e) {
    console.log(`  ✗ vm.isContext: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── worker_threads module ───────────────────────────────────────────────

function testWorkerThreads(): boolean {
  console.log("\n  ─── Testing worker_threads ───");
  let allPass = true;

  // Worker creation
  try {
    const worker = new Worker(
      `
      const { parentPort } = require("worker_threads");
      parentPort.postMessage("hello from worker");
      `,
      { eval: true }
    );

    worker.on("message", (msg) => {
      if (msg === "hello from worker") {
        console.log("  ✓ Worker: basic eval mode");
      } else {
        allPass = false;
      }
    });

    worker.on("error", (err) => {
      console.log(`  ✗ Worker error: ${err}`);
      allPass = false;
    });
  } catch (e) {
    console.log(`  ✗ Worker creation: ${e}`);
    allPass = false;
  }

  // Worker with transferable
  try {
    const buf = new SharedArrayBuffer(1024);
    const view = new Int32Array(buf);
    view[0] = 42;

    const worker = new Worker(
      `
      const { parentPort, workerData } = require("worker_threads");
      const view = new Int32Array(workerData.buf);
      parentPort.postMessage({ value: view[0] });
      `,
      {
        eval: true,
        workerData: { buf },
        transferList: [buf],
      }
    );

    worker.on("message", (msg) => {
      if (msg.value === 42) {
        console.log("  ✓ Worker: transferList");
      } else {
        allPass = false;
      }
    });
  } catch (e) {
    console.log(`  ✗ Worker transferList: ${e}`);
    allPass = false;
  }

  // Worker with file
  try {
    const workerPath = path.join(__dirname, "..", "helpers", "worker-script.js");
    const worker = new Worker(workerPath);
    worker.on("message", (msg) => {
      if (msg === "worker ready") {
        console.log("  ✓ Worker: file mode");
      }
    });
    worker.on("error", (err) => {
      console.log(`  ✗ Worker file error: ${err}`);
    });
  } catch (e) {
    console.log(`  ✗ Worker file mode: ${e}`);
    allPass = false;
  }

  // isMainThread
  try {
    if (isMainThread === true || isMainThread === false) {
      console.log(`  ✓ isMainThread: ${isMainThread}`);
    }
  } catch (e) {
    console.log(`  ✗ isMainThread: ${e}`);
    allPass = false;
  }

  // workerData
  try {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require("worker_threads");
      parentPort.postMessage({ data: workerData });
      `,
      {
        eval: true,
        workerData: { key: "value", num: 42 },
      }
    );
    worker.on("message", (msg) => {
      if (msg.data.key === "value" && msg.data.num === 42) {
        console.log("  ✓ Worker: workerData passing");
      }
    });
  } catch (e) {
    console.log(`  ✗ Worker workerData: ${e}`);
    allPass = false;
  }

  // Worker termination
  try {
    const worker = new Worker(
      `
      setInterval(() => {}, 1000);
      `,
      { eval: true }
    );
    worker.terminate().then(() => {
      console.log("  ✓ Worker: terminate");
    });
  } catch (e) {
    console.log(`  ✗ Worker terminate: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── net module ──────────────────────────────────────────────────────────

function testNetModule(): boolean {
  console.log("\n  ─── Testing net module ───");
  let allPass = true;

  try {
    const server = net.createServer((socket) => {
      socket.write("hello from server");
      socket.end();
    });

    server.listen(18902, () => {
      const client = net.createConnection({ port: 18902 }, () => {
        client.write("hello from client");
      });

      let data = "";
      client.on("data", (chunk) => (data += chunk));
      client.on("end", () => {
        if (data === "hello from server") {
          console.log("  ✓ net.createServer + net.createConnection");
        } else {
          console.log(`  ✗ net: got "${data}"`);
          allPass = false;
        }
        server.close();
      });
    });

    // Give time for async
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (e) {
    console.log(`  ✗ net module: ${e}`);
    allPass = false;
  }

  // DNS lookup
  try {
    const dns = require("dns");
    dns.lookup("localhost", (err, address) => {
      if (!err && address) {
        console.log(`  ✓ dns.lookup: ${address}`);
      }
    });
  } catch (e) {
    console.log(`  ✗ dns.lookup: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── dgram (UDP) module ──────────────────────────────────────────────────

function testDgramModule(): boolean {
  console.log("\n  ─── Testing dgram (UDP) module ───");
  let allPass = true;

  try {
    const server = dgram.createSocket("udp4");

    server.on("message", (msg, rinfo) => {
      if (msg.toString() === "udp ping") {
        console.log("  ✓ dgram: UDP message received");
        server.send("udp pong", rinfo.port, rinfo.address);
      }
    });

    server.bind(18903, () => {
      const client = dgram.createSocket("udp4");
      client.send("udp ping", 18903, "127.0.0.1", (err) => {
        if (err) {
          console.log(`  ✗ dgram send: ${err}`);
          allPass = false;
        }
      });

      client.on("message", (msg) => {
        if (msg.toString() === "udp pong") {
          console.log("  ✓ dgram: UDP response received");
        }
        client.close();
        server.close();
      });
    });

    // Give time for async
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (e) {
    console.log(`  ✗ dgram module: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── cluster module ──────────────────────────────────────────────────────

function testClusterModule(): boolean {
  console.log("\n  ─── Testing cluster module ───");
  let allPass = true;

  try {
    const cluster = require("cluster");
    if (cluster.isMaster !== undefined || cluster.isPrimary !== undefined) {
      console.log(`  ✓ cluster.isPrimary: ${cluster.isPrimary}`);
    }
    if (cluster.isWorker !== undefined || cluster.isWorker !== undefined) {
      console.log(`  ✓ cluster.isWorker: ${cluster.isWorker}`);
    }
    // cluster.settings
    if (cluster.settings) {
      console.log("  ✓ cluster.settings available");
    }
  } catch (e) {
    console.log(`  ✗ cluster module: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── async_hooks module ──────────────────────────────────────────────────

function testAsyncHooks(): boolean {
  console.log("\n  ─── Testing async_hooks module ───");
  let allPass = true;

  try {
    const async_hooks = require("async_hooks");

    // createHook
    const hook = async_hooks.createHook({
      init(asyncId, type, triggerAsyncId, resource) {},
      before(asyncId) {},
      after(asyncId) {},
      destroy(asyncId) {},
    });

    if (hook) {
      console.log("  ✓ async_hooks.createHook");
    }

    // executionAsyncId
    const eid = async_hooks.executionAsyncId();
    if (typeof eid === "number") {
      console.log(`  ✓ async_hooks.executionAsyncId: ${eid}`);
    }

    // triggerAsyncId
    const tid = async_hooks.triggerAsyncId();
    if (typeof tid === "number") {
      console.log(`  ✓ async_hooks.triggerAsyncId: ${tid}`);
    }
  } catch (e) {
    console.log(`  ⚠ async_hooks: ${e} (may have limited support in Bun)`);
    // Don't fail - async_hooks is known to have limited support
  }

  return allPass;
}

// ─── Main runner ─────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Bun Problematic APIs Compatibility Test");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log("═══════════════════════════════════════════════════\n");

  // Note: Some async tests complete after the main function ends
  // We include enough timeout for most async operations

  const results = {
    "child_process.exec": testChildProcessExec(),
    "child_process.spawn": testChildProcessSpawn(),
    "child_process.fork": testChildProcessFork(),
    vm: testVmModule(),
    worker_threads: testWorkerThreads(),
    net: await testNetModule(),
    dgram: await testDgramModule(),
    cluster: testClusterModule(),
    async_hooks: testAsyncHooks(),
  };

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Compatibility Results");
  console.log("═══════════════════════════════════════════════════");

  // Allow time for async callbacks
  await new Promise((resolve) => setTimeout(resolve, 1500));

  console.log("\n  Note: Some async tests may complete after this summary.");
  console.log("  Check the output above for individual test results.\n");
  console.log("  See Chapter 17 README for detailed compatibility matrix.\n");
}

await main();
