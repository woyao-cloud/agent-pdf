# TypeScript 深入浅出完全手册 — 内容生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 plan.md 大纲，生成完整的 TypeScript 手册内容（26章 + 4附录 + README + docker-compose），保存到 `docs/Typescript-0/`

**架构:** 按 9 个批次顺序生成，每批 2-4 个文件，每章统一 5 板块结构（核心概念→典型问题→示例代码→配置→技能要点）

**输出目录:** `docs/Typescript-0/`

---

### Task 0: 创建输出目录与 docker-compose.yml

**Files:**
- Create: `docs/Typescript-0/docker-compose.yml`
- Create: `docs/Typescript-0/README.md`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p "docs/Typescript-0"
```

- [ ] **Step 2: 编写 docker-compose.yml** — 提供开箱即用的 TS 开发环境

```yaml
version: "3.9"
services:
  ts-dev:
    image: node:20-alpine
    working_dir: /workspace
    volumes:
      - .:/workspace
    command: sh -c "npm init -y && npm install typescript @types/node tsx && npx tsc --init && tail -f /dev/null"
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
```

- [ ] **Step 3: 编写 README.md** — 手册使用指南

```markdown
# TypeScript 深入浅出完全手册

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

### 章节阅读顺序
- **新手**: 第1-8章 → 第16-18章 → 第13-15章
- **进阶**: 第9-12章 → 第19-21章
- **高级**: 第22-26章 → 附录

## 目录索引

