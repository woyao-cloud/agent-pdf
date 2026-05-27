# 第16章：MCP 服务集成与 Skill 工作机制

## 章节概述

Claude Code 的能力并非固定不变的——通过 MCP（Model Context Protocol）服务集成、Skill 工作机制和 Plugin 扩展系统，你可以将 Claude Code 与外部工具、数据库、API 以及自定义自动化流程深度整合，使其从一个"编码助手"进化为"全栈开发工作台"。

本章将详细介绍 MCP 协议的核心概念与配置方法、Skill 文件的结构与生命周期、Plugin 扩展的 API 与注册机制。学完本章，你将能够独立配置 MCP 服务、编写自定义 Skill，并理解 Plugin 扩展的适用场景。

## 学习目标

- 理解 MCP 协议的基本概念（服务端/客户端架构、工具定义、资源访问）
- 掌握 MCP 服务的配置方法与安全注意事项
- 了解 Skill 的文件结构、触发条件和生命周期
- 理解 Plugin 扩展机制和适用场景

## 核心知识点

### 1. MCP 协议基础

MCP（Model Context Protocol）是由 Anthropic 提出的开放协议，旨在为大语言模型提供标准化的方式与外部工具和数据源交互。可以把它理解为"AI 世界的 USB 接口"——只要实现了 MCP 协议的服务，Claude Code 就能即插即用。

#### MCP 协议概述

MCP 解决了 AI 应用中的一个核心问题：大语言模型本身是"静态"的，训练完成后知识就不再更新，也无法直接访问外部系统。MCP 提供了一种标准化的桥接方式：

```
┌─────────────────┐         MCP 协议         ┌──────────────────┐
│  Claude Code     │ ◄──────────────────────► │  MCP Server      │
│  (MCP Client)    │    JSON-RPC over STDIO   │  (Tool Provider) │
│                  │        或 HTTP/SSE       │                  │
│  工具调用         │                          │  数据库查询       │
│  资源访问         │                          │  文件处理         │
│  上下文获取       │                          │  API 调用         │
└─────────────────┘                          │  自定义操作       │
                                              └──────────────────┘
```

MCP 的核心设计原则：

- **标准化**：统一的接口协议，所有 MCP Server 实现相同的通信规范
- **轻量级**：基于 JSON-RPC 2.0，通信开销极低
- **安全可控**：Server 在独立的进程中运行，与 Claude Code 主进程隔离
- **可发现**：Server 可以主动暴露自己支持的工具和资源列表

#### 服务端与客户端架构

MCP 采用客户端-服务端架构：

**MCP Client（Claude Code）**：负责发现可用的 MCP Server，根据任务需求选择合适的工具，发送调用请求并处理结果。

**MCP Server**：每个 Server 是一个独立的进程，负责提供一组相关的工具（Tools）和资源（Resources）。Server 可以通过两种方式运行：

```
方式一：STDIO 传输（推荐用于本地工具）
  Claude Code → 启动子进程 → STDIO 通信
  优点：简单、低延迟、不需要网络端口
  缺点：只能本地运行

方式二：HTTP/SSE 传输（适合远程服务）
  Claude Code → HTTP 请求 → MCP Server（远程）
  优点：可以部署为网络服务
  缺点：需要网络、有延迟
```

#### 工具定义与注册

MCP Server 通过暴露"工具"来扩展 Claude Code 的能力。每个工具包含名称、描述和参数 schema：

```json
{
  "tools": [
    {
      "name": "search_database",
      "description": "对 PostgreSQL 数据库执行 SELECT 查询",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "SQL SELECT 查询语句"
          },
          "limit": {
            "type": "number",
            "description": "最大返回行数",
            "default": 50
          }
        },
        "required": ["query"]
      }
    }
  ]
}
```

Claude Code 在启动时会自动从所有配置的 MCP Server 拉取工具列表，并在需要时选择合适的工具进行调用。开发者不需要手动指定"用哪个工具"——Claude Code 会基于对任务的理解自动匹配。

#### 资源访问机制

除了工具调用，MCP 还支持资源访问（Resources）——Server 可以暴露文件、配置、数据等资源供 Claude Code 读取：

```
资源示例：
- database://orders/table-schema → 数据库表的 Schema
- file://config/application.yml → 配置文件内容
- api://users/123/profile → 用户信息 API
```

资源访问让 Claude Code 能够"看见"外部系统的状态，而不仅限于主动调用工具。

### 2. MCP 服务集成

#### 常用 MCP 服务

以下是一些常见的 MCP Server 及其使用场景：

