# 第1章：Claude Code 概述与安装配置

## 章节概述

本章介绍 Claude Code 的基本概念、发展背景以及安装配置方法。读者将了解 Claude Code 是什么、能做什么，以及如何在本地环境中搭建 Claude Code 开发环境。Claude Code 是 Anthropic 推出的一款基于终端的 AI 编程助手，它直接运行在命令行界面中，能够理解整个代码仓库的上下文，并代表开发者执行文件操作、运行命令、管理 Git 等任务。与传统的 AI 编码插件不同，Claude Code 拥有主动操作能力——它不只是"建议"代码，而是可以直接修改文件、创建项目、调试错误，真正像一个结对编程伙伴一样工作。

## 学习目标

读完本章，你将能够：
- 了解 Claude Code 的发展历程和产品定位
- 掌握 Claude Code 的系统要求与环境依赖
- 完成 Claude Code 的安装和基础配置，连接到 Anthropic API
- 熟悉 CLI 基本命令和帮助系统

## 核心知识点

### 1. Claude Code 简介

#### 什么是 Claude Code

Claude Code 是 Anthropic 开发的 Agentic AI 编程工具，运行在终端环境中。它基于 Anthropic 的 Claude 大语言模型（主要是 Claude 3.5 Sonnet 和 Claude 4 系列），能够理解自然语言指令并在代码仓库中执行复杂任务。与传统的 AI 编码助手不同，Claude Code 被设计为一个主动的"代理"（Agent），它不仅能生成代码建议，还能直接读写文件、执行 shell 命令、操作 Git、安装依赖、运行测试等。

从本质上说，Claude Code 将大语言模型的自然语言理解能力与操作系统的执行能力结合在了一起。你只需要用自然语言描述任务目标，Claude Code 就能自主规划步骤、执行操作、检查结果，并在遇到问题时主动询问你的意见。

#### Claude Code 与传统 IDE 的区别

传统 IDE（如 VS Code、IntelliJ IDEA）中的 AI 编码助手（如 GitHub Copilot、Codeium）通常以插件形式存在，工作在编辑器的"补全"和"对话"面板中。它们的核心工作模式是：开发者编写代码 → AI 提供补全建议 → 开发者手动接受或拒绝。这种模式虽然高效，但 AI 的角色本质上是被动的——它等待开发者做出决策后再提供帮助。

Claude Code 的工作模式完全不同。它运行在独立的终端进程中，拥有对文件系统、终端命令和 Git 操作的完整访问权限（在用户授权的范围内）。它的工作模式是：开发者描述任务 → AI 规划方案 → AI 执行操作 → AI 验证结果 → 开发者审核确认。这种模式的差异不仅仅是形式上的，它从根本上改变了人机协作的编程方式。

以下是两者的详细对比：

| 特性 | Claude Code | 传统 AI 编码助手 |
|------|-------------|-----------------|
| 运行环境 | 独立终端 | IDE 插件面板 |
| 操作能力 | 读写文件、执行命令、Git 操作 | 仅代码补全和对话 |
| 上下文范围 | 整个代码仓库 | 当前打开的文件或选区 |
| 工作模式 | Agent 主动执行 | 被动提供建议 |
| 任务粒度 | 端到端功能开发 | 单行/单函数补全 |
| 自主性 | 高（可独立规划执行） | 低（等待开发者决策） |
| 适用场景 | 复杂重构、项目初始化、调试 | 日常编码补全 |

#### Claude Code 的核心优势

1. **端到端任务执行**：Claude Code 能从零开始完成一个完整的功能开发。例如，你只需要说"创建一个 RESTful API 的用户管理模块"，它就会自动创建文件结构、编写代码、安装依赖、生成路由和控制器。

2. **全仓库上下文理解**：Claude Code 能自动读取和理解整个项目的结构、依赖关系、代码风格和约定，从而生成与现有代码高度一致的代码。它会在需要时自动读取相关文件来获取上下文。

3. **自主调试能力**：当代码出错时，Claude Code 可以自动运行测试、分析错误日志、定位 bug 的根因，并实施修复。这是一个自我纠错的闭环。

4. **Git 深度集成**：Claude Code 可以创建分支、提交代码、处理合并冲突、查看历史记录，将 AI 辅助融入标准的 Git 工作流中。

5. **多文件协调编辑**：当一次修改涉及多个文件时（如重构一个接口的签名），Claude Code 能同时更新所有相关文件，保持一致性。

