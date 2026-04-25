# 第二章：Hooks 实现原理

理解 Hooks 的内部实现，是掌握 Hooks 高级用法和排查疑难问题的根基。本章将从 Fiber 架构讲起，逐步深入 Hook 链表、调度机制、批处理、闭包陷阱等核心概念。

## 2.1 Fiber 架构

### 2.1.1 为什么需要 Fiber

React 15 及之前的版本使用递归方式进行协调（Reconciliation），一旦开始就无法中断，当组件树庞大时，会导致主线程长时间被占用，用户交互卡顿。这就是所谓的"栈调和器"（Stack Reconciler）问题。

Fiber 架构（React 16+）的核心目标是实现**增量渲染**——将渲染工作拆分为多个小单元（Fiber 节点），可以暂停、恢复、丢弃，从而让主线程能够响应用户交互。

### 2.1.2 Fiber 节点

每个 React 元素对应一个 Fiber 节点，Fiber 节点是一个普通的 JavaScript 对象，包含以下关键字段：

```javascript
// Fiber 节点简化结构
const fiber = {
  // 静态结构信息
  tag: FunctionComponent,    // 组件类型
  type: MyComponent,          // 具体的组件函数/类
  key: null,

  // 树结构（链表）
  return: parentFiber,        // 父节点
  child: firstChildFiber,     // 第一个子节点
  sibling: nextSiblingFiber,  // 下一个兄弟节点

  // 状态与副作用
  memoizedState: null,        // 函数组件：Hook 链表头；类组件：state 对象
  memoizedProps: {},          // 上一次渲染的 props
  pendingProps: {},           // 本次待处理的 props
  updateQueue: null,          // 更新队列
  flags: 0,                   // 副作用标记（插入/更新/删除等）

  // 双缓冲
  alternate: currentFiber,    // 指向另一棵树的对应节点
};
```

Fiber 树的遍历采用深度优先的方式，但不是递归调用，而是通过 `child` → `sibling` → `return` 指针循环遍历，这使得遍历过程可以在任意节点暂停和恢复。

### 2.1.3 双缓冲与 Work-in-Progress 树

React 维护两棵 Fiber 树：

- **Current 树**：当前屏幕上显示的内容对应的 Fiber 树
- **Work-in-Progress (WIP) 树**：正在内存中构建的新 Fiber 树

```
                Current 树                         WIP 树
               ┌─────────┐                      ┌─────────┐
               │  App     │                      │  App     │
               └────┬─────┘                      └────┬─────┘
                    │                                  │
            ┌───────┴───────┐                  ┌───────┴───────┐
            │               │                  │               │
        ┌───┴───┐      ┌───┴───┐          ┌───┴───┐      ┌───┴───┐
        │ Header│      │ Main  │          │ Header│      │ Main  │
        └───────┘      └───┬───┘          └───────┘      └───┬───┘
                          │                                  │
                     ┌────┴────┐                       ┌────┴────┐
                     │Counter  │                       │Counter  │ ← 新状态
                     │count: 0 │                       │count: 1 │
                     └─────────┘                       └─────────┘

        alternate ←─────────────────────────────→ alternate
```

两个树通过 `alternate` 字段互相指向。渲染完成后，WIP 树变为 Current 树，角色互换。这就是**双缓冲**（Double Buffering）机制——类似显卡的帧缓冲，在后台绘制新画面，完成后一次性切换到前台。

```javascript
// 渲染完成后的切换（简化）
function commitRoot() {
  // 将 WIP 树的 DOM 变更应用到真实 DOM
  // ...

  // 切换 current 指针
  root.current = finishedWork; // WIP 变为 Current
}
```

### 2.1.4 协调（Reconciliation）

协调过程是 React 比较"旧树"与"新树"差异的过程。在 Fiber 架构中，协调是可中断的：

1. 从 Current 树的根节点开始
2. 对每个 Fiber 节点，比较 `memoizedProps`（旧 props）与 `pendingProps`（新 props）
3. 如果需要更新，创建或复用 WIP 树的 Fiber 节点
4. 如果当前时间片用完，暂停并交还主线程
5. 下次调度恢复时，从暂停的 Fiber 节点继续

## 2.2 Hook 链表

### 2.2.1 Hook 在 Fiber 上的存储

函数组件的所有 Hook 调用信息存储在 Fiber 节点的 `memoizedState` 字段上，以**单向链表**的形式组织：

