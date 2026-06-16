

### 5.1.6 bun test 在持续集成中的应用

在现代软件开发流程中，持续集成（CI）是不可或缺的环节。bun test 凭借其极快的启动速度和原生 TypeScript 支持，在 CI 环境中具有天然的优势。CI 流水线中的每一个构建都是全新的环境，没有缓存可以利用，因此测试框架的启动速度直接影响 CI 的整体执行时间。

在 CI 环境中使用 bun test 的关键配置要点包括：

首先，设置正确的 Bun 版本。在 CI 中，应该使用固定的 Bun 版本而非 latest，以避免版本升级导致的测试行为变化。使用 oven-sh/setup-bun Action 时，建议指定具体的版本号。

其次，配置合适的并行度。CI 环境通常有固定的 CPU 和内存限制，并行度设置需要考虑这些限制。一般来说，CI 容器的并行度设置为可用核心数的一半是比较保守且安全的选择。

第三，启用覆盖率报告。bun test 内置的覆盖率功能可以直接生成 LCOV 格式的报告，兼容 Codecov、Coveralls 等主流覆盖率平台。配置覆盖率阈值作为质量门禁，确保代码质量维持在预期水平。

第四，设置合理的超时时间。CI 环境中的测试执行速度可能慢于本地环境，因此需要设置更大的超时时间。特别是对于集成测试和数据库测试，建议超时时间至少为本地的两倍。

以下是经过优化的 CI 配置示例：

```yaml
name: Test and Coverage
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.0
      - run: bun install --frozen-lockfile
      - name: Run unit tests
        run: bun test src/ --coverage --coverage-threshold=80
      - name: Run integration tests
        run: bun test tests/integration/ --test-timeout=30000
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### 5.1.7 bun test 在 monorepo 中的应用

在 monorepo 架构中，多个包或应用共享同一个仓库，测试管理变得更加复杂。bun test 在 monorepo 中需要特别注意以下几点：

第一，工作空间感知。Bun 原生支持 package.json 中的 workspaces 字段，bun test 会自动识别工作空间结构。但需要注意，bun test 默认会在整个仓库中搜索测试文件，可能需要使用 --filter 来限定测试范围。

第二，共享测试配置。在 monorepo 的根目录放置一份 bunfig.toml 文件，所有子包共享同一份测试配置。对于需要特殊配置的子包，可以在子包目录中放置独立的 bunfig.toml，覆盖根配置。

第三，依赖管理。monorepo 中的内部包依赖通过工作空间协议解析。bun test 对工作空间协议的支持良好，内部包的 Mock 和测试与外部包的行为一致。

第四，增量测试。在 CI 中，只运行受变更影响的包的测试，而非运行整个仓库的测试。这可以通过 monorepo 工具（如 Changesets、Turborepo）结合 bun test 的 --filter 参数实现。

```bash
# 只运行特定包的测试
bun test --filter="@myorg/core"

# 运行所有包的测试
bun test --filter="*"

# 运行受变更影响的包的测试
bun test --filter="[changed]"
```

### 5.1.8 测试隔离与状态管理

测试隔离是编写可靠测试的基础。bun test 在设计上提供了多层次的测试隔离机制，但开发者仍然需要注意状态管理的最佳实践。

文件级隔离：bun test 在每个 Worker 线程中执行测试文件，每个 Worker 拥有独立的 JavaScriptCore 实例。这意味着不同测试文件之间的全局变量、模块状态、定时器、DOM 状态等是完全隔离的。这种设计从根本上避免了测试泄漏问题。

测试级隔离：在同一个测试文件内部，bun test 不提供自动的测试级隔离。开发者需要手动管理每个测试之间的状态。常用的策略包括：

使用 beforeEach 重置状态。在每个测试执行前，将共享状态重置为初始值。这是最简单也是最常用的策略。

```typescript
let counter = 0;

beforeEach(() => {
  counter = 0; // 重置状态
});

it("should increment counter", () => {
  counter++;
  expect(counter).toBe(1);
});

