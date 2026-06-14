# 第25章 大型项目 TS 编译性能监控与调优

当项目达到一定规模（几万行甚至几十万行 TS 代码），编译性能会成为开发效率的瓶颈。IDE 代码提示变慢、保存时类型检查卡顿、CI 构建时间越来越长——这些问题不是"忍忍就过去了"。

本章教你系统化诊断和优化 TS 项目的编译性能。

---

## 1. 核心概念

### 识别性能瓶颈：什么时候该慌了？

把 TS 编译器的性能想象成**汽车的仪表盘**：

| 症状 | 对应仪表盘警示灯 | 严重程度 |
|------|-----------------|---------|
| 保存文件后等待 > 2 秒才能看到类型报错 | 黄灯：注意 | 需要优化 |
| IDE 代码提示延迟 > 500ms | 黄灯：注意 | 需要优化 |
| CI 中 tsc 耗时 > 30 秒 | 红灯：严重 | 必须优化 |
| 输入代码时字符逐字出现 | 红灯：紧急 | 立即优化 |
| 编译器 OOM（内存溢出） | 引擎冒烟 | 灾难 |

### 性能瓶颈的三大根源

TS 编译变慢，90% 的情况逃不出以下三个原因：

| 根源 | 原理 | 比喻 |
|------|------|------|
| **复杂类型计算** | 递归条件类型、大型联合类型导致编译器重复计算 | 让数学系教授算 1+1，但算了 10 万次 |
| **过多的文件** | tsc 需要解析所有文件，包括不相关的 .d.ts | 让安检员检查整个机场的人，包括路过的 |
| **模块解析开销** | 在 node_modules 中搜索模块声明 | 在迷宫中找出口，每个路口都要判断 |

### 监控体系：用数据说话

性能调优的第一原则：**不测量就不要优化**。在 CI/CD 中集成 `tsc --diagnostics`，监控每次提交的类型检查耗时。

```bash
# 基础诊断命令
tsc --noEmit --diagnostics

# 更详细的诊断
tsc --noEmit --extendedDiagnostics
```

---

## 2. 典型问题与处理

### 问题 1：一个文件中的复杂类型推导拖慢整个项目

```typescript
// === Bad: 一个"类型地狱"文件拖慢全项目 ===

// ❌ 性能杀手：深层交叉类型 + 复杂递归条件类型

// 这个文件中的类型定义会导致 TS 编译器花费大量时间计算
// 每当你修改这个文件，整个项目都要重新计算这些类型

// 3 层以上的条件类型嵌套
type DeepTransform<T> = T extends object
  ? T extends Array<infer U>
    ? Array<DeepTransform<U>>
    : {
        [K in keyof T]: T[K] extends Function
          ? T[K]
          : T[K] extends Promise<infer R>
            ? DeepTransform<R>
            : T[K] extends object
              ? DeepTransform<T[K]>
              : T[K];
      }
  : T;

// 大型联合类型（50+ 成员）
type AllRoutes =
  | "/"
  | "/about"
  | "/users"
  | "/users/:id"
  | "/users/:id/posts"
  | "/users/:id/posts/:postId"
  | "/users/:id/settings"
  | "/users/:id/profile"
  // ... 100+ 个路由
  ;

// 大型交叉类型
type MegaType = {
  // 100+ 个属性的对象
  field1: string;
  field2: number;
  // ...
  field100: boolean;
} & {
  // 另一个大对象
  meta1: string;
  meta2: number;
  // ...
  meta50: string;
} & {
  // 还有
  extra1: string;
  // ...
};
```

**为什么不好：** 递归条件类型每次引用都会重新计算，大型联合类型（>50 成员）的检查复杂度呈指数增长。一个文件中的这些类型会拖慢整个项目的编译速度，因为 TS 编译器是"按需计算"的——其他文件引用这些类型时，也会触发同样的计算。

