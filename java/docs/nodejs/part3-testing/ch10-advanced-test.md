# Ch10: 测试进阶与 Vitest

## 10.1 使用场景

### 覆盖率门禁

覆盖率（Code Coverage）是衡量测试质量的客观指标之一。在 CI/CD 流程中设置覆盖率门禁，可以防止新代码显著降低整体测试覆盖度：

- **红线门禁**：CI 中配置覆盖率阈值，低于阈值则构建失败，阻止合并
- **增量门禁**：只检测本次变更文件的新增代码覆盖率（diff coverage）
- **趋势监控**：持续追踪覆盖率变化趋势，及时发现下降

覆盖率门禁的目标不是"100% 覆盖"，而是防止"无人维护的代码路径"逃逸到生产环境。合理的目标：核心业务模块 80%，基础设施模块 60% 以上。

### 快照保护

快照测试（Snapshot Testing）是 Jest 的特色功能之一，用于检测输出的意外变更。适用场景：

- **API 响应结构**：验证接口返回的 JSON 结构是否发生变化
- **日志格式**：结构化日志的格式变更检测
- **配置序列化**：配置文件生成结果的变更检测
- **CLI 输出**：命令行工具的 stdout 输出格式

快照不是"银弹"——不适合频繁变化的数据（如时间戳、随机 ID），不适合大型输出（超过 50 行的快照难以审查）。

### CI/CD 自动化

测试在 CI/CD 中的核心目标：

1. **早期反馈**：提交后快速运行测试，最快在 2-3 分钟内获得结果
2. **并行加速**：利用分片、矩阵策略并行执行测试
3. **质量门禁**：覆盖率、性能基线、兼容性一并验证
4. **部署安全**：生产部署前通过所有测试用例

### 从 Jest 迁移到 Vitest

Vitest 是 Vite 生态的测试框架，API 兼容 Jest，但启动速度快 10-20 倍。迁移动机：

- **大型项目 Jest 启动慢**：超过 500 个测试文件时，Jest 的初始编译时间可能达到 10-30 秒
- **HMR 热更新需求**：开发阶段测试文件变更后立即重跑
- **ESM 项目兼容性**：Vitest 原生支持 ESM，无需额外配置
- **Vite 生态整合**：如果项目已使用 Vite，Vitest 共享同一套配置管道

---

## 10.2 实现原理

### 覆盖率收集：Istanbul vs V8

Jest 使用 Istanbul（通过 `babel-plugin-istanbul` 或 `nyc`）进行覆盖率收集。原理是在源代码中插入计数器埋点：

```typescript
// 原始代码
function greet(name: string) {
  if (name) {
    return `Hello, ${name}`;
  }
  return 'Hello, World';
}

// Istanbul 插桩后（简化示意）
function greet(name: string) {
  coverage['function:greet']++;
  if (name) {
    coverage['branch:if-true']++;
    return `Hello, ${name}`;
  }
  coverage['branch:if-false']++;
  return 'Hello, World';
}
```

V8 引擎内置了覆盖率收集能力（通过 `v8-inspector` 协议）。Vitest 支持使用 V8 引擎内置的覆盖率提供者，优点是**无需代码插桩**，执行速度更快：

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',  // 使用 V8 内置覆盖率
      // 或 provider: 'istanbul'
    },
  },
});
```

**Istanbul vs V8 对比：**

| 维度 | Istanbul | V8 引擎内置 |
|-----|----------|------------|
| 工作原理 | 源码插桩 | 运行时跟踪 |
| 执行速度 | 较慢（插桩影响性能） | 快（无插桩开销） |
| 覆盖率类型 | lines/branches/functions/statements | lines/functions/blocks |
| 兼容性 | 广泛，支持任何测试框架 | 仅 Chromium 系引擎 |
| 精度 | 分支覆盖精确 | 块覆盖（block coverage）略粗 |

### 快照对比

Jest 快照测试的流程：

1. **首次运行**：将序列化输出写入 `__snapshots__/xxx.test.ts.snap` 文件
2. **后续运行**：比较新输出与快照文件的内容
3. **匹配则通过**：内容一致 -> 测试通过
4. **不匹配则失败**：内容不一致 -> 测试失败，提示差异

```typescript
it('should match API response snapshot', async () => {
  const response = await app.inject({ method: 'GET', url: '/users/1' });
  expect(JSON.parse(response.body)).toMatchSnapshot();
});
```

快照文件是纯文本格式，应当纳入版本控制（git commit），并作为代码审查的一部分。

### CI 集成策略

推荐的 CI 测试流水线：

```yaml
# 测试阶段
1. lint-check:   ESLint / Prettier
     |
