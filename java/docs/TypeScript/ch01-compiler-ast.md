# 第1章 TS 编译器与 AST

## 1.1 使用场景

理解 TypeScript 编译器（`tsc`）的编译过程和抽象语法树（AST, Abstract Syntax Tree），对中高级前端开发者而言并非纯理论兴趣，而是解决实际工程问题的关键能力。

**AST 分析工具开发**：代码质量检查、自动化重构、脚手架生成等工具均依赖 AST 操作。例如，通过遍历 AST 检测团队代码中禁止的 API 调用模式，或自动为所有函数添加 `try-catch` 包装。掌握 AST 结构后，开发者可以编写自定义 ESLint 插件或基于 `ts-morph` 的代码生成脚本。

**自定义转换（Custom Transformers）**：TypeScript 编译器暴露了 `customTransformers` 接口，允许在 Emitter 阶段插入自定义 AST 转换逻辑。这在框架开发中尤为常见——Angular 的 AOT 编译、NestJS 的装饰器元数据注入，都依赖编译期 AST 变换来生成运行时所需的额外代码。

**代码生成（Code Generation）**：从 DSL（领域特定语言）或配置文件生成 TypeScript 类型定义和接口代码，是大型项目中常见的需求。例如，根据 OpenAPI 规范自动生成类型安全的 API 客户端，或从数据库 Schema 生成 ORM 实体类。这些场景都需要对目标 AST 结构有精确理解。

**理解类型擦除对运行时的影响**：TypeScript 的类型系统在编译期完成检查后，所有类型注解、接口、泛型等都会被擦除。这意味着 `instanceof` 无法用于运行时类型判断，`string` 和 `number` 等原始类型在运行时没有类型信息。理解这一机制，有助于避免将编译期类型安全等同于运行时安全的常见误区。

## 1.2 实现原理

TypeScript 编译器的核心流程可划分为五个阶段，每个阶段负责将源代码向目标 JavaScript 推进一层抽象。

### 1.2.1 Scanner（词法分析）

Scanner 是编译管线的第一站，负责将原始源代码字符串拆解为有意义的词法单元（Token）流。TypeScript 的 Scanner 继承自 JavaScript 的词法规范，但额外处理了类型相关的 Token，如 `type`、`interface`、`enum` 等关键字。

扫描过程是逐字符进行的：从源码开头读取字符，根据当前状态判断字符归属，合并成 Token 后输出。每个 Token 包含 `kind`（Token 类型，如 `Keyword`、`Identifier`、`NumericLiteral`）、`text`（原始文本）和位置信息（`pos`、`end`）。例如，`const x: number = 1` 会被扫描为 `ConstKeyword`、`Identifier("x")`、`ColonToken`、`Identifier("number")`、`EqualsToken`、`NumericLiteral("1")` 共 6 个 Token。

### 1.2.2 Parser（语法分析）

Parser 接收 Token 流，根据 TypeScript 语法规则将其组织为 AST。Parser 采用递归下降（Recursive Descent）解析策略——每个语法结构对应一个解析函数，如 `parseVariableStatement`、`parseFunctionDeclaration`、`parseClassDeclaration` 等。

生成的 AST 是一棵以 `SourceFile` 为根节点的树形结构。每个节点（`Node`）包含：
- **`kind`**：节点类型，如 `VariableStatement`、`FunctionDeclaration`、`TypeReference`
- **`pos` / `end`**：节点在源码中的起始和结束位置（字节偏移）
- **`parent`**：父节点引用，构成从叶子到根的回溯链
- **子节点**：根据节点类型不同，包含不同的子结构。例如 `VariableStatement` 包含 `declarationList`，后者又包含多个 `VariableDeclaration`，每个声明包含 `name` 和 `type`（可选）和 `initializer`（可选）

TypeScript 的 AST 相比 JavaScript 增加了大量类型相关节点：`TypeReference`、`TypeLiteral`、`MappedType`、`ConditionalType`、`IndexedAccessType` 等，共计超过 200 种节点类型。

### 1.2.3 Binder（符号绑定）

