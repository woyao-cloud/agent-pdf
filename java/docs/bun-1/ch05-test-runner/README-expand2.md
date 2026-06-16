

### 5.8.4 bun test 在前端项目中的应用实践

前端项目的测试需求与后端项目有所不同，主要体现在 DOM 操作、组件渲染、用户交互和网络请求等方面。bun test 结合 happy-dom 和 Testing Library，可以满足大部分前端测试需求。

在前端项目中，bun test 的典型测试场景包括：

组件渲染测试：验证组件在给定 props 下是否正确渲染。使用 Testing Library 的 render 函数渲染组件，然后通过 screen 对象查询 DOM 元素并验证其内容。

用户交互测试：验证用户操作（点击、输入、提交等）是否触发预期的行为。使用 fireEvent 或 userEvent 模拟用户操作，然后验证组件状态的变化。

状态管理测试：验证状态管理库（如 Zustand、Jotai、Redux）的行为。这些测试通常是纯逻辑测试，不需要 DOM 环境，执行速度非常快。

网络请求测试：验证组件在发起网络请求后是否正确处理响应和错误。使用 mock.module 模拟 fetch 或 axios 调用，确保测试不依赖真实的网络环境。

前端测试的目录结构推荐如下：

```
src/
  components/
    Button/
      Button.tsx
      Button.test.tsx
      Button.stories.tsx
  hooks/
    useAuth.ts
    useAuth.test.ts
  utils/
    formatters.ts
    formatters.test.ts
  pages/
    Login/
      Login.tsx
      Login.test.tsx
```

前端测试的覆盖率配置通常排除以下文件：样式文件（.css、.scss）、图片资源、类型定义文件、Storybook 文件。

```toml
[test]
dom = "happy-dom"
coverageExclude = [
  "**/*.css",
  "**/*.scss",
  "**/*.stories.tsx",
  "**/*.d.ts",
  "src/vite-env.d.ts",
]
```

### 5.8.5 bun test 与 Edge Runtime 测试

Bun 作为一个兼容多种运行时的平台，支持测试在不同运行时环境下运行的代码。Edge Runtime（如 Cloudflare Workers、Vercel Edge Functions）的代码通常使用 Web 标准 API，与 Bun 的 API 设计高度一致。

测试 Edge Runtime 代码的关键点包括：

使用 Web 标准 API。Bun 原生实现了 Request、Response、Fetch、URL、Headers 等 Web 标准 API，因此 Edge Runtime 的代码可以直接在 bun test 中测试。

模拟 Edge Runtime 特有的 API。某些 Edge Runtime 特有的 API（如 Cloudflare Workers 的 KV 存储、Durable Objects）在 bun test 中默认不可用，需要通过 mock.module 模拟。

测试请求处理函数。Edge Runtime 的核心是一个请求处理函数（fetch handler），接收 Request 对象，返回 Response 对象。bun test 可以直接调用这个函数并验证其行为。

```typescript
// Edge Runtime 的请求处理函数
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/hello") {
      return Response.json({ message: "Hello from Edge!" });
    }
    return new Response("Not Found", { status: 404 });
  },
};

// 在 bun test 中测试
import edgeHandler from "../src/edge-handler";

it("should return hello message", async () => {
  const request = new Request("https://example.com/api/hello");
  const response = await edgeHandler.fetch(request);
  const body = await response.json();
  expect(body.message).toBe("Hello from Edge!");
});

it("should return 404 for unknown routes", async () => {
  const request = new Request("https://example.com/unknown");
  const response = await edgeHandler.fetch(request);
  expect(response.status).toBe(404);
});
```

Edge Runtime 测试的价值在于：可以在本地开发环境中全面验证 Edge 函数的正确性，而无需每次修改都部署到云端验证。这大大缩短了开发反馈循环，提高了开发效率。

### 5.8.6 bun test 的性能调优实战

在实际项目中，即使 bun test 本身性能优异，不当的测试编写方式仍然可能导致测试执行缓慢。以下是一个性能调优的实战案例。

