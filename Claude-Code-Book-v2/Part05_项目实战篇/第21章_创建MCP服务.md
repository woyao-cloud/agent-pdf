# 第21章：创建 MCP 服务

## 章节概述

本章介绍如何使用 Claude Code 创建一个 MCP（Model Context Protocol）服务。MCP 是 Anthropic 提出的标准化协议，允许将外部工具和数据源连接到 AI 模型。通过开发一个天气查询 MCP 服务，你将学会协议实现、工具注册、服务部署到与 Claude Code 集成的完整流程。MCP 服务是扩展 Claude Code 能力的最强大方式之一，它让 Claude 能够访问实时数据、调用外部系统、操作文件等。

## 学习目标

- 理解 MCP 服务的架构和协议
- 掌握 MCP 服务的开发流程
- 学会注册和实现工具
- 能够部署和测试 MCP 服务

## 核心知识点

### 1. MCP 服务架构

#### MCP 协议详解

MCP（Model Context Protocol）是一种基于 JSON-RPC 2.0 的通信协议。它定义了 AI 模型（客户端）与外部工具和数据源（服务端）之间的标准化交互方式。

MCP 的核心概念：

- **工具 (Tools)**: 可供 AI 模型调用的函数，如 `get_weather`、`read_file`、`search_web`。工具需要定义输入参数（JSON Schema）和返回格式。
- **资源 (Resources)**: 暴露给 AI 模型的数据源，如数据库表、文件内容、API 响应。资源有固定的 URI 标识。
- **提示模板 (Prompts)**: 预定义的交互模板，引导 AI 模型以特定的方式处理任务。

MCP 的通信流程：

```
用户提问 → Claude Code → (JSON-RPC) → MCP Server
                                        → Tool A
                                        → Resource B
              ← (JSON-RPC) ← MCP Server
Claude Code 组织回答 → 用户看到结果
```

每次工具调用都是独立的 JSON-RPC 请求，包含 `id`、`method`、`params`。服务端处理后返回包含 `result` 或 `error` 的响应。

#### 服务端架构设计

一个 MCP 服务的标准架构：

```
mcp-weather-server/
├── src/
│   ├── server.ts          # MCP 服务主文件
│   ├── tools/
│   │   ├── current.ts     # 当前天气查询工具
│   │   └── forecast.ts    # 天气预报查询工具
│   └── utils/
│       └── weather_api.ts # 外部天气 API 调用
├── package.json
├── tsconfig.json
└── README.md
```

MCP 服务本质上是一个长时间运行的进程，通过标准输入/输出（stdio）或 HTTP 与 Claude Code 通信。stdio 模式是推荐的开发方式，因为配置简单、无需管理网络端口。

向 Claude Code 发起项目初始化：

```
/start 我需要创建一个 MCP 天气查询服务。
使用 TypeScript，通过 @modelcontextprotocol/sdk 开发。
功能：
1. 查询指定城市的当前天气（温度、湿度、风速、天气状况）
2. 查询指定城市的 3 天天气预报
天气数据从 OpenWeatherMap API 获取（模拟数据也可以）。
请创建完整的项目结构。
```

#### 工具定义规范

每个 MCP 工具需要定义三个要素：

```typescript
// 工具定义示例
const GET_WEATHER_TOOL = {
  name: "get_weather",           // 工具名称，AI 模型用来调用
  description: "Get current weather for a city",
  inputSchema: {                  // JSON Schema 描述输入参数
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "City name (e.g., Beijing, Tokyo, New York)",
      },
      units: {
        type: "string",
        enum: ["metric", "imperial"],
        description: "Temperature units",
        default: "metric",
      },
    },
    required: ["city"],
  },
};
```

工具名称使用 snake_case，描述要清晰准确——AI 模型会通过描述来理解何时调用这个工具。

### 2. 服务开发

#### 项目初始化

```bash
mkdir mcp-weather-server && cd mcp-weather-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node ts-node
npx tsc --init --target ES2022 --module NodeNext --moduleResolution NodeNext --outDir dist
```

`@modelcontextprotocol/sdk` 是 Anthropic 官方提供的 MCP 开发工具包，封装了 JSON-RPC 通信、服务器生命周期、工具注册等底层细节。

