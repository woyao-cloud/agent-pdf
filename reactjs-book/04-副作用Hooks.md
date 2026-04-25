# 第四章：副作用 Hooks

React 组件的本质是纯函数——接收 props，返回 UI 描述。但真实的应用需要与外部世界交互：获取数据、监听事件、操作 DOM。副作用 Hooks 就是连接 React 纯函数世界与外部系统的桥梁。

React 提供了三个副作用 Hook，它们在执行时机上有着微妙而关键的差异。理解这些差异，是编写高性能、无 bug 的 React 应用的关键。

---

## 4.1 useEffect

`useEffect` 是 React 中最常用的副作用 Hook，它的核心目的是**与外部系统同步**。无论是数据获取、事件订阅还是定时器，只要组件需要与 React 渲染体系之外的世界打交道，就应该使用 `useEffect`。

### 4.1.1 基本语法与依赖数组

`useEffect` 接受两个参数：一个回调函数和一个可选的依赖数组。依赖数组的不同写法决定了 Effect 的执行时机：

```jsx
import { useEffect, useState } from 'react';

function Example({ userId }) {
  const [data, setData] = useState(null);

  // 1. 每次渲染后都执行
  useEffect(() => {
    console.log('每次渲染都执行');
  });

  // 2. 仅在挂载时执行一次
  useEffect(() => {
    console.log('仅挂载时执行一次');
  }, []);

  // 3. 仅当 userId 变化时执行
  useEffect(() => {
    console.log('userId 变化时执行', userId);
    fetchUserData(userId).then(setData);
  }, [userId]);

  return <div>{data ? data.name : '加载中...'}</div>;
}
```

三种依赖数组的执行行为如下：

| 依赖数组写法 | 执行时机 | 典型场景 |
|-------------|---------|---------|
| 省略（不传） | 每次渲染后都执行 | 极少使用，仅在调试时 |
| 空数组 `[]` | 仅在组件挂载时执行一次 | 初始化逻辑、一次性数据获取 |
| 指定依赖 `[a, b]` | 挂载时及依赖变化时执行 | 与特定 props/state 同步 |

### 4.1.2 清理函数

Effect 可以返回一个清理函数，它在组件卸载或 Effect 重新执行之前运行。这是防止内存泄漏的关键机制：

```jsx
function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();

    // 清理函数：断开旧连接
    return () => {
      connection.disconnect();
    };
  }, [roomId]);

  return <h1>欢迎来到 {roomId} 房间</h1>;
}
```

当 `roomId` 从 `'general'` 变为 `'music'` 时，React 的执行顺序是：

1. 用 `'general'` 的清理函数断开旧连接
2. 用 `'music'` 运行新的 Effect，建立新连接

清理函数的运行时机：

| 时机 | 说明 |
|------|------|
| 组件卸载时 | 清理所有资源 |
| 依赖变化、Effect 重新执行前 | 先清理上一次 Effect 的副作用 |
| 严格模式下额外挂载后 | 开发环境下会双重调用 |

### 4.1.3 生命周期映射

从 Class 组件迁移过来的开发者常常试图将 `useEffect` 映射到 Class 组件的生命周期方法。虽然概念上有对应关系，但思维方式需要转变：

```jsx
// Class 组件思维（不推荐）
class ProfilePage extends React.Component {
  componentDidMount() {
    // 初始化
  }
  componentDidUpdate() {
    // 更新
  }
  componentWillUnmount() {
    // 清理
  }
}

// Hooks 思维（推荐）
function ProfilePage({ userId }) {
  useEffect(() => {
    // 同步逻辑：不管挂载还是更新，都是"与 userId 同步"
    const controller = new AbortController();
    fetchProfile(userId, { signal: controller.signal });

    return () => controller.abort();
  }, [userId]); // 一个 Effect 替代三个生命周期方法
}
```

关键区别在于：Class 组件按"时间点"思考（挂载、更新、卸载），Hooks 按"同步关系"思考（"这个 Effect 与哪些值保持同步"）。

| Class 生命周期 | useEffect 对应 |
|---------------|---------------|
| `componentDidMount` | `useEffect(() => {...}, [])` |
| `componentDidUpdate` | `useEffect(() => {...}, [dep])` |
| `componentWillUnmount` | `useEffect` 的清理函数 |

### 4.1.4 Effect 执行时机：浏览器绘制之后

`useEffect` 的一个关键特性是它在**浏览器完成绘制之后**异步执行。这意味着：

- 用户先看到更新后的 UI
- 然后 Effect 才执行
- Effect 不会阻塞页面渲染

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // 这在浏览器绘制之后执行
    // 用户已经看到了新的 count 值
    document.title = `点击了 ${count} 次`;
  }, [count]);

  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

