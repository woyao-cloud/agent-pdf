# 第一章：React 19 与 Hooks 诞生背景

## 1.1 React 的演进之路

React 自 2013 年开源以来，经历了数次重大的架构变革。从最早的 `React.createClass` 工厂函数，到 ES6 Class 组件的全面采用，再到 2018 年 React 16.8 引入 Hooks，每一次变革都深刻地改变了前端开发者的编程范式。

```
React.createClass (2013) → Class Components (2015) → Hooks (2018) → React 19 (2024)
```

### 1.1.1 从 createClass 到 Class 组件

早期的 React 使用 `React.createClass` 创建组件，这是 React 自己实现的一套混入（Mixin）系统：

```javascript
// 早期写法：React.createClass
const Counter = React.createClass({
  getInitialState() {
    return { count: 0 };
  },
  increment() {
    this.setState({ count: this.state.count + 1 });
  },
  render() {
    return <button onClick={this.increment}>{this.state.count}</button>;
  }
});
```

随着 ES6 的普及，React 社区全面转向 Class 组件写法。Class 组件看起来更接近标准 JavaScript，但它带来了新的复杂性——`this` 绑定问题。

### 1.1.2 从 Class 组件到 Hooks

Class 组件统治了 React 生态三年之久（2015-2018），但在这段时间里，社区不断暴露出 Class 组件的设计缺陷。React 团队在 2018 年的 React Conf 上正式发布 Hooks，Dan Abramov 的演讲《React Today and Tomorrow》清晰地阐述了 Hooks 的设计动机。

Hooks 不是一个渐进式的改进，而是一次范式级别的转变：

| 维度 | Class 组件 | Hooks |
|------|-----------|-------|
| 状态管理 | `this.state` + `this.setState` | `useState` / `useReducer` |
| 副作用 | 生命周期方法（`componentDidMount` 等） | `useEffect` |
| 逻辑复用 | HOC / Render Props | 自定义 Hook |
| 代码组织 | 按生命周期分块 | 按功能关注点分块 |
| `this` 问题 | 需手动绑定 | 无 `this` |
| 类型推导 | 较弱（TypeScript） | 天然友好 |
| 包体积 | 较大（minify 效果差） | 较小（函数更易压缩） |
| 学习曲线 | 面向对象思维 | 函数式思维 |

## 1.2 Class 组件的痛点

### 1.2.1 `this` 绑定地狱

Class 组件最臭名昭著的问题就是 `this` 绑定。在 JavaScript 中，Class 方法默认不会绑定 `this`，这意味着事件处理函数中的 `this` 可能是 `undefined`：

```jsx
class Profile extends React.Component {
  constructor(props) {
    super(props);
    this.state = { user: null };
    // 方式1：构造函数中手动绑定（繁琐但可靠）
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick() {
    // 如果不绑定 this，这里的 this 是 undefined
    console.log(this.state.user); // TypeError: Cannot read property 'user' of undefined
  }

  // 方式2：类字段箭头函数（简洁但有性能争议）
  handleChange = (e) => {
    this.setState({ name: e.target.value });
  };

  render() {
    return (
      <div>
        {/* 方式3：内联箭头函数（每次渲染创建新函数） */}
        <button onClick={() => this.handleClick()}>Click</button>
        <input onChange={this.handleChange} />
      </div>
    );
  }
}
```

三种绑定方式各有缺点：
- **构造函数绑定**：代码冗余，每个方法都要写 `this.xxx = this.xxx.bind(this)`
- **类字段箭头函数**：属于实验性语法，且在子组件作为 `prop` 传递时可能导致不必要的重渲染
- **内联箭头函数**：每次渲染创建新引用，破坏子组件的 `shouldComponentUpdate` 优化

Hooks 完全消除了 `this` 问题，因为函数组件根本没有 `this`：

```jsx
function Profile() {
  const [user, setUser] = useState(null);

  const handleClick = () => {
    console.log(user); // 直接访问闭包变量，无需 this
  };

  return <button onClick={handleClick}>Click</button>;
}
```

### 1.2.2 生命周期方法的逻辑割裂

Class 组件按生命周期方法组织代码，但一个功能关注点的逻辑往往散布在多个生命周期方法中：