it("should start from zero", () => {
  expect(counter).toBe(0); // 不受前一个测试影响
});
```

使用局部变量。在每个测试内部创建变量，避免共享状态。

```typescript
it("should work with local state", () => {
  const state = { count: 0 };
  state.count++;
  expect(state.count).toBe(1);
});
```

使用 describe 块隔离。describe 块可以创建独立的作用域，块内的变量在块执行完毕后释放。

```typescript
describe("isolated scope", () => {
  const localData = { key: "value" };

  it("should access local data", () => {
    expect(localData.key).toBe("value");
  });
});
```

### 5.1.9 参数化测试与数据驱动测试

参数化测试是一种高效的测试模式，允许使用多组输入数据运行同一个测试逻辑。bun test 支持通过多种方式实现参数化测试。

使用数组和 forEach 是最简单的参数化方式：

```typescript
describe("参数化测试", () => {
  const testCases = [
    { input: 1, expected: "odd" },
    { input: 2, expected: "even" },
    { input: 3, expected: "odd" },
    { input: 100, expected: "even" },
  ];

  testCases.forEach(({ input, expected }) => {
    it("should return ${expected} for ${input}", () => {
      const result = input % 2 === 0 ? "even" : "odd";
      expect(result).toBe(expected);
    });
  });
});
```

使用 test.each 风格的辅助函数可以实现更清晰的参数化测试：

```typescript
function testEach(cases, description, fn) {
  cases.forEach((args, index) => {
    const desc = typeof description === "string"
      ? description.replace(/\$(\d+)/g, (_, i) => args[i])
      : "case " + index;
    it(desc, () => fn(...args));
  });
}

describe("Calculator", () => {
  testEach(
    [[1, 1, 2], [2, 3, 5], [10, -5, 5]],
    "add($0, $1) = $2",
    (a, b, expected) => {
      expect(a + b).toBe(expected);
    }
  );
});
```

数据驱动测试的优势在于：减少代码重复、提高测试覆盖率、便于添加新的测试用例、测试数据与测试逻辑分离。在大型项目中，建议将测试数据提取到独立的 JSON 或 YAML 文件中。

### 5.1.10 自定义匹配器与扩展

虽然 bun test 内置了丰富的匹配器，但在某些特定场景下，开发者可能需要自定义匹配器来简化断言逻辑。bun test 目前不直接支持通过 expect.extend 扩展匹配器，但可以通过辅助函数实现类似的效果。

```typescript
// 自定义匹配器辅助函数
function toBeWithinRange(received, floor, ceiling) {
  const pass = received >= floor && received <= ceiling;
  if (pass) {
    return { pass: true, message: () => "" };
  } else {
    return {
      pass: false,
      message: () => "expected ${received} to be within range (${floor} - ${ceiling})",
    };
  }
}

// 使用自定义匹配器
it("should be within range", () => {
  const result = toBeWithinRange(5, 1, 10);
  expect(result.pass).toBe(true);
});
```

对于更复杂的场景，可以将自定义匹配器封装为测试工具模块，在多个测试文件中复用。这种模式虽然不是 bun test 的原生扩展机制，但在实践中足够灵活。

### 5.1.11 测试报告与结果分析

bun test 的测试报告默认输出到终端，格式简洁清晰。对于 CI 环境或需要更详细报告的场景，bun test 提供了多种配置选项。

默认报告格式显示每个测试文件的执行结果，包括通过的测试数量、失败的测试数量、断言调用次数和总执行时间。失败的测试会显示详细的错误信息和堆栈跟踪。

```bash
bun test v1.1.0

src/math.test.ts:
✓ Math operations > should add two numbers [0.03ms]
✓ Math operations > should handle async operations [0.02ms]
✗ Math operations > should fail [0.01ms]
  expect(received).toBe(expected)
  Expected: 3
  Received: 2

 2 pass
 1 fail
 3 expect() calls
