# 第11章 模板字面量类型

---

## 1. 核心概念

### 字符串类型的拼接与转换

模板字面量类型让你在类型层面做"字符串拼接"——就像 JS 的模板字符串，但发生在编译时：

```typescript
// 基础语法：和 JS 模板字符串一样，但值类型是字面量类型
type Greeting = `Hello, ${string}!`;
// Greeting 类型：所有以 "Hello, " 开头、以 "!" 结尾的字符串

type Endpoint = `https://api.example.com/${string}`;
// Endpoint 类型：所有匹配该 URL 模式的字符串
```

把模板字面量类型想象成一个"类型层面的字符串模板引擎"——`${string}` 是占位符，表示"这里可以是任何字符串"。但模板字面量类型的真正威力在于，占位符可以是**具体的字面量联合类型**：

```typescript
type EventName = "click" | "focus" | "blur";
type HandlerName = `on${Capitalize<EventName>}`;
// "onClick" | "onFocus" | "onBlur"
// 每个联合成员分别展开，生成所有组合
```

这就是模板字面量类型的核心机制：**联合类型在占位符中会自动展开**，每个组合生成一个独立类型。

### 内置字符串操作类型

TS 提供了四个内置的字符串操作类型，用来在类型层面转换字符串：

| 类型 | 作用 | 示例 |
|------|------|------|
| `Uppercase<S>` | 全部转大写 | `Uppercase<"hello">` → `"HELLO"` |
| `Lowercase<S>` | 全部转小写 | `Lowercase<"HELLO">` → `"hello"` |
| `Capitalize<S>` | 首字母大写 | `Capitalize<"hello">` → `"Hello"` |
| `Uncapitalize<S>` | 首字母小写 | `Uncapitalize<"Hello">` → `"hello"` |

这些类型只处理 ASCII 字符，对 Unicode 的支持有限。它们是编译时操作，运行时没有开销。

### 结合映射类型：批量转换键名

模板字面量类型最大的应用场景是和映射类型结合，批量转换对象的键名：

```typescript
// 将所有键名转为大写
type KeysToUpper<T> = {
  [K in keyof T as Uppercase<string & K>]: T[K];
};

interface User {
  name: string;
  age: number;
}

type UserUpper = KeysToUpper<User>;
// { NAME: string; AGE: number; }
```

`string & K` 在这里的作用是将 `K`（类型为 `keyof T`，可能是 `string | number | symbol`）约束为 `string`，因为 `Uppercase` 只接受字符串类型。

---

## 2. 典型问题与处理

### 2.1 模板字面量类型中的联合类型爆炸

**问题场景**：当占位符中有多个联合类型时，模板字面量类型会生成所有可能的组合——组合数可能是笛卡尔积。

```typescript
// Bad — 联合类型爆炸导致类型变得巨大
type Color = "red" | "green" | "blue";
type Size = "sm" | "md" | "lg";
type Variant = "solid" | "outline";

// 下面的类型会生成 3 × 3 × 2 = 18 个成员
type ClassName = `${Color}-${Size}-${Variant}`;
// "red-sm-solid" | "red-sm-outline" | "red-md-solid" | ... 共 18 个
```

**为什么不好**：每增加一个选项，类型成员数就翻倍。如果 `Color` 有 10 个值、`Size` 有 5 个、`Variant` 有 4 个，结果就有 200 个成员——编译器需要逐一处理，会拖慢类型检查。更严重的是，生成的类型可能超出编译器内部限制。

```typescript
// Good — 控制联合类型的展开范围
// 方式 1：只在必要时展开，不需要时用更宽的类型
type LooseClassName = `${string}-${Size}-${Variant}`;
// 不再展开 Color，只约束为 "某个字符串-尺寸-风格"

// 方式 2：分层组合，减少不必要的组合
type ColorStyle = `${Color}-${Variant}`; // 6 个
type FullClassName = `${ColorStyle}-${Size}`; // 18 个（同上，但分两步）

// 方式 3：使用条件类型过滤不需要的组合
type AllowedCombinations = 
  | "red-solid" | "blue-solid" | "green-outline"
  | `${Exclude<Color, "green">}-${Exclude<Variant, "outline">}`;

