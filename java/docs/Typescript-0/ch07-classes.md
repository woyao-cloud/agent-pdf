# 第7章 类与面向对象

## 7.1 核心概念

### 访问修饰符——"门禁卡"系统

TypeScript 的访问修饰符就像公司的**门禁卡系统**：

- **`public`**（默认）：大门——谁都能进
- **`protected`**：本部门——只有内部员工（类本身）和实习生（子类）能进
- **`private`**：总经理办公室——只有本人能进
- **`#` 私有字段**（ES2020+）：保险柜——真正物理锁死的，JS 引擎层面保护

```typescript
class Office {
  public entrance = "大门";       // 谁都能进
  protected breakRoom = "休息室"; // 员工和实习生能进
  private bossRoom = "老板间";    // 只有老板能进
  #safe = "保险柜";               // JS 引擎锁死，真的进不去
}
```

### readonly——"只读标签"

`readonly` 就像**博物馆的展品**——你可以看（读取），但不能碰（修改）。它只在初始化阶段（声明时或构造函数中）允许赋值。

```typescript
class ArtPiece {
  readonly title: string;

  constructor(title: string) {
    this.title = title; // 初始化时可以赋值
  }

  rename(newTitle: string) {
    // this.title = newTitle; // 错误！readonly 属性不能修改
  }
}
```

### 参数属性（Parameter Properties）——"一站式注册"

参数属性是 TS 的语法糖，让你在构造函数参数中**同时声明和初始化属性**。这就像你去办身份证——填一张表就同时完成了登记和发证。

```typescript
// 传统写法
class OldWay {
  public name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// 参数属性写法
class NewWay {
  constructor(public name: string) {}
}

// 两者完全等价，但后者简洁得多
```

参数属性支持所有访问修饰符和 `readonly`：
```typescript
class Person {
  constructor(
    public name: string,           // 公开可读写
    private age: number,           // 私有
    protected email: string,       // 受保护
    public readonly id: string,    // 公开只读
  ) {}
}
```

### 抽象类——"设计蓝图"

抽象类就像**建筑设计蓝图**——它规定了建筑必须有地基和屋顶（抽象方法），但具体怎么建由施工队（子类）决定。蓝图本身不能直接住人（不能实例化）。

```typescript
abstract class Building {
  abstract foundation(): void;  // 必须实现
  abstract roof(): void;        // 必须实现

  // 但可以有默认实现的方法
  permit(): string {
    return "施工许可证 #12345";
  }
}

class House extends Building {
  foundation() { console.log("浇筑混凝土地基"); }
  roof() { console.log("铺设瓦片屋顶"); }
}
```

### 接口实现（implements）——"签订合同"

`implements` 就像一个**劳动合同**——你承诺提供某些能力（属性、方法），但具体怎么做你自己决定。接口是纯抽象的，不能有实现。

```typescript
interface Drivable {
  start(): void;
  stop(): void;
  speed: number;
}

class Car implements Drivable {
  speed = 0;

  start() { console.log("引擎启动"); }
  stop() { console.log("刹车"); }
}
```

### TS 类与 ES6 类的编译差异

TypeScript 的 `private` 关键字在编译后**不会产生任何运行时保护**——它只是编译时的类型检查。而 `#` 私有字段会编译为 ES2020 的 `#` 语法（或降级为 WeakMap），提供真正的运行时保护。

```typescript
// TS 源码
class Example {
  private tsPrivate = "只在编译时保护";
  #esPrivate = "运行时也保护";
}

// 编译后（target: ES2020+）
class Example {
  #esPrivate = "运行时也保护";
}
// tsPrivate 字段变成了普通的 public 属性！
// 任何 JS 代码都可以访问 example.tsPrivate
```

---

## 7.2 典型问题与处理

### 问题1：private 编译后不生效

```typescript
// Bad Code ❌
class BankAccount {
  private balance: number;

  constructor(initial: number) {
    this.balance = initial;
  }
}

const account = new BankAccount(1000);
(account as any).balance = 0; // 通过 as any 绕过了编译检查！
// 编译后 balance 就是普通属性，完全可访问
```

**为什么不好？** TypeScript 的 `private` 只是编译时的"君子协定"，编译后没有任何保护。依赖它做敏感数据保护是不安全的。

```typescript
// Good Code ✅
class BankAccount {
  #balance: number; // ES2020 真正私有字段

  constructor(initial: number) {
    this.#balance = initial;
  }

  getBalance(): number {
    return this.#balance;
  }

  withdraw(amount: number): boolean {
    if (amount <= this.#balance) {
      this.#balance -= amount;
      return true;
    }
    return false;
  }
}

const account = new BankAccount(1000);
// account.#balance // 语法错误！运行时也无法访问
```

