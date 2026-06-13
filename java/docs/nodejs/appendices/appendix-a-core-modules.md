# 附录A Node.js 核心模块避坑指南

## A.1 概述

Node.js 内置的核心模块提供了文件系统、流、缓冲区、加密等基础能力。虽然这些模块使用广泛，但其中存在不少容易踩中的陷阱。本附录整理了 fs、stream、buffer、crypto 四个核心模块的常见问题与最佳实践。

## A.2 fs — 文件系统

### 三种路径解析

`fs` 模块中的路径有三种形式，行为有微妙差异：

```javascript
const fs = require('fs');

// 1. 相对路径（注意：不是脚本所在目录，而是 CWD！）
// 如果用户在 /app 目录下执行 node src/script.js
// 那么相对路径 './config.json' 指向的是 /app/config.json，而非 /app/src/config.json
fs.readFileSync('./config.json', 'utf-8');

// 2. 绝对路径
fs.readFileSync('/app/config.json', 'utf-8');

// 3. file:// URL（Node.js 19.7+ 支持）
fs.readFileSync(new URL('file:///app/config.json'), 'utf-8');
```

**常见陷阱**：`__dirname` 是脚本所在目录，而 `process.cwd()` 是执行目录。建议使用 `path.join(__dirname, '..', 'config.json')` 或 `import.meta.url`（ESM）来构造路径。

### fs.promises API 优先

回调式 API 容易导致回调地狱和难以处理的错误：

```javascript
// ❌ 不推荐：回调式
fs.readFile('/data/file.txt', 'utf-8', (err, data) => {
  if (err) throw err;
  fs.writeFile('/data/out.txt', data, (err) => {
    if (err) throw err;
    console.log('Done');
  });
});

// ✅ 推荐：Promise 式（fs.promises）
async function processFile() {
  const data = await fs.promises.readFile('/data/file.txt', 'utf-8');
  await fs.promises.writeFile('/data/out.txt', data);
  console.log('Done');
}
```

### watch 的跨平台差异

`fs.watch` 在不同平台上的行为差异显著：

| 平台 | 事件频率 | 准确性 | 注意事项 |
|:--|:--|:--|:--|
| macOS | 稳定 | 高（FSEvents） | rename 事件可能只触发一次 |
| Linux | 高 | 中（inotify） | 同一修改可能触发多次 change |
| Windows | 高 | 中（ReadDirectoryChanges） | 文件名大小写不敏感 |

```javascript
// 跨平台安全的 watch 策略
const watcher = fs.watch('/data', { recursive: true }, (event, filename) => {
  if (!filename) return; // 某些平台不提供 filename
  // 去重：同一文件在 100ms 内的多次变更视为一次
  debouncedHandler(filename);
});

// 使用 chokidar 作为跨平台替代
// npm install chokidar
const chokidar = require('chokidar');
chokidar.watch('/data', { ignoreInitial: true }).on('all', (event, path) => {
  console.log(event, path);
});
```

## A.3 stream — 流

### highWaterMark 调优

`highWaterMark` 决定内部缓冲区的大小，直接影响内存使用和处理效率：

```javascript
// 默认 highWaterMark：16KB（对象模式：16 个对象）
const readable = fs.createReadStream('/large/file.log', {
  highWaterMark: 64 * 1024, // 64KB — 减少读取次数，增加内存占用
});

const writable = fs.createWriteStream('/output/file.log', {
  highWaterMark: 16 * 1024, // 16KB — 默认值
});

// 调优原则：
// - 文件较大（>100MB）：highWaterMark 增至 256KB-1MB 可提高吞吐
// - 内存受限环境：保持默认或降低
// - 高延迟存储（如网络文件系统）：增大 highWaterMark
```

### backpressure 机制

当写入速度快于处理速度时，流内部的 backpressure 会阻止数据继续流入：

```javascript
// ❌ 不处理 backpressure：内存溢出风险
readable.on('data', (chunk) => {
  writable.write(chunk); // 忽略了 writable.write() 的返回值
});

// ✅ 正确处理 backpressure
readable.on('data', (chunk) => {
  const canContinue = writable.write(chunk);
  if (!canContinue) {
    readable.pause(); // 暂停读取，等待 drain 事件
  }
});

writable.on('drain', () => {
  readable.resume(); // 缓冲区已清空，恢复读取
});
```

### pipeline 替代 pipe

`pipeline` 提供了比 `pipe` 更完善的错误处理和清理机制：

```javascript
const { pipeline } = require('stream');
const fs = require('fs');
const zlib = require('zlib');

// ❌ pipe 不会自动传播错误
fs.createReadStream('input.txt')
  .pipe(zlib.createGzip())
  .pipe(fs.createWriteStream('output.gz'))
  .on('error', (err) => {
    console.error('只会捕获最后一个流的错误', err);
  });

// ✅ pipeline 自动传播错误并清理
pipeline(
  fs.createReadStream('input.txt'),
  zlib.createGzip(),
  fs.createWriteStream('output.gz'),
  (err) => {
    if (err) {
      console.error('pipeline 失败', err);
    } else {
      console.log('pipeline 成功');
    }
  }
);

// Promise 式
const { pipeline } = require('stream/promises');
async function compress() {
  await pipeline(
    fs.createReadStream('input.txt'),
    zlib.createGzip(),
    fs.createWriteStream('output.gz')
  );
}
```