// 方式 4：如果组合太多，用运行时校验代替类型级校验
const VALID_CLASSES = ["red-sm-solid", "blue-md-outline"] as const;
type ValidClass = (typeof VALID_CLASSES)[number]; // 只有实际使用的组合
```

**为什么好**：通过缩小联合类型的范围、分层组合、或者使用运行时枚举代替类型级全部组合，避免编译器处理不必要的类型成员。关键是意识到"模板字面量类型中的联合类型会做笛卡尔积展开"。

### 2.2 模板字面量类型在条件类型中匹配失败

**问题场景**：在条件类型中用模板字面量做模式匹配时，匹配规则不符合预期。

```typescript
// Bad — 错误的匹配模式
type ExtractId<Path extends string> =
  Path extends `/users/${infer Id}` ? Id : never;

type Test1 = ExtractId<"/users/123">;     // "123" ✅
type Test2 = ExtractId<"/users/123/posts">; // never ❌ — 只匹配 /users/{id} 不匹配 /users/{id}/posts
```

**为什么不好**：模板字面量模式匹配是**精确匹配**的——`/users/${infer Id}` 只匹配以 `/users/` 开头、后面紧跟 `Id`、然后立即结束的字符串。如果路径后面还有内容，就不匹配了。

```typescript
// Good — 使用 rest 模式处理复杂路由
// 方式 1：匹配 /users/{id} 后还可以有更多路径段
type ExtractIdFlexible<Path extends string> =
  Path extends `/users/${infer Rest}`
    ? Rest extends `${infer Id}/${string}`
      ? Id
      : Rest
    : never;

type Test1 = ExtractIdFlexible<"/users/123">;         // "123"
type Test2 = ExtractIdFlexible<"/users/123/posts">;   // "123"
type Test3 = ExtractIdFlexible<"/users/123/posts/1">; // "123"

// 方式 2：递归解析路径参数
type ParseRoute<Path extends string> =
  Path extends `${infer Segment}/${infer Rest}`
    ? Segment extends `:${infer Param}`
      ? { [K in Param]: string } & ParseRoute<Rest>
      : ParseRoute<Rest>
    : Path extends `:${infer Param}`
      ? { [K in Param]: string }
      : {};

type UserPostParams = ParseRoute<"/users/:userId/posts/:postId">;
// { userId: string; postId: string; }
```

**为什么好**：通过递归和嵌套的模板字面量模式匹配，可以处理任意复杂的路径结构。关键是理解模板字面量匹配是"前缀匹配 + 剩余部分"的模式——用 `${infer Rest}` 捕获剩余部分，再用递归处理。

### 2.3 模板字面量类型中的特殊字符转义

**问题场景**：模板字面量类型中的特殊字符（如 `.`、`-`、`$`）没有歧义，但新手常困惑如何匹配包含特殊字符的字符串。

```typescript
// Bad — 认为特殊字符需要转义
type MatchEmail = `${string}\.${string}`; // ❌ 在类型中不需要转义！

// 正确写法
type MatchEmail = `${string}.${string}`; // 匹配包含 "." 的字符串
```

**为什么不好**：模板字面量类型中的字符都是字面量——不需要像正则表达式那样转义。`${string}.${string}` 就是"任意字符串 + 点号 + 任意字符串"。

```typescript
// Good — 特殊字符直接使用，无需转义
// 匹配邮箱格式（简化的版本）
type SimpleEmail = `${string}@${string}.${string}`;

type Test1: SimpleEmail = "user@example.com";    // ✅
type Test2: SimpleEmail = "a@b.co";              // ✅

// 匹配带命名空间的组件名
type NamespacedComponent = `${string}/${string}`;
type Test3: NamespacedComponent = "ui/button";   // ✅
type Test4: NamespacedComponent = "form/input";  // ✅

