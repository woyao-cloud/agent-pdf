# Ch09: Mock 的艺术

## 9.1 使用场景

### 隔离外部依赖

单元测试的核心原则是**隔离性**——每个测试应只验证单一模块的行为，不受外部依赖的影响。Mock 就是实现这一隔离的关键工具。

在 Node.js 后端项目中，最常见的 Mock 场景包括：

| 外部依赖 | Mock 原因 | Mock 策略 |
|---------|-----------|-----------|
| 数据库 | 测试不依赖真实数据库，避免数据污染 | Mock DAO / ORM 层 |
| 第三方 API | 避免网络调用、限流、计费 | jest.mock + mockResolvedValue |
| 文件系统 | 测试不读写真实文件 | mock fs 模块 |
| 定时器 | 避免等待真实时间 | jest.useFakeTimers |
| 环境变量 | 不同测试需要不同配置 | jest.resetModules + 手动设置 |
| 认证 / 鉴权 中间件 | 跳过认证流程，聚焦业务逻辑 | Mock 中间件返回值 |

### Mock 什么、不 Mock 什么

一个常见的问题是"哪些应该 Mock，哪些不应该"：

**应该 Mock**：
- 网络 I/O（HTTP 请求、WebSocket、gRPC）
- 磁盘 I/O（文件读写、数据库查询）
- 时间相关（Date.now、setTimeout、setInterval）
- 有副作用的模块（邮件发送、推送通知、日志写入）

**不应该 Mock**：
- 纯工具函数（lodash、moment、validator）
- 数据转换逻辑（JSON.parse/stringify、类型转换）
- 常量定义和枚举
- 简单的条件分支和循环

---

## 9.2 实现原理

### jest.mock 模块拦截

`jest.mock` 的工作原理是在模块加载之前替换其实现。Jest 通过模块系统的 `require` / `import` 拦截机制，在测试文件的模块被加载时，将匹配的模块路径替换为 Mock 版本。

```typescript
// Jest 内部机制（简化示意）
const ModuleCache = new Map();

function requireModule(modulePath) {
  // 检查是否有 jest.mock 注册
  if (jestMockRegistry.has(modulePath)) {
    return jestMockRegistry.get(modulePath); // 返回 Mock
  }
  // 否则正常加载模块
  return originalRequire(modulePath);
}
```

关键点：`jest.mock` 调用必须位于**模块导入之前**。Jest 会在编译时将 `jest.mock` 提升到文件顶部。

```typescript
// Jest 会将其提升到文件顶部
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

// 此时 axios 已经被 Mock
import axios from 'axios';
```

### jest.fn 创建模拟函数

`jest.fn()` 创建一个模拟函数，可以记录调用信息、返回值、实现逻辑：

```typescript
const mockFn = jest.fn();

mockFn('hello', 123);
mockFn('world');

console.log(mockFn.mock.calls);
// [['hello', 123], ['world']]

console.log(mockFn.mock.results);
// [{ type: 'return', value: undefined }, ...]
```

`mock` 属性记录了完整的调用历史，是验证函数调用行为的基础。

### jest.spyOn 包裹现有函数

`jest.spyOn` 在现有方法上包裹一层 spy，可以同时做到两件事：

1. 记录被调用信息（是否被调用、参数、调用次数）
2. 可选择保留原始实现或替换返回值

```typescript
const calculator = {
  add: (a: number, b: number) => a + b,
};

const spy = jest.spyOn(calculator, 'add');

calculator.add(2, 3);

expect(spy).toHaveBeenCalledWith(2, 3);
expect(calculator.add(2, 3)).toBe(5); // 仍然调用原始实现

// 或替换实现
spy.mockImplementation((a, b) => a * b);
expect(calculator.add(2, 3)).toBe(6);
```

### __mocks__ 目录自动 Mock 机制

Jest 支持通过 `__mocks__` 目录自动创建模块的 Mock 版本。当手动 Mock 不存在时，Jest 会检查 `__mocks__` 目录：