问题描述：一个包含 300 个测试文件的 Node.js 项目，使用 bun test 运行时，总执行时间约为 12 秒。虽然比 Jest 的 60 秒快了很多，但团队希望进一步优化到 5 秒以内。

性能分析：使用 bun test 的 --verbose 标志查看每个测试文件的执行时间。发现约 20% 的测试文件占用了 80% 的总执行时间。这些慢速测试文件主要集中在集成测试类别中。

优化措施：

第一，减少不必要的 setup 操作。某些测试文件在 beforeAll 中执行了数据库迁移操作，虽然使用了内存数据库，但迁移操作本身仍然耗时。将数据库迁移改为只执行一次，在所有测试文件之间共享。

第二，合并小型测试文件。大量包含 1 到 3 个测试的小文件导致了过多的 Worker 线程调度开销。将相关的小型测试文件合并，减少了 Worker 创建和销毁的开销。

第三，优化 Mock 策略。某些测试使用了过多的 mock.module 调用，每个 mock 调用都需要修改模块解析缓存。减少不必要的模块级 Mock，改用函数级 Mock。

第四，使用 lazy import。在顶层使用动态 import() 替代静态 import，只在需要时才加载模块。这减少了测试文件的初始加载时间。

优化结果：总执行时间从 12 秒缩短到 3.5 秒，优化效果显著。测试文件数量从 300 个减少到 220 个（通过合并小型文件），但测试用例数量没有减少，保持了测试覆盖率。

性能调优的关键原则是：先测量，再优化。使用数据驱动的决策方式，找到性能瓶颈的根因，然后针对性地优化。不要在没有数据支持的情况下盲目优化。

### 5.8.7 bun test 的安全测试实践

安全测试是软件开发中不可忽视的环节。bun test 可以用于编写自动化安全测试，验证系统对常见安全威胁的防护能力。

常见的自动化安全测试场景包括：

输入验证测试：验证系统是否正确处理了异常输入，包括 SQL 注入、XSS 攻击、命令注入等。这些测试应该验证系统在接收到恶意输入时是否会抛出错误或返回正确的错误响应。

```typescript
it("should reject SQL injection in username", async () => {
  const maliciousInput = "admin' OR '1'='1";
  const response = await loginUser(maliciousInput, "password123");
  expect(response.status).toBe(401); // 应该认证失败
});

it("should escape XSS in user input", async () => {
  const maliciousInput = "<script>alert('xss')</script>";
  const sanitized = sanitizeInput(maliciousInput);
  expect(sanitized).not.toContain("<script>");
});
```

认证和授权测试：验证系统的认证机制是否正确，包括密码策略、会话管理、权限控制等。

速率限制测试：验证系统是否对暴力攻击有所防护，包括登录尝试次数限制、API 调用频率限制等。

敏感信息泄露测试：验证系统在错误响应中不会泄露敏感信息，如数据库连接字符串、API 密钥、堆栈跟踪等。

```typescript
it("should not expose stack traces in production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const response = await fetch(`${BASE_URL}/api/error`);
  const text = await response.text();

  expect(text).not.toContain("Error:");
  expect(text).not.toContain("at ");
  expect(text).not.toContain("node_modules");

  process.env.NODE_ENV = originalNodeEnv;
});
```

安全测试的集成策略包括：将安全测试纳入 CI/CD 流水线、在每次代码变更后自动运行安全测试、安全测试失败时阻止部署。通过自动化安全测试，团队可以在开发早期发现并修复安全漏洞，降低安全风险。

### 5.8.8 bun test 的国际化测试

对于面向全球用户的应用，国际化（i18n）测试是确保应用在不同语言环境下正确运行的关键。bun test 可以用于验证国际化功能的正确性。

国际化测试的典型场景包括：

文本翻译测试：验证所有用户可见的文本是否都正确翻译为目标语言。这可以通过检查翻译文件是否包含所有必需的键值对来实现。

日期和数字格式测试：验证日期、时间、货币和数字在不同区域设置下的格式是否正确。Bun 原生支持 Intl API，可以在测试中使用。