// 匹配版本号
type SemVer = `${number}.${number}.${number}`;
type Test5: SemVer = "1.2.3";                    // ✅
```

**为什么好**：模板字面量类型不是正则表达式——它做的是精确的字面量匹配。所有字符（包括 `.`、`-`、`$`、`/`）都是字面量，直接写即可。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：camelCase ↔ kebab-case 自动转换
// ==========================================

// kebab-case → camelCase
type KebabToCamel<S extends string> =
  S extends `${infer First}-${infer Rest}`
    ? `${First}${Capitalize<KebabToCamel<Rest>>}`
    : S;

type Test1 = KebabToCamel<"background-color">;   // "backgroundColor"
type Test2 = KebabToCamel<"font-size">;           // "fontSize"
type Test3 = KebabToCamel<"border-radius">;       // "borderRadius"
type Test4 = KebabToCamel<"simple">;              // "simple"

// camelCase → kebab-case
type CamelToKebab<S extends string> =
  S extends `${infer First}${infer Rest}`
    ? Rest extends Uncapitalize<Rest>
      ? `${Lowercase<First>}${CamelToKebab<Rest>}`
      : `${Lowercase<First>}-${CamelToKebab<Rest>}`
    : S;

type Test5 = CamelToKebab<"backgroundColor">;     // "background-color"
type Test6 = CamelToKebab<"fontSize">;             // "font-size"
type Test7 = CamelToKebab<"borderRadius">;         // "border-radius"

// ==========================================
// 示例 2：类型安全的事件总线（EventBus）
// ==========================================

// 定义事件映射
interface EventMap {
  "user:login": { userId: string; timestamp: number };
  "user:logout": { userId: string };
  "data:update": { key: string; value: unknown };
  "app:error": { message: string; code: number };
}

// 类型安全的事件总线
type EventBus = {
  on<E extends keyof EventMap>(
    event: E,
    handler: (data: EventMap[E]) => void
  ): void;

  emit<E extends keyof EventMap>(
    event: E,
    data: EventMap[E]
  ): void;

  off<E extends keyof EventMap>(
    event: E,
    handler: (data: EventMap[E]) => void
  ): void;
};

// 使用模板字面量类型约束事件名格式
type ValidEventName = `${string}:${string}`;

function createEventBus(): EventBus {
  const listeners = new Map<string, Set<Function>>();

  return {
    on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
    },
    emit(event, data) {
      listeners.get(event)?.forEach(handler => handler(data));
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler);
    },
  };
}

// 使用示例
const bus = createEventBus();

bus.on("user:login", (data) => {
  console.log(`User ${data.userId} logged in at ${data.timestamp}`);
});

bus.emit("user:login", { userId: "123", timestamp: Date.now() });
// bus.emit("user:login", { userId: 123 }); // ❌ 类型错误：userId 应为 string

// ==========================================
// 示例 3：类型安全的路由参数解析
// ==========================================

// 递归提取路由参数
type RouteParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof RouteParams<Rest>]: string }
    : Path extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : {};

// 构建类型安全的路由
type Route = {
  path: string;
  params: Record<string, string>;
};

function createRoute<Path extends string>(
  path: Path
): { path: Path; params: RouteParams<Path> } {
  return { path, params: {} as RouteParams<Path> };
}

// 使用
const userRoute = createRoute("/users/:userId");
// userRoute.path: "/users/:userId"
// userRoute.params: { userId: string }

const postRoute = createRoute("/posts/:postId/comments/:commentId");
// postRoute.params: { postId: string; commentId: string }

// ==========================================
// 示例 4：CSS 属性类型安全访问
// ==========================================

// 定义 CSS 属性的 camelCase 版本
type CSSProperties = "backgroundColor" | "fontSize" | "marginTop" | "paddingLeft";

// 生成对应的 kebab-case 版本
type CSSKebab = {
  [K in CSSProperties as CamelToKebab<K>]: string;
};

// 类型安全的样式对象
const styles: CSSKebab = {
  "background-color": "#fff",
  "font-size": "16px",
  "margin-top": "10px",
  "padding-left": "20px",
};

// ==========================================
// 示例 5：编译时字符串校验
// ==========================================

// 校验 Hex 颜色值
type HexColor = `#${string}`;

function setColor(color: HexColor): void {
  console.log(`Setting color to ${color}`);
}

setColor("#ff0000"); // ✅
setColor("#abc");    // ✅
// setColor("red");  // ❌ 类型错误：不是以 # 开头

// 校验 API 版本号
type ApiVersion = `v${number}`;

function setApiVersion(version: ApiVersion): void {
  console.log(`API version: ${version}`);
}