**为什么好？** `#` 私有字段在 JS 引擎层面提供保护——任何代码都无法在类外部访问，包括 `(account as any).#balance`。

### 问题2：参数属性与装饰器冲突

```typescript
// Bad Code ❌
class Example {
  constructor(
    @Inject private service: Service  // 参数属性 + 装饰器
  ) {}
}
```

**为什么不好？** 在启用了 `experimentalDecorators` 的旧版 TS 中，参数属性和装饰器同时使用可能导致装饰器接收到的参数索引错误。因为参数属性会改变构造函数参数的编译输出。

```typescript
// Good Code ✅

// 方案1：分离声明和参数
class Example {
  @Inject private service: Service;

  constructor(service: Service) {
    this.service = service;
  }
}

// 方案2：使用 Reflect Metadata 手动处理
class Example {
  constructor(private service: Service) {
    // 在构造函数体中使用 Reflect.defineMetadata 等
  }
}
```

**为什么好？** 将参数属性与装饰器分开，避免编译时的参数索引混淆。在"参数属性 + 装饰器"场景下，传统写法虽然啰嗦但更可靠。

### 问题3：抽象类 vs 接口的选择困惑

```typescript
// Bad Code ❌——用抽象类当纯接口用
abstract class Shape {
  abstract area(): number;
  abstract perimeter(): number;
}
// 这里用 abstract class 但没有任何共享实现
```

**为什么不好？** 如果你只需要"合同"（方法签名），不需要任何共享逻辑，接口才是正确的选择。抽象类有运行时成本（prototype chain），接口只是编译时检查。

```typescript
// Good Code ✅

// 纯合同 → 用接口
interface Shape {
  area(): number;
  perimeter(): number;
}

// 有共享实现 → 用抽象类
abstract class Animal {
  abstract makeSound(): void;

  // 所有动物都需要呼吸——共享实现
  breathe(): void {
    console.log("吸氧...呼出二氧化碳...");
  }
}
```

**为什么好？** 接口是"可以做什么"，抽象类是"是什么 + 部分怎么做"。选择原则：**有共享实现用抽象类，只有合同用接口**。

### 问题4：this 类型的理解

```typescript
// Bad Code ❌
class Calculator {
  value = 0;

  add(n: number) {
    this.value += n;
    return this; // 返回 Calculator 类型
  }
}

class ScientificCalculator extends Calculator {
  sin() {
    this.value = Math.sin(this.value);
    return this;
  }
}

const calc = new ScientificCalculator();
const result = calc.add(10).sin(); // 错误！
// 因为 add 返回的是 Calculator，没有 sin 方法
```

**为什么不好？** `return this` 的类型被推断为 `Calculator`，丢失了子类的类型信息。

```typescript
// Good Code ✅
class Calculator {
  value = 0;

  add(this: this, n: number) {
    this.value += n;
    return this; // 现在返回的是 this 的实际类型
  }
}

class ScientificCalculator extends Calculator {
  sin(this: this) {
    this.value = Math.sin(this.value);
    return this;
  }
}

const calc = new ScientificCalculator();
const result = calc.add(10).sin(); // OK！
```

**为什么好？** 显式标注 `this: this` 告诉编译器返回的是调用者的实际类型，而不是基类类型。

---

## 7.3 示例代码

### 完整的类继承示例

```typescript
// src/ch07/inheritance.ts
abstract class Employee {
  constructor(
    public readonly id: string,
    public name: string,
    protected salary: number,
  ) {}

  abstract calculateBonus(): number;

  getAnnualSalary(): number {
    return this.salary * 12 + this.calculateBonus();
  }

  toString(): string {
    return `${this.name} (#${this.id})`;
  }
}

class Developer extends Employee {
  constructor(
    id: string,
    name: string,
    salary: number,
    private projectCount: number,
  ) {
    super(id, name, salary);
  }

  calculateBonus(): number {
    return this.projectCount * 5000;
  }
}

class Manager extends Employee {
  private subordinates: Employee[] = [];

  constructor(
    id: string,
    name: string,
    salary: number,
  ) {
    super(id, name, salary);
  }

  addSubordinate(emp: Employee): void {
    this.subordinates.push(emp);
  }

  calculateBonus(): number {
    return this.subordinates.length * 10000;
  }
}