#### 服务主文件实现

```typescript
// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// 创建 MCP 服务实例
const server = new Server(
  {
    name: "weather-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},  // 声明本服务提供工具调用能力
    },
  }
);
```

`Server` 构造函数接收两个参数：
1. **服务信息**: `name` 和 `version`，用于标识服务
2. **能力声明**: 告诉 Claude Code 本服务支持哪些功能（如 tools、resources）

#### 工具定义与注册

定义工具处理函数，使用 Zod 做参数验证：

```typescript
// 工具：获取当前天气
const GetWeatherSchema = z.object({
  city: z.string().min(1, "City name is required"),
  units: z.enum(["metric", "imperial"]).default("metric"),
});

type GetWeatherParams = z.infer<typeof GetWeatherSchema>;

async function getWeather(params: GetWeatherParams) {
  const { city, units } = params;
  const tempUnit = units === "metric" ? "°C" : "°F";
  const windUnit = units === "metric" ? "m/s" : "mph";

  // 模拟天气数据（实际项目中应调用真实的天气 API）
  const weatherData: Record<string, any> = {
    "Beijing": { temp: 22, humidity: 45, wind: 3.5, condition: "Sunny" },
    "Tokyo": { temp: 26, humidity: 70, wind: 2.0, condition: "Cloudy" },
    "New York": { temp: 18, humidity: 55, wind: 4.2, condition: "Rainy" },
    "London": { temp: 15, humidity: 75, wind: 5.0, condition: "Overcast" },
    "default": { temp: 20, humidity: 50, wind: 3.0, condition: "Partly Cloudy" },
  };

  const data = weatherData[city] || weatherData["default"];

  return {
    content: [
      {
        type: "text",
        text: [
          `Weather in ${city}:`,
          `🌡 Temperature: ${data.temp}${tempUnit}`,
          `💧 Humidity: ${data.humidity}%`,
          `💨 Wind: ${data.wind} ${windUnit}`,
          `🌤 Condition: ${data.condition}`,
        ].join("\n"),
      },
    ],
  };
}

// 工具：获取天气预报
const GetForecastSchema = z.object({
  city: z.string().min(1, "City name is required"),
  days: z.number().int().min(1).max(7).default(3),
});

async function getForecast(params: z.infer<typeof GetForecastSchema>) {
  const { city, days } = params;
  const forecasts = [];

  const conditions = ["Sunny", "Cloudy", "Rainy", "Partly Cloudy", "Overcast"];
  for (let i = 1; i <= days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    forecasts.push({
      date: date.toISOString().split("T")[0],
      temp_high: Math.round(20 + Math.random() * 10),
      temp_low: Math.round(10 + Math.random() * 8),
      condition: conditions[Math.floor(Math.random() * conditions.length)],
    });
  }

  const lines = [`${days}-day forecast for ${city}:`, ""];
  for (const f of forecasts) {
    lines.push(`📅 ${f.date}: ${f.condition}, ${f.temp_low}°C - ${f.temp_high}°C`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
```

#### 请求处理

MCP 协议的核心是处理两种请求：列出工具列表（`ListTools`）和调用工具（`CallTool`）。

