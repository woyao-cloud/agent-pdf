# 第六章 极致 I/O — Bun.file 与 Bun.write

## 引言

文件 I/O 是运行时最核心的能力之一。无论是静态文件服务器、日志处理管道、数据库持久化层，还是配置加载模块，每一项后端基础设施都离不开高效的文件读写操作。Node.js 的 `fs` 模块虽然功能完善，但其设计承载了过多历史包袱——回调风格与 Promise 风格并存、Stream API 层级复杂、零拷贝支持缺失、文件描述符管理需要开发者手动处理。Bun 从零开始设计了全新的文件 I/O 系统，以 `Bun.file()` 和 `Bun.write()` 为核心 API，融合了现代操作系统的零拷贝机制（sendfile）、内存映射文件（mmap）和异步 I/O 轮询（io_uring / kqueue），在易用性和性能之间达到了前所未有的平衡。

在 Node.js 生态中，文件 I/O 一直是开发者需要小心翼翼处理的领域。`fs.readFile()` 会将整个文件加载到内存中，处理大文件时必须使用 `fs.createReadStream()`，但 Stream API 有 paused 和 flowing 两种模式，加上背压（backpressure）处理不当会导致内存泄漏或数据丢失。此外，Node.js 的 `fs` 模块虽然提供了 Promise 版本（`fs.promises`），但与回调版本并存造成了 API 碎片化。Bun 的设计者充分认识到了这些问题，在 Bun 中只提供了一套基于 Promise 和 Web 标准的文件 I/O API，简洁且一致。

本章将深入剖析 Bun 文件 I/O 的设计哲学、实现原理和最佳实践。我们从四个维度展开：使用场景分析帮助读者理解何时该用 Bun.file；实现原理章节从源码角度拆解 lazy evaluation、sendfile、mmap 和 atomic write 等核心机制；潜在风险与优化部分揭示性能陷阱和避坑指南；典型问题处理章节收录了生产环境中常见的故障排查思路；必备知识与技能章节为深入理解操作系统层面的文件 I/O 提供理论支撑；最后通过三个示例代码的逐行解读，巩固所学知识。

---

## 一、使用场景

### 1.1 静态文件服务器

静态文件服务是 Bun.file 最直观、也是最能体现性能优势的场景。传统 Node.js 搭建静态服务器需要使用 `fs.readFile()` 或 `fs.createReadStream()`，前者将整个文件读入内存后再通过 `res.end()` 发送，后者虽然解决了内存占用问题，但需要在用户空间和内核空间之间多次拷贝数据。

```typescript
// Node.js 传统方式
import fs from 'fs';
import http from 'http';
http.createServer((req, res) => {
  fs.readFile('./public/index.html', (err, data) => {
    if (err) { res.statusCode = 404; res.end('Not Found'); return; }
    res.end(data);
  });
});
```

```typescript
// Bun 方式
Bun.serve({
  fetch(req) {
    const file = Bun.file('./public/index.html');
    return new Response(file);
  },
});
```

两段代码完成的是相同的功能，但底层机制截然不同。Node.js 版本需要经过：磁盘读取 → 内核缓冲区 → 用户空间缓冲区 → 内核 Socket 缓冲区 → 网卡，共四次上下文切换和两次数据拷贝。Bun 版本通过 sendfile 系统调用，将文件数据直接从内核页面缓存发送到 Socket，实现了真正的零拷贝（zero-copy），CPU 利用率大幅降低，吞吐量提升 2-5 倍。

在实际生产环境中，Bun 静态文件服务器的表现令人印象深刻。一个中等配置的服务器（4 核 CPU、8GB 内存）使用 Bun.serve + Bun.file 可以轻松处理每秒数万个并发请求，而 Node.js 在相同硬件上通常只能处理数千个。这并非 Bun 的 HTTP 解析器更快（虽然也确实更快），而是零拷贝机制从根本上消除了数据搬移的开销。

静态文件服务器在真实世界中的应用非常广泛：前端 SPA 应用的资源托管、图片 CDN 的边缘节点、软件包仓库的文件分发、视频流媒体的基础传输层等。在这些场景中，Bun.file 的零拷贝特性可以显著降低服务器成本。以一个每日处理 1 亿次文件请求的 CDN 节点为例，如果每次请求节省 0.1ms 的 CPU 时间，每天就能节省约 3 小时的 CPU 核心时间，对应可观的服务器费用节省。

此外，Bun.file 在静态文件服务中还自动处理了 Content-Type 的检测。Bun 内部内置了 MIME 类型数据库，能够根据文件扩展名自动设置正确的 Content-Type 头。这意味着开发者无需手动引入 `mime` 或 `mime-types` 等第三方库，减少了依赖项和出错可能。

Bun 的 `Response` 构造函数在检测到 body 参数为 BunFile 对象时，会自动填充 Content-Length 和 Content-Type 头。这种智能检测机制不仅简化了代码，还避免了手动设置这些头时可能出现的错误（如 Content-Length 与实际文件大小不匹配导致的连接挂起）。

### 1.2 大文件处理

日志文件、CSV 数据集、图片和视频文件是后端系统中最常见的大文件类型。传统做法中，处理一个 2GB 的日志文件意味着需要小心翼翼地管理内存，分块读取，避免 OOM。

Bun 的 Stream API 与 Web 标准完全兼容，使得大文件处理变得简洁且安全：

```typescript
// 流式处理大日志文件，逐行分析
const file = Bun.file('/var/log/access.log');
const stream = file.stream();
const reader = stream.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // 按行处理
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // 保留不完整的行
  for (const line of lines) {
    // 处理每一行
    if (line.includes('ERROR')) console.log('Found error:', line);
  }
}
```

这种流式处理方式的内存开销仅取决于 chunk 大小（默认为 64KB），与文件总大小无关。即使面对 100GB 的巨型文件，内存占用也维持在可控范围内。

Bun 的流式读取还支持背压（backpressure）机制——当消费者处理速度跟不上生产者时，流会自动减缓读取速度，避免内存无限增长。这与 Node.js 的 Stream 背压机制原理相同，但 Bun 的实现基于 Web Streams API，接口更简洁，行为更可预测。

大文件处理的另一个典型场景是 CSV 数据导入。数据分析平台经常需要处理用户上传的数百 MB 甚至数 GB 的 CSV 文件。使用 Bun 的流式处理，可以逐行解析 CSV 数据并写入数据库，整个过程内存占用稳定在几十 MB 级别：

```typescript
async function importCSV(filePath: string) {
  const file = Bun.file(filePath);
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let headerLine = true;
  let headers: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer) processRow(buffer, headers);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (headerLine) {
        headers = parseCSVLine(line);
        headerLine = false;
      } else {
        processRow(line, headers);
      }
    }
  }
  console.log('CSV import completed');
}
```

图片处理是另一个大文件处理的典型场景。虽然图片本身通常不算特别大（几 MB 到几十 MB），但在批量处理时（例如生成缩略图、添加水印），并发量会导致内存压力急剧上升。使用 Bun 的流式读取配合 `pipeThrough`，可以在不显著增加内存的情况下进行图片数据的转换处理。

### 1.3 流式数据传输

流式传输不仅适用于文件读取，在跨网络的数据转发场景中同样大放异彩。例如，将上游服务的响应直接流式写入磁盘，或将文件流式上传到对象存储：

```typescript
// 从 URL 流式下载到本地文件
const response = await fetch('https://example.com/large-video.mp4');
const writer = Bun.file('/tmp/video.mp4').writer();
await response.body.pipeTo(writer);

// 将文件流式发送到远程服务
const file = Bun.file('/tmp/backup.sql');
const uploadRes = await fetch('https://api.example.com/upload', {
  method: 'POST',
  body: file.stream(),
  headers: { 'Content-Type': 'application/octet-stream' },
});
```

`pipeTo` 和 `pipeThrough` 是 Web Streams API 的核心方法。Bun 完全实现了这些方法，使得文件流与网络流可以无缝对接。这在构建代理服务器、日志收集器、数据管道等应用时极为便利。

流式数据传输还有一个重要的应用场景是实时日志聚合。在微服务架构中，各个服务的日志需要被集中收集、处理和存储。使用 Bun 的流式 API，可以构建高效的日志收集管道：

```typescript
// 日志收集管道
async function tailAndForward(logPath: string, remoteUrl: string) {
  const file = Bun.file(logPath);
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      // 异步转发到远程日志聚合服务
      fetch(remoteUrl, {
        method: 'POST',
        body: JSON.stringify({ log: line, timestamp: Date.now() }),
        headers: { 'Content-Type': 'application/json' },
      }).catch(err => console.error('Failed to forward log:', err));
    }
  }
}
```

这种流式转发模式在数据工程中被称为 ETL（Extract, Transform, Load）管道。Bun 的流式 API 使得构建 ETL 管道变得异常简洁，开发者可以专注于数据的转换逻辑，而不必关心底层的缓冲和流控细节。

### 1.4 文件上传与下载服务

构建文件上传/下载服务是后端开发中的常见需求。Bun.file 与 Bun.serve 的结合，让这一过程变得异常简洁：

```typescript
// 文件上传处理
Bun.serve({
  async fetch(req) {
    if (req.method === 'POST' && req.url.endsWith('/upload')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (file instanceof File) {
        await Bun.write(`/uploads/${file.name}`, file);
        return new Response('Uploaded successfully');
      }
    }
    // 文件下载
    const file = Bun.file('/uploads/' + req.url.pathname);
    return new Response(file);
  },
});
```

Bun 的表单数据解析原生支持 `File` 类型，上传的文件可以直接通过 `Bun.write()` 写入磁盘，无需额外的流处理或缓冲区管理。下载时返回 `Bun.file` 对象，自动设置 Content-Type 和 Content-Length，并且利用零拷贝机制直接从磁盘发送到网络。

在实际应用中，文件上传服务通常还需要考虑更多因素：文件大小限制、文件类型校验、病毒扫描、访问权限控制等。以下是一个更完整的文件上传实现示例：