```typescript
// === Good: 优化后的版本 ===

// ✅ 方案 1：限制递归深度
type DeepTransformSafe<T, Depth extends any[] = []> =
  Depth["length"] extends 5 // 最多递归 5 层
    ? T
    : T extends object
      ? T extends Array<infer U>
        ? Array<DeepTransformSafe<U, [...Depth, any]>>
        : {
            [K in keyof T]: T[K] extends Function
              ? T[K]
              : T[K] extends Promise<infer R>
                ? DeepTransformSafe<R, [...Depth, any]>
                : T[K] extends object
                  ? DeepTransformSafe<T[K], [...Depth, any]>
                  : T[K];
          }
      : T;

// ✅ 方案 2：将大联合类型改为对象映射
// 用映射类型替代联合类型，编译时只计算一次
interface RouteMap {
  home: "/";
  about: "/about";
  userList: "/users";
  userDetail: "/users/:id";
  userPosts: "/users/:id/posts";
  userPostDetail: "/users/:id/posts/:postId";
  // ... 更直观，IDE 提示更好
}

type Route = RouteMap[keyof RouteMap];
// 等价于联合类型，但编译器处理映射类型比联合类型快得多

// ✅ 方案 3：用 interface 替代交叉类型
// 交叉类型 & 在编译时比 interface extends 慢
// Bad: type MegaType = TypeA & TypeB & TypeC
// Good:
interface TypeA {
  field1: string;
  field2: number;
}
interface TypeB extends TypeA {
  meta1: string;
  meta2: number;
}
interface TypeC extends TypeB {
  extra1: string;
  extra2: number;
}
// interface 的继承链在编译时更快

// ✅ 方案 4：将复杂类型拆到独立文件
// 只在需要的地方 import，减少不必要的类型计算
// complex-types.ts — 只有需要这些复杂类型的文件才 import
```

**为什么好：** 限制递归深度防止无限计算，映射类型比联合类型快，interface 继承链比交叉类型快，拆分文件减少不必要的类型加载。

---

### 问题 2：模块解析缓慢

```typescript
// === Bad: 模块解析配置不合理 ===

// ❌ 问题 1：moduleResolution 设为 "node"（旧模式）
// 在大型项目中，node 解析会遍历大量目录

// ❌ 问题 2：tsconfig.json 的 include 范围过大
{
  "include": [
    "src/**/*",       // ✅ 合理
    "tests/**/*",     // ✅ 合理
    "node_modules/**/*" // ❌ 不应该包含 node_modules！
  ]
}

// ❌ 问题 3：大量的 export * from
// barrel 文件（索引文件）虽然方便，但会让编译器解析所有导出的文件
// utils/index.ts
export * from "./string-utils";
export * from "./array-utils";
export * from "./date-utils";
export * from "./math-utils";
export * from "./validation-utils";
// ... 每个 export * from 都要解析整个文件
```

**为什么不好：** `moduleResolution: "node"` 在 node_modules 中逐级向上搜索，每次 import 都要做多次文件系统操作。`export * from` 让编译器解析所有 re-export 的文件，即使只用了其中一部分。

```typescript
// === Good: 优化模块解析 ===

// ✅ 方案 1：使用更快的模块解析策略
{
  "compilerOptions": {
    // "bundler" 是最快的——假设模块已经由 bundler 处理
    "moduleResolution": "bundler",
    // 或者 "node16" / "nodenext"（视项目需求）
    "module": "esnext"
  }
}

// ✅ 方案 2：精确的 include 范围
{
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx"
    // 不包含 node_modules
  ]
}

// ✅ 方案 3：使用显式导入替代 export *
// Bad: export * from "./string-utils";
// Good:
export { capitalize, trim, truncate } from "./string-utils";
export { unique, flatten, groupBy } from "./array-utils";
// 显式导入只解析被引用的符号，编译器工作量减少

// ✅ 方案 4：使用 paths 缩短 import 路径
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@utils/*": ["./src/utils/*"],
      "@components/*": ["./src/components/*"]
    }
    // 注意：paths 也需要解析，不要设置太多别名
  }
}

// ✅ 方案 5：开启 skipLibCheck 跳过 .d.ts 检查
{
  "compilerOptions": {
    "skipLibCheck": true // 跳过 node_modules 中 .d.ts 文件的类型检查
  }
}
```

