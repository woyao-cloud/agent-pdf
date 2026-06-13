# tsconfig.json 深度解析

## 1. 使用场景

`tsconfig.json` 是 TypeScript 项目的核心配置文件，它决定了编译器如何理解你的代码。在实际项目中，tsconfig.json 的使用场景非常广泛：

- **项目初始化**：通过 `tsc --init` 生成默认配置，然后根据项目需求调整
- **多目标编译**：同一份源码编译为 ESModule 和 CommonJS 两种格式
- **严格模式控制**：逐步开启 strict 系列检查，渐进式迁移老项目
- **路径映射**：通过 paths 和 baseUrl 解决深层相对路径问题
- **项目引用**：在 Monorepo 中通过 Project References 实现增量编译
- **环境区分**：通过 extends 继承基础配置，按开发/生产环境覆盖

理解 tsconfig.json 的每个字段，是 TypeScript 工程化的第一步。

## 2. 实现原理

### target vs module vs moduleResolution 的演进

这三个字段是 tsconfig 中最容易混淆的组合，它们各自控制不同的编译维度：

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",          // 输出 JS 的语法级别
    "module": "ESNext",          // 输出 JS 的模块格式
    "moduleResolution": "bundler" // 模块解析策略
  }
}
```

**target** 决定编译器输出什么级别的 JavaScript 语法。例如 `target: "ES5"` 会将箭头函数转换为普通函数，`async/await` 转换为生成器。`target: "ES2022"` 则保留 class 字段、顶层 await 等现代语法。

**module** 决定输出代码的模块格式。`module: "CommonJS"` 输出 `require/module.exports`，`module: "ESNext"` 输出 `import/export`。注意：当 target 低于 ES2015 时，module 默认回退为 CommonJS。

**moduleResolution** 决定编译器如何解析模块路径。历史上只有 `classic` 和 `node` 两种策略。TS 4.7+ 引入了 `node16`、`nodenext` 和 `bundler`：

- `node`：模仿 Node.js 的 CommonJS 解析，不支持 `exports` 字段
- `node16`/`nodenext`：支持 `package.json` 的 `exports` 和 `imports` 字段，严格区分 CJS 和 ESM
- `bundler`：模拟打包工具（Vite/Webpack）的宽松解析，允许无扩展名导入

```typescript
// 使用 bundler 解析时，以下写法都合法
import { foo } from "./utils";       // 无扩展名
import { bar } from "./utils.js";    // 有扩展名
import { baz } from "@/utils";       // 配合 paths
```

### strict 全家桶

`strict: true` 是一个元选项，它一次性开启以下所有检查：

```typescript
{
  "compilerOptions": {
    "strict": true,
    // 等价于同时开启：
    // "strictNullChecks": true,        // null/undefined 不可赋值给其他类型
    // "strictFunctionTypes": true,     // 函数参数逆变检查
    // "strictBindCallApply": true,     // bind/call/apply 类型安全
    // "strictPropertyInitialization": true, // 类属性必须初始化
    // "noImplicitAny": true,           // 禁止隐式 any
    // "noImplicitThis": true,          // 禁止隐式 this 为 any
    // "alwaysStrict": true             // 输出 "use strict"
  }
}
```

**strictNullChecks** 是最核心的检查。开启后，`null` 和 `undefined` 不再属于所有类型的子类型：

```typescript
// 开启 strictNullChecks
const name: string = null;  // 错误：Type 'null' is not assignable to type 'string'
```

**strictFunctionTypes** 启用函数参数的双变（bivariant）检查改为逆变（contravariant）检查。这是 TypeScript 类型系统中最微妙的安全特性：

```typescript
// 默认情况下，函数参数是双变的（允许协变和逆变）
// 开启 strictFunctionTypes 后，只允许逆变
type AnimalFn = (x: Animal) => void;
type DogFn = (x: Dog) => void;  // Dog extends Animal

// 逆变：DogFn 不能赋值给 AnimalFn
// 因为调用 AnimalFn 时可能传入 Cat，而 DogFn 只接受 Dog
const fn: AnimalFn = (x: Dog) => {};  // strictFunctionTypes 下报错
```

**noUncheckedIndexedAccess** 是 TS 4.1+ 的严格检查，对对象和数组的索引访问添加 `undefined`：

```typescript
const arr: string[] = ["a", "b"];
const first = arr[0];  // 类型为 string | undefined（开启后）

