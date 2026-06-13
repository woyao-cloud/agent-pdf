# 第7章 CLI 命令行工具

## 7.1 使用场景

CLI（Command Line Interface）命令行工具是 Node.js 生态系统中最常见的应用形态之一。从 npm、yarn 到 eslint、prettier，大量开发者日常使用的工具都是用 Node.js 编写的。本章将深入讲解如何构建一个专业级别的 CLI 工具。

CLI 工具的主要使用场景包括以下几类：

**脚手架生成工具**是最典型的 CLI 应用。这类工具通过交互式问答或模板参数，快速生成项目骨架代码。代表工具有 create-react-app、vue-cli、express-generator。用户只需执行一条命令，就能获得一个完整配置好的项目结构，避免了繁琐的手动初始化工作。本章示例中的 `my-cli init` 命令就属于此类场景。

**自动化脚本工具**用于执行重复性的开发任务，如代码格式化、lint 检查、测试运行、构建打包等。这类工具通常集成到 CI/CD 流水线中，或在开发者的编辑器中通过脚本触发。CLI 的轻量特性和无 GUI 依赖使其成为自动化场景的理想选择。

**DevOps 工具**在部署、监控和运维领域扮演着重要角色。Node.js CLI 可以封装复杂的云服务 API 调用，提供统一的命令行界面。例如，AWS CDK、Serverless Framework 都是 Node.js CLI 在 DevOps 领域的成功案例。

**项目管理 CLI**帮助团队管理多项目工作空间、版本发布、变更日志生成等工作流程。像 lerna、changesets 这类工具就属于项目管理型 CLI，它们通过标准化的命令接口简化了多包仓库的版本管理流程。

## 7.2 实现原理

### Shebang 与可执行入口

CLI 工具的核心入口是一个可执行脚本。在 Unix/Linux 系统中，脚本文件的第一行使用 shebang `#!/usr/bin/env node` 来指定解释器。这一行的作用是在执行脚本时自动调用 node 程序来解释后续的 JavaScript/TypeScript 代码。

`#!/usr/bin/env node` 比直接写 `#!/usr/bin/node` 更灵活，因为它通过 env 命令在系统 PATH 中查找 node 的位置，兼容 nvm 等版本管理工具安装的 Node.js。

### process.argv 参数解析

当 Node.js 脚本通过命令行调用时，`process.argv` 数组包含了所有命令行参数。数组的前两个元素分别是 Node.js 的路径和脚本文件的路径，后续元素才是用户传入的参数。

```typescript
// process.argv 示例
// node cli.js build --watch
// ['/usr/bin/node', '/path/to/cli.js', 'build', '--watch']
```

直接解析 `process.argv` 虽然可行，但处理复杂参数组合（可选参数、标志位、子命令）时非常繁琐，需要大量的字符串解析代码。因此，实际项目中几乎都会使用成熟的参数解析框架。

### Commander 与 Yargs 框架对比

Node.js 生态中有两个主流的 CLI 框架：Commander 和 Yargs。

**Commander**（本章选用）以简洁的 API 和链式调用风格著称。它的核心概念包括：
- `program.command()` 定义子命令
- `.argument()` 定义位置参数
- `.option()` 定义可选参数
- `.action()` 绑定命令处理函数
- 自动生成 `--help` 帮助信息

**Yargs** 提供了更底层的控制能力，支持自动补全、命令嵌套、中间件等高级特性。它的 API 更接近传统 Unix 命令的设计哲学。

选择建议：小型到中型 CLI 工具推荐 Commander，它的 API 更直观，学习成本低。需要复杂命令结构的工具可以选择 Yargs。

### npm link 本地测试

在开发 CLI 工具时，可以通过 `npm link` 在本地系统注册命令，实现全局可调用：

```bash
cd my-cli
npm link          # 注册 my-cli 命令到全局
my-cli --help     # 直接调用
npm unlink        # 卸载
```

link 的原理是在全局 node_modules 中创建一个符号链接（symlink），指向本地项目的 bin 配置。

### package.json bin 字段

`package.json` 中的 `bin` 字段定义了 CLI 的可执行文件映射：

```json
{
  "bin": {
    "my-cli": "./dist/cli.js"
  }
}
```

键名是命令名称（用户调用的命令），值是相对于包根目录的脚本路径。用户安装此包时，npm 会将该脚本链接到全局 PATH 中。

## 7.3 潜在风险

### 跨平台兼容性

Windows 与 Unix/Linux 在多个方面存在差异，是 CLI 工具最容易踩坑的地方。

