# Effect-TS 深度技术参考

基于 Effect-TS 3.x，涵盖核心原理、实战场景、高级特性、工程化实践与性能调优。

## 章节索引

### 第一部分：核心原理
- [第 1 章：原生异步的"原罪"与 Effect 的破局](ch01-async-woes/README.md)
- [第 2 章：执行引擎与 Fiber（纤程）模型](ch02-fiber-model/README.md)

### 第二部分：核心场景实战
- [第 3 章：极致的错误处理与领域建模](ch03-error-handling/README.md)
- [第 4 章：依赖注入与上下文管理](ch04-di-context/README.md)
- [第 5 章：资源管理与 Scope](ch05-resource-scope/README.md)
- [第 6 章：高并发控制与结构化并发](ch06-concurrency/README.md)

### 第三部分：高级特性
- [第 7 章：Stream 流处理](ch07-stream/README.md)
- [第 8 章：并发原语](ch08-concurrency-primitives/README.md)
- [第 9 章：Schedule 调度器](ch09-schedule/README.md)

### 第四部分：工程化
- [第 10 章：@effect/schema](ch10-schema/README.md)
- [第 11 章：可测试性](ch11-testability/README.md)
- [第 12 章：框架集成](ch12-framework-integration/README.md)

### 第五部分：排坑与调优
- [第 13 章：开发体验痛点](ch13-dx-pain-points/README.md)
- [第 14 章：运行时排查](ch14-runtime-debug/README.md)
- [第 15 章：性能调优](ch15-performance-checklist/README.md)

### 附录
- [附录 A：API 对照速查表](appendix-a-api-comparison.md)
- [附录 B：pipe → Effect.gen 迁移指南](appendix-b-pipe-to-gen.md)
- [附录 C：社区生态推荐](appendix-c-ecosystem.md)
- [附录 D：面试高频问题](appendix-d-interview.md)

## Docker Compose 环境
- [错误处理（PostgreSQL）](assets/docker/docker-compose.ch03.yml)
- [依赖注入（多服务）](assets/docker/docker-compose.ch04.yml)
- [并发控制（Redis）](assets/docker/docker-compose.ch06.yml)
- [Stream（Kafka）](assets/docker/docker-compose.ch07.yml)
- [Schedule（Redis）](assets/docker/docker-compose.ch09.yml)
- [Schema（API Server）](assets/docker/docker-compose.ch10.yml)
- [框架集成（Fastify + PostgreSQL）](assets/docker/docker-compose.ch12.yml)
