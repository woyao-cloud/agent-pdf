# 附录 C：JS 到 TS 迁移清单

## 1. 准备工作

```typescript
// 1. 安装 TypeScript
npm install typescript --save-dev

// 2. 生成 tsconfig.json
npx tsc --init

// 3. 安装 @types 包
npm install @types/node --save-dev
npm install @types/express --save-dev  // 如果使用 Express
npm install @types/react --save-dev   // 如果使用 React

// 4. 安装 ESLint 配置
npm install @typescript-eslint/parser @typescript-eslint/eslint-plugin --save-dev
```

## 2. 基础配置

```typescript
// tsconfig.json - 迁移期推荐配置
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": false,           // 先关闭严格模式
    "noImplicitAny": false,    // 允许隐式 any
    "allowJs": true,           // 允许 JS 文件
    "checkJs": false,          // 不检查 JS 文件
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## 3. 迁移步骤

### 第一阶段：文件重命名

```typescript
// 1. 将 .js 文件重命名为 .ts
// 2. 将 .jsx 文件重命名为 .tsx
// 3. 此时会有大量类型错误，不要惊慌

// 常见错误处理：
// - 隐式 any：添加 :any 临时标记
// - 缺少类型声明：创建 .d.ts 文件
// - 模块找不到：安装 @types 包
```

### 第二阶段：添加类型声明

```typescript
// 1. 为函数添加参数和返回值类型
// 之前
function add(a, b) {
  return a + b;
}

// 之后
function add(a: number, b: number): number {
  return a + b;
}

// 2. 为对象添加接口
// 之前
function processUser(user) {
  return `${user.name} (${user.email})`;
}

// 之后
interface User {
  name: string;
  email: string;
}
function processUser(user: User): string {
  return `${user.name} (${user.email})`;
}
```

### 第三阶段：启用严格模式

```typescript
// 逐步启用严格选项
// 1. 先启用 noImplicitAny
{
  "compilerOptions": {
    "noImplicitAny": true
  }
}

// 2. 再启用 strictNullChecks
{
  "compilerOptions": {
    "strictNullChecks": true
  }
}

// 3. 最后启用 strict
{
  "compilerOptions": {
    "strict": true
  }
}
```

## 4. 常见问题处理

```typescript
// 1. 第三方库无类型声明
// 创建 src/types/global.d.ts
declare module "legacy-lib" {
  export function doSomething(): void;
}

// 2. this 指向问题
// 使用箭头函数或 bind
class MyClass {
  private value = 42;
  method = () => this.value;  // 箭头函数
}

// 3. 动态属性
// 使用索引签名
interface DynamicObject {
  [key: string]: unknown;
}
```

## 5. 迁移完成检查清单

```typescript
interface MigrationChecklist {
  // 配置
  tsconfigConfigured: boolean;     // tsconfig.json 已配置
  strictModeEnabled: boolean;      // 严格模式已启用
  eslintConfigured: boolean;       // ESLint 已配置

  // 代码
  allFilesMigrated: boolean;       // 所有文件已迁移
  noAnyTypes: boolean;             // 没有 any 类型
  allFunctionsTyped: boolean;      // 所有函数已添加类型
  allInterfacesDefined: boolean;   // 所有接口已定义

  // 第三方库
  typePackagesInstalled: boolean;  // @types 包已安装
  customDeclarationsAdded: boolean; // 自定义声明已添加

  // 测试
  testsPassing: boolean;           // 测试通过
  buildPassing: boolean;           // 构建通过
  lintPassing: boolean;            // Lint 通过
}
```

## 6. 推荐迁移顺序

1. 配置 TypeScript 和 ESLint
2. 重命名 .js 为 .ts（允许 JS 混合）
3. 添加基础类型声明（any 可接受）
4. 为公共 API 添加类型
5. 为内部函数添加类型
6. 逐步替换 any
7. 启用 strictNullChecks
8. 启用完整 strict 模式
9. 清理自定义声明
10. 配置 CI 类型检查
