# 第六章：映射类型与模板字面量

映射类型（Mapped Types）是 TypeScript 中批量转换对象类型的利器，它允许我们遍历对象的所有键并对每个属性应用类型变换。模板字面量类型（Template Literal Types）则将类型系统扩展到了字符串模式匹配领域，使得类型可以在字符串层面进行运算。本章将深入探讨这两种高级类型特性的原理、应用和优化策略。

---

## 6.1 映射类型基础

### 6.1.1 映射类型的语法

映射类型的核心语法是 `{ [K in keyof T]: T[K] }`，它遍历类型 `T` 的所有键，并为每个键创建一个新属性。这是 TypeScript 类型系统中最接近"循环"的构造：

```typescript
// 最基本的映射类型：复制类型
type MyCopy<T> = { [K in keyof T]: T[K] };

type Person = { name: string; age: number };
type CopiedPerson = MyCopy<Person>;
// { name: string; age: number }
```

### 6.1.2 映射修饰符

映射类型支持三个修饰符：`readonly`、`?`（可选）以及它们的前缀 `-`（移除修饰符）：

```typescript
// 添加 readonly
type MyReadonly<T> = { readonly [K in keyof T]: T[K] };

// 添加可选
type MyPartial<T> = { [K in keyof T]?: T[K] };

// 移除 readonly
type MyMutable<T> = { -readonly [K in keyof T]: T[K] };

// 移除可选
type MyRequired<T> = { [K in keyof T]-?: T[K] };

// 使用示例
type Person = { name: string; age: number };
type PartialPerson = MyPartial<Person>;
// { name?: string; age?: number }

type ReadonlyPerson = MyReadonly<Person>;
// { readonly name: string; readonly age: number }
```

### 6.1.3 映射类型的组合

多个修饰符可以组合使用，实现复杂的类型变换：

```typescript
// 全部可选且只读
type PartialReadonly<T> = { readonly [K in keyof T]?: T[K] };

// 全部必需且可变（移除 readonly 和 ?）
type Concrete<T> = { -readonly [K in keyof T]-?: T[K] };

type Config = {
  readonly host?: string;
  readonly port?: number;
};

type ConcreteConfig = Concrete<Config>;
// { host: string; port: number }
```

---

## 6.2 内置映射类型实现原理

### 6.2.1 Partial 的实现

`Partial<T>` 将对象的所有属性变为可选。这是最基础的映射类型之一：

```typescript
// Partial 的完整实现
type Partial<T> = { [K in keyof T]?: T[K] };

// 使用场景：更新部分配置
interface AppConfig {
  apiUrl: string;
  timeout: number;
  retries: number;
}

function updateConfig(partial: Partial<AppConfig>): void {
  // 只更新提供的字段
}
```

### 6.2.2 Required 的实现

`Required<T>` 与 `Partial` 相反，移除所有属性的可选标记：

```typescript
// Required 的完整实现
type Required<T> = { [K in keyof T]-?: T[K] };

// 使用场景：确保所有字段都提供
interface UserProfile {
  name?: string;
  email?: string;
  age?: number;
}

function createUser(data: Required<UserProfile>): void {
  // data 的所有字段都是必需的
}
```

### 6.2.3 Readonly 的实现

```typescript
// Readonly 的完整实现
type Readonly<T> = { readonly [K in keyof T]: T[K] };

// 使用场景：不可变状态
type ImmutableState = Readonly<{
  count: number;
  items: string[];
}>;
```

### 6.2.4 Pick 的实现

`Pick<T, K>` 从对象类型中选取指定的属性。它结合了映射类型和 `extends keyof` 约束：

```typescript
// Pick 的完整实现
type Pick<T, K extends keyof T> = { [P in K]: T[P] };

// 使用场景：选择需要的字段
interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
}

type PublicUser = Pick<User, 'id' | 'name' | 'email'>;
// { id: number; name: string; email: string }
```

### 6.2.5 Omit 的实现

`Omit<T, K>` 从对象类型中排除指定的属性。它通过 `Exclude` 和 `Pick` 组合实现：

```typescript
// Omit 的完整实现
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

// 使用场景：排除敏感字段
type SafeUser = Omit<User, 'password'>;
// { id: number; name: string; email: string; createdAt: Date }
```

---

## 6.3 Key Remapping（as 子句）

### 6.3.1 基本语法

TypeScript 4.1 引入了 Key Remapping 功能，允许在映射类型中使用 `as` 子句重命名键：

