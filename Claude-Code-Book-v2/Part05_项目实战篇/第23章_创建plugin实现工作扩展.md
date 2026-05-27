# 第23章：创建 Plugin 实现工作扩展

## 章节概述

本章介绍如何开发 Claude Code Plugin——一种基于编程 API 的扩展机制，允许在 Claude Code 的工作流中注入自定义行为。与第 22 章的 Skill（基于文本指令）不同，Plugin 通过 JavaScript/TypeScript 代码实现钩子函数，可以拦截事件、修改行为、集成外部系统。我们将开发一个"命令日志 Plugin"，展示 Plugin API 使用、事件钩子、生命周期管理和分发部署的完整流程。

## 学习目标

- 理解 Plugin 架构和 API
- 掌握 Plugin 生命周期管理
- 学会使用事件钩子系统
- 能够发布和分发 Plugin

## 核心知识点

### 1. Plugin 架构

#### Plugin 系统概览

Plugin 是 Claude Code 的编程级扩展机制，它通过钩子（Hooks）在 Claude Code 的生命周期事件中插入自定义逻辑。

Plugin 的能力范围：

| 能力 | 说明 | 示例 |
|------|------|------|
| 事件监听 | 监听 Claude Code 生命周期事件 | 命令执行前后、文件读写前后 |
| 行为修改 | 修改或增强 Claude Code 的默认行为 | 自定义输出格式、添加安全检查 |
| 外部集成 | 与外部系统交互 | 发送消息到 Slack、记录日志到数据库 |
| 数据持久化 | 存储和读取插件配置 | 保存用户偏好设置 |
| UI 扩展 | 贡献自定义界面元素 | 添加状态栏图标、自定义面板 |

#### API 接口说明

Plugin 的核心 API 围绕生命周期钩子和上下文对象展开：

```typescript
// Plugin 入口文件 (index.ts)
import type { PluginAPI } from "@anthropic/claude-code-plugin-api";

// Plugin 配置
interface PluginConfig {
  name: string;
  version: string;
  description: string;
}

// 插件主函数，接收 PluginAPI 实例
export function activate(api: PluginAPI, config: PluginConfig) {
  // 在此注册钩子

  // 返回 deactivate 函数用于清理
  return {
    deactivate() {
      // 清理资源
    },
  };
}
```

#### 权限模型

Plugin 运行在沙箱环境中，权限分级控制：

```json
{
  "name": "command-logger",
  "version": "1.0.0",
  "permissions": [
    "workspace:read",
    "workspace:write",
    "network:connect",
    "ui:notifications"
  ]
}
```

权限类型：
- **workspace:read**: 读取工作区文件
- **workspace:write**: 写入工作区文件（更高权限）
- **network:connect**: 发起网络请求
- **ui:notifications**: 显示通知
- **ui:statusbar**: 修改状态栏
- **clipboard:read**: 读取剪贴板
- **clipboard:write**: 写入剪贴板

用户安装 Plugin 时会看到请求的权限列表，确认后才激活。这避免了恶意 Plugin 窃取数据。

#### 沙箱机制

Plugin 在独立的进程中运行，与 Claude Code 主进程隔离：

- **进程隔离**: Plugin 崩溃不会影响 Claude Code 主进程
- **文件系统限制**: 只能访问 permissions 中声明的文件区域
- **网络限制**: 只有声明了 network:connect 权限的 Plugin 才能发送网络请求
- **超时控制**: 长时间运行的钩子会被强制中断（默认 10 秒）
- **资源限制**: 内存和 CPU 使用量受限

### 2. 生命周期管理

#### 初始化与加载

Plugin 的加载流程：

```
Claude Code 启动
  → 扫描 Plugin 目录
  → 读取每个 plugin.json
  → 验证权限声明
  → 加载 Plugin 代码（沙箱进程）
  → 调用 activate() 函数
  → Plugin 就绪
```

plugin.json 是 Plugin 的元数据文件：

```json
{
  "name": "command-logger",
  "displayName": "Command Logger",
  "version": "1.0.0",
  "description": "Logs all Claude Code commands to a file for auditing",
  "main": "dist/index.js",
  "permissions": ["workspace:write", "ui:notifications"],
  "activationEvents": ["onCommand:*"]
}
```