## A.4 Buffer — 缓冲区

### 池分配机制

Buffer 的内部实现使用了固定大小（8KB）的内存池：

```javascript
// Buffer 分配策略
// 1. 小于 4KB 的 Buffer 从内存池分配（共享 8KB 池）
const smallBuf = Buffer.alloc(1024);     // 从池中分配
const smallBuf2 = Buffer.alloc(2000);    // 复用同一个池

// 2. 大于 poolSize（默认 8KB）的 Buffer 直接分配独立内存
const largeBuf = Buffer.alloc(10000);    // 独立分配，不进入池

// 3. Buffer.allocUnsafe 分配未初始化的内存（更快，但内容不确定）
const unsafeBuf = Buffer.allocUnsafe(1024); // 可能包含旧数据
unsafeBuf.fill(0); // 务必清零！
```

### Buffer.from vs Buffer.alloc vs Buffer.allocUnsafe

| 方法 | 内存初始化 | 性能 | 安全 | 推荐场景 |
|:--|:--|:--|:--|:--|
| `Buffer.from(data)` | 从数据创建 | 中 | 安全 | 从字符串/数组创建 |
| `Buffer.alloc(size)` | 0 填充 | 慢 | 安全 | 需要清零的新缓冲区 |
| `Buffer.allocUnsafe(size)` | 未初始化 | 快 | 需手动清零 | 性能关键且会立即覆盖的场景 |

```javascript
// 安全使用指南
const str = 'hello 世界';

// 从字符串创建
const buf1 = Buffer.from(str, 'utf-8');     // 推荐

// 预分配且会立即填充
const buf2 = Buffer.allocUnsafe(1024);       // 节省清零开销
buf2.write('data', 0, 'utf-8');             // 立即覆盖

// 需要安全空白缓冲区
const buf3 = Buffer.alloc(1024);             // 0 填充，安全

// Buffer.concat 合并多个 Buffer
const chunks = [buf1, buf2.subarray(0, 4)];
const combined = Buffer.concat(chunks, buf1.length + 4);
```

## A.5 crypto — 加密

### 同步 vs 异步选择

crypto 模块的某些函数既有同步版本也有异步版本，选择不当会阻塞事件循环：

```javascript
const crypto = require('crypto');

// ❌ scryptSync 阻塞事件循环（CPU 密集型）
// 使用 cost 参数 16384 时，单次调用可能耗时 50-200ms
const key = crypto.scryptSync('password', 'salt', 32);
// 事件循环在此期间完全停止

// ✅ scrypt 异步版本不阻塞
crypto.scrypt('password', 'salt', 32, (err, key) => {
  if (err) throw err;
  // 在处理函数中继续
});

// ✅ 或者使用 Promise 版本
const { promisify } = require('util');
const scryptAsync = promisify(crypto.scrypt);
const key = await scryptAsync('password', 'salt', 32);
```

同步版本适合启动时一次性操作（如解密配置文件），异步版本适合请求处理循环中调用。

### webcrypto API

Node.js 20+ 支持 Web Crypto API 标准，提供跨平台一致的加密操作：

```javascript
// Web Crypto API（标准 API，跨运行时兼容）
async function hashMessage(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Node.js 传统 API（仅限 Node.js）
const crypto = require('crypto');
function hashMessageLegacy(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

// webcrypto 的优势：在 Cloudflare Workers、Deno、浏览器中同样可用
```

### 常见加密陷阱

```javascript
// 陷阱 1：使用 Math.random() 生成密钥——不安全！
const insecureKey = Math.random().toString(36).slice(2, 10); // ❌

// 正确方式：使用 crypto.randomBytes
const secureKey = crypto.randomBytes(32).toString('hex'); // ✅

// 陷阱 2：ECB 模式（不应该使用）
const cipher = crypto.createCipheriv('aes-128-ecb', key, null); // ❌ ECB 不安全

// 正确方式：使用 AES-GCM（带认证加密）
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); // ✅

// 陷阱 3：硬编码的盐值
const key = crypto.scryptSync('password', 'hardcoded-salt', 32); // ❌

// 正确方式：随机盐值并随密文一起存储
const salt = crypto.randomBytes(16);
const key = crypto.scryptSync('password', salt, 32); // ✅
```

---

## 附录小结

Node.js 核心模块虽然经过了长时间的生产验证，但细节中仍有不少陷阱。本章总结了 fs 的路径解析差异、stream 的 backpressure 处理、Buffer 的分配策略以及 crypto 的同步/异步选择。在正式代码中始终使用 Promise 式 API、pipeline 处理流、以及对安全敏感的 crypto API，可以避免绝大多数常见问题。