**为什么好：** `moduleResolution: "bundler"` 简化了模块解析逻辑，精确的 include 减少编译器负担，显式导入让编译器只处理真正使用的符号，`skipLibCheck` 跳过第三方库的类型检查。

---

### 问题 3：增量编译配置缺失

```typescript
// === Bad: 没有配置增量编译 ===

// ❌ 每次 tsc 都重新编译所有文件
// 即使只改了一个文件，也要重新类型检查整个项目
// 10 万行项目每次保存都要等 10+ 秒
{
  "compilerOptions": {
    // 没有 incremental: true
    // 没有 tsBuildInfoFile
  }
}
```

**为什么不好：** 没有增量编译时，每次 tsc 运行都是全量检查。对于大型项目，这意味着每次保存文件都要等待完整的类型检查流程，严重影响开发效率。

```typescript
// === Good: 配置增量编译 ===

// ✅ 方案 1：开启 incremental
{
  "compilerOptions": {
    "incremental": true,       // 启用增量编译
    "tsBuildInfoFile": ".tsbuildinfo", // 缓存文件位置
    "outDir": "./dist"         // 输出目录（incremental 需要）
  }
}

// ✅ 方案 2：使用 Project References 分割项目
// 根目录 tsconfig.json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler"
  },
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" },
    { "path": "./packages/ui" }
  ]
}

// packages/core/tsconfig.json
{
  "compilerOptions": {
    "composite": true,     // 必须
    "incremental": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src"]
}

// ✅ 方案 3：开发和生产使用不同的 tsconfig
// tsconfig.json（开发时使用）
{
  "compilerOptions": {
    "incremental": true,
    "skipLibCheck": true,      // 开发时跳过
    "noUnusedLocals": false,   // 开发时宽松
    "noUnusedParameters": false
  }
}

// tsconfig.prod.json（CI 中使用）
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "incremental": false,      // CI 中全量检查
    "skipLibCheck": false,     // CI 中严格
    "noUnusedLocals": true,    // CI 中严格
    "noUnusedParameters": true
  }
}

// 开发命令：tsc --noEmit
// CI 命令：tsc --noEmit -p tsconfig.prod.json
```

**为什么好：** 增量编译让每次保存只重新检查修改过的文件和依赖它们的文件，而不是全量检查。Project References 将项目分割成独立单元，每个单元可以独立编译和缓存。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：使用 tsc --diagnostics 诊断性能
// ==========================================

// 在终端运行：
// npx tsc --noEmit --diagnostics

// 输出示例：
// Files:                         342
// Lines:                     89,456
// Nodes:                    234,567
// Identifiers:              167,890
// Symbols:                   98,765
// Types:                    345,678
// Memory used:              180,224K
// I/O Read time:            0.89s
// Parse time:               1.56s
// Bind time:                0.67s
// Check time:               8.90s    ← 关注这个
// Emit time:                0.45s
// Total time:              12.47s

// 解读：
// - Check time / Total time > 60% → 类型复杂度太高
// - Types 数量 > 100,000 → 类型过多，考虑简化
// - Memory used > 500MB → 可能有递归类型问题

// ==========================================
// 示例 2：使用 --extendedDiagnostics 获取更详细的信息
// ==========================================

// npx tsc --noEmit --extendedDiagnostics

// 额外输出：
// Assignability cache size:  12,345  ← 类型兼容性检查缓存
// Identity cache size:        8,765  ← 类型同一性检查缓存
// Subtype cache size:         5,432  ← 子类型检查缓存
// Strict type checking:   true