```jsx
class FriendStatus extends React.Component {
  state = { isOnline: null };

  // 同一个"订阅"逻辑被拆到了3个生命周期方法中
  componentDidMount() {
    ChatAPI.subscribeToFriendStatus(
      this.props.friend.id,
      this.handleStatusChange
    );
  }

  componentDidUpdate(prevProps) {
    if (prevProps.friend.id !== this.props.friend.id) {
      ChatAPI.unsubscribeFromFriendStatus(
        prevProps.friend.id,
        this.handleStatusChange
      );
      ChatAPI.subscribeToFriendStatus(
        this.props.friend.id,
        this.handleStatusChange
      );
    }
  }

  componentWillUnmount() {
    ChatAPI.unsubscribeFromFriendStatus(
      this.props.friend.id,
      this.handleStatusChange
    );
  }

  handleStatusChange = (status) => {
    this.setState({ isOnline: status.isOnline });
  };

  render() {
    return <span>{this.state.isOnline ? '在线' : '离线'}</span>;
  }
}
```

同样一个"好友状态订阅"的功能，代码被拆散在三个生命周期方法中。当组件变得更复杂，加入定时器、数据请求等功能后，每个生命周期方法都会变成逻辑大杂烩。

Hooks 的 `useEffect` 让相关逻辑聚合在一起：

```jsx
function FriendStatus({ friend }) {
  const [isOnline, setIsOnline] = useState(null);

  // 订阅逻辑完整地写在一起
  useEffect(() => {
    const handleStatusChange = (status) => setIsOnline(status.isOnline);
    ChatAPI.subscribeToFriendStatus(friend.id, handleStatusChange);
    return () => ChatAPI.unsubscribeFromFriendStatus(friend.id, handleStatusChange);
  }, [friend.id]); // 只在 friend.id 变化时重新订阅

  return <span>{isOnline ? '在线' : '离线'}</span>;
}
```

### 1.2.3 逻辑复用的"包装地狱"

Class 组件时代，逻辑复用主要依赖两种模式：高阶组件（HOC）和 Render Props。两者都会导致严重的嵌套问题。

**高阶组件（HOC）的问题：**

```jsx
// HOC 嵌套地狱
const EnhancedComponent = withAuth(
  withTheme(
    withRouter(
      withIntl(
        withAnalytics(
          UserProfile
        )
      )
    )
  )
);

// 实际渲染时的嵌套层级
<AuthProvider>
  <ThemeProvider>
    <RouterProvider>
      <IntlProvider>
        <AnalyticsProvider>
          <UserProfile />
        </AnalyticsProvider>
      </IntlProvider>
    </RouterProvider>
  </ThemeProvider>
</AuthProvider>
```

**Render Props 的问题：**

```jsx
function App() {
  return (
    <Mouse render={({ x, y }) => (
      <Scroll render={({ scrollY }) => (
        <Resize render={({ width, height }) => (
          <Theme render={({ theme }) => (
            <Dashboard
              mouse={{ x, y }}
              scroll={{ scrollY }}
              resize={{ width, height }}
              theme={theme}
            />
          )} />
        )} />
      )} />
    )} />
  );
}
```

HOC 还会带来隐式的问题：
- **Props 透传**：HOC 会注入额外的 props，可能与原始组件的 props 命名冲突
- **调试困难**：React DevTools 中会出现 `<Anonymous>` `<WithAuth>` 等中间组件
- **命名冲突**：多个 HOC 可能注入相同名称的 props
- **Ref 转发**：HOC 包裹的组件需要额外的 `forwardRef` 处理

**自定义 Hook 的解决方案：**

```jsx
function useUserProfile() {
  const auth = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const intl = useIntl();

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (auth.user) {
      fetchProfile(auth.user.id).then(setProfile);
    }
  }, [auth.user]);

  return { profile, theme, locale: intl.locale, navigate: router.push };
}

// 使用时：简洁、直观
function UserProfile() {
  const { profile, theme, locale, navigate } = useUserProfile();
  return <div style={theme}>{profile?.name}</div>;
}
```

自定义 Hook 不会引入额外的组件嵌套层级，不会产生 props 冲突，在 DevTools 中也完全透明。

## 1.3 Hooks 的设计目标

React 团队为 Hooks 设定了三个核心设计目标：

### 1.3.1 简化状态管理

Hooks 让函数组件具备了完整的状态管理能力，同时保持了函数的简洁性。`useState` 比 `this.state` + `this.setState` 更直观：

```jsx
// Class: 需要理解 this、setState 的合并行为
this.setState({ count: this.state.count + 1 }); // 对象式更新，浅合并
this.setState((prev) => ({ count: prev.count + 1 })); // 函数式更新

// Hooks: 更直观的 API
const [count, setCount] = useState(0);
setCount(count + 1); // 直接替换（非合并）
setCount(prev => prev + 1); // 函数式更新
```

### 1.3.2 无需 HOC 的逻辑复用

自定义 Hook 是普通的 JavaScript 函数，可以在任何组件中自由调用，组合使用：

