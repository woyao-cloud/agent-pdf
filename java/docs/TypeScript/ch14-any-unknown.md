# 四大类型灾难

## 1. 使用场景

TypeScript 的类型系统虽然强大，但存在几个常见的"类型灾难"场景，它们会导致类型安全失效、运行时错误难以追踪：

- **遗留代码迁移**：从 JavaScript 迁移时大量使用 `any`
- **第三方库类型冲突**：不同版本的类型声明互相覆盖
- **复杂泛型推导**：泛型在多层嵌套后推导退化
- **this 上下文丢失**：回调函数中 this 指向错误
- **JSON 解析**：`JSON.parse()` 返回 `any` 导致类型污染

这些问题的共同特征是：**类型系统看似正常工作，但运行时仍然出现类型相关的错误**。

## 2. 实现原理

### any 的传染性

`any` 是 TypeScript 类型系统的"黑洞"——一旦引入，会沿着类型图传播：

```typescript
// any 的传染性示例
function getData(): any {
  return JSON.parse(localStorage.getItem("data")!);
}

const data = getData();           // data: any
const name: string = data.name;   // 通过，但 name 可能是 undefined
const length = name.length;       // 运行时可能报错：Cannot read property 'length' of undefined

// any 的传播路径：
// getData() → any → data.name → any → name.length → any
// 整个调用链都失去了类型保护
```

`any` 的本质是**退出类型检查器**。当 TypeScript 遇到 `any` 类型时，会跳过所有类型检查，包括：
- 属性访问检查
- 函数参数检查
- 赋值兼容性检查
- null/undefined 检查

```typescript
// any 跳过所有检查
const value: any = "hello";
value();                    // 不报错，但运行时 TypeError
value.someMethod();         // 不报错，但运行时 TypeError
const num: number = value; // 不报错，但 num 实际是 string
```

### unknown 的安全收窄

`unknown` 是类型安全的 `any`——它要求在使用前必须进行类型收窄：

```typescript
// unknown 必须收窄后才能使用
function safeParse(json: string): unknown {
  return JSON.parse(json);
}

const data = safeParse('{"name": "Alice"}');
// data.name;  // 错误：Object is of type 'unknown'

// 必须收窄
if (typeof data === "object" && data !== null) {
  // 这里 data 收窄为 object
  if ("name" in data) {
    // 这里 data 收窄为 { name: unknown }
    const name = (data as { name: string }).name;
  }
}
```

### 第三方库类型冲突

当项目中存在多个版本的同一类型声明时，会发生类型冲突：

```typescript
// 场景：express 和 @types/express 版本不匹配
// node_modules/express/index.d.ts 中定义了 Request
// node_modules/@types/express/index.d.ts 中定义了不同的 Request

// 症状：类型不兼容、属性缺失、方法签名不匹配

// 解决方案：使用 patch-package 修复
// patches/@types+express+4.17.21.patch
diff --git a/node_modules/@types/express/index.d.ts b/node_modules/@types/express/index.d.ts
index abc123..def456 100644
--- a/node_modules/@types/express/index.d.ts
+++ b/node_modules/@types/express/index.d.ts
@@ -10,7 +10,7 @@
-import { Request } from "express-serve-static-core";
+import { Request } from "../express-serve-static-core";
```

### 泛型推导退化

泛型在多层嵌套后，类型参数可能退化为 `unknown` 或 `any`：

```typescript
// 泛型推导退化示例
function createContainer<T>(value: T) {
  return {
    getValue: () => value,
    setValue: (v: T) => { value = v; },
  };
}

// 正常推导
const container1 = createContainer("hello");
const val1 = container1.getValue();  // string ✓

// 推导退化：多层嵌套
const containers = [1, 2, 3].map(n => createContainer(n));
const val2 = containers[0].getValue();  // number ✓（这里没问题）

// 更复杂的退化场景
function wrapInPromise<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

// 条件类型中的推导退化
type Unpack<T> = T extends Promise<infer U> ? U : T;
type Result = Unpack<Promise<string>>;  // string ✓
type Nested = Unpack<Promise<Promise<string>>>;
// 只解包一层，结果是 Promise<string>，不是 string
```

### this 指向丢失

TypeScript 无法在运行时修复 JavaScript 的 `this` 绑定问题：

```typescript
class Counter {
  count = 0;

  increment() {
    this.count++;
  }

  // 正确：使用箭头函数
  incrementArrow = () => {
    this.count++;
  };
}

const counter = new Counter();

// this 丢失
setTimeout(counter.increment, 100);  // 运行时 this 指向全局
// 等价于：const fn = counter.increment; fn();

// 解决方案
setTimeout(counter.increment.bind(counter), 100);  // 绑定 this
setTimeout(() => counter.increment(), 100);         // 箭头函数包装
setTimeout(counter.incrementArrow, 100);             // 箭头函数方法
```

## 3. 潜在风险

### any 的隐性引入

```typescript
// 隐式 any 的常见来源
const data = JSON.parse(json);           // any
const result = fetch("/api").then(r => r.json());  // Promise<any>
const [first] = array;                   // 未开启 noUncheckedIndexedAccess 时
Object.keys(obj).forEach(key => {
  const val = obj[key];                  // 隐式 any
});
```

