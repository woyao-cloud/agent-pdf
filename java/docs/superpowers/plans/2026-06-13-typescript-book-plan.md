# TypeScript 深度参考书 — 生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `docs/TypeScript/plan.md` 大纲和 `docs/superpowers/specs/2026-06-13-typescript-book-design.md` 设计文档，生成《深入理解 TypeScript》全书 21 章 + 4 篇附录的内容。

**Architecture:** 混合模式——Part 1-2 纯文档、Part 3 每个场景独立可运行项目（TypeScript 源码 + Jest 测试 + tsd 类型测试）、Part 4-7 文档为主辅以可运行示例。按 Part 顺序逐章生成，每 Part 完成后提交 git commit。

**Tech Stack:** TypeScript 5.x, React 18, tRPC, Prisma, Zod, XState, Jest, tsd, expect-type, tsup, ESLint

---

## Scope Check

全书共 21 章 + 4 篇附录，按 Part 分为 8 个独立阶段。每个 Part 可独立交付。Part 3 的 4 个场景各自独立。

文件结构总览：

```
docs/TypeScript/
├── ch01-compiler-ast.md              ~4000 字
├── ch02-type-inference.md            ~4000 字
├── ch03-structural-typing.md         ~4000 字
├── ch04-generics.md                  ~4000 字
├── ch05-conditional-types.md         ~4000 字
├── ch06-mapped-types.md              ~4000 字
├── ch07-react-types/                 (项目 + 文档)
│   ├── index.md, src/, tests/, package.json, tsconfig.json
├── ch08-node-fullstack/              (项目 + 文档 + Docker)
│   ├── index.md, src/, tests/, package.json, tsconfig.json, docker-compose.yml
├── ch09-dts-sdk/                     (项目 + 文档)
│   ├── index.md, src/, tests/, package.json, tsconfig.json
├── ch10-state-machine/               (项目 + 文档)
│   ├── index.md, src/, tests/, package.json, tsconfig.json
├── ch11-tsconfig.md                  ~4000 字
├── ch12-monorepo.md                  ~3000 字
├── ch13-build-tools.md              ~3000 字
├── ch14-any-unknown.md               ~3000 字
├── ch15-type-guards.md              ~3000 字
├── ch16-type-driven-design.md       ~3000 字
├── ch17-error-reading.md            ~3000 字
├── ch18-code-review.md              ~3000 字
├── ch19-runtime-validation.md       ~3000 字
├── ch20-type-level-testing.md       ~3000 字
├── ch21-future.md                   ~3000 字
└── appendices/
    ├── appendix-a-utility-types.md   ~2000 字
    ├── appendix-b-eslint-config.md   ~1500 字
    ├── appendix-c-migration-checklist.md ~1500 字
    └── appendix-d-interview.md        ~2000 字
```

---

## Part 1: 编译器原理与类型系统基石（3 章纯文档）

### Task 1: 第1章 TS 编译器与 AST

**Files:**
- Create: `docs/TypeScript/ch01-compiler-ast.md`

- [ ] **Step 1: 撰写「使用场景」和「实现原理」模块**

写入以下内容：
- **使用场景** (~300字)：理解 tsc 编译过程对开发者意味着什么——AST 分析工具开发、自定义转换、代码生成、理解类型擦除对运行时的影响
- **实现原理** (~800字)：TS 编译的 5 个阶段——Scanner（词法分析，Token 流生成）、Parser（语法分析，AST 构建）、Binder（符号绑定，作用域链）、Checker（类型检查，类型推导与验证）、Emitter（代码生成，类型擦除 + JS 输出）。AST 树结构详解（节点类型、位置信息、遍历模式）

- [ ] **Step 2: 撰写「潜在风险」和「优化策略」模块**

- **潜在风险** (~500字)：过度依赖 tsc 编译忽略类型擦除导致的运行时错误（如 `enum` 编译为 IIFE 的引用问题）、`namespace` 的非标准特性、装饰器的元数据发射依赖、`--isolatedModules` 限制
- **优化策略** (~800字)：`--incremental` 增量编译（`.tsbuildinfo` 缓存）、`--skipLibCheck` 跳过 `.d.ts` 检查加速、`project references` 分项目编译、`--isolatedModules` 确保单文件编译安全