Binder 阶段遍历 AST，为每个标识符建立符号（Symbol）绑定，构建作用域链。符号是 TypeScript 语义分析的核心概念——每个声明（变量、函数、类、类型等）在 Binder 中注册为一个 Symbol，包含名称、标志（`Flags`）、声明列表和引用列表。

Binder 维护一个作用域栈：进入函数、类或模块时压入新作用域，退出时弹出。同一作用域内不允许重复声明（除非使用 `namespace` 合并）。符号绑定完成后，每个标识符引用都指向其对应的声明 Symbol，为后续的类型检查奠定基础。

### 1.2.4 Checker（类型检查）

Checker 是 TypeScript 编译器最复杂的阶段，负责类型推导、类型兼容性验证和错误报告。它基于 Binder 构建的符号表，对 AST 进行深度遍历，为每个表达式和语句推断类型。

类型检查的核心机制包括：
- **类型推导（Type Inference）**：根据上下文自动推断变量类型，如 `const x = 1` 推断 `x` 为 `number` 类型
- **结构化类型系统（Structural Typing）**：判断两个类型是否兼容时，比较其结构（成员列表）而非名称
- **类型窄化（Type Narrowing）**：通过 `typeof`、`instanceof`、类型守卫等条件判断，在分支内缩小联合类型的范围
- **泛型实例化（Generic Instantiation）**：将泛型参数替换为具体类型，生成特化后的类型签名

Checker 阶段产生的错误信息是开发者最常接触的编译输出。错误类型包括类型不兼容、属性不存在、参数数量不匹配等数百种。

### 1.2.5 Emitter（代码生成）

Emitter 是编译管线的最后阶段，负责将经过类型检查的 AST 转换为目标 JavaScript 代码。这一过程包括：

1. **类型擦除（Type Erasure）**：移除所有类型注解、接口、类型别名等纯类型构造。这是 TypeScript 编译的核心特征——类型信息只在编译期存在，运行时 JavaScript 不包含任何类型标注
2. **降级转换（Downleveling）**：将 ES6+ 语法转换为目标 ECMAScript 版本。例如，`async/await` 在 `--target ES5` 下会被降级为 Generator 包装的 Promise 链
3. **辅助函数注入**：根据目标版本注入运行时辅助函数，如 `__extends`、`__awaiter`、`__decorate` 等
4. **声明文件生成**：当 `--declaration` 开启时，Emitter 同时输出 `.d.ts` 声明文件，保留类型信息供其他模块消费

Emitter 支持通过 `customTransformers` 钩子插入自定义 AST 转换逻辑，这为框架开发者提供了在代码生成阶段注入额外代码的能力。

## 1.3 潜在风险

### 1.3.1 类型擦除导致的运行时错误

TypeScript 最容易被忽视的风险在于：编译期类型安全不等于运行时安全。类型擦除后，所有类型信息在运行时消失，这可能导致以下问题：

**`enum` 编译为 IIFE 的引用问题**：TypeScript 的 `enum` 在编译后生成一个立即执行函数（IIFE, Immediately Invoked Function Expression）。当 `enum` 定义在某个模块中，而其他模块在顶层作用域引用该 `enum` 的值时，如果模块加载顺序不当，可能出现 `undefined` 引用错误。例如：

```typescript
// color.ts
export enum Color { Red, Green, Blue }

// usage.ts
import { Color } from './color';
const c: Color = Color.Red; // 运行时：Color 可能为 undefined
```

如果 `usage.ts` 在 `color.ts` 之前被求值，`Color` 变量为 `undefined`，访问 `Color.Red` 会抛出 `TypeError`。这是 CommonJS 模块循环依赖中的常见陷阱。

**`namespace` 的非标准特性**：TypeScript 的 `namespace`（旧称 `module`）是早期设计遗留的非标准特性。编译后生成嵌套的全局对象赋值，在模块化工程中容易引发命名冲突和加载顺序问题。现代 TypeScript 推荐使用 ES Module 替代 `namespace`。