// 如果 cache size 持续增长，说明类型复杂度高
// 正常的 cache size 应该在总 Types 的 10% 以内

// ==========================================
// 示例 3：识别并优化"类型热点"
// ==========================================

// 场景：一个工具类型被多个地方引用，每次引用都重新计算

// 原始版本（每次引用都重新计算）
type ComputedConfig<T> = {
  [K in keyof T]: T[K] extends string
    ? `config_${T[K] & string}`
    : T[K] extends number
      ? T[K]
      : never;
};

// 优化版本：缓存中间结果
type CacheConfig<T> = ComputedConfig<T>;

// 使用缓存
interface AppSettings {
  theme: string;
  version: number;
  debug: boolean;
}

// 只计算一次
type ComputedSettings = CacheConfig<AppSettings>;

// 后续引用直接使用缓存的计算结果
function applySettings(settings: ComputedSettings): void {
  // settings.theme 是 `config_${string}`
  // settings.version 是 number
  // settings.debug 是 never
}

// ==========================================
// 示例 4：性能对比测试
// ==========================================

// 使用 interface vs type 进行对象类型定义

// 方案 A：使用 type（较慢）
type UserType = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  settings: {
    theme: "light" | "dark";
    notifications: boolean;
  };
};

// 方案 B：使用 interface（较快）
interface UserInterface {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  settings: {
    theme: "light" | "dark";
    notifications: boolean;
  };
}

// 方案 C：interface + 内部 interface
interface UserSettings {
  theme: "light" | "dark";
  notifications: boolean;
}

interface UserOptimized {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  settings: UserSettings;
}

// 性能排序：C > B > A
// 嵌套 interface（C）最快，因为编译器可以缓存每个 interface 的结果
```

---

## 4. 配置/环境示例

### 性能优化的 tsconfig.json

```jsonc
{
  "compilerOptions": {
    // === 严格模式（但注意性能影响）===
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,

    // === 性能关键配置 ===
    "skipLibCheck": true,            // 跳过 .d.ts 检查（大幅加速）
    "skipDefaultLibCheck": true,     // 跳过默认库检查

    // === 增量编译 ===
    "incremental": true,             // 开发时增量编译
    "tsBuildInfoFile": ".tsbuildinfo",

    // === 模块解析优化 ===
    "moduleResolution": "bundler",   // 最快（需要 bundler 配合）
    "module": "esnext",
    "target": "esnext",

    // === 可选：开发时放宽的检查 ===
    "noUnusedLocals": false,         // 开发时关闭
    "noUnusedParameters": false,

    // === 可选：项目分割 ===
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },

  // 精确的包含范围
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx"
  ],

  // 排除测试文件（开发时）
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.spec.ts"
  ],

  // 项目引用（大型项目分割）
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" },
    { "path": "./packages/ui" }
  ]
}
```

### 构建脚本配置

```jsonc
// package.json
{
  "scripts": {
    // 开发：快速类型检查
    "type-check": "tsc --noEmit --incremental --skipLibCheck",

    // 开发：带性能诊断
    "type-check:diag": "tsc --noEmit --diagnostics",

    // CI：严格类型检查
    "type-check:ci": "tsc --noEmit --pretty",

    // 构建：生产构建
    "build": "tsc --build",

    // 构建：强制重新构建
    "build:force": "tsc --build --force",

    // 清理构建缓存
    "clean": "tsc --build --clean && rm -rf .tsbuildinfo"
  }
}
```

### CI 中监控编译时间

```yaml
# .github/workflows/perf-monitor.yml
name: Compile Performance Monitor

on:
  pull_request:
    paths:
      - "src/**/*.ts"
      - "tsconfig.json"