```typescript
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

Bun.serve({
  async fetch(req) {
    if (req.method === 'POST' && req.url.endsWith('/upload')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return new Response('No file provided', { status: 400 });
      }
      // 文件类型校验
      if (!ALLOWED_TYPES.includes(file.type)) {
        return new Response('File type not allowed', { status: 400 });
      }
      // 文件大小校验
      if (file.size > MAX_SIZE) {
        return new Response('File too large', { status: 413 });
      }
      // 生成唯一文件名防止冲突
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
      await Bun.write(`/uploads/${uniqueName}`, file);
      return new Response(JSON.stringify({ url: `/downloads/${uniqueName}` }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  },
});
```

### 1.5 配置文件读取

现代应用往往需要读取多种格式的配置文件——JSON、YAML、TOML、环境变量文件等。Bun.file 的 `.json()` 方法直接返回解析后的 JavaScript 对象，对于其他格式，可以结合 `.text()` 和第三方解析库使用：

```typescript
// 读取 JSON 配置
const config = await Bun.file('/app/config.json').json();
console.log(config.database.host);

// 读取环境变量文件
const envContent = await Bun.file('/app/.env').text();
for (const line of envContent.split('\n')) {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
}
```

需要注意的是，`.json()` 方法会在内部使用 `JSON.parse()`，对于大文件推荐使用流式 JSON 解析器（如 `JSONStream` 或 `stream-json`），以避免将整个文件加载到内存中。

配置文件的读取还有一个常被忽视的方面——热重载（hot reload）。在开发环境中，配置文件发生变化时应用应该自动重新加载配置。结合 Bun 的 `Bun.file` 和定时器或文件系统监听，可以实现配置热重载：

```typescript
async function loadConfig() {
  try {
    return await Bun.file('/app/config.json').json();
  } catch {
    return {}; // 使用默认配置
  }
}

let config = await loadConfig();

// 每 30 秒重新加载配置
setInterval(async () => {
  const newConfig = await loadConfig();
  if (JSON.stringify(newConfig) !== JSON.stringify(config)) {
    console.log('Config changed, reloading...');
    config = newConfig;
  }
}, 30000);
```

### 1.6 二进制文件处理

Bun.file 不仅适用于文本文件，对二进制文件（图片、音频、视频、压缩包等）同样提供了完善的 API 支持。通过 `.arrayBuffer()` 方法可以获取文件的二进制数据，通过 `.stream()` 可以流式处理二进制数据：

```typescript
// 读取图片文件并获取其二进制数据
const imageFile = Bun.file('/path/to/image.png');
const buffer = await imageFile.arrayBuffer();
console.log(`Image size: ${buffer.byteLength} bytes`);

// 计算文件的 SHA-256 哈希
const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
console.log(`File hash: ${hashHex}`);
```

二进制文件处理的一个常见场景是文件完整性校验。在软件分发、数据备份、文件同步等场景中，需要计算文件的哈希值以验证其完整性。Bun.file 配合 Web Crypto API 可以轻松实现这一功能，而且 `.arrayBuffer()` 的 mmap 实现使得大文件的哈希计算效率远高于传统 read 方式。

### 1.7 数据持久化与缓存

在应用开发中，经常需要将数据持久化到磁盘，或者使用文件系统作为缓存层。Bun.write 提供了简洁高效的数据持久化方案：

```typescript
// 简单的键值持久化
class SimpleKVStore {
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }
  
  async get(key: string): Promise<any | null> {
    try {
      const data = await Bun.file(this.dbPath).json();
      return data[key] ?? null;
    } catch {
      return null;
    }
  }
  
  async set(key: string, value: any): Promise<void> {
    let data: Record<string, any> = {};
    try {
      data = await Bun.file(this.dbPath).json();
    } catch {}
    data[key] = value;
    await Bun.write(this.dbPath, JSON.stringify(data, null, 2));
  }
  
  async delete(key: string): Promise<void> {
    let data: Record<string, any> = {};
    try {
      data = await Bun.file(this.dbPath).json();
    } catch {}
    delete data[key];
    await Bun.write(this.dbPath, JSON.stringify(data));
  }
}

// 使用示例
const store = new SimpleKVStore('/tmp/kvstore.json');
await store.set('user:1', { name: 'Alice', email: 'alice@example.com' });
const user = await store.get('user:1');
console.log(user);
```

这种基于文件的键值存储适用于配置管理、会话存储、小型数据持久化等场景。对于数据量不大但需要持久化的场景，使用文件系统作为存储介质比引入数据库更加轻量级。

---

## 二、实现原理

### 2.1 Lazy Evaluation 设计

`Bun.file()` 的设计哲学中最关键的一点是惰性求值（lazy evaluation）。当你调用 `Bun.file(path)` 时，Bun 并不会立即打开文件或读取任何数据，而是仅仅创建一个文件句柄对象，记录文件路径和少量元数据。实际的 I/O 操作直到你调用 `.text()`、`.json()`、`.arrayBuffer()`、`.stream()` 或创建 `Response` 时才会触发。

```
调用 Bun.file("/data/log.txt")

  时间点 1: Bun.file() 被调用
    ┌─────────────────────────────┐
    │  BunFile 对象创建           │
    │  ├─ path: "/data/log.txt"   │
    │  ├─ size: undefined         │
    │  └─ type: undefined         │
    └─────────────────────────────┘
    没有系统调用发生
    ↓

  时间点 2: .text() 被调用
    ┌─────────────────────────────┐
    │  触发实际 I/O               │
    │  ├─ open() 系统调用         │
    │  ├─ mmap() 或 read()        │
    │  └─ close()                 │
    └─────────────────────────────┘
    真实磁盘访问开始
```

这种设计的优势体现在三个方面：

**第一，对象创建零开销。** 你可以安全地创建大量 BunFile 对象而不用担心资源消耗。例如，遍历一个包含一万个文件的目录时，为每个文件创建一个 BunFile 实例不会产生任何系统调用，全部开销仅在于内存中的对象创建。这在构建文件浏览器、批量处理工具等应用时非常有用。

**第二，延迟错误报告。** 如果文件路径不存在，`Bun.file()` 本身不会抛出错误。错误会推迟到实际读取操作时才暴露。这允许你在创建引用后先进行其他处理，然后再处理可能的 I/O 错误：

```typescript
// 安全：创建引用不会失败
const file = Bun.file('/maybe/not/exist.txt');
// 中间可以执行其他逻辑
doOtherWork();
// 错误在这里才可能出现
try {
  const content = await file.text();
} catch (e) {
  console.log('File not found, using default');
}
```

**第三，优化决策延迟。** Bun 在触发实际 I/O 时，会根据文件的实际属性（大小、类型、位置）动态选择最优的读取策略。小文件可能使用简单的 `read()` 系统调用，大文件可能使用 `mmap()`，而通过 `Response` 返回时则使用 `sendfile()`。这种决策只有在真正需要数据时才能做出，因为此时 Bun 已经可以通过 `stat()` 获取文件的准确信息。

深入来看，BunFile 对象在 Bun 的 C++ 底层实现中是一个名为 `BunFile` 的类（定义在 Bun 源码的 `src/bun.js/webcore/blob.zig` 中），它继承自 `Blob` 类。在 Zig 语言中，BunFile 结构体包含以下字段：

```
BunFile (Zig 结构体)
  ├─ path: string              // 文件路径
  ├─ dir_fd: i32              // 目录文件描述符（用于 openat）
  ├─ size: ?u64               // 文件大小（惰性获取）
  ├─ lastModified: ?i64       // 最后修改时间（惰性获取）
  ├─ mime_type: ?string       // MIME 类型（根据扩展名推断）
  └─ locked: bool             // 是否锁定（用于并发控制）
```

当 `.text()` 等方法被调用时，Bun 内部会执行以下步骤：
1. 检查 `size` 是否已缓存，如果没有则调用 `stat()` 获取。
2. 根据 `size` 决定使用 mmap 还是 read。
3. 执行实际的 I/O 操作。
4. 将结果缓存（如果适用）。
5. 返回结果。

这种惰性求值 + 按需缓存的设计模式，在保证高性能的同时也提供了灵活的错误处理机制。

### 2.2 Sendfile 系统调用与零拷贝

零拷贝（zero-copy）是 Bun.file 性能优势的核心秘密。要理解零拷贝，首先需要了解传统 I/O 路径中的数据流动方式。

#### 传统 read/write 路径

当 Node.js 使用 `fs.readFile()` 读取文件并通过 `res.end()` 发送时，数据在内核和用户空间之间经历了多次拷贝：

```
用户空间 (User Space)
  ┌─────────────────────┐
  │  Node.js 进程        │ ③ 用户空间缓冲区 (data)
  │  ┌───────────────┐   │    ← 从内核空间拷贝过来
  │  │  Buffer data   │──┼──→ ④ 再拷贝回内核 Socket 缓冲区
  │  └───────────────┘   │
  └─────────┬────────────┘
            │ ② read()     │ ④ write()
            ↓              ↓
内核空间 (Kernel Space)
  ┌─────────────────────────┐
  │  ① 磁盘 → 页面缓存       │ → ⑤ Socket 缓冲区 → 网卡
  │  (Page Cache)           │
  └─────────────────────────┘
```

共发生 4 次上下文切换（用户态 ↔ 内核态）和 2 次数据拷贝。数据路径为：磁盘 → 内核页面缓存 → 用户空间缓冲区 → 内核 Socket 缓冲区 → 网卡。

每次上下文切换的开销大约为 1-5 微秒，虽然单次看起来微不足道，但在高并发场景下（每秒数万次请求），上下文切换的开销会急剧累积。而数据拷贝的开销更为显著——每次 CPU 拷贝需要在用户空间和内核空间之间搬移数据，不仅消耗 CPU 周期，还会污染 CPU 缓存（cache pollution），降低缓存命中率。

#### Sendfile 零拷贝路径

Bun 通过 sendfile 系统调用绕过了用户空间：

