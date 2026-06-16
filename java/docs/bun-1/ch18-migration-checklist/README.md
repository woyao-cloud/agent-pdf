# 第 18 章：迁移 Checklist

> **本章目标**：提供从 Node.js 到 Bun 的完整迁移指南，包括三阶段迁移法、锁文件转换、脚本兼容性处理、双轨并行架构和回滚策略。帮助团队安全、高效地完成运行时迁移。

---

## 1. 使用场景

JavaScript 运行时迁移是一项复杂的工程任务。Node.js 自 2009 年诞生以来，已经成为 JavaScript 服务端开发的事实标准。数以百万计的项目构建在 Node.js 生态之上。然而，随着 Bun 的出现，开发者有了一个新的选择——一个更快、更现代化、更集成的运行时。

**为什么需要迁移？**

在决定迁移之前，首先要明确"为什么"。以下是迁移到 Bun 的常见驱动力：

1. **性能提升**：Bun 在冷启动、依赖安装、测试执行和 HTTP 服务器等场景下，性能是 Node.js 的 2-10 倍。对于性能敏感的应用，这种提升直接影响用户体验和运营成本。

2. **开发体验改善**：Bun 内置了 TypeScript 支持、包管理器、测试框架和打包器。开发者不再需要安装和配置多个工具（tsc、webpack、jest、eslint 等），一个 bun 命令即可完成所有操作。

3. **部署简化**：Bun 的自包含二进制设计简化了部署流程。Docker 镜像更小、构建步骤更少、运行时依赖更少。

4. **Web 标准对齐**：Bun 原生实现了 Web 标准 API（fetch、WebSocket、ReadableStream），代码在不同运行时之间更具可移植性。

**什么时候应该迁移？**

适合迁移的场景：
- 新建项目，没有遗留兼容性问题
- 项目依赖主要是纯 JavaScript 包（没有或少有 C++ 原生模块）
- 团队愿意接受新技术的学习曲线
- 项目对冷启动时间敏感（如 Serverless 函数）
- CI/CD 流水线速度成为瓶颈

**什么时候应该暂缓迁移？**

不适合迁移的场景：
- 项目深度依赖 C++ 原生模块（如 bcrypt、sharp、node-sass）
- 项目使用 Node.js 特有的 API（如 cluster、async_hooks 的高级用法）
- 团队没有足够的带宽处理迁移过程中的问题
- 项目处于关键交付期，稳定性优先
- 依赖的某个关键包明确不兼容 Bun

### 场景一：Node.js 到 Bun 的单项目迁移

这是最常见的场景：一个独立的 Node.js 项目（如一个 Web API 服务、一个 CLI 工具或一个后台任务处理程序）需要迁移到 Bun 运行时。

**迁移前的准备工作**

在开始迁移之前，需要完成以下准备工作：

在开始迁移之前，需要完成以下准备工作：

```bash
# 1. 确保所有代码已提交
git add -A && git commit -m "checkpoint: before bun migration"

# 2. 创建迁移分支
git checkout -b migrate-to-bun

# 3. 记录当前状态
node --version > .node-version.bak
npm ls --depth=0 > dependencies.txt

# 4. 运行完整的测试套件，确保所有测试通过
npm test
# 记录测试结果供迁移后对比
npm test -- --coverage > test-results-node.txt
```

**迁移的核心步骤**

```bash
# 1. 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 2. 清理旧的依赖和锁文件
rm -rf node_modules package-lock.json yarn.lock

# 3. 使用 Bun 安装依赖
bun install

# 4. 运行测试
bun test

# 5. 运行应用
bun run src/index.ts
```

**迁移后的验证**

```bash
# 1. 功能验证：所有测试通过
bun test

# 2. 性能对比
hyperfine --warmup 3 \
  'node dist/index.js' \
  'bun run src/index.ts'

# 3. 构建验证
bun build ./src/index.ts --outdir dist
```

**代码兼容性评估清单**

在完成核心迁移步骤后，建议对照以下清单逐一检查代码兼容性：

```typescript
// 1. 检查全局对象差异
// Node.js 特有：process.nextTick, Buffer, __dirname, __filename
// Bun 兼容：这些在 Bun 中仍然可用
// 但推荐：使用 queueMicrotask 替代 process.nextTick

// 2. 检查模块系统
// CommonJS: require() 在 Bun 中完全兼容
// ESM: import/export 在 Bun 中性能更优
// 混合使用：Bun 支持 CJS 和 ESM 互操作

// 3. 检查路径处理
// Node.js: path.join(__dirname, 'config.json')
// Bun: 使用 import.meta.dir 或 import.meta.url
const configPath = typeof __dirname !== 'undefined'
  ? path.join(__dirname, 'config.json')
  : path.join(import.meta.dir, 'config.json');
```

**迁移示例：CLI 工具的迁移**

CLI 工具是迁移的绝佳候选，因为它们通常依赖较少、功能独立。以下是一个命令行列工具的迁移示例：

原始 Node.js 版本使用 commander 和 chalk：

```javascript
#!/usr/bin/env node
// cli.js — Node.js 版本
const { Command } = require("commander");
const chalk = require("chalk");
const program = new Command();

program
  .name("my-tool")
  .description("一个示例 CLI 工具")
  .version("1.0.0");

program
  .command("greet <name>")
  .option("-l, --language <lang>", "语言", "zh")
  .action((name, options) => {
    if (options.language === "zh") {
      console.log(chalk.green(`你好, ${name}!`));
    } else {
      console.log(chalk.green(`Hello, ${name}!`));
    }
  });

program.parse();
```

迁移后的 Bun 版本：

```javascript
#!/usr/bin/env bun
// cli.ts — Bun 版本（直接运行 TypeScript）
import { Command } from "commander";
import chalk from "chalk";
const program = new Command();

program
  .name("my-tool")
  .description("一个示例 CLI 工具")
  .version("1.0.0");

program
  .command("greet <name>")
  .option("-l, --language <lang>", "语言", "zh")
  .action((name, options) => {
    if (options.language === "zh") {
      console.log(chalk.green(`你好, ${name}!`));
    } else {
      console.log(chalk.green(`Hello, ${name}!`));
    }
  });

program.parse();
```

注意这个示例中代码本身几乎没有变化，唯一的变化是 shebang 从 `#!/usr/bin/env node` 改为 `#!/usr/bin/env bun`，以及文件扩展名从 `.js` 改为 `.ts`。这就是 Bun 兼容性的核心优势——大多数已有的 Node.js 代码可以直接运行，无需修改。

### 场景二：双轨并行运行

对于生产环境，直接切换运行时风险较高。双轨并行策略可以降低风险。

**双轨架构**

```
                    ┌─────────────┐
                    │  负载均衡器   │
                    │  (nginx/HA)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
        │ Bun 实例 1 │ │Bun 实例2│ │Node实例  │
        │ (新版本)   │ │(新版本) │ │(旧版本)  │
        └───────────┘ └────────┘ └──────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼──────┐
                    │   数据库     │
                    │  (共享)      │
                    └─────────────┘
```

**实现双轨并行**

```yaml
# docker-compose.yml — 双轨部署
version: "3.8"
services:
  # Bun 实例（新）
  bun-app:
    image: my-app:bun
    ports:
      - "3001:3000"
    environment:
      - RUNTIME=bun
    deploy:
      replicas: 2
  
  # Node.js 实例（旧）
  node-app:
    image: my-app:node
    ports:
      - "3002:3000"
    environment:
      - RUNTIME=node
    deploy:
      replicas: 2
  
  # 负载均衡器
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

**流量切分策略**

```nginx
# nginx.conf — 逐步切分流量
upstream backend {
    # 初始阶段：100% Node.js
    server node-app:3000 weight=100;
    server bun-app:3000 weight=0;
}

# 第一阶段：10% 流量到 Bun
# server node-app:3000 weight=90;
# server bun-app:3000 weight=10;

# 第二阶段：50% 流量到 Bun
# server node-app:3000 weight=50;
# server bun-app:3000 weight=50;

# 第三阶段：100% 流量到 Bun
# server bun-app:3000 weight=100;
```

### 场景三：团队迁移

当整个团队需要从 Node.js 迁移到 Bun 时，除了技术层面的迁移，还需要考虑人员培训和工作流程变更。

**团队迁移计划**

```
第 1 周：评估与培训
  - 团队学习 Bun 基础知识
  - 评估项目兼容性
  - 确定迁移范围

第 2 周：试点项目迁移
  - 选择一个非关键服务
  - 完成迁移并记录经验
  - 更新团队文档

第 3-4 周：批量迁移
  - 按依赖复杂度排序
  - 逐个迁移服务
  - 每个服务独立验证

第 5 周：全面切换与优化
  - 完成所有服务迁移
  - 移除 Node.js 依赖
  - 性能优化和监控调整
```

**团队培训内容**

```
Bun 团队培训大纲：

1. Bun 基础（2 小时）
   - 安装和环境配置
   - bun run / bun install / bun test
   - TypeScript 支持

2. 迁移实践（3 小时）
   - 锁文件转换
   - 脚本迁移
   - 常见兼容性问题

