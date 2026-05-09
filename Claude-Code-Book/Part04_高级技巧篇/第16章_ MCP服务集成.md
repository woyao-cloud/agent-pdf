# 第16章 MCP 服务集成
## 16.1 MCP 概述
### 16.1.1 什么是 MCP
**MCP（Model Context Protocol）定义**MCP 是一个标准化的协议，用于连接 AI 系统与外部服务。它提供了一种统一的方式，让 Claude Code 能够与各种外部工具和数据源进行交互。**MCP 核心概念**```mermaidgraph TBA[Claude Code] --> B[MCP Client]B --> C[MCP Server]C --> D[外部服务]C --> E[数据库]C --> F[文件系统]```**MCP 架构**```python# MCP 客户端示例from mcp import Client, Server# 连接到 MCP 服务器client = Client("mcp://localhost:8080")# 调用服务result = client. call("database", "query", {    "sql": "SELECT * FROM users" })```### 16.1.2 架构与原理
**MCP 工作流程**1. 客户端发送请求到 MCP 服务器2. 服务器处理请求3. 服务器调用外部服务4. 返回结果给客户端**消息格式**```json{  "jsonrpc": "2.0",  "id": 1,  "method": "tools/call",  "params": {    "name": "query_database",    "arguments": {      "sql": "SELECT * FROM users"    }  }}```### 16.1.3 生态系统
**常用 MCP 服务**| 服务 | 功能 | 使用场景 ||------|------|----------|| Database | 数据库查询 | 数据分析、CRUD || Filesystem | 文件操作 | 文件管理 || API | HTTP 请求 | 第三方 API 集成 || Git | Git 操作 | 版本控制 || Search | 搜索 | 信息检索 |```bash# 查看可用服务claude --list-mcp-services# 配置文件路径~/.claude/mcp. json```## 16.2 常用 MCP 服务
### 16.2.1 数据库连接
**配置数据库服务**```json
{  "mcp_servers": {    "database": {      "command": "mcp-server-database",      "args": [        "--type", "postgresql",        "--host", "localhost",        "--port", "5432",        "--database", "mydb"      ]    }  }}```**使用数据库服务**```bashclaude "查询用户表中的前 10 条记录"claude "在 users 表中插入一条新记录"claude "统计每日的订单数量"```### 16.2.2 API 调用
**配置 API 服务**```json
{  "mcp_servers": {    "http": {      "command": "mcp-server-http",      "env": {        "BASE_URL": "https://api. example. com"      }    }  }}```**使用 API 服务**```bashclaude "调用 GET /users 接口获取用户列表"claude "调用 POST /orders 接口创建订单"```### 16.2.3 文件系统
**配置文件系统服务**```json
{  "mcp_servers": {    "filesystem": {      "command": "mcp-server-filesystem",      "args": [        "--allowed-paths", "/home/user/projects"      ]    }  }}```**使用文件系统服务**```bashclaude "列出 /home/user/projects 目录下的所有文件"claude "读取 /home/user/projects/README. md 的内容"claude "创建新文件 /home/user/projects/test. py"```## 16.3 自定义 MCP
### 16.3.1 开发流程
**创建 MCP 服务**```python
from mcp. server import Server, Tool, Resourceclass MyService:    def __init__(self):        self. server = Server("my-service")        @self. server. tool()        def custom_tool(arg1: str, arg2: int) -> str:            """自定义工具的描述"""            return f"Result: {arg1}, {arg2}"        @self. server. resource()        def custom_resource(uri: str) -> str:            """自定义资源的描述"""            return "Resource content"    def start(self):        self. server. run()```**注册服务**```json
{  "mcp_servers": {    "my-service": {      "command": "python",      "args": ["/path/to/my_service. py"]    }  }}```### 16.3.2 服务注册
**服务发现**```python# 服务注册示例@service_registry.register(name="email")class EmailService:    def send(self, to, subject, body):        pass# 自动发现@service_registry.autodiscover()class AutoService:    pass```### 16.3.3 调试与部署
**本地调试**```bash# 启动 MCP 服务（调试模式）python my_service. py --debug# 测试服务claude "使用 my-service 的 custom-tool 测试"```**部署配置**```yaml
# docker-compose. ymlversion: '3.8'services:  mcp-server:    build: .    ports:      - "8080:8080"    environment:      - LOG_LEVEL=info```## 本章小结本章介绍了 MCP 服务集成。涵盖 MCP 概念与原理、常用服务（数据库、API、文件系统）的使用，以及自定义 MCP 服务的开发、注册和部署。## 练习题1. 配置一个数据库 MCP 服务2. 开发一个自定义 MCP 服务3. 部署 MCP 服务到生产环境