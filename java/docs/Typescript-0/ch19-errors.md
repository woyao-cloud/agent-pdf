# 第19章 "天书"翻译指南：看懂 TS 报错信息

TypeScript 的报错信息是出了名的"天书"——一段简单的类型不匹配，能给你输出几十行嵌套信息。新手一看就懵，老手也得眯着眼从最里层往外读。

本章不教你背报错码，而是教你一套**阅读方法**：把"天书"变成你能看懂的结构化信息。

---

## 1. 核心概念

### 报错信息的"洋葱结构"

TS 的报错是层层嵌套的，就像剥洋葱：

```
最外层：最终判断结果（例如"类型不兼容"）
    ├─ 中间层：类型展开过程（泛型参数实例化、条件类型分支）
    ├─ 内层：直接冲突点（具体的两个类型）
    │   └─ 最内层：根因（某个属性的类型不一致）
```

**读报错的黄金法则：从最内层开始读。**

TS 报错的结尾（最后几行）通常写的是"这两个东西类型不匹配"，但这不是原因，是结果。真正的原因在报错的最开头几行——某个具体的属性、某个具体的泛型参数不匹配。

### 比喻：侦探破案

想象你在破案：

- 最外层 = 判决书："凶手是张三"（结论，但不是线索）
- 最内层 = 犯罪现场的一根头发（具体证据）

**不要从结论开始看，要从证据开始看。**

---

## 2. 典型问题与处理

### 问题 1：拆解超长泛型报错

```typescript
// === Bad: 一个简单的泛型操作产生天书报错 ===

type DeepRecord<T> = T extends object
  ? { [K in keyof T]: DeepRecord<T[K]> }
  : T;

type User = {
  name: string;
  settings: {
    theme: "light" | "dark";
    notifications: boolean;
  };
};

// 故意写错：期望 User，实际传了错误的形状
const processUser = <T>(data: DeepRecord<T>): T => {
  return data as unknown as T;
};

// 下面的调用会产生几十行报错信息
// 取消注释以下代码可以看到典型的超长泛型报错
// processUser<string>("hello"); // 正常
// processUser<User>({
  name: "Alice",
  settings: {
    theme: "light",
    // ❌ 缺少 notifications，多了 timezone
    timezone: "UTC",
  },
});
```

**读报错的方法：**

1. **先看报错的第一行**（不是最后一行）——那里写着具体冲突的属性：`timezone` 不在 `DeepRecord<User>['settings']` 中
2. **再看中间**——看 TS 是如何展开 `DeepRecord<User>` 的，确认递归展开正确
3. **最后看结论**——确认就是属性名写错了

```typescript
// === Good: 使用类型工具提前暴露错误 ===

// 先定义一个验证类型，在定义处就报错
type AssertUserShape<T extends DeepRecord<User>> = T;

// 定义时就验证
const badData = {
  name: "Alice",
  settings: {
    theme: "light" as const,
    timezone: "UTC", // ❌ 这里就会报错，比调用时更早发现
  },
};

// ✅ 或者使用 satisfies 关键字（TS 4.9+）
const safeData = {
  name: "Alice",
  settings: {
    theme: "light" as const,
    notifications: true,
  },
} satisfies DeepRecord<User>; // 验证类型但不改变推导结果
```

**为什么 Bad：** 报错发生在调用处，泛型递归展开后报错信息膨胀几十倍。
**为什么 Good：** 在定义数据时就检查，报错点离错误源头更近，且 `satisfies` 不会改变变量类型。

---

### 问题 2：@ts-expect-error vs @ts-ignore

```typescript
// === Bad: 滥用 @ts-ignore 掩盖所有错误 ===

// @ts-ignore
// @ts-ignore 会静默任何错误，包括你本意要修的 bug
const result: number = "hello";

// 当底层类型修正后，@ts-ignore 不会提醒你移除它
// @ts-ignore
const value: string = 42; // 这里其实已经可以修复了，但没人知道
```

```typescript
// === Good: 使用 @ts-expect-error 管理技术债 ===

// 场景：第三方库类型定义不完整，暂时跳过
import { someLib } from "some-lib";

// @ts-expect-error — 如果下一行没有报错，TS 会反过来提醒你"这一行不需要了"
const result = someLib.riskyMethod("data");

// ✅ 当第三方库更新类型定义后，你会收到一个"未使用的 @ts-expect-error"错误
// 这迫使你及时清理技术债

// 给 @ts-expect-error 加注释说明原因
// @ts-expect-error: someLib.riskyMethod 的类型定义缺少重载
// TODO: #1234 — 等 someLib v3 发布后移除
const data = someLib.riskyMethod("input");

// 只对确切的错误行使用，不要包裹多行
function workaround() {
  // @ts-expect-error: 已知的严格 null 检查问题
  return legacyApi.getData().name!.toUpperCase();
}
```

