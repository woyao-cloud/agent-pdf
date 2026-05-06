# 第1章 Claude Code 概述与安装配置

## 1.1 Claude Code 是什么

Claude Code 是 Anthropic 公司推出的命令行界面（CLI）工具，它将 Claude AI 的能力带入了开发者的终端环境。与传统的图形界面交互不同，Claude Code 通过命令行与开发者进行深度交互，能够读取、修改和创建文件，执行Shell命令，并在整个开发过程中提供智能辅助。

### 1.1.1 与 Claude 网页版的区别

Claude Code 与 Claude 网页版虽然共享相同的基础 AI 模型，但在使用方式和场景上有本质区别：

| 特性 | Claude Code | Claude 网页版 |
|------|-------------|--------------|
| 交互方式 | 命令行界面 | 图形界面 |
| 文件操作 | 直接读写文件系统 | 需上传/下载 |
| 集成度 | 与本地开发环境无缝集成 | 独立使用 |
| 自动化 | 支持脚本化和自动化 | 手动交互 |
| 响应速度 | 本地执行，速度快 | 依赖网络 |
| 使用场景 | 开发工作流 | 问答和咨询 |

Claude Code 的核心优势在于它能够直接与你的项目文件进行交互。它可以读取你的代码库、理解项目结构、创建新文件、修改现有代码，甚至执行Shell命令来完成构建、测试等操作。这种深度集成使得 Claude Code 不仅仅是一个对话工具，而是一个真正的 AI 开发助手。

### 1.1.2 CLI 的独特优势

命令行界面的独特优势体现在以下几个方面：

**1. 精准的文件操作控制**

Claude Code 可以直接读取项目中的任何文件，理解其内容和结构。当你请求它分析一个复杂模块时，它能够一次性读取多个相关文件，建立完整的上下文理解。这种能力在处理大型代码库时尤为重要，因为传统的复制粘贴方式效率极低且容易出错。

**2. 无缝的Shell命令执行**

除了文件操作，Claude Code 还能执行Shell命令。这意味着它可以运行测试、构建项目、安装依赖、甚至部署代码。开发者无需在多个工具之间切换，所有操作都可以在 Claude Code 的会话中完成。

**3. 持久化的上下文记忆**

在一次会话中，Claude Code 会记住所有的对话历史和项目上下文。它理解你之前修改了哪个文件，添加了哪个功能。这种记忆能力使得多轮交互成为可能，你可以逐步完善代码，而无需每次都重复背景信息。

**4. 工具系统的强大支持**

Claude Code 内置了丰富的工具系统，包括文件读写、代码搜索、项目管理等。这些工具经过精心设计，能够满足各种开发需求。更重要的是，你可以通过配置来定制工具的权限，实现细粒度的安全控制。

### 1.1.3 核心能力概览

Claude Code 的核心能力可以从以下几个维度理解：

**代码理解与生成**

Claude Code 能够深入理解各种编程语言的代码，包括 Python、JavaScript、TypeScript、Go、Rust、Java 等。它可以：
- 分析现有代码的架构和逻辑
- 生成符合项目规范的代码
- 识别潜在的 bug 和性能问题
- 提出重构建议

**项目导航与分析**

通过强大的代码检索和分析能力，Claude Code 能够：
- 快速了解项目结构
- 追踪代码引用和依赖关系
- 定位特定功能的实现位置
- 生成项目的文档和报告

**开发工作流辅助**

从需求到实现，Claude Code 可以在整个开发流程中提供帮助：
- 需求分析和任务分解
- 测试用例设计和实现
- 代码审查和问题修复
- 文档编写和维护

## 1.2 安装与环境配置

### 1.2.1 各平台安装方式

Claude Code 支持 macOS、Linux 和 Windows 三大平台。以下是各平台的安装方法：

**macOS 安装**

在 macOS 上，推荐使用 Homebrew 进行安装：

```bash
# 添加 Anthropic 的 tap
brew tap anthropic/homebrew-tap

# 安装 Claude Code
brew install claude

# 验证安装
claude --version
```

如果不想使用 Homebrew，也可以手动下载安装：

```bash
# 下载 macOS 版本的 Claude Code
curl -sL https://github.com/anthropics/claude-code/releases/latest/download/claude- darwin-arm64.tar.gz -o claude.tar.gz

# 解压到指定目录
tar -xzf claude.tar.gz -C /usr/local/bin/

# 验证安装
claude --version
```

**Linux 安装**

Linux 平台的安装同样简单：

```bash
# 使用 curl 下载
curl -sL https://github.com/anthropics/claude-code/releases/latest/download/claude-linux- x86_64.tar.gz -o claude.tar.gz

# 解压到用户目录
mkdir -p ~/.local/bin
tar -xzf claude.tar.gz -C ~/.local/bin/

# 添加到 PATH（添加到 ~/.bashrc 或 ~/.zshrc）
export PATH="$HOME/.local/bin:$PATH"

# 验证安装
claude --version
```

**Windows 安装**

在 Windows 上，推荐使用 PowerShell 进行安装：

```powershell
# 使用 winget 安装（推荐）
winget install Anthropic.ClaudeCode

# 或者使用 scoop
scoop install claude

# 验证安装
claude --version
```

如果手动安装：