字段说明：
- **name**: Plugin 唯一标识符（使用 kebab-case）
- **displayName**: 在 UI 中显示的名称
- **main**: 入口文件路径
- **permissions**: 所需权限列表
- **activationEvents**: 触发 Plugin 激活的事件列表，onCommand:* 表示任意命令执行时激活

#### 激活与停用

Plugin 的激活和停用通过 activate/deactivate 函数管理：

```typescript
import type { PluginAPI, PluginConfig } from "@anthropic/claude-code-plugin-api";
import fs from "fs";
import path from "path";

interface CommandLogEntry {
  timestamp: string;
  command: string;
  args: string[];
  cwd: string;
  duration: number;
  success: boolean;
}

export function activate(api: PluginAPI, config: PluginConfig) {
  const logDir = path.join(api.workspace.rootPath, ".claude-logs");
  const logFile = path.join(logDir, "command-history.jsonl");
  const MAX_LOG_SIZE = 50 * 1024 * 1024; // 50 MB

  // 确保日志目录存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 注册命令执行后钩子
  const disposable = api.hooks.onDidExecuteCommand(async (event) => {
    const entry: CommandLogEntry = {
      timestamp: new Date().toISOString(),
      command: event.command,
      args: event.args,
      cwd: event.cwd,
      duration: event.duration,
      success: event.exitCode === 0,
    };

    // 写入日志文件
    const line = JSON.stringify(entry) + "\n";

    // 检查日志文件大小，超过限制则轮转
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_SIZE) {
        const rotated = logFile + "." + Date.now();
        fs.renameSync(logFile, rotated);
      }
      fs.appendFileSync(logFile, line, "utf-8");
    } catch (err) {
      console.error("Command Logger: Failed to write log:", err);
    }
  });

  // 返回清理函数
  return {
    deactivate() {
      disposable.dispose();
    },
  };
}
```

#### 配置管理

Plugin 可以定义配置项，用户可以通过 Claude Code 的设置界面修改：

```json
{
  "name": "command-logger",
  "contributes": {
    "configuration": {
      "title": "Command Logger",
      "properties": {
        "commandLogger.logLevel": {
          "type": "string",
          "enum": ["all", "errors-only", "disabled"],
          "default": "all",
          "description": "Which commands to log"
        },
        "commandLogger.maxLogSizeMB": {
          "type": "number",
          "default": 50,
          "minimum": 1,
          "maximum": 500,
          "description": "Maximum log file size in MB before rotation"
        },
        "commandLogger.excludeCommands": {
          "type": "array",
          "items": { "type": "string" },
          "default": [],
          "description": "Commands to exclude from logging"
        }
      }
    }
  }
}
```

在代码中读取配置：

```typescript
const logLevel = api.config.get("commandLogger.logLevel", "all");
const excludeList = api.config.get("commandLogger.excludeCommands", []);
```

#### 资源清理

Plugin 停用时必须清理所有占用资源，防止内存泄漏：

```typescript
export function activate(api: PluginAPI) {
  const timers: NodeJS.Timeout[] = [];
  const fileHandles: fs.WriteStream[] = [];

  // 所有定时器需要追踪
  const interval = setInterval(() => {
    // 定期清理任务
  }, 60000);
  timers.push(interval);

  // 所有文件句柄需要追踪
  const logStream = fs.createWriteStream("plugin.log", { flags: "a" });
  fileHandles.push(logStream);

  return {
    deactivate() {
      // 清理所有定时器
      timers.forEach(clearInterval);
      // 关闭所有文件句柄
      fileHandles.forEach((s) => s.close());
    },
  };
}
```

### 3. 事件钩子系统

#### 预执行钩子

在命令执行前触发，可以修改参数或阻止执行：

```typescript
api.hooks.onWillExecuteCommand(async (event) => {
  console.log(`About to execute: ${event.command}`);

  // 安全检查：阻止危险命令
  const dangerous = ["rm -rf /", "dd if=", ":(){ :|:& };:"];
  const cmdStr = `${event.command} ${event.args.join(" ")}`;
  if (dangerous.some((d) => cmdStr.includes(d))) {
    return { cancelled: true, reason: "Command blocked by security policy" };
  }

  // 可以修改命令参数
  if (event.command === "npm install") {
    event.args.push("--no-audit", "--no-fund");
  }

  return { cancelled: false };
});
```