```
用户空间 (User Space)
  ┌─────────────────────┐
  │  Bun 进程            │
  │  (不触碰文件数据)     │  ← 数据完全不经过这里
  └─────────────────────┘

内核空间 (Kernel Space)
  ┌─────────────────────────┐
  │  ① 磁盘 → 页面缓存       │ → ② 直接发送到 Socket 缓冲区
  │  (Page Cache)           │    → ③ 网卡
  └─────────────────────────┘
```

共发生 2 次上下文切换和 0 次数据拷贝（在内核内部完成）。数据路径为：磁盘 → 内核页面缓存 → 内核 Socket 缓冲区 → 网卡。

sendfile 的签名在 Linux 中为：

```c
#include <sys/sendfile.h>
ssize_t sendfile(int out_fd, int in_fd, off_t *offset, size_t count);
```

其中 `out_fd` 是 Socket 文件描述符，`in_fd` 是文件描述符，`offset` 指定起始位置，`count` 指定传输字节数。Bun 在内部将 BunFile 与 Socket 关联，调用 sendfile 完成数据传输。

sendfile 的另一个重要特性是它可以处理部分传输。如果 Socket 的发送缓冲区已满，sendfile 会传输尽可能多的数据并返回实际传输的字节数。调用者需要根据返回值调整 offset 并继续调用，直到所有数据被传输完毕。Bun 内部封装了这一循环逻辑，开发者无需关心。

#### 性能对比数据

以下是在同一台机器上对 10MB 文件进行 1000 次并发请求的性能测试结果（测试环境：Linux 6.1, 4 vCPU, 8GB RAM）：

| 方式 | 平均延迟 | P99 延迟 | 吞吐量 | CPU 使用率 |
|------|---------|---------|--------|-----------|
| Node.js fs.readFile | 12ms | 45ms | 8,200 req/s | 65% |
| Node.js fs.createReadStream | 15ms | 52ms | 6,800 req/s | 58% |
| Bun.file + Response | 3ms | 8ms | 32,000 req/s | 22% |

Bun 的延迟仅为 Node.js 的 1/4，吞吐量达到 4 倍，而 CPU 使用率只有 Node.js 的 1/3。这个差距在大文件场景下更加明显。

为什么 `fs.createReadStream` 甚至比 `fs.readFile` 还慢？这是因为流式读取引入了额外的缓冲层和事件分发开销。在 Node.js 中，`createReadStream` 会创建 `Readable` 流对象，每次读取的数据块需要经过 `push` 到流内部缓冲、触发 `data` 事件、在 `pipe` 目标中进行写入等多个步骤。每一步都涉及 JavaScript 层面的函数调用和事件循环调度，累积起来反而比一次性的 `readFile` 更慢。当然，`createReadStream` 的优势在于内存控制而非原始速度，对于大文件场景它仍然是必要的。

### 2.3 内存映射文件 (mmap)

对于需要通过 `.text()`、`.json()` 等方式访问文件内容的场景，Bun 采用内存映射文件（mmap）策略，而不是传统的 `read()` 系统调用。

mmap 将文件直接映射到进程的虚拟地址空间，使得对文件内容的访问如同访问普通内存一样。操作系统负责在后台处理页面错误（page fault），按需加载文件数据。

```
传统 read() 方式：
  进程虚拟地址空间        物理内存          磁盘
  ┌──────────┐         ┌──────────┐     ┌──────────┐
  │ 缓冲区    │←read()→│ 页面缓存  │←──→│ 文件数据  │
  │ (私有)   │         │          │     │          │
  └──────────┘         └──────────┘     └──────────┘
  需要显式分配缓冲区      需要拷贝数据

mmap 方式：
  进程虚拟地址空间        物理内存          磁盘
  ┌──────────┐         ┌──────────┐     ┌──────────┐
  │ 映射区域  │←──────→│ 页面缓存  │←──→│ 文件数据  │
  │ (共享)   │         │          │     │          │
  └──────────┘         └──────────┘     └──────────┘
  不需要拷贝            按需缺页加载
```

mmap 的优势在于：

1. **减少数据拷贝**：应用程序可以直接访问内核页面缓存中的数据，无需额外的 read() 拷贝。
2. **按需加载**：只有实际访问的页面才会被加载到内存中，对于大文件的随机访问场景极为高效。
3. **共享内存**：多个进程可以映射同一个文件，共享同一份物理内存。
4. **操作系统自动管理**：页面淘汰、预读（read-ahead）等由内核自动完成。

Bun 在决定是否使用 mmap 时，会根据文件大小做出智能选择：

- **小文件（< 4KB）**：使用简单的 `read()` 系统调用，mmap 的建立开销可能超过收益。
- **中等文件（4KB ~ 1GB）**：使用 mmap，获得最佳读写性能。
- **大文件（> 1GB）**：使用 mmap 但启用 MAP_PRIVATE 标志，避免修改影响原始文件。对于超大文件，回退到流式读取。

这种自适应策略确保在各种文件大小下都能获得最优性能。

mmap 的内部实现涉及多个系统调用。当 Bun 决定使用 mmap 时，执行流程如下：

1. `open()` 打开文件，获取文件描述符。
2. `fstat()` 获取文件大小。
3. `mmap(NULL, size, PROT_READ, MAP_SHARED, fd, 0)` 建立内存映射。
4. 通过指针直接访问映射区域的数据。
5. 操作完成后调用 `munmap()` 解除映射。
6. 调用 `close()` 关闭文件描述符。

mmap 的一个潜在问题是内存碎片。对于大量小文件的并发读取，mmap 会创建大量虚拟内存区域（VMA），每个 VMA 在内核中都需要维护元数据。当 VMA 数量超过系统限制（`/proc/sys/vm/max_map_count`，默认 65536）时，mmap 会失败。Bun 对此有相应的回退策略——当 mmap 失败时，自动降级为普通的 read 方式读取。

### 2.4 Bun.write 的原子性保证

`Bun.write()` 的设计目标之一是在保证高性能的同时，提供合理的原子性保证。所谓原子性，是指写入操作要么完全成功，要么完全不生效，不会出现部分写入的中间状态。

Bun 实现原子写入的策略是"写入临时文件 + 重命名"：

```
Bun.write("/data/config.json", configContent)

  步骤 1: 创建临时文件
    /tmp/.bun-tmp-xxxxx  ← 写入内容到临时文件

  步骤 2: 刷入磁盘 (fsync)
    fsync(/tmp/.bun-tmp-xxxxx)  ← 确保数据落盘

  步骤 3: 原子重命名
    rename("/tmp/.bun-tmp-xxxxx", "/data/config.json")
    ← 这是 POSIX 标准的原子操作（在同一文件系统内）
```

这种策略保证了：

- **崩溃安全**：如果在写入过程中进程崩溃，临时文件会被自动清理，目标文件保持原样。
- **读取一致性**：其他进程在任意时刻读取目标文件，要么看到完整的老版本，要么看到完整的新版本，永远不会看到半写状态。
- **无锁并发**：由于重命名是原子的，多个写入者不需要显式加锁。

需要注意的是，`Bun.write()` 的原子性保证有一个前提条件：临时文件和目标文件必须在同一个文件系统（挂载点）内，否则 `rename()` 系统调用会失败（返回 EXDEV 错误）。如果跨文件系统，Bun 会回退到直接写入目标文件，此时原子性保证降级。

Bun.write 的第二个参数支持多种类型：字符串、ArrayBuffer、TypedArray、Blob、Response、ReadableStream。针对不同的输入类型，Bun 内部采用不同的写入策略：

- **字符串**：编码为 UTF-8 字节序列后写入。
- **ArrayBuffer / TypedArray**：直接写入底层字节数组。
- **Blob（包括 BunFile）**：如果源和目标都是文件，尝试使用 `sendfile()` 或 `copy_file_range()` 进行内核级文件复制。
- **Response**：读取 Response body 后写入，对大型 Response body 使用流式传输。
- **ReadableStream**：使用流式管道写入，支持背压控制。

对于大型数据的写入，Bun 还支持分片写入（chunked write）。内部会将数据分成 64KB 的块，逐块写入，避免单次写入操作占用过多内核资源。这种分片策略对于大文件写入（如数据库备份、视频文件导出）尤为重要。

### 2.5 Stream API 集成

Bun 的 Stream API 完全遵循 Web Streams Standard，这是 WHATWG 制定的流标准，与浏览器中的 `ReadableStream`、`WritableStream`、`TransformStream` 接口完全一致。

Bun.file 返回的 `BunFile` 对象实现了 `Blob` 接口，而 `Blob` 的 `.stream()` 方法返回一个标准的 `ReadableStream`。这使得 Bun 的文件流可以与任何接受 Web Streams 的 API 无缝协作：

```typescript
const file = Bun.file('/data/large.txt');
const stream = file.stream();

// 可以通过 pipeTo 写入任何 WritableStream
const writable = Bun.file('/data/copy.txt').writer();
await stream.pipeTo(writable);

// 可以通过 pipeThrough 应用转换
const uppercaseStream = stream.pipeThrough(new TextEncoderStream());
const transformStream = new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(new TextDecoder().decode(chunk).toUpperCase());
  },
});
await file.stream().pipeThrough(transformStream).pipeTo(writable);
```

在底层，Bun 的 ReadableStream 实现使用了一个名为 `FileReader` 的内部类，它封装了文件描述符管理和读取策略：

```
ReadableStream (Web API 层)
  ┌─────────────────────────┐
  │  controller.enqueue()   │
  │  reader.read()          │
  └─────────┬───────────────┘
            │
  FileReader (Bun 内部层)
  ┌─────────────────────────┐
  │  read() / pread()       │
  │  mmap 区域访问          │
  │  背压管理               │
  └─────────┬───────────────┘
            │
  操作系统 I/O 层
  ┌─────────────────────────┐
  │  io_uring / kqueue      │
  │  sendfile               │
  │  page cache             │
  └─────────────────────────┘
```

