# Ch08: Jest 核心机制与异步测试

## 8.1 使用场景

### 单元测试对 Node.js 后端意味着什么

在 Node.js 后端开发中，单元测试不是"可选项"，而是保障服务质量的基础设施。与前端测试不同，后端测试直接面对数据一致性、接口正确性、异常处理路径——这些一旦出错，影响的是真实用户的数据和体验。

测试金字塔在 Node.js 生态中有一个典型分布：

- **单元测试（最多）**：测试单个函数、模块、中间件，不涉及 I/O 和外部依赖。运行速度快，单文件测试通常在毫秒级完成。
- **集成测试（适中）**：测试模块间协作，例如 Controller + Service + DAO 的联动，通常需要 Mock 掉数据库或外部 API。
- **E2E 测试（最少）**：测试完整的请求链路，从 HTTP 请求到数据库落盘，再到响应返回。运行慢、维护成本高，覆盖核心业务路径即可。

### 哪些代码值得写测试

不是所有代码都需要测试。投入产出比是关键考量：

| 代码类型 | 测试优先级 | 理由 |
|---------|-----------|------|
| API 路由 / 控制器 | 高 | 对外接口，错误会直接暴露给客户端 |
| 工具函数 / 工具库 | 高 | 纯函数，测试成本低，收益明确 |
| 数据库 DAO / Repository 层 | 高 | 数据持久化核心，Mock 后测试稳定 |
| 中间件 | 中 | 关注认证、日志、错误处理等横切关注点 |
| 配置加载 / 环境变量解析 | 中 | 测试配置路径覆盖 |
| UI 组件（SSR 场景） | 低 | 后端项目中优先级最低 |

### 测试金字塔在 Node.js 中的应用

一个生产级的 NestJS / Fastify 项目，测试结构通常如下：

```
project/
  src/
    modules/
      user/
        user.service.ts
        user.controller.ts
        user.service.spec.ts    # 单元测试
        user.controller.spec.ts # 集成测试
  test/
    e2e/
      user.e2e-spec.ts          # E2E 测试
```

单元测试靠近源码，E2E 测试集中在独立目录。这样的分层既保证了测试速度，也确保了关键路径的覆盖。

---

## 8.2 实现原理

### JSDOM 模拟浏览器环境

Jest 默认的 `testEnvironment: "jsdom"` 会提供一个轻量级的浏览器环境模拟。JSDOM 实现了 DOM API 的大量子集：`document`、`window`、`localStorage`、`fetch`（需额外 polyfill）等。内部机制是在 Node.js 中创建一个完整的 `Window` 对象：

```typescript
// Jest 内部大致实现
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
```

需要注意的是，JSDOM **不是**真实的浏览器，它没有渲染引擎，也不执行 CSS 布局。对于 Node.js 后端项目，通常应使用 `testEnvironment: "node"`，以避开 JSDOM 的额外开销和 API 缺失风险。

### Jest Worker 并发执行策略

Jest 通过 Worker 线程实现测试文件的并发执行。每个 Worker 独立运行一个测试文件，互不干扰。默认 Worker 池大小由以下逻辑决定：

```
poolSize = Math.max(1, os.cpus().length - 1)
```

即 CPU 核心数减一，保留一个核心给系统和其他进程。在 4 核机器上，默认 3 个 Worker 并发。可通过 `--maxWorkers` 参数调整：

```bash
jest --maxWorkers=2   # 只用 2 个 Worker
jest --maxWorkers=50% # 用 50% 的 CPU 核心
```

每个 Worker 进程是独立的 Node.js 进程，因此测试文件之间不会共享状态——这也是为什么全局变量和 Mock 不会跨文件泄漏。

### Babel / SWC 编译管道的差异

Jest 默认使用 Babel 进行 TypeScript / 现代 JS 的编译。通过 `transform` 配置：

```typescript
// jest.config.ts
export default {
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
};
```