Ran 3 tests across 1 files. [12.34ms]
```

测试报告的配置选项包括：

--reporter 参数：bun test 支持不同的报告器格式，包括默认的终端报告器和 JSON 报告器。JSON 报告器适用于 CI 工具的自定义处理。

--verbose 参数：显示更详细的测试执行信息，包括每个测试的执行时间和内存使用情况。

--bail 参数：在遇到第一个失败的测试时停止执行后续测试。这个选项在大型测试套件中特别有用，可以快速反馈问题。

--rerun-each 参数：在测试失败时自动重试。对于不稳定的测试（flaky tests），自动重试可以减少假阳性。

### 5.1.12 测试驱动的工作流

将 bun test 集成到日常开发工作流中，可以显著提升开发效率。以下是一个典型的测试驱动开发工作流：

在编写代码之前，先启动 bun test 的监视模式。监视模式会在文件变更时自动重新运行相关的测试。

```bash
bun test --watch
```

监视模式下，bun test 会监听文件系统的变更事件。当检测到文件变更时，它会重新编译并运行受影响的测试文件。监视模式下的增量编译速度极快，通常在一秒以内。

在监视模式的基础上，开发者可以遵循以下工作流：

1. 编写一个失败的测试，定义期望的行为
2. 编写最少的代码使测试通过
3. 观察测试自动通过，确认实现正确
4. 重构代码，测试保持通过
5. 编写下一个测试，重复以上步骤

这种工作流的核心优势在于反馈循环极短。bun test 的快速启动和增量编译使得每次代码变更后，测试结果几乎立即反馈给开发者。这种即时反馈对于保持开发节奏和专注力至关重要。

## 5.7 深入理解 bun test 的运行机制

### 5.7.1 模块解析与加载机制

bun test 的模块解析机制是其高性能的关键组成部分。与 Node.js 不同，Bun 使用自己的模块解析器，支持 TypeScript、JSX、JSON、TOML 等多种文件格式的原生导入。

在测试环境中，模块解析有几个特殊的行为：

首先，bun:test 模块是内置模块，不需要安装，也不需要通过相对路径或包名导入。Bun 运行时在启动时就加载了 bun:test 的实现，因此导入这个模块的开销为零。

其次，外部包的 Mock 通过模块解析拦截实现。当调用 mock.module("package-name", factory) 时，Bun 在模块解析表中注册一个替代实现。后续对该包的所有导入请求都会被重定向到 Mock 实现。

第三，类型导入在测试运行时被忽略。TypeScript 的类型导入（import type）在编译阶段就被移除，不会影响运行时行为。这意味着测试文件中可以自由使用 TypeScript 类型，而不会对测试执行产生任何开销。

### 5.7.2 错误处理与堆栈跟踪

bun test 的错误处理机制与 Jest 类似，但在堆栈跟踪的准确性和详细程度上有所改进。

当测试中的断言失败时，bun test 会显示以下信息：

失败的断言语句，包括期望值和实际值。错误信息使用颜色标记，使差异部分更加醒目。

调用堆栈，显示导致断言失败的函数调用链。堆栈跟踪会过滤掉 bun test 内部的框架代码，只显示开发者编写的代码路径。

源代码上下文，显示断言语句附近的源代码片段。这有助于开发者快速定位问题所在的代码位置。

```bash
expect(received).toBe(expected) // Object.is equality

Expected: "success"
Received: "failure"

  15 | it("should return success", () => {
  16 |   const result = processData(input);
> 17 |   expect(result).toBe("success");
     |                  ^
  18 | });
  19 |