```typescript
// src/__mocks__/fs.ts
export const readFileSync = jest.fn(() => 'mock content');
export const writeFileSync = jest.fn();
export const existsSync = jest.fn(() => true);

// 在测试中自动使用 Mock
jest.mock('fs');
// Jest 自动查找 __mocks__/fs.ts
```

这个机制对于 Node.js 内置模块（`fs`、`path`、`os`）特别有用——Jest 为这些模块提供了内置的 `__mocks__` 实现。

---

## 9.3 潜在风险

### Mock 泄漏（跨测试污染）

Mock 泄漏是 Mock 测试中最常见的问题。如果一个测试修改了全局 Mock 但未清理，会影响后续测试：

```typescript
describe('User service', () => {
  it('test 1', () => {
    jest.spyOn(db, 'findUser').mockReturnValue({ id: 1 });
    // Mock 泄漏到后续测试
  });

  it('test 2', () => {
    // db.findUser 仍然被 Mock，但 test 2 可能想要真实实现
  });
});
```

**解决方案**：在 `afterEach` 中清理 Mock：

```typescript
afterEach(() => {
  jest.clearAllMocks();  // 清除调用记录
  jest.resetAllMocks();  // 恢复原始实现
  jest.restoreAllMocks(); // 恢复到 Mock 前的状态（仅 spyOn）
});
```

### 部分 Mock 遗漏

当 Mock 一个模块时，容易遗漏模块中的部分导出：

```typescript
// 假设 utils.ts 导出多个函数
export const helperA = () => 'A';
export const helperB = () => 'B';
export const helperC = () => 'C';

// 只 Mock 了部分
jest.mock('../src/utils', () => ({
  helperA: jest.fn().mockReturnValue('Mock A'),
  // helperB 和 helperC 被遗漏了！
}));
```

**解决方案**：使用 `jest.requireActual` 保留未被 Mock 的部分：

```typescript
jest.mock('../src/utils', () => ({
  ...jest.requireActual('../src/utils'),
  helperA: jest.fn().mockReturnValue('Mock A'),
}));
```

### ESM 模块 Mock 限制

在 ESM 模式下，`jest.mock` 受到严格限制：

- `jest.mock` **只能在顶层（top-level）使用**，不能在 `describe`、`it` 或函数内部调用
- ESM 的静态导入（`import` 语句）在 Jest 评估前已经完成，`jest.mock` 无法像 CJS 那样在运行时拦截

```typescript
// CJS：可正常工作
jest.mock('../src/db');
import { db } from '../src/db';

// ESM：jest.mock 无法在 import 之前生效
import { jest } from '@jest/globals';
jest.mock('../src/db'); // 此时 import 已经完成
```

---

## 9.4 优化策略

### jest.unstable_mockModule 处理 ESM

对于 ESM 项目，Jest 提供了 `jest.unstable_mockModule`（名字虽叫 unstable，但已经是标准方案）：

```typescript
import { jest } from '@jest/globals';

const mockDb = {
  findUserById: jest.fn().mockResolvedValue({ id: 1 }),
};

jest.unstable_mockModule('../src/db.js', () => mockDb);

// 使用动态 import 获取 Mock 后的模块
const { getUser } = await import('../src/user-service.js');

it('should return user', async () => {
  const result = await getUser(1);
  expect(result.id).toBe(1);
  expect(mockDb.findUserById).toHaveBeenCalledWith(1);
});
```

关键要点：
- `jest.unstable_mockModule` 必须在文件顶层调用
- 然后使用 `await import()` 动态加载被测试模块
- 所有用到被 Mock 模块的文件也需要动态导入

### Mock 工厂函数复用

当多个测试文件需要相同的 Mock 集时，抽象为工厂函数：

```typescript
// test/mocks/factories.ts
export function createMockDb() {
  return {
    findUserById: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
  };
}

export function createMockAwsS3() {
  return {
    send: jest.fn().mockResolvedValue({ Body: Buffer.from('') }),
    getObject: jest.fn(),
    putObject: jest.fn(),
  };
}
```

