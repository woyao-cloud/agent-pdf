# 第10章 React开发者必知必会

React 19 带来了许多令人兴奋的特性，但要成为一名真正高效的 React 开发者，你需要深入理解其核心概念、状态管理策略、路由方案、TypeScript 集成、构建工具和测试方法。本章将系统性地梳理这些必备知识和技能。

---

## 10.1 核心概念

### 10.1.1 JSX 编译原理

JSX 是 React 的语法糖，它最终会被编译为 `React.createElement` 调用（React 17 之前）或 `jsx()` / `jsxs()` 函数调用（React 17+ 的 JSX 转换）。

```jsx
// 你写的 JSX
function Greeting({ name }) {
  return <h1 className="title">你好，{name}！</h1>;
}

// React 17 之前编译为
function Greeting({ name }) {
  return React.createElement('h1', { className: 'title' }, '你好，', name, '！');
}

// React 17+ 编译为（自动导入 jsx 函数）
import { jsx } from 'react/jsx-runtime';
function Greeting({ name }) {
  return jsx('h1', { className: 'title', children: ['你好，', name, '！'] });
}
```

React 19 延续了 React 17+ 的 JSX 转换方式，不再需要在文件中显式 `import React from 'react'`（除非使用 Hooks 或其他 React 导出）。这一变化减少了样板代码，也略微减小了 bundle 体积。

**关键区别：** `createElement` 包含运行时类型检查，而 `jsx()` 是纯数据转换，性能更好。

### 10.1.2 Virtual DOM 与 Diffing 算法

Virtual DOM 是真实 DOM 的轻量级 JavaScript 对象表示。每次状态更新时，React 会：

1. 创建新的 Virtual DOM 树
2. 通过 Diffing 算法比较新旧树的差异
3. 计算出最小化的 DOM 操作集合
4. 批量应用这些操作到真实 DOM

**Diffing 算法的核心假设（O(n) 复杂度）：**

- **不同类型的元素产生不同的树**：当根节点类型从 `<div>` 变为 `<span>` 时，React 会销毁旧树并重建新树。
- **同类型元素通过 key 属性识别子节点**：列表中的每个子节点应该有一个稳定的 key。

```jsx
// 类型变化导致完全重建
// 第一次渲染
<div><Counter /></div>
// 第二次渲染
<span><Counter /></span>
// Counter 组件会被卸载并重新挂载，状态丢失
```

**实际 DOM 操作 vs Virtual DOM：**

| 操作 | 真实 DOM | Virtual DOM |
|------|---------|-------------|
| 创建元素 | `document.createElement` | 创建 JS 对象 |
| 更新属性 | 触发浏览器重排/重绘 | 内存中比较 |
| 批量更新 | 手动批量处理 | 自动批处理 |
| 跨平台 | 浏览器专用 | 可渲染到任何平台 |

### 10.1.3 Reconciliation 与 Key Prop

key 属性是 React 识别列表中元素身份的唯一方式。正确的 key 选择对性能至关重要。

```jsx
// 错误：使用索引作为 key
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo, index) => (
        <TodoItem key={index} todo={todo} />
      ))}
    </ul>
  );
}

// 正确：使用稳定且唯一的 id
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
```

**何时可以使用 index 作为 key？**

- 列表是静态的（不会增删改）
- 列表顺序永远不会变化
- 列表项没有内部状态（如 input 值）

**但即使满足以上条件，也不推荐养成使用 index 的习惯。** 当列表变化时，使用 index 会导致：
- 不必要的重新渲染
- 状态错乱（如输入框内容与列表项不匹配）

### 10.1.4 Portals

Portal 允许将子节点渲染到父组件 DOM 层次结构之外的元素中。

```jsx
import { createPortal } from 'react-dom';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.getElementById('modal-root')
  );
}
```

**常见使用场景：**

- 模态框（Modal）
- 提示框（Tooltip）
- 下拉菜单（Dropdown）
- 全局通知（Toast）