这种设计保证了 Effect 中的耗时操作（如数据获取）不会让页面"卡住"。

### 4.1.5 常见模式

#### 数据获取

```jsx
function UserList() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchUsers() {
      try {
        setLoading(true);
        const response = await fetch('/api/users', {
          signal: controller.signal
        });
        const data = await response.json();
        setUsers(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
    return () => controller.abort();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

#### 事件监听

```jsx
function WindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <p>窗口大小: {size.width} × {size.height}</p>
  );
}
```

#### 订阅

```jsx
function StockPrice({ symbol }) {
  const [price, setPrice] = useState(null);

  useEffect(() => {
    const subscription = subscribeToStock(symbol, (newPrice) => {
      setPrice(newPrice);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [symbol]);

  return <div>{symbol}: {price ?? '连接中...'}</div>;
}
```

#### 定时器

```jsx
function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      setElapsed(prev => prev + 10);
    }, 10);

    return () => clearInterval(interval);
  }, [running]);

  return (
    <div>
      <p>{(elapsed / 1000).toFixed(2)}s</p>
      <button onClick={() => setRunning(r => !r)}>
        {running ? '暂停' : '开始'}
      </button>
    </div>
  );
}
```

### 4.1.6 严格模式下的双重执行

在 React 18+ 的严格模式（`<React.StrictMode>`）下，开发环境中每个 Effect 都会执行两次——挂载、卸载、再挂载：

```jsx
<React.StrictMode>
  <App />
</React.StrictMode>
```

这**不是** bug，而是 React 帮助你发现问题的机制。双重执行可以暴露：

- 缺少清理函数导致的内存泄漏
- 副作用逻辑不具备幂等性（执行两次结果不同）

```jsx
// 有问题的写法：没有清理函数
useEffect(() => {
  window.addEventListener('resize', handler); // 严格模式下会添加两个监听器！
}, []);

// 正确的写法：包含清理函数
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

> **注意**：严格模式的双重执行只在开发环境发生，生产环境不会。

### 4.1.7 常见错误

#### 错误一：遗漏依赖

```jsx
// 错误：遗漏了 roomId 依赖
function ChatRoom({ roomId }) {
  useEffect(() => {
    const conn = createConnection(roomId);
    conn.connect();
    return () => conn.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // roomId 变化时不会重新连接！
}

// 正确：包含所有依赖
function ChatRoom({ roomId }) {
  useEffect(() => {
    const conn = createConnection(roomId);
    conn.connect();
    return () => conn.disconnect();
  }, [roomId]); // roomId 变化时正确地断开旧连接并建立新连接
}
```

React 的 `exhaustive-deps` ESLint 规则会自动检测这类问题。**永远不要随意抑制这个规则**。

#### 错误二：无限循环

```jsx
// 错误：setUsers 触发重渲染 → Effect 再次执行 → 又调用 setUsers → 无限循环
function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchUsers().then(data => setUsers(data));
  }); // 没有依赖数组，每次渲染都执行
}

// 正确：空依赖数组，仅在挂载时获取一次
function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchUsers().then(data => setUsers(data));
  }, []);
}
```

#### 错误三：对象依赖导致不必要的执行

```jsx
// 错误：每次渲染都创建新的 options 对象，导致 Effect 反复执行
function SearchResults({ query }) {
  const options = { method: 'GET', headers: { Authorization: 'Bearer xxx' } };

  useEffect(() => {
    fetchSearchResults(query, options);
  }, [query, options]); // options 每次都是新引用！
}

// 正确：将静态对象移到组件外部或使用 useMemo
const DEFAULT_OPTIONS = { method: 'GET', headers: { Authorization: 'Bearer xxx' } };

function SearchResults({ query }) {
  useEffect(() => {
    fetchSearchResults(query, DEFAULT_OPTIONS);
  }, [query]);
}
```

### 4.1.8 useEffectEvent 模式

在 React 19 中，`useEffectEvent`（实验性 API）提供了一种方式来读取最新的 props/state 而不触发 Effect 重新执行：

```jsx
import { useEffect, useEffectEvent } from 'react';

function ChatRoom({ roomId, theme }) {
  const onConnected = useEffectEvent(() => {
    // 始终使用最新的 theme，但不会因为 theme 变化而重新连接
    showNotification('已连接到 ' + roomId, theme);
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on('connected', () => {
      onConnected(); // 使用最新的 theme 值
    });
    return () => connection.disconnect();
  }, [roomId]); // 只依赖 roomId，不依赖 theme

  return <div>聊天室: {roomId}</div>;
}
```