如果返回 `{ cancelled: true, reason: "..." }`，命令不会执行，并向用户显示阻止原因。

#### 后执行钩子

命令执行后触发，可以获取执行结果：

```typescript
api.hooks.onDidExecuteCommand(async (event) => {
  const status = event.exitCode === 0 ? "SUCCESS" : "FAILED";
  const duration = event.duration.toFixed(0);

  // 检查是否为危险模式（命令失败后自动执行修复）
  if (event.exitCode !== 0 && api.config.get("autoFix", false)) {
    api.commands.execute("claude.fix", {
      command: event.command,
      error: event.stderr,
    });
  }

  // 显示通知（如果耗时过长）
  if (event.duration > 30000) {
    api.notifications.warning(
      `Command "${event.command}" took ${duration}ms`
    );
  }
});
```

#### 自定义事件

Plugin 可以定义和触发自定义事件，其他 Plugin 可以监听：

```typescript
// 定义事件类型
api.events.define("commandLogger:logRotated", {
  properties: {
    oldFile: { type: "string" },
    newFile: { type: "string" },
    size: { type: "number" },
  },
});

// 触发自定义事件
if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_SIZE) {
  const rotated = logFile + "." + Date.now();
  fs.renameSync(logFile, rotated);
  api.events.emit("commandLogger:logRotated", {
    oldFile: logFile,
    newFile: rotated,
    size: MAX_LOG_SIZE,
  });
}

// 其他 Plugin 可以监听
api.events.on("commandLogger:logRotated", (data) => {
  console.log("Log file rotated:", data.oldFile, "->", data.newFile);
});
```

#### 异步处理

所有钩子都支持异步操作，但需要注意超时控制：

```typescript
// 长时间运行的任务使用进度报告
api.hooks.onWillExecuteCommand(async (event) => {
  // 异步执行复杂检查
  const result = await Promise.race([
    performSecurityScan(event),
    timeout(8000),  // 8 秒超时
  ]);

  if (result === "timeout") {
    // 超时后不阻止命令，只记录警告
    api.notifications.warning("Security scan timed out, proceeding anyway");
    return { cancelled: false };
  }

  return result;
});

function timeout(ms: number): Promise<string> {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
}
```

### 4. 分发与维护

#### 打包格式

Plugin 的标准打包格式：

```
command-logger/
├── dist/
│   └── index.js          # 编译后的代码
├── plugin.json           # 元数据
├── README.md             # 文档
├── LICENSE               # 许可证
├── package.json          # npm 依赖
└── node_modules/         # 依赖包（或声明为外部依赖）
```

或者使用 .vsix 格式（VS Code 扩展兼容格式）的压缩包。

#### 安装方式

用户安装 Plugin 的几种方式：

```
# 从本地目录安装
claude plugin install ./command-logger

# 从 npm 包安装
claude plugin install @scope/command-logger

# 从 Git 仓库安装
claude plugin install https://github.com/user/command-logger
```

安装时 Claude Code 会显示权限请求：

```
Plugin "Command Logger" requests the following permissions:
  [x] workspace:write  - Write to workspace files
  [x] ui:notifications - Show notifications

Allow? (Y/n)
```

用户确认后 Plugin 才会激活。

#### 更新机制

Plugin 支持自动更新检查：

```json
{
  "name": "command-logger",
  "version": "1.0.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/command-logger"
  }
}
```

Claude Code 定期检查 `repository` 中的版本信息，如果有新版本则提示用户更新：

```
Update available for "Command Logger": 1.0.0 -> 1.2.0
New features: Support for filtering commands, custom log format
Update now? (Y/n)
```

#### 兼容性管理

Plugin 需要声明其兼容的 Claude Code 版本：

```json
{
  "name": "command-logger",
  "version": "1.0.0",
  "engines": {
    "claude-code": ">=0.5.0 <1.0.0"
  }
}
```

如果用户安装的 Claude Code 版本不在声明范围内，Plugin 不会加载，并显示兼容性错误信息。

## 实战练习

### 完整项目步骤

**目标**: 开发一个"安全审查 Plugin"，在 Claude Code 执行可能危险的操作（删除文件、修改权限、执行外部命令）时弹出警告并需要用户确认。

**步骤 1**: 创建项目结构