**关键特性：** 尽管渲染位置不同，Portal 中的事件仍遵循 React 组件树，而非 DOM 树。这意味着在 Portal 中触发的事件会冒泡到 React 父组件。

### 10.1.5 Error Boundaries

Error Boundary 是捕获子组件树中 JavaScript 错误、记录错误并显示 fallback UI 的组件。**注意：Error Boundary 必须使用 class 组件实现**，因为 `componentDidCatch` 生命周期方法在函数组件中不可用。

```jsx
import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // 更新状态，下次渲染显示 fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 记录错误到监控服务
    console.error('捕获到错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <h2>出错了，请刷新页面重试</h2>;
    }
    return this.props.children;
  }
}

// 使用
<ErrorBoundary fallback={<ErrorPage />}>
  <Dashboard />
</ErrorBoundary>
```

**Error Boundary 不捕获的错误：**
- 事件处理器中的错误（需要使用 try-catch）
- 异步代码（setTimeout、Promise 等）中的错误
- 服务端渲染中的错误
- Error Boundary 自身抛出的错误

**React 19 的改进：** React 19 优化了错误处理流程，提供了更好的错误信息和堆栈跟踪。

### 10.1.6 Fragments

Fragment 允许返回多个元素而无需添加额外的 DOM 节点。

```jsx
// 错误：必须有单个根元素
function Table() {
  return (
    <td>列1</td>
    <td>列2</td>
  );
}

// 正确：使用 Fragment
function Table() {
  return (
    <>
      <td>列1</td>
      <td>列2</td>
    </>
  );
}
```

**为什么 `<>` 比 `div` 更好：**
- 不增加 DOM 层级，避免破坏 CSS 布局（如 Flexbox、Grid）
- 不增加额外的 DOM 节点，减小内存占用
- 避免不必要的样式继承问题

### 10.1.7 Suspense

Suspense 允许组件在渲染完成前"等待"某些操作。

```jsx
import { Suspense, lazy } from 'react';

// 代码分割
const HeavyComponent = lazy(() => import('./HeavyComponent'));
const DashboardData = lazy(() => import('./DashboardData'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HeavyComponent />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </Suspense>
  );
}
```

**React 19 中 Suspense 的新能力：**

- **React 19 的 `use()` 钩子**：允许在 render 中直接使用 Promise 或 Context，Suspense 会自动处理加载状态：

```jsx
import { use, Suspense } from 'react';

// use() 可以直接在组件中读取 Promise
function Comments({ commentsPromise }) {
  const comments = use(commentsPromise);
  return (
    <ul>
      {comments.map(comment => (
        <li key={comment.id}>{comment.text}</li>
      ))}
    </ul>
  );
}

function PostPage() {
  const commentsPromise = fetchComments(postId);

  return (
    <div>
      <PostContent post={post} />
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </div>
  );
}
```

- **Streaming SSR**：服务端可以逐步发送 HTML，Suspense 边界决定了哪些部分可以流式传输。

---

## 10.2 状态管理生态

选择正确的状态管理方案可以显著影响应用的可维护性和性能。

### 10.2.1 决策树

```
应用状态管理选择决策树：

1. 这个状态是服务器数据吗？
   ├── 是 → TanStack Query / SWR / RTK Query
   └── 否 → 2

2. 这个状态只在单个组件中使用吗？
   ├── 是 → useState / useReducer
   └── 否 → 3

3. 只需要在少数相关组件间共享吗？
   ├── 是 → 状态提升 + Props 透传
   └── 否 → 4

4. 状态树的复杂度如何？
   ├── 简单 → Context + useReducer
   └── 复杂 → 5

5. 应用规模多大？
   ├── 中小型 → Zustand / Jotai
   └── 大型 → Redux Toolkit
```

### 10.2.2 各方案详解

**useState / useReducer** —— 最简单的状态管理方式，适用于组件内部状态。

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**Context + useReducer** —— 适用于中等复杂度的共享状态。