### 类型断言滥用

```typescript
// 过度使用 as 断言会绕过类型检查
const data = JSON.parse(json) as { name: string };
// 如果 json 格式不对，运行时崩溃

// 更安全的做法：使用 Zod 等运行时校验
import { z } from "zod";
const Schema = z.object({ name: z.string() });
const data = Schema.parse(JSON.parse(json));
```

## 4. 优化策略

### any 替代方案

```typescript
// 层级递进的替代方案
// 1. unknown（最安全）
function parseJSON(json: string): unknown {
  return JSON.parse(json);
}

// 2. 泛型（需要调用者提供类型）
function parseJSON<T>(json: string): T {
  return JSON.parse(json);
}

// 3. 具体类型（最理想）
interface UserData {
  name: string;
  age: number;
}
function parseUser(json: string): UserData {
  return JSON.parse(json) as UserData;
}
```

### 类型安全工具

```typescript
// 类型安全的 JSON 解析
function safeJSONParse<T>(json: string, validator: (data: unknown) => data is T): T | Error {
  try {
    const parsed = JSON.parse(json);
    if (validator(parsed)) {
      return parsed;
    }
    return new Error("Invalid data format");
  } catch (e) {
    return e instanceof Error ? e : new Error("Parse failed");
  }
}

// 使用示例
interface User {
  name: string;
  age: number;
}

function isUser(data: unknown): data is User {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as User).name === "string" &&
    typeof (data as User).age === "number"
  );
}

const result = safeJSONParse('{"name":"Alice","age":30}', isUser);
```

### ESLint 规则约束

```typescript
// .eslintrc.json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/restrict-template-expressions": "error"
  }
}
```

## 5. 典型问题处理

### 问题：第三方库没有类型声明

```typescript
// 方案1：创建 .d.ts 声明
// src/types/legacy-lib.d.ts
declare module "legacy-lib" {
  export function doSomething(): void;
  export const VERSION: string;
}

// 方案2：使用 declare module 通配
declare module "*.json" {
  const value: any;
  export default value;
}
```

### 问题：Object.entries 类型不精确

```typescript
// Object.entries 返回 [string, any][]
const obj = { a: 1, b: "hello" };
const entries = Object.entries(obj);
// entries: [string, string | number][]

// 解决方案：自定义类型安全版本
function typedEntries<T extends Record<string, any>>(
  obj: T
): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as any;
}

const typed = typedEntries(obj);
// typed: [keyof typeof obj, string | number][]
```

## 6. 开发者技能

应对类型灾难的核心技能：

1. **识别 any 来源**：知道 JSON.parse、fetch、第三方库等常见 any 来源
2. **类型收窄**：熟练使用 typeof、in、instanceof、类型守卫
3. **运行时校验**：掌握 Zod/Yup 等运行时校验库
4. **ESLint 防护**：配置 no-explicit-any 等规则
5. **patch-package**：修复第三方库类型问题

## 7. 示例代码

### 类型安全的数据获取

```typescript
// 类型安全的 API 请求
interface ApiResponse<T> {
  data: T;
  error: string | null;
}

async function fetchJSON<T>(
  url: string,
  validator: (data: unknown) => data is T
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url);
    const json: unknown = await response.json();

    if (validator(json)) {
      return { data: json, error: null };
    }
    return { data: null as any, error: "Invalid response format" };
  } catch (e) {
    return { data: null as any, error: (e as Error).message };
  }
}

// 类型守卫
interface Product {
  id: number;
  name: string;
  price: number;
}

function isProduct(data: unknown): data is Product {
  if (typeof data !== "object" || data === null) return false;
  const p = data as Product;
  return (
    typeof p.id === "number" &&
    typeof p.name === "string" &&
    typeof p.price === "number"
  );
}

// 使用
const result = await fetchJSON("/api/product/1", isProduct);
if (result.error) {
  console.error("Failed:", result.error);
} else {
  console.log(result.data.name);  // Product 类型，安全
}
```

### 类型安全的 this

```typescript
// 类型安全的 this 处理
interface ButtonConfig {
  text: string;
  onClick: (this: HTMLElement, e: MouseEvent) => void;
}

// 使用 ThisType 标记 this 类型
interface VueMethods {
  [key: string]: (this: VueInstance) => void;
}

interface VueInstance {
  data: Record<string, any>;
  methods: VueMethods;
}

// 使用 NoInfer 防止 this 类型推导退化
function createHandler<T extends (this: any, ...args: any[]) => any>(
  handler: T & ThisType<ThisParameterType<T>>
): T {
  return handler.bind(undefined) as T;
}
```

## 8. 小结

四大类型灾难的核心要点：

- **any 传染性**：any 会沿着类型图传播，一旦引入就失去类型安全
- **unknown 安全收窄**：unknown 是 any 的安全替代，使用前必须收窄
- **第三方库类型冲突**：使用 patch-package 或自定义声明解决
- **泛型推导退化**：注意嵌套泛型的类型参数丢失
- **this 指向丢失**：使用箭头函数、bind 或 ThisType 标记
- **最佳实践**：ESLint 禁止 any、运行时校验、类型守卫收窄