```javascript
// 单个 Hook 节点的结构
const hook = {
  memoizedState: null,     // Hook 的记忆值（useState 的状态值、useEffect 的 effect 对象等）
  baseState: null,         // 基础状态（用于 useState/useReducer 计算）
  baseQueue: null,         // 基础更新队列
  queue: null,             // 更新队列（链表，存放待处理的 update）
  next: null,              // 指向下一个 Hook（链表指针）
};

// Fiber 节点上的 Hook 链表
fiber.memoizedState → hook1 → hook2 → hook3 → null
                       ↑
                    Hook 链表头
```

### 2.2.2 链表顺序决定一切

这就是"只在顶层调用 Hook"规则的根源。React 通过遍历链表来匹配 Hook 调用，而遍历的依据就是**调用顺序**：

```
组件代码：                    Hook 链表：
function App() {              fiber.memoizedState
  const [a, setA] = useState(1);    → hook1 (memoizedState: 1)
  const [b, setB] = useState(2);    → hook2 (memoizedState: 2)
  useEffect(() => { ... });         → hook3 (memoizedState: effect)
}
```

如果某次渲染中条件性地跳过了某个 Hook，链表就会错位：

```
首次渲染（条件为 true）：      第二次渲染（条件为 false）：
useState → hook1 (a=1)         useState → hook1 (a=1) ✓
useState → hook2 (b=2)         useEffect → hook2 (期望是 effect，实际是 b=2) ✗ 错位！
useEffect → hook3 (effect)
```

### 2.2.3 挂载 vs 更新

Hook 在挂载（Mount）和更新（Update）阶段的处理完全不同：

**挂载阶段**——`mountWorkInProgressHook`：

```javascript
// 简化的挂载逻辑
function mountWorkInProgressHook() {
  const hook = {
    memoizedState: null,
    baseState: null,
    queue: null,
    next: null,
  };

  if (workInProgressHook === null) {
    // 这是第一个 Hook，作为链表头
    currentlyRenderingFiber.memoizedState = hook;
  } else {
    // 追加到链表末尾
    workInProgressHook.next = hook;
  }
  workInProgressHook = hook;
  return hook;
}
```

**更新阶段**——`updateWorkInProgressHook`：

```javascript
// 简化的更新逻辑
function updateWorkInProgressHook() {
  // 从 Current 树的 Fiber 中取出对应的 Hook
  const currentHook = nextCurrentHook;
  // 在 WIP 树的 Fiber 中取出或创建对应的 Hook
  const hook = {
    memoizedState: currentHook.memoizedState,   // 继承旧状态
    baseState: currentHook.baseState,
    queue: currentHook.queue,
    next: null,
  };

  if (workInProgressHook === null) {
    currentlyRenderingFiber.memoizedState = hook;
  } else {
    workInProgressHook.next = hook;
  }
  workInProgressHook = hook;

  nextCurrentHook = currentHook.next; // 移动到下一个 Hook
  return hook;
}
```

关键点：更新阶段是从 Current Fiber 的 Hook 链表按顺序取出，然后在 WIP Fiber 上重建链表。顺序一旦打破，`next` 指针就会指向错误的 Hook。

## 2.3 渲染阶段与提交阶段

React 将一次渲染分为两个阶段：

### 2.3.1 渲染阶段（Render Phase）

- **可中断**：可以被调度器暂停、恢复或丢弃
- **纯计算**：不产生任何 DOM 副作用
- **调用组件函数**：执行函数组件的渲染逻辑，调用所有 Hooks

在此阶段中，Hooks 的工作是：
- `useState` / `useReducer`：根据更新队列计算新状态
- `useEffect`：收集 effect 描述，不执行 effect 函数
- `useMemo` / `useCallback`：根据依赖决定是否重新计算
- `useRef`：创建或复用 ref 对象

### 2.3.2 提交阶段（Commit Phase）

- **不可中断**：必须一次性完成
- **操作真实 DOM**：将变更应用到 DOM
- **执行副作用**：运行 `useLayoutEffect` 的 cleanup 和 effect，调度 `useEffect`