| MCP Server | 功能 | 典型使用场景 |
|-----------|------|-------------|
| **Database MCP** | SQL 数据库查询和 Schema 探索 | "查询用户表的索引情况" |
| **Filesystem MCP** | 高级文件操作 | "批量重命名文件" |
| **GitHub MCP** | GitHub API 操作 | "创建 Issue、查看 PR" |
| **Docker MCP** | Docker 容器管理 | "查看容器日志、重启服务" |
| **Web Fetch MCP** | HTTP 请求 | "调用第三方 API" |
| **Custom MCP** | 自定义业务逻辑 | 企业内部的微服务调用 |

#### 配置方法与参数

MCP Server 通过 `opencode.json` 配置文件注册：

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": [
        "@anthropic/mcp-database-server",
        "--connection-string",
        "postgresql://user:pass@localhost:5432/mydb"
      ],
      "env": {
        "DB_PASSWORD": "${DB_PASSWORD}"
      }
    },
    "github": {
      "command": "python",
      "args": ["path/to/github_mcp_server.py"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "custom-service": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "transport": "stdio",
      "timeout": 30000
    }
  }
}
```

关键配置参数说明：

- **command/args**：启动 MCP Server 的可执行文件和参数
- **env**：环境变量（敏感信息建议使用环境变量引用 `${VAR}`）
- **transport**：传输方式（stdio 或 http），默认 stdio
- **timeout**：工具调用超时时间（毫秒）

#### 服务发现与验证

配置完成后，可以通过以下方式验证 MCP Server 是否正常运行：

```
启动 Claude Code 时，会用以下格式输出 MCP Server 的注册状态：

✓ MCP Server "database" connected (3 tools registered)
✓ MCP Server "github" connected (5 tools registered)
✗ MCP Server "custom-service" connection failed: ENOENT
```

如果 Server 连接失败，Claude Code 会给出错误信息。常见失败原因包括：

- 可执行文件路径错误（ENOENT）
- 依赖未安装（模块找不到）
- 连接字符串格式错误
- 网络连接超时

验证完成后，可以试运行一个简单命令：

```
请使用 database MCP 工具查询当前数据库中的所有表。
```

如果配置正确，Claude Code 会自动选择并使用对应的工具。

#### 安全性考虑

MCP 服务集成引入外部系统访问能力，安全性至关重要：

1. **最小权限原则**：MCP Server 应使用最小必要权限的数据库账户或 API Token
2. **敏感信息保护**：密码、Token 等应使用环境变量引用，不直接写入配置文件

   ```json
   // ❌ 不安全：直接写入密码
   "--connection-string", "postgresql://root:password123@localhost:5432/db"

   // ✅ 安全：引用环境变量
   "--connection-string", "postgresql://root:${DB_PASSWORD}@localhost:5432/db"
   ```

3. **工具沙箱隔离**：每个 MCP Server 在独立的进程中运行，一个 Server 的崩溃不会影响其他 Server 或 Claude Code 主进程
4. **查询白名单**：对于数据库 MCP Server，建议配置只读模式或查询白名单，防止意外修改数据
5. **审计日志**：记录所有 MCP 工具调用，便于事后追溯

### 3. Skill 工作机制

Skill 是 Claude Code 中可复用的指令和知识模块。与 MCP（提供外部工具能力）不同，Skill 提供的是"行为指导"——告诉 AI 如何处理特定类型的任务。

#### Skill 文件结构

一个 Skill 是一个包含指令和资源的目录（或单个文件），典型的 Skill 结构：

```
my-skill/
├── SKILL.md          # Skill 主文件（核心指令）
├── resources/        # 资源文件（可选）
│   ├── template.js   # 代码模板
│   └── example.md    # 示例参考
└── tests/            # 测试辅助（可选）
    └── verify.sh     # 验证脚本
```

SKILL.md 是 Skill 的核心，包含具体的指令和触发条件：

```markdown
# My Custom Skill

## 描述
这是一个用于生成 REST API 文档的 Skill。

## 触发条件
当用户请求生成 API 文档，或提到"API 文档"、"Swagger"等关键词时使用。

## 使用步骤
1. 读取目标 Controller 文件
2. 提取所有 @RequestMapping/@GetMapping/@PostMapping 注解
3. 分析方法的 @RequestBody/@PathVariable/@RequestParam 参数
4. 生成 OpenAPI 3.0 格式的文档
5. 输出到 docs/api/{module}.yaml

## 模板
参考 resources/template.js 中的格式规范。