2. unit-test:    单元测试 + 覆盖率报告
     |
3. integration:  集成测试（需要数据库等服务）
     |
4. build-check:  构建验证（tsc --noEmit）
```

每个阶段都有明确的失败标准和输出产物。

---

## 10.3 潜在风险

### 覆盖率盲区

高覆盖率不等于高质量。常见的覆盖率盲区：

**分支覆盖不足**：行覆盖率高不等于所有条件分支都被覆盖：

```typescript
function processOrder(order: Order) {
  // 这一行覆盖率达到，但分支可能未完全覆盖
  if (order.type === 'normal' && order.amount > 100) {
    // 场景 1：normal + > 100（已覆盖）
  } else if (order.type === 'vip') {
    // 场景 2：vip（未覆盖）
  } else {
    // 场景 3：其他（未覆盖）
  }
}
```

**逻辑覆盖低**：行覆盖率达到 90%，但实际逻辑路径可能只覆盖了 50%。

**死角不可测**：某些错误处理路径（如数据库连接失败、OOM、磁盘满）难以通过单元测试覆盖。

### 快照膨胀

大型快照文件的问题是**没人审查**。当一个快照文件超过 50 行，开发者在审查时很可能跳过。解决方案：

- **快照瘦身**：只捕获关键字段，排除时间戳、ID 等易变字段
- **内联快照**：小快照使用 `toMatchInlineSnapshot`，直接嵌入测试代码
- **自定义序列化器**：排除无关字段

```typescript
// 排除易变字段
it('should match API response', async () => {
  const response = await getOrder(1);
  const { id, createdAt, ...rest } = response;
  expect(rest).toMatchSnapshot();
});
```

### CI 中测试不稳定

Flaky tests（间歇性失败的测试）是 CI 中最头疼的问题。常见原因：

| 原因 | 表现 | 解决方案 |
|------|------|---------|
| 时间竞争 | 异步操作未正确等待 | 增加 await，使用 waitFor |
| 测试顺序依赖 | 测试 A 依赖测试 B 的副作用 | 确保每个测试独立 |
| 环境差异 | 本地通过，CI 失败 | CI 环境与本地保持一致 |
| 外部服务 | 第三方 API 不可用 | Mock 外部依赖 |
| 并发冲突 | 多个测试同时操作同一资源 | 测试隔离、使用独立资源 |

---

## 10.4 优化策略

### 覆盖率阈值配置

在 `jest.config.ts` 或 `vitest.config.ts` 中设置覆盖率阈值：

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

超出阈值的测试失败会提示具体的未达标指标和差值：

```
ERROR: Coverage for lines (78.5%) does not meet global threshold (80%)
```

### 快照审查流程

高效的快照审查流程：

1. 修改代码 -> 运行测试
2. 快照失败 -> 检查差异（`git diff` 查看快照文件变更）
3. 确认变更合理 -> `jest --updateSnapshot` 更新快照
4. 提交快照变更 -> 代码审查中附带快照变更

**不要做的事**：看到快照失败就直接 `--updateSnapshot`。必须确认变更是有意为之。

### --shard 分片加速 CI

Jest 28+ 的分片功能在 CI 中效果显著：

```yaml
# .github/workflows/test.yml
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20]
        shard: [1/2, 2/2]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test -- --shard=${{ matrix.shard }}
```

总执行时间 = (总测试时间 / 分片数) x (node 版本数)。4 个并行 Job 可将 20 分钟的测试压缩到 5 分钟左右。

---

## 10.5 典型问题处理

### Flaky test 定位

使用 `--repeat` 参数复现不稳定测试：

```bash
# 重复运行 100 次，定位间歇性失败
jest --repeat=100 --runInBand MyFlakyTest

# Vitest 中
npx vitest --repeat=100 MyFlakyTest
```

定位到具体测试后，常见排查方向：

1. 检查是否有共享状态（全局变量、数据库记录）
2. 检查异步操作的超时设置
3. 检查是否有未清理的 Mock
4. 检查是否有依赖顺序

### 快照意外更新排查

快照被意外更新的常见原因：

```bash
# 检查快照文件的 git 变更
git diff tests/__snapshots__/

# 查看哪些文件产生了快照变更
jest --listTests | xargs grep -l "toMatchSnapshot"
```

**预防措施**：在 CI 中设置快照对比步骤，不允许快照被自动更新：

```bash
# CI 中不使用 --updateSnapshot
jest --ci
```

### 覆盖率差异分析

当覆盖率下降时，定位具体是哪些文件导致的：

```bash
# 生成覆盖率报告
jest --coverage

