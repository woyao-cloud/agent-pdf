# 第22章：创建 Skill 实现工作扩展

## 章节概述

本章介绍如何创建 Claude Code Skill——一种基于 Markdown 文件的轻量级扩展机制，用于封装特定开发工作流的指令集。Skill 可以包含触发条件、执行步骤、代码模板和上下文管理，让 Claude Code 在特定场景下自动采用最佳实践。我们将开发一个"代码审查 Skill"，展示从需求分析、文件编写到安装使用的完整流程。

## 学习目标

- 理解 Skill 的架构和工作原理
- 掌握 Skill 文件的结构和配置
- 学会定义触发条件和处理逻辑
- 能够发布和共享 Skill

## 核心知识点

### 1. Skill 基础

#### Skill 的定义和作用

Skill 是 Claude Code 的一种扩展方式，本质上是一个遵循特定格式的 Markdown 文件。它告诉 Claude Code："当遇到 X 场景时，按照 Y 方式来处理"。Skill 的作用包括：

- **标准化工作流程**：确保团队成员用相同的方式执行常见任务（如代码审查、发布流程、环境配置）
- **减少重复指令**：不必每次向 Claude Code 重复项目规范、代码风格、测试要求
- **封装领域知识**：将特定的技术栈规范、架构决策、业务规则封装到 Skill 中
- **实现上下文感知**：根据当前项目语言、框架自动调整行为

Skill 和普通 Prompt 模板的区别在于：Skill 是**主动触发**的——Claude Code 会识别触发条件并自动激活 Skill，而 Prompt 模板需要用户手动粘贴。

#### Skill 文件结构

一个标准的 Skill 文件包含以下部分：

```markdown
# Skill Name

## Description
一段清晰描述 Skill 功能的文字，Claude Code 用来判断何时自动激活。

## Triggers
定义 Skill 的触发条件，支持多种触发方式。

## Instructions
Skill 激活后的执行指令，Claude Code 会按照这些指令处理当前任务。

## Examples (可选)
提供输入/输出示例，帮助 Claude Code 理解期望的行为模式。
```

Skill 文件使用 `.md` 扩展名，放置在 `~/.claude/skills/<skill-name>/SKILL.md` 或项目本地的 `.claude/skills/` 目录中。

#### 元数据配置

在文件开头的 YAML front matter 中定义元数据：

```yaml
---
name: code-review
description: Performs thorough code review on pull requests and code changes
author: Your Name
version: 1.0.0
triggers:
  - command: review
  - pattern: "code review|pull request|代码审查"
  - file_pattern: "*.ts,*.tsx"
---
```

元数据字段：
- **name**: Skill 的唯一标识符
- **description**: 简短描述，用于匹配触发条件
- **author**: 作者信息
- **version**: 语义化版本号
- **triggers**: 触发条件定义（详见下一节）

#### 执行模式

Skill 有两种执行模式：

- **自动模式**: Claude Code 根据上下文自动激活 Skill，无需用户明确请求。例如，当用户粘贴了一段 `git diff` 输出时，代码审查 Skill 自动激活。
- **命令模式**: 用户通过 `/skill-name` 或 `@skill-name` 命令主动调用 Skill。例如，输入 `/review` 直接触发代码审查 Skill。

### 2. 触发机制

#### 命令触发

最简单的触发方式——用户通过特定命令调用 Skill：

```yaml
triggers:
  - command: review
```

用户输入 `/review` 时，Claude Code 自动激活该 Skill。你可以为命令添加别名：

```yaml
triggers:
  - command: review
    aliases: ["cr", "codereview"]
```

这样 `/cr` 和 `/codereview` 也能触发同一个 Skill。

#### 自动触发条件

Skill 可以根据对话内容自动激活，无需用户输入命令：

```yaml
triggers:
  - pattern: "code review|pull request|review this code|审查代码"
```

当用户的输入匹配正则表达式 `pattern` 时，Claude Code 自动激活 Skill。

#### 上下文感知触发

更高级的触发方式——基于当前项目的上下文：

```yaml
triggers:
  - context:
      language: "typescript"     # 当前文件是 TypeScript
      has_files: "*.test.ts"     # 项目中有测试文件
      framework: "react"         # 使用 React 框架
```

