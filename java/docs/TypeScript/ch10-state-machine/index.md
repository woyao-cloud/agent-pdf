# 第10章 复杂状态机建模

## 模块1：状态机的基本概念

状态机（State Machine）是计算机科学中的一个经典模型，它描述了一个对象在其生命周期中可能处于的各种状态，以及状态之间的转移规则。在软件开发中，状态机被广泛应用于工作流管理、协议实现、游戏开发和业务逻辑建模等场景。

一个完整的状态机包含三个核心要素：

**状态（State）**：对象在某一时刻所处的具体情形。例如，一个订单可以是"待支付"、"已确认"、"已发货"、"已送达"或"已取消"。

**转移（Transition）**：对象从一个状态变化到另一个状态的过程。转移通常由某个事件触发，并且可能附带条件或动作。

**事件（Event）**：触发状态转移的外部或内部动作。例如，用户点击"确认支付"按钮就是一个事件。

在 TypeScript 中，我们可以利用类型系统来建模状态机，使得非法状态转移在编译时就能被捕获，而不是在运行时才发现。这是 TypeScript 相比纯 JavaScript 的一大优势。

### 为什么需要状态机

在复杂的业务系统中，状态管理往往是最容易出错的环节。没有状态机的情况下，开发者通常使用枚举或字符串字面量来表示状态，然后在各处编写条件判断逻辑。这种方式存在几个问题：

- 状态转移逻辑分散在代码各处，难以维护
- 非法状态转移只能在运行时被发现
- 不同状态下的数据模型混在一起，导致类型不精确

使用 TypeScript 的判别联合类型（Discriminated Union）来建模状态机，可以有效解决上述问题。

## 模块2：判别联合类型基础

判别联合类型是 TypeScript 中一种强大的类型构造，它允许我们定义一个由多个成员类型组成的联合类型，每个成员都有一个唯一的字面量类型字段（称为"判别式"），用于在运行时区分不同的成员。

### 基本语法

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rectangle'; width: number; height: number }
  | { kind: 'triangle'; base: number; height: number };
```

在这个例子中，`kind` 字段就是判别式。通过检查 `kind` 的值，TypeScript 能够自动收窄类型，提供精确的类型信息。

### 类型收窄

```typescript
function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;  // shape 被收窄为 { kind: 'circle'; radius: number }
    case 'rectangle':
      return shape.width * shape.height;    // shape 被收窄为 { kind: 'rectangle'; ... }
    case 'triangle':
      return (shape.base * shape.height) / 2;
  }
}
```

### 穷举性检查

TypeScript 的 `never` 类型配合 `switch` 语句，可以实现穷举性检查。当所有分支都被覆盖后，`default` 分支中的 `never` 赋值是合法的；如果新增了一个状态但没有添加对应的处理分支，编译器就会报错：

```typescript
function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.radius ** 2;
    case 'rectangle': return shape.width * shape.height;
    case 'triangle': return (shape.base * shape.height) / 2;
    default:
      const _exhaustive: never = shape;  // 如果所有分支都已覆盖，这里不会报错
      return _exhaustive;
  }
}
```

## 模块3：订单状态机设计

让我们通过一个电商订单系统来深入理解状态机的设计。订单是状态机建模的经典场景，因为订单在其生命周期中会经历多个明确的状态，每个状态都有不同的数据需求。

### 状态定义

订单系统包含以下状态：

- **pending（待处理）**：订单刚创建，等待确认
- **confirmed（已确认）**：订单已确认，记录了支付方式
- **shipped（已发货）**：商品已发出，包含物流单号
- **delivered（已送达）**：商品已送达，可选签收人签名
- **cancelled（已取消）**：订单已取消，包含取消原因

### 判别联合类型实现

```typescript
export type OrderStatus =
  | { status: 'pending'; createdAt: Date }
  | { status: 'confirmed'; confirmedAt: Date; paymentMethod: string }
  | { status: 'shipped'; shippedAt: Date; trackingNumber: string }
  | { status: 'delivered'; deliveredAt: Date; signature?: string }
  | { status: 'cancelled'; cancelledAt: Date; reason: string };
