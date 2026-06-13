# 附录C Node.js 启动参数调优 Checklist

## C.1 概述

Node.js 提供了大量启动参数来控制运行时行为、内存管理和调试功能。合理的参数配置可以显著提升生产环境的稳定性和可观测性。本附录整理了一份生产环境推荐参数清单，并为每个参数提供作用说明和建议值。

## C.2 生产环境完整启动命令

```bash
# 生产环境推荐启动参数
node \
  --max-old-space-size=2048 \
  --expose-gc \
  --trace-warnings \
  --pending-deprecation \
  --async-stack-traces \
  --enable-source-maps \
  --experimental-network-imports \
  src/index.js
```

## C.3 参数详解

| 参数 | 作用 | 建议值 | 适用环境 |
|:--|:--|:--|:--|
| `--max-old-space-size` | 老生代最大内存（MB） | 1.5x 实际使用量 | 生产 / 预发布 |
| `--expose-gc` | 暴露 `global.gc()` 供手动调用 | - | 调试 / 特殊场景 |
| `--trace-warnings` | 输出详细警告堆栈 | - | 生产 / 调试 |
| `--pending-deprecation` | 即将弃用的 API 警告 | - | 迁移评估 |
| `--async-stack-traces` | 异步操作保留完整堆栈 | - | 调试 |
| `--enable-source-maps` | 加载 Source Map 显示原始源码位置 | - | 生产（使用 TypeScript 时） |
| `--experimental-network-imports` | 支持从 URL 导入 ESM 模块 | - | 实验性场景 |

### --max-old-space-size

V8 的内存分为新生代（Young Generation）和老生代（Old Generation）。应用的主要内存消耗集中在老生代。

```bash
# 查看当前内存使用情况
node -e "console.log(process.memoryUsage())"
# 输出：{ rss: 30MB, heapTotal: 20MB, heapUsed: 15MB, external: 1MB, arrayBuffers: 0.5MB }

# 设置老生代内存上限为 2GB
node --max-old-space-size=2048 app.js
```

**调优建议**：
- 在预发布环境运行压测，观察 `process.memoryUsage().heapUsed` 的峰值
- 设为峰值使用量的 1.5 倍，留有余量
- 不要超过服务器物理内存的 70%（为操作系统和其他进程留空间）
- Docker 容器中注意容器内存限制，`--max-old-space-size` 应小于容器内存上限

```bash
# Docker 容器内存上限 512MB → 设置 --max-old-space-size=384
docker run -m 512m node:20 node --max-old-space-size=384 app.js
```

### --expose-gc

暴露 V8 的垃圾回收器给 JavaScript 环境，允许手动触发 GC。

```javascript
// 启用 --expose-gc 后可以使用 global.gc()
if (global.gc) {
  // 在已知的大对象释放后手动触发 GC
  delete cache[key];
  global.gc();
  console.log('GC 手动触发');
}
```

**注意**：生产环境不应依赖手动 GC。`--expose-gc` 主要用于内存泄漏诊断。

### --trace-gc

输出详细的 GC 日志，用于分析垃圾回收行为：

```bash
# 启动时输出 GC 日志
node --trace-gc app.js 2>&1 | grep "Mark-sweep"

# 输出示例：
# [15678:0x104800000]   112345 ms: Mark-sweep 456.2 (512.3) -> 389.1 (456.2) MB, 45.2 / 0.0 ms
# 解读：在 112345ms 时触发了 Mark-Sweep GC
#       堆从 456.2MB 降至 389.1MB，耗时 45.2ms
```

### --enable-source-maps

TypeScript 或编译后的 JavaScript 项目中，Source Map 可以还原原始源码位置：

```bash
# 未启用时，错误堆栈显示编译后的行号
# 文件：dist/index.js:123:45

# 启用后（需要 .js.map 文件存在）
node --enable-source-maps dist/index.js
# Error: Something went wrong
#     at handler (src/index.ts:45:12) ← 显示原始 TS 位置
```

### --async-stack-traces