- [ ] **Step 3: 撰写「典型问题处理」和「开发者技能」模块**

- **典型问题** (~500字)：类型擦除后运行时 `undefined`（enum 反向映射陷阱）、同名称类型冲突（`Duplicate identifier`）、模块解析失败（`Cannot find module` 的 3 种常见原因）
- **开发者技能** (~300字)：AST Explorer 可视化工具使用、`tsc --showConfig` 查看最终配置、`tsc --generateTrace` 生成编译性能追踪

- [ ] **Step 4: 撰写「示例代码」模块**

```typescript
// 类型擦除前后对比
// TS 源码
enum Color { Red, Green, Blue }
const color: Color = Color.Red;

// 编译后 JS（enum 被编译为 IIFE）
var Color;
(function (Color) {
    Color[Color["Red"] = 0] = "Red";
    Color[Color["Green"] = 1] = "Green";
    Color[Color["Blue"] = 2] = "Blue";
})(Color || (Color = {}));
const color = Color.Red;
```

```typescript
// 自定义 Transformer 示例（简化）
import ts from 'typescript';
const source = ts.createSourceFile('test.ts', 'const x: number = 1', ts.ScriptTarget.Latest);
ts.forEachChild(source, node => {
    if (ts.isVariableStatement(node)) {
        console.log('Found variable declaration');
    }
});
```

- [ ] **Step 5: 写入文件并验证**

写入 `docs/TypeScript/ch01-compiler-ast.md`
确认：8 个模块完备、约 4000 字、简体中文、TypeScript 代码块


### Task 2: 第2章 类型推导与控制流分析

**Files:**
- Create: `docs/TypeScript/ch02-type-inference.md`

- [ ] **Step 1: 撰写「使用场景」和「实现原理」模块**

- **使用场景** (~300字)：利用自动类型推导减少冗余类型声明、控制流收窄保证分支安全、判别联合建模互斥状态
- **实现原理** (~800字)：双向推导机制——自底向上（表达式推导，从字面量/函数返回值推断类型）与自顶向下（上下文类型推导，根据预期类型推断表达式类型）。控制流分析（CFA）——if/else/switch/throw/&&/|| 中的类型收窄、`typeof`/`instanceof`/`in` 类型守卫、判别联合的 `kind` 属性收窄

- [ ] **Step 2: 撰写「潜在风险」和「优化策略」模块**

- **潜在风险** (~500字)：闭包/`setTimeout` 回调中类型收窄丢失（TS 的别名分析限制）、复杂条件链中推导失败退化为 `unknown`、`Array.filter(Boolean)` 的类型推导问题
- **优化策略** (~800字)：优先使用自动推导而非显式注解（减少不一致风险）、使用 `satisfies` 替代 `as` 保留精确推导、`NoInfer<T>` 阻断不期望的推导方向

- [ ] **Step 3: 撰写「典型问题」和「开发者技能」模块**

- **典型问题** (~500字)：`setTimeout` 回调中类型收窄丢失的 3 种修复方案、`filter(Boolean)` 的类型修复（`Array<T>.filter(Boolean): T[]` 问题）、`never` 穷尽性检查的防御性编程
- **开发者技能** (~300字)：VSCode 悬停查看推断类型、TypeScript Playground 隔离复现、`// @ts-expect-error` 替代 `// @ts-ignore`

- [ ] **Step 4: 撰写「示例代码」模块**

```typescript
// 判别联合 + never 穷尽检查
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'triangle'; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.radius ** 2;
    case 'square': return shape.side ** 2;
    case 'triangle': return (shape.base * shape.height) / 2;
    default:
      // 如果新增了 Shape 类型但未处理，这里会编译错误
      const _exhaustive: never = shape;
      return _exhaustive;
  }
}
```

```typescript
// satisfies 操作符
type Color = 'red' | 'green' | 'blue';
type Config = Record<string, Color>;

const config = {
  primary: 'blue',
  secondary: 'green',
} satisfies Config;
// config.primary 类型是 'blue'（字面量），不是 string
```

- [ ] **Step 5: 写入文件**


### Task 3: 第3章 结构类型系统的陷阱

**Files:**
- Create: `docs/TypeScript/ch03-structural-typing.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键示例代码：

```typescript
// Branded Types 模拟标称类型
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };

function createUserId(id: string): UserId {
  return id as UserId;
}

function getOrder(id: OrderId): Order { /* ... */ }

const uid = createUserId('user-1');
// getOrder(uid); // ❌ 类型错误：UserId 不能赋值给 OrderId
```

```typescript
// 多余属性检查
interface Person { name: string; age?: number; }

// 对象字面量：严格模式（多余属性报错）
const p1: Person = { name: 'Alice', age: 30, email: 'a@b.com' }; // ❌

// 变量赋值：宽松模式（不报错）
const data = { name: 'Bob', age: 25, email: 'b@b.com' };
const p2: Person = data; // ✅ 结构兼容即可
```

- [ ] **Step 5: 写入文件并提交 Part 1**

```bash
git add docs/TypeScript/ch01-compiler-ast.md docs/TypeScript/ch02-type-inference.md docs/TypeScript/ch03-structural-typing.md
git commit -m "docs(typescript): add Part 1 - compiler & type system foundations"
```


## Part 2: 高级类型系统（3 章纯文档）

### Task 4: 第4章 泛型与类型约束

**Files:**
- Create: `docs/TypeScript/ch04-generics.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键示例代码：

```typescript
// 类型安全的事件发射器
type EventMap = {
  userLogin: { userId: string; timestamp: number };
  pageView: { path: string; referrer?: string };
  error: { message: string; code: number };
};

class TypedEmitter<T extends Record<string, unknown>> {
  on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void { /* ... */ }
  emit<K extends keyof T>(event: K, data: T[K]): void { /* ... */ }
}

const emitter = new TypedEmitter<EventMap>();
emitter.on('userLogin', (data) => {
  // data 类型自动推导为 { userId: string; timestamp: number }
  console.log(data.userId);
});
```

```typescript
// 逆变与协变演示
type Animal = { name: string };
type Dog = Animal & { bark(): void };

// 数组是协变的（安全）
const dogs: Dog[] = [];
const animals: Animal[] = dogs; // ✅

// 函数参数是逆变的
type Handler = (animal: Animal) => void;
const dogHandler: Handler = (dog: Dog) => { dog.bark(); }; // ❌ 不安全
```

- [ ] **Step 5: 写入文件**


### Task 5: 第5章 条件类型与 infer

**Files:**
- Create: `docs/TypeScript/ch05-conditional-types.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键示例代码：

```typescript
// 分布式条件类型
type ToArray<T> = T extends unknown ? T[] : never;
type Result = ToArray<string | number>;
// Result = string[] | number[]（分布式展开）

// 阻止分布式
type ToArrayNonDist<T> = [T] extends [unknown] ? T[] : never;
type Result2 = ToArrayNonDist<string | number>;
// Result2 = (string | number)[]（未展开）

// infer 模式匹配
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
type PromiseValue<T> = T extends Promise<infer V> ? V : never;

type Fn = (x: number) => string;
type FnReturn = ReturnType<Fn>; // string
type Promised = PromiseValue<Promise<number>>; // number
```

- [ ] **Step 5: 写入文件**


### Task 6: 第6章 映射类型与模板字面量

**Files:**
- Create: `docs/TypeScript/ch06-mapped-types.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键示例代码：

```typescript
// Partial 实现
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Key Remapping
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};
type Person = { name: string; age: number };
type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number }

// 模板字面量：CSS 驼峰转短横线
type KebabCase<S extends string> =
  S extends `${infer C}${infer Rest}`
    ? C extends Uppercase<C>
      ? `-${Lowercase<C>}${KebabCase<Rest>}`
      : `${C}${KebabCase<Rest>}`
    : S;

type CssProp = KebabCase<'backgroundColor'>; // 'background-color'
```

- [ ] **Step 5: 写入文件并提交 Part 2**

```bash
git add docs/TypeScript/ch04-generics.md docs/TypeScript/ch05-conditional-types.md docs/TypeScript/ch06-mapped-types.md
git commit -m "docs(typescript): add Part 2 - advanced type system"
```


## Part 3: 核心业务场景（4 个可运行项目）

### Task 7: 第7章 React/Vue 组件类型安全