Babel 的编译流程：TS 源码 -> Babel Parser -> AST -> Babel Transformer -> 生成 JS。这个过程包含完整的语法分析和插件管道，因此兼容性极好，但也带来了速度瓶颈。

SWC（Speedy Web Compiler）是 Rust 实现的编译器，编译速度比 Babel 快 20x 左右。对于大型项目，使用 SWC 可以显著缩短测试启动时间：

```typescript
// jest.config.ts
export default {
  transform: {
    '^.+\\.tsx?$': ['@swc/jest'],
  },
};
```

**Babel vs SWC 对比：**

| 维度 | Babel | SWC |
|-----|-------|-----|
| 编译速度 | ~200ms/文件 | ~10ms/文件 |
| 兼容性 | 极高，插件生态丰富 | 较好，但 Decorator 等语法有限制 |
| 调试友好 | Source map 完善 | Source map 偶有问题 |
| 配置复杂度 | 需 babel.config.js | 零配置或简单配置 |
| 推荐场景 | 需要复杂语法转换的项目 | 大型项目、性能敏感场景 |

### jest.config.ts 配置体系

Jest 的配置体系围绕三个核心概念：

- **preset**：预设配置集。例如 `ts-jest` 的预设内置了 TypeScript 编译配置：
  ```typescript
  export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
  };
  ```
- **transform**：定义文件如何被编译。`transform` 的 key 是正则匹配模式，value 是 transformer 名称：
  ```typescript
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest',
  },
  ```
- **testEnvironment**：运行环境。`"node"` 或 `"jsdom"`。Node.js 后端项目统一用 `"node"`。

---

## 8.3 潜在风险

### 异步测试超时

Jest 默认每个测试的超时时间是 5 秒。对于涉及真实 I/O 的集成测试，5 秒可能不够：

```typescript
// 全局超时设置
jest.setTimeout(30000); // 30 秒

// 或文件级设置
describe('Slow integration tests', () => {
  jest.setTimeout(60000);
  it('should query database', async () => {
    // ...
  });
});
```

### done() 未调用导致测试挂起

使用回调风格的异步测试时，必须确保 `done()` 被调用。如果 `done()` 从未被调用，Jest 会等待直到超时，导致测试套件挂起：

```typescript
// 错误：done 从未被调用
it('should fail silently', (done) => {
  someAsyncFunction((err, result) => {
    if (err) {
      // 忘记调用 done(err)，测试会挂起直到超时
      return;
    }
    done();
  });
});

// 正确：所有路径都调用 done
it('should work correctly', (done) => {
  someAsyncFunction((err, result) => {
    if (err) {
      done(err); // 显式传递错误
      return;
    }
    done();
  });
});
```

使用 `--detectOpenHandles` 可以检测哪些资源未关闭：

```bash
jest --detectOpenHandles
```

### JSDOM 不完全支持所有 Web API

JSDOM 是一个"足够好"但"不完全"的浏览器模拟。以下 API 在 JSDOM 中可能缺失或行为不同：

- `fetch`：默认不提供，需 `undici` 或 `node-fetch` polyfill
- `BroadcastChannel`：部分版本不支持
- `Canvas API`：不支持
- `WebSocket`：模拟有限

后端项目推荐直接使用 `testEnvironment: "node"`，避免这些坑。

### Global Setup 的副作用

`beforeAll` 和 `afterAll` 在文件级别和 `describe` 块级别使用。不当使用会造成跨测试污染：

```typescript
// 错误：全局变量污染
let dbConnection;

beforeAll(() => {
  dbConnection = createConnection(); // 所有测试共用
});

afterAll(() => {
  dbConnection.close(); // 一个测试失败可能导致连接未关闭
});
```

---

## 8.4 优化策略

### --runInBand 调试模式

`--runInBand` 强制 Jest 在单个进程中顺序执行所有测试。这在以下场景非常有用：