```typescript
// 基本 Key Remapping
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type Person = { name: string; age: number };
type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number }
```

### 6.3.2 使用 as 子句过滤键

`as` 子句不仅可以重命名键，还可以通过将键映射为 `never` 来过滤掉不需要的属性：

```typescript
// 过滤掉函数类型的属性
type Methods<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K];
};

type Service = {
  data: string[];
  fetch(): Promise<string[]>;
  process(data: string[]): void;
  version: string;
};

type ServiceMethods = Methods<Service>;
// { fetch: () => Promise<string[]>; process: (data: string[]) => void }

// 过滤掉特定前缀的属性
type InternalKeys<T> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K];
};

type Config = {
  _secret: string;
  _token: string;
  apiUrl: string;
  timeout: number;
};

type PublicConfig = InternalKeys<Config>;
// { apiUrl: string; timeout: number }
```

### 6.3.3 复杂的键变换

Key Remapping 可以结合模板字面量类型实现复杂的键名变换：

```typescript
// 添加前缀
type AddPrefix<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

type Person = { name: string; age: number };
type PrefixedPerson = AddPrefix<Person, 'user'>;
// { userName: string; userAge: number }

// 双向映射
type BiDirectional<T extends string> = {
  [K in T as `from${Capitalize<K>}`]: `to${Capitalize<K>}`;
};

type Mapping = BiDirectional<'x' | 'y'>;
// { fromX: 'toX'; fromY: 'toY' }
```

---

## 6.4 模板字面量类型

### 6.4.1 基本语法

模板字面量类型在字符串字面量类型的基础上，通过 `${}` 插值语法组合其他类型：

```typescript
// 基本模板字面量
type Greeting = `Hello, ${string}!`;
// 匹配任何以 "Hello, " 开头、以 "!" 结尾的字符串

type EventName = `on${Capitalize<string>}`;
// 匹配 "onChange"、"onClick" 等

// 联合类型的展开
type Size = 'small' | 'medium' | 'large';
type Color = 'red' | 'green' | 'blue';

type ProductCode = `${Size}-${Color}`;
// 'small-red' | 'small-green' | 'small-blue' |
// 'medium-red' | 'medium-green' | 'medium-blue' |
// 'large-red' | 'large-green' | 'large-blue'
```

### 6.4.2 模板字面量的组合爆炸

当模板字面量中的插值类型是联合类型时，结果类型是所有可能组合的笛卡尔积。过多的组合会导致类型膨胀：

```typescript
// 组合爆炸示例
type A = 'a1' | 'a2' | 'a3' | 'a4' | 'a5';
type B = 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
type C = 'c1' | 'c2' | 'c3' | 'c4' | 'c5';

// 5 * 5 * 5 = 125 种组合
type Combined = `${A}-${B}-${C}`;

// 如果每个联合有 20 个成员，三个联合就是 8000 种组合
// 这会显著影响编译性能
```

### 6.4.3 内置字符串操作类型

TypeScript 提供了四个内置的字符串操作类型：

```typescript
type UppercaseResult = Uppercase<'hello'>;   // 'HELLO'
type LowercaseResult = Lowercase<'HELLO'>;   // 'hello'
type CapitalizeResult = Capitalize<'hello'>; // 'Hello'
type UncapitalizeResult = Uncapitalize<'Hello'>; // 'hello'

// 实际应用：事件名转换
type EventName = 'click' | 'focus' | 'hover';
type HandlerName = `on${Capitalize<EventName>}`;
// 'onClick' | 'onFocus' | 'onHover'
```

---

## 6.5 实战：CSS 属性转换

### 6.5.1 驼峰转短横线

这是模板字面量类型最经典的实战案例——将 CSS-in-JS 的驼峰属性名转换为 CSS 的短横线命名：

```typescript
// 驼峰转短横线
type KebabCase<S extends string> =
  S extends `${infer C}${infer Rest}`
    ? C extends Uppercase<C>
      ? `-${Lowercase<C>}${KebabCase<Rest>}`
      : `${C}${KebabCase<Rest>}`
    : S;

// 测试
type Test1 = KebabCase<'backgroundColor'>; // 'background-color'
type Test2 = KebabCase<'borderRadius'>;    // 'border-radius'
type Test3 = KebabCase<'fontSize'>;        // 'font-size'
type Test4 = KebabCase<'margin'>;          // 'margin'
type Test5 = KebabCase<'zIndex'>;          // 'z-index'
```