**装饰器的元数据发射依赖**：当启用 `--experimentalDecorators` 和 `--emitDecoratorMetadata` 时，编译器会为装饰器注入类型元数据。这依赖 `reflect-metadata` 库在运行时的支持。如果该库未正确加载，或目标环境不支持 `Reflect.metadata` API，装饰器行为将不可预测。

### 1.3.2 `--isolatedModules` 限制

`--isolatedModules` 标志要求每个文件可以独立编译（不依赖跨文件的类型信息）。这在工具链中使用 Babel 或 `esbuild` 等非 `tsc` 编译器时是必需的，但也带来了限制：

- **`const enum` 无法使用**：`const enum` 在编译期被内联展开，但独立编译器无法获取跨文件的 `const enum` 值，因此 `--isolatedModules` 下禁止导出 `const enum`
- **不支持重导出类型**：`export type { Foo } from './foo'` 这种仅重导出类型的语法在部分独立编译器中有兼容性问题
- **部分类型推导能力受限**：独立编译器无法进行跨文件的类型推导，某些复杂的泛型推断可能失败

## 1.4 优化策略

### 1.4.1 `--incremental` 增量编译

启用 `--incremental` 后，`tsc` 会将编译结果缓存到 `.tsbuildinfo` 文件中。后续编译仅重新处理发生变化的文件及其依赖，大幅缩短二次编译时间。

```json
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": "./.tsbuildinfo"
  }
}
```

`.tsbuildinfo` 文件记录了每个文件的哈希值、依赖关系和输出文件路径。`tsc` 在启动时读取该文件，对比文件哈希，仅对发生变化的文件重新执行完整的编译管线。在大型项目中，增量编译可将二次编译时间从分钟级降至秒级。

### 1.4.2 `--skipLibCheck` 跳过声明文件检查

`.d.ts` 声明文件通常来自第三方库，其类型定义已经过验证。启用 `--skipLibCheck` 后，`tsc` 跳过对所有 `.d.ts` 文件的类型检查，仅进行解析和合并。这可以显著减少编译时间，尤其是在 `node_modules` 包含大量类型定义的项目中。