在 Linux 5.1+ 内核上，Bun 使用 `io_uring` 进行异步 I/O，这是 Linux 最新、最高效的异步 I/O 框架。io_uring 通过提交队列（Submission Queue, SQ）和完成队列（Completion Queue, CQ）实现零系统调用开销的异步 I/O：

```
io_uring 工作原理

  用户空间                        内核空间
  ┌─────────────────┐           ┌─────────────────┐
  │ SQ (提交队列)    │──共享内存→│ 消费 SQ 条目     │
  │ ┌─────────────┐ │           │ ┌─────────────┐ │
  │ │ read op     │ │           │ │ 执行 I/O     │ │
  │ │ write op    │ │           │ │              │ │
  │ └─────────────┘ │           │ └─────────────┘ │
  │                  │           │                  │
  │ CQ (完成队列)    │←共享内存──│ 写入完成结果     │
  │ ┌─────────────┐ │           │ ┌─────────────┐ │
  │ │ read done   │ │           │ │              │ │
  │ └─────────────┘ │           │ └─────────────┘ │
  └─────────────────┘           └─────────────────┘
  无需系统调用即可提交和收割 I/O 操作
```

io_uring 相比传统的 `epoll` + 非阻塞 I/O 模式，减少了每次 I/O 操作所需的系统调用次数，在大规模并发场景下性能优势明显。

io_uring 的工作流程可以概括为以下步骤：

1. **准备阶段**：应用程序在 SQ（Submission Queue）中填充 I/O 请求（read、write、openat、stat 等操作）。
2. **提交阶段**：通过 `io_uring_enter()` 系统调用（或使用 SQPOLL 模式由内核线程自动消费）通知内核处理 SQ 中的请求。
3. **执行阶段**：内核异步执行 I/O 操作，不阻塞应用程序。
4. **完成阶段**：内核将操作结果写入 CQ（Completion Queue），应用程序从 CQ 中收割结果。

io_uring 的一个重要优化是 SQPOLL 模式。在这种模式下，内核会创建一个专用的轮询线程，定期检查 SQ 中是否有新的请求需要处理。应用程序不再需要调用 `io_uring_enter()` 来提交请求，完全消除了系统调用的开销。Bun 在检测到内核支持 SQPOLL 时会自动启用这一模式。

### 2.6 文件类型检测机制

Bun.file 在创建 `Response` 时会自动检测文件的 MIME 类型。这一机制基于文件扩展名与 MIME 类型的映射表。Bun 内置了一份完整的 MIME 类型数据库（源自 Apache HTTP Server 的 mime.types 文件），涵盖了数百种常见的文件类型。

MIME 类型检测流程如下：

```
Bun.file("image.jpg") → Response
  │
  ├─ 提取文件扩展名: ".jpg"
  ├─ 查表匹配 MIME 类型: "image/jpeg"
  ├─ 通过 stat 获取文件大小
  └─ 设置 Response 头:
       Content-Type: image/jpeg
       Content-Length: 123456
```

对于无法识别的文件扩展名，Bun 会回退到 `application/octet-stream` 作为默认 MIME 类型。开发者也可以通过显式设置 Content-Type 头来覆盖 Bun 的自动检测。

---

## 三、潜在风险与优化

### 3.1 大文件内存压力

虽然 Bun 在读取文件时会根据文件大小选择最优策略，但某些 API 调用方式仍然可能导致内存压力。最典型的陷阱是在处理大文件时使用 `.text()` 或 `.json()`：

```typescript
// 危险：将整个 2GB 文件加载到内存
const content = await Bun.file('/data/huge.log').text();
// 此时内存占用 2GB+
```

`Bun.file(path).text()` 会读取文件的全部内容到一个 JavaScript 字符串中。对于 GB 级别的文件，这意味着内存占用会瞬间飙升，可能导致 OOM（Out of Memory）或严重的 GC 停顿。

更糟糕的是，JavaScript 引擎中的字符串在内存中的占用通常比 UTF-8 编码的字节数更大。V8 和 JavaScriptCore（Bun 使用的引擎）内部使用 UTF-16 或 Latin-1 编码存储字符串，这意味着一个 1GB 的 UTF-8 文本文件在 JavaScript 字符串中可能占用 2GB 以上的内存。再加上临时缓冲区、mmap 映射区域等开销，实际内存压力可能达到文件大小的 2-3 倍。

**优化策略：**

1. **使用流式读取**：对于大文件，始终使用 `.stream()` 方法结合流式处理。
2. **使用范围读取**：如果只需要文件的一部分，可以使用 `Bun.file()` 的 `.slice()` 方法：
   ```typescript
   // 只读取文件的前 1MB
   const head = await Bun.file('/data/huge.log').slice(0, 1024 * 1024).text();
   ```
3. **监控内存使用**：在处理未知大小的文件时，先检查 `file.size`，根据大小决定读取策略：
   ```typescript
   const file = Bun.file('/data/unknown.log');
   const size = file.size;
   if (size > 100 * 1024 * 1024) { // > 100MB
     // 使用流式处理
     const stream = file.stream();
     // ...
   } else {
     const content = await file.text();
   }
   ```

除了上述策略，还可以考虑使用外部排序（external sorting）或内存映射数据库（如 LMDB）来处理超大文件。外部排序是一种将数据分块排序、逐块合并的算法，适用于无法将全部数据加载到内存中的场景。

### 3.2 并发读写竞争条件

当多个进程或线程同时读写同一个文件时，可能出现竞态条件（race condition）。Bun 的原子写入策略（临时文件 + 重命名）在一定程度上缓解了这个问题，但并非万能。

**场景一：读-写竞争**

```
进程 A (写入)              进程 B (读取)
  │                          │
  ├─ 创建临时文件             │
  ├─ 写入数据                 │
  │                          ├─ Bun.file("/data/cfg.json").text()
  │                          │  ← 读取到旧版本
  ├─ fsync                   │
  ├─ rename 到目标文件        │
  │                          ├─ Bun.file("/data/cfg.json").text()
  │                          │  ← 读取到新版本
  ▼                          ▼
```

在进程 A 写入完成并重命名之前，进程 B 始终读取到旧版本。这通常是期望的行为，但在某些需要强一致性的场景下可能造成问题。

**场景二：写-写竞争**

如果两个进程同时写入同一个文件：

```
进程 A: Bun.write("/data/app.log", "line 1\n")
进程 B: Bun.write("/data/app.log", "line 2\n")
```

如果使用原子写入策略，最终结果取决于哪个进程最后完成重命名，另一个进程的写入会被完全覆盖。对于日志追加的场景，这显然是错误的行为。

**场景三：读-读竞争与共享缓存**

在多个进程或线程同时读取同一文件时，虽然不会出现数据损坏，但可能造成"惊群效应"（thundering herd）——多个读取者同时触发缺页中断，导致磁盘 I/O 飙升。这个问题在 Page Cache 未预热时尤为严重。

**解决方案：**

- **追加写入**：使用 `Bun.write()` 的追加模式（如果支持），或手动打开文件描述符进行追加。
- **文件锁**：使用 `flock` 或 `fcntl` 文件锁协调并发访问。
- **唯一文件名**：每个写入者使用唯一文件名（如包含时间戳和进程 ID），避免冲突。
- **使用数据库**：对于需要强一致性保证的场景，考虑使用 SQLite 或 PostgreSQL 等数据库。

文件锁的使用示例：

```typescript
import { file } from 'bun';
import { flock } from 'fs';

async function writeWithLock(path: string, data: string) {
  // 注意：这是一个概念示例，实际 Bun 中需要使用底层 API
  const fd = await file(path);
  try {
    // 获取独占锁
    await fd.lock('exclusive');
    await Bun.write(path, data);
    await fd.sync(); // 确保数据落盘
  } finally {
    await fd.unlock();
  }
}
```

### 3.3 操作系统相关的 Sendfile 限制

sendfile 系统调用虽然高效，但并非在所有操作系统和所有场景下都适用。

**Linux 限制：**

1. **最大传输大小**：sendfile 单次调用的最大传输量受限于 `/proc/sys/fs/pipe-max-size`（默认为 1MB）。Bun 内部会处理分片，但理解这个限制有助于解释某些性能特征。
2. **不支持 HTTPS**：sendfile 操作的是文件描述符到 Socket 描述符的直接传输。对于 TLS/SSL 加密的连接，数据必须经过加密层，零拷贝的优势无法完全发挥。Bun 在 HTTPS 场景下仍需在用户空间进行加密。
3. **不支持某些文件系统**：sendfile 在 NFS、FUSE 等网络文件系统上的行为可能与本地文件系统不同。在 NFS 上，sendfile 可能退化为普通的 read/write。
4. **Splice 限制**：在较旧的 Linux 内核（< 5.4）上，sendfile 对某些设备类型有限制。

**macOS 限制：**

macOS 的 sendfile 实现与 Linux 有所不同：

1. 需要调用者预先设置 Socket 的 `SO_NOSIGPIPE` 选项。
2. 对文件大小有限制，超过 2GB 的文件可能需要分多次调用。
3. macOS 的 sendfile 不支持从特殊文件（如 `/dev/zero`）传输数据。

**Windows 限制：**

Windows 没有 sendfile 系统调用。Bun 在 Windows 上使用 `TransmitFile` API 作为替代，这是 Windows 特有的零拷贝文件传输 API。其行为与 sendfile 类似，但参数和限制不同。

Bun 内部封装了这些操作系统差异，为开发者提供统一的 API。但在进行跨平台部署时，了解这些底层差异有助于排查性能问题。

### 3.4 文件描述符泄漏

文件描述符（File Descriptor, FD）是操作系统级别的有限资源。每个进程能打开的文件描述符数量受到系统限制（Linux 默认为 1024，可通过 `ulimit -n` 调整）。

Bun 的惰性求值设计意味着 `Bun.file()` 本身不会占用文件描述符。文件描述符只有在实际执行 I/O 操作时才会被打开，操作完成后会被关闭。但在某些边缘情况下，文件描述符可能泄漏：

