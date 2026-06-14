# 《深入理解 Effect-TS》书籍生成设计文档

- **日期**: 2026-06-13
- **状态**: 已批准
- **作者**: Claude

## 核心决策

| 决策 | 选择 |
|:--|:--|
| 内容风格 | 深度参考书（每章 3000-5000 字） |
| 语言 | 简体中文 |
| 目录结构 | 混合（原理按 Part 目录，场景独立子目录） |
| Part 2 场景 | 全部 4 个场景带独立可运行项目 + Docker Compose |
| 每章模板 | 8 模块（使用场景/原理/风险/优化/排障/技能/示例/Docker） |

## 目录结构

```
docs/Effect-ts/
├── part1-principles/
│   ├── ch01-why-effect.md          # 原生异步的缺陷与 Effect 破局
│   └── ch02-fiber-runtime.md       # 执行引擎与 Fiber 模型
├── part2-scenarios/
│   ├── ch03-error-handling/        # 错误处理与领域建模
│   │   ├── index.md, src/, tests/, docker-compose.yml
│   ├── ch04-di-context/            # 依赖注入与 Context
│   │   ├── index.md, src/, tests/, docker-compose.yml
│   ├── ch05-resource-scope/        # 资源管理与 Scope
│   │   ├── index.md, src/, tests/, docker-compose.yml
│   └── ch06-structured-concurrency/ # 高并发控制
│       ├── index.md, src/, tests/, docker-compose.yml
├── part3-advanced/
│   ├── ch07-stream.md              # Stream 流处理
│   ├── ch08-concurrency-primitives.md # Ref/Queue/Hub
│   └── ch09-schedule.md            # Schedule 调度器
├── part4-engineering/
│   ├── ch10-schema.md              # @effect/schema
│   ├── ch11-testability.md         # 可测试性
│   └── ch12-ecosystem.md           # 与现有框架融合
└── part5-troubleshooting/
    ├── ch13-dx-pain.md             # 开发体验痛点
    ├── ch14-runtime-debug.md       # 运行时排查
    └── ch15-performance.md         # 性能调优
```