- **调试**：测试失败时，顺序执行更容易定位问题
- **CI 内存受限**：并发 Worker 可能消耗大量内存
- **数据库集成测试**：避免多个测试同时操作数据库导致冲突

```bash
jest --runInBand
```

### --detectOpenHandles 检测未关闭资源

此标志会在测试结束后报告进程中未关闭的资源（TCP 连接、文件句柄等），帮助定位资源泄漏：

```bash
jest --detectOpenHandles
```

常见泄漏来源：未关闭的数据库连接、未清理的定时器、未结束的 HTTP 服务器。

### --forceExit 强制退出（慎用）

`--forceExit` 在所有测试完成后强制退出 Jest 进程，即使还有未完成的异步操作。这是一个"核选项"：

```bash
jest --forceExit
```

**风险**：可能隐藏真正的资源泄漏问题。生产 CI 中应优先排查资源泄漏原因，而非简单使用 `--forceExit`。

### --shard 分片执行

Jest 28+ 支持测试分片，适用于大型项目的 CI 加速：

```bash
jest --shard=1/3   # 第一个分片，运行约 1/3 的测试
jest --shard=2/3   # 第二个分片
jest --shard=3/3   # 第三个分片
```

分片基于测试文件的哈希值分配，保证每个分片的测试数量大致相等。在 CI 中可以在不同 Job 中并行执行分片。

---

## 8.5 典型问题处理

### expect().toBe() 在 Promise 中无断言失败

最常见的 Jest 陷阱之一：在 Promise 链中编写断言但忘记 return，导致断言从未被执行：

```typescript
// 错误：测试始终通过
it('should fail silently', async () => {
  someAsyncOperation(); // 未 await，断言在 Promise 完成后才执行
  expect(true).toBe(false); // 这一行先执行，但 someAsyncOperation 的错误未被捕获
});

// 正确：return Promise
it('should work correctly', async () => {
  await someAsyncOperation();
  expect(someResult).toBe(expected);
});
```

**规则**：**始终 `return` 或 `await` 异步断言**。否则测试可能永远通过，掩盖真正的错误。

### 定时器测试

Jest 提供 `useFakeTimers` 来模拟定时器，避免等待真实时间：

```typescript
jest.useFakeTimers();

it('should debounce API calls', () => {
  const handler = jest.fn();
  const debounced = debounce(handler, 300);
  
  debounced();
  debounced();
  debounced();
  
  expect(handler).not.toHaveBeenCalled();
  jest.advanceTimersByTime(300);
  expect(handler).toHaveBeenCalledTimes(1);
});
```

常用定时器 API：

| API | 作用 |
|-----|------|
| `jest.useFakeTimers()` | 启用假定时器 |
| `jest.useRealTimers()` | 恢复真实定时器 |
| `jest.advanceTimersByTime(ms)` | 快进指定毫秒 |
| `jest.runAllTimers()` | 执行所有待处理定时器 |
| `jest.runOnlyPendingTimers()` | 执行当前排队的定时器 |

### ESM 模块的 Jest 兼容性问题

Jest 对 ESM（ECMAScript Modules）的支持不如 CJS 成熟。常见问题：

```json
// package.json
{
  "type": "module"
}
```

在 ESM 模式下使用 Jest 需要额外的配置：

```typescript
// jest.config.ts
export default {
  transform: {},
  // 或者使用 ts-jest 的 ESM 模式
  preset: 'ts-jest/presets/default-esm',
};
```

**建议**：如果项目没有强制的 ESM 需求，Node.js 后端项目仍然以 CJS 为主。Jest 对 CJS 的支持最稳定、性能最好。

---

## 8.6 开发者技能

### Jest CLI 标志速查