```
┌─────────────── 渲染阶段（可中断）───────────────┐
│                                                 │
│  调用函数组件 → 执行 Hooks → 生成新 Fiber 树     │
│                                                 │
│  useState: 计算新状态                            │
│  useEffect: 收集 effect 描述                     │
│  useMemo: 按需重新计算                           │
│                                                 │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────── 提交阶段（不可中断）──────────────┐
│                                                 │
│  遍历 effect 链表，执行 DOM 操作                  │
│                                                 │
│  useLayoutEffect: 同步执行 cleanup → effect      │
│  useEffect: 调度异步执行 cleanup → effect         │
│  useRef: 可安全修改 .current                     │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 2.4 调度与优先级

### 2.4.1 优先级模型

React 内部定义了多个优先级等级（以 React 18+ 的 Lane 模型为例）：

```javascript
// 优先级从高到低（简化）
const SyncLane         = 0b0000000000000000000000000000001; // 同步：同步更新、DOM 事件
const InputContinuousLane = 0b0000000000000000000000000000100; // 连续输入：拖拽
const DefaultLane      = 0b0000000000000000000000000010000; // 默认：一般更新
const TransitionLane   = 0b0000000000000000000001000000000; // 过渡：useTransition
const IdleLane         = 0b0100000000000000000000000000000; // 空闲：低优先级任务
```

不同优先级的更新会进入不同的 Lane，高优先级更新可以中断低优先级更新的渲染。

### 2.4.2 时间切片

React 通过 `MessageChannel`（宏任务）实现时间切片，而不是 `setTimeout` 或 `requestAnimationFrame`，因为 `MessageChannel` 的执行时机更早、更可控：

```javascript
// 简化的调度循环
const channel = new MessageChannel();
channel.port1.onmessage = performWork;

function scheduleWork() {
  channel.port2.postMessage(null);
}