**为什么 Bad：** `@ts-ignore` 静默一切，包括你忘记修复的问题。当底层代码修复后，它不会主动提醒你。
**为什么 Good：** `@ts-expect-error` 会在不需要时主动报错，相当于一个"自动过期"的技术债标记。

---

### 问题 3：条件类型中的报错嵌套

```typescript
// === 条件类型报错的典型场景 ===

type IsString<T> = T extends string ? "yes" : "no";

// 简单的条件类型报错清晰
type Test1 = IsString<42>; // "no" — 正常

// 问题出在条件类型嵌套时
type ExtractKeys<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

type DeepPick<T, K extends string> = T extends Record<K, infer V>
  ? V
  : never;

// 多层泛型组合后，报错会展开所有中间类型
// 下面的错误会产生多层嵌套的报错信息
type UserWithMeta = {
  id: number;
  profile: {
    name: string;
    age: number;
  };
  metadata: Record<string, unknown>;
};

// ❌ 错误：DeepPick 接收 K extends string，但传入的是复杂联合类型
type Picked = DeepPick<
  UserWithMeta,
  ExtractKeys<UserWithMeta, string>
>;
```

**读嵌套报错的方法：**

1. **手动实例化**：在脑中（或纸上）把泛型参数替换成实际类型
2. **逐个替换**：先算 `ExtractKeys<UserWithMeta, string>` = `"id" | "name" | "age"`，再看 `DeepPick<UserWithMeta, "id" | "name" | "age">`
3. **定位根因**：`DeepPick` 的 `K` 约束是 `string`，没问题；但 `Record<K, infer V>` 要求 `K` 是单个 key，不能是联合类型

---

## 3. 示例代码

### 报错阅读练习

```typescript
// 练习文件：error-reading-practice.ts
// 目的：通过实例训练从最内层读报错的能力

// ============ 练习 1：简单的属性类型不匹配 ============

interface Person {
  name: string;
  age: number;
  address: {
    city: string;
    zipCode: string;
  };
}

// ❌ 这个对象会报错，试着从报错中找到具体哪个属性错了
const person1: Person = {
  name: "Alice",
  age: "thirty" as string, // 报错！age 应为 number
  address: {
    city: "Beijing",
    zipCode: "100000",
  },
};

// 报错阅读步骤：
// 1. 找到报错中的 "Type 'string' is not assignable to type 'number'"
// 2. 看前面标注的路径：path: "age"
// 3. 结论：age 字段类型不匹配

// ============ 练习 2：泛型函数报错 ============

function identity<T extends { id: number; name: string }>(
  item: T
): T {
  return item;
}

// ❌ 这个调用会报错，因为缺少 name 属性
identity({ id: 1, name: "" as string });

// 报错阅读步骤：
// 1. 最内层：Argument of type '{ id: number; }' is not assignable
// 2. 中间层：to parameter of type '{ id: number; name: string; }'
// 3. 根因：Property 'name' is missing

// ============ 练习 3：复杂泛型组合 ============

type Response<T> = {
  data: T;
  status: number;
  error?: string;
};

type AsyncResult<T> = T extends Promise<infer U>
  ? Response<U>
  : Response<T>;

// ❌ 这个类型使用会产生深层报错
type Test = AsyncResult<Promise<string>>;
// ✅ 结果是 Response<string>

// ❌ 报错示例（取消注释来测试）：
// type BadAsyncResult = AsyncResult<string[]>; // 类型错误
// 这里的错误信息会告诉你类型不满足约束

// 条件类型的"静默失败"：不满足条件就走 else，不报错

// ============ 练习 4：区分"真的报错"和"条件类型正常走 else" ============

type IsPromise<T> = T extends Promise<unknown> ? "yes" : "no";

type R1 = IsPromise<Promise<number>>; // "yes"
type R2 = IsPromise<number>; // "no" — 不是报错，是正常分支

// 危险场景：误以为条件类型会报错
type SafeExtract<T> = T extends Promise<infer U> ? U : never;
type R3 = SafeExtract<string>; // never — 不是报错！是 else 分支返回 never
```

### 报错信息翻译表

```typescript
// 1. "Type 'X' is not assignable to type 'Y'"
//    → "X 类型的值不能赋值给 Y 类型"
//    → 最常见，核心逻辑：检查 X 是否是 Y 的子类型
//    → 例如：number 不能赋值给 string

// 2. "Property 'X' is missing in type 'Y'"
//    → "Y 类型缺少属性 X"
//    → 对象字面量赋值时最常见

// 3. "Type 'X' does not satisfy the constraint 'Y'"
//    → "X 类型不满足约束 Y"
//    → 泛型参数传递时，实际类型不符合泛型约束

// 4. "Cannot find name 'X'"
//    → "找不到 X"
//    → 拼写错误、忘记导入、或者使用了全局类型但没有声明

// 5. "Object is possibly 'null' or 'undefined'"
//    → "这个值可能是 null 或 undefined"
//    → strictNullChecks 开启时的保护

// 6. "Type 'X' is not assignable to type 'Y' with 'exactOptionalPropertyTypes: true'"
//    → "在精确可选属性模式下，X 不能赋值给 Y"
//    → 可选属性 ?: 不能赋值为 undefined

// 7. "Expression produces a union type that is too complex to represent"
//    → "联合类型太复杂，无法表示"
//    → 联合类型成员过多（通常超过 100,000 个），考虑改用对象映射

// 8. "Type instantiation is excessively deep and possibly infinite"
//    → "类型实例化过深，可能是无限的"
//    → 递归类型没有正确的终止条件
```

