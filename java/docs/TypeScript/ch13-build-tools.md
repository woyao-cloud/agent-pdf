# 构建工具链与性能

## 1. 使用场景

TypeScript 的构建工具链选择直接影响开发体验和构建性能。主要使用场景包括：

- **开发服务器**：需要毫秒级热更新的开发环境
- **生产构建**：需要 Tree Shaking、代码压缩的优化构建
- **库发布**：需要输出 ESM 和 CJS 双格式
- **大型项目**：需要处理数万个文件的增量编译
- **CI/CD**：需要快速的类型检查与构建分离

现代 TypeScript 构建工具链已经从单一的 `tsc` 演变为多工具协作的架构。

## 2. 实现原理

### Vite 的编译原理

Vite 在开发环境使用 esbuild 进行转译，生产环境使用 Rollup 进行打包：

```typescript
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    // 开发环境：esbuild 处理 ts → js
    target: "es2020",
    tsconfigRaw: {
      compilerOptions: {
        jsx: "react-jsx",
      },
    },
  },
  build: {
    // 生产环境：Rollup 打包
    target: "es2020",
    minify: "esbuild",  // 使用 esbuild 压缩
  },
});
```

**esbuild 转译 vs tsc 编译**：

| 特性 | tsc | esbuild |
|------|-----|---------|
| 类型检查 | 是 | 否 |
| 转译速度 | 慢 | 快（快 10-100 倍） |
| 目标支持 | 完整 | 大部分 |
| 自定义插件 | 有限 | 支持 |
| 增量编译 | 支持 | 支持 |

```typescript
// esbuild 的 Go 语言并行编译
// 充分利用 CPU 多核，解析和生成速度远超 tsc
// 但 esbuild 不做类型检查，需要配合 tsc --noEmit
```

### SWC 和 Oxc

SWC（Speedy Web Compiler）和 Oxc 是 Rust 编写的编译工具：

```typescript
// 使用 SWC 转译 TypeScript
// .swcrc
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "tsx": true
    },
    "target": "es2020",
    "transform": {
      "react": {
        "runtime": "automatic"
      }
    }
  },
  "module": {
    "type": "es6"
  }
}
```

**Oxc** 是新一代 Rust 编写的工具链，包含解析器、检查器、压缩器。它的解析器比 SWC 快 2-3 倍，且内存占用更低。

### tsc --extendedDiagnostics

TypeScript 内置的性能诊断工具：

```bash
# 查看编译性能指标
tsc --extendedDiagnostics

# 输出示例：
# Files:                         1250
# Lines:                       245000
# Identifiers:                890000
# Symbols:                    320000
# Types:                      180000
# Instantiations:             560000
# Memory used:               245000K
# Assignability cache size:   45000
# Identity cache size:        12000
# Subtype cache size:         28000
# Strict type checking:       true
```

关键指标解读：
- **Instantiations**：泛型实例化次数，过高表示类型体操过多
- **Types**：类型数量，反映代码复杂度
- **Memory used**：内存占用，超过 1GB 需要优化
- **Assignability cache size**：类型兼容性检查缓存

### 类型爆炸规避

类型爆炸（Type Explosion）是指泛型实例化导致编译时间和内存暴增：

```typescript
// 类型爆炸示例
type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

// 对大型对象使用 DeepReadonly 会导致大量递归实例化
interface LargeConfig {
  server: { host: string; port: number };
  database: { url: string; pool: { min: number; max: number } };
  // ... 更多嵌套字段
}

// 优化：限制递归深度
type DeepReadonlyV2<T, Depth extends number = 5> = Depth extends 0
  ? T
  : {
      readonly [P in keyof T]: DeepReadonlyV2<T[P], Prev[Depth]>;
    };
```

## 3. 潜在风险

### 类型检查与转译分离

```typescript
// 风险：esbuild 转译通过，但 tsc 类型检查失败
// 开发时一切正常，CI 时类型检查报错
// 解决方案：在 CI 中同时运行 tsc --noEmit
{
  "scripts": {
    "dev": "vite",                    // esbuild 转译，无类型检查
    "type-check": "tsc --noEmit",     // 单独类型检查
    "build": "tsc --noEmit && vite build"  // 先检查再构建
  }
}
```

### 装饰器兼容性

```typescript
// tsc 支持 ES5 和 TC39 两种装饰器
// esbuild 只支持 TC39 标准装饰器
// 如果使用旧式装饰器，esbuild 会报错

// 旧式装饰器（tsc 支持，esbuild 不支持）
class MyClass {
  @logMethod
  method() {}
}

// 解决方案：使用 TC39 标准装饰器
function logMethod(target: any, context: ClassMethodDecoratorContext) {
  // ...
}
```

## 4. 优化策略

### 分层构建策略