只有当所有上下文条件都满足时，Skill 才会激活。例如，"React 组件测试 Skill"只在用户正在编辑 React 组件且有测试文件的项目中自动激活。

#### 参数传递

命令触发时可以传递参数，Skill 在执行时读取这些参数：

```
/review --focus=performance --severity=high
```

Skill 文件中可以通过变量引用这些参数：

```markdown
## Instructions

Review focus: {{focus}}
Severity level: {{severity}}

1. Analyze code for {{focus}} issues...
```

### 3. Skill 开发

#### 指令编写

编写 Skill 的核心是 Instructions 部分。它告诉 Claude Code 在激活时应该做什么。

**代码审查 Skill** (`code-review/SKILL.md`):

```markdown
---
name: code-review
description: Comprehensive code review assistant that analyzes code changes, identifies issues, and provides actionable feedback
author: Claude Code Team
version: 1.0.0
triggers:
  - command: review
    aliases: ["cr"]
  - pattern: "code review|审查代码|review this|analyze changes"
---

# Code Review Skill

## Description
Performs detailed code review on code changes, pull requests, or arbitrary code snippets. Covers correctness, performance, security, style, and maintainability.

## Instructions

### 1. Understand the Context
- Determine the programming language and framework
- Identify if this is a diff (git diff), a complete file, or a code snippet
- Note the scope (new feature, bug fix, refactoring)

### 2. Review Categories (check each systematically)

#### Correctness
- Does the code handle edge cases? (empty inputs, null values, boundary conditions)
- Are there any race conditions or async issues?
- Are error paths properly handled?
- Does the logic match the apparent intent?

#### Security
- Are user inputs properly validated and sanitized?
- Are there any injection vulnerabilities? (SQL, XSS, command injection)
- Are secrets/credentials exposed?
- Is authentication/authorization properly enforced?

#### Performance
- Are there unnecessary computations in loops?
- Could this operation be memoized or cached?
- Are there N+1 query problems?
- Are large objects being unnecessarily copied?

#### Maintainability
- Is the code readable with clear naming?
- Are functions/components appropriately sized?
- Is there duplicated code that should be extracted?
- Are there magic numbers or strings that should be constants?

#### Testing
- Are there unit tests for the new/modified code?
- Do tests cover the edge cases mentioned above?
- Are there integration tests for cross-component changes?

### 3. Output Format

For each issue found, use this format:

```
## 🚨 [SEVERITY] Category: Issue Title
**File**: `path/to/file.ts:42-55`

**Problem**: Clear description of what's wrong.

**Suggestion**: Concrete code example of how to fix it.

**Why**: Explanation of why this matters (potential bug, performance impact, etc.)
```

Severity levels:
- **CRITICAL**: Will cause bugs or security vulnerabilities
- **WARNING**: Could cause issues or violates best practices
- **SUGGESTION**: Style or minor improvement

### 4. Summary
At the end, provide a summary:

```
## Summary
- **Critical**: 2 issues
- **Warnings**: 5 issues  
- **Suggestions**: 3 issues
- **Estimated effort to fix**: Medium
- **Reviewed by**: Code Review Skill v1.0.0
```

## Examples

### Input (git diff)
```diff
+ function processData(input) {
+   const result = [];
+   for (let i = 0; i < input.length; i++) {
+     result.push(input[i] * 2);
+   }
+   return result;
+ }
```

### Expected Output
```
## 💡 SUGGESTION: Performance - Array.map vs manual loop
**File**: diff input

**Problem**: Manual for-loop can be replaced with Array.map().

**Suggestion**: 
- function processData(input) {
-   const result = [];
-   for (let i = 0; i < input.length; i++) {
-     result.push(input[i] * 2);
-   }
-   return result;
- }
+ function processData(input: number[]): number[] {
+   return input.map(x => x * 2);
+ }

**Why**: Array.map is more idiomatic, concise, and less prone to off-by-one errors.
```

## Allowed Context
- Current file content
- Git diff output
- File tree structure
- Lint/type errors in the project
```

**Claude Code 提示：**

```
请帮我创建一个 Python 代码审查 Skill，
专注于检查类型注解、import 组织、
docstring 完整性和 PEP 8 风格规范。
```

#### 输出格式化

Skill 的输出应结构化且易于阅读。在 Instructions 中明确定义输出格式，让 Claude Code 知道如何组织回答。