const obj: Record<string, number> = {};
const val = obj["key"];  // 类型为 number | undefined（开启后）
```

### paths 与 baseUrl

路径映射是大型项目的必备配置：

```typescript
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@utils/*": ["src/utils/*"]
    }
  }
}
```

实现原理：编译器在解析模块时，会先检查 `paths` 映射。如果导入路径以 `@/` 开头，则替换为 `src/` 并尝试解析。注意：`paths` 只影响类型解析，不影响运行时。打包工具需要额外配置（如 Vite 的 `resolve.alias`）。

### extends 继承

```typescript
// tsconfig.base.json（基础配置）
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "moduleResolution": "bundler"
  }
}

// packages/app/tsconfig.json（子项目）
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`extends` 继承是浅合并。子配置中的 `compilerOptions` 会覆盖父配置的同名属性，但数组类型（如 `include`）不会合并，而是完全替换。

## 3. 潜在风险

### 配置冲突导致意外行为

```typescript
// 错误示例：target 和 module 不匹配
{
  "compilerOptions": {
    "target": "ES5",
    "module": "ESNext"  // ES5 目标下输出 ESNext 模块，Node.js 无法执行
  }
}
```

### moduleResolution 选择不当

```typescript
// 使用 "node" 解析时，以下写法会报错
import { foo } from "@/utils";  // 错误：找不到模块
// 因为 "node" 解析不支持 paths 映射的自动查找
```

### strict 开启不完整

许多项目只设置 `strict: true`，但忽略了 `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes` 等额外严格选项，导致运行时仍有空指针风险。

## 4. 优化策略

### 分层配置策略

```typescript
// tsconfig.base.json - 所有项目共享
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}

// tsconfig.build.json - 生产构建
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationDir": "./dist/types"
  },
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}

// tsconfig.dev.json - 开发环境
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

### 性能优化

```typescript
{
  "compilerOptions": {
    "skipLibCheck": true,     // 跳过 .d.ts 检查，大幅提升速度
    "incremental": true,      // 增量编译
    "tsBuildInfoFile": ".tsbuildinfo"  // 缓存文件位置
  }
}
```

### 推荐的最小配置

```typescript
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## 5. 典型问题处理

### 问题：paths 配置后 VSCode 不识别

```typescript
// 确保 tsconfig.json 在项目根目录
// 重启 VSCode 的 TS 服务器：Ctrl+Shift+P → "TypeScript: Restart TS server"
// 检查是否有多个 tsconfig.json 冲突
```

### 问题：第三方库类型声明找不到

```typescript
// 方法1：安装 @types 包
npm install @types/lodash --save-dev

// 方法2：自定义声明
// src/types/global.d.ts
declare module "legacy-lib" {
  export function doSomething(): void;
}

// 方法3：在 tsconfig 中指定 types
{
  "compilerOptions": {
    "types": ["node", "jest"]  // 只加载指定的 @types
  }
}
```

### 问题：ESM 和 CJS 双格式输出

```typescript
// 使用条件导出 + 双 tsconfig
// tsconfig.cjs.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "./dist/cjs"
  }
}

// tsconfig.esm.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "outDir": "./dist/esm"
  }
}
```

## 6. 开发者技能

掌握 tsconfig.json 的核心技能包括：

1. **理解编译流程**：知道 target → module → moduleResolution 的决策链
2. **渐进式严格化**：对老项目，逐个开启 strict 子选项，而不是一次性开启 strict
3. **调试配置**：使用 `tsc --showConfig` 查看最终生效的配置
4. **环境感知**：区分开发、构建、测试三种场景的配置差异
5. **工具链整合**：理解 tsconfig 与 Vite/Webpack/esbuild 的关系

## 7. 示例代码

### 完整的企业级 tsconfig

```typescript
// tsconfig.json
{
  "compilerOptions": {
    // 语言环境
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",

    // 严格检查
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,

    // 模块解析
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["packages/shared/src/*"]
    },
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,

    // 输出
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // 性能
    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": "./.tsbuildinfo",

    // 其他
    "forceConsistentCasingInFileNames": true,
    "removeComments": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 多环境配置示例

```typescript
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}

// tsconfig.json（开发环境）
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "sourceMap": true,
    "noUnusedLocals": false
  },
  "include": ["src", "tests"]
}

// tsconfig.prod.json（生产构建）
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "sourceMap": false
  },
  "exclude": ["tests", "**/*.test.ts"]
}
```

## 8. 小结

tsconfig.json 是 TypeScript 工程化的基石。核心要点：

- **target/module/moduleResolution** 三者联动，理解其演进历史才能正确配置
- **strict 全家桶** 是类型安全的基石，建议新项目全部开启
- **paths + baseUrl** 解决路径问题，但需要打包工具配合
- **extends** 实现配置复用，适合多环境多项目场景
- **性能优化** 关注 skipLibCheck 和 incremental
- 使用 `tsc --showConfig` 验证最终配置，避免意外覆盖