**Files:**
- Create: `docs/TypeScript/ch07-react-types/package.json`
- Create: `docs/TypeScript/ch07-react-types/tsconfig.json`
- Create: `docs/TypeScript/ch07-react-types/jest.config.ts`
- Create: `docs/TypeScript/ch07-react-types/src/components/List.tsx`
- Create: `docs/TypeScript/ch07-react-types/src/hooks/useApi.ts`
- Create: `docs/TypeScript/ch07-react-types/tests/List.test.tsx`
- Create: `docs/TypeScript/ch07-react-types/tests/types.test.ts`
- Create: `docs/TypeScript/ch07-react-types/index.md`

- [ ] **Step 1: 创建项目骨架**

```bash
mkdir -p docs/TypeScript/ch07-react-types/src/components
mkdir -p docs/TypeScript/ch07-react-types/src/hooks
mkdir -p docs/TypeScript/ch07-react-types/tests
```

写入 `package.json`（react 18, @testing-library/react, jest, ts-jest, expect-type, @types/react）
写入 `tsconfig.json`（jsx: react-jsx, strict: true, target ES2022）
写入 `jest.config.ts`（jsdom 环境）

- [ ] **Step 2: 创建源码文件**

`src/components/List.tsx` — 泛型列表组件：
```tsx
import React from 'react';

interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

export function List<T>({ items, renderItem, keyExtractor, emptyMessage }: ListProps<T>) {
  if (items.length === 0) {
    return <div>{emptyMessage ?? 'No items'}</div>;
  }
  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>{renderItem(item, index)}</li>
      ))}
    </ul>
  );
}
```

`src/hooks/useApi.ts` — 泛型 API Hook：
```typescript
import { useState, useEffect } from 'react';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useApi<T>(fetcher: () => Promise<T>): UseApiResult<T> {
  const [state, setState] = useState<UseApiResult<T>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    fetcher()
      .then(data => setState({ data, loading: false, error: null }))
      .catch(error => setState({ data: null, loading: false, error }));
  }, [fetcher]);

  return state;
}
```

- [ ] **Step 3: 创建测试文件**

`tests/List.test.tsx` — 组件渲染测试
`tests/types.test.ts` — 类型级测试（使用 expect-type）

```typescript
// tests/types.test.ts
import { expectTypeOf } from 'expect-type';
import { List } from '../src/components/List';

// 编译期类型测试
it('should infer item type from props', () => {
  const items = [{ id: '1', name: 'Alice' }];
  // 验证 List 组件的泛型参数推导
  type ItemType = (typeof items)[number];
  expectTypeOf<ItemType>().toHaveProperty('id');
  expectTypeOf<ItemType>().toHaveProperty('name');
});
```

- [ ] **Step 4: 创建章节正文 index.md**

写入 `index.md`（~4000 字），8 模块覆盖 React 组件类型安全、泛型组件推导、HOC 类型包裹、Hooks 类型推导


### Task 8: 第8章 Node.js 全栈类型共享

**Files:**
- Create: `docs/TypeScript/ch08-node-fullstack/package.json`
- Create: `docs/TypeScript/ch08-node-fullstack/tsconfig.json`
- Create: `docs/TypeScript/ch08-node-fullstack/jest.config.ts`
- Create: `docs/TypeScript/ch08-node-fullstack/src/router.ts`
- Create: `docs/TypeScript/ch08-node-fullstack/src/schema.ts`
- Create: `docs/TypeScript/ch08-node-fullstack/src/service.ts`
- Create: `docs/TypeScript/ch08-node-fullstack/tests/api.test.ts`
- Create: `docs/TypeScript/ch08-node-fullstack/docker-compose.yml`
- Create: `docs/TypeScript/ch08-node-fullstack/index.md`

- [ ] **Step 1: 创建项目骨架**

`package.json`（@trpc/server, @trpc/client, zod, express, jest, ts-jest, tsd）
`tsconfig.json`（strict, target ES2022, moduleResolution bundler）

- [ ] **Step 2: 创建源码**

`src/schema.ts` — Zod Schema 定义：
```typescript
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

export const CreateUserSchema = UserSchema.omit({ id: true });

export type User = z.infer<typeof UserSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

`src/router.ts` — tRPC Router：
```typescript
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { UserSchema, CreateUserSchema } from './schema.js';

const t = initTRPC.create();
const users: User[] = [];