3. 高级主题（2 小时）
   - Bun.serve() 与 Express 对比
   - Bun.SQLite 使用
   - 性能调优

4. 实战演练（3 小时）
   - 迁移一个示例项目
   - 性能基准测试
   - 问题排查
```

**团队沟通与协调机制**

团队迁移的成功不仅取决于技术能力，还取决于有效的沟通和协调。建议建立以下机制：

1. **迁移大使制度**：在每个团队中指定一名"迁移大使"，作为该团队的 Bun 技术负责人。迁移大使负责回答团队成员的日常问题、组织内部培训和跟踪迁移进度。迁移大使应该是团队中技术能力较强且对 Bun 有热情的成员。

2. **问题跟踪看板**：建立一个专门的问题跟踪看板（如 GitHub Projects 或 Jira），记录所有迁移相关的任务、问题和决策。看板可以分为以下几列：待评估、评估中、准备迁移、迁移中、验证中、已完成和已回滚。每个任务都标注所属服务和迁移负责人。

3. **知识共享库**：建立一个团队共享的迁移知识库（如 Confluence 或 Notion），记录以下内容：每个服务的迁移经验总结、遇到的兼容性问题及解决方案、性能基准测试结果、回滚原因分析、Bun 最佳实践和常用代码模式。

4. **定期状态同步**：每周召开两次 15 分钟的迁移状态同步会议，各个团队快速汇报迁移进度和阻塞项。遇到紧急问题时可以随时发起临时讨论。

---

## 2. 实现原理

### 2.1 三阶段迁移法

三阶段迁移法是一种系统化的迁移策略，将迁移过程分为三个阶段：本地开发环境迁移、CI/CD 流水线迁移和生产环境迁移。

**第一阶段：本地开发环境迁移**

这是迁移的起点，目标是在开发者本地环境中使用 Bun 替代 Node.js。在这一阶段，开发人员可以熟悉 Bun 的命令行工具和开发体验，同时不会影响其他团队成员的工作。

```bash
# 步骤 1：安装 Bun
curl -fsSL https://bun.sh/install | bash

# 步骤 2：配置编辑器
# VSCode 安装 Bun 扩展
code --install-extension oven.bun-vscode

# 步骤 3：创建项目级别的 Bun 配置
# bunfig.toml
[install]
registry = "https://registry.npmjs.org"

[test]
preload = "./test/setup.ts"
```

本地环境迁移的验证清单：能够使用 bun run 运行项目，所有本地测试通过 bun test 通过，开发服务器在 bun --watch 模式下正常热重载，没有运行时错误和未解决的兼容性问题。如果在这个阶段发现兼容性问题，可以在不影响团队成员的情况下独立解决。

**第二阶段：CI/CD 流水线迁移**

在本地环境验证通过后，更新 CI/CD 流水线以使用 Bun。这一阶段的目标是在持续集成环境中验证 Bun 的兼容性，确保自动化测试和构建流程在 Bun 上正常工作。

```yaml
# .github/workflows/ci.yml
name: CI with Bun
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test --coverage
      - run: bun run build
```

CI/CD 迁移的注意事项：在切换到 Bun 之前，建议先在 CI/CD 中同时运行 Node.js 和 Bun 两套流水线，对比两个运行时的测试结果和构建时间。如果发现 Bun 的测试结果与 Node.js 不一致，需要分析差异原因并修复。当 Bun 流水线连续运行一周且没有失败时，可以移除 Node.js 流水线。在 Docker 镜像构建方面，Bun 的 Docker 构建时间通常比 Node.js 快 2-4 倍，但需要注意 Docker 层缓存的配置，避免因为锁文件格式变化导致缓存失效。

**第三阶段：生产环境迁移**

CI/CD 验证通过后，将生产环境切换到 Bun。

```dockerfile
# Dockerfile.bun
FROM oven/bun:latest AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build ./src/index.ts --outdir dist --target bun

FROM oven/bun:alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
```

### 2.2 锁文件转换机制

锁文件（lockfile）是包管理器中确保依赖版本一致性的关键机制。从 Node.js 迁移到 Bun 时，需要将 package-lock.json 或 yarn.lock 转换为 bun.lock。

**锁文件格式对比**

package-lock.json（npm 格式）：
```json
{
  "name": "my-app",
  "lockfileVersion": 3,
  "packages": {
    "node_modules/express": {
      "version": "4.18.2",
      "resolved": "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
      "integrity": "sha512-...",
      "dependencies": {
        "accepts": "~1.3.8",
        ...
      }
    }
  }
}
```

bun.lock（Bun 格式，二进制）：
```
[Bun 锁文件是二进制格式，不可直接读取]
[但可以通过 bun.lock 命令查看内容]
```

bun.lockb 的二进制格式带来了以下优势：

1. **解析速度快**：二进制格式不需要 JSON 解析，Bun 可以直接内存映射（memory-map）锁文件，解析时间从 10-50ms 降低到 <1ms。

2. **文件体积小**：二进制格式通过压缩和二进制编码，文件体积比 JSON 格式小 40-60%。

3. **Git diff 更小**：二进制锁文件的变更通常只影响少量字节，而不是 JSON 格式中可能出现的数百行变更。

**锁文件转换过程**

当你运行 `bun install` 时，Bun 会自动检测并转换锁文件：

```
bun install 的执行流程：

1. 检测现有锁文件
   ├── package-lock.json → 读取 npm 锁文件
   ├── yarn.lock → 读取 Yarn 锁文件
   └── 无锁文件 → 从 package.json 解析

2. 解析依赖树
   ├── 读取 package.json 中的依赖声明
   ├── 解析 semver 版本范围
   └── 与 npm registry 通信获取包信息

3. 生成 bun.lock
   ├── 计算完整性哈希（SHA-512）
   ├── 构建依赖拓扑
   └── 写入二进制锁文件

4. 安装依赖
   ├── 下载包 tarball
   ├── 解压到 node_modules
   └── 写入缓存
```

**锁文件转换的注意事项**

在从 package-lock.json 或 yarn.lock 转换为 bun.lock 时，需要注意以下事项：

1. **版本锁定精度**：npm 和 Yarn 的锁文件锁定的是精确版本号，Bun 也会锁定精确版本。但 Bun 的二进制锁文件在版本解析策略上与 npm 存在细微差异。转换后应该检查关键依赖的版本是否与迁移前一致，可以使用 `bun pm ls` 命令查看已安装的精确版本。

2. **Workspace 支持**：如果项目使用 npm 或 Yarn 的 workspaces 功能，Bun 同样支持。Bun 会自动识别 package.json 中的 workspaces 配置。在转换锁文件时，Bun 会保留 workspace 的依赖关系结构。但需要注意的是，Bun 的 workspace 实现与 npm 和 Yarn 存在差异，建议在转换后手动验证 workspace 中包之间的引用是否正确。

3. **registry 配置**：如果项目使用了私有 registry（如企业内部 npm registry），需要在 bunfig.toml 中配置 registry 地址。Bun 的 registry 配置格式如下：

```toml
# bunfig.toml — registry 配置
[install]
registry = "https://registry.npmjs.org"

# 私有 registry 配置
[install.scopes]
"@mycompany" = { registry = "https://npm.mycompany.com" }

# 认证配置（如果私有 registry 需要认证）
# 也可以通过环境变量 BUN_AUTH_TOKEN 设置
```

4. **完整性验证**：锁文件转换后，建议运行完整性验证，确保所有依赖的完整性哈希与预期一致。Bun 会在安装过程中自动验证完整性哈希，如果发现哈希不匹配，会报错并停止安装。这种验证机制确保了即使在锁文件转换后，依赖的安全性也不会降低。

**锁文件冲突处理**

在团队协作中，锁文件冲突是常见问题。bun.lock 的二进制格式使冲突更难手动解决，但 Bun 提供了冲突解决机制：

```bash
# 遇到锁文件冲突时
git merge main
# 显示 CONFLICT in bun.lock

# 解决方案：重新生成锁文件
rm bun.lock
bun install
# 这会根据 package.json 重新生成锁文件

# 更好的做法：使用 --frozen-lockfile 检查一致性
bun install --frozen-lockfile
# 如果锁文件与 package.json 不一致，会报错
```

### 2.3 脚本兼容性处理

Node.js 项目中通常有一系列 npm scripts，这些脚本在 Bun 中可能需要进行调整。

**脚本分类迁移**

```json
{
  "scripts": {
    // ✅ 直接兼容的脚本
    "start": "bun run src/index.ts",
    "dev": "bun --watch run src/index.ts",
    
    // ✅ 需要修改但变化最小的脚本
    "build": "bun build ./src/index.ts --outdir dist",
    "test": "bun test",
    "lint": "bunx eslint src/",
    
    // ⚠️ 需要更多修改的脚本
    "typecheck": "bunx tsc --noEmit",
    "clean": "rm -rf dist",
    
    // ❌ 需要替换的脚本
    // "start": "node dist/index.js",     → "bun run dist/index.js"
    // "dev": "nodemon src/index.ts",     → "bun --watch run src/index.ts"
    // "build": "tsc",                    → "bun build ./src/index.ts --outdir dist"
    // "test": "jest --coverage",         → "bun test --coverage"
  }
}
```

**常见脚本迁移模式**

```bash
# 1. 运行脚本
# Before
"start": "node dist/index.js"
"dev": "nodemon src/index.ts"
# After
"start": "bun run dist/index.js"
"dev": "bun --watch run src/index.ts"