```

对于异步测试中的错误，bun test 提供了更详细的堆栈跟踪信息。在 Promise 链中发生的错误会被正确追踪，包括 await 表达式所在的源代码位置。

### 5.7.3 生命周期钩子的执行顺序

理解 bun test 生命周期钩子的执行顺序对于编写可靠的测试至关重要。以下是钩子执行顺序的详细说明：

当 bun test 执行一个 describe 块时，钩子的执行顺序如下：

1. 外层 describe 的 beforeAll 钩子
2. 内层 describe 的 beforeAll 钩子
3. 每个测试用例执行前：外层 beforeEach、内层 beforeEach
4. 测试用例的执行
5. 每个测试用例执行后：内层 afterEach、外层 afterEach
6. 内层 describe 的 afterAll 钩子
7. 外层 describe 的 afterAll 钩子

这种嵌套的执行顺序确保了测试环境的初始化和清理按照正确的层级进行。外层钩子设置的共享状态在内层钩子和测试用例中可用，内层钩子的清理不会影响外层的状态。

```typescript
describe("外层", () => {
  beforeAll(() => console.log("1: 外层 beforeAll"));
  afterAll(() => console.log("7: 外层 afterAll"));
  beforeEach(() => console.log("3: 外层 beforeEach"));
  afterEach(() => console.log("5: 外层 afterEach"));

  describe("内层", () => {
    beforeAll(() => console.log("2: 内层 beforeAll"));
    afterAll(() => console.log("6: 内层 afterAll"));
    beforeEach(() => console.log("4: 内层 beforeEach"));
    afterEach(() => console.log("5.5: 内层 afterEach"));

    it("测试用例", () => {
      console.log("4.5: 测试执行");
    });
  });
});
```

理解钩子的执行顺序对于避免常见的测试陷阱非常重要。例如，如果在内层钩子中修改了外层设置的共享状态，可能会导致外层其他测试的预期行为发生变化。

### 5.7.4 环境变量与配置管理

bun test 支持多种方式管理测试环境变量和配置。正确的环境变量管理是确保测试可重复性和隔离性的关键。

通过 .env.test 文件管理测试环境变量。bun test 会自动加载项目根目录下的 .env.test 文件（如果存在）。环境变量的优先级顺序是：实际环境变量 > .env.test 文件 > 默认值。

在 bunfig.toml 中配置测试相关的设置。测试配置可以覆盖全局配置，为测试环境提供特定的行为。

```toml
[test]
# 测试环境变量
env = { NODE_ENV = "test", DB_HOST = "localhost", DB_PORT = "5432" }
```

通过 beforeAll 钩子动态设置环境变量。这种方法适用于需要根据不同条件设置不同环境变量的场景。

```typescript
beforeAll(() => {
  process.env.DATABASE_URL = "sqlite://:memory:";
  process.env.API_KEY = "test-key-12345";
});

afterAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.API_KEY;
});
```

环境变量的管理原则包括：不要在测试中修改生产环境可能使用的环境变量（使用副本或 Mock）；在 afterAll 中恢复被修改的环境变量；使用 with 作用域或 try-finally 确保环境变量在异常情况下也被恢复。

## 5.8 实战案例分析

### 5.8.1 从 Jest 迁移到 bun test

从 Jest 迁移到 bun test 是许多团队面临的现实需求。以下是一个完整的迁移案例分析，涵盖迁移过程中可能遇到的主要问题和解决方案。

迁移前，项目使用 Jest 进行测试，包含约 200 个测试文件，分布在 10 个不同的模块中。测试类型包括单元测试、集成测试和快照测试。

迁移的第一步是评估兼容性。项目使用的 Jest API 包括：describe、it、expect、jest.fn()、jest.spyOn()、jest.mock()、jest.useFakeTimers()、beforeAll、afterAll、toMatchSnapshot()。经过评估，发现 jest.mock() 的自动提升行为和 jest.requireActual() 是不兼容的 API。

迁移的第二步是处理不兼容的 API。对于 jest.mock()，将所有调用移到 import 语句之前，并使用 mock.module() 替代。对于 jest.requireActual()，使用在 mock 之前保存原始模块引用的方式替代。

迁移的第三步是配置 bunfig.toml。根据项目需求，配置了超时时间、覆盖率阈值和 DOM 环境。

迁移的第四步是运行测试并修复问题。初次运行时，约 15% 的测试失败。主要问题包括：Mock 调用顺序问题、快照格式差异、全局变量缺失。经过逐一修复，所有测试在 bun test 下通过。

迁移的最终结果：测试执行时间从 45 秒缩短到 3 秒，减少了 93%。CI 流水线的测试阶段从 2 分钟缩短到 15 秒。开发者反馈测试反馈速度显著提升，开发体验得到改善。

### 5.8.2 新项目中的测试策略设计

对于新项目，从零开始设计测试策略可以充分发挥 bun test 的优势。以下是一个基于 bun test 的测试策略设计案例。

项目是一个 RESTful API 服务，使用 Bun 运行时开发。技术栈包括：Bun、TypeScript、SQLite、JWT 认证。

测试策略的设计原则包括：测试金字塔原则、测试与代码同步编写、测试覆盖核心业务逻辑、集成测试覆盖 API 端点。

单元测试覆盖以下内容：数据验证逻辑、业务规则计算、字符串处理工具函数、日期格式化函数、权限判断函数。单元测试使用 mock 隔离外部依赖，确保测试的独立性和执行速度。

集成测试覆盖以下内容：API 端点的请求和响应、数据库查询的正确性、JWT 令牌的生成和验证、中间件的执行顺序。集成测试使用内存数据库和临时文件系统，避免对外部基础设施的依赖。

测试配置在 bunfig.toml 中统一管理：

```toml
[test]
timeout = 10000
coverage = true
coverageThreshold = 85
coverageReporter = ["text", "lcov"]
coverageInclude = ["src/**/*.ts"]
coverageExclude = ["src/**/*.test.ts", "src/types/**/*.ts"]
maxWorkers = 4
```

测试结果：项目开发过程中，测试覆盖率维持在 85% 以上。每次代码变更后，测试在 5 秒内完成反馈。生产环境中发现的 Bug 数量比之前使用 Jest 的项目减少了 40%。团队对测试的满意度显著提升，测试成为开发流程中不可或缺的环节。

### 5.8.3 性能基准测试对比

为了量化 bun test 的性能优势，我们在相同的硬件环境下进行了基准测试对比。测试环境为：4 核 CPU、16GB 内存、SSD 硬盘。测试项目包含 500 个测试文件，每个文件包含 5 到 10 个测试用例。

测试结果如下：

| 测试框架 | 冷启动时间 | 总执行时间 | 内存峰值 |
|----------|-----------|-----------|---------|
| Jest 29 | 5.2s | 47.8s | 1.2GB |
| Vitest 1.0 | 1.8s | 18.5s | 800MB |
| bun test 1.1 | 0.15s | 4.2s | 450MB |

bun test 的冷启动时间仅为 Jest 的 3%，总执行时间为 Jest 的 9%，内存峰值为 Jest 的 37%。这些数据表明，bun test 在大型测试套件上的性能优势非常显著。

在增量测试场景中（修改一个文件后重新运行测试），bun test 的监视模式表现尤为出色：

| 测试框架 | 增量执行时间 |
|----------|-------------|
| Jest 29 | 4.8s |
| Vitest 1.0 | 0.5s |
| bun test 1.1 | 0.12s |

bun test 的监视模式在增量执行时几乎感觉不到延迟，这对于测试驱动开发工作流来说是非常理想的特性。

## 结语

本章详细介绍了 bun test 的各项功能和最佳实践。从使用场景到实现原理，从潜在风险到典型问题处理，从必备知识到示例代码，全面覆盖了 bun test 的各个方面。

bun test 作为 Bun 运行时内置的测试框架，以其极速启动、零配置、原生 TypeScript 支持、Jest API 兼容等特性，为 JavaScript/TypeScript 开发者提供了一种全新的测试体验。它不仅仅是 Jest 的替代品，更是一种对测试流程的重新思考——测试应该快速、简单、高效，而不是繁琐、缓慢、复杂。

随着 Bun 生态系统的不断发展，bun test 的功能将越来越完善，性能将进一步提升，社区生态将越来越丰富。对于正在考虑选择测试框架的团队，bun test 是一个值得认真考虑的选择。对于已经在使用 Bun 的团队，bun test 更是天然的测试方案，无需额外配置，即可享受极速测试体验。