```typescript
// 列出所有可用工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_weather",
        description: "Get current weather conditions for a city",
        inputSchema: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "City name (e.g., Beijing, Tokyo, New York)",
            },
            units: {
              type: "string",
              enum: ["metric", "imperial"],
              description: "Temperature units (metric=°C, imperial=°F)",
              default: "metric",
            },
          },
          required: ["city"],
        },
      },
      {
        name: "get_forecast",
        description: "Get weather forecast for a city",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name" },
            days: {
              type: "number",
              description: "Number of days (1-7)",
              default: 3,
            },
          },
          required: ["city"],
        },
      },
    ],
  };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_weather": {
        const params = GetWeatherSchema.parse(args);
        return await getWeather(params);
      }
      case "get_forecast": {
        const params = GetForecastSchema.parse(args);
        return await getForecast(params);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid arguments: ${error.errors.map(e => e.message).join(", ")}`);
    }
    throw error;
  }
});
```

`ZodError` 的处理很重要——当 AI 模型调用工具提供了错误的参数格式时，清晰的错误信息帮助 Claude 自我纠正并重新调用。

#### 启动服务

```typescript
// 启动 MCP 服务（通过 stdio 与 Claude Code 通信）
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
```

`StdioServerTransport` 让 MCP 服务通过标准输入/输出与 Claude Code 通信。Claude Code 启动 MCP 服务作为子进程，通过其 stdin 发送 JSON-RPC 请求，从 stdout 读取响应。

注意：`console.error` 用于日志输出，`console.log` 会被 JSON-RPC 通信使用，不要直接用于日志。

### 3. 测试与调试

#### 本地测试方法

开发时可以用 MCP Inspector 工具进行交互式测试：

```bash
# 使用 MCP Inspector 测试
npx @modelcontextprotocol/inspector dist/server.js
```

启动后打开浏览器访问 Inspector 的 Web UI。在工具列表中选择 `get_weather`，输入参数 `{"city": "Tokyo"}`，点击执行，在响应区域查看返回的天气数据。Inspector 会自动列出所有注册的工具并允许你逐个测试。

也可以直接通过 stdio 手动测试：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server.js
```

正常响应会输出：

```json
{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"get_weather",...},{"name":"get_forecast",...}]}}
```

#### 添加错误处理和日志

```typescript
import fs from "fs";

// 将日志写入文件，避免干扰 stdio
const logStream = fs.createWriteStream("server.log", { flags: "a" });

function log(level: string, message: string, data?: any) {
  const entry = { timestamp: new Date().toISOString(), level, message, data };
  logStream.write(JSON.stringify(entry) + "\n");
}

// 在请求处理中添加日志
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log("info", `Tool called: ${name}`, args);
  try {
    const result = await toolHandlers[name](args);
    log("info", `Tool success: ${name}`, result);
    return result;
  } catch (error) {
    log("error", `Tool failed: ${name}`, { error: String(error) });
    throw error;
  }
});
```

### 4. 部署与集成

#### Claude Code 集成配置

在项目中创建 `.opencode.jsonc` 或直接修改项目配置：

```jsonc
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["path/to/mcp-weather-server/dist/server.js"],
      "env": {
        "WEATHER_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

或者如果是全局配置，在 `~/.config/opencode/mcp.json` 中添加。

配置说明：
- **`command`**: 启动服务的可执行文件
- **`args`**: 命令行参数
- **`env`**: 环境变量，用于传递 API Key 等敏感配置，不要硬编码在代码中

集成后，在 Claude Code 中对话：

```
北京现在的天气怎么样？
```

Claude Code 会自动检测到可用的 `get_weather` 工具，调用它获取天气数据，然后组织回答：

> 北京当前的天气情况：
> 🌡 温度：22°C
> 💧 湿度：45%
> 💨 风速：3.5 m/s
> 🌤 天气状况：晴天

**Claude Code 交互效果描述**：当你输入天气查询后，Claude Code 会在回复中显示一条工具调用记录，格式类似 `🔧 Calling tool: get_weather({"city": "Beijing"})`，然后显示工具返回的原始数据，最后 Claude 将这些数据整理为自然语言回答。整个过程对用户透明，用户可以查看工具调用了哪些参数、返回了什么数据。

#### 安全配置

MCP 服务的安全注意事项：

```typescript
// 输入验证：防止 SSRF 和其他注入攻击
const GetWeatherSchema = z.object({
  city: z.string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z\s\-]+$/, "City name contains invalid characters"),
});

// 速率限制
const rateLimits = new Map<string, number[]>();
const MAX_REQUESTS = 10;  // 每 60 秒最多 10 次
const WINDOW_MS = 60 * 1000;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimits.get(clientId) || [];
  const recent = timestamps.filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return false;
  recent.push(now);
  rateLimits.set(clientId, recent);
  return true;
}
```

#### 版本管理

在 `package.json` 中管理 MCP 服务的版本，使用语义化版本控制：

```json
{
  "version": "0.2.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "ts-node src/server.ts",
    "inspect": "npx @modelcontextprotocol/inspector dist/server.js"
  }
}
```

更新 MCP 服务后，Claude Code 会在下次对话时自动加载新版本（如果使用 stdio 模式，Claude 进程重启时会重新启动服务进程）。

## 实战练习

### 完整项目步骤

**步骤 1**: 创建 MCP 服务项目

```
请帮我创建一个 TypeScript MCP 天气服务项目 mcp-weather-server。
使用 @modelcontextprotocol/sdk，
包含 get_weather 和 get_forecast 两个工具。
```

**步骤 2**: 编译并测试

```bash
cd mcp-weather-server
npm run build