```typescript
// 测试中使用
import { createMockDb } from '../test/mocks/factories';

const mockDb = createMockDb();
jest.mock('../src/db', () => mockDb);

it('test user creation', async () => {
  mockDb.createUser.mockResolvedValue({ id: 1, name: 'Alice' });
  // ...
});
```

### jest.requireActual 保留部分实现

前文已提到——`jest.requireActual` 是 Mock 时保留真实实现的"安全阀"：

```typescript
jest.mock('../src/utils', () => ({
  ...jest.requireActual('../src/utils'),
  dangerousSideEffect: jest.fn(), // 只 Mock 有副作用的函数
}));
```

### beforeEach 清理 Mock

建立一个统一的 Mock 清理策略：

```typescript
beforeEach(() => {
  // 清除所有 Mock 的调用记录，但保留 Mock 实现
  jest.clearAllMocks();
});

// 或更彻底的清理
beforeEach(() => {
  // 清除调用记录并恢复原始实现
  jest.restoreAllMocks();
});
```

推荐在 `jest.config.ts` 中设置全局清理策略：

```typescript
export default {
  clearMocks: true,    // 测试间自动清除 mock 调用记录
  resetMocks: false,   // 不自动重置 mock 实现
  restoreMocks: false, // 不自动恢复 mock 原始实现
};
```

---

## 9.5 典型问题处理

### AWS SDK v3 Mock

AWS SDK v3 采用了模块化架构，每个客户端和命令都是独立包。Mock 方式与 v2 有显著不同：

```typescript
// AWS SDK v3 Mock
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Body: Buffer.from('mocked data'),
      ContentType: 'text/plain',
    }),
  })),
  GetObjectCommand: jest.fn(),
}));
```

注意：v3 使用 `send` 方法代替了 v2 的 `.getObject()` 调用方式。如果项目中同时使用了多个 AWS 服务，可能需要分别 Mock：

```typescript
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Items: [] }),
  })),
  QueryCommand: jest.fn(),
}));
```

### Stripe 支付 Mock

Stripe 的 Node.js SDK 返回 Promise 风格的结果。Mock 时需要注意直接使用构造函数的方式：

```typescript
// Mock Stripe 整体模块
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    charges: {
      create: jest.fn().mockResolvedValue({
        id: 'ch_mock_123',
        status: 'succeeded',
        amount: 2000,
        currency: 'usd',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'ch_mock_123',
        status: 'succeeded',
      }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_mock_456',
        email: 'test@example.com',
      }),
    },
  }));
});
```

```typescript
// 测试
it('should create payment intent', async () => {
  const paymentIntent = await paymentService.charge(2000, 'usd');
  expect(paymentIntent.status).toBe('succeeded');
  expect(paymentIntent.amount).toBe(2000);
});
```

### 数据库 DAO 层 Mock

数据库层 Mock 的核心是隔离持久化逻辑：

```typescript
// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $disconnect: jest.fn(),
  })),
}));

// Spy on DAO 函数
import { findUserById } from '../src/db/dao';

jest.spyOn(findUserById, 'findUserById').mockResolvedValue({
  id: 1,
  name: 'Mock User',
});

it('should return user', async () => {
  const result = await getUser(1);
  expect(result.name).toBe('Mock User');
  expect(findUserById).toHaveBeenCalledWith(1);
});
```

---

## 9.6 开发者技能

### jest.mock vs jest.spyOn vs jest.fn 的选择

| 工具 | 何时使用 | 典型场景 |
|------|---------|----------|
| `jest.mock` | Mock 整个模块 | 外部依赖：数据库、HTTP 客户端、文件系统 |
| `jest.spyOn` | 监控或替换特定方法 | 只关注某个方法是否被调用 |
| `jest.fn` | 创建独立模拟函数 | 回调函数、事件处理器、依赖注入 |
| `jest.createMockFromModule` | 自动生成模块的 Mock | 大型模块的快速 Mock |