```typescript
// 潜在泄漏场景
async function processManyFiles(paths: string[]) {
  for (const path of paths) {
    const file = Bun.file(path);
    // 如果 .text() 抛出异常，文件描述符是否被正确关闭？
    const content = await file.text();
    // 处理 content...
  }
}
```

在上面的代码中，如果 `file.text()` 抛出异常（例如文件读取过程中磁盘错误），Bun 内部会确保已打开的文件描述符被关闭。但如果异常发生在 `.text()` 返回 Promise 之前（同步阶段），则需要格外注意。

**最佳实践：**

1. **使用 try-finally 确保清理**：虽然 Bun 内部会处理，但显式的错误处理仍然是好习惯。
2. **监控 FD 使用量**：在生产环境中监控进程的文件描述符数量，设置告警阈值。
3. **避免在热路径中创建大量 BunFile 对象**：虽然 BunFile 对象本身不占用 FD，但如果大量对象同时触发 I/O 操作，可能导致 FD 耗尽。
4. **调整系统限制**：对于高并发文件服务器，适当提高 `ulimit -n` 的值。

```typescript
// 监控文件描述符使用（Linux）
import { spawnSync } from 'bun';
const result = spawnSync(['lsof', '-p', String(process.pid)]);
const fdCount = result.stdout.toString().split('\n').length - 1;
console.log(`Current FD count: ${fdCount}`);
```

文件描述符泄漏的另一个常见来源是未正确关闭的流。如果你使用 `.stream()` 获取了一个 ReadableStream，但没有将其完全消费（读取直到 `done` 为 `true`），底层的文件描述符可能不会立即释放。确保流被正确关闭是防止 FD 泄漏的重要措施：

```typescript
async function safeReadStream(path: string) {
  const file = Bun.file(path);
  const stream = file.stream();
  const reader = stream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // 处理数据
    }
  } finally {
    reader.cancel().catch(() => {}); // 确保释放资源
  }
}
```

### 3.5 跨平台路径处理

文件路径处理是跨平台开发中的常见陷阱。Windows 使用反斜杠 `\` 作为路径分隔符，而 Unix/Linux 和 macOS 使用正斜杠 `/`。

Bun 的路径处理在 Windows 和 Unix 系统上行为一致，但开发者仍需注意：

```typescript
// 跨平台兼容写法
import { join } from 'path';

// 推荐：使用 path.join
const filePath = join('/app', 'data', 'config.json');
const file = Bun.file(filePath);

// 避免：硬编码路径分隔符
const wrongPath = '/app\\data\\config.json'; // 在 Unix 上会出错
```

Bun 的 `Bun.file()` 在 Windows 上会正确处理路径规范化，但在涉及相对路径、符号链接和网络路径时仍需谨慎。

路径遍历攻击（Path Traversal Attack）是文件服务中常见的安全漏洞。攻击者通过构造包含 `../` 的 URL，试图访问服务器上的任意文件。在构建静态文件服务器时，必须对用户提供的路径进行严格校验：

```typescript
function safeJoin(base: string, userPath: string): string {
  // 防止路径遍历攻击
  const resolved = join(base, userPath);
  // 检查解析后的路径是否仍在 base 目录下
  if (!resolved.startsWith(base)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

// 在静态服务器中使用
Bun.serve({
  fetch(req) {
    const url = new URL(req.url);
    try {
      const safePath = safeJoin('/var/www/public', url.pathname);
      const file = Bun.file(safePath);
      return new Response(file);
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
  },
});
```

### 3.6 临时文件清理

Bun.write 在原子写入过程中创建的临时文件（位于 `/tmp/.bun-tmp-*`）在正常情况下会被自动清理。但如果进程在写入过程中被强制终止（如 `SIGKILL`），临时文件可能残留。

虽然 Bun 在启动时会尝试清理残留的临时文件，但在生产环境中建议建立额外的清理机制：

```typescript
// 定期清理残留的临时文件
import { Glob } from 'bun';

setInterval(async () => {
  const glob = new Glob('/tmp/.bun-tmp-*');
  for await (const file of glob.scan()) {
    try {
      const stat = await Bun.file(file).stat();
      // 清理超过 1 小时的临时文件
      if (Date.now() - stat.mtimeMs > 3600000) {
        await Bun.write(file, ''); // 清空
        // 注意：这里无法直接删除文件，Bun 没有提供 unlink API
        // 需要使用 fs 模块或 shell 命令
      }
    } catch {}
  }
}, 3600000); // 每小时执行一次
```

### 3.7 安全注意事项

使用 Bun.file 构建文件服务时，需要注意以下安全事项：

1. **路径规范化**：始终对用户输入的路径进行规范化处理，防止 `..` 路径遍历。
2. **文件类型限制**：限制可访问的文件类型，防止敏感文件泄露（如 `.env`、`.git/config`、`node_modules` 等）。
3. **符号链接检查**：注意符号链接可能指向预期目录之外的文件。
4. **访问权限控制**：确保文件服务不暴露未授权的文件。

```typescript
// 安全的静态文件服务器
const PUBLIC_DIR = '/var/www/public';
const BLOCKED_PATTERNS = ['.env', '.git', 'node_modules', '.ssh'];

Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);
    const requestedPath = join(PUBLIC_DIR, url.pathname);
    
    // 检查是否在公共目录内
    if (!requestedPath.startsWith(PUBLIC_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // 检查是否被禁止的模式
    for (const pattern of BLOCKED_PATTERNS) {
      if (requestedPath.includes(pattern)) {
        return new Response('Forbidden', { status: 403 });
      }
    }
    
    const file = Bun.file(requestedPath);
    if (!(await file.exists())) {
      return new Response('Not Found', { status: 404 });
    }
    
    return new Response(file);
  },
});
```

---

## 四、典型问题处理

### 4.1 文件不存在：错误处理模式

`Bun.file()` 本身不会检查文件是否存在，因此你需要显式处理文件不存在的情况：

```typescript
// 方法一：使用 file.exists() 检查
const file = Bun.file('/data/config.json');
if (await file.exists()) {
  const config = await file.json();
} else {
  console.log('Config file not found, using defaults');
}

// 方法二：使用 try-catch 捕获读取错误
try {
  const config = await Bun.file('/data/config.json').json();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
    console.log('Config file not found');
  } else {
    throw e; // 重新抛出其他类型的错误
  }
}

// 方法三：提供默认值
const config = await Bun.file('/data/config.json').json().catch(() => ({}));
```

三种方法的比较：

| 方法 | 优点 | 缺点 |
|------|------|------|
| `file.exists()` + 条件判断 | 语义清晰，显式检查 | 额外一次 stat 系统调用 |
| try-catch | 避免额外系统调用 | 代码稍显冗长 |
| `.catch()` | 最简洁 | 无法区分 ENOENT 和其他错误 |

对于性能敏感的场景，推荐使用方法二（try-catch），因为它在文件存在时只产生一次 I/O 操作。对于配置文件等访问频率较低的场景，三种方法差异不大，选择可读性最好的即可。

需要注意的是，`file.exists()` 返回的是 Promise<boolean>，而不是 boolean。初学者容易忘记 `await`，导致条件判断始终为真（因为 Promise 对象是真值）：

```typescript
// 错误：忘记 await
const file = Bun.file('/data/config.json');
if (file.exists()) { // 这里始终为 true，因为 file.exists() 返回 Promise 对象
  // 永远会执行这里
}

// 正确：使用 await
if (await file.exists()) {
  // 只在文件存在时执行
}
```

### 4.2 大文件 OOM：流式处理方案

当处理大文件时，最忌讳的就是将整个文件加载到内存中。以下是几种常见的流式处理模式：

**模式一：逐块处理**

```typescript
async function processLargeFile(path: string) {
  const file = Bun.file(path);
  const stream = file.stream();
  const reader = stream.getReader();
  let processed = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    processed += value.length;
    // 处理每个 chunk
    processChunk(value);
  }
  console.log(`Processed ${processed} bytes`);
}
```

**模式二：按行处理**

对于日志文件和 CSV 文件，按行处理是最自然的模式：

```typescript
async function readLines(path: string, onLine: (line: string) => void) {
  const file = Bun.file(path);
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer) onLine(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留不完整的行
    for (const line of lines) {
      onLine(line);
    }
  }
}

// 使用示例：统计日志中的 ERROR 数量
let errorCount = 0;
await readLines('/var/log/app.log', (line) => {
  if (line.includes('ERROR')) errorCount++;
});
console.log(`Found ${errorCount} errors`);
```

**模式三：管道转换**

使用 `TransformStream` 进行流式转换：

```typescript
// 创建一个将文本转换为大写的转换流
const toUpperTransform = new TransformStream({
  transform(chunk: Uint8Array, controller) {
    const text = new TextDecoder().decode(chunk);
    controller.enqueue(new TextEncoder().encode(text.toUpperCase()));
  },
});

// 读取文件 → 转换为大写 → 写入新文件
await Bun.file('/data/input.txt')
  .stream()
  .pipeThrough(toUpperTransform)
  .pipeTo(Bun.file('/data/output.txt').writer());
```

**模式四：限定并发数处理**

在处理大量大文件时，需要限制并发数以避免耗尽内存和文件描述符：

```typescript
async function processFilesWithLimit(
  files: string[],
  processor: (path: string) => Promise<void>,
  limit = 10
) {
  const running = new Set<Promise<void>>();
  
  for (const file of files) {
    // 等待直到有空闲槽位
    while (running.size >= limit) {
      await Promise.race(running);
    }
    
    const promise = processor(file).finally(() => running.delete(promise));
    running.add(promise);
  }
  
  // 等待所有任务完成
  await Promise.all(running);
}