# 使用 MCP Inspector 交互式测试
npm run inspect
```

**步骤 3**: 集成到 Claude Code

编辑 `opencode.json`（在当前项目或全局配置中）：

```jsonc
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["D:/projects/mcp-weather-server/dist/server.js"]
    }
  }
}
```

**步骤 4**: 在 Claude Code 中测试

```
有哪些工具可以用？
```
Claude Code 应该列出 `get_weather` 和 `get_forecast`。

```
东京这周天气怎么样？
帮我比较一下北京和伦敦的天气。
```

**步骤 5**: 扩展功能（选做）

```
请给 MCP 天气服务添加一个 get_air_quality 工具，
查询指定城市的空气质量指数（AQI）。
同样使用模拟数据，包含 PM2.5、PM10、O3 指标。
```

**步骤 6**: 添加真实 API 调用

```
请修改 get_weather 工具，使用 OpenWeatherMap 的公共 API
（api.openweathermap.org/data/2.5/weather）。
API Key 通过环境变量 WEATHER_API_KEY 传入。
```

## 本章小结

1. **MCP 是 AI 模型与外部世界的桥梁**：MCP 协议通过标准化的 JSON-RPC 接口，让 Claude Code 能够调用任何外部工具和数据源。相比 Function Calling 的非标准实现，MCP 提供了统一的协议规范。

2. **工具定义质量决定 AI 调用准确性**：工具名称使用 snake_case，描述要详细清晰（包括参数格式、单位、约束条件），输入 Schema 要精确到枚举值和默认值。描述越准确，AI 模型越能正确地调用工具。

3. **Zod 验证防止参数错误**：AI 模型可能生成格式不正确的参数，Zod 的运行时验证确保了输入安全。配合清晰的错误信息，Claude 能自动修正参数重试。

4. **Stdio 传输模式最简单**：开发阶段使用 StdioServerTransport，不用管理端口和网络配置，Claude Code 自动管理服务进程的生命周期。

5. **MCP Inspector 是必备的调试工具**：它提供了交互式界面来测试工具调用，查看请求/响应 JSON 数据，比手动向 stdio 写入 JSON-RPC 请求高效得多。

6. **安全始终是第一优先级**：输入验证、速率限制、API Key 使用环境变量而非硬编码，是 MCP 服务安全的基础。Claude Code 的沙箱机制提供了额外的安全保障。

## 思考题

1. **MCP 服务和传统 REST API 在设计上有什么不同？**
   - **提示**: MCP 服务面向 AI 模型而非人类开发者，所以：(1) 输入 Schema 使用 JSON Schema 而非自定义文档，让 AI 模型能理解参数约束；(2) 输出格式要以自然语言文本为主（`type: "text"`），而非原始 JSON，因为 AI 模型要拿文本组织回答；(3) 工具名称和描述要大写清晰，REST API 的端点路径对 AI 模型不够直观；(4) MCP 没有 HTTP 动词概念，所有交互通过 `CallTool` 统一方法。

2. **MCP 服务的安全性如何保障？**
   - **提示**: 三个层面的保障——(1) **输入层面**：Zod Schema 验证 + 正则过滤特殊字符 + 参数长度限制，防止注入攻击和 SSRF；(2) **调用层面**：速率限制（防止滥用）、调用白名单（限制可调用的外部 API）、权限控制（区分只读和写入工具）；(3) **部署层面**：API Key 通过环境变量而非代码配置、使用独立的低权限系统账户运行 MCP 服务、定期审核工具调用日志。MCP 协议本身也在演进，未来会内置更完善的权限模型。