**路径分隔符**：Windows 使用反斜杠 `\`，Unix 使用正斜杠 `/`。推荐始终使用 `path` 模块的 `path.join()` 和 `path.resolve()` 来处理路径，而不是直接字符串拼接。Node.js 的 `path` 模块会自动根据当前系统使用正确的分隔符。

**换行符**：Windows 使用 `\r\n`（CRLF），Unix 使用 `\n`（LF）。生成文件时要注意换行符的一致性，尤其是生成脚本文件时。可以在 `.gitattributes` 中配置：

```
* text=auto eol=lf
```

**执行权限**：Unix 系统要求脚本文件有可执行权限（chmod +x），Windows 则依赖文件扩展名。npm link 时会自动处理权限设置，但在手动部署时需要留意。

### 子进程僵尸问题

当 CLI 工具通过 `child_process` 模块创建子进程时，如果父进程异常退出而未等待子进程完成，会产生僵尸进程。长时间运行的子进程还会消耗系统资源。

解决方案：
1. 始终使用 `stdio: 'inherit'` 或正确管理子进程的 stdio 流
2. 为长时间运行的子进程设置超时
3. 在进程退出时清理子进程（监听 `process.on('exit')` 和 `process.on('SIGINT')`）

### 用户输入注入

CLI 工具经常接收用户输入作为命令参数或文件名，这带来了注入风险：

- **命令注入**：不要使用 `eval()` 或动态 `require()` 处理用户输入。将用户输入作为子进程参数传递时，使用 `spawn()` 而非 `exec()`，因为 `spawn()` 接受参数数组，避免 shell 解释。
- **路径遍历**：验证用户提供的路径是否在预期范围内，防止通过 `../` 访问系统敏感文件。
- **模板注入**：生成文件时，确保用户提供的名称经过清理，避免写入恶意内容。

```typescript
// 安全做法：使用 spawn 而非 exec
import { spawn } from 'node:child_process';
spawn('git', ['init'], { cwd: safeDir });

// 不安全做法：exec 会经过 shell 解析
// exec(`git init ${userInput}`, ...);
```

## 7.4 优化策略

### 交互式终端（Inquirer）

Inquirer 是 Node.js 最流行的交互式提示库。它提供多种输入类型：输入框（input）、选择列表（list）、确认（confirm）、多选（checkbox）等。

关键特性：
- **验证（validate）**：在用户提交前校验输入值
- **过滤（filter）**：对用户输入进行预处理
- **默认值（default）**：提供合理的默认选项减少输入负担
- **异步源（source）**：动态加载选项列表

示例中的 `init` 命令使用 inquirer 收集项目名称、模板类型、是否初始化 git 三个参数，提高了用户体验。

### 进度条（Ora）

长时间运行的操作（如下载依赖、构建项目）需要向用户展示进度反馈。Ora 是一个轻量级的 spinner 库，提供多种动画样式。

Ora 的最佳实践：
1. 在操作开始时调用 `spinner.start()` 并设置描述文本
2. 成功时调用 `spinner.succeed()` 显示绿色勾号
3. 失败时调用 `spinner.fail()` 显示红色叉号
4. 需要时调用 `spinner.warn()` 或 `spinner.info()` 显示警告或信息

```typescript
const spinner = ora('Processing...').start();
try {
  await doWork();
  spinner.succeed('Done!');
} catch {
  spinner.fail('Failed!');
}
```

### 彩色输出（Chalk）

Chalk 是最流行的终端着色库。它在保持 API 简洁的同时，自动处理了终端颜色兼容性问题。

```typescript
import chalk from 'chalk';
console.log(chalk.green('Success'));
console.log(chalk.red.bold('Error'));
console.log(chalk.cyan(`Processing ${chalk.yellow(name)}...`));
```

Chalk v5 是 ESM-only 版本，需要在 `type: "module"` 的项目中使用。

### 自动补全

高级 CLI 工具可以提供命令和参数自动补全功能。Commander 通过 `.configureHelp()` 和第三方库支持补全。Zsh 和 Bash 的补全脚本可以通过 `--completion` 命令生成。

## 7.5 典型问题处理

### 子进程超时处理

长时间运行的子进程（如构建工具、测试运行器）需要超时保护。使用 `AbortController` 或定时器实现超时：

```typescript
import { spawn } from 'node:child_process';

function runWithTimeout(cmd: string, args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args);
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Exit code: ${code}`));
    });
  });
}
```

### 管道数据丢失

当 CLI 的输出通过管道传递给另一个命令时，缓冲区的默认大小为 16KB（Node.js 子进程的 `maxBuffer`）。大数据量输出时需要考虑：

1. 使用 `spawn()` 的 `stdio: 'inherit'` 或 `stdio: 'pipe'` 配合流处理
2. 对 `exec()` 设置合理的 `maxBuffer`（默认 1024 * 1024 字节）
3. 大数据场景优先使用流而非缓冲模式

### Windows Git Bash 兼容