---

## 4. 配置/环境示例

### tsconfig.json 中与报错相关的配置

```jsonc
{
  "compilerOptions": {
    // 严格模式：开启所有严格检查
    // 建议新手从 strict: false 开始，逐步开启
    "strict": true,

    // 以下配置在 strict: true 时会自动开启
    // "noImplicitAny": true,        // 禁止隐式 any
    // "strictNullChecks": true,     // 严格 null 检查
    // "strictFunctionTypes": true,  // 严格函数类型
    // "strictBindCallApply": true,  // 严格 bind/call/apply
    // "strictPropertyInitialization": true, // 严格属性初始化
    // "noImplicitThis": true,       // 禁止隐式 this
    // "alwaysStrict": true          // 始终启用严格模式

    // 额外推荐开启的检查
    "noUnusedLocals": true,           // 未使用的局部变量报错
    "noUnusedParameters": true,       // 未使用的参数报错
    "noImplicitReturns": true,        // 函数所有分支必须返回值
    "noFallthroughCasesInSwitch": true, // switch 语句禁止穿透
    "exactOptionalPropertyTypes": false, // 进阶选项，新手建议关闭
    "skipLibCheck": true              // 跳过 .d.ts 检查，加速编译
  }
}
```

### 报错信息格式配置

```bash
# 使用简洁格式（单行报错）
tsc --pretty false

# 使用美观格式（多行+语法高亮，默认开启）
tsc --pretty

# 只显示错误，不显示警告
tsc --noEmit --pretty

# 输出报错到 JSON 文件（方便 IDE 或 CI 解析）
tsc --noEmit --json > errors.json
```

### 在 VS Code 中优化报错阅读体验

```jsonc
// .vscode/settings.json
{
  // 鼠标悬停时显示类型
  "editor.hover.enabled": true,

  // 报错信息显示在光标处
  "typescript.validate.enable": true,

  // 启用建议诊断
  "typescript.suggest.includeAutomaticOptionalChainCompletions": true,

  // 显示报错的"问题"面板快捷键：Ctrl+Shift+M
  // 在"问题"面板中，报错按文件分组，可以逐个跳转

  // 自定义报错信息的语言
  // "typescript.locale": "zh-CN" // 如果 TS 支持中文报错（VS Code 内置 TS 不支持）
}
```

---

## 5. 必须掌握的技能

### 系统化解读 TS 报错的 5 步法

1. **定位最内层**：从报错信息的**开头**看，找到第一个 `Type '...' is not assignable to type '...'`，这是根因
2. **追踪路径**：看报错中标注的 `path` 或 `property`，找到具体哪个属性/参数出了问题
3. **理解方向**：确认赋值方向——是 `X` 赋值给 `Y`，还是 `Y` 赋值给 `X`？方向错了，理解全错
4. **展开泛型**：如果报错涉及泛型，手动替换泛型参数为实际类型，简化问题
5. **验证修复**：修复后，看报错是否消失。如果出现新报错，重复步骤 1-4

### 开发者的"报错工具箱"

| 工具 | 适用场景 | 备注 |
|------|---------|------|
| `@ts-expect-error` | 临时跳过已知问题 | 优先于 `@ts-ignore` |
| `@ts-ignore` | 无法用 `@ts-expect-error` 的极端场景 | 尽量不用 |
| `satisfies` | 验证类型但不改变推导结果 | TS 4.9+ |
| `as const` | 缩小字面量类型 | 避免类型拓宽 |
| `declare` | 声明外部类型 | 用于第三方库 |
| `// @ts-check` | 在 JS 文件中启用类型检查 | 渐进迁移 |

### 常见的报错阅读误区

- **只看最后一行**：最后一行是结论，不是原因。原因在前几行
- **被超长类型名吓到**：TS 会展开泛型，`DeepRecord<DeepRecord<...>>` 看起来很吓人，但核心冲突还是最内层的属性类型不匹配
- **忽略报错中的路径标注**：TS 会标注 `path: "settings.timezone"`，这就是 GPS 导航，直接告诉你哪里错了
- **混淆条件类型的 else 分支和报错**：条件类型不满足约束时会走 else 分支返回 `never`，这不是报错

### 5.2 记住一个核心原则

> **报错不可怕，可怕的是不看报错就瞎改。**

TS 的报错信息虽然长，但每一条都有价值。学会从最内层开始读，你就能把 50 行的"天书"压缩成 3 行的"问题描述"。