```jsx
const AuthContext = createContext();

function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  return (
    <AuthContext.Provider value={{ state, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
}
```

**Zustand** —— 轻量级外部状态管理，API 简洁，性能优秀。

```jsx
import { create } from 'zustand';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
}));

function Counter() {
  const { count, increment } = useStore();
  return <button onClick={increment}>{count}</button>;
}
```

**Jotai** —— 原子状态管理，类似于 Recoil 但更轻量。

```jsx
import { atom, useAtom } from 'jotai';

const countAtom = atom(0);
const doubledAtom = atom((get) => get(countAtom) * 2);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const [doubled] = useAtom(doubledAtom);
  return <div>{count} x 2 = {doubled}</div>;
}
```

**TanStack Query** —— 服务器状态管理的最佳选择。

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function UserProfile({ userId }) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/users/${userId}`).then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: (newData) => fetch(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(newData),
    }),
    onSuccess: () => {
      // 使缓存失效，自动重新获取
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
    },
  });
}
```

**Redux Toolkit** —— 复杂全局状态管理的事实标准。

```typescript
import { createSlice, configureStore } from '@reduxjs/toolkit';
import { useSelector, useDispatch } from 'react-redux';

const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    incremented: (state) => { state.value += 1; },
    decremented: (state) => { state.value -= 1; },
  },
});

const store = configureStore({ reducer: { counter: counterSlice.reducer } });
```

---

## 10.3 路由

### 10.3.1 React Router v6/v7

```jsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'dashboard',
        loader: () => fetch('/api/dashboard'),
        action: async ({ request }) => {
          const form = await request.formData();
          return updateData(form);
        },
        element: <Dashboard />,
      },
    ],
  },
]);
```

### 10.3.2 TanStack Router

以类型安全著称的路由方案，在 TypeScript 项目中体验极佳。

### 10.3.3 Next.js App Router

基于文件系统的路由，支持 React Server Components 和 Server Actions。

---

## 10.4 TypeScript 与 React

### 10.4.1 Props 类型

```typescript
// 使用 interface 还是 type？
// 公共 API（组件 props）推荐使用 interface
// 联合类型、工具类型使用 type

interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  onClick: () => void;
  // React 19 中的 children
  children?: React.ReactNode;
}

// 泛型组件
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}

function List<T>({ items, renderItem }: ListProps<T>) {
  return <ul>{items.map(renderItem)}</ul>;
}
```

### 10.4.2 Hooks 类型

```typescript
// useState 泛型
const [user, setUser] = useState<User | null>(null);

// useRef
const inputRef = useRef<HTMLInputElement>(null);
const intervalRef = useRef<number | null>(null);

// 自定义 hooks
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : initialValue;
  });
  // ...
  return [storedValue, setValue];
}
```

---

## 10.5 构建工具

| 工具 | 适用场景 | 优势 |
|------|---------|------|
| Vite | 新项目首选 | 快速 HMR、原生 ESM、插件生态丰富 |
| Next.js | 全栈 React 应用 | SSR、SSG、RSC、API 路由 |
| Webpack | 维护遗留项目 | 插件生态最大、配置灵活 |
| SWC/esbuild | 构建加速 | Rust/Go 编写、比 Babel 快 10-100 倍 |

---

## 10.6 测试

### 10.6.1 测试工具链

```bash
# 安装
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

### 10.6.2 组件测试示例

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import Counter from './Counter';

describe('Counter', () => {
  it('点击按钮后计数增加', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const button = screen.getByRole('button', { name: /增加/i });
    await user.click(button);

    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
```

---

## 小结

React 19 的生态是一个丰富而复杂的系统。掌握核心概念（JSX、Virtual DOM、Reconciliation、Suspense）、选择合适的状态管理方案、配置正确的路由、合理使用 TypeScript、选择适合的构建工具和建立完善的测试体系，是成为高效 React 开发者的关键。在实际项目中，持续学习和实践比一次性掌握所有知识更为重要。