setApiVersion("v1");   // ✅
setApiVersion("v2");   // ✅
// setApiVersion("1"); // ❌ 类型错误
```

---

## 4. 配置/环境示例

### 4.1 tsconfig.json 中与模板字面量类型相关的配置

```jsonc
{
  "compilerOptions": {
    // 模板字面量类型需要 ES2015+ 的模板字符串概念
    // 但模板字面量类型本身是编译时特性，不影响 target
    "target": "ES2022",

    // 严格模式确保模板字面量类型推断更精确
    "strict": true,

    // 启用模板字面量类型的字符串操作类型
    // TS 4.1+ 自动支持，无需额外配置

    // 如果模板字面量类型生成的类型过大，可以调整
    // 但通常不需要
  }
}
```

### 4.2 使用模板字面量类型做 API 路径常量

```typescript
// api/routes.ts
export const API_ROUTES = {
  users: {
    list: "/api/users",
    detail: "/api/users/:id",
    posts: "/api/users/:id/posts",
  },
  posts: {
    list: "/api/posts",
    detail: "/api/posts/:id",
    comments: "/api/posts/:id/comments",
  },
} as const;

// 提取所有路由路径的类型
type ApiPath = {
  [K in keyof typeof API_ROUTES]: {
    [P in keyof (typeof API_ROUTES)[K]]: (typeof API_ROUTES)[K][P];
  };
};

// 生成类型安全的 API 客户端
function apiGet<Path extends string>(
  path: Path,
  params: RouteParams<Path>
): void {
  // 实际实现...
}
```

### 4.3 模板字面量类型的调试技巧

```typescript
// 展开查看模板字面量类型的具体成员
type ExpandUnion<T> = T extends infer U ? U : never;

// 查看联合类型的成员数量
type UnionLength<T> = {
  [K in T as T extends K ? never : K]: true;
}[keyof T] extends never ? 1 : 2; // 简化版

// 调试：将类型转为字符串用于日志
type DebugType = `Type is: ${string & (keyof any)}`;
```

---

## 5. 必须掌握的技能

### 5.1 模板字面量类型的心智模型

| 概念 | 类比 |
|------|------|
| `${A}-${B}` | 字符串模板引擎，A 和 B 是联合类型时做笛卡尔积 |
| `${infer X}` | 字符串模式匹配——提取匹配的部分 |
| `Capitalize<S>` 等 | 编译时的字符串操作函数 |
| `KebabToCamel<S>` | 递归字符串转换——用 infer 逐字符/逐段解析 |

### 5.2 递归字符串转换的模式

```typescript
// 通用递归模式：分段处理 + 递归剩余
type Transform<S extends string> =
  S extends `${infer First}${infer Rest}`
    ? `${TransformChar<First>}${Transform<Rest>}`
    : S;
```

### 5.3 常见字符串转换模板

```typescript
// snake_case → camelCase
type SnakeToCamel<S extends string> =
  S extends `${infer First}_${infer Rest}`
    ? `${First}${Capitalize<SnakeToCamel<Rest>>}`
    : S;

// 移除前缀
type RemovePrefix<S extends string, P extends string> =
  S extends `${P}${infer Rest}` ? Rest : S;

// 移除后缀
type RemoveSuffix<S extends string, P extends string> =
  S extends `${infer Rest}${P}` ? Rest : S;

// 检查字符串开头
type StartsWith<S extends string, P extends string> =
  S extends `${P}${string}` ? true : false;
```

### 5.4 总结：你必须带走的知识点

1. **模板字面量类型 = 编译时的字符串模板**——用 `${}` 插值，占位符可以是联合类型。
2. **联合类型在模板中自动展开**——每个组合生成一个独立类型，注意控制展开规模。
3. **四个内置字符串操作类型**——`Uppercase`、`Lowercase`、`Capitalize`、`Uncapitalize`。
4. **模式匹配用 `${infer X}`**——从字符串中提取子串，类似正则的捕获组。
5. **结合映射类型批量转换键名**——用 `as` 子句配合模板字面量实现 camelCase/kebab-case 互转。
6. **递归处理复杂字符串**——用 `${infer First}${infer Rest}` 逐字符处理，或 `${infer Segment}/${infer Rest}` 分段处理。
7. **不要过度依赖模板字面量类型**——联合类型爆炸会拖慢编译器，有时运行时校验更合适。

---

> **上一章**：[第10章 条件类型与 infer](./ch10-conditional.md)
> **下一章**：[第12章 内置工具类型源码全解析](./ch12-utility.md)