// 使用
const dev = new Developer("D001", "Alice", 15000, 3);
const mgr = new Manager("M001", "Bob", 25000);
mgr.addSubordinate(dev);

console.log(dev.getAnnualSalary()); // 15000*12 + 3*5000 = 195000
console.log(mgr.getAnnualSalary()); // 25000*12 + 1*10000 = 310000
```

### implements 与多接口

```typescript
// src/ch07/implements.ts
interface Loggable {
  log(): void;
}

interface Serializable {
  toJSON(): string;
}

class Report implements Loggable, Serializable {
  constructor(private data: unknown) {}

  log(): void {
    console.log("Report:", this.data);
  }

  toJSON(): string {
    return JSON.stringify(this.data);
  }
}

// 使用
const report = new Report({ sales: 100, profit: 20 });
report.log();
console.log(report.toJSON());
```

### 静态成员与工厂方法

```typescript
// src/ch07/static.ts
class DatabaseConnection {
  private static instance: DatabaseConnection | null = null;
  private connected = false;

  private constructor(private url: string) {}

  static connect(url: string): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection(url);
      DatabaseConnection.instance.connected = true;
    }
    return DatabaseConnection.instance;
  }

  static getInstance(): DatabaseConnection | null {
    return DatabaseConnection.instance;
  }

  query(sql: string): void {
    if (!this.connected) {
      throw new Error("Not connected");
    }
    console.log(`Executing: ${sql}`);
  }
}

// 使用
const db1 = DatabaseConnection.connect("postgres://localhost:5432/db");
const db2 = DatabaseConnection.getInstance();
console.log(db1 === db2); // true——单例模式
```

---

## 7.4 配置/环境示例

### tsconfig.json 中与类相关的选项

```json
{
  "compilerOptions": {
    "target": "ES2022",
    // 影响类的编译输出：
    //   ES5:  private → 闭包/WeakMap 模拟
    //   ES2015: private → 编译时检查（无运行时保护）
    //   ES2020+: # 私有字段保留

    "useDefineForClassFields": true,
    // 启用 ES2022 标准的类字段语义
    // 影响类字段的初始化顺序和行为
    // 建议设为 true（TS 3.7+ 默认）

    "experimentalDecorators": true,
    // 启用实验性的装饰器支持
    // 注意：参数属性 + 装饰器可能有兼容性问题

    "emitDecoratorMetadata": true
    // 为装饰器生成类型元数据
    // 配合 reflect-metadata 库使用
  }
}
```

### 编译目标对比

| target | private 处理 | # 私有字段 | 类字段语法 |
|--------|-------------|-----------|-----------|
| ES5 | 不保留（无保护） | 降级为 WeakMap | 在 constructor 中初始化 |
| ES2015 | 不保留（无保护） | 降级为 WeakMap | 在 constructor 中初始化 |
| ES2020 | 不保留（无保护） | 保留 `#` 语法 | 保留类字段语法 |
| ES2022 | 不保留（无保护） | 保留 `#` 语法 | 保留标准语义 |

---

## 7.5 必须掌握的技能

1. **理解 TypeScript 类编译输出的本质**
   - TypeScript 的类最终编译为 JavaScript 的类/函数
   - `private` 是**编译时检查**，编译后不存在——不要依赖它做安全防护
   - `#` 私有字段是**运行时保护**——使用 `target: ES2020+` 或合适的降级配置
   - 知道你的 `target` 配置会如何影响类编译结果

2. **掌握参数属性的简洁写法**
   - `constructor(public name: string)` 等价于声明 + 初始化
   - 支持 `public`、`protected`、`private`、`readonly` 的组合
   - 注意：参数属性不能与装饰器同时使用（旧版 TS）

3. **区分抽象类和接口的使用场景**
   - **接口**：纯合同，无实现，可以被多个类实现
   - **抽象类**：部分实现 + 部分合同，只能被单继承
   - 选择标准：需要共享实现逻辑 → 抽象类；只需要合同 → 接口

4. **理解 `this` 类型的特殊地位**
   - `return this` 可以用于方法链（Fluent Interface）
   - 用 `this: this` 标注确保子类类型不被丢失
   - `this` 类型在方法链、Builder 模式中非常有用

5. **掌握类的类型兼容规则**
   - 类遵循结构类型系统（鸭子类型）
   - 类的**私有成员**会影响类型兼容性——两个类即使结构相同，如果私有成员不同则不兼容
   - `instanceof` 检查的是原型链，与类型兼容性无关
