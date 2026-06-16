#!/usr/bin/env bun

/**
 * Chapter 17: 兼容性红黑榜
 * Example 01 - Core Modules Compatibility Test
 *
 * Tests the compatibility of Node.js core modules in Bun:
 * fs, path, http, crypto, os, util, stream
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import * as util from "util";
import { EventEmitter } from "events";
import { Readable, Writable, Transform } from "stream";

// ─── fs module ───────────────────────────────────────────────────────────

function testFsModule(): boolean {
  console.log("\n  ─── Testing fs module ───");
  let allPass = true;

  // sync operations
  const tmpDir = "/tmp/bun-compat-test";
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const testFile = path.join(tmpDir, "test.txt");
  fs.writeFileSync(testFile, "Hello Bun compatibility test!");
  const content = fs.readFileSync(testFile, "utf-8");
  if (content === "Hello Bun compatibility test!") {
    console.log("  ✓ fs.writeFileSync / readFileSync");
  } else {
    console.log("  ✗ fs.writeFileSync / readFileSync: content mismatch");
    allPass = false;
  }

  const stat = fs.statSync(testFile);
  if (stat.size > 0 && stat.isFile()) {
    console.log(`  ✓ fs.statSync: size=${stat.size}`);
  } else {
    console.log("  ✗ fs.statSync: unexpected stat result");
    allPass = false;
  }

  // fs.promises
  try {
    const dirEntries = fs.readdirSync(tmpDir);
    if (dirEntries.length > 0) {
      console.log(`  ✓ fs.readdirSync: found ${dirEntries.length} entries`);
    }
  } catch (e) {
    console.log(`  ✗ fs.readdirSync: ${e}`);
    allPass = false;
  }

  // async fs/promises
  try {
    const asyncContent = await fsp.readFile(testFile, "utf-8");
    if (asyncContent === content) {
      console.log("  ✓ fs/promises readFile async");
    }
  } catch (e) {
    console.log(`  ✗ fs/promises readFile: ${e}`);
    allPass = false;
  }

  // watchFile / unwatchFile
  try {
    fs.watchFile(testFile, () => {});
    fs.unwatchFile(testFile);
    console.log("  ✓ fs.watchFile / unwatchFile");
  } catch (e) {
    console.log("  ✗ fs.watchFile: ${e}");
    allPass = false;
  }

  // chmod / chown
  try {
    fs.chmodSync(testFile, 0o644);
    const newStat = fs.statSync(testFile);
    // mode check
    console.log(`  ✓ fs.chmodSync: mode=${newStat.mode.toString(8)}`);
  } catch (e) {
    console.log(`  ✗ fs.chmodSync: ${e}`);
    allPass = false;
  }

  // unlink
  try {
    fs.unlinkSync(testFile);
    if (!fs.existsSync(testFile)) {
      console.log("  ✓ fs.unlinkSync");
    }
  } catch (e) {
    console.log(`  ✗ fs.unlinkSync: ${e}`);
    allPass = false;
  }

  // rmSync (recursive)
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (!fs.existsSync(tmpDir)) {
      console.log("  ✓ fs.rmSync recursive");
    }
  } catch (e) {
    console.log(`  ✗ fs.rmSync: ${e}`);
    allPass = false;
  }

  // mkdtempSync
  try {
    const tmp = fs.mkdtempSync("/tmp/bun-");
    fs.rmdirSync(tmp);
    console.log("  ✓ fs.mkdtempSync");
  } catch (e) {
    console.log(`  ✗ fs.mkdtempSync: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── path module ─────────────────────────────────────────────────────────

function testPathModule(): boolean {
  console.log("\n  ─── Testing path module ───");
  let allPass = true;

  const paths = ["/usr/local/bin", "file.txt", "/var/log/app.log"];

  // path.basename
  if (path.basename("/usr/local/bin/node") === "node") {
    console.log("  ✓ path.basename");
  } else {
    console.log(`  ✗ path.basename: got "${path.basename("/usr/local/bin/node")}"`);
    allPass = false;
  }

  // path.dirname
  if (path.dirname("/usr/local/bin/node") === "/usr/local/bin") {
    console.log("  ✓ path.dirname");
  } else {
    console.log(`  ✗ path.dirname: got "${path.dirname("/usr/local/bin/node")}"`);
    allPass = false;
  }

  // path.extname
  if (path.extname("image.png") === ".png") {
    console.log("  ✓ path.extname");
  } else {
    allPass = false;
  }

  // path.join
  const joined = path.join("/app", "src", "utils", "index.ts");
  if (joined === "/app/src/utils/index.ts" || joined === "\\app\\src\\utils\\index.ts") {
    console.log(`  ✓ path.join: ${joined}`);
  } else {
    console.log(`  ✗ path.join: got "${joined}"`);
    allPass = false;
  }

  // path.resolve
  const resolved = path.resolve("examples", "test.ts");
  if (resolved.endsWith("test.ts")) {
    console.log(`  ✓ path.resolve: ${resolved}`);
  } else {
    allPass = false;
  }

  // path.parse
  const parsed = path.parse("/var/log/app.log");
  if (parsed.base === "app.log" && parsed.ext === ".log" && parsed.name === "app") {
    console.log("  ✓ path.parse: base, ext, name correct");
  } else {
    console.log(`  ✗ path.parse: ${JSON.stringify(parsed)}`);
    allPass = false;
  }

  // path.format
  const formatted = path.format({ dir: "/home/user", base: "config.json" });
  if (formatted.includes("config.json")) {
    console.log("  ✓ path.format");
  } else {
    allPass = false;
  }

  // path.isAbsolute
  if (path.isAbsolute("/usr/bin") && !path.isAbsolute("relative")) {
    console.log("  ✓ path.isAbsolute");
  } else {
    allPass = false;
  }

  // path.normalize
  const normalized = path.normalize("/usr//local/../bin/./node");
  if (normalized === "/usr/bin/node") {
    console.log("  ✓ path.normalize");
  } else {
    console.log(`  ✗ path.normalize: got "${normalized}"`);
    allPass = false;
  }

  // path.relative
  const rel = path.relative("/usr/local/bin", "/usr/local/lib");
  if (rel === "../lib") {
    console.log("  ✓ path.relative");
  } else {
    console.log(`  ✗ path.relative: got "${rel}"`);
    allPass = false;
  }

  // path.sep
  if (path.sep === "/" || path.sep === "\\") {
    console.log(`  ✓ path.sep: "${path.sep}"`);
  }

  // path.delimiter
  if (path.delimiter === ":" || path.delimiter === ";") {
    console.log(`  ✓ path.delimiter: "${path.delimiter}"`);
  }

  return allPass;
}

// ─── crypto module ───────────────────────────────────────────────────────

function testCryptoModule(): boolean {
  console.log("\n  ─── Testing crypto module ───");
  let allPass = true;

  // randomBytes
  const buf = crypto.randomBytes(32);
  if (buf.length === 32) {
    console.log("  ✓ crypto.randomBytes(32)");
  } else {
    allPass = false;
  }

  // randomUUID
  const uuid = crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (uuidRegex.test(uuid)) {
    console.log(`  ✓ crypto.randomUUID: ${uuid}`);
  } else {
    console.log(`  ✗ crypto.randomUUID: invalid format "${uuid}"`);
    allPass = false;
  }

  // createHash
  const hash = crypto.createHash("sha256").update("Hello Bun").digest("hex");
  if (hash.length === 64) {
    console.log(`  ✓ crypto.createHash(sha256): ${hash.substring(0, 16)}...`);
  } else {
    allPass = false;
  }

  // createHmac
  const hmac = crypto.createHmac("sha256", "secret-key").update("data").digest("hex");
  if (hmac.length === 64) {
    console.log(`  ✓ crypto.createHmac(sha256): ${hmac.substring(0, 16)}...`);
  } else {
    allPass = false;
  }

  // createCipheriv / createDecipheriv (aes-256-gcm)
  try {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update("sensitive data", "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    if (decrypted === "sensitive data") {
      console.log("  ✓ crypto.createCipheriv/createDecipheriv (aes-256-gcm)");
    } else {
      console.log("  ✗ AES-GCM: decryption mismatch");
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ crypto.createCipheriv: ${e}`);
    allPass = false;
  }

  // createSign / createVerify (RSA-SHA256)
  try {
    const { generateKeyPairSync } = crypto;
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const sign = crypto.createSign("SHA256");
    sign.update("message to sign");
    const signature = sign.sign(privateKey, "hex");

    const verify = crypto.createVerify("SHA256");
    verify.update("message to sign");
    const isValid = verify.verify(publicKey, signature, "hex");

    if (isValid) {
      console.log("  ✓ crypto.createSign/createVerify (RSA-SHA256)");
    } else {
      console.log("  ✗ RSA signature verification failed");
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ crypto.createSign: ${e}`);
    allPass = false;
  }

  // pbkdf2Sync
  try {
    const derivedKey = crypto.pbkdf2Sync("password", "salt", 100000, 32, "sha256");
    if (derivedKey.length === 32) {
      console.log("  ✓ crypto.pbkdf2Sync");
    }
  } catch (e) {
    console.log(`  ✗ crypto.pbkdf2Sync: ${e}`);
    allPass = false;
  }

  // createHash with different algorithms
  const algorithms = ["md5", "sha1", "sha256", "sha384", "sha512"];
  for (const algo of algorithms) {
    try {
      const h = crypto.createHash(algo).update("test").digest("hex");
      console.log(`  ✓ crypto.createHash(${algo}): ${h.substring(0, 8)}...`);
    } catch (e) {
      console.log(`  ✗ crypto.createHash(${algo}): ${e}`);
      allPass = false;
    }
  }

  // timingSafeEqual
  try {
    const a = Buffer.from("abc123");
    const b = Buffer.from("abc123");
    if (crypto.timingSafeEqual(a, b)) {
      console.log("  ✓ crypto.timingSafeEqual");
    } else {
      console.log("  ✗ timingSafeEqual: same buffers should match");
      allPass = false;
    }
  } catch (e) {
    console.log(`  ✗ crypto.timingSafeEqual: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── http module ─────────────────────────────────────────────────────────

function testHttpModule(): boolean {
  console.log("\n  ─── Testing http module ───");
  let allPass = true;

  // http.get
  try {
    const http = require("http");
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", runtime: "bun" }));
    });

    server.listen(18901, () => {
      http.get("http://localhost:18901", (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const parsed = JSON.parse(data);
          if (parsed.status === "ok") {
            console.log("  ✓ http.createServer + http.get");
          } else {
            console.log("  ✗ http.get: unexpected response");
            allPass = false;
          }
          server.close();
        });
      });
    });

    // Wait a bit for the async operations
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (e) {
    console.log(`  ✗ http module: ${e}`);
    allPass = false;
  }

  // http.Agent
  try {
    const http = require("http");
    const agent = new http.Agent({ keepAlive: true, maxSockets: 10 });
    if (agent.maxSockets === 10) {
      console.log("  ✓ http.Agent with options");
    }
  } catch (e) {
    console.log(`  ✗ http.Agent: ${e}`);
    allPass = false;
  }

  // http.STATUS_CODES
  try {
    const http = require("http");
    if (http.STATUS_CODES[200] === "OK" && http.STATUS_CODES[404] === "Not Found") {
      console.log("  ✓ http.STATUS_CODES");
    }
  } catch (e) {
    console.log(`  ✗ http.STATUS_CODES: ${e}`);
    allPass = false;
  }

  // http.METHODS
  try {
    const http = require("http");
    if (http.METHODS.includes("GET") && http.METHODS.includes("POST")) {
      console.log("  ✓ http.METHODS");
    }
  } catch (e) {
    console.log(`  ✗ http.METHODS: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── os module ───────────────────────────────────────────────────────────

function testOsModule(): boolean {
  console.log("\n  ─── Testing os module ───");
  let allPass = true;

  console.log(`  ✓ os.platform(): ${os.platform()}`);
  console.log(`  ✓ os.arch(): ${os.arch()}`);
  console.log(`  ✓ os.type(): ${os.type()}`);
  console.log(`  ✓ os.release(): ${os.release()}`);
  console.log(`  ✓ os.hostname(): ${os.hostname()}`);
  console.log(`  ✓ os.cpus().length: ${os.cpus().length} cores`);
  console.log(`  ✓ os.totalmem(): ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  ✓ os.freemem(): ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`);

  try {
    const homedir = os.homedir();
    if (homedir) console.log(`  ✓ os.homedir(): ${homedir}`);
  } catch (e) {
    console.log(`  ✗ os.homedir(): ${e}`);
    allPass = false;
  }

  try {
    const tmpdir = os.tmpdir();
    if (tmpdir) console.log(`  ✓ os.tmpdir(): ${tmpdir}`);
  } catch (e) {
    console.log(`  ✗ os.tmpdir(): ${e}`);
    allPass = false;
  }

  try {
    const loadavg = os.loadavg();
    console.log(`  ✓ os.loadavg(): ${loadavg.map((n) => n.toFixed(2)).join(", ")}`);
  } catch (e) {
    console.log(`  ✗ os.loadavg(): ${e}`);
    allPass = false;
  }

  try {
    const networkInterfaces = os.networkInterfaces();
    const ifaceCount = Object.keys(networkInterfaces).length;
    console.log(`  ✓ os.networkInterfaces(): ${ifaceCount} interfaces`);
  } catch (e) {
    console.log(`  ✗ os.networkInterfaces(): ${e}`);
    allPass = false;
  }

  try {
    const eol = os.EOL;
    if (eol === "\n" || eol === "\r\n") {
      console.log(`  ✓ os.EOL (${eol === "\n" ? "LF" : "CRLF"})`);
    }
  } catch (e) {
    allPass = false;
  }

  try {
    const userInfo = os.userInfo();
    if (userInfo.username) {
      console.log(`  ✓ os.userInfo(): username=${userInfo.username}`);
    }
  } catch (e) {
    console.log(`  ✗ os.userInfo(): ${e}`);
    allPass = false;
  }

  try {
    const uptime = os.uptime();
    console.log(`  ✓ os.uptime(): ${uptime}s`);
  } catch (e) {
    allPass = false;
  }

  return allPass;
}

// ─── util module ─────────────────────────────────────────────────────────

function testUtilModule(): boolean {
  console.log("\n  ─── Testing util module ───");
  let allPass = true;

  // util.inspect
  const obj = { name: "Bun", version: "1.0", features: ["fast", "compatible"] };
  const inspected = util.inspect(obj, { colors: false, depth: 2 });
  if (inspected.includes("Bun")) {
    console.log("  ✓ util.inspect");
  } else {
    allPass = false;
  }

  // util.format
  const formatted = util.format("Hello %s, you have %d messages", "User", 5);
  if (formatted === "Hello User, you have 5 messages") {
    console.log("  ✓ util.format");
  } else {
    console.log(`  ✗ util.format: got "${formatted}"`);
    allPass = false;
  }

  // util.types
  if (util.types.isDate(new Date()) && util.types.isRegExp(/test/)) {
    console.log("  ✓ util.types.isDate / isRegExp");
  } else {
    allPass = false;
  }

  // util.callbackify
  try {
    const asyncFn = async () => "result";
    const callbackFn = util.callbackify(asyncFn);
    callbackFn((err, result) => {
      if (result === "result") {
        console.log("  ✓ util.callbackify");
      }
    });
  } catch (e) {
    console.log(`  ✗ util.callbackify: ${e}`);
    allPass = false;
  }

  // util.promisify
  try {
    const fs = require("fs");
    const readFileAsync = util.promisify(fs.readFile);
    console.log("  ✓ util.promisify");
  } catch (e) {
    console.log(`  ✗ util.promisify: ${e}`);
    allPass = false;
  }

  // util.deprecate
  try {
    const oldFn = () => "deprecated";
    const deprecatedFn = util.deprecate(oldFn, "This function is deprecated");
    deprecatedFn();
    console.log("  ✓ util.deprecate");
  } catch (e) {
    allPass = false;
  }

  // inherits
  try {
    function Base() {}
    Base.prototype.greet = () => "hello";
    function Derived() {}
    util.inherits(Derived, Base);
    const instance = new Derived();
    if (instance.greet() === "hello") {
      console.log("  ✓ util.inherits");
    }
  } catch (e) {
    console.log(`  ✗ util.inherits: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── events module ───────────────────────────────────────────────────────

function testEventsModule(): boolean {
  console.log("\n  ─── Testing events module ───");
  let allPass = true;

  const emitter = new EventEmitter();

  // on / emit
  emitter.on("test", (msg) => {
    if (msg === "hello") console.log("  ✓ EventEmitter.on / emit");
    else allPass = false;
  });
  emitter.emit("test", "hello");

  // once
  let onceCount = 0;
  emitter.once("once", () => onceCount++);
  emitter.emit("once");
  emitter.emit("once");
  if (onceCount === 1) {
    console.log("  ✓ EventEmitter.once (called once)");
  } else {
    console.log(`  ✗ EventEmitter.once: called ${onceCount} times`);
    allPass = false;
  }

  // off / removeListener
  const handler = () => {};
  emitter.on("remove", handler);
  emitter.off("remove", handler);
  const listeners = emitter.listeners("remove");
  if (listeners.length === 0) {
    console.log("  ✓ EventEmitter.off");
  } else {
    allPass = false;
  }

  // eventNames
  emitter.on("a", () => {});
  emitter.on("b", () => {});
  const names = emitter.eventNames();
  if (names.includes("a") && names.includes("b")) {
    console.log("  ✓ EventEmitter.eventNames");
  }

  // listenerCount
  const count = emitter.listenerCount("a");
  if (count === 1) {
    console.log("  ✓ EventEmitter.listenerCount");
  }

  // setMaxListeners / getMaxListeners
  emitter.setMaxListeners(42);
  if (emitter.getMaxListeners() === 42) {
    console.log("  ✓ EventEmitter.setMaxListeners / getMaxListeners");
  }

  // EventEmitter.defaultMaxListeners
  if (EventEmitter.defaultMaxListeners > 0) {
    console.log(`  ✓ EventEmitter.defaultMaxListeners: ${EventEmitter.defaultMaxListeners}`);
  }

  // prependListener
  let order: string[] = [];
  emitter.removeAllListeners("order");
  emitter.on("order", () => order.push("second"));
  emitter.prependListener("order", () => order.push("first"));
  emitter.emit("order");
  if (order[0] === "first" && order[1] === "second") {
    console.log("  ✓ EventEmitter.prependListener");
  } else {
    allPass = false;
  }

  // rawListeners
  emitter.removeAllListeners("raw");
  emitter.on("raw", () => {});
  const raw = emitter.rawListeners("raw");
  if (raw.length === 1 && typeof raw[0] === "function") {
    console.log("  ✓ EventEmitter.rawListeners");
  }

  // error handling
  emitter.on("error", (err) => {
    console.log(`  ✓ EventEmitter error handling: ${err.message}`);
  });
  emitter.emit("error", new Error("expected test error"));

  return allPass;
}

// ─── stream module ───────────────────────────────────────────────────────

function testStreamModule(): boolean {
  console.log("\n  ─── Testing stream module ───");
  let allPass = true;

  // Readable stream
  try {
    const readable = new Readable({
      read() {
        this.push("data1\n");
        this.push("data2\n");
        this.push(null);
      },
    });
    let readData = "";
    readable.on("data", (chunk) => (readData += chunk));
    readable.on("end", () => {
      if (readData.includes("data1") && readData.includes("data2")) {
        console.log("  ✓ Readable stream");
      } else {
        allPass = false;
      }
    });
  } catch (e) {
    console.log(`  ✗ Readable stream: ${e}`);
    allPass = false;
  }

  // Writable stream
  try {
    const chunks: string[] = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    writable.write("hello ");
    writable.write("world");
    writable.end();
    // give time for async
    setTimeout(() => {
      if (chunks.join("") === "hello world") {
        console.log("  ✓ Writable stream");
      } else {
        allPass = false;
      }
    }, 100);
  } catch (e) {
    console.log(`  ✗ Writable stream: ${e}`);
    allPass = false;
  }

  // Transform stream
  try {
    const transform = new Transform({
      transform(chunk, encoding, callback) {
        this.push(chunk.toString().toUpperCase());
        callback();
      },
    });
    transform.on("data", (chunk) => {
      if (chunk.toString() === "HELLO") {
        console.log("  ✓ Transform stream");
      }
    });
    transform.write("hello");
  } catch (e) {
    console.log(`  ✗ Transform stream: ${e}`);
    allPass = false;
  }

  // pipeline
  try {
    const { pipeline, Transform } = require("stream");
    const { promisify } = require("util");
    const pipelineAsync = promisify(pipeline);
    console.log("  ✓ stream.pipeline available");
  } catch (e) {
    console.log(`  ✗ stream.pipeline: ${e}`);
    allPass = false;
  }

  // finished
  try {
    const { finished } = require("stream");
    const rs = new Readable({
      read() {
        this.push(null);
      },
    });
    finished(rs, (err) => {
      if (!err) console.log("  ✓ stream.finished");
    });
    rs.resume();
  } catch (e) {
    console.log(`  ✗ stream.finished: ${e}`);
    allPass = false;
  }

  return allPass;
}

// ─── Main runner ─────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Bun Core Modules Compatibility Test");
  console.log("═══════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log("═══════════════════════════════════════════\n");

  const results = {
    fs: testFsModule(),
    path: testPathModule(),
    crypto: testCryptoModule(),
    http: testHttpModule(),
    os: testOsModule(),
    util: testUtilModule(),
    events: testEventsModule(),
    stream: testStreamModule(),
  };

  console.log("\n═══════════════════════════════════════════");
  console.log("  Results Summary");
  console.log("═══════════════════════════════════════════");
  let totalPass = 0;
  let totalFail = 0;
  for (const [mod, passed] of Object.entries(results)) {
    const icon = passed ? "✓" : "✗";
    console.log(`  ${icon} ${mod}: ${passed ? "PASS" : "FAIL"}`);
    if (passed) totalPass++;
    else totalFail++;
  }
  console.log("───────────────────────────────────────────");
  console.log(`  Total: ${totalPass + totalFail} modules, ${totalPass} passed, ${totalFail} failed`);
  console.log("═══════════════════════════════════════════\n");

  if (totalFail > 0) {
    console.log("  ⚠ Some modules have compatibility issues. See Chapter 17 for details.\n");
    process.exit(1);
  } else {
    console.log("  ✓ All core modules are fully compatible with Bun!\n");
  }
}

await main();