## 验证
完成后运行 tests/verify.sh 检查格式是否正确。
```

#### 触发条件配置

Skill 的触发可以是自动识别或手动调用：

**自动触发**：通过在 SKILL.md 中定义关键词，Claude Code 在遇到匹配任务时自动应用该 Skill。

**手动触发**：通过用户明确指定使用某个 Skill：

```
请使用 my-skill 为 UserController 生成 API 文档。
```

**条件触发**：结合项目上下文自动激活：

```markdown
## 触发条件
- 条件: 项目语言 = TypeScript AND 存在 tsconfig.json
- 关键词: ["生成 API", "文档", "Swagger", "OpenAPI"]
- 优先级: 高（覆盖默认行为）
```

#### 上下文传递

Skill 可以通过参数接收外部上下文：

```markdown
## 参数
- target: 目标文件路径（必填）
- format: 输出格式（可选，默认 yaml）
- verbose: 是否包含详细说明（可选，默认 false）

## 使用示例
"请使用 my-skill，target=src/controllers/UserController.java, format=json"
```

Skill 中可以引用项目的 CLAUDE.md 中的规范，形成多层指令叠加：

```
CLAUDE.md（项目级规则）
  └── SKILL.md（任务级规则）
       └── 用户 Prompt（当前任务指令）
```

优先级：用户 Prompt > SKILL.md > CLAUDE.md。下层可以覆盖上层的默认行为。

#### Skill 生命周期

Skill 的完整生命周期包括：

1. **安装**：将 Skill 目录放置在指定的 Skills 目录中（如 `~/.claude/skills/` 或项目 `.claude/skills/`）
2. **注册**：在 `opencode.json` 或 CLAUDE.md 中注册 Skill
3. **发现**：Claude Code 启动时扫描可用的 Skill 列表
4. **加载**：当触发条件满足时，Skill 内容加载到上下文
5. **执行**：AI 按照 SKILL.md 中的步骤执行任务
6. **验证**：执行完成后，运行验证检查
7. **更新**：修改 SKILL.md 即可更新，无需重新编译

### 4. Plugin 扩展

Plugin 是比 Skill 更深层的扩展机制。如果说 Skill 是"告诉 AI 怎么做"，Plugin 就是"给 AI 新的能力"。

#### Plugin API 概览

Plugin 通过 JavaScript/TypeScript 编写，可以：

- 注册新的工具（Tools）
- 监听事件（Hooks）
- 修改 Claude Code 的行为
- 与外部服务深度集成

```typescript
// 一个简单的 Plugin 示例
export default {
  name: 'my-plugin',
  version: '1.0.0',
  
  hooks: {
    'beforeCommand': async (command: string) => {
      console.log(`执行命令: ${command}`);
      return command;
    },
    
    'afterResponse': async (response: string) => {
      // 对 AI 输出进行后处理
      return response.replace(/TODO/g, 'TODO(待处理)');
    }
  },
  
  tools: [
    {
      name: 'custom_analyzer',
      description: '自定义代码分析工具',
      handler: async (params: any) => {
        // 实现自定义分析逻辑
        return { issues: [] };
      }
    }
  ]
};
```

#### 插件注册机制

插件通过 `opencode.json` 注册：

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "path": "./plugins/my-plugin.js",
      "enabled": true,
      "config": {
        "verbose": true,
        "maxResults": 10
      }
    }
  ]
}
```

注册后，Plugin 可以：

- 在 Claude Code 启动时自动加载
- 注册自定义工具（出现在 AI 可用的工具列表中）
- 挂接到各种生命周期事件

#### 钩子（Hook）系统

Plugin 可以挂接到 Claude Code 的多个生命周期事件：

| Hook 名称 | 触发时机 | 典型用途 |
|-----------|---------|---------|
| `beforeCommand` | 执行 shell 命令前 | 安全检查、命令日志 |
| `afterCommand` | 命令执行完成后 | 结果处理、通知 |
| `beforeResponse` | AI 生成回复前 | 注入上下文 |
| `afterResponse` | AI 回复完成后 | 后处理、格式化 |
| `onStartup` | Claude Code 启动时 | 初始化连接 |
| `onShutdown` | Claude Code 关闭时 | 清理资源 |
| `onError` | 发生错误时 | 告警、日志 |

#### 分发与安装

Plugin 的分发方式：

- **本地分发**：将 Plugin 文件放在项目的 `plugins/` 目录中
- **NPM 分发**：发布为 npm 包，通过 `npx` 安装
- **Git 分发**：从 Git 仓库克隆

```
# 从 npm 安装 Plugin
npm install -g @anthropic/claude-code-plugin-analyzer

# 然后在 opencode.json 中引用
{
  "plugins": [
    { "name": "analyzer", "path": "@anthropic/claude-code-plugin-analyzer" }
  ]
}
```

## 实战练习

**任务**：配置一个 PostgreSQL 数据库 MCP Server 并在 Claude Code 中使用它完成实际的数据库操作。

**步骤**：