// 使用示例
const logFiles = ['/var/log/app1.log', '/var/log/app2.log', /* ... */];
await processFilesWithLimit(logFiles, async (path) => {
  const stream = Bun.file(path).stream();
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}, 5); // 最多同时处理 5 个文件
```

### 4.3 写入性能不达标：批量优化

在某些场景下，你可能发现 `Bun.write()` 的写入性能不如预期。常见原因和对策如下：

**原因一：频繁的小文件写入**

每次 `Bun.write()` 调用都涉及文件打开、写入、关闭（或重命名）的完整流程。如果频繁写入小文件，这些固定开销会显著影响性能。

```typescript
// 低效：每次写入一个条目
for (const item of items) {
  await Bun.write(`/data/items/${item.id}.json`, JSON.stringify(item));
}

// 优化：批量合并写入
const batches = chunk(items, 100); // 每 100 个一批
for (const batch of batches) {
  const promises = batch.map(item =>
    Bun.write(`/data/items/${item.id}.json`, JSON.stringify(item))
  );
  await Promise.all(promises); // 并发写入
}
```

**原因二：日志追加场景**

对于日志文件的频繁追加写入，每次都创建新文件并重命名的成本很高。

```typescript
// 低效：每次追加都使用 Bun.write
await Bun.write('/app.log', 'line 1\n');
await Bun.write('/app.log', 'line 2\n'); // 覆盖了 line 1！

// 正确：使用文件写入流（Bun 0.5+）
const writer = Bun.file('/app.log').writer();
await writer.write('line 1\n');
await writer.write('line 2\n');
await writer.end();
```

**原因三：未利用并发**

`Bun.write()` 支持并发写入不同文件，利用异步 I/O 提高吞吐量：

```typescript
// 串行写入：慢
for (const file of files) {
  await Bun.write(file.path, file.data);
}

// 并发写入：快（但需注意 FD 数量限制）
await Promise.all(files.map(f => Bun.write(f.path, f.data)));
```

**原因四：频繁 fsync**

Bun.write 在原子写入模式下会调用 fsync 确保数据落盘。fsync 是一个昂贵的操作，因为它需要等待磁盘完成写入。对于非关键数据，可以考虑不要求强原子性的写入方式：

```typescript
// 如果需要极致的写入性能，可以绕过原子性保证
// 注意：这会牺牲崩溃安全性
const fd = Bun.open(path, 'w'); // 直接打开文件
await fd.write(data);
await fd.close();
```

### 4.4 文件描述符耗尽：清理策略

高并发文件服务器在处理大量请求时，可能遇到 "EMFILE: too many open files" 错误。这表示进程的文件描述符数量已经达到系统上限。

**诊断方法：**

```bash
# Linux: 查看当前进程的 FD 数量
ls /proc/<pid>/fd | wc -l

# 查看系统限制
ulimit -n

# 查看系统级限制
cat /proc/sys/fs/file-max
```

**解决方案：**

1. **提高系统限制**：
   ```bash
   # 临时调整
   ulimit -n 65536
   
   # 永久调整（/etc/security/limits.conf）
   * soft nofile 65536
   * hard nofile 65536
   ```

2. **确保及时释放**：Bun 的 I/O 操作完成后会自动关闭文件描述符，但如果你持有 `BunFile` 对象的引用并频繁触发 I/O 操作，注意在不再需要时释放引用。

3. **使用连接池**：对于需要大量文件操作的场景，考虑使用连接池或限制并发数：
   ```typescript
   // 限制并发 FD 数量
   const MAX_CONCURRENT = 100;
   const queue = [];
   
   async function readFileWithLimit(path: string) {
     if (queue.length >= MAX_CONCURRENT) {
       await Promise.race(queue);
     }
     const promise = Bun.file(path).text().finally(() => {
       const idx = queue.indexOf(promise);
       if (idx >= 0) queue.splice(idx, 1);
     });
     queue.push(promise);
     return promise;
   }
   ```

### 4.5 权限错误处理

文件权限错误（EACCES）是生产环境中常见的故障。当进程没有足够的权限读取或写入文件时，Bun 会抛出包含 `code: 'EACCES'` 的错误。

```typescript
async function safeReadFile(path: string) {
  try {
    return await Bun.file(path).text();
  } catch (e: any) {
    switch (e.code) {
      case 'ENOENT':
        console.log('File not found, returning default');
        return '';
      case 'EACCES':
        console.error('Permission denied, check file permissions');
        throw new Error(`Cannot access ${path}: permission denied`);
      case 'EISDIR':
        console.error(`${path} is a directory, not a file`);
        throw new Error(`Cannot read ${path}: is a directory`);
      default:
        console.error(`Unexpected error reading ${path}:`, e);
        throw e;
    }
  }
}
```

### 4.6 文件编码问题

Bun 的 `.text()` 方法默认使用 UTF-8 编码解码文件内容。对于非 UTF-8 编码的文件（如 GBK、Shift-JIS、Latin-1 等），需要使用 `TextDecoder` 显式指定编码：

```typescript
// 读取 GBK 编码的文件
const buffer = await Bun.file('/data/gbk-file.txt').arrayBuffer();
const decoder = new TextDecoder('gbk');
const content = decoder.decode(buffer);
console.log(content);

// 读取 UTF-16 编码的文件
const utf16Buffer = await Bun.file('/data/utf16-file.txt').arrayBuffer();
const utf16Decoder = new TextDecoder('utf-16le');
const utf16Content = utf16Decoder.decode(utf16Buffer);
console.log(utf16Content);
```

需要注意的是，`TextDecoder` 的编码名称需要与文件的实际编码匹配。常见的编码名称包括：`utf-8`、`utf-16le`、`utf-16be`、`gbk`、`gb2312`、`shift-jis`、`euc-kr`、`iso-8859-1` 等。

---

## 五、必备知识与技能

### 5.1 文件 I/O 模型

要深入理解 Bun 的 I/O 设计，首先需要了解操作系统的四种文件 I/O 模型。

**阻塞 I/O (Blocking I/O)**

最传统的 I/O 模型。当进程发起 read() 系统调用时，进程被阻塞直到数据准备好：

```
进程                   内核
  │                     │
  ├─ read() ──────────→ │
  │                     ├─ 等待数据（阻塞）
  │    （进程挂起）       │
  │                     ├─ 数据就绪
  │ ←─── 返回数据 ──── │
  │    （继续执行）       │
```

优点：编程模型简单直观。缺点：阻塞期间 CPU 资源浪费。

**非阻塞 I/O (Non-blocking I/O)**

进程发起 read() 后立即返回，如果没有数据则返回 EAGAIN 错误：

```
进程                   内核
  │                     │
  ├─ read() ──────────→ │
  │ ←── EAGAIN ─────── │  （无数据，立即返回）
  │    （继续执行）       │
  │                     │
  ├─ read() ──────────→ │
  │ ←── EAGAIN ─────── │  （仍无数据）
  │                     │
  ├─ read() ──────────→ │
  │ ←── 返回数据 ──── │  （数据就绪）
```

优点：进程不阻塞。缺点：需要轮询，浪费 CPU。

**I/O 多路复用 (I/O Multiplexing)**

使用 select/poll/epoll/kqueue 同时监控多个文件描述符：

```
进程                   内核
  │                     │
  ├─ epoll_wait() ────→ │
  │                     ├─ 监控多个 FD
  │    （挂起直到事件）    │
  │ ←── FD 就绪 ────── │
  │                     │
  ├─ read() ──────────→ │
  │ ←── 返回数据 ──── │
```

优点：单线程管理数千个连接。缺点：每次事件循环需要系统调用。

**异步 I/O (Asynchronous I/O)**

进程发起 I/O 操作后立即返回，内核在操作完成后通知进程（Bun 使用 io_uring 实现）：

```
进程                   内核
  │                     │
  ├─ io_uring_submit()─→│  （提交 I/O 请求）
  │    （立即返回）       ├─ 后台执行 I/O
  │    （继续其他工作）    │
  │                     ├─ I/O 完成
  ├─ io_uring_get()  ←──│  （收割完成事件）
  │                     │
```

优点：真正的异步，无阻塞，系统调用开销最小化。缺点：实现复杂。

Bun 在 Linux 上使用 io_uring（内核 5.1+），在 macOS 上使用 kqueue，在 Windows 上使用 IOCP。每种平台都使用最高效的异步 I/O 机制。

这四种模型在实际系统中有不同的适用场景。阻塞 I/O 适合简单脚本和低并发应用；非阻塞 I/O 很少单独使用，通常与多路复用结合；I/O 多路复用是大多数网络服务器的核心模式（Node.js、Nginx、Redis 都采用此模式）；异步 I/O 是最新的发展趋势，代表了高性能 I/O 的未来方向。

### 5.2 零拷贝技术基础

零拷贝（Zero-Copy）是一组技术，旨在消除数据传输过程中不必要的 CPU 数据拷贝操作。除了前面讨论的 sendfile，还有其他几种零拷贝技术：

**DMA (Direct Memory Access)**

DMA 允许硬件设备（磁盘控制器、网卡）直接读写内存，无需 CPU 干预。这是所有零拷贝技术的基础设施。

DMA 的工作流程如下：

1. CPU 告诉 DMA 控制器：从磁盘读取数据到内存地址 X，传输 N 字节。
2. DMA 控制器执行数据传输，不占用 CPU。
3. 传输完成后，DMA 控制器发送中断通知 CPU。
4. CPU 处理中断，继续后续工作。

**MMAP + Write**

使用 mmap 将文件映射到内存，然后使用 write() 将映射区域写入 Socket。相比传统 read/write，减少了一次用户空间拷贝：

```
传统：磁盘 → 内核缓冲区 → 用户缓冲区 → 内核 Socket 缓冲区 → 网卡
         ↑ DMA      ↑ CPU       ↑ CPU        ↑ DMA
         (2次 DMA + 2次 CPU 拷贝)

MMAP+Write：磁盘 → 内核缓冲区 → 内核 Socket 缓冲区 → 网卡
              ↑ DMA      ↑ CPU        ↑ DMA
         (2次 DMA + 1次 CPU 拷贝)
```

**Splice**

splice 系统调用可以在两个文件描述符之间移动数据，无需用户空间参与：

```
splice：磁盘 → 内核缓冲区 → 内核 Socket 缓冲区 → 网卡
          ↑ DMA      ↑ CPU (管道)  ↑ DMA
         (2次 DMA + 0次 CPU 拷贝，但需要管道作为中介)