# 查看 JUnit 格式报告
# coverage/lcov-report/index.html 在浏览器中查看
```

推荐在 PR 模板中包含覆盖率对比项：

```markdown
## 覆盖率影响
- [ ] 覆盖率未下降
- [ ] 新增代码有测试覆盖
- [ ] 快照已更新（如适用）
```

---

## 10.6 Vitest 对比

| 特性 | Jest | Vitest |
|:-----|:-----|:-------|
| 启动速度 | ~3-5s（完整编译） | ~200ms（Vite 缓存） |
| HMR 热更新 | 不支持 | 支持 |
| ESM 支持 | 需要 ts-jest/babel | 原生支持 |
| 快照测试 | 成熟 | 兼容 Jest API |
| 兼容性 | 广泛 | 需 Vite 生态 |
| Worker 策略 | 独立进程 | Vite 转换管道 + Worker |
| 配置方式 | jest.config.ts | vitest.config.ts |
| 覆盖率 | Istanbul | Istanbul / V8 |
| 性能优化 | --maxWorkers 控制 | 自动基于 idle 时间优化 |

**选型建议**：

- **新项目（Vite 生态）**：优先 Vitest, 启动速度快、ESM 原生、HMR 支持
- **现有 Jest 项目**：不需要强迁移，除非测试速度成为瓶颈
- **混合项目**：可以并存，逐步迁移

Vitest 与 Jest 的 API 高度兼容，绝大多数 Jest 测试可以零修改在 Vitest 中运行。

---

## 10.7 示例代码

### vitest.config.ts 配置

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

### CI 配置示例

```yaml
# .github/workflows/test.yml
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test -- --shard=1/2
      - run: npm test -- --shard=2/2
```

### 快照测试示例

```typescript
it('should match user profile snapshot', () => {
  const user = {
    id: 1,
    name: 'Alice',
    role: 'admin',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
  expect(user).toMatchSnapshot();
});
```

首次运行生成快照，后续运行对比输出。

---

## 10.8 迁移指南：Jest -> Vitest

### 5 步迁移

**步骤 1：安装 Vitest**

```bash
npm install -D vitest @vitest/coverage-v8
```

**步骤 2：创建 vitest.config.ts**

从 `jest.config.ts` 迁移配置：

```typescript
// 原 jest.config.ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
};

// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**步骤 3：替换 package.json 脚本**

```json
{
  "scripts": {
    "test": "vitest",
    "test:ci": "vitest run --coverage",
    "test:watch": "vitest --watch"
  }
}
```

**步骤 4：处理全局 API**

如果使用了 Jest 的全局 API（`describe`、`it`、`expect`、`jest`），需要在 Vitest 中添加全局配置：

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true, // 启用全局 API，无需手动 import
  },
});
```

或者手动导入 Vitest API：

```typescript
import { describe, it, expect, vi } from 'vitest';
// 注意：jest.fn 变为 vi.fn, jest.mock 变为 vi.mock
```

**步骤 5：迁移 Mock**

Vitest 使用 `vi` 对象替代 `jest` 对象：

| Jest API | Vitest API |
|----------|-----------|
| `jest.fn()` | `vi.fn()` |
| `jest.mock()` | `vi.mock()` |
| `jest.spyOn()` | `vi.spyOn()` |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` |
| `jest.advanceTimersByTime()` | `vi.advanceTimersByTime()` |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` |
| `jest.unstable_mockModule()` | `vi.mock()`（原生支持） |

### 迁移验证

迁移完成后执行一次全量测试：

```bash
npx vitest run
```

对比迁移前后的测试结果：测试数量、通过率、执行时间应一致。如果出现失败，检查：

1. `globals: true` 是否启用
2. 环境变量是否正确设置
3. Mock 路径是否与 Vitest 的模块解析一致
4. TypeScript 路径别名是否映射（需要 `vite.config.ts` 中的 `resolve.alias`）

---

## 10.9 小结

测试进阶不是简单的"写更多测试"，而是从三个维度提升测试体系的质量：

**覆盖率管理**：合理设置覆盖率门禁，关注分支覆盖而非行覆盖。覆盖率是质量标准之一，但不是唯一标准——高质量的断言比高覆盖率更重要。

**快照测试**：是对预期输出变更的"第二道防线"。需要团队建立快照审查文化，避免快照变得无人维护。

**工具选型**：Vitest 在启动速度、ESM 支持、HMR 方面优于 Jest，是新一代 Node.js 测试框架的有力竞争者。但 Jest 的生态成熟度和社区支持仍是其核心优势。选择工具的核心依据是项目需求，而非"最新就是最好"。

**测试是投资，不是成本。** 优质的测试体系减少回归 bug、加速重构、降低上线风险。测试进阶的目标是让测试成为开发效率的加速器，而非负担。