### 2. 系统要求与环境准备

#### 支持的操作系统

Claude Code 官方支持以下操作系统：

| 操作系统 | 支持状态 | 说明 |
|---------|---------|------|
| macOS 12+ (Monterey 及以上) | ✅ 完全支持 | 最佳体验平台 |
| Ubuntu 20.04+ / Debian 10+ | ✅ 完全支持 | 主流 Linux 发行版 |
| Windows 10/11 | ✅ 支持 | 需通过 WSL2 运行 |
| 其他 Linux 发行版 | ⚠️ 社区支持 | Fedora、Arch 等需自行处理依赖 |

**Windows 用户特别注意**：Claude Code 需要运行在 Linux 环境中，因此在 Windows 上必须通过 WSL2（Windows Subsystem for Linux 2）来使用。直接在 Windows 命令提示符或 PowerShell 中运行 Claude Code 是不支持的。

要设置 WSL2，请确保：
1. 开启 Windows 的 WSL 功能
2. 安装 Ubuntu 22.04 LTS 发行版
3. 在 WSL2 模式下运行（可通过 `wsl --set-version <distro> 2` 设置）
4. 在 WSL 内部安装 Node.js 和 Git

#### 硬件要求

Claude Code 本身对硬件要求不高——它是一个终端应用，大部分计算发生在 Anthropic 的云端服务器上。但以下硬件配置能提供更好的体验：

| 硬件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| CPU | 双核 2.0 GHz | 四核及以上 |
| 内存 | 4 GB RAM | 8 GB+ RAM |
| 存储 | 1 GB 可用空间 | 10 GB+（用于项目文件） |
| 网络 | 宽带连接（2 Mbps+） | 稳定低延迟连接 |
| 显示器 | 1280×720 | 1920×1080+（多窗口） |

网络连接质量是影响 Claude Code 体验的最关键因素。由于所有 AI 推理都在云端完成，不稳定的网络会导致响应延迟或中断。

#### 前置依赖

在安装 Claude Code 之前，你需要确保系统中已安装以下软件：

**Node.js**（必需）
- 版本要求：18.0.0 或更高
- 推荐版本：20.x LTS
- 安装方式：
  - macOS: `brew install node@20`
  - Ubuntu/Debian: 使用 NodeSource PPA 或 nvm
  - Windows (WSL): 同 Ubuntu

**npm**（随 Node.js 一起安装）
- 版本要求：9.0.0 或更高

**Git**（必需）
- 版本要求：2.23.0 或更高
- 安装方式：
  - macOS: `brew install git`
  - Ubuntu/Debian: `sudo apt install git`
  - Windows (WSL): `sudo apt install git`

**验证依赖安装：**

```bash
# 检查 Node.js 版本
node --version
# 输出示例：v20.11.0

# 检查 npm 版本
npm --version
# 输出示例：10.2.4

# 检查 Git 版本
git --version
# 输出示例：git version 2.34.1
```

如果使用 nvm（Node Version Manager）管理 Node.js 版本，可以更方便地在不同版本间切换：

```bash
# 安装 nvm（macOS/Linux）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 安装并使用 Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20
```

### 3. 安装方式

#### npm 全局安装

Claude Code 通过 npm 以全局包的形式发布。安装命令非常简单：

```bash
npm install -g @anthropic-ai/claude-code
```

这条命令会从 npm 仓库下载最新的 Claude Code 包并将其安装到全局 node_modules 目录中。安装完成后，`claude` 命令会被注册到系统的 PATH 环境变量中。

安装过程会输出类似以下的信息：

```bash
npm install -g @anthropic-ai/claude-code

changed 1 package in 15s

1 package is looking for funding
  run `npm fund` for details
```

**权限问题处理**：在某些系统上，全局 npm 安装可能需要管理员权限。如果遇到权限错误，有以下几种解决方案：

```bash
# 方案一：使用 sudo（macOS/Linux）
sudo npm install -g @anthropic-ai/claude-code

# 方案二：配置 npm 全局路径到用户目录（推荐）
mkdir ~/.npm-global
npm config set prefix ~/.npm-global
# 然后将 ~/.npm-global/bin 添加到 PATH
```

#### 其他安装方式

**通过 npx 临时运行**（不推荐日常使用，适合快速体验）：

```bash
npx @anthropic-ai/claude-code
```

使用 npx 的好处是不需要显式安装，但每次运行都会检查最新版本，启动速度稍慢。适合临时测试环境。