```
mkdir security-guard-plugin
cd security-guard-plugin
npm init -y
npm install @anthropic/claude-code-plugin-api
mkdir src
```

**步骤 2**: 让 Claude Code 生成 Plugin 代码

```
请帮我创建一个安全审查 Plugin。
功能要求：
1. 监听 onWillExecuteCommand 钩子
2. 检测包含 rm, chmod, sudo, curl/bash pipe 的命令
3. 匹配到危险模式时弹出确认对话框
4. 用户确认后才放行
5. 记录所有被阻止的命令到日志文件
使用 TypeScript 编写，输出到 src/index.ts。
```

**步骤 3**: 编译

```
npx tsc src/index.ts --outDir dist --target ES2022 --module commonjs
```

**步骤 4**: 创建 plugin.json

```json
{
  "name": "security-guard",
  "displayName": "Security Guard",
  "version": "1.0.0",
  "description": "Warns before executing potentially dangerous commands",
  "main": "dist/index.js",
  "permissions": ["workspace:write", "ui:notifications"],
  "activationEvents": ["onCommand:*"]
}
```

**步骤 5**: 安装和测试

```bash
claude plugin install ./security-guard-plugin
```

然后在 Claude Code 中测试：

```
执行 rm -rf ./temp 删除临时文件夹
```

预期结果：Claude Code 在删除前先显示确认对话框（由 Plugin 注入），只有在用户确认后才执行 `rm` 命令。

**步骤 6**: 发布到 npm

```bash
# 更新 package.json
npm publish

# 用户安装
claude plugin install security-guard
```

## 本章小结

1. **Plugin vs Skill**: Plugin 是编程级扩展（TypeScript/JavaScript 代码，有完整的生命周期和事件钩子），Skill 是文本指令级扩展（Markdown 文件，基于 Prompt 模式匹配）。Plugin 能做 Skill 不能做的事：拦截命令、修改行为、集成外部系统、持久化数据、贡献 UI。

2. **沙箱机制保障安全**: Plugin 在隔离进程中运行，权限必须显式声明，用户安装时确认。恶意 Plugin 无法窃取数据或破坏系统。

3. **事件钩子是核心 API**: onWillExecuteCommand（预执行，可阻止命令）和 onDidExecuteCommand（后执行，可获取结果）是最常用的钩子。自定义事件系统支持 Plugin 间通信。

4. **配置管理让 Plugin 灵活可定制**: 通过 contributes.configuration 声明配置项，用户可以通过 Claude Code 设置界面调整行为，无需修改代码。

5. **资源清理是负责任的开发实践**: 所有定时器、文件句柄、网络连接必须在 deactivate 中释放。忘记清理会导致内存泄漏和文件锁。

6. **分发渠道多样**: 支持本地安装、npm 包、Git 仓库三种安装方式。版本兼容性声明确保 Plugin 不会在不兼容的 Claude Code 版本上加载。

## 思考题

1. **Plugin 和 Skill 在功能上有什么本质区别？**
   - **提示**: Skill 是基于文本指令的模式匹配，告诉 Claude "如何思考"；Plugin 是基于代码的事件驱动，告诉 Claude "如何执行"。Skill 修改 Claude 的回答内容和格式，Plugin 修改系统的行为流程。Skill 不需要编程知识即可创建，Plugin 需要 TypeScript 开发能力。Skill 不能阻止命令执行或访问文件系统，Plugin 可以。Skill 的激活依赖上下文匹配，Plugin 的激活依赖事件触发。

2. **Plugin 开发中有哪些安全注意事项？**
   - **提示**: (1) 最小权限原则——只申请 Plugin 功能真正需要的权限，不申请多余的 workspace:write 如果只需要 workspace:read；(2) 输入验证——从事件中获取的用户输入（命令、参数）要验证后再使用或存储，防止注入攻击；(3) 安全的外部通信——如果 Plugin 发送网络请求，使用 HTTPS 而非 HTTP，验证证书有效性；(4) 日志安全——不将 API Key、Token 等敏感信息记录到日志文件；(5) 定期审计——为 Plugin 添加调用日志，定期审查哪些 Plugin 在运行以及它们访问了哪些数据。Claude Code 的沙箱机制提供了基础安全保障，但 Plugin 开发者仍需遵循安全最佳实践。