```json
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

需要注意的是，如果第三方库的类型定义存在错误，`--skipLibCheck` 会掩盖这些问题。建议在 CI 环境中定期关闭此选项以验证类型定义的正确性。

### 1.4.3 Project References 分项目编译

Project References 是 TypeScript 3.0 引入的编译优化机制，允许将大型项目拆分为多个子项目，每个子项目独立编译，并通过引用关系共享类型信息。

```json
// tsconfig.json（根项目）
{
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" },
    { "path": "./packages/app" }
  ]
}
```

每个子项目在 `tsconfig.json` 中设置 `"composite": true`，并指定 `rootDir` 和 `outDir`。编译时使用 `tsc --build` 模式，`tsc` 会自动检测依赖关系，仅重新编译发生变化的子项目及其下游依赖。在 monorepo 架构中，Project References 配合 `--incremental` 可以大幅提升编译效率。

### 1.4.4 `--isolatedModules` 确保单文件编译安全

虽然 `--isolatedModules` 带来了一些限制（见 1.3.2），但它确保了代码可以被 Babel、`esbuild`、`swc` 等非 `tsc` 编译器正确编译。在以下场景中强烈建议启用：

- 使用 Vite、Next.js、Nuxt 等基于 `esbuild` 或 `swc` 的构建工具
- 使用 Babel 的 `@babel/preset-typescript` 进行编译
- 需要快速原型开发，跳过完整类型检查

```json
{
  "compilerOptions": {
    "isolatedModules": true
  }
}
```

启用后，编译器会报告那些在独立编译下不安全的语法模式，帮助开发者提前规避兼容性问题。

## 1.5 典型问题处理

### 1.5.1 类型擦除后运行时 `undefined`（enum 反向映射陷阱）

TypeScript 的 `enum` 支持反向映射（Reverse Mapping），即可以通过值获取名称：

```typescript
enum Color { Red = 0, Green = 1, Blue = 2 }
console.log(Color[0]); // "Red"
```

编译后的 IIFE 同时注册了正向和反向映射。问题在于，如果 `enum` 定义在另一个模块中，且模块加载顺序异常，`Color` 对象可能尚未初始化。解决方案：

1. **使用 `const enum`**（但注意 `--isolatedModules` 限制）：编译期完全内联，不生成 IIFE
2. **使用联合类型替代**：`type Color = 'Red' | 'Green' | 'Blue'`
3. **确保模块加载顺序**：使用 ES Module 的静态导入，避免动态 `require()` 和循环依赖

### 1.5.2 同名称类型冲突（`Duplicate identifier`）

当两个模块导出同名的类型，或在同一作用域内声明了同名的变量和类型时，编译器报错 `Duplicate identifier`。

常见场景及解决方案：

- **全局类型声明冲突**：多个 `.d.ts` 文件声明了同名的全局类型。使用 `declare module` 或 `namespace` 进行隔离
- **库类型定义冲突**：两个依赖包定义了同名的类型。使用 `@types` 版本对齐，或在 `tsconfig.json` 的 `paths` 中指定类型解析优先级
- **变量与类型同名**：TypeScript 允许变量和类型同名（如 `class Foo` 既是值又是类型），但 `interface` 和 `type alias` 与变量同名时会冲突。使用 `import type` 区分

### 1.5.3 模块解析失败（`Cannot find module`）

`Cannot find module 'xxx'` 是 TypeScript 开发中最常见的错误之一，通常由以下三种原因导致：

1. **`moduleResolution` 策略不匹配**：TypeScript 支持 `classic` 和 `node`（以及 `node16`、`nodenext`）两种模块解析策略。当使用 `module: "ESNext"` 但未设置 `moduleResolution: "bundler"` 时，部分模块路径可能无法正确解析。解决方案：保持 `module` 和 `moduleResolution` 的匹配，推荐使用 `"moduleResolution": "bundler"` 配合 `"module": "ESNext"`

2. **类型声明文件缺失**：JavaScript 库需要对应的 `.d.ts` 文件才能被 TypeScript 识别。如果库未包含类型声明，尝试安装 `@types/xxx` 包，或在项目内创建 `declare module 'xxx'` 的声明文件

3. **路径别名未配置**：使用 Webpack 或 Vite 的路径别名（如 `@/` 映射到 `src/`）时，需要在 `tsconfig.json` 中同步配置 `paths` 和 `baseUrl`：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

## 1.6 开发者技能

### 1.6.1 AST Explorer 可视化工具

[AST Explorer](https://astexplorer.net/) 是理解 TypeScript AST 结构的最佳交互式工具。在工具中选择语言为 "TypeScript"，输入源码后即可实时查看 AST 树形结构。每个节点可展开查看其 `kind`、`pos`、`end` 等属性，帮助开发者直观理解 Parser 阶段生成的树结构。

使用技巧：
- 在 AST Explorer 中对比不同语法结构的 AST 差异（如 `interface` vs `type`）
- 查看 `--target` 版本对 AST 的影响（如 `??` 空值合并运算符在不同目标版本下的降级表现）
- 配合 `ts.createSourceFile` 的编程接口，验证自定义 Transformer 的输入输出

### 1.6.2 `tsc --showConfig` 查看最终配置

`tsc --showConfig` 命令会输出经过合并和继承后的最终 `tsconfig.json` 配置。这在调试配置继承关系（如多 `tsconfig.json` 通过 `extends` 链式继承）时非常有用：

```bash
tsc --showConfig
```

输出包含所有默认值和显式配置的合并结果，帮助开发者确认实际生效的编译选项。

### 1.6.3 `tsc --generateTrace` 生成编译性能追踪

对于大型项目的编译性能优化，`tsc --generateTrace` 可以生成 Chrome DevTools 可读的性能追踪文件：

```bash
tsc --generateTrace ./trace
```

生成的 `trace.json` 和 `types.json` 文件可以在 Chrome 浏览器的 `chrome://tracing` 页面中加载，可视化展示编译各阶段的耗时分布。通过分析追踪数据，开发者可以定位编译瓶颈——是类型检查耗时过长，还是 Emitter 阶段占用了过多资源，从而有针对性地进行优化。