```bash
jest                        # 运行所有测试
jest --watch                # 监视模式，文件变更自动重跑
jest --watchAll             # 监视所有文件（无论是否有 Git 变更）
jest --coverage             # 生成覆盖率报告
jest --verbose              # 详细输出每个测试名称
jest --bail                 # 遇到第一个失败即停止
jest --onlyChanged          # 只运行变更文件的测试
jest --findRelatedTests     # 根据文件列表查找关联测试
jest --listTests            # 列出匹配的测试文件
jest --showConfig           # 显示解析后的配置
jest --clearCache           # 清除缓存
jest --json                 # JSON 格式输出
```

### jest.config.ts 模块化配置

```typescript
import type { Config } from 'jest';

const config: Config = {
  // 核心
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 文件匹配
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.spec.ts',
    '**/*.test.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  
  // 编译转换
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  
  // Mock 路径
  moduleNameMapper: {
    '@/(.*)': '<rootDir>/src/$1',
  },
  
  // 覆盖率
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
    },
  },
  
  // 全局设置
  globalSetup: '<rootDir>/test/setup.ts',
  globalTeardown: '<rootDir>/test/teardown.ts',
  
  // 超时
  testTimeout: 10000,
};

export default config;
```

### 自定义 testEnvironment

当默认的 `"node"` 或 `"jsdom"` 环境无法满足需求时，可以自定义：

```typescript
// test/custom-environment.ts
const NodeEnvironment = require('jest-environment-node').default;

class CustomEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.myApp = { initialized: true };
  }
  
  async setup() {
    await super.setup();
    // 自定义初始化逻辑
  }
  
  async teardown() {
    // 自定义清理逻辑
    await super.teardown();
  }
}

module.exports = CustomEnvironment;
```

配置中使用：

```typescript
export default {
  testEnvironment: './test/custom-environment.ts',
};
```

---

## 8.7 示例代码

### Fastify API 集成测试

```typescript
import { app } from '../src/app';

describe('User API', () => {
  afterAll(async () => {
    await app.close();
  });

  it('should create user and return 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Alice', role: 'admin' },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).name).toBe('Alice');
  });

  it('should return 400 for invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: '' },
    });
    expect(response.statusCode).toBe(400);
  });
});
```

Fastify 内置的 `inject` 方法允许在不启动 HTTP 服务器的情况下测试路由。这是后端集成测试的最佳实践——速度快、不依赖网络端口。

### 定时器测试

```typescript
jest.useFakeTimers();

it('should debounce API calls', () => {
  const handler = jest.fn();
  const debounced = debounce(handler, 300);
  
  debounced();
  debounced();
  debounced();
  
  expect(handler).not.toHaveBeenCalled();
  jest.advanceTimersByTime(300);
  expect(handler).toHaveBeenCalledTimes(1);
});
```

测试防抖函数的核心逻辑：快速调用多次，验证只有最后一次触发。

---

## 8.8 小结

Jest 是 Node.js 生态中最成熟、社区最活跃的测试框架之一。它的优势在于：

- **零配置入门**：创建项目后可直接运行 `jest`，无需复杂配置
- **内置 Mock 系统**：`jest.mock`、`jest.fn`、`jest.spyOn` 开箱即用
- **丰富的断言库**：`expect` 提供了几乎所有场景的匹配器
- **快照测试**：对序列化输出进行版本对比
- **并发执行**：Worker 进程机制大幅提升测试速度
- **覆盖率集成**：内置 Istanbul，一行命令即可生成报告

局限也不可忽视：

- **ESM 支持不够成熟**：对 `"type": "module"` 项目友好度有限
- **内存占用高**：每个 Worker 独立进程，大项目测试可能占用数 GB 内存
- **JSDOM 非真浏览器**：前端组件测试存在 API 覆盖盲区
- **配置复杂度**：大型项目中，transform、moduleNameMapper 等配置可能变得臃肿

Jest 对于 Node.js 后端测试来说仍然是首选框架——功能全面、生态完善、社区支持强。接下来的章节将深入探讨 Mock 的艺术和测试进阶策略。