**通过 Homebrew 安装**（macOS，如果官方提供支持）：

```bash
# 如果 Claude Code 发布了 Homebrew formula
brew install claude-code
```

**从源码构建**（适用于需要定制或离线环境的场景）：

```bash
git clone https://github.com/anthropics/claude-code.git
cd claude-code
npm install
npm run build
npm link
```

#### 版本验证

安装完成后，验证是否成功：

```bash
# 检查版本
claude --version
# 输出示例：claude-code/0.2.0

# 检查帮助信息
claude --help
```

如果能看到版本号和帮助信息，说明安装成功。如果提示 `claude: command not found`，说明全局 bin 目录不在 PATH 中，需要检查 npm 的配置。

### 4. 基础配置

#### API Key 配置

Claude Code 需要通过 Anthropic API 与 Claude 模型通信，因此你需要一个有效的 API Key。

**获取 API Key：**
1. 访问 [console.anthropic.com](https://console.anthropic.com)
2. 注册或登录 Anthropic 账号
3. 在 API Keys 页面创建新的 API Key
4. 复制生成的 Key（格式通常以 `sk-ant-` 开头）

**配置 API Key 的方式有多种：**

方式一：环境变量（推荐用于 CI/CD 环境）

```bash
# 临时设置（当前终端会话有效）
export ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# 永久设置（添加到 shell 配置文件 ~/.bashrc 或 ~/.zshrc）
echo 'export ANTHROPIC_API_KEY="sk-ant-your-api-key-here"' >> ~/.zshrc
source ~/.zshrc
```

方式二：CLI 交互式设置（推荐首次使用）

```bash
claude
# 首次启动时会提示输入 API Key
# ? 请输入你的 Anthropic API Key: [输入你的 Key]
```

方式三：配置文件设置

创建或编辑 `~/.claude/claude.json` 配置文件，添加 API Key。

#### 认证方式

Claude Code 支持以下认证方式：

| 方式 | 优先级 | 适用场景 |
|------|--------|---------|
| `ANTHROPIC_API_KEY` 环境变量 | 最高 | 服务器、CI/CD、所有场景 |
| `ANTHROPIC_AUTH_TOKEN` 环境变量 | 中 | 某些企业部署方案 |
| 配置文件 `~/.claude/credentials` | 低 | 本地持久化配置 |

Claude Code 会按照上述优先级顺序查找认证信息。环境变量在多个项目间共享时最为方便，而配置文件适合为不同项目设置不同的认证方式。

**安全提醒**：永远不要将 API Key 提交到 Git 仓库。建议将 `.env` 文件添加到 `.gitignore` 中，或使用环境变量管理工具（如 `direnv`）。

#### 配置文件详解

Claude Code 的配置文件位于 `~/.claude/claude.json`，也可以通过项目级别的 `.claude.json` 覆盖全局配置。以下是完整的配置项说明：

```json
{
  "apiKey": "sk-ant-...",
  "model": "claude-3-5-sonnet-20241022",
  "maxTokens": 4096,
  "temperature": 0.3,
  "systemPrompt": "你是一个专业的编程助手，用中文回复。",
  "permissions": {
    "fileOperations": true,
    "commandExecution": true,
    "gitOperations": true,
    "networkAccess": false
  },
  "contextOptions": {
    "maxReadFiles": 50,
    "maxContextSize": 100000
  },
  "theme": {
    "mode": "dark",
    "colors": {
      "primary": "#00ff00",
      "secondary": "#ffffff"
    }
  },
  "editor": {
    "defaultView": "diff",
    "autoConfirm": false
  }
}
```

**关键配置项说明：**

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `model` | string | 最新稳定版 | 使用的 Claude 模型版本 |
| `temperature` | number | 0.3 | 生成随机性（0.0-1.0），编码建议 0.2-0.4 |
| `maxTokens` | number | 4096 | 单次响应的最大 Token 数 |
| `permissions.fileOperations` | boolean | true | 是否允许 AI 读写文件 |
| `permissions.commandExecution` | boolean | true | 是否允许 AI 执行 shell 命令 |
| `permissions.gitOperations` | boolean | true | 是否允许 AI 执行 Git 操作 |
| `contextOptions.maxReadFiles` | number | 50 | 单次可读取的最大文件数 |

### 5. CLI 基础命令

#### 启动与退出

```bash
# 在当前目录启动 Claude Code 会话
claude

# 在指定目录启动
claude /path/to/project

# 带着初始提示启动
claude -p "分析这个项目的结构"

# 以非交互模式运行单条指令
claude -e "找出所有未使用的 import 语句"
```

退出 Claude Code 会话：
- 输入 `/exit` 或 `/quit`
- 使用快捷键 `Ctrl+C` 或 `Ctrl+D`

#### 基本命令概览

Claude Code 提供了一系列以斜杠开头的命令（类似 Slack 或 Discord 的机器人命令）：

| 命令 | 功能 | 使用示例 |
|------|------|---------|
| `/help` | 显示帮助信息 | `/help` |
| `/clear` | 清除当前会话历史 | `/clear` |
| `/status` | 查看当前会话状态 | `/status` |
| `/cost` | 查看当前会话的 Token 消耗 | `/cost` |
| `/review` | 对当前变更进行代码审查 | `/review` |
| `/fix` | 尝试修复错误或问题 | `/fix` |
| `/init` | 初始化新项目结构 | `/init` |
| `/compact` | 压缩上下文以节省 Token | `/compact` |
| `/doctor` | 诊断环境和配置问题 | `/doctor` |
| `/exit` | 退出会话 | `/exit` |

#### 帮助系统使用

Claude Code 提供了多层次的帮助系统：

```bash
# 在终端中查看帮助
claude --help

# 查看版本号
claude --version

# 会话中输入 /help 查看内置命令列表
# 会话中输入 /help <命令名> 查看特定命令的详细说明
```

在会话内，你也可以直接用自然语言询问如何使用 Claude Code：

```
你：告诉我如何使用 /compact 命令
Claude Code：/compact 命令用于压缩当前会话的上下文...
```

## 实战练习

按照以下步骤完成 Claude Code 的安装和配置：

**练习：安装并配置 Claude Code**

1. 检查系统依赖：
   ```bash
   node --version  # 确保 ≥ 18.0.0
   npm --version   # 确保 ≥ 9.0.0
   git --version   # 确保 ≥ 2.23.0
   ```

2. 全局安装 Claude Code：
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

3. 验证安装：
   ```bash
   claude --version
   ```

4. 配置 API Key（方式任选其一），推荐使用环境变量：
   ```bash
   export ANTHROPIC_API_KEY="your-key-here"
   ```

5. 启动首次会话：
   ```bash
   cd ~
   claude
   ```

6. 在会话中输入 `/status` 查看连接状态，确认已成功连接到 Anthropic API。

## 本章小结

1. Claude Code 是 Anthropic 推出的 Agentic AI 编程工具，运行在终端中，拥有主动执行文件操作、命令执行和 Git 管理等能力，与传统 IDE 插件的被动辅助模式有本质区别。

2. 安装 Claude Code 需要 Node.js 18+、npm 9+ 和 Git 2.23+，推荐使用 Node.js 20 LTS 版本。Windows 用户必须通过 WSL2 运行。

3. npm 全局安装是最主要的安装方式（`npm install -g @anthropic-ai/claude-code`），也可通过 npx 临时使用。

4. API Key 是使用 Claude Code 的必要凭证，推荐通过环境变量 `ANTHROPIC_API_KEY` 配置。切勿将 API Key 提交到 Git 仓库中。

5. Claude Code 提供丰富的 CLI 命令（`/help`、`/clear`、`/status` 等）和多层次的帮助系统，方便用户快速上手和学习。

6. 配置文件（`~/.claude/claude.json`）支持精细的权限控制，包括文件操作、命令执行、Git 操作和网络访问的开关，是保障安全性的重要手段。

## 思考题

1. **Claude Code 与传统的 AI 编码助手有什么本质区别？**
   > **提示**：从"工作模式"的角度思考。传统 AI 编码助手遵循"开发者写代码 → AI 建议 → 开发者确认"的被动辅助模式，而 Claude Code 遵循"开发者描述任务 → AI 规划 → AI 执行 → AI 验证"的主动代理模式。关键区别在于 AI 是否拥有直接操作文件系统和执行命令的能力。

2. **在不同操作系统上安装 Claude Code 有哪些注意事项？**
   > **提示**：主要考虑三点：① Windows 必须通过 WSL2 运行，不能直接在 PowerShell 中使用；② macOS 和 Linux 上需注意 npm 全局安装的权限问题，推荐配置用户级别的 npm 全局路径；③ 所有系统都需要确保 Node.js 版本 ≥ 18.0.0。