输出格式的要点：
- **使用标题分级**：`##` 表示问题分类，`###` 表示具体问题
- **使用格式化标记**：代码块用 ```，文件名用 ``
- **Severity 标记**：使用 🔴 CRITICAL、🟡 WARNING、💡 SUGGESTION 让用户一目了然
- **包含行号引用**：`file.ts:42-55` 精确定位问题位置

#### 上下文管理

通过 `Allowed Context` 部分限制 Skill 可以访问的信息范围：

```markdown
## Allowed Context
- Current file content
- Git diff output
- File tree structure
- Lint/type errors in the project
```

这防止 Skill 在执行时访问过多无关上下文，同时确保有足够的信息完成审查。如果审查需要更多上下文（如整个项目的架构文档），可以在 Instructions 中要求用户提供：

```markdown
## Instructions

Before reviewing, ask user if they want you to:
1. Review only the diff (faster)
2. Review with full project context (more thorough, may use more tokens)
```

### 4. 发布与复用

#### 本地安装

Skill 的安装非常简单——将 SKILL.md 文件放到正确的位置：

```bash
# 用户级安装（对所有项目生效）
mkdir -p ~/.claude/skills/code-review
# 将 SKILL.md 复制到该目录
cp ./code-review/SKILL.md ~/.claude/skills/code-review/

# 项目级安装（只对当前项目生效）
mkdir -p .claude/skills/code-review
cp ./code-review/SKILL.md .claude/skills/code-review/
```

用户级 Skill 对所有 Claude Code 项目可用，项目级 Skill 只在该项目内生效。项目级 Skill 的优先级更高，同名 Skill 会覆盖用户级版本。

#### 团队共享

将 Skill 文件纳入 Git 仓库，团队自动获得：

```
project-root/
├── .claude/
│   └── skills/
│       ├── code-review/
│       │   └── SKILL.md
│       ├── python-setup/
│       │   └── SKILL.md
│       └── deploy/
│           └── SKILL.md
├── src/
└── README.md
```

每个团队成员克隆仓库后，项目级 Skill 自动可用。更新 Skill 文件后，通过正常的 git pull 同步即可。

#### 版本管理

Skill 文件本身支持语义化版本控制：

```yaml
---
name: code-review
version: 1.2.0
---
```

在 `CHANGELOG.md` 中记录版本变更（可选）：

```markdown
# Changelog

## 1.2.0
- Added security review category
- Improved output format with file:line references

## 1.1.0
- Added support for reviewing git diffs
- Added severity levels

## 1.0.0
- Initial release
```

#### Skill 市场

社区 Skill 可以从 Claude Code 的 Skill 市场或第三方仓库获取：

```
/install-skill code-review
```

这个命令会从官方源或指定的 Git 仓库下载 Skill 并安装到本地。

## 实战练习

### 完整项目步骤

**目标**: 创建一个 Python 项目模板 Skill，当 Claude Code 检测到用户正在初始化 Python 项目时，自动应用最佳实践。

**步骤 1**: 创建 Skill 目录和文件

```bash
mkdir -p ~/.claude/skills/python-init
```

**步骤 2**: 编写 Skill 内容

```
请帮我创建一个名为 python-init 的 Skill，
功能是当用户初始化 Python 项目时，自动建议项目结构、
pyproject.toml 配置、虚拟环境设置和测试框架配置。
```

预期 Claude Code 生成的 Skill：

```markdown
---
name: python-init
description: Guides Python project initialization with modern best practices
author: Your Name
version: 1.0.0
triggers:
  - command: pyinit
  - pattern: "init.*python|setup.*python project|start.*python|创建.*python.*项目"
  - context:
      language: "python"
      has_files: "pyproject.toml"
      not_has_files: "src/,tests/"
---

# Python Project Initialization Skill

## Description
Helps set up new Python projects with modern tooling: pyproject.toml, src layout, pytest, ruff, mypy.

## Instructions

### 1. Check Current State
- Check if `pyproject.toml` exists, read it if so
- Check if `src/` and `tests/` directories exist
- Check if `venv` or `.venv` exists

### 2. Project Structure
Recommend the src-based layout:
```
project-name/
├── src/
│   └── project_name/
│       ├── __init__.py
│       └── main.py
├── tests/
│   ├── __init__.py
│   └── test_main.py
├── pyproject.toml
├── .gitignore
└── README.md
```