方向性测试：验证从右到左（RTL）语言（如阿拉伯语、希伯来语）的布局是否正确。这通常需要浏览器级测试，但简单的方向性逻辑可以在 bun test 中验证。

```typescript
it("should format date correctly for en-US locale", () => {
  const date = new Date("2024-06-15");
  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  expect(formatter.format(date)).toBe("June 15, 2024");
});

it("should format date correctly for zh-CN locale", () => {
  const date = new Date("2024-06-15");
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  expect(formatter.format(date)).toBe("2024年6月15日");
});
```

国际化测试的最佳实践包括：测试所有支持的语言环境、使用自动化工具检查翻译完整性、将国际化测试与功能测试分离、在 CI 中运行国际化测试。

## 附录

### A. bun test 命令行参考

bun test 支持丰富的命令行参数，以下是最常用的参数列表：

| 参数 | 说明 | 示例 |
|------|------|------|
| --filter <pattern> | 按文件名模式筛选测试 | bun test --filter="user" |
| --timeout <ms> | 设置测试超时时间 | bun test --timeout=10000 |
| --coverage | 启用覆盖率报告 | bun test --coverage |
| --coverage-threshold <n> | 设置覆盖率阈值 | bun test --coverage-threshold=80 |
| --coverage-reporter <format> | 覆盖率报告格式 | bun test --coverage-reporter=lcov |
| --update-snapshots | 更新快照文件 | bun test --update-snapshots |
| --ci | CI 模式（不写入快照） | bun test --ci |
| --globals | 启用全局变量注入 | bun test --globals |
| --max-workers <n> | 最大并行 Worker 数 | bun test --max-workers=4 |
| --bail | 遇到首个失败时停止 | bun test --bail |
| --watch | 监视模式 | bun test --watch |
| --rerun-each <n> | 失败时自动重试 | bun test --rerun-each=3 |
| --preload <file> | 预加载脚本 | bun test --preload=setup.ts |
| --reporter <format> | 报告器格式 | bun test --reporter=json |

### B. 常见错误信息及解决方案

错误信息："Module not found: bun:test"
原因分析：使用了不支持 bun:test 模块的运行时（如 Node.js）。
解决方案：确保使用 Bun 运行时执行测试，而不是 Node.js。

错误信息："describe is not defined"
原因分析：在未开启全局注入模式时直接使用了 describe。
解决方案：从 bun:test 导入 describe，或使用 --globals 标志。

错误信息："Cannot find module 'module-name'"
原因分析：模块未安装或路径不正确。
解决方案：检查 package.json 和 bun.lockb 文件，确认模块已安装。

错误信息："Snapshot does not match"
原因分析：测试输出与保存的快照不一致。
解决方案：审查快照差异，确认变更是预期行为后使用 -u 更新快照。

错误信息："Timeout - Async callback was not invoked"
原因分析：异步测试未在超时时间内完成。
解决方案：增加超时时间，或检查测试中是否存在未正确处理的异步操作。

错误信息："Jest API 'jest.requireActual' is not supported"
原因分析：使用了 bun test 不支持的 Jest API。
解决方案：使用 import() 动态导入替代，或在 mock 之前保存原始模块引用。

### C. 推荐阅读与参考资料

Bun 官方文档 - Test Runner：Bun 官方提供的测试运行器文档，包含最新的 API 参考和示例代码。

Jest 官方文档：Jest 的官方文档，可以作为迁移参考，了解 Jest API 的完整行为。

Testing Library 官方文档：DOM 测试的最佳实践指南，适用于 bun test 的 DOM 测试场景。

Playwright 官方文档：端到端测试工具，与 bun test 配合使用可以覆盖浏览器级测试需求。

《xUnit Test Patterns》by Gerard Meszaros：测试模式的经典著作，深入讲解了测试替身、测试隔离等核心概念。

《Test-Driven Development: By Example》by Kent Beck：TDD 方法论的奠基之作，通过具体案例讲解 TDD 的实践方法。