```powershell
# 使用 Invoke-WebRequest 下载
Invoke-WebRequest -Uri "https://github.com/anthropics/claude-code/releases/latest/download/claude-windows-x86_64.zip" -OutFile "claude.zip"

# 解压
Expand-Archive -Path "claude.zip" -DestinationPath "$env:LOCALAPPDATA\ClaudeCode"

# 添加到 PATH
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$env:LOCALAPPDATA\ClaudeCode", "User")

# 验证安装
claude --version
```

### 1.2.2 配置文件设置

Claude Code 的配置文件位于用户主目录下的 `.claude` 目录中。首次运行后，会自动创建必要的配置文件。

**配置文件结构**

```
~/.claude/
├── config.json          # 主配置文件
├── settings.json        # 用户设置
├── prompts/             # 自定义提示词
├── hooks/               # 钩子脚本
└── memory/              # 记忆存储
```

**主配置文件 config.json**

```json
{
  "model": "claude-sonnet-4-6",
  "maxTokens": 4096,
  "temperature": 0.7,
  "tools": {
    "read": true,
    "write": true,
    "bash": true,
    "glob": true,
    "grep": true
  },
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Bash"
    ],
    "deny": []
  }
}
```

**用户设置 settings.json**

```json
{
  "theme": "auto",
  "editor": "vim",
  "shell": "/bin/bash",
  "alwaysThinkingEnabled": true,
  "maxThinkingTokens": 16000,
  "verboseMode": false
}
```

### 1.2.3 认证与授权

Claude Code 需要进行身份验证才能使用。验证过程通过 API 密钥完成。

**获取 API 密钥**

1. 访问 Anthropic 控制台：https://console.anthropic.com/
2. 创建账户或登录现有账户
3. 在 API Keys 页面创建新的 API 密钥
4. 妥善保存生成的密钥（只会显示一次）

**配置 API 密钥**

可以通过环境变量或配置文件设置 API 密钥：

```bash
# 通过环境变量（推荐）
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxx"

# 或在配置文件中设置
```

**密钥管理最佳实践**

- 切勿将 API 密钥提交到版本控制系统
- 定期轮换密钥
- 使用密钥管理工具（如 1Password、AWS Secrets Manager）
- 为不同的项目设置不同的密钥以便追踪使用

## 1.3 首次启动与基本设置

### 1.3.1 模型选择

Claude Code 支持多个模型版本，不同模型在能力、速度和成本上有差异：

**可用模型**

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| Claude Haiku 4.5 | 快速、便宜 | 简单任务、日常对话 |
| Claude Sonnet 4.6 | 平衡（推荐） | 大多数开发任务 |
| Claude Opus 4.7 | 最强能力 | 复杂推理、架构设计 |

**配置默认模型**

在 `config.json` 中设置默认模型：

```json
{
  "model": "claude-sonnet-4-6"
}
```

**运行时切换模型**

可以在对话中切换模型：

```
/model opus
/model sonnet
/model haiku
```

### 1.3.2 快捷键配置

Claude Code 支持丰富的快捷键，可以显著提升使用效率。

**基础快捷键**

| 快捷键 | 功能 |
|--------|------|
| Ctrl+C | 终止当前操作 |
| Ctrl+L | 清除屏幕 |
| Ctrl+S | 保存会话 |
| Ctrl+O | 查看思考过程 |
| Alt+T | 切换扩展思考 |

**自定义快捷键**

在 `settings.json` 中配置自定义快捷键：

```json
{
  "keybindings": {
    "ctrl-r": "reload-config",
    "ctrl-n": "new-session",
    "ctrl-h": "show-history"
  }
}
```

### 1.3.3 项目初始化

首次在项目中使用 Claude Code 时，建议进行项目初始化以获得更好的体验。

**自动初始化**

Claude Code 会自动检测项目类型并尝试理解项目结构。首次运行时，它会：

1. 扫描项目目录结构
2. 检测使用的编程语言和框架
3. 识别包管理器和依赖
4. 建立项目上下文

**手动初始化**

对于复杂项目，可以手动提供更多上下文：

```bash
# 初始化当前目录为项目根
claude init

# 指定项目类型
claude init --type python
claude init --type javascript
claude init --type rust
```

**项目配置文件**

在项目根目录创建 `.claude.json` 提供项目级配置：

```json
{
  "project": {
    "name": "my-project",
    "type": "python",
    "language": "zh-CN"
  },
  "tools": {
    "enabled": ["read", "write", "bash", "glob", "grep"]
  },
  "exclude": [
    "**/node_modules/**",
    "**/__pycache__/**",
    "**/.git/**"
  ]
}
```

## 本章小结

本章介绍了 Claude Code 的基本概念和安装配置方法。通过本章的学习，你应该能够：

1. 理解 Claude Code 与网页版的区别
2. 掌握在各种平台上的安装方法
3. 配置适合自己的开发环境
4. 完成首次启动和基本设置

下一章我们将深入了解 Claude Code 的核心概念和工作原理，包括对话模式、工具系统和上下文管理等关键内容。这些知识将帮助你在实际开发中更有效地使用 Claude Code。

## 练习题

1. 在你的电脑上安装 Claude Code 并验证安装成功
2. 配置一个适合自己项目的配置文件
3. 尝试初始化一个现有项目并观察 Claude Code 的响应
4. 探索不同的模型选项并比较它们的响应速度

## 参考资源

- Claude Code 官方文档：https://docs.anthropic.com/claude-code
- Anthropic 控制台：https://console.anthropic.com/
- GitHub 仓库：https://github.com/anthropics/claude-code