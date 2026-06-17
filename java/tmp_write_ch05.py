import os

path = "D:/学习/大模型/pdf/java/docs/bun-1/ch05-test-runner/README.md"
content = """# 第五章：bun test 与 Mock 机制

## 概述

Bun 内置的测试运行器 `bun test` 是 Bun 工具链中最具竞争力的组件之一。它旨在作为 Jest 的直接替代品，同时提供更快的启动速度和更低的资源消耗。本章将全面介绍 bun test 的使用场景、实现原理、潜在风险与优化策略，以及必备的测试技能。无论你是有多年经验的测试工程师，还是刚刚接触自动化测试的新手，本章都将为你提供从入门到精通的完整知识体系。

bun test 的出现标志着 JavaScript 测试工具链的一次重大变革。在 Bun 出现之前，JavaScript 开发者需要在众多测试框架之间做出选择：Jest 功能全面但启动缓慢，Mocha 灵活轻量但需要大量配置，Vitest 快速但依赖 Vite 生态。bun test 试图在性能和功能之间找到最佳平衡点——它内置在 Bun 运行时中，无需安装任何外部依赖，启动速度达到毫秒级别，同时提供了与 Jest 高度兼容的 API。

本章将从六个维度全面剖析 bun test：首先介绍其使用场景，包括单元测试、API 集成测试、快照测试和 DOM 测试；然后深入探讨其实现原理，揭示 bun:test 模块的内部工作机制；接着分析潜在风险和优化策略；之后总结典型问题的处理方案；再介绍必备的测试理论知识；最后通过三个完整的示例代码进行实战演练。

需要特别强调的是，bun test 并非仅仅是一个"更快的 Jest"。它在设计哲学上与 Jest 有着本质的不同。Jest 是一个独立的测试框架，它需要在 Node.js 之上运行，通过大量抽象和兼容层来实现其功能。而 bun test 是 Bun 运行时的一个有机组成部分，它与 Bun 的模块解析系统、JavaScript 引擎、文件系统操作等底层基础设施深度集成。这种集成意味着 bun test 可以在多个层面进行优化，而这些优化是任何第三方测试框架都无法实现的。

从生态系统的角度来看，bun test 的出现代表了 JavaScript 工具链从"独立工具集合"向"一体化运行时"转变的趋势。过去，一个典型的 JavaScript 项目需要安装和配置数十个工具：测试框架（Jest）、类型检查器（TypeScript）、打包工具（Webpack/Vite）、代码格式化工具（Prettier）、代码检查工具（ESLint）、转译工具（Babel）等等。每个工具都有自己的配置文件、插件体系和性能特征。随着 Bun 的成熟，越来越多的这些功能被直接集成到运行时中，大大简化了项目配置和开发工作流。

在测试领域，这种集成带来的最直接好处是"零配置测试"。你不需要创建 jest.config.js，不需要配置 ts-jest 或 babel-jest，不需要安装 @types/jest，不需要设置测试环境。只需安装 Bun，然后运行 bun test，一切就能正常工作。这种体验对于新手开发者来说尤其友好，降低了编写测试的心理门槛。

另外值得注意的是，bun test 与 Bun 的其他内置功能（如 Bun.serve()、Bun.file()、Bun.write()、Bun.spawn() 等）可以无缝配合，形成一个完整的内置测试解决方案。这意味着你可以在测试中直接使用 Bun 的文件操作、网络请求、子进程管理等 API，而不需要像在 Jest 中那样进行复杂的模拟设置。这种"原生集成"的测试体验，是 bun test 区别于传统测试框架的最显著特征之一。

## 1. 使用场景

### 1.1 单元测试（替代 Jest）

单元测试是 bun test 最核心的使用场景。Bun 的测试运行器在设计之初就以 Jest 兼容性为目标，这意味着如果你曾经使用过 Jest，切换到 bun test 的学习成本极低。事实上，bun test 的 API 设计在很大程度上参考了 Jest，许多测试文件甚至不需要修改就能直接运行。

**为什么选择 bun test 进行单元测试？**

传统上，Jest 是 JavaScript 生态中最流行的测试框架，几乎所有的主流 JavaScript 项目都在使用 Jest 进行测试。然而，Jest 在大型项目中的性能问题日益突出——启动慢、内存占用高、测试执行时间长。特别是在 monorepo 架构的大型项目中，Jest 的启动时间可能长达数秒甚至数十秒，严重影响了开发者的工作流效率。

bun test 针对这些问题进行了根本性的优化：

- **启动速度**：bun test 的启动时间通常在 50ms 以内，而 Jest 在同样项目中的启动时间通常在 500ms-2000ms。这个差距在小型测试套件中尤其明显。想象一下，你每次修改代码后运行测试，Jest 需要花费 2 秒来启动，而 bun test 只需要 50 毫秒——在一天的开发工作中，这个差距累积起来是非常可观的。
- **执行速度**：得益于 Bun 的 JavaScript/TypeScript 原生支持，bun test 不需要额外的转译步骤，测试执行速度比 Jest 快 5-10 倍。Jest 在执行测试之前需要经过 Babel 或 ts-jest 进行转译，这是一个 CPU 密集型的操作。而 Bun 使用 JavaScriptCore 引擎原生支持 TypeScript，无需任何转译步骤。
- **内存占用**：bun test 的内存占用通常只有 Jest 的 30%-50%。这对于内存受限的 CI 环境来说是一个巨大的优势，可以降低 CI 成本并减少 OOM（内存溢出）的风险。

**bun test 与 Jest 的 API 兼容性**

bun test 支持 Jest 的大部分核心 API，下面的表格详细列出了两者的对比：

| API | bun test | Jest | 差异 |
|---|---|---|---|
| `describe` / `it` / `test` | 完全支持 | 完全支持 | 完全兼容，语法和功能一致 |
| `expect` 基本匹配器 | 完全支持 | 完全支持 | `toBe`、`toEqual`、`toStrictEqual` 等完全兼容 |
| `beforeAll` / `afterAll` | 完全支持 | 完全支持 | 生命周期钩子完全兼容 |
| `beforeEach` / `afterEach` | 完全支持 | 完全支持 | 生命周期钩子完全兼容 |
| `mock()` | 完全支持 | 完全支持 | bun 使用 `mock()`，Jest 使用 `jest.fn()`，功能一致 |
| `spyOn()` | 完全支持 | 完全支持 | API 一致，但 bun 的 spyOn 性能更优 |
| `jest.mock()` | 部分支持 | 完全支持 | bun 使用 `mock.module()` 替代，语法有差异 |
| `jest.useFakeTimers()` | 完全支持 | 完全支持 | 虚拟定时器 API 完全兼容 |
| `jest.clearAllMocks()` | 完全支持 | 完全支持 | 全局 mock 清理 API 完全兼容 |
| `jest.resetAllMocks()` | 完全支持 | 完全支持 | 全局 mock 重置 API 完全兼容 |
| `jest.restoreAllMocks()` | 完全支持 | 完全支持 | 全局 mock 恢复 API 完全兼容 |
| `test.each` | 完全支持 | 完全支持 | 参数化测试完全兼容 |
| `describe.each` | 完全支持 | 完全支持 | 参数化套件完全兼容 |
| `expect.extend()` | 不支持 | 完全支持 | bun 不支持自定义匹配器扩展 |
| 快照测试 | 完全支持 | 完全支持 | 功能一致，但文件格式略有不同 |
| 行内快照 | 完全支持 | 完全支持 | 完全兼容 |
| TAP 格式输出 | 支持 | 不支持 | bun 额外支持 TAP 格式 |
| 覆盖率报告 | 完全支持 | 完全支持 | 覆盖率功能基本一致 |

从上表可以看出，bun test 在核心 API 上与 Jest 高度兼容，主要的差异体现在 `jest.mock()` 和 `expect.extend()` 这两个 API 上。对于大多数项目来说，这些差异不会构成迁移的障碍。

**bun test 与 Vitest 的对比**

除了 Jest，Vitest 是另一个流行的测试框架。下面将 bun test 与 Vitest 进行对比：

| 特性 | bun test | Vitest |
|---|---|---|
| 依赖 | 内置于 Bun 运行时 | 需要安装 Vitest 和 Vite |
| 启动速度 | 极快（<50ms） | 快（<200ms） |
| TypeScript 支持 | 原生支持 | 通过 Vite 支持 |
| 与 Vite 项目集成 | 无特殊集成 | 原生集成 |
| HMR 支持 | 不支持 | 支持 |
| UI 模式 | 不支持 | 支持 |
| Workspace 支持 | 有限 | 完善 |
| 浏览器测试 | 有限（happy-dom） | 支持（通过 Webdriver） |
| 社区生态 | 较新 | 较成熟 |

**从 Jest 迁移到 bun test 的实战指南**

如果你有一个使用 Jest 的现有项目，想要迁移到 bun test，可以按照以下步骤操作：

第一步，安装 Bun 运行时。如果还没有安装 Bun，可以使用以下命令：

```bash
curl -fsSL https://bun.sh/install | bash
# 或者使用 npm
npm install -g bun
```

第二步，修改导入语句。将所有的 `@jest/globals` 导入替换为 `bun:test`：

```typescript
// 修改前
import { describe, it, expect, jest } from '@jest/globals';

// 修改后
import { describe, it, expect, mock, spyOn } from 'bun:test';
```

第三步，替换 Jest 特定的 API：

```typescript
// jest.fn() → mock()
const fn = mock(() => 42);
// jest.spyOn() → spyOn()
const spy = spyOn(obj, 'method');
// jest.mock() → mock.module()
mock.module('fs', () => ({ readFileSync: () => 'content' }));
```

第四步，运行测试并修复问题：

```bash
bun test
```

根据项目的复杂度，迁移过程可能需要几分钟到几小时。对于大型项目，建议逐个模块迁移，而不是一次性全部迁移。

**单元测试的最佳实践**

在使用 bun test 进行单元测试时，以下最佳实践可以帮助你获得更好的体验：

1. **保持测试的独立性**：每个测试用例应该独立运行，不依赖其他测试的状态。使用 `beforeEach` 和 `afterEach` 来设置和清理测试环境。这是测试设计中最重要的原则之一——测试之间的依赖会导致难以调试的失败和脆弱的测试套件。

2. **使用 describe 组织测试**：将相关的测试用例分组到 describe 块中，提高可读性和可维护性。合理的嵌套层次通常是 2-3 层，过多的嵌套会影响可读性。

3. **测试边界条件**：不仅要测试正常情况，还要测试边界条件、错误情况和异常输入。例如，对于一个接收数字参数的函数，除了测试正常值之外，还应该测试 0、负数、最大值、NaN 等情况。

4. **使用有意义的测试名称**：测试名称应该清晰地描述测试的行为和期望结果。一个好的测试名称应该遵循"should do something when something"的格式，例如 "should return error when email is invalid"。

5. **避免测试实现细节**：测试应该关注行为而不是实现细节，这样在重构时测试不会轻易失败。测试的是"做什么"而不是"怎么做"。

6. **单一断言原则**：每个测试用例最好只验证一个行为。虽然这不是硬性规定，但遵循这个原则可以让测试失败时更容易定位问题。

7. **使用参数化测试**：当需要测试多组输入输出时，使用 `test.each` 可以减少重复代码：

```typescript
test.each([
  [1, 1, 2],
  [1, 2, 3],
  [2, 3, 5],
])('add(%i, %i) should be %i', (a, b, expected) => {
  expect(add(a, b)).toBe(expected);
});
```

### 1.2 API 集成测试

bun test 与 Bun 内置的 HTTP 服务器 `Bun.serve()` 结合，可以轻松实现 API 集成测试。这比传统的使用 supertest 或 node-fetch 的方式更加简洁和高效。在传统的 Node.js 生态中，进行 API 集成测试通常需要安装 supertest、chai-http 或 axios 等第三方库，并且需要额外配置服务器的启动和关闭。而使用 bun test，这些都可以通过内置 API 实现。

**API 集成测试的优势**

- **无需外部依赖**：Bun 内置了 `fetch` API 和 `Bun.serve()`，不需要安装额外的 HTTP 客户端或测试服务器。这意味着你的 package.json 中少了一个 devDependency，减少了依赖管理的复杂性。
- **真实请求响应**：使用真正的 HTTP 请求进行测试，比直接调用函数更接近生产环境。你的测试覆盖了完整的 HTTP 请求生命周期，包括序列化、传输、解析等环节。
- **生命周期管理**：利用 `beforeAll` 和 `afterAll` 启动和停止测试服务器，控制测试环境。这样可以确保每个测试套件都拥有独立的服务器实例，避免测试之间的相互影响。
- **快速启停**：Bun.serve() 的启动速度极快，通常在几毫秒内就能完成，这意味着你可以在每个测试套件中独立启动和关闭服务器，而不必担心性能开销。
- **端口管理**：可以使用端口 0 让系统自动分配可用端口，避免端口冲突。这对于并行测试尤其重要。

**API 测试的关注点**

1. **状态码验证**：确保 API 返回正确的 HTTP 状态码。200 表示成功，201 表示创建成功，204 表示无内容，301 表示重定向，400 表示客户端错误，401 表示未认证，403 表示禁止访问，404 表示未找到，500 表示服务器错误。

2. **响应体验证**：验证响应体的结构和内容。不仅要验证字段的值，还要验证字段的类型和结构。使用 `toEqual()` 或 `toMatchObject()` 进行深度比较。

3. **请求头验证**：检查 Content-Type、CORS 头、缓存头等响应头信息。例如，API 返回 JSON 数据时，应该确保 `Content-Type: application/json`。

4. **错误处理**：测试 4xx 和 5xx 状态码的响应。一个好的 API 不仅在成功时返回正确的结果，在失败时也应该返回清晰的错误信息。

5. **认证和授权**：测试受保护的端点，验证未认证请求被正确拒绝，以及不同角色用户对资源的访问权限。

6. **请求体验证**：测试无效的请求体格式，确保 API 能够正确处理和拒绝无效输入。

7. **分页和过滤**：如果 API 支持分页和过滤，测试这些功能是否正确工作。

8. **并发请求**：测试多个并发请求的处理，确保服务器不会出现竞态条件或死锁。

**API 测试的常见模式**

在实际项目中，API 测试通常遵循以下模式：

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";

describe("API 测试套件", () => {
  let server;
  let baseUrl: string;

  beforeAll(() => {
    server = Bun.serve({
      port: 0, // 使用端口 0 自动分配
      fetch(req) {
        const url = new URL(req.url);
        switch (url.pathname) {
          case "/api/users":
            if (req.method === "GET") {
              return Response.json([{ id: 1, name: "Alice" }]);
            }
            break;
          case "/api/auth":
            if (req.method === "POST") {
              return Response.json({ token: "mock-token" });
            }
            break;
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop();
  });
});
```

### 1.3 快照测试

快照测试是 bun test 支持的另一项重要功能。它允许你捕获组件的输出或函数的返回值，并在后续测试运行中将其与保存的快照进行比较。快照测试在 UI 组件测试中特别有用，因为它可以自动检测组件输出的意外变化。

**快照测试的工作原理**

```
第一次运行 ----> 生成快照 ----> 保存到 __snapshots__/ 目录
                                                |
第二次运行 ----> 生成新输出 ----> 与快照比较 ----> 匹配 -> 通过
                                          |
                                        不匹配 -> 失败（或更新快照）
```

快照测试的流程可以分为以下几个步骤：

1. 首次运行测试时，`toMatchSnapshot()` 会序列化传递给 `expect()` 的值，生成一个字符串表示。
2. 这个字符串被保存到 `__snapshots__/` 目录下的 `.snap` 文件中，文件名与测试文件对应。
3. 后续运行测试时，重新序列化当前值，并与保存的快照进行比较。
4. 如果两者完全匹配，测试通过。如果不匹配，测试失败，并输出 diff。
5. 如果输出变化是预期的，开发者可以通过 `--update-snapshots` 标志更新快照。

**快照测试的适用场景**

- React 组件的渲染输出：验证组件的渲染结果没有意外变化。这是快照测试最经典的使用场景。
- 序列化数据的格式验证：确保 API 响应的数据结构保持一致。快照可以捕获数据结构的细微变化。
- 配置文件的输出验证：验证配置生成函数的输出是否符合预期格式。
- 错误消息的格式验证：确保错误消息的格式和内容在版本迭代中保持一致。
- UI 组件的样式输出：结合 CSS-in-JS 方案，验证组件样式没有意外变化。

**快照测试的最佳实践**

1. **快照应该小而专注**：大型快照难以审查，应该尽量缩小快照的范围。如果一个快照包含数百行输出，开发者很难在代码审查时发现其中的问题。尽量只快照那些你认为不太可能频繁变化的部分。

2. **审查快照**：每次更新快照时都应该仔细审查差异。在代码审查中，快照文件的变更应该像源代码文件一样被仔细审查。如果发现快照变化是意外的，说明代码可能存在 bug。

3. **不要过度使用**：快照测试不能替代断言测试，它只是一种补充手段。如果一个行为可以通过明确的断言来验证（例如 "函数应该返回 true"），那么应该使用断言而不是快照。快照最适合用于验证那些"应该保持不变"的输出。

4. **将快照提交到版本控制**：快照文件应该被提交到 Git 中，以便团队成员审查和追踪变化。不要将 `__snapshots__/` 目录添加到 `.gitignore` 中。

5. **使用行内快照简化审查**：对于小型数据结构，使用 `toMatchInlineSnapshot()` 可以将快照直接嵌入测试文件中，便于在代码审查时看到完整的上下文。

6. **处理不稳定的输出**：对于包含动态值（如时间戳、ID、随机数）的输出，使用属性匹配器忽略这些字段。

**快照测试的局限性**

1. **假阳性**：快照测试只能检测变化，不能判断变化是否正确。
2. **快照膨胀**：在大型项目中，快照文件可能变得非常大。
3. **脆弱的快照**：如果组件的输出格式频繁变化，快照测试会频繁失败。
4. **审查困难**：大型快照的 diff 很难审查，容易遗漏问题。

### 1.4 DOM 测试与 happy-dom

Bun 内置了 happy-dom，这是一个轻量级的 DOM 实现，用于在 Node.js 环境中模拟浏览器 DOM。这意味着你可以在不需要浏览器的情况下测试 DOM 操作和 Web API。happy-dom 是用 TypeScript 编写的，它的设计目标是"足够快且足够兼容"。

**happy-dom 与 jsdom 的对比**

| 特性 | happy-dom | jsdom |
|---|---|---|
| 性能 | 快（比 jsdom 快 2-5 倍） | 较慢 |
| API 兼容性 | 覆盖常见 API | 更全面的 API 覆盖 |
| 文件大小 | 约 200KB | 约 2MB |
| 启动时间 | <10ms | ~50-100ms |
| 维护状态 | 活跃开发 | 维护中 |
| 与 Bun 的集成 | 内置支持 | 需要额外安装 |
| CSS 解析 | 不支持 | 有限支持 |
| 事件系统 | 基本支持 | 完整支持 |
| 焦点管理 | 不支持 | 部分支持 |
| 布局计算 | 不支持 | 不支持 |
| SVG 支持 | 有限 | 较好 |
| MutationObserver | 部分支持 | 完整支持 |
| IntersectionObserver | 不支持 | 支持 |

从对比可以看出，happy-dom 的优势在于性能和启动速度，而 jsdom 的优势在于 API 的完整性和生态成熟度。对于大多数前端组件的测试场景来说，happy-dom 提供的 DOM API 已经足够。

**启用 happy-dom 的方式**

在 bun test 中使用 happy-dom 有三种方式：

方式一：在测试文件顶部添加环境注释：

```typescript
/**
 * @jest-environment happy-dom
 */
```

方式二：在 bunfig.toml 中全局启用：

```toml
[test]
dom = true
```

方式三：在命令行中指定：

```bash
bun test --dom
```

**DOM 测试示例**

```typescript
import { describe, it, expect } from "bun:test";

describe("DOM 操作测试", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("应该能够操作 DOM 元素", () => {
    document.body.innerHTML = '<div id="app">Hello</div>';
    const app = document.getElementById("app");
    expect(app?.textContent).toBe("Hello");
  });

  it("应该测试事件处理", () => {
    const button = document.createElement("button");
    button.textContent = "Click me";
    document.body.appendChild(button);

    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });
    button.click();
    expect(clicked).toBe(true);
  });
});
```

**DOM 测试的注意事项**

1. **DOM 环境的限制**：happy-dom 并不完全实现所有浏览器 API，某些边缘功能可能不可用。
2. **性能考虑**：虽然 happy-dom 比 jsdom 快，但大量 DOM 操作仍然会影响测试性能。
3. **异步 DOM 操作**：对于 `requestAnimationFrame` 等 API，需要额外处理。
4. **样式相关测试**：happy-dom 不支持 CSS 解析，因此 `getComputedStyle()` 等 API 的行为可能与浏览器不一致。
5. **布局测试**：happy-dom 不进行布局计算，因此与元素尺寸和位置相关的测试可能不准确。

**判断是否应该使用 happy-dom**

以下情况适合使用 happy-dom：
- 测试简单的 DOM 操作和事件处理
- 测试组件的渲染输出（如 innerHTML）
- 测试不依赖 CSS 的功能逻辑

以下情况可能需要考虑 jsdom 或其他方案：
- 需要测试 CSS 计算样式
- 需要测试 IntersectionObserver 等高级 API
- 需要测试 SVG 操作
- 需要测试表单验证 API
- 需要精确的布局信息

## 2. 实现原理

### 2.1 bun:test 模块的内部架构

bun:test 是 Bun 的内置模块，它不是从 npm 安装的第三方包，而是 Bun 运行时的一部分。这意味着 bun test 命令可以直接使用，无需安装任何额外的依赖。这一设计决策带来了深远的架构影响——bun:test 的实现代码被编译进 Bun 二进制文件中，与 JavaScriptCore 引擎紧密集成，核心路径使用 Zig 语言实现，绕过了 JavaScript 引擎的解析和执行开销。

**bun:test 的架构层次**

bun:test 的架构可以清晰地划分为六个层次，每个层次负责测试流程中的特定环节。第一层是配置解析层，负责读取 bunfig.toml 配置和解析命令行参数。第二层是测试发现层，负责扫描文件系统并匹配测试文件模式。第三层是测试执行层，管理测试套件树形结构、生命周期钩子队列和并发执行。第四层是断言与 Mock 层，包含 expect API、匹配器系统、Mock 系统和快照系统。第五层是覆盖率收集层，负责代码插桩和数据聚合。第六层是报告输出层，支持多种输出格式。

**核心组件详解**

**测试发现器（Test Discoverer）的实现细节**

bun test 的文件发现过程完全使用 Zig 实现，利用操作系统的原生文件系统 API 进行高效遍历。与 Node.js 中的 `fs.readdir` 递归调用不同，Bun 使用 `std.fs.Dir.walk`（Zig 标准库）进行一次性的目录树遍历，避免了多次系统调用开销。

默认匹配的文件模式按优先级排序：`*.test.{js|ts|jsx|tsx}`、`*_test.{js|ts|jsx|tsx}`、`*.spec.{js|ts|jsx|tsx}`、`*_spec.{js|ts|jsx|tsx}`、`__tests__/**/*`、`test/**/*`。

**测试运行器（Test Runner）的执行流程**

测试运行器是整个 bun test 的核心，它维护了一个测试套件的树形结构。这个树形结构通过 Zig 实现的原生数据结构管理，而不是 JavaScript 对象，以提高性能。

每个测试套件维护自己的生命周期钩子队列。当执行测试时，运行器按以下顺序执行：

1. 执行当前套件的 `beforeAll` 钩子（仅执行一次）
2. 如果当前套件有子套件，递归处理子套件
3. 对于当前套件中的每个测试用例，先执行当前套件及其父套件的所有 `beforeEach` 钩子，然后执行测试用例本身，最后执行所有 `afterEach` 钩子
4. 执行当前套件的 `afterAll` 钩子（仅执行一次）

**并发执行控制的工作原理**

bun test 支持通过 Worker 线程实现并发执行。主进程收集所有测试文件后，创建 Worker 线程池（默认使用 CPU 核心数），将测试文件分发给各个 Worker 并行执行。每个 Worker 线程有独立的 JavaScriptCore 上下文，Worker 之间通过结构化克隆传递结果。主线程负责结果聚合和报告输出。

**超时控制机制**

bun test 为每个测试用例提供独立的超时控制。每个测试用例启动时，运行器创建一个定时器，定时器的时长为配置的超时时间。如果测试用例在定时器触发前完成，取消定时器。如果定时器触发而测试尚未完成，抛出超时错误。

### 2.2 Jest 兼容层

bun:test 的 Jest 兼容层是其设计中最具挑战性的部分。它需要在保持高性能的同时，尽可能与 Jest 的 API 和行为保持一致。Bun 团队没有选择在 Bun 运行时中嵌入 Jest 代码，而是从零开始实现了一套与 Jest API 兼容的接口，但底层实现完全不同。

**兼容层的设计原则**

1. **API 签名兼容**：确保函数名称、参数类型和返回值与 Jest 一致。
2. **行为兼容**：在可能的情况下，保持与 Jest 相同的行为。
3. **性能优先**：当兼容性和性能发生冲突时，优先考虑性能。
4. **渐进式改进**：随着 Bun 版本迭代，逐步填补与 Jest 的 API 差距。

**describe 和 it 的实现细节**

在 bun:test 中，`describe` 和 `it` 的实现涉及一个"当前测试套件栈"的概念。`describe` 的第二个参数（回调函数）是同步执行的，这意味着所有 `it` 调用在 `describe` 返回之前完成。`it` 只是将测试用例注册到当前套件中，实际的测试执行在注册阶段之后进行。嵌套 describe 通过栈结构管理，确保每个 it 被注册到正确的套件中。

**expect 的实现细节**

`expect` 的实现涉及复杂的匹配器链和错误报告。bun:test 的 expect 实现与 Jest 不同，它使用 Zig 实现的序列化比较引擎进行深度比较，而不是纯 JavaScript 实现。深度比较算法递归检查值是否相等，对于大型嵌套对象的比较有显著的性能优势。在基准测试中，bun test 的深度比较速度比 Jest 快 3-5 倍。

**兼容性边界**

虽然 bun:test 努力兼容 Jest，但仍然存在一些边界情况：jest.mock 的自动模拟需要显式提供工厂函数；jest.createMockFromModule 尚未实现；jest.requireActual 的行为可能略有不同；jest.setTimeout 不支持，需要改用 timeout 选项。

### 2.3 Mock 函数拦截机制

Mock 函数是测试中最重要的工具之一，bun:test 的 mock 系统实现了完整的拦截机制。与 Jest 不同，bun:test 的 mock 系统在 Zig 层面做了关键优化，包括使用预分配数组减少动态扩容、使用 JavaScriptCore 的原生 Proxy 机制而非 JavaScript 闭包，以及使用 Bun 的内存分配器减少 GC 压力。

**mock() 函数的实现原理**

`mock()` 函数返回一个特殊的函数对象，它记录了所有调用信息，包括每次调用的参数、结果和 this 上下文。当 mock 函数被调用时，它按照以下优先级确定执行策略：先检查是否有 `mockImplementationOnce`，然后检查 `mockImplementation`，然后检查 `mockReturnValue`，然后检查原始实现，最后返回 undefined。

**spyOn() 的实现原理**

`spyOn()` 包装现有函数而不是创建新函数。它保存原始属性描述符，创建包装函数替换对象上的方法，并提供 `mockRestore` 方法用于恢复原始函数。spyOn 正确处理原型链、getter/setter 和属性描述符。

**mock.module() 的实现原理**

`mock.module()` 是 Bun 特有的 API，用于在模块级别模拟导入。它的实现涉及到 Bun 模块解析器的拦截机制。模拟规则是文件级别的，只在调用 `mock.module()` 的测试文件中生效。模拟规则在测试文件执行完毕后自动清除，不需要手动恢复。

### 2.4 快照比较算法

快照测试的核心是比较算法。bun test 的快照比较算法在 Zig 中实现，使用基于 Myers 的 diff 算法优化版本，时间复杂度为 O(ND)。

快照的生成与存储：当测试第一次运行时，bun test 会为每个测试用例生成快照并保存到 `__snapshots__/` 目录下的 `.snap` 文件中。快照文件的格式使用 `// Bun Snapshot v1` 作为文件头（Jest 使用 `// Jest Snapshot v1`）。

快照比较的算法流程：序列化阶段（检查值类型、递归序列化嵌套结构、处理特殊类型）、加载阶段（定位 .snap 文件、解析快照）、字符串比较（首先尝试完全匹配）、差异分析（使用 Myers diff 算法生成差异）、报告结果。

## 3. 潜在风险与优化

### 3.1 Jest API 覆盖差距

尽管 bun:test 努力兼容 Jest，但仍然存在一些 API 和行为的差异。已知的 API 差距包括：jest.mock 部分支持（使用 mock.module 替代）、jest.unmock 不支持、jest.autoMockOff 不支持、jest.createMockFromModule 不支持、jest.requireActual 部分支持、jest.requireMock 不支持、jest.setMock 不支持、jest.replaceProperty 不支持、jest.dontMock 不支持。

**迁移风险与缓解策略**

**风险 1：jest.mock 自动模拟**：Jest 的 `jest.mock('module')` 如果不提供第二个参数，会自动模拟模块中的所有导出。bun:test 的 `mock.module()` 要求始终提供工厂函数。

**风险 2：全局变量差异**：始终从 `bun:test` 明确导入所需的 API，而不是依赖全局变量。

**风险 3：模块模拟的顺序**：bun:test 的 `mock.module()` 不会被提升，必须在 `import` 之前调用。

### 3.2 快照格式差异

bun test 的快照格式与 Jest 略有不同。bun test 使用 `// Bun Snapshot v1` 作为文件头（Jest 使用 `// Jest Snapshot v1`），字符串序列化使用双引号。如果团队中部分成员使用 bun test，部分成员使用 Jest，快照文件的格式差异可能导致冲突。解决方案包括统一测试运行器、自定义序列化器或 CI 环境统一。

### 3.3 DOM 测试使用 happy-dom 而非 jsdom

Bun 内置了 happy-dom 作为 DOM 实现，而不是更常见的 jsdom。happy-dom 的 API 覆盖不如 jsdom 全面，一些高级功能（如 MutationObserver、IntersectionObserver）可能尚未实现。缓解策略包括使用 jsdom 替代、使用 polyfill 或抽象 DOM 操作。

### 3.4 大型测试套件的性能优化

虽然 bun test 比 Jest 快，但大型测试套件仍然需要优化策略。

**优化策略**

1. **测试分片**：使用 `bun test --shard=1/3` 进行分片并行执行。
2. **并发执行**：使用 `--concurrency` 标志控制并发级别。
3. **测试文件过滤**：使用 `--test-name-pattern` 过滤测试。
4. **覆盖率优化**：使用 `--coverage-exclude` 和 `--coverage-include` 限制覆盖范围。
5. **内存管理**：定期清理 Mock，及时释放资源。

## 4. 典型问题处理

### 4.1 expect API 不工作

**原因 1：导入路径错误**：必须从 `bun:test` 导入，不能从 `jest` 或 `@jest/globals` 导入。

**原因 2：全局变量未注册**：建议始终从 `bun:test` 显式导入。

**原因 3：匹配器不支持**：某些 Jest 自定义匹配器在 bun test 中可能不可用，需要改为辅助函数。

### 4.2 Mock 不工作

**原因 1：模块模拟的顺序错误**：`mock.module()` 必须在 `import` 之前调用。

**原因 2：Mock 函数在测试之间未重置**：使用 `beforeEach` 中的 `mockClear()` 重置 Mock。

**原因 3：spyOn 后未恢复**：在测试结束后调用 `mockRestore()` 恢复原始函数。

### 4.3 快照更新

使用 `--update-snapshots`（或 `-u`）标志更新快照。更新前应该仔细审查差异，确保所有变更都是预期的。

### 4.4 测试超时

可以通过命令行参数（`--timeout=10000`）、单个测试选项（`it('name', fn, 5000)`）或 bunfig.toml 配置超时。常见超时原因包括异步操作未正确 await、无限循环、网络请求未设置超时等。

## 5. 必备知识与技能

### 5.1 测试金字塔理论

测试金字塔由 Mike Cohn 提出，将测试分为三个层次：单元测试（最多，70-80%）、集成测试（适中，15-25%）、E2E 测试（最少，5-10%）。在 bun test 中，单元测试使用 describe/it/expect 编写，集成测试使用 Bun.serve() 进行 API 测试，E2E 测试推荐使用 Playwright 或 Cypress。

### 5.2 Mock、Stub 与 Spy 的区别

Mock 模拟整个对象或函数，用于验证行为交互。Stub 提供预设的返回值，用于控制测试环境。Spy 包装现有函数记录调用，用于观察行为。在 bun test 中，mock() 用于创建 Mock 和 Stub，spyOn() 用于创建 Spy。

### 5.3 TDD 方法论

TDD 遵循红-绿-重构循环：先编写失败的测试（红），然后编写最少的代码使测试通过（绿），最后重构代码提高质量（重构）。TDD 的优势包括更高的代码覆盖率、更好的设计、更少的缺陷、更快的调试和安全的重构。

### 5.4 代码覆盖率指标

常用的覆盖率指标包括行覆盖率、函数覆盖率、分支覆盖率、语句覆盖率和路径覆盖率。在 bun test 中使用 `--coverage` 标志收集覆盖率。覆盖率指标应该作为参考而非目标，80% 的行覆盖率是合理的目标。

## 6. 示例代码与配置

### 6.1 基础测试示例详解

**文件：`examples/01-basic/math.test.ts`**

这个文件展示了 bun test 最基本的测试模式。从 `bun:test` 导入 describe、it、expect 三个核心 API。describe 创建测试套件，it 定义测试用例，expect 配合匹配器进行断言。文件包含四个测试用例：同步加法测试、异步操作测试、对象深度比较测试和类型检查测试。

**运行方式**

```bash
bun test examples/01-basic/math.test.ts
bun test examples/01-basic/
bun test --test-name-pattern="async"
```

### 6.2 Mock 测试示例详解

**文件：`examples/02-advanced/mock.test.ts`**

这个文件展示了 bun test 的 Mock 和 Spy 功能。从 `bun:test` 导入 mock 和 spyOn。第一个测试用例展示基本的 Mock 函数创建和调用验证。第二个测试用例展示 spyOn 拦截对象方法并验证调用参数。第三个测试用例展示如何模拟异步函数。每个测试用例都包含 `mockRestore()` 调用以确保测试间隔离。

### 6.3 API 集成测试示例详解

**文件：`examples/03-production/api.test.ts`**

这个文件展示了如何使用 bun test 进行 API 集成测试。在 `beforeAll` 钩子中使用 `Bun.serve()` 启动 HTTP 服务器，在 `afterAll` 钩子中关闭服务器。测试用例覆盖了四个典型的 API 场景：健康检查端点（GET /health）、资源列表获取（GET /api/todos）、资源创建（POST /api/todos）和 404 错误处理（GET /unknown）。

### 6.4 docker-compose 配置详解

**文件：`docker-compose.yml`**

使用官方 Bun 镜像，将本地 examples 目录挂载到容器中，通过 shell 依次运行三个测试示例。

## 7. 常见问题解答（FAQ）

### 7.1 关于迁移与兼容性

**问：bun test 能否完全替代 Jest？**

答：对于大多数项目来说，bun test 可以完全替代 Jest。核心测试 API 完全兼容。主要的差异在于 jest.mock 的自动模拟机制和 expect.extend 自定义匹配器。对于新建项目，强烈推荐直接使用 bun test。

**问：如何从 Jest 平滑迁移到 bun test？**

答：建议采用渐进式迁移策略。首先安装 Bun 并运行 bun test 查看兼容性问题。逐个修复导入路径和 API 调用。可以在同一项目中同时保留 Jest 和 bun test 配置，逐个模块迁移。

**问：bun test 如何处理 TypeScript 文件？**

答：bun test 原生支持 TypeScript，无需任何额外配置。它使用 Bun 内置的 TypeScript 转译器，而不是 ts-jest 或 Babel。

### 7.2 关于 CI 与部署

**问：在 CI 环境中使用 bun test 有什么注意事项？**

答：确保 CI 环境安装了 Bun 运行时。使用 --coverage 生成覆盖率报告。对于大型测试套件，使用 --shard 进行测试分片。使用 --reporter junit 生成 JUnit 格式的报告，与主流的 CI 平台集成。

### 7.3 关于功能限制

**问：如何在 bun test 中使用自定义匹配器？**

答：bun test 目前不支持 expect.extend() 自定义匹配器。可以编写辅助函数实现自定义断言逻辑。

**问：bun test 的并发执行机制是否安全？**

答：bun test 使用 Worker 线程进行测试文件的并发执行，同一个文件内的测试始终顺序执行。这种设计保证了测试的安全性。

## 8. 总结

### 8.1 本章要点

1. **bun test 的核心优势**：内置测试运行器，无需额外依赖，启动速度快，Jest API 兼容。

2. **三种测试类型**：单元测试使用 describe/it/expect，Mock/Spy 测试使用 mock() 和 spyOn()，API 集成测试结合 Bun.serve()。

3. **关键 API**：describe、it、test、expect、mock、spyOn、beforeAll、afterAll、beforeEach、afterEach。

4. **最佳实践**：遵循测试金字塔原则，正确区分 Mock/Stub/Spy，合理设置覆盖率目标，注意 Jest API 兼容性差异，优化大型测试套件的性能。

### 8.2 bun test 的适用场景决策矩阵

| 项目特征 | 强烈推荐 bun test | 可以评估使用 | 建议继续使用 Jest |
|---------|-------------------|-------------|------------------|
| 新项目（从零开始） | 是 | - | - |
| 从 Jest 迁移（中小型项目） | 是 | - | - |
| 从 Jest 迁移（大型项目，数万个测试） | - | 是 | 是 |
| 大量使用自定义匹配器 | - | 是 | 是 |
| 大量使用 jest.mock 自动模拟 | - | 是 | 是 |
| 依赖 jsdom 特有 API 的 DOM 测试 | - | 是 | 是 |

### 8.3 学习路线图

入门阶段掌握 bun test 基本用法和核心 API；进阶阶段学习 Mock 和 Spy 机制；高级阶段学习 API 集成测试、快照测试和 DOM 测试；专家阶段深入理解 bun:test 的实现原理和性能优化技巧。

### 8.4 下一步

在下一章中，我们将探讨 Bun 的 Shell 脚本能力，包括 `Bun.$` 内建 Shell、与 bash 的兼容性，以及如何在 JavaScript/TypeScript 中执行 Shell 命令。

---

> **提示**：本章的所有示例代码都可以在 `examples/` 目录中找到。使用 `docker-compose up` 可以一键运行所有测试。
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"Written {len(content)} characters")