```

每个状态成员都包含一个 `status` 字段作为判别式，以及与该状态相关的数据。这种设计确保了：

1. 每个状态只能访问属于该状态的数据
2. 不可能出现某个状态缺少必要数据的情况
3. 新增状态时，编译器会强制我们更新所有相关的处理逻辑

### 订单实体

```typescript
export interface Order {
  id: string;
  current: OrderStatus;
  items: string[];
  total: number;
}
```

`Order` 接口将订单的元数据（ID、商品列表、总价）与当前状态分离，使得状态变化不会影响订单的基本信息。

## 模块4：状态转移函数

状态转移函数是状态机的核心逻辑。它接收当前订单和目标状态，返回一个新的订单实例。在 TypeScript 中，我们可以利用类型系统来确保转移的合法性。

### 基础转移函数

```typescript
export function transitionOrder(order: Order, newStatus: OrderStatus): Order {
  return { ...order, current: newStatus };
}
```

这个函数使用展开运算符创建了一个新的订单对象，保持了不可变性（immutability）。不可变数据是状态机的一个重要原则，它使得状态变化可追踪、可回溯。

### 状态消息处理

```typescript
export function getStatusMessage(status: OrderStatus): string {
  switch (status.status) {
    case 'pending': return 'Order pending';
    case 'confirmed': return `Confirmed via ${status.paymentMethod}`;
    case 'shipped': return `Shipped, tracking: ${status.trackingNumber}`;
    case 'delivered': return `Delivered at ${status.deliveredAt.toISOString()}`;
    case 'cancelled': return `Cancelled: ${status.reason}`;
    default:
      const _exhaustive: never = status;
      return _exhaustive;
  }
}
```

这个函数展示了判别联合类型的核心优势：在每个 `case` 分支中，TypeScript 自动收窄了 `status` 的类型，使得我们可以安全地访问该状态特有的属性（如 `paymentMethod`、`trackingNumber` 等），而无需额外的类型断言。

### 穷举性检查的威力

`default` 分支中的 `_exhaustive: never` 赋值是一个编译时安全检查。如果未来我们向 `OrderStatus` 添加了一个新的状态（例如 `refunded`），但没有在 `getStatusMessage` 中添加对应的处理分支，TypeScript 编译器会报错：

```
Type '{ status: "refunded"; refundedAt: Date; amount: number; }' is not assignable to type 'never'.
```

这确保了所有状态都被正确处理，从根本上消除了"遗漏某个状态"的 bug。

## 模块5：高级状态机模式

### 有限状态转移矩阵

在实际的业务系统中，并非所有状态转移都是合法的。例如，一个"已取消"的订单不应该变成"已发货"。我们可以通过类型系统来建模合法的转移矩阵：

```typescript
type AllowedTransitions = {
  pending: 'confirmed' | 'cancelled';
  confirmed: 'shipped' | 'cancelled';
  shipped: 'delivered';
  delivered: never;  // 终态，不可转移
  cancelled: never;  // 终态，不可转移
};

function canTransition(from: OrderStatus, to: OrderStatus['status']): boolean {
  const allowed = allowedTransitions[from.status as keyof AllowedTransitions];
  return allowed === to || (Array.isArray(allowed) && allowed.includes(to));
}
```

### 带守卫条件的状态转移

某些状态转移需要满足特定的条件。例如，只有总价超过一定金额的订单才能免运费：

```typescript
interface TransitionGuard<T> {
  condition: (order: Order) => boolean;
  onReject: string;
}

const guards: Record<string, TransitionGuard<any>> = {
  'pending->confirmed': {
    condition: (order) => order.items.length > 0,
    onReject: 'Cannot confirm an empty order',
  },
};

function safeTransition(order: Order, newStatus: OrderStatus): Order {
  const key = `${order.current.status}->${newStatus.status}`;
  const guard = guards[key];
  if (guard && !guard.condition(order)) {
    throw new Error(guard.onReject);
  }
  return transitionOrder(order, newStatus);
}
```

### 状态机上下文

对于更复杂的状态机，可以引入上下文对象来存储状态转移过程中的共享数据：

```typescript
interface StateMachineContext {
  order: Order;
  history: Array<{ from: OrderStatus; to: OrderStatus; at: Date }>;
  metadata: Record<string, unknown>;
}
```

## 模块6：类型测试与穷举性验证

类型测试是确保状态机类型安全的重要手段。通过专门的类型测试工具，我们可以在不运行代码的情况下验证类型定义的正确性。

### 使用 expect-type 进行类型测试

`expect-type` 是一个轻量级的类型测试库，它允许我们在测试中断言类型之间的关系：

```typescript
import { expectTypeOf } from 'expect-type';
import type { OrderStatus } from '../src/types';