`useEffectEvent` 的作用是创建一个"事件处理函数"，它总是能访问最新的 props 和 state，但不是 Effect 的依赖。这解决了"既需要最新值又不想因为值变化而重新执行 Effect"的两难问题。

> **注意**：`useEffectEvent` 目前仍为实验性 API，在 React 19 正式版中的可用性请参考最新文档。生产使用前请确认其稳定状态。

---

## 4.2 useLayoutEffect

`useLayoutEffect` 与 `useEffect` 的 API 签名完全相同，唯一的区别在于**执行时机**。它在 DOM 更新完成后、浏览器绘制之前**同步**执行。

### 4.2.1 与 useEffect 的核心区别

```
渲染流程：
  React 更新 DOM → useLayoutEffect 执行 → 浏览器绘制 → useEffect 执行
                    ↑ 同步阻塞              ↑ 异步不阻塞
```

| 特性 | useEffect | useLayoutEffect |
|------|-----------|-----------------|
| 执行时机 | 浏览器绘制之后 | 浏览器绘制之前 |
| 阻塞渲染 | 否 | 是 |
| 适用场景 | 数据获取、事件订阅 | DOM 测量、动画 |
| 视觉闪烁 | 可能出现 | 可以避免 |

### 4.2.2 何时使用

`useLayoutEffect` 适用于那些**必须在浏览器绘制前完成**的操作，主要是：

1. **DOM 测量**：读取元素尺寸、位置
2. **同步 DOM 修改**：避免视觉闪烁
3. **滚动位置恢复**：在绘制前设置滚动位置

### 4.2.3 代码示例

#### 工具提示定位

```jsx
import { useState, useLayoutEffect, useRef } from 'react';

function Tooltip({ children, content }) {
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!visible) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    // 在浏览器绘制前计算位置，避免闪烁
    setPosition({
      top: triggerRect.bottom + 8,
      left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
    });
  }, [visible]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      {visible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            background: '#333',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '4px'
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
```

如果用 `useEffect` 来计算位置，用户会先看到工具提示出现在错误位置（0, 0），然后跳到正确位置。`useLayoutEffect` 确保在绘制前就计算好位置，避免闪烁。

#### 滚动位置恢复

```jsx
function ScrollRestoration({ scrollKey }) {
  const scrollPositions = useRef(new Map());

  useLayoutEffect(() => {
    // 在绘制前恢复滚动位置，避免闪烁
    const savedPosition = scrollPositions.current.get(scrollKey);
    if (savedPosition !== undefined) {
      window.scrollTo(0, savedPosition);
    }

    return () => {
      // 离开时保存当前滚动位置
      scrollPositions.current.set(scrollKey, window.scrollY);
    };
  }, [scrollKey]);

  return null;
}
```

### 4.2.4 性能警告

`useLayoutEffect` 会阻塞浏览器绘制，因此必须注意：

- **只用于必须同步执行的 DOM 操作**，不要用于数据获取或事件订阅
- **保持回调函数简短**，耗时操作会导致页面卡顿
- **能用 `useEffect` 解决的就不要用 `useLayoutEffect`**

```jsx
// 错误：在 useLayoutEffect 中做数据获取
useLayoutEffect(() => {
  fetchData().then(data => setState(data)); // 阻塞绘制！
}, []);

// 正确：数据获取应该在 useEffect 中
useEffect(() => {
  fetchData().then(data => setState(data));
}, []);
```

---

## 4.3 useInsertionEffect

`useInsertionEffect` 是 React 18 引入、在 React 19 中继续完善的 Hook，专为 **CSS-in-JS 库作者**设计。它在 DOM 变更之前执行，用于注入样式规则。

### 4.3.1 设计目的

CSS-in-JS 库（如 styled-components、Emotion）需要在渲染时动态插入 `<style>` 标签。如果这个过程发生在浏览器绘制之后，用户会看到样式闪烁（FOUC，即无样式内容闪烁）。`useInsertionEffect` 确保样式在 DOM 变更之前就被注入，从而避免闪烁。

### 4.3.2 执行时机对比

```
渲染流程：
  useInsertionEffect 执行 → React 更新 DOM → useLayoutEffect 执行 → 浏览器绘制 → useEffect 执行
  ↑ 注入样式                 ↑ 测量 DOM        ↑ 同步 DOM 操作           ↑ 异步副作用
```

| Hook | 执行时机 | 主要用途 |
|------|---------|---------|
| `useInsertionEffect` | DOM 变更之前 | 注入 CSS 规则 |
| `useLayoutEffect` | DOM 变更之后、绘制之前 | 测量 DOM、同步修改 |
| `useEffect` | 浏览器绘制之后 | 数据获取、事件订阅 |