| 章节 | 标题 | 适用人群 |
|------|------|---------|
| 导读 | 重新认识 TypeScript | 所有人 |
| 第1章 | 环境搭建与第一次编译 | 新手 |
| ... | ... | ... |
```

- [ ] **Step 4: 提交**

```bash
git add docs/Typescript-0/docker-compose.yml docs/Typescript-0/README.md
git commit -m "docs(ts-handbook): add docker-compose dev environment and README guide"
```

---

### Task 1: P0 — 导读 + 第1-2章（基础入门）

**Files:**
- Create: `docs/Typescript-0/ch00-intro.md`
- Create: `docs/Typescript-0/ch01-setup.md`
- Create: `docs/Typescript-0/ch02-basics.md`

**内容要点：**

- [ ] **Step 1: 生成 ch00-intro.md**
  - 核心心法：TS 是代码的"防弹衣"与"重构底气"
  - 学习路径指南（前端/后端/全栈不同路径）
  - 不要为了类型而类型，让 TS 服务于业务
  - 典型误区：认为 TS = 写更多类型注解
  - 必须掌握的技能：理解类型系统思维

- [ ] **Step 2: 生成 ch01-setup.md**
  - tsc / ts-node / tsx / Bun 运行时选型对比
  - TypeScript Playground 在线调试
  - 类型擦除原理：为什么 TS 代码在浏览器里"原形毕露"
  - 典型问题：tsc 编译后代码与预期不符（target/esModuleInterop 配置）
  - docker-compose 开发环境配置示例
  - 必须掌握的技能：tsconfig.json 基本配置

- [ ] **Step 3: 生成 ch02-basics.md**
  - 原始类型、数组、元组精确定义
  - 类型推导：为什么老手很少写 `: string`
  - 字面量类型与 `as const`
  - any / unknown / void / never 四大"虚空"类型辨析
  - 典型问题：误用 any 导致类型安全失效 vs unknown + 类型收窄
  - 必须掌握的技能：何时显式注解、何时依赖推导

- [ ] **Step 4: 提交**

```bash
git add docs/Typescript-0/ch00-intro.md docs/Typescript-0/ch01-setup.md docs/Typescript-0/ch02-basics.md
git commit -m "docs(ts-handbook): add intro and chapters 1-2 (basics and setup)"
```

---

### Task 2: P1 — 第3-4章（Interface/Type 与函数）

**Files:**
- Create: `docs/Typescript-0/ch03-interfaces.md`
- Create: `docs/Typescript-0/ch04-functions.md`

- [ ] **Step 1: 生成 ch03-interfaces.md**
  - Interface：面向对象的契约与声明合并
  - Type：万物皆可组合的瑞士军刀
  - interface vs type 企业级选型规范
  - 接口继承与类型交叉（`&`）差异与性能陷阱
  - 典型问题：声明合并的意外覆盖 / 交叉类型中的同名属性冲突
  - 必须掌握的技能：根据场景选择合适的类型定义方式

- [ ] **Step 2: 生成 ch04-functions.md**
  - 参数与返回值类型约束
  - 可选参数、默认参数、剩余参数
  - 函数重载（Overloads）
  - 回调函数与 this 指向的类型约束
  - 典型问题：重载签名顺序导致调用失败 / 回调中 this 类型丢失
  - 必须掌握的技能：函数签名设计的调用者友好原则

- [ ] **Step 3: 提交**

```bash
git add docs/Typescript-0/ch03-interfaces.md docs/Typescript-0/ch04-functions.md
git commit -m "docs(ts-handbook): add chapters 3-4 (interfaces, types, functions)"
```

---

### Task 3: P2 — 第5-8章（核心进阶）

**Files:**
- Create: `docs/Typescript-0/ch05-unions.md`
- Create: `docs/Typescript-0/ch06-generics.md`
- Create: `docs/Typescript-0/ch07-classes.md`
- Create: `docs/Typescript-0/ch08-guards.md`

- [ ] **Step 1: 生成 ch05-unions.md**
  - 联合类型（`|`）与类型收窄（Narrowing）
  - 判别联合类型（Discriminated Unions）：状态机建模
  - 交叉类型（`&`）：Mixin 模式
  - 结构类型系统（鸭子类型）与多余属性检查
  - 典型问题：联合类型收窄不充分 / 交叉类型的属性冲突
  - 必须掌握的技能：用判别联合建模复杂状态

- [ ] **Step 2: 生成 ch06-generics.md**
  - 泛型比喻：月饼模具与月饼
  - 泛型约束（extends）与默认泛型
  - 多泛型参数与推导联动效应
  - 泛型在类、接口、箭头函数中的语法细节
  - 典型问题：泛型约束不足导致类型不安全 / 箭头函数泛型语法错误
  - 必须掌握的技能：设计泛型 API 时考虑调用者推导体验

- [ ] **Step 3: 生成 ch07-classes.md**
  - public / private / protected / # 私有字段
  - readonly 与参数属性（Parameter Properties）
  - 抽象类与接口实现（implements）
  - TS 类与 ES6 类的编译差异
  - 典型问题：private 编译后不生效 / 参数属性与装饰器冲突
  - 必须掌握的技能：理解 TS 类编译输出

- [ ] **Step 4: 生成 ch08-guards.md**
  - TS 控制流分析原理
  - 自定义类型守卫（is 关键字）
  - 断言函数（asserts）
  - 闭包与异步回调中的类型"遗忘"问题
  - 典型问题：Array.filter 无法收窄类型 / async 回调中类型丢失
  - 必须掌握的技能：编写可复用的自定义类型守卫

- [ ] **Step 5: 提交**

```bash
git add docs/Typescript-0/ch05-unions.md docs/Typescript-0/ch06-generics.md docs/Typescript-0/ch07-classes.md docs/Typescript-0/ch08-guards.md
git commit -m "docs(ts-handbook): add chapters 5-8 (unions, generics, classes, guards)"
```

---

### Task 4: P3 — 第9-12章（类型体操）

**Files:**
- Create: `docs/Typescript-0/ch09-mapped.md`
- Create: `docs/Typescript-0/ch10-conditional.md`
- Create: `docs/Typescript-0/ch11-template-literals.md`
- Create: `docs/Typescript-0/ch12-utility.md`

- [ ] **Step 1: 生成 ch09-mapped.md** — keyof / 索引访问 / 映射类型 / 键值重映射 / 手写工具类型
- [ ] **Step 2: 生成 ch10-conditional.md** — 条件类型 / 分布式条件类型 / infer / 手写 ReturnType
- [ ] **Step 3: 生成 ch11-template-literals.md** — 模板字面量 / 大小写转换 / 类型安全 EventBus
- [ ] **Step 4: 生成 ch12-utility.md** — 内置工具类型源码解析 / NoInfer / satisfies
- [ ] **Step 5: 提交**

```bash
git add docs/Typescript-0/ch09-mapped.md docs/Typescript-0/ch10-conditional.md docs/Typescript-0/ch11-template-literals.md docs/Typescript-0/ch12-utility.md
git commit -m "docs(ts-handbook): add chapters 9-12 (type gymnastics)"
```

---

### Task 5: P4 — 第13-15章（工程化）

**Files:**
- Create: `docs/Typescript-0/ch13-tsconfig.md`
- Create: `docs/Typescript-0/ch14-declarations.md`
- Create: `docs/Typescript-0/ch15-toolchain.md`

- [ ] **Step 1: 生成 ch13-tsconfig.md** — target/module/moduleResolution / 严格模式 / paths / 增量编译
- [ ] **Step 2: 生成 ch14-declarations.md** — 模块解析 / .d.ts 编写 / declare / @types
- [ ] **Step 3: 生成 ch15-toolchain.md** — Vite/esbuild/SWC/Babel / tsup / ESLint + Prettier
- [ ] **Step 4: 提交**

```bash
git add docs/Typescript-0/ch13-tsconfig.md docs/Typescript-0/ch14-declarations.md docs/Typescript-0/ch15-toolchain.md
git commit -m "docs(ts-handbook): add chapters 13-15 (engineering toolchain)"
```

---

### Task 6: P5 — 第16-18章（框架实战）

**Files:**
- Create: `docs/Typescript-0/ch16-react.md`
- Create: `docs/Typescript-0/ch17-vue.md`
- Create: `docs/Typescript-0/ch18-node.md`

- [ ] **Step 1: 生成 ch16-react.md** — FC 废弃之争 / Props 推导 / 泛型组件 / Hooks 类型
- [ ] **Step 2: 生成 ch17-vue.md** — script setup / defineProps / ref/reactive 陷阱 / Pinia
- [ ] **Step 3: 生成 ch18-node.md** — Express/NestJS/Hono / Prisma/Drizzle / tRPC
- [ ] **Step 4: 提交**

```bash
git add docs/Typescript-0/ch16-react.md docs/Typescript-0/ch17-vue.md docs/Typescript-0/ch18-node.md
git commit -m "docs(ts-handbook): add chapters 16-18 (framework practice)"
```

---

### Task 7: P6 — 第19-21章（排坑与原理）

**Files:**
- Create: `docs/Typescript-0/ch19-errors.md`
- Create: `docs/Typescript-0/ch20-antipatterns.md`
- Create: `docs/Typescript-0/ch21-compiler.md`

- [ ] **Step 1: 生成 ch19-errors.md** — 拆解超长报错 / 常见报错字典 / @ts-expect-error
- [ ] **Step 2: 生成 ch20-antipatterns.md** — any 滥用 / enum 弊端 / 伪泛型 / 团队规范
- [ ] **Step 3: 生成 ch21-compiler.md** — 编译器5阶段 / AST 初探 / 编译性能 / 协变逆变
- [ ] **Step 4: 提交**

```bash
git add docs/Typescript-0/ch19-errors.md docs/Typescript-0/ch20-antipatterns.md docs/Typescript-0/ch21-compiler.md
git commit -m "docs(ts-handbook): add chapters 19-21 (troubleshooting and compiler)"
```

---

### Task 8: P7 — 第22-26章（开发者素养）

**Files:**
- Create: `docs/Typescript-0/ch22-api-design.md`
- Create: `docs/Typescript-0/ch23-boundary.md`
- Create: `docs/Typescript-0/ch24-ide-debug.md`
- Create: `docs/Typescript-0/ch25-perf-tuning.md`
- Create: `docs/Typescript-0/ch26-migration.md`

- [ ] **Step 1: 生成 ch22-api-design.md** — 调用者体验 / 防御性 API / Branded Types / 避免类型体操滥用
- [ ] **Step 2: 生成 ch23-boundary.md** — 运行时校验 / Zod/Valibot/TypeBox / z.infer / API 网关校验
- [ ] **Step 3: 生成 ch24-ide-debug.md** — 悬停跳转 / TypeScript Playground / tsd / expect-type
- [ ] **Step 4: 生成 ch25-perf-tuning.md** — 性能瓶颈识别 / 调优手段 / CI 监控
- [ ] **Step 5: 生成 ch26-migration.md** — JS→TS 迁移策略 / allowJs / 渐进式推进
- [ ] **Step 6: 提交**

```bash
git add docs/Typescript-0/ch22-api-design.md docs/Typescript-0/ch23-boundary.md docs/Typescript-0/ch24-ide-debug.md docs/Typescript-0/ch25-perf-tuning.md docs/Typescript-0/ch26-migration.md
git commit -m "docs(ts-handbook): add chapters 22-26 (developer literacy)"
```

---

### Task 9: P8 — 附录

**Files:**
- Create: `docs/Typescript-0/appendix-a-cheatsheet.md`
- Create: `docs/Typescript-0/appendix-b-migration-checklist.md`
- Create: `docs/Typescript-0/appendix-c-interview.md`
- Create: `docs/Typescript-0/appendix-d-resources.md`

- [ ] **Step 1: 生成 appendix-a-cheatsheet.md** — 核心关键字与工具类型速查表
- [ ] **Step 2: 生成 appendix-b-migration-checklist.md** — JS→TS 迁移 Checklist
- [ ] **Step 3: 生成 appendix-c-interview.md** — 面试题与类型体操手写题解析
- [ ] **Step 4: 生成 appendix-d-resources.md** — 推荐资源与开源项目阅读指南
- [ ] **Step 5: 提交**

```bash
git add docs/Typescript-0/appendix-a-cheatsheet.md docs/Typescript-0/appendix-b-migration-checklist.md docs/Typescript-0/appendix-c-interview.md docs/Typescript-0/appendix-d-resources.md
git commit -m "docs(ts-handbook): add appendices A-D"
```