在 Windows 系统中，用户可能使用 Git Bash、cmd.exe、PowerShell 或 Windows Terminal 等不同终端。各终端的颜色支持、路径格式都有差异。

兼容策略：
1. 使用 `chalk.level` 检测并适配颜色支持
2. 避免依赖 Unix-specific 命令（如 `rm -rf`，改用 `fs.rmSync`）
3. 路径处理统一使用 Node.js 的 `path` 模块
4. 测试时覆盖 Git Bash 和 cmd.exe 两种环境

## 7.6 开发者技能

### npm link 本地测试

`npm link` 是 CLI 开发的核心工作流。它能模拟用户安装后的使用体验：

```bash
# 在 CLI 项目目录
npm link                    # 注册到全局，相当于全局安装

# 在其他项目测试
npm link my-cli             # 链接全局包到本地项目
my-cli init my-test         # 调用命令

# 清理
npm unlink my-cli           # 移除链接
npm uninstall -g my-cli     # 从全局移除
```

### semver 规范

CLI 工具的版本号遵循语义化版本规范（Semantic Versioning）：`主版本.次版本.补丁`。

- **主版本**：不兼容的 API 修改（breaking changes）
- **次版本**：向下兼容的功能新增
- **补丁**：向下兼容的问题修复

对于 CLI 工具，命令和选项的任何移除或行为变更都属于 breaking change，需要递增主版本号。

### package.json bin 字段进阶

除了简单的字符串映射，bin 字段还支持对象形式定义多个命令：

```json
{
  "bin": {
    "my-cli": "./dist/cli.js",
    "my-cli-init": "./dist/commands/init.js",
    "my-cli-build": "./dist/commands/build.js"
  }
}
```

每个命令独立注册到全局 PATH。npm 安装时会为每个 bin 条目创建对应的可执行文件链接。

### stdin/stdout/stderr 流处理

理解标准流是 CLI 开发的基础技能：

- **stdin（标准输入）**：读取管道输入，如 `cat data.json | my-cli process`
- **stdout（标准输出）**：输出正常结果，支持管道传递给其他命令
- **stderr（标准错误）**：输出错误和日志信息，不影响主输出流

```typescript
// 从 stdin 读取数据
process.stdin.setEncoding('utf-8');
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

// 输出到 stdout（可管道）和 stderr（仅终端显示）
console.log(result);          // stdout
console.error('Progress...'); // stderr
```

## 7.7 示例代码

本章示例项目 `my-cli` 包含以下关键文件：

**入口文件 src/cli.ts**：使用 Commander 框架定义 CLI 结构和子命令。`program.name()` 设置命令名称，`.version()` 设置版本号，`.command()` 注册子命令。Commander 自动生成 `--help` 输出，无需手动维护帮助文档。

**init 命令 src/commands/init.ts**：结合 inquirer 的交互式提示和 ora 的进度反馈。Inquirer 收集用户输入的三个参数（项目名称、模板类型、是否初始化 git），ora 在执行文件操作时提供视觉反馈。模板生成逻辑包括创建目录、写入 package.json、生成入口文件、可选创建 tsconfig 和初始化 git 仓库。

**build 命令 src/commands/build.ts**：使用 chalk 进行彩色输出，ora 显示构建进度。通过 `child_process` 的 `execSync` 调用 TypeScript 编译器。`--watch` 选项启用监听模式，使用 `stdio: 'inherit'` 展示编译器实时输出。

**测试文件 tests/cli.test.ts**：使用 execa 库在子进程中执行 CLI 并验证输出。Execa 相比原生 child_process 提供了更友好的 Promise API 和更好的错误处理。测试覆盖了 `--help`、`--version`、子命令帮助等核心场景。

## 7.8 Docker Compose

多版本 Node.js 兼容性测试是 CLI 发布前的重要环节。Docker Compose 可以轻松创建隔离的测试环境：

```yaml
services:
  cli-test-18:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - .:/app
    command: node /app/dist/cli.js --help

  cli-test-20:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - .:/app
    command: node /app/dist/cli.js --help
```

使用方法：

```bash
# 先构建 TypeScript 项目
npm run build

# 测试所有 Node.js 版本
docker compose up --abort-on-container-exit

# 测试特定版本
docker compose run --rm cli-test-20
```

Docker 测试的优势在于：
1. 无需本地安装多个 Node.js 版本
2. 测试环境干净隔离，不受本地配置影响
3. 可以集成到 CI/CD 流水线中自动化执行
4. 使用 Alpine 镜像体积小，启动速度快

---

本章通过完整的 `my-cli` 项目示例，覆盖了 CLI 工具从设计、实现、测试到发布的完整流程。理解命令注册、参数解析、交互式提示、进度反馈、跨平台兼容等核心技术后，读者可以快速搭建自己的专业 CLI 工具。