```jsx
// 自定义 Hook：窗口尺寸
function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

// 自定义 Hook：在线状态
function useOnlineStatus() {
  const [isOnline, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return isOnline;
}

// 自由组合，无需嵌套
function StatusBar() {
  const { width } = useWindowSize();
  const isOnline = useOnlineStatus();
  return (
    <div>
      <span>{isOnline ? '在线' : '离线'}</span>
      <span>窗口宽度: {width}px</span>
    </div>
  );
}
```

### 1.3.3 按关注点组织代码

Hooks 允许开发者按照功能维度组织代码，而非按照生命周期时间点：

```
Class 组件代码组织：          Hooks 代码组织：
┌─────────────────────┐     ┌─────────────────────┐
│ componentDidMount   │     │ 功能A:              │
│   - 功能A初始化      │     │   useState          │
│   - 功能B初始化      │     │   useEffect(初始化)  │
│   - 功能C初始化      │     │   useEffect(清理)    │
│                     │     │                     │
│ componentDidUpdate  │     │ 功能B:              │
│   - 功能A更新        │     │   useState          │
│   - 功能B更新        │     │   useEffect(初始化)  │
│   - 功能C更新        │     │   useEffect(更新)    │
│                     │     │                     │
│ componentWillUnmount│     │ 功能C:              │
│   - 功能A清理        │     │   useState          │
│   - 功能B清理        │     │   useEffect(初始化)  │
│   - 功能C清理        │     │   useEffect(清理)    │
└─────────────────────┘     └─────────────────────┘
  按时间点组织                按功能关注点组织
```

## 1.4 React 19 概览

React 19 于 2024 年底正式发布，带来了多项重要特性，其中多项直接扩展了 Hooks 的能力边界。

### 1.4.1 Actions

Actions 是 React 19 最核心的新概念，它统一了异步状态更新的范式。通过 `useTransition` 或新的 `useActionState` Hook，可以直接将异步函数作为事件处理程序：

```jsx
function UpdateProfile() {
  const [error, submitAction, isPending] = useActionState(
    async (previousState, formData) => {
      const name = formData.get('name');
      const error = await updateProfile({ name });
      if (error) return error;
      return null;
    },
    null // 初始状态
  );

  return (
    <form action={submitAction}>
      <input name="name" />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? '保存中...' : '保存'}
      </button>
    </form>
  );
}
```

### 1.4.2 新增 Hooks

React 19 新增了多个 Hooks：

| Hook | 用途 |
|------|------|
| `useActionState` | 管理异步 Action 的状态（pending/error/result） |
| `useOptimistic` | 乐观更新，在异步操作完成前显示预期结果 |
| `useFormStatus` | 获取父级 `<form>` 的 pending 状态 |
| `use` | 读取 Promise 和 Context，支持条件调用 |

```jsx
// useOptimistic：乐观更新
function MessageList({ messages }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage) => [
      ...state,
      { id: 'temp-' + Date.now(), text: newMessage, sending: true },
    ]
  );

  async function sendMessage(formData) {
    const text = formData.get('message');
    addOptimisticMessage(text); // 立即显示
    await sendToServer(text);    // 后台发送
  }

  return (
    <div>
      {optimisticMessages.map((msg) => (
        <div key={msg.id} style={{ opacity: msg.sending ? 0.5 : 1 }}>
          {msg.text}
        </div>
      ))}
    </div>
  );
}
```

### 1.4.3 Ref as Prop

React 19 中 `ref` 成为普通 prop，不再需要 `forwardRef`：

```jsx
// React 18：需要 forwardRef
const Input = forwardRef((props, ref) => (
  <input ref={ref} {...props} />
));

// React 19：ref 作为普通 prop
function Input({ ref, ...props }) {
  return <input ref={ref} {...props} />;
}
```

### 1.4.4 Server Components

React 19 正式支持 Server Components，服务端组件不使用 Hooks（状态和副作用仅存在于客户端），但它们为 Hooks 的使用边界做了清晰划分：

```jsx
// Server Component：不使用任何 Hooks
async function BlogPost({ slug }) {
  const post = await db.posts.findOne({ slug }); // 直接访问数据库
  return <article>{post.content}</article>;
}

// Client Component：使用 Hooks
'use client';
function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);

  const handleLike = async () => {
    setLiked(true);
    setCount(prev => prev + 1);
    await likePost(postId);
  };

  return <button onClick={handleLike}>{liked ? '已赞' : '点赞'} {count}</button>;
}
```

## 1.5 Hooks 使用规则

Hooks 有两条不可违背的规则，这些规则源于 Hooks 的内部实现机制（下一章将深入解释）：