## 1.7 示例代码：类型擦除前后对比

以下示例展示了 TypeScript 源码与编译后 JavaScript 的对应关系，直观体现类型擦除和 `enum` 转换机制。

```typescript
// ===== TS 源码 =====
enum Color { Red, Green, Blue }
const color: Color = Color.Red;

interface Point {
  x: number;
  y: number;
}

function greet(name: string): string {
  return `Hello, ${name}!`;
}

const origin: Point = { x: 0, y: 0 };
```

```javascript
// ===== 编译后 JS（默认 target ES2015）=====
var Color;
(function (Color) {
    Color[Color["Red"] = 0] = "Red";
    Color[Color["Green"] = 1] = "Green";
    Color[Color["Blue"] = 2] = "Blue";
})(Color || (Color = {}));
const color = Color.Red;

function greet(name) {
    return `Hello, ${name}!`;
}

const origin = { x: 0, y: 0 };
```

观察要点：
- `enum Color` 被编译为 IIFE，同时注册正向映射（`Color.Red = 0`）和反向映射（`Color[0] = "Red"`）
- `interface Point` 被完全擦除，运行时不存在
- 函数参数 `name: string` 中的类型注解被移除
- `const origin: Point` 的类型注解被移除，仅保留对象字面量

## 1.8 示例代码：自定义 Transformer

TypeScript 编译器允许通过 `customTransformers` 选项在 Emitter 阶段插入自定义 AST 转换逻辑。以下示例展示了一个简化版的自定义 Transformer，用于在编译时自动为所有函数添加日志输出。

```typescript
// ===== 自定义 Transformer 实现 =====
import ts from 'typescript';

/**
 * 自定义 Transformer：为每个函数声明插入 console.log 调用
 */
const functionLoggerTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (sourceFile) => {
        const visitor = (node: ts.Node): ts.Node => {
            // 检查是否为函数声明
            if (ts.isFunctionDeclaration(node) && node.name) {
                const funcName = node.name.text;
                const logStatement = ts.factory.createExpressionStatement(
                    ts.factory.createCallExpression(
                        ts.factory.createPropertyAccessExpression(
                            ts.factory.createIdentifier('console'),
                            ts.factory.createIdentifier('log')
                        ),
                        undefined,
                        [
                            ts.factory.createStringLiteral(`Calling function: ${funcName}`)
                        ]
                    )
                );
                // 在函数体开头插入日志语句
                return ts.factory.updateFunctionDeclaration(
                    node,
                    node.modifiers,
                    node.asteriskToken,
                    node.name,
                    node.typeParameters,
                    node.parameters,
                    node.type,
                    ts.factory.createBlock([
                        logStatement,
                        ...(node.body?.statements ?? [])
                    ])
                );
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitNode(sourceFile, visitor);
    };
};

// ===== 使用方式 =====
const program = ts.createProgram({
    rootNames: ['input.ts'],
    options: {
        target: ts.ScriptTarget.ES2015,
        customTransformers: {
            before: [functionLoggerTransformer]
        }
    }
});
program.emit();
```

```typescript
// ===== 输入 input.ts =====
function add(a: number, b: number): number {
    return a + b;
}

// ===== 编译后输出 =====
function add(a, b) {
    console.log("Calling function: add");
    return a + b;
}
```

此示例展示了 AST 操作的核心模式：
1. 使用 `ts.TransformerFactory` 创建转换工厂
2. 定义 `visitor` 函数遍历 AST 节点
3. 使用 `ts.isFunctionDeclaration` 等类型守卫匹配目标节点
4. 使用 `ts.factory.create*` API 构造新的 AST 节点
5. 通过 `ts.visitEachChild` 递归遍历子节点

实际工程中，自定义 Transformer 常用于 AOT 编译、依赖注入、日志注入、性能监控埋点等场景。