1. **准备数据库**
   - 本地启动一个 PostgreSQL 实例（或使用已有的开发数据库）
   - 创建一张测试表：`CREATE TABLE projects (id SERIAL, name TEXT, status TEXT);`

2. **配置 MCP Server**
   在 `opencode.json` 中添加：

   ```json
   {
     "mcpServers": {
       "postgres": {
         "command": "npx",
         "args": [
           "@anthropic/mcp-database-server",
           "--connection-string", "postgresql://dev:${PG_PASSWORD}@localhost:5432/devdb"
         ],
         "env": {
           "PG_PASSWORD": "your_dev_password"
         }
       }
     }
   }
   ```

3. **重启 Claude Code 验证连接**
   观察启动日志，确认 MCP Server 成功连接并注册了工具。

4. **执行数据库操作**

   ```
   请使用 postgres MCP 工具：
   1. 列出所有表
   2. 查看 projects 表的 Schema
   3. 插入一条测试数据
   4. 查询刚才插入的数据
   ```

5. **编写一个自定义 Skill**
   创建一个 `skills/db-helper/SKILL.md`：

   ```markdown
   # DB Helper Skill

   ## 描述
   辅助进行数据库操作的标准工作流。

   ## 触发条件
   当用户请求"数据库操作"或"查询数据"时使用。

   ## 步骤
   1. 使用 postgres MCP 工具的 list_tables 列出所有表
   2. 询问用户要操作哪个表
   3. 查看该表的 Schema
   4. 根据用户需求执行查询
   5. 格式化输出结果
   ```

6. **在 CLAUDE.md 中注册 Skill**
   ```
   ## Skills
   - db-helper: 数据库操作辅助 Skill
   ```

7. **测试 Skill**
   ```
   请使用 db-helper 帮我查看数据库中的数据。
   ```

## 本章小结

1. MCP（Model Context Protocol）是 Anthropic 提出的开放协议，为 AI 模型提供标准化的外部工具和数据源访问方式。
2. MCP 采用客户端-服务端架构，支持 STDIO（本地）和 HTTP/SSE（远程）两种传输方式。
3. MCP Server 通过注册工具（Tools）和资源（Resources）来扩展 Claude Code 的能力，工具调用由 AI 自动选择而不是手动路由。
4. MCP 配置中的敏感信息（密码、Token）务必使用环境变量引用 `${VAR}`，绝不要硬编码。
5. Skill 是可复用的指令模块，通过 SKILL.md 定义触发条件、步骤流程和验证方法，指导 AI 如何执行特定类型任务。
6. Skill 的优先级层级：用户 Prompt > SKILL.md > CLAUDE.md，下层可以覆盖上层默认行为。
7. Plugin 是更深层的扩展机制，通过 JavaScript/TypeScript 编写，可以注册工具、挂接钩子、修改 Claude Code 行为。
8. 钩子系统覆盖了 Claude Code 的完整生命周期（命令执行、响应生成、启动关闭等），是 Plugin 实现定制行为的主要切入点。

## 思考题

1. MCP 服务和传统 API 集成有什么区别？
   *提示：传统 API 集成需要手动编码（写 HTTP 请求代码、处理认证、解析响应），而且集成是静态的——你需要预先知道要调用哪个 API。MCP 的核心区别在于（1）标准化：所有 MCP Server 使用统一的 JSON-RPC 2.0 协议，不需要针对每个 API 定制客户端；（2）自动发现：MCP Server 会暴露工具列表，AI 可以"看到"有什么能力可用并自主选择；（3）意图驱动：开发者不需要手动调用工具，AI 理解任务意图后自动匹配工具。*

2. Skill 和 Plugin 各有什么适用场景？
   *提示：Skill 适合"行为指导"类场景——告诉 AI 如何处理特定类型的任务（如"生成 API 文档时遵循什么格式"）。它不需要编程知识，通过 Markdown 编写即可。Plugin 适合"能力扩展"类场景——给 AI 新的功能（如"添加一个代码复杂度分析工具"）。Plugin 需要编程知识（JavaScript/TypeScript），但可以实现任意复杂度的自定义行为。判断标准：如果需求可以通过"告诉 AI 怎么做"解决，用 Skill；如果需要"给 AI 新的工具"，用 Plugin。*

3. 如何确保 MCP 服务的安全性？
   *提示：遵循最小权限原则——数据库 MCP Server 使用只读账户或限制 Schema；使用环境变量而非硬编码管理密钥；审计所有 MCP 工具调用；对于生产环境，考虑为 MCP Server 配置独立的网络隔离；定期审查注册的 MCP Server 列表，移除不再使用的服务。特别注意：MCP Server 可以执行 SQL、访问文件系统、发送网络请求——配置越权 Server 等于开了后门。*