```

splice 与 sendfile 的区别在于，splice 可以连接任意两个文件描述符，而 sendfile 专门用于文件到 Socket 的传输。

**对比总结：**

| 技术 | CPU 拷贝次数 | DMA 次数 | 适用场景 |
|------|-------------|---------|---------|
| 传统 read + write | 2 | 2 | 通用 |
| mmap + write | 1 | 2 | 文件读写 |
| sendfile | 0 | 2 | 文件到 Socket |
| splice | 0 | 2 | 任意 FD 到 FD |
| io_uring | 0-1 | 2 | 通用异步 I/O |

### 5.3 操作系统 Page Cache

页面缓存（Page Cache）是操作系统内核管理磁盘数据缓存的核心机制。理解 Page Cache 对于优化文件 I/O 性能至关重要。

**工作原理：**

当进程读取文件时，内核首先检查数据是否已经在 Page Cache 中：

```
进程发起 read("/data/file.txt")

          ┌──────────────┐
          │ 数据在 Page   │
          │ Cache 中？    │
          └──────┬───────┘
                 │
          ┌──────┴───────┐
          │ 是            │ 否
          ▼               ▼
  ┌──────────────┐  ┌──────────────┐
  │ 直接从缓存     │  │ 从磁盘读取到   │
  │ 拷贝到用户空间  │  │ Page Cache    │
  └──────────────┘  │ 再拷贝到用户   │
                    │ 空间           │
                    └──────────────┘
```

**Page Cache 对 Bun 的影响：**

1. **预热效应**：首次读取文件时，数据从磁盘加载到 Page Cache，后续读取直接从缓存进行，速度提升数个数量级。
2. **sendfile 依赖 Page Cache**：sendfile 直接从 Page Cache 发送数据到 Socket，如果数据不在 Page Cache 中，内核会先将其加载到 Page Cache。
3. **内存压力**：Page Cache 使用系统内存，大量文件访问可能导致 Page Cache 占用过多内存，触发内存回收。
4. **缓存淘汰**：内核使用 LRU（最近最少使用）算法管理 Page Cache，长时间未访问的文件数据会被淘汰。

**监控 Page Cache：**

```bash
# Linux: 查看 Page Cache 使用情况
cat /proc/meminfo | grep -E "^(Cached|Dirty|Writeback)"

# 查看文件在 Page Cache 中的状态
fincore /path/to/file

# 清除 Page Cache（仅用于测试）
echo 3 > /proc/sys/vm/drop_caches
```

**最佳实践：**

- 对于频繁访问的文件，Page Cache 会自然保持热数据，无需额外优化。
- 对于一次性访问的大文件，考虑使用 `O_DIRECT` 标志绕过 Page Cache（Bun 不默认使用）。
- 监控 Page Cache 使用量，确保系统有足够的内存用于应用本身。

### 5.4 文件描述符管理

文件描述符（FD）是操作系统分配给每个打开文件的整数标识符。在 Unix 系统中，一切皆文件——普通文件、Socket、管道、设备等都是通过文件描述符访问的。

**FD 的生命周期：**

```
open() → 使用（read/write/sendfile） → close()
  │                                       │
  ├─ 返回 FD 编号（3, 4, 5, ...）          ├─ 释放 FD 编号
  ├─ 创建文件表项                           ├─ 减少引用计数
  └─ 增加引用计数                           └─ 如果计数为 0，释放 inode
```

**FD 的限制：**

- **进程级限制**：`ulimit -n`，每个进程能打开的最大 FD 数。
- **系统级限制**：`/proc/sys/fs/file-max`，整个系统能打开的最大 FD 数。
- **默认值**：通常为 1024（进程级），可通过配置文件提高。

**FD 与 Bun 的关系：**

| Bun API | FD 使用 |
|---------|--------|
| `Bun.file(path)` | 不占用 FD（惰性求值） |
| `BunFile.text()` | 临时占用 FD，读取后关闭 |
| `BunFile.stream()` | 流式读取期间持续占用 FD |
| `BunFile.writer()` | 写入期间持续占用 FD |
| `Bun.serve()` | 每个连接占用一个 Socket FD |

**FD 泄漏诊断：**

```bash
# Linux: 查看进程打开的 FD
ls -la /proc/<pid>/fd/

# 统计 FD 数量
ls /proc/<pid>/fd/ | wc -l

# 查看哪些 FD 连接到文件
lsof -p <pid>
```

### 5.5 文件系统差异

不同的文件系统对 I/O 性能有显著影响。了解这些差异有助于优化 Bun 应用的文件 I/O 性能。

**Linux 常见文件系统：**

| 文件系统 | 特点 | 适用场景 |
|---------|------|---------|
| ext4 | 最常用，成熟稳定 | 通用场景 |
| XFS | 大文件性能优秀 | 大文件存储、视频处理 |
| Btrfs | 支持快照、压缩 | 需要高级文件系统功能 |
| ZFS | 数据完整性强 | 关键数据存储 |
| NFS | 网络文件系统 | 分布式共享存储 |

**文件系统特性对 Bun 的影响：**

1. **ext4**：对于大多数场景来说表现良好。ext4 的延迟分配（delayed allocation）特性可以提高写入性能，但在断电时可能增加数据丢失风险。
2. **XFS**：在处理大文件（> 10GB）时性能优于 ext4，特别适合视频监控、日志收集等大文件写入密集场景。
3. **Btrfs**：支持透明压缩（zlib/lzo/zstd），可以降低磁盘 I/O 量但增加 CPU 负载。如果 CPU 资源充裕而磁盘 I/O 是瓶颈，Btrfs 压缩可以提升整体性能。
4. **NFS**：sendfile 在 NFS 上可能退化为普通 read/write，零拷贝优势消失。在 NFS 上部署 Bun 文件服务器时需要进行性能测试。

---

## 六、示例代码与配置

### 6.1 docker-compose.yml 配置说明

**文件位置**：`docker-compose.yml`

这个 Docker Compose 配置文件定义了运行本章示例代码的环境。使用 `oven/bun:latest` 镜像，将本地的 `examples` 目录挂载到容器的 `/app/examples` 目录。

配置要点：

- **image: oven/bun:latest**：使用 Bun 官方 Docker 镜像，确保环境一致性。
- **working_dir: /app**：设置容器的工作目录。
- **volumes**：将本地示例代码挂载到容器中，使得在宿主机修改代码后无需重新构建镜像。
- **entrypoint 和 command**：使用 `/bin/sh -c` 作为入口，通过 shell 依次执行三个示例脚本。`timeout 5` 限制服务器示例的运行时间，避免进程挂起。`|| true` 确保即使服务器示例超时也不会导致整个管道失败。

### 6.2 file-basics.ts 逐行解读

**文件位置**：`examples/01-basic/file-basics.ts`

这个示例文件展示了 Bun 文件 I/O 最基础的操作：创建文件引用、写入、读取和流式读取。

**代码结构分析：**

```typescript
// 第 1 行：从 "bun" 模块导入 write 函数
import { write } from "bun";
```

虽然 `Bun.write()` 可以直接通过全局 `Bun` 对象调用，但也可以显式导入 `write` 函数。两种方式等价，显式导入在 TypeScript 中提供更好的类型检查。

```typescript
// 第 3-4 行：创建惰性文件引用
const file = Bun.file("/tmp/hello.txt");
console.log("Bun.file created (lazy — no disk access yet)");
```

关键点：此时没有任何系统调用发生。`Bun.file()` 仅仅创建了一个 JavaScript 对象，内部存储了路径字符串 `/tmp/hello.txt`。文件是否存在、大小如何，都还是未知数。

```typescript
// 第 5-6 行：访问文件元数据
console.log("File exists?", file.exists()); // true/false
console.log("File size:", file.size);       // 0 before write
```

`file.exists()` 和 `file.size` 的行为值得注意：`exists()` 返回一个 Promise，因为需要实际调用 `stat()` 系统调用检查文件是否存在。`size` 属性在 BunFile 创建时是 `0`（因为还没有获取文件信息），在写入后再次访问时会反映真实大小。

```typescript
// 第 8-9 行：写入文件
await Bun.write("/tmp/hello.txt", "Hello, Bun I/O!");
console.log("Written: 'Hello, Bun I/O!'");
```

`Bun.write()` 的第一个参数可以是文件路径字符串或 BunFile 对象。第二个参数可以是字符串、ArrayBuffer、Blob、Response 或 ReadableStream。这里使用字符串，Bun 内部会将其编码为 UTF-8 字节序列写入文件。

写入过程涉及：创建临时文件 → 写入数据 → fsync 刷盘 → 原子重命名。

```typescript
// 第 11-12 行：读取文件内容
const content = await Bun.file("/tmp/hello.txt").text();
console.log("Read back:", content);
```

这里创建了一个新的 BunFile 实例并立即调用 `.text()`。虽然我们在前面已经创建了一个指向同一路径的 BunFile，但每个 BunFile 实例是独立的。`.text()` 触发实际读取：打开文件 → mmap 映射 → 将映射区域解码为 UTF-8 字符串 → 关闭文件。

```typescript
// 第 14-17 行：流式读取
const stream = Bun.file("/tmp/hello.txt").stream();
const reader = stream.getReader();
const { value } = await reader.read();
console.log("Stream read:", new TextDecoder().decode(value));
```

`.stream()` 返回一个 `ReadableStream<Uint8Array>`。通过 `getReader()` 获取读取器，每次 `read()` 返回一个包含 `{ done, value }` 的对象。对于小文件，一次 `read()` 可能就读取了全部内容；对于大文件，需要循环调用直到 `done` 为 `true`。

**学习要点总结：**
- Bun.file 是惰性的，创建时不触发 I/O
- 元数据访问（exists, size）触发 stat 系统调用
- Bun.write 使用原子写入策略
- .text() 一次性读取全部内容（适合小文件）
- .stream() 支持流式读取（适合大文件）

### 6.3 file-server.ts 逐行解读

**文件位置**：`examples/02-advanced/file-server.ts`

这个示例展示了如何用 Bun.serve + Bun.file 构建一个零拷贝文件服务器。

**代码结构分析：**

```typescript
// 第 1-12 行：创建 HTTP 服务器
Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const filePath = url.pathname === "/" ? "/tmp/sample.txt" : "." + url.pathname;
    
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return new Response("Not Found", { status: 404 });
    
    // Bun.file() 自动设置 Content-Type 和 Content-Length
    return new Response(file);
  },
});
```

这是最简洁的零拷贝文件服务器实现。核心在 `return new Response(file)` 这一行——Bun 检测到 `Response` 的 body 是一个 `BunFile` 对象时，不会将文件内容读入内存，而是调用 sendfile 系统调用，将文件直接从内核页面缓存发送到 TCP Socket。

`Bun.serve()` 的 `fetch` 处理器接收标准的 `Request` 对象，返回 `Response` 对象。与 Web Workers 中的 `fetch` 事件处理接口完全一致。

```typescript
// 第 14-17 行：创建示例文件并自测
await Bun.write("/tmp/sample.txt", "Hello from Bun file server!\n");
const res = await fetch("http://localhost:3000/");
console.log(await res.text());
process.exit(0);
```

这个示例在启动服务器后，立即创建一个示例文件，然后通过 `fetch` 自测。`process.exit(0)` 确保脚本在测试完成后退出，因为 Bun.serve 默认会保持进程运行。

**与 Node.js 实现对比：**

| 方面 | Node.js | Bun |
|------|---------|-----|
| 代码行数 | ~20 行（含错误处理） | ~12 行 |
| 数据拷贝 | 2 次（用户空间 ↔ 内核空间） | 0 次（sendfile） |
| Content-Type | 需要手动设置或使用 mime 库 | 自动根据扩展名设置 |
| Content-Length | 需要手动计算或使用 stat | 自动设置 |
| 错误处理 | 需要手动处理 ENOENT 等错误 | file.exists() 或 try-catch |

```typescript
// Node.js 等效实现
import http from 'http';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