it('should have exhaustive status handling', () => {
  type StatusTypes = OrderStatus['status'];
  expectTypeOf<StatusTypes>().toEqualTypeOf<
    'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  >();
});
```

这个测试验证了 `OrderStatus` 联合类型包含了所有预期的状态。如果未来有人删除了某个状态，或者添加了新的状态但忘记更新测试，这个测试就会失败。

### 运行时测试

除了类型测试，运行时测试同样重要。它们验证状态转移函数的实际行为：

```typescript
describe('Order State Machine', () => {
  const baseOrder: Order = {
    id: '1', items: ['item1'], total: 100,
    current: { status: 'pending', createdAt: new Date() },
  };

  it('should transition from pending to confirmed', () => {
    const confirmed: OrderStatus = {
      status: 'confirmed', confirmedAt: new Date(), paymentMethod: 'credit_card',
    };
    const updated = transitionOrder(baseOrder, confirmed);
    expect(updated.current.status).toBe('confirmed');
  });
});
```

### 测试策略

对于状态机，推荐的测试策略包括：

1. **类型测试**：验证联合类型的穷举性
2. **单元测试**：验证每个状态转移函数的正确性
3. **集成测试**：验证完整的状态流转路径
4. **边界测试**：验证非法状态转移被正确拒绝

## 模块7：实际项目中的应用

### 工作流引擎

状态机在工作流引擎中有着广泛的应用。例如，审批流程中的"待审批"、"已通过"、"已驳回"等状态，都可以用判别联合类型来建模：

```typescript
type ApprovalStatus =
  | { status: 'pending'; assignee: string; createdAt: Date }
  | { status: 'approved'; approvedBy: string; approvedAt: Date; comment?: string }
  | { status: 'rejected'; rejectedBy: string; rejectedAt: Date; reason: string }
  | { status: 'escalated'; escalatedTo: string; escalatedAt: Date; originalAssignee: string };
```

### WebSocket 连接状态

WebSocket 连接的生命周期也适合用状态机来建模：

```typescript
type ConnectionStatus =
  | { status: 'disconnected'; lastConnected?: Date }
  | { status: 'connecting'; attempt: number; startedAt: Date }
  | { status: 'connected'; sessionId: string; connectedAt: Date }
  | { status: 'reconnecting'; attempt: number; lastError: string }
  | { status: 'closed'; code: number; reason: string; closedAt: Date };
```

### UI 组件状态

复杂的 UI 组件（如数据表格、表单向导）也可以从状态机建模中受益：

```typescript
type TableState<T> =
  | { phase: 'loading'; progress?: number }
  | { phase: 'empty'; message: string }
  | { phase: 'data'; items: T[]; total: number; page: number }
  | { phase: 'error'; error: Error; retryCount: number }
  | { phase: 'filtering'; items: T[]; activeFilters: Record<string, string> };
```

## 模块8：状态机设计的最佳实践

### 原则一：不可变性

始终返回新的状态实例，而不是修改现有状态。不可变性使得状态变化可追踪，便于调试和测试。

```typescript
// 正确：返回新对象
function transitionOrder(order: Order, newStatus: OrderStatus): Order {
  return { ...order, current: newStatus };
}

// 错误：修改原对象
function transitionOrder(order: Order, newStatus: OrderStatus): void {
  order.current = newStatus;  // 副作用！
}
```

### 原则二：单一职责

每个状态应该只包含与该状态相关的数据。避免在状态中存储不相关的信息，这会导致类型定义臃肿且难以维护。

### 原则三：穷举性处理

始终使用 `switch` 语句配合 `never` 类型进行穷举性检查。这是 TypeScript 状态机建模中最强大的安全网。

### 原则四：类型优先

在设计状态机时，先从类型定义开始。类型定义是状态机的契约，清晰的类型定义能够指导实现，并在编译时捕获错误。

### 原则五：避免过度设计

不是所有的状态变化都需要完整的状态机。对于简单的二值状态（如 `true/false`），使用布尔值或枚举就足够了。状态机适用于状态数量较多、每个状态有不同数据需求、状态转移有复杂规则的场景。

### 常见陷阱

**忽略终态**：某些状态（如"已取消"、"已完成"）是终态，不应该再有转移出去的可能。在类型系统中明确标记终态可以防止非法操作。

**状态膨胀**：避免在一个状态机中塞入过多的状态。如果状态数量超过 10 个，考虑拆分为多个子状态机。

**类型断言滥用**：在使用判别联合类型时，避免使用 `as` 类型断言。如果发现需要类型断言，通常意味着类型定义不够精确。

**忽略异步操作**：在涉及异步操作的状态机中（如 API 调用），需要考虑中间状态（如"加载中"），以确保 UI 的正确渲染。

### 总结

状态机建模是 TypeScript 类型系统的高级应用，它充分利用了判别联合类型、类型收窄和穷举性检查等特性，在编译时就能捕获大量的状态管理错误。通过本章的学习，读者应该能够：

1. 理解状态机的基本概念和核心要素
2. 使用判别联合类型建模复杂状态
3. 实现类型安全的状态转移函数
4. 编写穷举性检查和类型测试
5. 在实际项目中应用状态机模式

状态机建模不仅提高了代码的类型安全性，还使得业务逻辑更加清晰、可维护。它是每个 TypeScript 开发者都应该掌握的重要技能。