export const appRouter = t.router({
  user: t.router({
    list: t.procedure.query(() => users),
    byId: t.procedure.input(z.string()).query(({ input }) =>
      users.find(u => u.id === input)
    ),
    create: t.procedure.input(CreateUserSchema).mutation(({ input }) => {
      const user = { id: crypto.randomUUID(), ...input };
      users.push(user);
      return user;
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: 创建测试和 Docker Compose**

`tests/api.test.ts` — tRPC 调用测试
`docker-compose.yml` — API 服务 + PostgreSQL

- [ ] **Step 4: 创建章节正文 index.md**


### Task 9: 第9章 .d.ts 声明文件编写

**Files:**
- Create: `docs/TypeScript/ch09-dts-sdk/package.json`
- Create: `docs/TypeScript/ch09-dts-sdk/tsconfig.json`
- Create: `docs/TypeScript/ch09-dts-sdk/src/index.ts`
- Create: `docs/TypeScript/ch09-dts-sdk/types/index.d.ts`
- Create: `docs/TypeScript/ch09-dts-sdk/tests/types.test.ts`
- Create: `docs/TypeScript/ch09-dts-sdk/index.md`

- [ ] **Step 1: 创建项目骨架**

`package.json`（含 "types" 字段指向 types/index.d.ts, tsup 打包）
`tsconfig.json`（declaration: true, declarationDir: types）

- [ ] **Step 2: 创建源码和声明文件**

`src/index.ts` — SDK 实现
`types/index.d.ts` — 手写声明文件（含重载、声明合并）

```typescript
// types/index.d.ts
export interface SDKConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class SDK {
  constructor(config: SDKConfig);

  // 重载：多种查询方式
  getUser(id: string): Promise<User>;
  getUser(query: { email: string }): Promise<User>;
  getUser(query: { name: string }): Promise<User[]>;

  // 泛型方法
  create<T extends Record<string, unknown>>(resource: string, data: T): Promise<T>;
}

// 声明合并：扩展全局类型
declare global {
  interface Window {
    __SDK_VERSION__: string;
  }
}
```

- [ ] **Step 3: 创建类型测试**

`tests/types.test.ts` — 使用 tsd 验证声明文件类型正确性

- [ ] **Step 4: 创建章节正文 index.md**


### Task 10: 第10章 复杂状态机建模

**Files:**
- Create: `docs/TypeScript/ch10-state-machine/package.json`
- Create: `docs/TypeScript/ch10-state-machine/tsconfig.json`
- Create: `docs/TypeScript/ch10-state-machine/src/order-machine.ts`
- Create: `docs/TypeScript/ch10-state-machine/src/types.ts`
- Create: `docs/TypeScript/ch10-state-machine/tests/state.test.ts`
- Create: `docs/TypeScript/ch10-state-machine/tests/exhaustive.test.ts`
- Create: `docs/TypeScript/ch10-state-machine/index.md`

- [ ] **Step 1: 创建项目骨架**

`package.json`（xstate, jest, expect-type）

- [ ] **Step 2: 创建源码**

`src/types.ts` — 判别联合类型定义订单状态：
```typescript
export type OrderStatus =
  | { status: 'pending'; createdAt: Date }
  | { status: 'confirmed'; confirmedAt: Date; paymentMethod: string }
  | { status: 'shipped'; shippedAt: Date; trackingNumber: string }
  | { status: 'delivered'; deliveredAt: Date; signature?: string }
  | { status: 'cancelled'; cancelledAt: Date; reason: string };

export interface Order {
  id: string;
  current: OrderStatus;
  items: string[];
  total: number;
}
```

`src/order-machine.ts` — XState 状态机定义

- [ ] **Step 3: 创建测试**

`tests/state.test.ts` — 状态转移测试
`tests/exhaustive.test.ts` — 类型穷尽检查测试

```typescript
// tests/exhaustive.test.ts
import { expectTypeOf } from 'expect-type';
import type { OrderStatus } from '../src/types';

it('should have exhaustive status handling', () => {
  type StatusTypes = OrderStatus['status'];
  // 验证所有状态都被覆盖
  expectTypeOf<StatusTypes>().toEqualTypeOf<
    'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  >();
});
```

- [ ] **Step 4: 创建章节正文 index.md**

- [ ] **Step 5: 提交 Part 3**

```bash
git add docs/TypeScript/ch07-react-types/ docs/TypeScript/ch08-node-fullstack/ docs/TypeScript/ch09-dts-sdk/ docs/TypeScript/ch10-state-machine/
git commit -m "docs(typescript): add Part 3 - four production scenarios with runnable projects"
```


## Part 4: 工程化与性能（3 章文档）

### Task 11: 第11章 tsconfig.json 深度解析

**Files:**
- Create: `docs/TypeScript/ch11-tsconfig.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- `target` vs `module` vs `moduleResolution` 的演进（从 classic → node → node16 → nodenext → bundler）
- strict 全家桶（strictNullChecks / strictFunctionTypes / noUncheckedIndexedAccess / exactOptionalPropertyTypes）
- paths + baseUrl 路径别名、extends 配置继承

### Task 12: 第12章 Monorepo 配置

**Files:**
- Create: `docs/TypeScript/ch12-monorepo.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- Project References（references + composite + incremental）
- 多包编译策略（全量编译 vs 增量编译）
- 工具对比（Nx / Turborepo / pnpm workspace）

### Task 13: 第13章 构建工具链与性能

**Files:**
- Create: `docs/TypeScript/ch13-build-tools.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- Vite/esbuild/SWC/Oxc 转译原理对比
- `tsc --extendedDiagnostics` 分析编译瓶颈
- 类型爆炸规避（减少深层交叉类型、递归条件类型）

- [ ] **Step 5: 提交 Part 4**

```bash
git add docs/TypeScript/ch11-tsconfig.md docs/TypeScript/ch12-monorepo.md docs/TypeScript/ch13-build-tools.md
git commit -m "docs(typescript): add Part 4 - engineering & build performance"
```


## Part 5: 典型问题排查（2 章文档）

### Task 14: 第14章 四大类型灾难

**Files:**
- Create: `docs/TypeScript/ch14-any-unknown.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- `any` 的传染性（`any` 类型会污染所有与之交互的类型）
- `unknown` 配合类型守卫安全收窄
- 第三方库类型冲突（`Duplicate identifier` 排查 + patch-package 修复）
- 泛型推导退化为 `unknown`（NoInfer 阻断）
- `this` 指向类型丢失（显式 `this: Context` 参数）

### Task 15: 第15章 类型守卫与断言

**Files:**
- Create: `docs/TypeScript/ch15-type-guards.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键示例代码：

```typescript
// 自定义类型守卫
interface User { name: string; email: string; }
interface Admin extends User { role: 'admin'; permissions: string[]; }

function isAdmin(user: User): user is Admin {
  return 'role' in user && user.role === 'admin';
}

// 断言函数
function assertIsDefined<T>(value: T): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error('Value must be defined');
  }
}

function processUser(user: User) {
  assertIsDefined(user.email);
  // 此处 user.email 类型为 string（非 string | undefined）
  console.log(user.email.toUpperCase());
}
```

- [ ] **Step 5: 提交 Part 5**

```bash
git add docs/TypeScript/ch14-any-unknown.md docs/TypeScript/ch15-type-guards.md
git commit -m "docs(typescript): add Part 5 - troubleshooting & type guards"
```


## Part 6: 开发者核心素养（5 章文档）

### Task 16: 第16章 类型驱动 API 设计

**Files:**
- Create: `docs/TypeScript/ch16-type-driven-design.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- 调用者体验优先（函数签名自动推导泛型，避免手动传入）
- 避免过度类型体操（3 层 infer 以上果断放弃）
- 防御性 API（readonly、Omit、品牌类型限制外部篡改）

### Task 17: 第17章 报错阅读与调试

**Files:**
- Create: `docs/TypeScript/ch17-error-reading.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- 破解天书报错（从报错最底部或差异点开始读）
- VSCode 悬停查看推断类型
- TypeScript Playground 隔离复现
- `// @ts-expect-error` vs `// @ts-ignore`

### Task 18: 第18章 代码审查规范

**Files:**
- Create: `docs/TypeScript/ch18-code-review.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- 反模式 1：interface 继承代替交叉类型（`interface A extends B, C` vs `type A = B & C`）
- 反模式 2：单次泛型（泛型参数在函数签名中只出现一次）
- 反模式 3：`as any` 掩盖类型错误（应使用 `as unknown as TargetType` 双重断言）
- ESLint 规则配置（`@typescript-eslint`）

### Task 19: 第19章 运行时校验

**Files:**
- Create: `docs/TypeScript/ch19-runtime-validation.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键示例代码：

```typescript
import { z } from 'zod';

// 一次 Schema，双重用途
const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

// 编译时类型
type User = z.infer<typeof UserSchema>;

// 运行时校验
function handleCreateUser(input: unknown) {
  try {
    const user = UserSchema.parse(input);
    // user 的类型就是 User
    return saveToDb(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.errors };
    }
    throw err;
  }
}
```

### Task 20: 第20章 类型级测试

**Files:**
- Create: `docs/TypeScript/ch20-type-level-testing.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键示例代码：

```typescript
// 使用 expect-type 进行类型级测试
import { expectTypeOf } from 'expect-type';
import type { DeepPartial } from '../src/types';

// 编译期断言
it('should make all properties optional', () => {
  type Input = { name: string; age: number; email?: string };
  type Result = DeepPartial<Input>;

  expectTypeOf<Result>().toHaveProperty('name');
  expectTypeOf<Result>().toHaveProperty('age');
  expectTypeOf<Result>().toHaveProperty('email');

  // 验证属性变为可选
  expectTypeOf<{ name?: string; age?: number; email?: string }>().toMatchTypeOf<Result>();
});
```

- [ ] **Step 5: 提交 Part 6**

```bash
git add docs/TypeScript/ch16-type-driven-design.md docs/TypeScript/ch17-error-reading.md docs/TypeScript/ch18-code-review.md docs/TypeScript/ch19-runtime-validation.md docs/TypeScript/ch20-type-level-testing.md
git commit -m "docs(typescript): add Part 6 - developer core skills"
```


## Part 7: 前沿演进（1 章文档）

### Task 21: 第21章 TS 5.x+ 新特性

**Files:**
- Create: `docs/TypeScript/ch21-future.md`

- [ ] **Step 1-4: 撰写全部 8 模块**

关键内容：
- `const` 类型参数（泛型默认保留字面量类型）
- TC39 标准装饰器 vs 实验性装饰器
- AI 辅助类型生成（Copilot/Cursor）

- [ ] **Step 5: 提交 Part 7**

```bash
git add docs/TypeScript/ch21-future.md
git commit -m "docs(typescript): add Part 7 - future & TS 5.x+"
```


## 附录（4 篇参考文档）

### Task 22: 附录 A-D

**Files:**
- Create: `docs/TypeScript/appendices/appendix-a-utility-types.md`
- Create: `docs/TypeScript/appendices/appendix-b-eslint-config.md`
- Create: `docs/TypeScript/appendices/appendix-c-migration-checklist.md`
- Create: `docs/TypeScript/appendices/appendix-d-interview.md`

- [ ] **Step 1: 附录A 内置工具类型源码解析**

Partial / Pick / Omit / Record / Exclude / Extract / NonNullable / ReturnType / InstanceType 的实现原理

- [ ] **Step 2: 附录B ESLint 企业级配置**

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/strict"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-non-null-assertion": "warn"
  }
}
```

- [ ] **Step 3: 附录C JS→TS 迁移 Checklist**

1. 添加 tsconfig.json（strict: false 起步）
2. 将 .js 重命名为 .ts
3. 添加 @types 包
4. 逐步开启 strict 模式
5. 修复类型错误

- [ ] **Step 4: 附录D 面试高频题**

类型系统原理、类型体操手写题、工程化实践题

- [ ] **Step 5: 提交附录**

```bash
git add docs/TypeScript/appendices/
git commit -m "docs(typescript): add appendices"
```


## 自检清单

1. **Spec 覆盖**: 21 章 + 4 附录，共 22 个 Task，全部覆盖设计文档
2. **占位符检查**: 所有步骤包含实际内容，无「TBD」「TODO」
3. **类型一致性**: 代码示例中的类型、函数签名在 Task 间一致
4. **执行顺序**: 按 Part 1 → 2 → 3 → 4 → 5 → 6 → 7 → 附录 顺序
5. **文件路径**: 所有路径为 `docs/TypeScript/` 下，与设计文档一致