### 3. pyproject.toml Template
```toml
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "{{project_name}}"
version = "0.1.0"
description = ""
requires-python = ">=3.10"
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
    "ruff>=0.1.0",
    "mypy>=1.0",
]

[tool.ruff]
target-version = "py310"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

### 4. Setup Instructions
After creating the structure:
1. `python -m venv .venv`
2. `.venv\\Scripts\\activate` (Windows) or `source .venv/bin/activate` (macOS/Linux)
3. `pip install -e ".[dev]"`
4. Initialize git: `git init`
5. Run first test: `pytest`

## Examples

### User: "创建一个新的 Python 项目"
### Response: Follow project setup steps above, prompting for project name.
```

**步骤 3**: 测试 Skill

在 Claude Code 中输入：

```
初始化一个新的 Python 数据处理项目
```

Claude Code 会检测到 `python-init` Skill 的触发条件，自动激活并按照 Instructions 中的步骤引导你创建项目。它应该会询问项目名称，然后生成完整的项目结构。

**步骤 4**: 验证和迭代

```
请检查当前目录是否符合 python-init Skill 的最佳实践。
```

根据 Claude Code 的反馈调整 Skill 内容。如果某个流程不符合你的预期，修改 SKILL.md 中的 Instructions 部分。

**步骤 5**: 分享给团队

将 SKILL.md 文件添加到项目仓库的 `.claude/skills/python-init/` 目录中，并推送到远程仓库。通知团队成员更新代码。

## 本章小结

1. **Skill 是"可编程的 Claude 行为"**：通过 Markdown 文件告诉 Claude Code 在特定场景下如何行动。Skill 的触发条件、执行指令、输出格式都是可编程的，不需要写任何代码。

2. **触发条件是 Skill 的"入口"**：精心设计触发条件，让 Skill 在正确的时间和场景自动激活。命令触发适合显式调用，上下文触发适合智能感知。避免过于宽泛的触发条件导致 Skill 在不需要时反复激活。

3. **指令质量决定 Skill 效果**：指令要具体、可操作、包含代码示例。告诉 Claude Code "检查 SQL 注入"比"确保安全性"有效得多。好的指令让 Claude Code 的输出质量明显提升。

4. **输出格式化让结果易于阅读**：使用固定的输出结构（问题 → 位置 → 原因 → 建议 → 代码示例），用户快速理解并采取行动。Severity 分级帮助用户区分优先处理的问题。

5. **项目级 Skill 是最佳实践**：将 Skill 放在项目仓库的 `.claude/skills/` 中，所有团队成员自动共享，无需单独安装。Skill 随代码一起版本管理，保持同步。

6. **Skill 和 Plugin 的核心区别**：Skill 是基于文本指令的轻量扩展，不涉及代码逻辑，适合工作流标准化；Plugin 是基于编程 API 的功能扩展，适合需要与外部系统交互或自定义 UI 的复杂场景。

## 思考题

1. **Skill 和普通 Prompt 模板相比有什么优势？**
   - **提示**: (1) **主动触发**——Skill 能根据上下文自动激活，不需要用户手动粘贴 prompt；(2) **上下文感知**——Skill 可以限制可访问的上下文范围，避免 AI 被无关信息干扰；(3) **结构化输出**——Skill 可以定义严格的输出格式，确保一致性；(4) **版本控制**——Skill 是文件，可以纳入 Git 管理，支持 review 和协作；(5) **组合使用**——多个 Skill 可以在同一对话中依次触发，形成完整工作流。普通 Prompt 模板只是"一次性粘贴的文本"，缺乏这些机制。

2. **设计 Skill 时如何平衡通用性和专用性？**
   - **提示**: 通用 Skill（如"代码审查"）适用范围广但深度有限，专用 Skill（如"React 组件测试 Skill"）深度高但局限于特定场景。设计思路：(1) 从通用开始，根据实际使用反馈逐步分化出专用版本；(2) 使用参数化设计——通过参数控制 Skill 行为的细节（`/review --focus=security`）；(3) 利用项目级配置——通用 Skill 放在用户级目录，专用 Skill 放在项目级目录，同名的项目级 Skill 覆盖用户级；(4) 定期审视 Skill 的使用频率和用户反馈，决定是否需要拆分或合并。