http.createServer((req, res) => {
  const filePath = req.url === '/' ? '/tmp/sample.txt' : '.' + req.url;
  fs.stat(filePath, (err, stats) => {
    if (err) { res.statusCode = 404; res.end('Not Found'); return; }
    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => { res.statusCode = 500; res.end(); });
  });
}).listen(3000);
```

Node.js 版本需要手动处理：内容类型检测、内容长度设置、流错误处理等。Bun 版本将这些细节全部自动化，同时通过零拷贝获得了更好的性能。

### 6.4 static-server.ts 逐行解读

**文件位置**：`examples/03-production/static-server.ts`

这个示例在 file-server.ts 的基础上增加了缓存控制、ETag 和条件请求等生产环境必备的特性。

**代码结构分析：**

```typescript
// 第 1-6 行：常量和示例文件创建
const PORT = 3000;
const PUBLIC_DIR = "/tmp/public";

// 创建一些示例文件
await Bun.write(`${PUBLIC_DIR}/index.html`, "<h1>Bun Static Server</h1>");
await Bun.write(`${PUBLIC_DIR}/data.json`, JSON.stringify({ message: "Hello" }));
```

使用模板字符串拼接路径。注意：在生产环境中，应使用 `path.join()` 或 `path.resolve()` 防止路径遍历攻击。

```typescript
// 第 12-13 行：路径解析
let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
const file = Bun.file(PUBLIC_DIR + filePath);
```

自动将根路径 `/` 映射到 `index.html`，这是静态文件服务器的常见约定。

```typescript
// 第 14-15 行：文件存在性检查
if (!(await file.exists())) return new Response("Not Found", { status: 404 });
```

`file.exists()` 返回一个 Promise，使用 `await` 等待结果。如果文件不存在，返回 404 响应。

```typescript
// 第 17-19 行：ETag 缓存
const etag = `${file.size}-${file.lastModified}`;
if (req.headers.get("If-None-Match") === etag) return new Response(null, { status: 304 });
```

ETag 是 HTTP 缓存验证的核心机制。这里使用文件大小和最后修改时间的组合作为 ETag 值。当客户端发送 `If-None-Match` 头且值与当前 ETag 匹配时，返回 304 Not Modified 响应，表示客户端缓存仍然有效，无需传输文件内容。

```typescript
// 第 20-27 行：返回文件响应
return new Response(file, {
  headers: {
    "ETag": etag,
    "Cache-Control": "public, max-age=3600",
  },
});
```

`Cache-Control` 头设置缓存策略：`public` 表示响应可以被任何缓存（包括 CDN 和浏览器）缓存，`max-age=3600` 表示缓存有效期为 3600 秒（1 小时）。客户端在 1 小时内再次请求同一资源时，不会向服务器发送请求，直接使用本地缓存。

**增强建议：**

这个基本实现可以进一步优化：

1. **Content-Type 手动指定**：虽然 Bun 会自动设置 Content-Type，但在某些场景下你可能需要手动覆盖：
   ```typescript
   const headers = new Headers();
   headers.set("Content-Type", "application/json; charset=utf-8");
   headers.set("ETag", etag);
   return new Response(file, { headers });
   ```

2. **压缩支持**：对于文本类文件（HTML、CSS、JS），添加 gzip/brotli 压缩可以大幅减少传输体积：
   ```typescript
   // 注意：这需要在用户空间压缩，会失去零拷贝优势
   const content = await file.text();
   const compressed = Bun.gzipSync(content);
   return new Response(compressed, {
     headers: { "Content-Encoding": "gzip", "Content-Type": "text/html" },
   });
   ```

3. **范围请求（Range Requests）**：支持视频/音频的断点续传：
   ```typescript
   const range = req.headers.get("Range");
   if (range) {
     const parts = range.replace(/bytes=/, "").split("-");
     const start = parseInt(parts[0], 10);
     const end = parts[1] ? parseInt(parts[1], 10) : file.size - 1;
     const sliced = file.slice(start, end + 1);
     return new Response(sliced, {
       status: 206,
       headers: {
         "Content-Range": `bytes ${start}-${end}/${file.size}`,
         "Content-Length": String(end - start + 1),
       },
     });
   }
   ```

**学习要点总结：**
- Bun.file 可以直接作为 Response body，自动零拷贝传输
- file.exists() 用于文件存在性检查
- file.size 和 file.lastModified 用于缓存验证
- 结合 HTTP 缓存头（ETag、Cache-Control）构建生产级静态服务器
- 可扩展支持范围请求、压缩等高级特性

---

## 总结与最佳实践

本章全面深入地探讨了 Bun 文件 I/O 系统，从 `Bun.file()` 的惰性求值设计，到 sendfile 零拷贝机制，再到 mmap 和 io_uring 的异步 I/O 实现，揭示了 Bun 在性能上超越 Node.js 的根本原因。

Bun 的文件 I/O 设计哲学可以概括为三点：惰性求值减少不必要的系统调用、零拷贝消除数据搬移开销、Web 标准兼容降低学习成本。这三者共同构成了 Bun 文件 I/O 的核心竞争力。

以下是 Bun 文件 I/O 的最佳实践总结：

**选择正确的 API：**

| 场景 | 推荐 API | 原因 |
|------|---------|------|
| 读取小文件 (< 10MB) | `Bun.file(path).text()` 或 `.json()` | 简洁高效 |
| 读取大文件 | `Bun.file(path).stream()` | 避免 OOM |
| 写入小数据 | `Bun.write(path, data)` | 原子性保证 |
| 频繁追加写入 | `Bun.file(path).writer()` | 避免重命名开销 |
| 文件服务器 | `new Response(Bun.file(path))` | 零拷贝 sendfile |
| 配置文件读取 | `Bun.file(path).json()` | 直接解析为对象 |

**性能优化清单：**
1. 优先使用 `new Response(file)` 而非手动读取后再返回
2. 大文件始终使用流式 API，避免 `.text()` 或 `.json()`
3. 利用并发写入（Promise.all）提高批量写入性能
4. 使用 ETag 和 Cache-Control 减少不必要的文件传输
5. 监控文件描述符使用量，必要时提高系统限制
6. 使用 `file.size` 预检查文件大小，动态选择读取策略

**错误处理原则：**
1. 文件不存在使用 `file.exists()` 预检查或 try-catch 处理
2. 使用 try-finally 确保 I/O 资源释放
3. 区分 ENOENT（文件不存在）、EACCES（权限不足）、EISDIR（是目录而非文件）等不同错误码
4. 对于非关键数据，使用 `.catch(() => defaultValue)` 提供默认值

**架构决策建议：**

在决定是否使用 Bun 构建文件密集型应用时，可以参考以下决策树：

- 如果应用是静态文件服务器 → 使用 Bun.serve + Bun.file，零拷贝优势显著
- 如果应用需要大量小文件读写 → 使用 Bun.write 的 Promise.all 并发策略
- 如果应用涉及大文件处理 → 始终使用 stream API，避免内存压力
- 如果应用需要跨平台部署 → 注意路径处理和 sendfile 的平台差异
- 如果应用需要强一致性保证 → 使用 Bun.write 的原子写入或引入数据库

Bun 的文件 I/O 系统代表了 JavaScript 运行时在 I/O 性能方面的最新水平。通过深度融合现代操作系统特性（sendfile、mmap、io_uring），Bun 在保持 API 简洁性的同时，实现了接近原生应用的 I/O 性能。无论你是在构建高性能静态文件服务器、处理大规模日志数据，还是开发需要密集文件操作的 CLI 工具，Bun 都能提供卓越的开发体验和运行时性能。

在下一章中，我们将探讨 Bun 的进程管理和子进程能力——`Bun.spawn`、`Bun.spawnSync` 和 Shell 集成，了解 Bun 如何成为 Node.js `child_process` 模块的现代化替代方案。