```typescript
// 大型项目推荐的分层构建
{
  "scripts": {
    // 开发：快速转译，无类型检查
    "dev": "vite",
    // 类型检查：单独运行
    "type-check": "tsc --noEmit",
    // 生产构建：先检查再构建
    "build": "npm run type-check && vite build",
    // CI：并行运行
    "ci": "npm run type-check & npm run build"
  }
}
```

### 增量编译优化

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",
    "skipLibCheck": true,        // 跳过 .d.ts 检查
    "skipDefaultLibCheck": true, // 跳过默认库检查
    "noEmit": true               // 仅类型检查时
  }
}
```

### 使用 tsc-bench 评估性能

```bash
# 安装 tsc-bench
npx tsc-bench

# 输出编译时间分布
# Parse: 1.2s
# Bind: 0.8s
# Check: 5.6s
# Emit: 0.4s
# Total: 8.0s
```

## 5. 典型问题处理

### 问题：Vite 开发环境类型错误不显示

```typescript
// vite.config.ts 中启用 vite-plugin-checker
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

export default defineConfig({
  plugins: [
    checker({
      typescript: true,  // 在 Vite 中显示 TS 类型错误
      overlay: true,     // 在浏览器中显示错误覆盖层
    }),
  ],
});
```

### 问题：构建产物包含类型代码

```typescript
// 确保 tsconfig 中 "isolatedModules": true
// 避免使用 const enum（esbuild 不支持）
// 避免使用 namespace（esbuild 不支持）

// 不兼容 esbuild 的写法
const enum Color { Red, Green, Blue }
namespace MyLib {
  export const value = 42;
}

// 兼容写法
const Color = { Red: 0, Green: 1, Blue: 2 } as const;
const MyLib = { value: 42 };
```

### 问题：构建速度随项目增长急剧下降

```typescript
// 1. 使用 project references 拆分
// 2. 开启 incremental
// 3. 使用 --noEmit 分离类型检查
// 4. 考虑使用 ts-loader 的 transpileOnly 模式
// webpack.config.js
{
  test: /\.ts$/,
  use: [
    {
      loader: "ts-loader",
      options: {
        transpileOnly: true,  // 仅转译，不检查类型
      },
    },
  ],
}
```

## 6. 开发者技能

构建工具链的核心技能：

1. **理解转译 vs 编译**：知道 esbuild/SWC 只转译不检查
2. **性能诊断**：使用 `--extendedDiagnostics` 定位性能瓶颈
3. **工具选型**：根据项目规模选择合适工具
4. **CI 优化**：分离类型检查和构建步骤
5. **兼容性管理**：处理不同工具间的语法兼容性

## 7. 示例代码

### 完整的构建配置

```typescript
// vite.config.ts - 完整的 Vite + TypeScript 配置
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    checker({
      typescript: true,
      eslint: {
        lintCommand: "eslint src --ext .ts,.tsx",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    target: "es2020",
    tsconfigRaw: {
      compilerOptions: {
        jsx: "react-jsx",
      },
    },
  },
  build: {
    target: "es2020",
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          ui: ["antd", "@ant-design/icons"],
        },
      },
    },
    sourcemap: false,
  },
});
```

### 性能诊断脚本

```typescript
// scripts/bench-build.ts
import { execSync } from "child_process";

console.log("=== TypeScript 构建性能诊断 ===\n");

// 运行诊断
const output = execSync("tsc --extendedDiagnostics", {
  encoding: "utf-8",
});

console.log(output);

// 分析关键指标
const metrics = {
  files: /Files:\s+(\d+)/.exec(output)?.[1],
  types: /Types:\s+(\d+)/.exec(output)?.[1],
  instantiations: /Instantiations:\s+(\d+)/.exec(output)?.[1],
  memory: /Memory used:\s+(\d+)K/.exec(output)?.[1],
};

console.log("\n=== 性能分析 ===");
console.log(`文件数: ${metrics.files}`);
console.log(`类型数: ${metrics.types}`);
console.log(`泛型实例化: ${metrics.instantiations}`);
console.log(`内存使用: ${metrics.memory}K`);

if (Number(metrics.instantiations) > 500000) {
  console.warn("⚠️ 泛型实例化过多，建议减少类型体操");
}
if (Number(metrics.memory) > 1000000) {
  console.warn("⚠️ 内存使用超过 1GB，建议优化");
}
```

## 8. 小结

TypeScript 构建工具链的核心要点：

- **现代工具链**：Vite（esbuild）+ tsc 分离，开发用 esbuild 快速转译，CI 用 tsc 类型检查
- **性能诊断**：`--extendedDiagnostics` 是定位编译瓶颈的关键工具
- **类型爆炸**：避免深度递归泛型，限制类型实例化次数
- **工具选型**：esbuild 最快但功能有限，SWC/Oxc 是 Rust 生态的强力竞争者
- **构建策略**：分层构建（开发/类型检查/生产）是大型项目的最佳实践
- **兼容性**：注意 const enum、namespace、装饰器等语法在不同工具间的差异
