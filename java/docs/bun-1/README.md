# 《深入浅出 Bun：下一代 JavaScript 全能运行时与工具链实战》

> **Bun is a fast JavaScript all-in-one toolkit.** — bun.sh

本书旨在打破"Bun 只是一个更快的 Node.js"的刻板印象，将其还原为重塑前端与 Node.js 工程化体系的"All-in-One 瑞士军刀"。

## 目录

| # | 章节 | 主题 | 定位 |
|---|------|------|------|
| 01 | [环境搭建与上手](ch01-environment/README.md) | 5 分钟上手 Bun | ⭐ 入门 |
| 02 | [四大核心身份](ch02-core-identity/README.md) | Runtime / PM / Bundler / Test Runner | ⭐ 入门 |
| 03 | [包管理革命](ch03-package-manager/README.md) | bun install 深度解析 | 🛠 实战 |
| 04 | [现代打包器](ch04-bundler/README.md) | bun build 实战 | 🛠 实战 |
| 05 | [极简测试框架](ch05-test-runner/README.md) | bun test 与 Mock 机制 | 🛠 实战 |
| 06 | [极致 I/O](ch06-bun-file/README.md) | Bun.file 与 Bun.write | 🔬 深入 |
| 07 | [内置数据库](ch07-bun-sqlite/README.md) | bun:sqlite 降维打击 | 🔬 深入 |
| 08 | [编译期宏](ch08-macros/README.md) | Bun Macros | 🔬 深入 |
| 09 | [FFI](ch09-ffi/README.md) | 外部函数接口 | 🔬 深入 |
| 10 | [边缘计算](ch10-edge-htmlrewriter/README.md) | HTMLRewriter 与 WebSockets | 🔬 深入 |
| 11 | [引擎之争](ch11-jsc-vs-v8/README.md) | JavaScriptCore vs V8 | 🧠 硬核 |
| 12 | [Zig 的魅力](ch12-zig/README.md) | 系统级编程语言 Zig | 🧠 硬核 |
| 13 | [事件循环重构](ch13-event-loop/README.md) | Event Loop 深度解析 | 🧠 硬核 |
| 14 | [Web 框架](ch14-web-frameworks/README.md) | Hono / Elysia / Express | 🛠 实战 |
| 15 | [数据库与 ORM](ch15-database-orm/README.md) | Drizzle / Prisma | 🛠 实战 |
| 16 | [容器化部署](ch16-container-deploy/README.md) | Docker / CI/CD | 🛠 实战 |
| 17 | [兼容性红黑榜](ch17-compatibility/README.md) | Node.js API 兼容性 | ⚠️ 避坑 |
| 18 | [迁移 Checklist](ch18-migration-checklist/README.md) | 从 Node/npm 迁移 | ⚠️ 避坑 |
| 19 | [性能调优](ch19-performance-tuning/README.md) | 监控与调优 | ⚠️ 避坑 |
| 20 | [未来展望](ch20-future/README.md) | WinterCG / Web 标准 | 🔭 趋势 |

## 使用方式

每章独立，包含完整 README.md 和 docker-compose.yml：

```bash
cd docs/bun-1/ch01-environment
docker compose up
```

## 每章内容结构

| 段落 | 内容 |
|------|------|
| 使用场景 | 该章能力适用的具体场景与痛点 |
| 实现原理 | 底层机制深度解析，配原理图 |
| 风险与优化 | 性能/安全/兼容性风险及优化策略 |
| 典型问题处理 | Troubleshooting 指南 |
| 必备知识 | 开发人员必须掌握的前置知识 |
| 示例代码 | basic → advanced → production 三级示例 |

## 约定

- 所有示例代码使用 TypeScript
- Bun 镜像版本: `oven/bun:latest`
- Docker Compose 版本: v3.8+