### 4.3.3 代码示例

#### 简易 CSS-in-JS 实现

```jsx
import { useInsertionEffect, useState } from 'react';

// 样式注册表
const styleRegistry = new Set();

function useCSS(rules) {
  useInsertionEffect(() => {
    // 在 DOM 更新之前注入样式，避免闪烁
    if (!styleRegistry.has(rules)) {
      styleRegistry.add(rules);
      const styleEl = document.createElement('style');
      styleEl.textContent = rules;
      document.head.appendChild(styleEl);
    }
  }, [rules]);
}

function Button({ variant = 'primary', children, onClick }) {
  const className = `btn-${variant}`;

  useCSS(`
    .btn-primary {
      background: #0066cc;
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-secondary {
      background: #6c757d;
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  `);

  return (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  );
}
```

#### 带哈希的样式注入

```jsx
import { useInsertionEffect } from 'react';

// 更完善的 CSS-in-JS 工具函数
let ruleIndex = 0;
const insertedRules = new Map();

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function useStyle(css) {
  const hash = hashCode(css);

  useInsertionEffect(() => {
    if (insertedRules.has(hash)) return;

    insertedRules.set(hash, ruleIndex++);
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }, [hash]);

  return `css-${hash}`;
}

// 使用示例
function StyledCard({ title }) {
  const className = useStyle(`
    .card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 16px;
    }
    .card-title {
      font-size: 18px;
      font-weight: 600;
    }
  `);

  return (
    <div className={className}>
      <div className="card">
        <h2 className="card-title">{title}</h2>
      </div>
    </div>
  );
}
```

### 4.3.4 限制与注意事项

`useInsertionEffect` 有以下重要限制：

1. **无法访问 DOM 引用**：此时 DOM 还未更新，`ref.current` 不可用
2. **不能触发状态更新**：不应该调用 `setState`
3. **不应调度更新**：保持纯粹的样式注入逻辑
4. **仅供库作者使用**：普通应用开发者通常不需要直接使用

```jsx
// 错误：在 useInsertionEffect 中访问 DOM 或更新状态
useInsertionEffect(() => {
  console.log(elementRef.current); // 不可靠！DOM 尚未更新
  setState(newValue); // 不要这样做！
}, []);

// 正确：仅用于样式注入
useInsertionEffect(() => {
  const style = document.createElement('style');
  style.textContent = cssRules;
  document.head.appendChild(style);
}, [cssRules]);
```

---

## 4.4 三个副作用 Hook 的对比

下表总结了三个副作用 Hook 的核心差异：

| 特性 | useEffect | useLayoutEffect | useInsertionEffect |
|------|-----------|-----------------|-------------------|
| **执行时机** | 浏览器绘制之后 | DOM 更新后、绘制之前 | DOM 变更之前 |
| **是否阻塞绘制** | 否 | 是 | 是 |
| **能否访问 DOM** | 是 | 是 | 否（DOM 尚未更新） |
| **能否读取布局** | 是（但可能闪烁） | 是（无闪烁） | 否 |
| **典型场景** | 数据获取、事件订阅 | DOM 测量、动画 | CSS-in-JS 样式注入 |
| **目标用户** | 所有开发者 | 需要 DOM 操作的开发者 | CSS-in-JS 库作者 |
| **服务端渲染** | 不执行 | 不执行 | 不执行 |

### 选择决策树

```
需要在渲染后执行副作用？
├── 需要 DOM 操作且要避免闪烁？
│   ├── 是 → useLayoutEffect
│   └── 否 → useEffect
└── 需要注入 CSS 规则？
    └── 是 → useInsertionEffect
```

**经验法则**：

- 99% 的情况使用 `useEffect`
- 需要在绘制前同步修改 DOM 时使用 `useLayoutEffect`
- 编写 CSS-in-JS 库时使用 `useInsertionEffect`

---

## 4.5 小结

副作用 Hooks 是 React 函数组件与外部世界的接口。理解它们的执行时机差异，是写出正确、高效代码的关键：

1. **`useEffect`** 是最常用的副作用 Hook，在浏览器绘制后异步执行，适合数据获取、事件订阅等绝大多数场景
2. **`useLayoutEffect`** 在绘制前同步执行，适合需要读取 DOM 布局信息或同步修改 DOM 的场景
3. **`useInsertionEffect`** 在 DOM 变更前执行，专为 CSS-in-JS 库设计，普通开发者很少直接使用

记住核心原则：**默认使用 `useEffect`，只有遇到视觉闪烁问题时才考虑 `useLayoutEffect`**。而 `useInsertionEffect` 留给 CSS-in-JS 库作者去使用。