**决策树**：

1. 是否需要 Mock 整个模块？ -> `jest.mock`
2. 只关心某个方法是否被调用？ -> `jest.spyOn`
3. 需要一个完全可控的函数？ -> `jest.fn`

### Mock 函数方法

Mock 函数（jest.fn 创建的）提供了一系列方法来控制行为和验证调用：

**返回值控制**：

```typescript
const mock = jest.fn();

mock.mockReturnValue(42);              // 同步返回值
mock.mockReturnValueOnce(1);            // 单次返回值
mock.mockResolvedValue('async result');  // Promise resolve
mock.mockResolvedValueOnce('first');     // 单次 Promise resolve
mock.mockRejectedValue(new Error('fail')); // Promise reject
```

**实现替换**：

```typescript
mock.mockImplementation((a, b) => a + b);
mock.mockImplementationOnce((a) => a * 2);
```

**调用验证**：

```typescript
expect(mock).toHaveBeenCalled();
expect(mock).toHaveBeenCalledTimes(3);
expect(mock).toHaveBeenCalledWith('arg1', 'arg2');
expect(mock).toHaveBeenLastCalledWith('last');
expect(mock).toHaveBeenNthCalledWith(2, 'second');
```

### 模块模拟的三种模式

1. **内联 Mock**——直接在测试文件中定义 Mock：

```typescript
jest.mock('../src/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));
```

2. **手动 Mock**——通过 `__mocks__` 目录提供 Mock 模块：

```typescript
// src/__mocks__/email.ts
export const sendEmail = jest.fn().mockResolvedValue(true);
```

3. **工厂 Mock**——通过工厂函数创建可配置的 Mock：

```typescript
// test/factories/email-mock.ts
export function createEmailMock(options?: { fail?: boolean }) {
  return {
    sendEmail: jest.fn().mockImplementation(() => {
      if (options?.fail) {
        return Promise.reject(new Error('Email failed'));
      }
      return Promise.resolve(true);
    }),
  };
}
```

---

## 9.7 示例代码

### 模块 Mock：AWS SDK v3

```typescript
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Body: Buffer.from('mocked data'),
    }),
  })),
  GetObjectCommand: jest.fn(),
}));
```

### Spy on 数据库 DAO

```typescript
import { findUserById } from '../src/db/dao';

jest.spyOn(findUserById, 'findUserById').mockResolvedValue({
  id: 1,
  name: 'Mock User',
});

it('should return user', async () => {
  const result = await getUser(1);
  expect(result.name).toBe('Mock User');
  expect(findUserById).toHaveBeenCalledWith(1);
});
```

### ESM Mock

```typescript
import { jest } from '@jest/globals';

const mockDb = {
  findUserById: jest.fn().mockResolvedValue({ id: 1 }),
};

jest.unstable_mockModule('../src/db.js', () => mockDb);

const { getUser } = await import('../src/user-service.js');

it('should return user', async () => {
  const result = await getUser(1);
  expect(result.id).toBe(1);
  expect(mockDb.findUserById).toHaveBeenCalledWith(1);
});
```

---

## 9.8 小结

Mock 是单元测试的核心技能，用好了可以让测试快、稳、准；用不好则会产生脆弱的测试套件。好的 Mock 实践遵循三个原则：

**最小化**：只 Mock 必要的外部依赖，不要过度 Mock。Mock 应替换的是 I/O、网络、时间等不稳定因素，而不是纯计算逻辑。

**可信任**：Mock 的行为应当接近真实实现。如果 Mock 返回值与实际情况偏差过大，测试通过反而会造成虚假的安心。建议定期使用集成测试验证 Mock 的准确性。

**可验证**：每个 Mock 的目的应当清晰——为什么 Mock 它、期望它返回什么、是否被正确调用。不要有"幽灵 Mock"（Mock 了但从未验证其行为的函数）。

测试的核心不是"测试代码"，而是**测试假设**。Mock 帮助我们隔离这些假设，让每个测试只验证一件事。