异步操作（Promise、async/await）使得错误堆栈追踪变得困难。此参数保留异步调用链：

```javascript
// 启用 --async-stack-traces 后
async function a() {
  await b();
}

async function b() {
  throw new Error('async error');
}

a().catch(console.error);

// 未启用时：
// Error: async error
//     at b (app.js:6:9)

// 启用后：
// Error: async error
//     at b (app.js:6:9)
//     at async a (app.js:2:9)  ← 保留了异步调用链
//     at async main (app.js:14:1)
```

## C.4 性能分析参数

| 参数 | 作用 | 使用场景 |
|:--|:--|:--|
| `--heap-prof` | 生成堆内存 Profiling | 分析内存泄漏 |
| `--cpu-prof` | CPU Profiling | 分析 CPU 热点 |
| `--prof` | V8 Profiling 日志 | 性能调优 |

```bash
# 生成堆内存分析文件
node --heap-prof --heap-prof-dir ./profiles app.js
# 输出：./profiles/Heap.20250101.120000.heapprofile

# Chrome DevTools 中加载 .heapprofile 文件分析
```

```bash
# CPU Profiling
node --cpu-prof --cpu-prof-dir ./profiles app.js
# 输出：./profiles/CPU.20250101.120000.cpuprofile

# 生成可读的 tick log
node --prof app.js
node --prof-process isolate-*.log > processed.txt
```

## C.5 调试参数

| 参数 | 作用 | 示例 |
|:--|:--|:--|
| `--inspect` | 启动调试监听（默认 9229） | `node --inspect app.js` |
| `--inspect-brk` | 启动调试并在首行断点 | `node --inspect-brk app.js` |
| `--inspect-publish-uid` | 调试器访问控制 | `--inspect-publish-uid=http` |

```bash
# Chrome DevTools 调试
node --inspect-brk app.js
# 在 Chrome 中打开 chrome://inspect
# 点击 "Remote Target" 下的应用

# 允许外部访问调试端口（Docker 中需要）
node --inspect=0.0.0.0:9229 app.js
```

## C.6 安全检查参数

```bash
# 禁用不安全的原生模块加载
node --no-addons app.js

# 禁用 eval 和动态代码生成（安全沙箱）
node --disallow-code-generation-from-strings app.js

# 启用实验性权限控制（实验性）
node --experimental-policy=policy.json app.js
```

```jsonc
// policy.json 示例：限制文件系统访问
{
  "resources": {
    "app.js": {
      "integrity": "sha256-xxx"
    }
  },
  "dependencies": true
}
```

## C.7 环境变量

除了命令行参数，以下环境变量也影响 Node.js 行为：

```bash
# 设置 OpenSSL 配置文件
export OPENSSL_CONF=/path/to/openssl.cnf

# V8 引擎参数（通过 NODE_OPTIONS 传递）
export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"

# 设置 TLS 密码套件
export TLS_CIPHER_SUITES="TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256"

# 设置堆栈大小（单位：KB）
export NODE_STACK_SIZE=2048
```

## C.8 Docker 环境启动脚本

```dockerfile
# Dockerfile 中的 Node.js 优化
FROM node:20-alpine

WORKDIR /app

# 设置 NODE_OPTIONS 环境变量（Docker 推荐方式）
ENV NODE_OPTIONS="\
  --max-old-space-size=384 \
  --expose-gc \
  --enable-source-maps \
  --async-stack-traces \
  --trace-warnings \
"

# 注意：Docker 容器内存限制 512MB
# --max-old-space-size 设为 384MB（75%）
# 剩余内存用于新生代 + 非堆内存

COPY . .
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
    environment:
      - NODE_OPTIONS=--max-old-space-size=384 --expose-gc
```

---

## 附录小结

合理的 Node.js 启动参数配置是生产环境稳定性保障的重要一环。核心要点包括：根据实际内存使用量设置 `--max-old-space-size`、使用 `--enable-source-maps` 提升故障排查效率、开启 `--async-stack-traces` 获取完整的异步调用链。在生产环境部署前，建议在预发布环境充分验证参数配置是否合理。