### 6.5.2 CSS 属性映射类型

结合映射类型和 KebabCase，可以构建完整的 CSS 属性转换系统：

```typescript
// CSS 属性映射
type CSSProperties = {
  backgroundColor: string;
  borderRadius: string;
  fontSize: string;
  marginTop: string;
  paddingLeft: string;
  zIndex: number;
};

// 转换为 CSS 声明
type CSSDeclarations<T> = {
  [K in keyof T as KebabCase<string & K>]: T[K];
};

type CSSOutput = CSSDeclarations<CSSProperties>;
// {
//   'background-color': string;
//   'border-radius': string;
//   'font-size': string;
//   'margin-top': string;
//   'padding-left': string;
//   'z-index': number;
// }

// 运行时转换函数
function toCSSString(props: CSSProperties): string {
  return (Object.entries(props) as [keyof CSSProperties, any][])
    .map(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${cssKey}: ${value}`;
    })
    .join('; ');
}
```

### 6.5.3 类型安全的 CSS 类名生成

```typescript
// CSS 模块的类名生成
type CSSModule<T extends string> = {
  [K in T as `${string & K}`]: string;
};

// BEM 命名规范
type BEM<
  B extends string,
  E extends string[] = [],
  M extends string[] = []
> = `${B}${E extends [] ? '' : `__${E[number]}`}${M extends [] ? '' : `--${M[number]}`}`;

type ButtonBlock = BEM<'button'>;                    // 'button'
type ButtonElement = BEM<'button', ['icon', 'text']>; // 'button__icon' | 'button__text'
type ButtonModifier = BEM<'button', [], ['large', 'small']>; // 'button--large' | 'button--small'
type ButtonFull = BEM<'button', ['icon'], ['active']>; // 'button__icon--active'
```

---

## 6.6 映射类型的深度控制

### 6.6.1 浅层映射 vs 深层映射

默认的映射类型只处理对象的第一层属性。要实现深层映射，需要递归调用：

```typescript
// 浅层 Readonly
type ShallowReadonly<T> = { readonly [K in keyof T]: T[K] };

// 深层 Readonly（递归）
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends Record<string, unknown>
    ? DeepReadonly<T[K]>
    : T[K];
};

// 使用示例
type Config = {
  server: { host: string; port: number };
  database: { url: string; pool: { min: number; max: number } };
};

type DeepConfig = DeepReadonly<Config>;
// {
//   readonly server: { readonly host: string; readonly port: number };
//   readonly database: { readonly url: string; readonly pool: { readonly min: number; readonly max: number } };
// }
```

### 6.6.2 控制递归深度

无限递归可能导致编译性能问题。通过深度计数器可以控制递归层级：

```typescript
// 限制深度的 DeepReadonly
type DeepReadonlyWithLimit<
  T,
  Depth extends number = 3,
  Acc extends any[] = []
> =
  Acc['length'] extends Depth
    ? T
    : {
        readonly [K in keyof T]: T[K] extends Record<string, unknown>
          ? DeepReadonlyWithLimit<T[K], Depth, [...Acc, any]>
          : T[K];
      };

// 深度为 1：只处理第一层
type Depth1 = DeepReadonlyWithLimit<Config, 1>;

// 深度为 2：处理到第二层
type Depth2 = DeepReadonlyWithLimit<Config, 2>;
```

### 6.6.3 条件性深层映射

有时需要根据属性值的类型决定是否继续递归：

```typescript
// 只对对象类型进行深层映射，跳过数组和基本类型
type DeepReadonlySkipArrays<T> = {
  readonly [K in keyof T]: T[K] extends Record<string, unknown>
    ? T[K] extends Array<infer E>
      ? ReadonlyArray<E>
      : DeepReadonlySkipArrays<T[K]>
    : T[K];
};

type Data = {
  name: string;
  tags: string[];
  metadata: { created: Date; updated: Date };
};

type ProcessedData = DeepReadonlySkipArrays<Data>;
// {
//   readonly name: string;
//   readonly tags: readonly string[];
//   readonly metadata: { readonly created: Date; readonly updated: Date };
// }
```

---

## 6.7 映射类型的性能优化

### 6.7.1 避免过度映射

映射类型会在编译时展开所有属性。对于大型类型，过度映射会导致编译性能下降：

```typescript
// ❌ 不必要的映射
type UnnecessaryMapping<T> = {
  [K in keyof T]: T[K] extends string
    ? T[K]
    : T[K] extends number
      ? T[K]
      : T[K];
};