# 2. 构建脚本
# Before
"build": "tsc"
"build:watch": "tsc --watch"
# After
"build": "bun build ./src/index.ts --outdir dist"
"build:watch": "bun build ./src/index.ts --outdir dist --watch"

# 3. 测试脚本
# Before
"test": "jest --coverage --passWithNoTests"
"test:watch": "jest --watch"
# After
"test": "bun test --coverage"
"test:watch": "bun test --watch"

# 4. 清理脚本
# Before
"clean": "rimraf dist"
# After
"clean": "rm -rf dist"

# 5. Lint 脚本
# Before
"lint": "eslint src/ --ext .ts"
# After
"lint": "bunx eslint src/"
```

**跨平台脚本兼容性**

当团队同时使用 Windows、macOS 和 Linux 开发环境时，脚本兼容性是一个需要特别关注的问题。Bun 在这方面的处理方式如下：

在 Windows 环境下，Bun 使用 Bun Shell 替代系统的 shell 来执行 scripts。Bun Shell 是一个跨平台的 shell 实现，提供了一致的命令行为。这意味着在 Windows 上也可以安全地使用 `rm -rf` 等类 Unix 命令，Bun Shell 会自动将其转换为 Windows 兼容的操作。

```json
{
  "scripts": {
    // Windows 兼容性说明
    "clean": "rm -rf dist",
    // 在 Node.js 中：Windows 上需要 rimraf 或 cross-env
    // 在 Bun 中：Windows 上使用 Bun Shell 自动处理
    
    "build": "bun build ./src/index.ts --outdir dist && cp -r public dist/",
    // && 操作符在 Bun Shell 中跨平台兼容
    
    "dev": "bun --watch run src/index.ts | pino-pretty",
    // 管道操作在 Bun Shell 中跨平台兼容
  }
}
```

对于需要环境变量的脚本，Bun 的处理方式也更加简洁：

```json
{
  "scripts": {
    // Node.js 方式（需要 cross-env 包）
    "start:prod": "cross-env NODE_ENV=production node dist/index.js",
    
    // Bun 方式（不需要 cross-env，原生支持）
    "start:prod": "NODE_ENV=production bun run dist/index.js",
    
    // 多个环境变量
    "start:staging": "NODE_ENV=staging PORT=3001 bun run dist/index.js"
  }
}
```

Bun 直接支持在脚本命令前设置环境变量，不需要 cross-env 包。这不仅减少了依赖数量，也提高了跨平台兼容性，因为 Bun 的内置 Shell 在所有平台上都支持这种语法。

### 2.4 双轨并行架构

双轨并行架构允许新旧运行时同时运行，逐步切换流量，降低迁移风险。

**架构设计原则**

```
双轨并行架构的核心原则：

1. 无状态：应用不持有本地状态，所有状态存储在共享的外部服务中
2. 兼容协议：新旧实例使用相同的 API 协议和数据格式
3. 可观测性：监控两个轨道的延迟、错误率和资源消耗
4. 快速回滚：发现问题时能立即将流量切回旧轨道
```

**数据一致性保障**

在双轨并行期间，需要确保两个轨道的实例访问相同的数据源：

```yaml
# 共享服务配置
services:
  # 两个轨道共享同一个数据库
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=myapp
  
  # 两个轨道共享同一个 Redis
  redis:
    image: redis:7
  
  # Bun 轨道
  bun-app:
    environment:
      - DATABASE_URL=postgres://user:pass@postgres:5432/myapp
      - REDIS_URL=redis://redis:6379
  
  # Node.js 轨道
  node-app:
    environment:
      - DATABASE_URL=postgres://user:pass@postgres:5432/myapp
      - REDIS_URL=redis://redis:6379
```

**监控和告警**

双轨并行期间，需要密切监控以下指标：

```
关键监控指标：

1. 请求延迟（P50、P95、P99）
2. 错误率（5xx 响应比例）
3. 吞吐量（RPS）
4. CPU 和内存使用率
5. 数据库连接数
6. 事件循环延迟

告警阈值：
- P95 延迟增加超过 50%
- 错误率超过 0.1%
- 吞吐量下降超过 20%
- CPU 使用率超过 80%
```

**双轨会话保持策略**

在双轨并行期间，需要确保同一个用户的请求始终被路由到同一个运行时，避免因为运行时切换导致用户感知到行为差异。以下是几种会话保持策略：

1. **基于 IP 的会话保持**：负载均衡器根据客户端 IP 地址计算哈希值，将同一个 IP 的所有请求路由到同一个后端实例。这种方式的实现最简单，但缺点是在 NAT 环境下多个用户可能共享同一个 IP，导致负载不均衡。此外，如果用户的 IP 发生变化（如从 Wi-Fi 切换到移动网络），会话保持会被打破。

2. **基于 Cookie 的会话保持**：用户在首次请求时，负载均衡器设置一个 Cookie，后续请求根据 Cookie 值路由到同一个后端。这种方式比基于 IP 的方式更精确，但需要在应用层面配合处理 Cookie 的生成和传递。

3. **基于 Token 的会话保持**：如果应用使用 JWT 或其他 Token 进行身份认证，可以解析 Token 中的用户 ID 进行会话保持。这种方式需要在负载均衡器层面支持 Token 解析，但提供了最精确的会话保持能力。

在双轨并行期间，建议优先使用基于 Cookie 的会话保持策略，因为它在精确性和实现复杂度之间取得了最佳平衡。随着 Bun 轨道的流量比例逐渐增加，当流量达到 100% 时，可以移除会话保持配置。

### 2.5 Dockerfile 迁移

从 Node.js Dockerfile 迁移到 Bun Dockerfile 涉及几个关键变化。

**Node.js Dockerfile（旧）**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Bun Dockerfile（新）**

```dockerfile
FROM oven/bun:latest AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build ./src/index.ts --outdir dist --target bun

FROM oven/bun:alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
```

**迁移带来的改进**

| 指标 | Node.js Dockerfile | Bun Dockerfile | 改进 |
|------|-------------------|----------------|------|
| 构建阶段步骤 | 4步 | 3步 | 减少 25% |
| 运行时镜像体积 | ~180MB | ~120MB | 减少 33% |
| 构建时间 | ~60s | ~15s | 快 4x |
| 基础镜像 | node:20-alpine | oven/bun:alpine | — |

---

## 3. 风险与优化

### 3.1 迁移过程中的回归风险

迁移到新运行时最担心的就是功能回归——在 Node.js 上正常工作的功能在 Bun 上出现问题。

**常见回归类型**

1. **API 行为差异**：Bun 实现的 Node.js API 在某些边缘情况下行为不同。

```typescript
// 示例：fs.readFileSync 的返回类型
// Node.js: 默认返回 Buffer
// Bun: 默认返回 Buffer（行为一致）

// 示例：child_process.exec 的 maxBuffer 默认值
// Node.js: 默认 200KB
// Bun: 默认值可能不同
// 解决方案：显式指定 maxBuffer
execSync("command", { maxBuffer: 1024 * 1024 });
```

2. **模块加载差异**：Bun 的模块解析规则与 Node.js 有细微差异。

```typescript
// Node.js: 自动解析 .js 扩展名（即使源文件是 .ts）
// Bun: 自动解析 .ts 扩展名
// 解决方案：确保导入路径使用正确的扩展名

// ✅ 在 Bun 和 Node.js 中都兼容
import { helper } from "./utils/helper";
// Bun 会自动尝试 .ts、.tsx、.js 扩展名

// ⚠️ 在 Bun 中可能导致问题
import data from "./data.json";
// Bun 支持 JSON 导入，但行为可能与 Node.js 不同
```

3. **性能回归**：某些操作在 Bun 上可能比 Node.js 慢。

```typescript
// 已知的性能注意事项：
// - 频繁的 require() 调用（使用 import 替代）
// - 大量的小文件操作（使用流式处理）
// - 高频率的定时器（使用 requestAnimationFrame 替代）
```

**回归预防措施**

```bash
# 1. 建立回归测试套件
bun test --coverage

# 2. 性能基准测试
# 迁移前
node -e "console.log('baseline')"
hyperfine 'node dist/index.js'

# 迁移后
bun -e "console.log('migrated')"
hyperfine 'bun run dist/index.js'

# 3. 自动化兼容性检查
bunx caniuse-bun
```

### 3.2 依赖兼容性风险

依赖兼容性是迁移过程中最常见的风险。一个不兼容的依赖可能导致整个项目无法在 Bun 上运行。

**依赖兼容性分级**

```
Level 0: 完全兼容（~70% 的 npm 包）
  - 纯 JavaScript 包
  - 不依赖 Node.js 特定 API

