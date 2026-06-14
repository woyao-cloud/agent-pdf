# TypeScript 深入浅出完全手册

> 从入门到架构级的 TypeScript 完全学习指南

## 使用方法

### 在线方式
1. 打开 [TypeScript Playground](https://www.typescriptlang.org/play)
2. 复制各章示例代码到编辑器中运行

### 本地方式
```bash
# 使用 Docker（推荐）
docker compose up -d
docker compose exec ts-dev sh

# 或本地安装
npm install -g typescript tsx
tsc --init
```

## 章节阅读顺序

| 读者类型 | 阅读路径 |
|---------|---------|
| **新手** | 第1-8章 → 第16-18章 → 第13-15章 |
| **进阶** | 第9-12章 → 第19-21章 |
| **高级** | 第22-26章 → 附录 |

## 目录索引

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 导读 | 重新认识 TypeScript | 学习路径、核心心法 |
| 第1章 | 环境搭建与第一次编译 | 运行时选型、Playground、类型擦除 |
| 第2章 | 基础类型与类型推导 | 原始类型、推导、字面量类型、虚空类型 |
| 第3章 | Interface 与 Type | 接口、类型别名、选型规范 |
| 第4章 | 函数的类型契约 | 参数/返回值、重载、this 约束 |
| 第5章 | 联合与交叉 | 联合类型收窄、判别联合、交叉类型 |
| 第6章 | 泛型 | 泛型约束、多参数、推导联动 |
| 第7章 | 类与面向对象 | 访问修饰符、抽象类、编译差异 |
| 第8章 | 类型守卫 | 控制流分析、自定义守卫、断言函数 |
| 第9章 | 映射类型 | keyof、映射类型、键值重映射 |
| 第10章 | 条件类型与 infer | 条件类型、分布式、模式匹配 |
| 第11章 | 模板字面量类型 | 字符串拼接、EventBus 实战 |
| 第12章 | 内置工具类型 | 源码解析、NoInfer、satisfies |
| 第13章 | tsconfig.json 完全配置 | 编译目标、严格模式、路径映射 |
| 第14章 | 模块解析与声明文件 | 模块策略、.d.ts、@types |
| 第15章 | 现代构建工具链 | Vite/esbuild/SWC、tsup、ESLint |
| 第16章 | React 实战 | FC 废弃、泛型组件、Hooks 类型 |
| 第17章 | Vue 3 实战 | script setup、ref/reactive、Pinia |
| 第18章 | Node.js 全栈 | Express/NestJS、ORM、tRPC |
| 第19章 | 看懂 TS 报错信息 | 拆解超长报错、@ts-expect-error |
| 第20章 | 反模式与代码审查 | any 滥用、enum 弊端、团队规范 |
| 第21章 | 编译器底层原理 | 5 阶段、AST、协变逆变 |
| 第22章 | 类型驱动 API 设计 | 调用者体验、Branded Types |
| 第23章 | 跨越运行时边界 | Zod 校验、z.infer、API 网关 |
| 第24章 | IDE 调试与类型探查 | 悬停跳转、Playground、类型测试 |
| 第25章 | 编译性能监控调优 | 性能瓶颈、增量编译、CI 监控 |
| 第26章 | 平滑迁移与渐进式重构 | JS→TS 迁移、allowJs 策略 |