// ✅ 直接使用原类型
type DirectUse<T> = T;
```

### 6.7.2 使用 as 子句减少输出类型大小

通过 `as` 子句过滤掉不需要的键，可以减少生成的类型大小：

```typescript
// ❌ 包含所有键
type AllKeys<T> = { [K in keyof T]: T[K] };

// ✅ 只保留需要的键
type FilteredKeys<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};
```

### 6.7.3 映射类型的缓存策略

对于重复使用的映射类型结果，使用类型别名缓存：

```typescript
// ❌ 重复计算
function processData<T>(data: DeepReadonly<T>): DeepReadonly<T> {
  return data;
}

// ✅ 缓存结果
type ReadonlyData<T> = DeepReadonly<T>;

function processDataOptimized<T>(data: ReadonlyData<T>): ReadonlyData<T> {
  return data;
}
```

---

## 6.8 综合实战：类型安全的 API 客户端

结合映射类型、模板字面量和条件类型，构建一个类型安全的 API 客户端：

```typescript
// API 端点定义
interface APIEndpoints {
  users: {
    list: { method: 'GET'; path: '/users'; response: User[] };
    get: { method: 'GET'; path: `/users/${string}`; response: User };
    create: { method: 'POST'; path: '/users'; response: User; body: CreateUserDTO };
    update: { method: 'PUT'; path: `/users/${string}`; response: User; body: UpdateUserDTO };
    delete: { method: 'DELETE'; path: `/users/${string}`; response: void };
  };
  posts: {
    list: { method: 'GET'; path: '/posts'; response: Post[] };
    get: { method: 'GET'; path: `/posts/${string}`; response: Post };
  };
}

// 提取所有路径
type ExtractPaths<T> = {
  [K in keyof T]: T[K] extends Record<string, { path: infer P }>
    ? P
    : never;
}[keyof T];

// 根据路径提取端点配置
type EndpointByPath<T, P> = {
  [K in keyof T]: T[K] extends Record<string, infer E>
    ? E extends { path: P } ? E : never
    : never;
}[keyof T];

// 生成 API 客户端类型
type APIClient<T> = {
  [Resource in keyof T]: {
    [Action in keyof T[Resource] as T[Resource][Action] extends { method: infer M }
      ? M extends 'GET' ? `fetch${Capitalize<string & Action>}`
      : M extends 'POST' ? `create${Capitalize<string & Action>}`
      : M extends 'PUT' ? `update${Capitalize<string & Action>}`
      : M extends 'DELETE' ? `delete${Capitalize<string & Action>}`
      : never
      : never
    ]: T[Resource][Action] extends { response: infer R; body?: infer B }
      ? B extends undefined
        ? () => Promise<R>
        : (body: B) => Promise<R>
      : never;
  };
};

// 使用示例
type Client = APIClient<APIEndpoints>;
// {
//   users: {
//     fetchList: () => Promise<User[]>;
//     fetchGet: (id: string) => Promise<User>;
//     createCreate: (body: CreateUserDTO) => Promise<User>;
//     updateUpdate: (body: UpdateUserDTO) => Promise<User>;
//     deleteDelete: () => Promise<void>;
//   };
//   posts: {
//     fetchList: () => Promise<Post[]>;
//     fetchGet: (id: string) => Promise<Post>;
//   };
// }
```

这个综合案例展示了映射类型、Key Remapping、模板字面量和条件类型的协同工作方式。通过类型层面的 API 定义，我们可以在编译期就确保 API 调用的路径、方法和参数类型完全正确。

---

## 本章小结

映射类型和模板字面量类型是 TypeScript 类型系统中处理对象类型和字符串类型的强大工具。关键要点包括：

1. **映射类型**：通过 `[K in keyof T]` 遍历对象键，配合 `readonly`、`?` 修饰符实现批量类型变换
2. **Key Remapping**：`as` 子句允许重命名和过滤键，极大扩展了映射类型的能力
3. **模板字面量**：在字符串层面进行类型运算，支持联合类型展开和递归模式匹配
4. **内置映射类型**：理解 `Partial`、`Required`、`Readonly`、`Pick`、`Omit` 的实现原理
5. **性能意识**：控制映射深度、避免组合爆炸、合理使用缓存

至此，TypeScript 类型系统的三大高级特性——泛型、条件类型、映射类型——已全部介绍完毕。它们相互配合，构成了 TypeScript 类型体操的完整工具箱。