Level 1: 大部分兼容（~20% 的 npm 包）
  - 使用 Node.js 核心 API（fs, path, http）
  - Bun 实现了这些 API

Level 2: 部分兼容（~5% 的 npm 包）
  - 使用 Node.js 高级 API（vm, cluster, async_hooks）
  - 功能可能受限

Level 3: 不兼容（~5% 的 npm 包）
  - 依赖 C++ 原生模块
  - 需要使用替代方案
```

**依赖风险评估流程**

```bash
# 1. 列出所有依赖
bunx npm-ls --all > all-dependencies.txt

# 2. 检查原生模块
grep -r "node-gyp" node_modules/*/binding.gyp 2>/dev/null

# 3. 测试每个依赖
for pkg in $(cat package.json | grep -E '"(dependencies|devDependencies)"' -A 100 | grep -E '"[@a-zA-Z]' | cut -d'"' -f2); do
  echo "Testing $pkg..."
  bun -e "require('$pkg')" 2>&1 || echo "FAIL: $pkg"
done
```

**依赖替换策略**

```typescript
// 策略 1：使用纯 JS 替代品
// ❌ bcrypt (C++ 原生模块)
// ✅ bcryptjs (纯 JavaScript)
import bcrypt from "bcryptjs";

// 策略 2：使用 Bun 内置 API
// ❌ better-sqlite3 (C++ 原生模块)
// ✅ Bun.SQLite (内置)
const db = new Bun.SQLite("app.db");

// 策略 3：使用适配器模式
// 创建一个抽象层，在 Bun 和 Node.js 上使用不同的实现
class StorageAdapter {
  static create() {
    if (typeof Bun !== "undefined") {
      return new BunStorage();
    }
    return new NodeStorage();
  }
}
```

### 3.3 团队学习曲线

团队从 Node.js 迁移到 Bun 需要克服学习曲线。

**学习曲线分析**

```
难度等级 | 主题 | 所需时间
---------|------|---------
低      | bun run / bun install | 30 分钟
低      | bun test | 1 小时
中      | bun build | 2 小时
中      | Bun.serve() | 3 小时
中      | 兼容性问题排查 | 4 小时
高      | Bun.FFI | 6 小时
高      | 性能调优 | 8 小时
```

**减少学习曲线的方法**

1. **渐进式学习**：不要一次性学习所有 Bun 特性。先从 bun run 开始，逐步扩展到 bun test、bun build。

2. **利用已有知识**：Bun 的 CLI 设计参考了 npm 和 Node.js 的习惯。`bun install` ≈ `npm install`，`bun run` ≈ `npm run`，`bun test` ≈ `jest`。这种设计降低了学习成本。

3. **创建团队 Cheat Sheet**：

```
Bun Cheat Sheet（快速参考）

运行
  bun run index.ts        # 运行 TypeScript 文件
  bun --watch run index.ts # 监视模式
  bun --inspect index.ts   # 调试模式

包管理
  bun install              # 安装依赖
  bun add express          # 添加依赖
  bun remove express       # 移除依赖
  bun update               # 更新依赖
  bunx cowsay "Hello"      # 运行 npx 命令

测试
  bun test                 # 运行测试
  bun test --coverage      # 带覆盖率
  bun test --watch         # 监视模式

构建
  bun build ./src/index.ts --outdir dist
  bun build --target bun   # 构建 Bun 目标
  bun build --minify       # 压缩输出
```

### 3.4 回滚策略

即使经过充分的测试，生产环境的迁移也可能出现问题。回滚策略是迁移计划中不可或缺的一部分。

**回滚触发条件**

```
立即回滚的条件：
1. 错误率超过 1%（对比迁移前的基线）
2. P99 延迟增加超过 200%
3. 任何影响用户体验的 5xx 错误
4. 数据库连接池耗尽
5. 内存泄漏导致 OOM
```

**快速回滚方案**

方案 A：Docker 回滚（最快）

```bash
# 使用 Docker Compose 回滚到旧版本
docker-compose -f docker-compose.node.yml up -d
docker-compose -f docker-compose.bun.yml down

# 或者使用 Docker Swarm 回滚
docker service update --rollback my-app
```

方案 B：负载均衡器回滚

```nginx
# nginx 配置回滚
# 在 nginx.conf 中立即切回 Node.js
upstream backend {
    server node-app:3000 weight=100;  # 100% 回 Node.js
    server bun-app:3000 weight=0;      # Bun 下线
}
```

方案 C：Git 回滚

```bash
# 如果迁移涉及代码变更
git revert HEAD --no-edit
git push

# 等待 CI/CD 重新部署
```

**回滚后分析**

回滚后，需要进行根因分析：

```bash
# 收集 Bun 的调试信息
bun --version
bun run --inspect src/index.ts

# 收集日志
journalctl -u bun-app --since "1 hour ago"

# 检查内存使用
bun run -e "console.log(process.memoryUsage())"

# 检查依赖版本
bun pm ls
```

**自动化回滚流程**

为了在紧急情况下快速响应，建议建立自动化的回滚流程。自动化回滚可以在检测到预定义的异常指标时自动触发，减少人工响应时间。

```yaml
# docker-compose.rollback.yml — 自动化回滚配置
version: "3.8"
services:
  # 健康检查服务，持续监控 Bun 实例
  health-monitor:
    image: alpine
    command: >
      sh -c "
      while true; do
        STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://bun-app:3000/health);
        if [ \"$STATUS\" != \"200\" ]; then
          echo 'Health check failed, triggering rollback...';
          docker-compose -f docker-compose.node.yml up -d;
          docker-compose -f docker-compose.bun.yml down;
          break;
        fi;
        sleep 10;
      done
      "
```

**回滚测试与演练**

回滚策略制定后，需要定期进行回滚测试和演练，确保回滚流程在紧急情况下能够顺利执行。建议的演练频率为：每次迁移前进行一次回滚演练，生产环境切换前进行一次全面的回滚演练。演练内容包括模拟各种故障场景，验证回滚流程的完整性和回滚后的功能正确性。

### 问题 1：bun install 后模块未找到

**症状**
```
bun install 成功，但运行时出现：
error: Cannot find module 'express'
```

**原因**
最常见的原因是锁文件不一致。如果 package.json 中有依赖声明但 bun.lock 不是最新的，或者 node_modules 不完整，就会出现这个问题。

**解决方案**

```bash
# 方案 A：重新安装
rm -rf node_modules bun.lock
bun install

# 方案 B：检查 package.json
# 确保依赖在 package.json 中正确声明
cat package.json | grep "express"

# 方案 C：手动安装缺失的依赖
bun add express
```

### 问题 2：构建失败——tsc 不可用

**症状**
```
bun run build
# 如果 build 脚本是 "tsc"
error: Command "tsc" not found
```

**原因**
Bun 不内置 tsc（TypeScript 编译器）。虽然 Bun 可以直接运行 TypeScript，但不会进行类型检查。如果你需要类型检查，需要额外安装 TypeScript。

**解决方案**

```bash
# 方案 A：使用 bun build 替代 tsc
# package.json
{
  "scripts": {
    "build": "bun build ./src/index.ts --outdir dist"
  }
}

# 方案 B：保留 tsc 进行类型检查
bun add -d typescript
# package.json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "bun build ./src/index.ts --outdir dist"
  }
}
```

### 问题 3：测试失败——Jest API 不兼容

**症状**
```
bun test 运行时某些测试失败，特别是在使用 Jest 特有的 API 时
```

**原因**
bun test 兼容 Jest 的大部分 API，但某些 Jest 特有的功能可能不支持或不完全兼容。

**解决方案**

```typescript
// 检查兼容性

// ✅ 兼容的 Jest API
describe("test suite", () => {
  it("should pass", () => {
    expect(1 + 1).toBe(2);
    expect({ a: 1 }).toEqual({ a: 1 });
    expect("hello").toMatch(/hello/);
    expect(() => { throw new Error(); }).toThrow();
  });
});

// ⚠️ 可能需要调整的 Jest API
// jest.mock() — bun test 支持但行为可能不同
// jest.spyOn() — 基本支持
// jest.useFakeTimers() — 可能不完全兼容

// 如果遇到兼容性问题，可以使用 vitest
// bun add -d vitest
```

### 问题 4：性能下降——某些操作比 Node.js 慢

**症状**
```
迁移后，某些操作的性能比 Node.js 差
```

**原因**
虽然 Bun 在大多数场景下比 Node.js 快，但某些特定操作可能因为实现方式不同而较慢。

**解决方案**

```typescript
// 已知的 Bun 性能注意事项

// 1. 大量 require() 调用
// ❌ 慢：多次调用 require
const _ = require("lodash");
const fs = require("fs");
// ✅ 快：使用 import（Bun 优化了 ESM 加载）
import _ from "lodash";
import fs from "fs";

// 2. 使用 Bun 内置 API
// ❌ 慢：通过兼容层调用
import { readFileSync } from "fs";
readFileSync("file.txt");
// ✅ 快：使用 Bun 内置 API
Bun.file("file.txt").text();

// 3. 使用 Bun.serve() 替代 Express
// ❌ 慢：Express 通过兼容层运行
import express from "express";
// ✅ 快：Bun.serve() 原生实现
Bun.serve({ fetch(req) { return new Response("ok"); } });
```

### 问题 5：Docker 构建变慢

**症状**
```
在 Docker 中构建 Bun 应用比预期慢
```

**原因**
Docker 构建变慢通常是因为缓存未命中或体积挂载性能问题。

**解决方案**

```dockerfile
# 优化 Docker 构建缓存
FROM oven/bun:latest AS builder
WORKDIR /app

# 先复制依赖文件（利用 Docker 层缓存）
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 后复制源代码（源代码变化不会导致依赖重新安装）
COPY . .
RUN bun build ./src/index.ts --outdir dist

# 使用 BuildKit 缓存
# docker build --build-arg BUILDKIT_INLINE_CACHE=1 .
```

### 问题 6：Git hooks 在 Bun 项目中失效

**症状**
```
提交代码时，之前配置的 git hooks（如 husky）不再工作
```

**原因**
Git hooks 通常使用 Node.js 脚本来执行。如果系统默认的 Node.js 不可用或路径配置不正确，hooks 可能失败。

**解决方案**

```bash
# 方案 A：确保 Node.js 仍然可用（如果 hooks 依赖 Node.js）
# 在 .husky/pre-commit 中指定运行环境
#!/usr/bin/env node
# 或者使用 bun
#!/usr/bin/env bun

# 方案 B：使用 bun 运行 hooks
# 修改 .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"
bun run lint-staged
```

### 问题 7：PM2 进程管理不再适用

**症状**
```
之前使用 PM2 管理 Node.js 进程，迁移后 PM2 不能直接管理 Bun 进程
```

**原因**
PM2 是专门为 Node.js 设计的进程管理器，它假设进程运行在 Node.js 运行时上。

**解决方案**

```bash
# 方案 A：使用 PM2 管理 Bun 进程（PM2 可以运行任何进程）
pm2 start bun -- run dist/index.js
pm2 save

# 方案 B：使用 systemd（Linux 生产环境推荐）
# /etc/systemd/system/bun-app.service
[Service]
ExecStart=/usr/local/bin/bun run /app/dist/index.js
Restart=always
User=app

# 方案 C：使用 Docker 的内置进程管理
docker run --restart=always oven/bun:latest bun run dist/index.js
```

### 问题 8：环境变量加载问题

**症状**
```
在 Bun 中 process.env 的行为与 Node.js 不同
```

**原因**
Bun 自动加载 .env 文件，但加载规则可能与 Node.js 的 dotenv 包有差异。

**解决方案**

```typescript
// Bun 自动加载 .env 文件
// 不需要 dotenv.config()

// 检查环境变量
console.log(process.env.NODE_ENV);
console.log(Bun.env.NODE_ENV); // Bun 特有的 API

// 如果需要自定义 .env 文件
// 使用 --env-file 标志
// bun --env-file=.env.production run index.ts

// 或者手动加载
const envFile = Bun.file(".env.production");
const envContent = await envFile.text();
// 解析并设置环境变量
for (const line of envContent.split("\n")) {
  const [key, ...values] = line.split("=");
  if (key && values.length > 0) {
    process.env[key.trim()] = values.join("=").trim();
  }
}
```

---

## 5. 必备知识与技能

### 迁移方法论

**为什么需要**

系统化的迁移方法论可以确保迁移过程可控、可预测、可回滚。没有方法论的迁移容易变成"盲目的代码替换"。

**核心概念**

1. **增量迁移**：不要一次性迁移所有内容。按模块、按服务、按功能逐步迁移。

2. **可逆性**：每一步迁移都应该是可逆的。确保在发现问题时能快速回滚。

3. **可观测性**：迁移过程中需要充分的监控和日志，以便快速发现问题。

4. **基线对比**：在迁移前建立性能和行为基线，迁移后进行对比验证。

**迁移方法论框架**

```
1. 评估（Assess）
   - 评估项目兼容性
   - 识别风险点
   - 制定迁移计划

2. 准备（Prepare）
   - 安装 Bun
   - 配置开发环境
   - 更新文档

3. 迁移（Migrate）
   - 锁文件转换
   - 脚本迁移
   - 代码适配

4. 验证（Verify）
   - 功能测试
   - 性能测试
   - 兼容性测试

5. 部署（Deploy）
   - 灰度发布
   - 监控告警
   - 回滚准备
```

### 渐进式迁移策略

**为什么需要**

渐进式迁移可以降低风险。你不会在一天之内替换掉整个运行时的。

**策略层次**

```
Level 1: 单文件级
  将某个独立的脚本从 node 改为 bun 运行
  风险：极低
  示例：bun run scripts/migration.ts

Level 2: 工具链级
  使用 bun install 替代 npm install
  使用 bun test 替代 jest
  风险：低
  收益：立即获得性能提升

Level 3: 服务级
  将某个微服务迁移到 Bun
  风险：中
  需要：负载均衡器支持

Level 4: 全量级
  所有服务迁移到 Bun
  风险：高
  需要：完整的回滚方案
```

### Canary Release（灰度发布）

**为什么需要**

Canary Release 是渐进式迁移的关键技术。它允许你向一小部分用户发布新版本，验证稳定性后再全面推广。

**实现方式**

```yaml
# Kubernetes Canary 部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-bun
spec:
  replicas: 1  # 初始只有 1 个 Bun 实例
  selector:
    matchLabels:
      app: my-app
      runtime: bun
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-node
spec:
  replicas: 9  # 9 个 Node.js 实例
  selector:
    matchLabels:
      app: my-app
      runtime: node
---
apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  selector:
    app: my-app
  # 流量自动分布在 Bun 和 Node 实例之间
```

**灰度发布步骤**

```
1. 部署 1 个 Bun 实例 + 9 个 Node 实例（10% Bun）
2. 监控 30 分钟：错误率、延迟、资源使用
3. 如果没有问题，增加到 3 Bun + 7 Node（30% Bun）
4. 再次监控 30 分钟
5. 增加到 5 Bun + 5 Node（50% Bun）
6. 最终 10 Bun + 0 Node（100% Bun）
```

### 可观测性

**为什么需要**

迁移过程中，可观测性是发现问题的关键。你需要知道 Bun 运行时是否正常工作，性能是否达标。

**三大支柱**

1. **日志（Logging）**：结构化日志，包含运行时标识

```typescript
import pino from "pino";
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  mixin() {
    return {
      runtime: typeof Bun !== "undefined" ? "bun" : "node",
      runtime_version: typeof Bun !== "undefined" ? Bun.version : process.version,
    };
  },
});
```

2. **指标（Metrics）**：关键性能指标

```typescript
// 收集运行时指标
const metrics = {
  memory: process.memoryUsage(),
  cpu: process.cpuUsage(),
  uptime: process.uptime(),
  eventLoopLag: performance.now() - Date.now(),
};
```

3. **追踪（Tracing）**：分布式追踪

```typescript
import { trace } from "@opentelemetry/api";
const tracer = trace.getTracer("my-app");
const span = tracer.startSpan("migration-health-check");
span.setAttribute("runtime", "bun");
span.end();
```

## 6. 深入理解：迁移实战指南与进阶策略

### 6.1 大规模项目的迁移策略

对于拥有数十个微服务的大型项目，迁移到 Bun 需要更加系统化的策略。简单的"逐个迁移"方法可能不够高效，需要考虑依赖关系和服务拓扑。

**迁移优先级排序**

在大规模项目中，服务的迁移优先级应该基于以下因素综合评估：

1. **依赖复杂度**：依赖越少的服务，迁移风险越低，应该优先迁移。依赖深度的计算公式为：依赖深度 = 直接依赖数 + 间接依赖数。依赖深度低于 50 的服务适合作为首批迁移目标。

2. **流量敏感度**：流量较低的服务（如后台任务处理、管理 API）的迁移风险较低，应该优先迁移。流量敏感度可以通过服务的请求量、数据处理量和对延迟的要求来评估。

3. **业务关键度**：非关键业务服务（如内部工具、辅助服务）适合作为试点。业务关键度可以通过服务故障对用户的影响范围来评估。

4. **团队熟悉度**：团队最熟悉的服务的迁移效率最高。因为团队对这些服务的代码、依赖和行为模式有深入理解，能够快速识别和解决兼容性问题。

基于以上因素，推荐的迁移优先级排序是：内部工具 → 辅助服务 → 非关键 API → 关键 API → 核心数据服务。

**依赖拓扑分析**

在迁移前，对服务的依赖拓扑进行系统分析，可以避免"依赖链断裂"问题。依赖拓扑分析包括以下步骤：

1. **构建依赖图**：使用工具（如 depcruise、madge）生成项目的依赖关系图。依赖图应该包括直接依赖和间接依赖。

2. **识别关键路径**：找出依赖图中的关键路径——即被最多服务依赖的包。这些包的兼容性直接影响多个服务的迁移。

3. **处理共享依赖**：如果多个服务共享同一个依赖，需要确保该依赖在所有服务中都能兼容。如果某个共享依赖不兼容，需要先解决共享依赖的问题，再迁移依赖它的服务。

**批量迁移的协调**

在大规模项目中，多个服务可能同时进行迁移。这需要协调不同团队的工作，避免互相阻塞：

1. **建立迁移日历**：为每个服务规划迁移时间窗口，确保关键依赖的迁移先于依赖它们的服务。

2. **设置里程碑**：将迁移过程分为多个里程碑，每个里程碑有明确的目标和验收标准。例如，里程碑一是"所有内部工具迁移完成"，里程碑二是"50% 的非关键 API 迁移完成"。

3. **定期同步会议**：每周召开迁移同步会议，各个团队报告迁移进度、遇到的问题和阻塞项。对于跨团队的兼容性问题，在同步会议上协调解决。

### 6.2 双轨运行的流量管理技术

双轨并行期间，流量管理是确保用户体验不下降的关键。以下是几种流量管理技术。

**基于权重的流量分配**

最简单的流量管理方式是基于权重的随机分配。负载均衡器根据配置的权重，将一定比例的流量发送到 Bun 实例，其余流量发送到 Node.js 实例。

```nginx
# nginx 权重分配
upstream backend {
    server node-app:3000 weight=90;  # 90% 流量到 Node.js
    server bun-app:3000 weight=10;   # 10% 流量到 Bun
}
```

权重分配的优势在于简单易用，但缺点是无法控制"哪些用户"的流量被分配到 Bun。这可能导致同一个用户的多次请求被分配到不同的运行时，如果两个运行时的行为存在差异，用户可能会体验到不一致的表现。

**基于 Cookie 的流量分配**

为了解决权重分配的缺点，可以使用基于 Cookie 的流量分配。负载均衡器根据请求中的 Cookie 值决定将请求发送到哪个运行时。

```nginx
# nginx 基于 Cookie 的分配
upstream backend {
    server node-app:3000;
    server bun-app:3000;
}

map $cookie_runtime $backend {
    default "node-app:3000";
    "bun" "bun-app:3000";
}

server {
    location / {
        proxy_pass http://$backend;
    }
}
```

基于 Cookie 的分配确保同一个用户的所有请求都被发送到同一个运行时，提供一致的体验。这种方式的缺点是需要在应用层面设置 Cookie，增加了代码侵入性。

**基于请求头的流量分配**

对于 API 服务，可以使用自定义请求头来控制流量分配。这种方式适合内部测试场景——测试工具在请求中添加特定的 Header，将请求路由到 Bun 实例。

```nginx
# nginx 基于 Header 的分配
map $http_x_runtime $backend {
    default "node-app:3000";
    "bun" "bun-app:3000";
}
```

测试工具可以这样发送请求：

```bash
# 测试请求路由到 Bun
curl -H "X-Runtime: bun" https://api.example.com/users

# 正常请求路由到 Node.js
curl https://api.example.com/users
```

**基于地域的流量分配**

对于全球部署的应用，可以基于请求来源地域进行流量分配。先在延迟影响较小的区域启用 Bun，验证稳定后再逐步扩展到其他区域。

```nginx
# nginx 基于地域的分配
geo $country {
    default     "node-app:3000";
    JP          "bun-app:3000";   # 日本区域先切换到 Bun
    SG          "bun-app:3000";   # 新加坡区域也切换到 Bun
}
```

### 6.3 迁移后的持续优化

迁移到 Bun 不是终点，而是持续优化的起点。迁移完成后，团队应该关注以下优化方向。

**利用 Bun 原生 API 优化性能**

迁移完成后，团队可以逐步将代码中通过兼容层使用的 Node.js API 替换为 Bun 原生 API。这可以进一步释放 Bun 的性能潜力。

```typescript
// 迁移第一阶段：通过兼容层运行（确保功能正确）
import fs from "fs";
const content = fs.readFileSync("file.txt", "utf-8");

// 迁移第二阶段：使用 Bun 原生 API（释放性能）
const content = await Bun.file("file.txt").text();
```

替换策略建议：先替换热点代码（高频调用的 API），后替换冷门代码。每次替换后都需要运行性能基准测试，确认性能提升。

**利用 Bun 内置工具简化工具链**

Bun 内置了包管理器、测试框架、打包器和运行时的完整工具链。迁移完成后，团队可以移除项目中的冗余工具。

```json
{
  "devDependencies": {
    // 迁移后可以移除的依赖
    // "typescript": "...",   // Bun 原生支持 TypeScript
    // "ts-node": "...",      // Bun 可以直接运行 TS
    // "jest": "...",         // bun test 兼容 Jest API
    // "ts-jest": "...",      // 不需要
    // "@types/node": "...",  // Bun 内置类型
    // "nodemon": "...",      // bun --watch
    // "rimraf": "...",       // rm -rf
    // "cross-env": "...",    // 直接设置环境变量
    // "webpack": "...",      // bun build
    // "esbuild": "...",      // bun build
    
    // 需要保留的依赖
    "eslint": "...",         // Bun 不内置 linter
    "prettier": "...",       // Bun 不内置 formatter
    "typescript": "..."      // 如果需要进行类型检查
  }
}
```

**持续监控和调优**

迁移后的持续监控包括以下方面：

1. **性能趋势监控**：使用监控工具（如 Grafana、Datadog）追踪关键性能指标的趋势。如果发现性能下降，及时进行根因分析。

2. **Bun 版本更新**：关注 Bun 的新版本发布，评估新版本中的性能改进和兼容性修复。建议每个季度评估一次 Bun 版本升级。

3. **代码质量检查**：定期审查代码，识别和替换仍然使用 Node.js 兼容层的代码。目标是逐步将所有代码迁移到 Bun 原生 API。

4. **团队知识积累**：建立团队内部的 Bun 知识库，记录迁移经验、最佳实践和已知问题。新加入团队的成员可以通过知识库快速上手。

### 6.4 迁移后的团队工作流程调整

迁移到 Bun 后，团队的工作流程需要做相应的调整。

**开发流程调整**

```bash
# 新的开发流程

# 1. 本地开发（使用 Bun）
bun run dev              # 启动开发服务器（--watch 模式）
bun test --watch         # 运行测试（监听模式）

# 2. 代码提交前检查
bun run typecheck        # 类型检查（如果使用 tsc）
bunx eslint src/         # Lint 检查
bun test                 # 运行测试

# 3. CI/CD 流程
bun install --frozen-lockfile
bun test --coverage
bun run build
```

**代码审查重点**

在代码审查中，需要特别关注以下 Bun 相关的问题：

1. **是否使用了 Bun 不兼容的 API？** 审查代码中是否引入了新的 Node.js API 调用，这些 API 是否在 Bun 中兼容。

2. **是否充分利用了 Bun 的优势？** 审查代码是否可以通过使用 Bun 原生 API 获得性能提升。

3. **是否保持了跨运行时兼容性？** 如果项目需要同时支持 Bun 和 Node.js，审查代码是否使用了合适的抽象层。

**团队培训持续化**

迁移完成后，团队培训不应停止。建议定期组织以下活动：

1. **Bun 新特性分享会**：每月一次，分享 Bun 新版本中的重要特性和改进。

2. **性能调优工作坊**：每季度一次，分享 Bun 性能调优的最佳实践和案例。

3. **兼容性知识分享**：不定期分享新发现的兼容性问题和解决方案。

## 6. 深入理解：迁移实战指南与进阶策略

### 6.1 大规模项目的迁移策略

对于拥有数十个微服务的大型项目，迁移到 Bun 需要更加系统化的策略。简单的逐个迁移方法可能不够高效，需要考虑依赖关系和服务拓扑。在大规模项目中，服务的迁移优先级应该基于依赖复杂度、流量敏感度、业务关键度和团队熟悉度这四个因素综合评估。依赖复杂度越低的服务迁移风险越低，应该优先迁移。流量越低的服务迁移风险也越低，应该优先迁移。非关键业务服务适合作为试点。团队最熟悉的服务的迁移效率最高，因为团队对这些服务的代码和行为模式有深入理解，能够快速识别和解决兼容性问题。基于以上因素，推荐的迁移优先级排序是：内部工具优先迁移，然后是辅助服务，接着是非关键 API，再是关键 API，最后是核心数据服务。

在迁移前，对服务的依赖拓扑进行系统分析，可以避免依赖链断裂问题。依赖拓扑分析包括以下步骤：首先构建依赖图，使用工具如 depcruise 或 madge 生成项目的依赖关系图。依赖图应该包括直接依赖和间接依赖。然后识别关键路径，找出依赖图中被最多服务依赖的包，这些包的兼容性直接影响多个服务的迁移。最后处理共享依赖，如果多个服务共享同一个依赖，需要确保该依赖在所有服务中都能兼容。如果某个共享依赖不兼容，需要先解决共享依赖的问题，再迁移依赖它的服务。

在大规模项目中，多个服务可能同时进行迁移，这需要协调不同团队的工作，避免互相阻塞。首先建立迁移日历，为每个服务规划迁移时间窗口，确保关键依赖的迁移先于依赖它们的服务。然后设置里程碑，将迁移过程分为多个里程碑，每个里程碑有明确的目标和验收标准。最后定期召开迁移同步会议，各个团队报告迁移进度、遇到的问题和阻塞项，对于跨团队的兼容性问题在同步会议上协调解决。

### 6.2 双轨运行的流量管理技术

双轨并行期间，流量管理是确保用户体验不下降的关键。基于权重的随机分配是最简单的流量管理方式，负载均衡器根据配置的权重将一定比例的流量发送到 Bun 实例，其余流量发送到 Node.js 实例。权重分配的优势在于简单易用，但缺点是无法控制哪些用户的流量被分配到 Bun，这可能导致同一个用户的多次请求被分配到不同的运行时，如果两个运行时的行为存在差异，用户可能会体验到不一致的表现。

为了解决权重分配的缺点，可以使用基于 Cookie 的流量分配。负载均衡器根据请求中的 Cookie 值决定将请求发送到哪个运行时，确保同一个用户的所有请求都被发送到同一个运行时，提供一致的体验。这种方式的缺点是需要在应用层面设置 Cookie，增加了代码侵入性。

对于 API 服务，可以使用自定义请求头来控制流量分配。这种方式适合内部测试场景，测试工具在请求中添加特定的 Header，将请求路由到 Bun 实例。测试工具可以通过添加 X-Runtime: bun 这样的请求头来指定使用 Bun 运行时。

对于全球部署的应用，可以基于请求来源地域进行流量分配。先在延迟影响较小的区域启用 Bun，验证稳定后再逐步扩展到其他区域。例如先在日本和新加坡区域切换到 Bun，验证稳定后再扩展到欧洲和北美区域。

### 6.3 迁移后的持续优化

迁移到 Bun 不是终点，而是持续优化的起点。迁移完成后，团队可以逐步将代码中通过兼容层使用的 Node.js API 替换为 Bun 原生 API，这可以进一步释放 Bun 的性能潜力。替换策略建议先替换热点代码即高频调用的 API，后替换冷门代码。每次替换后都需要运行性能基准测试，确认性能提升。

Bun 内置了包管理器、测试框架、打包器和运行时的完整工具链。迁移完成后，团队可以移除项目中的冗余工具，包括 typescript 因为 Bun 原生支持 TypeScript，ts-node 因为 Bun 可以直接运行 TypeScript 文件，jest 因为 bun test 兼容 Jest API，nodemon 因为 bun --watch 提供了类似功能，webpack 因为 bun build 提供了打包能力。

迁移后的持续监控包括以下方面：首先是性能趋势监控，使用监控工具追踪关键性能指标的趋势，如果发现性能下降及时进行根因分析。其次是 Bun 版本更新，关注 Bun 的新版本发布，评估新版本中的性能改进和兼容性修复，建议每个季度评估一次 Bun 版本升级。然后是代码质量检查，定期审查代码，识别和替换仍然使用 Node.js 兼容层的代码，目标是逐步将所有代码迁移到 Bun 原生 API。最后是团队知识积累，建立团队内部的 Bun 知识库，记录迁移经验、最佳实践和已知问题，新加入团队的成员可以通过知识库快速上手。

### 6.4 迁移后的团队工作流程调整

迁移到 Bun 后，团队的工作流程需要做相应的调整。新的开发流程包括：本地开发使用 Bun 的命令行工具，bun run dev 启动开发服务器并启用 watch 模式，bun test --watch 运行测试并监听文件变化。代码提交前需要运行 bun run typecheck 进行类型检查，运行 bunx eslint 进行 Lint 检查，运行 bun test 确保所有测试通过。CI/CD 流程使用 bun install --frozen-lockfile 安装依赖，使用 bun test --coverage 运行测试并生成覆盖率报告，使用 bun run build 构建应用。

在代码审查中，需要特别关注是否使用了 Bun 不兼容的 API，审查代码中是否引入了新的 Node.js API 调用，这些 API 是否在 Bun 中兼容。同时要检查是否充分利用了 Bun 的优势，代码是否可以通过使用 Bun 原生 API 获得性能提升。如果项目需要同时支持 Bun 和 Node.js，还需要检查代码是否使用了合适的抽象层来保持跨运行时兼容性。

迁移完成后，团队培训不应停止。建议定期组织 Bun 新特性分享会，每月一次分享 Bun 新版本中的重要特性和改进。定期组织性能调优工作坊，每季度一次分享 Bun 性能调优的最佳实践和案例。不定期分享兼容性知识，分享新发现的兼容性问题和解决方案。

### 6.5 迁移过程中常见陷阱与避免方法

在迁移过程中，有一些常见的陷阱可能导致迁移失败或延迟。第一个常见陷阱是忽略间接依赖的兼容性。很多团队在评估兼容性时只检查直接依赖，忽略了间接依赖。实际上很多兼容性问题是由间接依赖引起的，例如你的项目可能直接依赖一个纯 JavaScript 包，但这个包可能间接依赖一个 C++ 原生模块。在评估兼容性时需要检查完整的依赖树，而不仅仅是直接依赖。

第二个常见陷阱是测试覆盖率不足。有些团队在迁移后只运行了单元测试，没有运行集成测试和端到端测试。这可能导致某些兼容性问题在测试阶段未被发现，直到生产环境才暴露出来。在迁移后应该运行完整的测试套件，包括单元测试、集成测试、端到端测试和性能测试。

第三个常见陷阱是忽略性能基准测试。有些团队只关注功能兼容性，忽略了性能兼容性。一个包可能在 Bun 上功能正常，但性能比 Node.js 差很多。在迁移前应该建立性能基线，迁移后进行对比，确保性能没有显著下降。

第四个常见陷阱是一性迁移所有服务。最安全的迁移策略是渐进式迁移，先迁移非关键服务，验证稳定后再迁移关键服务。一次性迁移所有服务的风险很高，如果出现问题，回滚的代价也很大。

第五个常见陷阱是没有制定回滚计划。在开始迁移之前就应该制定好回滚计划。如果迁移后出现严重问题，需要能够快速回滚到 Node.js。回滚计划应该包括回滚触发条件、回滚执行步骤和回滚后验证流程。

### 6.6 迁移后的性能基准测试方法

迁移到 Bun 后，进行性能基准测试是验证迁移效果的关键步骤。推荐的性能基准测试方法包括以下步骤：首先确定测试场景，选择项目中最核心的几个操作作为测试场景，如 API 请求处理、数据库查询、文件操作和依赖安装。然后建立测试环境，确保测试环境与生产环境尽可能一致，包括硬件配置、网络条件和数据量。接着收集基线数据，在 Node.js 上运行测试并记录性能数据作为基线。再运行对比测试，在 Bun 上运行相同的测试并记录性能数据。最后分析对比结果，计算 Bun 相比 Node.js 的性能提升百分比，识别性能下降的操作并分析原因。

在性能基准测试中，需要关注的指标包括：请求延迟的 P50、P95 和 P99，每秒请求数（RPS），CPU 使用率，内存使用量，以及 GC 暂停时间。这些指标共同反映了应用在不同维度上的性能表现。

---

## 参考资源

- Bun 官方迁移指南：https://bun.sh/docs/guides/migration
- Bun Node.js 兼容性：https://bun.sh/docs/runtime/nodejs-apis
- Bun Docker 部署：https://bun.sh/docs/guides/deployment/docker

### 6.10 不同项目类型的迁移策略对比
- Bun CI/CD 集成：https://bun.sh/docs/guides/install/ci-cd
- Node.js 到 Bun 迁移清单：https://bun.sh/docs/guides/migration/from-node
- OpenTelemetry JavaScript 文档：https://opentelemetry.io/docs/instrumentation/js/
- Kubernetes Canary 部署：https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#canary-deployment

### 6.7 迁移后的常见问题排查指南

迁移到 Bun 后团队可能会遇到一些常见问题，掌握这些问题排查方法可以加快问题解决速度。第一类问题是启动失败，应用在 Bun 上启动失败通常由以下原因导致：依赖安装不完整，解决方案是删除 node_modules 和 bun.lock 后重新运行 bun install；入口文件使用了 Node.js 特有的 API，解决方案是检查启动代码中是否使用了 process.nextTick 或 require 等 API 并替换为 Bun 兼容的版本；tsconfig.json 中配置了 Bun 不支持的选项，解决方案是简化 tsconfig.json 配置，移除不必要的 compilerOptions。第二类问题是运行时错误，应用启动后在运行过程中出现错误通常由以下原因导致：某个 npm 包在特定代码路径上使用了 Bun 不兼容的 API，解决方案是查看错误堆栈定位到具体的包和代码行，在 Bun 的兼容性文档中查找对应信息；异步操作的行为与 Node.js 不同，解决方案是检查 Promise 链、事件监听和定时器的使用方式；文件路径处理差异，解决方案是使用 path 模块处理路径，避免直接拼接字符串。第三类问题是性能异常，迁移后性能不如预期通常由以下原因导致：代码仍然通过兼容层使用 Node.js API 而非 Bun 原生 API，解决方案是识别并替换热点路径上的 Node.js API 调用；依赖的某个包在 Bun 上性能较差，解决方案是寻找该包的 Bun 优化版本或替代包；GC 配置不适合当前工作负载，解决方案是调整代码以减少对象分配。第四类问题是 Docker 构建失败，Docker 构建失败通常由以下原因导致：Dockerfile 中使用了 node 基础镜像而非 oven/bun 镜像，解决方案是替换基础镜像；多阶段构建中缓存配置不当导致每次构建都重新下载依赖，解决方案是优化 Dockerfile 的层顺序，先复制依赖文件安装依赖再复制源代码；Volume 挂载性能问题导致构建缓慢，解决方案是使用 delegated 或 cached 模式挂载。第五类问题是 CI/CD 流水线失败，CI/CD 流水线失败通常由以下原因导致：GitHub Actions 中使用了 setup-node 而非 setup-bun，解决方案是替换为 oven-sh/setup-bun；缓存配置不正确导致每次运行都重新安装依赖，解决方案是配置 Bun 的缓存路径；锁文件冲突导致安装失败，解决方案是删除 bun.lock 后重新运行 bun install。

### 6.8 团队协作与知识管理

迁移到 Bun 后，团队需要建立新的协作模式和知识管理体系。代码审查方面需要建立 Bun 相关的审查清单，包括是否使用了不兼容的 API、是否充分利用了 Bun 的原生能力、是否保持了良好的代码风格。知识库建设方面需要建立团队内部的 Bun 知识库，记录常见问题解决方案、性能调优经验、兼容性问题和替代方案。团队成员可以通过知识库快速学习和解决问题。经验分享方面定期组织 Bun 技术分享会，让团队成员分享使用 Bun 的经验和心得，包括成功案例和失败教训。这样可以促进团队整体技术水平的提升。新人培训方面建立 Bun 的新人培训计划，让新加入的团队成员能够快速上手 Bun 开发。培训内容包括 Bun 基础使用、常见问题排查、性能调优入门等。


### 6.9 迁移案例深度分析：从评估到上线的完整流程

本节通过一个完整的迁移案例来展示从评估到上线的全过程。假设我们有一个电商平台的订单服务需要从 Node.js 迁移到 Bun，该服务有 15 个直接依赖、80 个间接依赖、50 个 API 端点和 200 个测试用例。迁移过程分为六个阶段。

第一阶段是兼容性评估，耗时两天。使用兼容性扫描工具分析所有依赖，发现三个不兼容依赖：bcrypt 需要替换为 bcryptjs，node-sass 不需要因为项目不使用 Sass，sharp 需要替换为 jimp。其余依赖包括 express、ioredis、pg、pino 等全部兼容。评估结果认为迁移可行，预计需要修改约 5% 的代码。

第二阶段是本地环境迁移，耗时一天。安装 Bun 并配置开发环境，将 package.json 中的脚本从 node 命令改为 bun 命令，将 bcrypt 替换为 bcryptjs。运行测试发现 196 个测试通过、4 个测试失败。失败的测试都与文件上传有关，因为项目中使用 multer 处理文件上传。解决方案是将 multer 替换为直接使用 req.formData API。

第三阶段是 CI/CD 流水线迁移，耗时半天。将 GitHub Actions 中的 setup-node 替换为 oven-sh/setup-bun，将 npm install 替换为 bun install，将 npm test 替换为 bun test，将 npx tsc 替换为 bun run build。配置 Bun 缓存以加速依赖安装。运行 CI 流水线，所有步骤通过。

第四阶段是 Docker 构建迁移，耗时半天。将 Dockerfile 中的 node:20-alpine 替换为 oven/bun:alpine，将 npm ci 替换为 bun install --frozen-lockfile，将 CMD 从 node 改为 bun run。构建镜像，镜像体积从 180MB 降低到 120MB，构建时间从 60 秒降低到 15 秒。

第五阶段是灰度发布，耗时一周。在 Kubernetes 集群中部署一个 Bun 实例和九个 Node.js 实例，将 10% 的流量路由到 Bun 实例。监控错误率、延迟和资源使用。第一天发现 Bun 实例的错误率略高，定位到原因是 ioredis 的连接池配置需要调整。调整后将 Bun 实例增加到三个，流量提升到 30%。监控两天后没有发现问题，逐步将 Bun 实例增加到十个，流量提升到 100%。

第六阶段是性能验证和持续优化，耗时两周。使用性能基准测试工具对比迁移前后的性能，发现以下改进：API 响应延迟降低 40%，从平均 45ms 降低到 27ms；吞吐量提升 60%，从 2200 RPS 提升到 3500 RPS；依赖安装时间降低 90%，从 45 秒降低到 4 秒；Docker 构建时间降低 75%，从 60 秒降低到 15 秒；内存使用降低 35%，从 180MB 降低到 117MB。迁移完成后团队继续优化代码，将热点路径上的 fs.readFileSync 替换为 Bun.file 的 text 方法，将 Express 路由逐步替换为 Bun.serve，进一步提升了性能。

### 6.11 迁移工具与自动化

为了简化迁移过程，社区提供了多种迁移辅助工具。bunx npm-check-updates 可以检查并更新过时的依赖包，减少迁移过程中的兼容性问题。bunx caniuse-bun 可以扫描项目中的依赖并报告兼容性状态，帮助团队评估迁移可行性。bunx jest-to-bun 可以自动将 Jest 配置和测试文件转换为 bun test 格式，减少手动迁移的工作量。在 CI/CD 中，可以使用 bun lint 和 bun format 替代 eslint 和 prettier，进一步简化工具链。自动化迁移脚本可以批量处理常见的迁移任务，如 package.json 脚本替换、导入路径修改和配置文件转换。建议在迁移初期就建立自动化测试套件，确保每次修改后都能快速验证功能正确性。

### 6.12 迁移决策框架

是否迁移到 Bun 应该基于系统化的评估框架，而非盲目追随技术潮流。决策框架包括以下维度：首先是性能需求评估，分析当前应用在 Node.js 上的性能瓶颈，判断 Bun 的性能优势是否能解决这些问题。其次是兼容性评估，扫描项目的依赖树，计算完全兼容、部分兼容和不兼容的依赖比例。兼容性评分高于 90% 的项目适合立即迁移，介于 70% 到 90% 之间的项目需要谨慎评估，低于 70% 的项目建议等待 Bun 生态进一步成熟。再次是团队准备度评估，评估团队对 Bun 的熟悉程度和学习成本，确保团队有足够的资源完成迁移。最后是业务影响评估，评估迁移对业务的影响，包括迁移期间的开发效率下降、可能的服务中断风险和长期维护成本变化。综合这四个维度的评估结果，可以做出是否迁移、何时迁移和如何迁移的决策。

### 迁移回滚的经验教训与最佳实践

在实际的迁移项目中，回滚并不罕见。以下是一些从真实项目中总结的经验教训。第一个教训是不要在周五下午进行迁移，因为迁移完成后需要密切监控至少 24 小时，如果选择在周五下午迁移，团队可能需要在周末加班处理问题。建议选择在周一或周二上午进行迁移。第二个教训是回滚计划需要在迁移开始前编写和测试，很多团队在迁移前制定了回滚计划但没有实际测试过，结果在真正需要回滚时发现步骤有问题。建议在迁移前的维护窗口中完整演练一次回滚流程。第三个教训是回滚后需要进行根因分析，很多团队在回滚后没有进行充分的分析就进行第二次迁移，结果遇到相同的问题。建议在回滚后组织复盘会议，分析根本原因后再进行第二次迁移。第四个教训是建立自动化回滚机制，当检测到预定义的异常指标时自动触发回滚，减少人工响应时间。第五个教训是保持双轨并行的时间足够长，在 Bun 处理 100% 流量后至少保持 Node.js 实例一周，确保经过充分验证后再下线 Node.js 实例。第六个教训是迁移过程中需要保持完整的文档记录，包括每次修改的内容、修改的原因、测试结果和发现的问题。完整的文档可以帮助团队在回滚时快速定位问题，也可以为后续的迁移提供参考。第七个教训是不要低估测试的工作量，迁移后的测试需要覆盖功能正确性、性能表现和兼容性三个维度，每个维度都需要充分的测试用例和测试数据。第八个教训是建立迁移的退出标准，在开始迁移之前就明确什么条件下可以宣布迁移成功、什么条件下需要回滚。明确的退出标准可以避免团队在迁移过程中陷入无休止的调试和优化。迁移成功的主要标志包括：所有功能测试通过、性能指标达到或超过 Node.js 基线、错误率不高于迁移前水平、内存使用和 CPU 使用在预期范围内。当这些条件全部满足且稳定运行一周后，可以正式宣布迁移成功。回滚的主要触发条件包括：关键功能出现回归、性能下降超过 20%、错误率持续高于迁移前水平、内存泄漏导致 OOM 或 CPU 使用率持续超过 80%。当这些条件中的任意一项出现时，应该立即启动回滚流程。