### 规则一：只在最顶层调用 Hook

**不要在循环、条件判断或嵌套函数中调用 Hook。** 必须始终在 React 函数的最顶层调用它们。

```jsx
// 错误：在条件语句中调用 Hook
function BadComponent({ isLoggedIn }) {
  if (isLoggedIn) {
    const [user, setUser] = useState(null); // 违反规则！
  }
  const [theme, setTheme] = useState('light');
  // ...
}

// 正确：将条件判断放在 Hook 内部
function GoodComponent({ isLoggedIn }) {
  const [user, setUser] = useState(null);   // 始终调用
  const [theme, setTheme] = useState('light'); // 始终调用

  useEffect(() => {
    if (isLoggedIn) {  // 条件判断放在 effect 内部
      fetchUser().then(setUser);
    }
  }, [isLoggedIn]);
  // ...
}
```

为什么？因为 React 依靠 Hook 的**调用顺序**来匹配状态。如果顺序发生变化，React 会将状态与错误的 Hook 关联，导致数据混乱。

```
首次渲染：
  useState('light')  → Hook #1 → 'light'
  useState(null)     → Hook #2 → null
  useEffect(...)     → Hook #3 → effect

第二次渲染（如果条件成立才调用 useState）：
  useState('light')  → Hook #1 → 'light'  (正确)
  useEffect(...)     → Hook #2 → effect   (错误！匹配到了原来 #2 的状态)
```

### 规则二：只在 React 函数中调用 Hook

不要在普通 JavaScript 函数中调用 Hook（自定义 Hook 除外，因为自定义 Hook 本质上也是 React 函数组件中调用的）。

```jsx
// 错误：在普通函数中调用 Hook
function formatDate(date) {
  const [locale] = useState('zh-CN'); // 违反规则！
  return new Intl.DateTimeFormat(locale).format(date);
}

// 正确：在组件或自定义 Hook 中调用
function useFormattedDate(date) {
  const [locale] = useState('zh-CN');
  return new Intl.DateTimeFormat(locale).format(date);
}

function DateDisplay({ date }) {
  const formatted = useFormattedDate(date);
  return <time>{formatted}</time>;
}
```

ESLint 插件 `eslint-plugin-react-hooks` 可以自动检查这两条规则：

```json
{
  "plugins": ["react-hooks"],
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

## 1.6 Hooks 与 Class 组件对比总结

| 对比维度 | Class 组件 | 函数组件 + Hooks |
|---------|-----------|----------------|
| **定义方式** | `class X extends React.Component` | `function X() {}` |
| **状态管理** | `this.state` / `this.setState`（浅合并） | `useState`（直接替换） |
| **副作用** | `componentDidMount` / `componentDidUpdate` / `componentWillUnmount` | `useEffect` / `useLayoutEffect` |
| **计算属性** | `getDerivedStateFromProps` / `shouldComponentUpdate` | `useMemo` / `React.memo` |
| **Ref 引用** | `React.createRef()` | `useRef` |
| **Context 消费** | `<Context.Consumer>` 或 `contextType` | `useContext` |
| **逻辑复用** | HOC / Render Props / Mixin | 自定义 Hook |
| **代码组织** | 按生命周期方法 | 按功能关注点 |
| **`this` 问题** | 需要绑定 | 不存在 |
| **TypeScript** | 类型标注复杂 | 天然类型推导 |
| **编译优化** | Class 方法难以 tree-shake | 函数更易压缩和 tree-shake |
| **学习曲线** | 需要理解 JS 的 `this`、超类调用 | 需要理解闭包、依赖数组 |
| **并发特性** | 兼容性差 | 原生支持 |

React 19 仍然保留了对 Class 组件的支持，但新特性（Actions、Server Components、Suspense 深度集成等）优先面向函数组件设计。Class 组件已进入"维护模式"，不再接收新的 API 扩展。

## 1.7 小结

本章回顾了 React 从 Class 组件到 Hooks 的演进历程：

1. **Class 组件的痛点**是 Hooks 诞生的根本驱动力——`this` 绑定、生命周期逻辑割裂、HOC 包装地狱
2. **Hooks 的设计目标**直击这些痛点——简化状态管理、无 HOC 的逻辑复用、按关注点组织代码
3. **React 19** 在 Hooks 基础上进一步扩展，引入 Actions、`useActionState`、`useOptimistic` 等新概念
4. **Hooks 的使用规则**源于其内部实现机制，必须遵守才能保证正确性

下一章我们将深入 Hooks 的实现原理，探索 Fiber 架构、Hook 链表、调度机制等核心概念，理解 Hooks 为什么必须遵守上述两条规则。