function performWork() {
  const deadline = getCurrentTime() + 5; // 5ms 时间片
  while (nextUnitOfWork && getCurrentTime() < deadline) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork); // 处理一个 Fiber 节点
  }
  if (nextUnitOfWork) {
    scheduleWork(); // 时间片用完，调度下一次
  } else {
    commitRoot(); // 全部完成，进入提交阶段
  }
}
```

### 2.4.3 饥饿问题

低优先级更新可能被高优先级更新反复打断，永远无法执行。React 通过"饥饿提升"机制解决：当低优先级更新等待时间超过阈值（通常是 5 秒），自动提升为同步优先级执行。

## 2.5 批处理（Batching）

### 2.5.1 自动批处理

React 18+ 默认对所有更新进行自动批处理——无论更新发生在 React 事件处理程序、Promise、setTimeout 还是原生事件处理器中：

```javascript
function Component() {
  const [count, setCount] = useState(0);
  const [flag, setFlag] = useState(false);

  function handleClick() {
    // React 18+：只触发一次重新渲染
    setCount(c => c + 1);
    setFlag(f => !f);
  }

  async function fetchData() {
    const data = await fetch('/api');
    // React 18+：同样只触发一次重新渲染（自动批处理）
    setCount(data.count);
    setFlag(data.success);
  }

  return <button onClick={handleClick}>Click</button>;
}
```

### 2.5.2 批处理的内部机制

多次 `setState` 并不会立即更新状态，而是将更新对象加入当前 Hook 的更新队列，等渲染阶段统一处理：

```javascript
// setState 的简化实现
function dispatchSetState(fiber, queue, action) {
  // 创建更新对象
  const update = {
    action,         // 新值或更新函数
    next: null,     // 指向下一个更新（环形链表）
    lane: requestUpdateLane(), // 优先级
  };

  // 加入更新队列（环形链表）
  const pending = queue.pending;
  if (pending === null) {
    update.next = update; // 只有一个更新，指向自己
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  queue.pending = update;

  // 调度渲染（不会立即渲染）
  scheduleUpdateOnFiber(fiber, lane);
}
```

多个 `setState` 在同一个事件循环中触发时，都只是往队列中追加更新对象，只有最后一次 `scheduleUpdateOnFiber` 会真正触发调度，进入渲染阶段时统一处理所有更新。

### 2.5.3 刷新批处理

如果需要在某些场景下强制同步刷新，可以使用 `flushSync`：

```javascript
import { flushSync } from 'react-dom';

function handleClick() {
  flushSync(() => {
    setCount(c => c + 1); // 立即渲染
  });
  // 此时 DOM 已经更新完成
  console.log(document.getElementById('count').textContent);
}
```

注意：`flushSync` 会同步执行渲染并刷新所有待处理的更新，应谨慎使用。

## 2.6 闭包陷阱

### 2.6.1 闭包如何产生过期值

函数组件每次渲染都会创建新的闭包，Hooks 捕获的是**当次渲染**的值：

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  function handleAlert() {
    setTimeout(() => {
      // 这里的 count 是点击时的 count，而非当前的 count
      alert('当前 count: ' + count);
    }, 3000);
  }

  return (
    <div>
      <p>{count}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
      <button onClick={handleAlert}>3秒后弹窗</button>
    </div>
  );
}
```

操作序列：点击"+1"3次（count 变为 3），再点击"3秒后弹窗"，然后立即点击"+1"3次（count 变为 6）。3 秒后弹窗显示的是 `3` 而不是 `6`——因为 `handleAlert` 闭包中捕获的 `count` 是 `3`。

```
渲染1: count=0 → 创建闭包A(handleAlert 中 count=0)
渲染2: count=1 → 创建闭包B(handleAlert 中 count=1)
  ...
渲染4: count=3 → 创建闭包D(handleAlert 中 count=3) ← 点击时捕获的值
渲染7: count=6 → 创建闭包G

3秒后：执行闭包D → alert(3)  ← 显示的是点击时刻的值
```

### 2.6.2 解决方案

**方案一：函数式更新（避免读取过期状态）**

```javascript
// 不依赖外部 count，而是通过回调参数获取最新值
setCount(prevCount => prevCount + 1);
```

**方案二：useRef 持有可变引用**

```javascript
function Counter() {
  const [count, setCount] = useState(0);
  const countRef = useRef(count);
  countRef.current = count; // 每次渲染都更新 ref

  function handleAlert() {
    setTimeout(() => {
      alert('当前 count: ' + countRef.current); // 读取最新值
    }, 3000);
  }
  // ...
}
```

**方案三：useCallback + 正确的依赖数组**

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  const handleAlert = useCallback(() => {
    setTimeout(() => {
      alert('当前 count: ' + count);
    }, 3000);
  }, [count]); // count 变化时重新创建回调，闭包中的 count 是最新的

  // ...
}
```

### 2.6.3 useEffect 中的闭包陷阱

```javascript
function WebSocketComponent({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const ws = new WebSocket(`ws://example.com/${roomId}`);

    ws.onmessage = (event) => {
      // 错误：如果依赖数组没有包含 messages，这里可能读取到旧的 messages
      setMessages([...messages, event.data]);
    };

    return () => ws.close();
  }, [roomId]); // 缺少 messages 依赖

  // 正确写法1：函数式更新
  ws.onmessage = (event) => {
    setMessages(prev => [...prev, event.data]);
  };

  // 正确写法2：补全依赖
  useEffect(() => {
    // ...
  }, [roomId, messages]);
}
```

## 2.7 useState 与 useReducer 内部实现

### 2.7.1 更新队列

`useState` 和 `useReducer` 共享同一套更新机制。每个 Hook 维护一个环形链表作为更新队列：

```javascript
// Hook 的更新队列结构
hook = {
  memoizedState: 0,           // 当前状态值
  baseState: 0,               // 基础状态
  baseQueue: null,             // 基础更新队列
  queue: {
    pending: null,             // 环形链表，指向最后一个更新
    lastRenderedState: 0,     // 上次渲染的状态（用于优化）
    dispatch: dispatchSetState,
  },
};
```

### 2.7.2 更新处理流程

渲染阶段处理 `useState` 时，React 会遍历更新队列，从 `baseState` 开始依次应用所有更新：

```javascript
// 简化的更新处理逻辑
function processUpdateQueue(hook) {
  let newState = hook.baseState;
  let update = hook.baseQueue;

  while (update !== null) {
    if (typeof update.action === 'function') {
      // 函数式更新：setCount(prev => prev + 1)
      newState = update.action(newState);
    } else {
      // 值式更新：setCount(5)
      newState = update.action;
    }
    update = update.next;
  }

  hook.memoizedState = newState;
  hook.baseState = newState;
}
```

### 2.7.3 急切计算（Eager Computation）

如果当前没有其他更高优先级的更新正在处理，React 会尝试在 `dispatchSetState` 阶段就提前计算新状态（急切计算），跳过调度和渲染阶段，直接复用上一次的结果：

```javascript
// 简化的急切计算逻辑
function dispatchSetState(fiber, queue, action) {
  const lastRenderedState = queue.lastRenderedState;

  // 尝试急切计算
  if (typeof action === 'function') {
    const eagerState = action(lastRenderedState);
    if (Object.is(eagerState, lastRenderedState)) {
      // 新状态与旧状态相同，跳过调度
      return;
    }
  }

  // 无法急切计算或值确实变化了，正常调度
  // ...
}
```

这是 `useState` 的一个重要优化——如果新值与旧值相同（`Object.is` 比较），React 会跳过渲染。

## 2.8 useEffect 内部实现

### 2.8.1 Effect 链表

`useEffect` 不像 `useState` 那样在 `memoizedState` 中存储状态值，而是存储 effect 对象：

```javascript
// 单个 effect 对象
const effect = {
  tag: HookPassive,          // Passive 表示异步 effect（useEffect）
  create: () => { ... },     // effect 函数
  destroy: undefined,        // cleanup 函数（由 create 返回）
  deps: [roomId],            // 依赖数组
  next: null,                // 指向下一个 effect（环形链表）
};