jobs:
  perf-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci

      # 记录编译时间
      - name: Measure compilation time
        id: measure
        run: |
          START_TIME=$(date +%s%N)
          npx tsc --noEmit 2>&1 || true
          END_TIME=$(date +%s%N)
          DURATION=$(( ($END_TIME - $START_TIME) / 1000000 ))
          echo "duration=$DURATION" >> $GITHUB_OUTPUT
          echo "Compilation took ${DURATION}ms"

      # 如果超过阈值，发出警告
      - name: Check threshold
        if: steps.measure.outputs.duration > 30000
        run: |
          echo "::warning::Compilation time (${DURATION}ms) exceeds 30s threshold"
          echo "Consider optimizing complex types or splitting the project"
```

---

## 5. 必须掌握的技能

### 性能优化"三板斧"

| 优先级 | 操作 | 预期效果 | 难度 |
|--------|------|---------|------|
| P0 | 开启 `skipLibCheck` | 节省 30-50% 时间 | 低 |
| P0 | 开启 `incremental` | 后续编译节省 50-80% 时间 | 低 |
| P1 | 使用 `moduleResolution: "bundler"` | 节省 10-20% 模块解析时间 | 低 |
| P1 | 用 interface 替代交叉类型 & | 节省 5-10% 类型检查时间 | 低 |
| P2 | 限制递归类型深度 | 避免 OOM | 中 |
| P2 | 用映射类型替代大联合类型 | 节省 10-20% 类型检查时间 | 中 |
| P3 | Project References 分割项目 | 节省 30-60% 时间 | 高 |
| P3 | 减少 `export * from` | 节省 5-10% 解析时间 | 低 |

### 编译性能诊断速查表

```
运行 npx tsc --noEmit --diagnostics

关注指标：
┌──────────────────┬──────────┬──────────────────────┐
│ 指标              │ 正常值    │ 危险值               │
├──────────────────┼──────────┼──────────────────────┤
│ Check time 占比   │ < 50%    │ > 60%               │
│ Types 数量        │ < 50K    │ > 200K              │
│ Memory used       │ < 300MB  │ > 1GB               │
│ Total time        │ < 10s    │ > 30s               │
│ Files             │ < 500    │ > 2000              │
└──────────────────┴──────────┴──────────────────────┘

高 Check time → 检查复杂类型（递归、大联合、深层泛型）
高 Memory → 检查是否有无限递归类型
高 Files → 检查 include 范围是否过大
```

### 日常开发性能习惯

1. **保存前问自己：这个类型值得这么复杂吗？** —— 如果同事看不懂，编译器也可能算得慢
2. **定期运行 `tsc --diagnostics`** —— 像体检一样，定期检查编译健康度
3. **在 CI 中设置编译时间阈值** —— 超过阈值发告警，防止性能退化
4. **使用 Project References 分割项目** —— 大型项目尽早分割，越晚分割成本越高
5. **避免在公共类型中使用复杂泛型** —— 公共类型（.d.ts 中的导出类型）每次被引用都会重新计算

### 开发者应带走的知识点

1. **不测量就不要优化** —— 运行 `tsc --diagnostics` 获取数据，关注 Check time 占比。
2. **`skipLibCheck` 是最低成本、最高收益的配置** —— 跳过第三方库检查，节省一半时间。
3. **`incremental` 是开发体验的救星** —— 增量编译让每次保存从 10 秒降到 1 秒。
4. **interface 比交叉类型快** —— 能用 `interface A extends B` 就不用 `type A = B & C`。
5. **`export * from` 是隐藏的性能杀手** —— 用显式导出替代 barrel 文件。
6. **递归类型要有深度限制** —— 不加限制的递归类型可能导致编译器 OOM。
7. **Project References 是大项目的终极方案** —— 将项目分割成独立编译的单元。

### 最后的提醒

> **性能优化不是一次性的工作，而是持续的习惯。把 `tsc --diagnostics` 加入你的日常流程，就像刷牙一样自然。**