// Hook 节点的 memoizedState 指向 effect 对象
hook.memoizedState = effect;
```

同一个 Fiber 上的所有 effect 通过环形链表连接，Fiber 节点上的 `updateQueue` 字段也维护了一份 effect 环形链表，供提交阶段快速遍历。

### 2.8.2 依赖比较

更新阶段的 `useEffect` 会比较新旧依赖数组：

```javascript
function areHookInputsEqual(nextDeps, prevDeps) {
  if (prevDeps === null) return false; // 首次挂载
  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (Object.is(prevDeps[i], nextDeps[i])) continue;
    return false; // 依赖变化
  }
  return true; // 依赖未变化，跳过 effect
}
```

### 2.8.3 Effect 执行时机

```
提交阶段
├── BeforeMutation（DOM 变更前）
│   └── 调度 useEffect（通过 MessageChannel 异步执行）
├── Mutation（DOM 变更）
│   └── 执行 DOM 插入/更新/删除操作
└── Layout（DOM 变更后）
    ├── 同步执行 useLayoutEffect 的 cleanup
    ├── 同步执行 useLayoutEffect 的 effect
    └── 浏览器已经绘制完 DOM 变更

异步（下一个微任务/宏任务）
├── 执行 useEffect 的 cleanup
└── 执行 useEffect 的 effect
```

`useEffect` 是**被动副作用**（Passive Effect），不在提交阶段同步执行，而是在浏览器绘制之后异步执行。这保证了 effect 不会阻塞视觉更新。`useLayoutEffect` 是**主动副作用**（Layout Effect），在 DOM 变更后同步执行，会阻塞浏览器绘制。

## 2.9 并发特性与 Hooks

### 2.9.1 useTransition

`useTransition` 允许将状态更新标记为"过渡"（低优先级），使高优先级更新（如用户输入）不会被阻塞：

```javascript
function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    // 高优先级：立即更新输入框
    setQuery(e.target.value);

    // 低优先级：过渡更新搜索结果
    startTransition(() => {
      const filtered = heavyFilter(items, e.target.value);
      setResults(filtered);
    });
  }

  return (
    <div>
      <input value={query} onChange={handleChange} />
      {isPending && <Spinner />}
      <ResultList results={results} />
    </div>
  );
}
```

### 2.9.2 Suspense 与 Hooks 的交互

当组件中使用了 `use` Hook 读取 Promise，或数据请求被 Suspense 拦截时，React 会将组件渲染挂起，显示最近的 Suspense fallback。当数据就绪后，React 从挂起点恢复渲染：

```javascript
function Profile({ userId }) {
  // use 可以在条件语句中调用（唯一的例外 Hook）
  const user = use(fetchUser(userId)); // 如果 Promise 未 resolved，抛出给 Suspense

  return <div>{user.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Profile userId={1} />
    </Suspense>
  );
}
```

### 2.9.3 Tearing 与 useSyncExternalStore

在并发模式下，一次渲染可能被中断和恢复，如果渲染过程中外部状态发生变化，可能导致"撕裂"（Tearing）——同一棵树的不同部分看到了不同时刻的状态。

`useSyncExternalStore` 专门为订阅外部状态设计，确保并发模式下不会出现撕裂：

```javascript
import { useSyncExternalStore } from 'react';

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,   // 订阅函数
    getSnapshot,  // 获取当前值的函数
    getServerSnapshot // SSR 时的值
  );
}
```

## 2.10 小结

本章深入解析了 Hooks 的内部实现机制：

1. **Fiber 架构**是 Hooks 运行的基石——双缓冲、可中断的协调过程
2. **Hook 链表**存储在 Fiber 的 `memoizedState` 上，顺序决定匹配——违反调用顺序规则会导致状态错位
3. **渲染阶段与提交阶段**的划分——Hooks 在渲染阶段计算状态，在提交阶段执行副作用
4. **调度与优先级**——Lane 模型、时间切片让渲染可以中断和恢复
5. **自动批处理**——React 18+ 在所有上下文中自动合并多次更新
6. **闭包陷阱**——Hooks 捕获渲染时刻的值，需要通过函数式更新或 useRef 避免过期值
7. **useState/useReducer 内部**——更新队列、急切计算
8. **useEffect 内部**——effect 链表、被动副作用的异步执行时机
9. **并发特性**——useTransition、Suspense、useSyncExternalStore

下一章将聚焦于状态管理 Hooks 的实践，系统讲解 `useState`、`useReducer` 和 `useSyncExternalStore` 的用法与最佳实践。