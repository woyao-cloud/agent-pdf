# 第六章：上下文与引用 Hooks

React 的数据流遵循"自上而下"的单向传递原则——props 从父组件流向子组件。但在大型应用中，某些数据（如主题、用户信息、语言偏好）需要在深层嵌套的组件间共享，逐层传递 props 既繁琐又脆弱。

`useContext` 和 `useRef` 从两个不同角度解决了这个问题：`useContext` 实现了跨层级的"数据广播"，`useRef` 则提供了不触发渲染的"可变存储"。再加上 `useImperativeHandle`，这三个 Hook 构成了 React 组件间通信的完整工具链。

---

## 6.1 useContext

`useContext` 让组件能够直接消费 React Context 的值，无需逐层传递 props。

### 6.1.1 Context 的完整流程

使用 Context 需要三个步骤：

```jsx
// 步骤 1：创建 Context
const ThemeContext = createContext('light');

// 步骤 2：在组件树上层提供值
function App() {
  const [theme, setTheme] = useState('light');

  return (
    <ThemeContext.Provider value={theme}>
      <Header />
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        切换主题
      </button>
    </ThemeContext.Provider>
  );
}

// 步骤 3：在任意深度的子组件中消费
function Header() {
  return (
    <div>
      <Logo />
      <Navigation />
    </div>
  );
}

function Navigation() {
  // 无需 Header 传递 props，直接消费
  const theme = useContext(ThemeContext);
  return <nav className={`nav nav-${theme}`}>...</nav>;
}
```

### 6.1.2 Provider 模式

Provider 的 `value` prop 决定了消费组件获取到的值：

```jsx
// 嵌套 Provider：内层覆盖外层
const ThemeContext = createContext('light');

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <Sidebar />          {/* 获取到 'dark' */}
      <ThemeContext.Provider value="blue">
        <Content />         {/* 获取到 'blue'（内层覆盖外层）*/}
      </ThemeContext.Provider>
    </ThemeContext.Provider>
  );
}

// 没有 Provider 时使用默认值
function Standalone() {
  const theme = useContext(ThemeContext); // 'light'（默认值）
  return <div>{theme}</div>;
}
```

Provider 嵌套规则：

| 情况 | 消费组件获取的值 |
|------|----------------|
| 没有上层 Provider | `createContext` 的默认值 |
| 有一个 Provider | 该 Provider 的 `value` |
| 有多个嵌套 Provider | 最近的那层 Provider 的 `value` |

### 6.1.3 实战示例

#### 主题切换器

```jsx
import { createContext, useContext, useState, useMemo } from 'react';

// 创建 Context
const ThemeContext = createContext(undefined);

// 自定义 Provider 组件
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  // 使用 useMemo 避免 value 对象每次创建新引用
  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme(t => t === 'light' ? 'dark' : 'light')
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// 自定义 Hook：封装 Context 访问逻辑
function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用');
  }
  return context;
}

// 消费组件
function ThemedButton({ children }) {
  const { theme, toggleTheme } = useTheme();

  const styles = {
    light: { background: '#fff', color: '#333', border: '1px solid #ccc' },
    dark: { background: '#333', color: '#fff', border: '1px solid #555' }
  };

  return (
    <button style={styles[theme]} onClick={toggleTheme}>
      {children}
    </button>
  );
}

// 应用入口
function App() {
  return (
    <ThemeProvider>
      <Header />
      <Main />
    </ThemeProvider>
  );
}
```

#### 用户认证

```jsx
import { createContext, useContext, useState, useMemo } from 'react';

const AuthContext = createContext(undefined);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user
  }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return context;
}

// 消费组件
function ProfilePage() {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <div>
      <h1>欢迎, {user.name}</h1>
      <button onClick={logout}>退出登录</button>
    </div>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    login(email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">登录</button>
    </form>
  );
}
```

### 6.1.4 性能考量

Context 的一个重要特性：**当 Context 值变化时，所有消费该 Context 的组件都会重新渲染**，无论它们是否使用了变化的部分。

```jsx
// 问题：value 对象每次渲染都是新引用 → 所有消费者都重渲染
function BadProvider({ children }) {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');

  // 每次 Provider 重新渲染，value 都是新的对象引用
  return (
    <AppContext.Provider value={{ user, theme, setUser, setTheme }}>
      {children}
    </AppContext.Provider>
  );
}

// 方案一：拆分 Context
const UserContext = createContext();
const ThemeContext = createContext();

function SplitProvider({ children }) {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {children}
      </ThemeContext.Provider>
    </UserContext.Provider>
  );
}

// 仅使用 theme 的组件不会因为 user 变化而重渲染
function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext);
  return <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme}</button>;
}

// 方案二：使用 useMemo 稳定 value 引用
function OptimizedProvider({ children }) {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');

  const value = useMemo(() => ({
    user,
    theme,
    setUser,
    setTheme
  }), [user, theme]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
```

### 6.1.5 何时使用与何时不使用

| 适合使用 Context | 不适合使用 Context |
|----------------|-----------------|
| 主题（暗色/亮色） | 频繁变化的状态（如鼠标位置） |
| 当前用户/认证信息 | 组件间的一次性通信 |
| 语言/地区设置 | 需要精细更新控制的复杂状态 |
| 全局配置 | 兄弟组件间的简单数据传递 |
| 路由信息 | 可以用 props 轻松传递的数据 |

对于频繁变化的状态或复杂的状态管理，考虑使用状态管理库（如 Zustand、Jotai、Redux Toolkit）。

### 6.1.6 最佳实践

1. **总是创建自定义 Hook**：封装 `useContext` 调用，提供类型安全和错误提示

```jsx
// 好的做法
function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用');
  }
  return context;
}

// 不好的做法：直接使用 useContext
function Component() {
  const theme = useContext(ThemeContext); // 缺少错误提示，可读性差
}
```

2. **将 Provider 和 Hook 放在同一文件**：方便管理和导入

```jsx
// ThemeContext.jsx
const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) { /* ... */ }
export function useTheme() { /* ... */ }
```

3. **使用 useMemo 稳定 Provider 的 value**：避免不必要的消费者重渲染

4. **拆分大型 Context**：将不相关的数据放入不同的 Context

---

## 6.2 useRef

`useRef` 返回一个可变引用对象，其 `.current` 属性可以保存任何值。与 `useState` 的关键区别是：**修改 `ref.current` 不会触发组件重渲染**。

### 6.2.1 基本语法

```jsx
const ref = useRef(initialValue);
// ref.current 初始值为 initialValue
// 修改 ref.current 不会触发重渲染
```

### 6.2.2 三大用途

#### 用途一：引用 DOM 元素

这是 `useRef` 最常见的用途——获取 DOM 节点的引用，直接操作 DOM：

```jsx
import { useRef } from 'react';

function AutoFocusInput() {
  const inputRef = useRef(null);

  useEffect(() => {
    // 挂载后自动聚焦
    inputRef.current.focus();
  }, []);

  return <input ref={inputRef} type="text" placeholder="自动聚焦" />;
}

function ScrollToTop() {
  const topRef = useRef(null);

  const handleScrollUp = () => {
    topRef.current.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <div ref={topRef} />
      {/* 大量内容 */}
      <button onClick={handleScrollUp}>回到顶部</button>
    </div>
  );
}

function VideoPlayer({ src }) {
  const videoRef = useRef(null);

  const handlePlay = () => videoRef.current.play();
  const handlePause = () => videoRef.current.pause();

  return (
    <div>
      <video ref={videoRef} src={src} />
      <button onClick={handlePlay}>播放</button>
      <button onClick={handlePause}>暂停</button>
    </div>
  );
}
```

#### 用途二：存储不触发渲染的可变值

有些值需要跨渲染周期保持，但变化时不应该触发重渲染：

```jsx
import { useRef, useState, useEffect } from 'react';

// 定时器 ID
function Timer() {
  const [count, setCount] = useState(0);
  const timerRef = useRef(null);

  const start = () => {
    if (timerRef.current) return; // 防止重复启动
    timerRef.current = setInterval(() => {
      setCount(c => c + 1);
    }, 1000);
  };

  const stop = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    return () => clearInterval(timerRef.current); // 清理
  }, []);

  return (
    <div>
      <p>{count}</p>
      <button onClick={start}>开始</button>
      <button onClick={stop}>停止</button>
    </div>
  );
}

// 之前的滚动位置
function ScrollPosition() {
  const [current, setCurrent] = useState(0);
  const previousRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      previousRef.current = current; // 保存当前值到 ref
      setCurrent(window.scrollY);    // 触发渲染
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [current]);

  return (
    <div>
      <p>当前: {current}px</p>
      <p>之前: {previousRef.current}px</p>
    </div>
  );
}

// 标记是否为首次渲染
function Component() {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      console.log('首次渲染');
    } else {
      console.log('更新渲染');
    }
  });
}
```

#### 用途三：追踪前一个状态值

```jsx
import { useRef, useEffect } from 'react';

function usePrevious(value) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

// 使用示例
function Counter() {
  const [count, setCount] = useState(0);
  const prevCount = usePrevious(count);

  return (
    <div>
      <p>当前: {count}</p>
      <p>之前: {prevCount ?? '无'}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
}
```

### 6.2.3 useRef 与 useState 的区别

| 特性 | useRef | useState |
|------|--------|----------|
| 更新时触发渲染 | 否 | 是 |
| 用途 | DOM 引用、可变值 | 组件状态 |
| 在渲染中读取 | 不推荐（值可能过时） | 推荐（值总是最新） |
| 更新方式 | 直接赋值 `ref.current = x` | 通过 setter 函数 |
| 渲染一致性 | 跨渲染保持引用 | 每次渲染闭包捕获当前值 |

```jsx
// useRef 的陷阱：在渲染期间读取 ref.current
function BadComponent() {
  const ref = useRef(0);
  ref.current += 1;

  // 危险！渲染期间修改 ref.current
  // 如果组件被中断和恢复，可能导致不一致
  return <div>{ref.current}</div>;
}

// 正确做法：在事件处理函数或 Effect 中修改 ref
function GoodComponent() {
  const countRef = useRef(0);
  const [count, setCount] = useState(0);

  const handleClick = () => {
    countRef.current += 1; // 在事件处理函数中修改
    setCount(countRef.current);
  };

  return <button onClick={handleClick}>点击了 {count} 次</button>;
}
```

### 6.2.4 React 19 的 ref 作为 prop

在 React 19 中，`ref` 成为普通的 prop，不再需要 `forwardRef` 来传递：

```jsx
// React 19：ref 作为普通 prop
function CustomInput({ ref, placeholder }) {
  return <input ref={ref} placeholder={placeholder} />;
}

// 使用
function Form() {
  const inputRef = useRef(null);
  return <CustomInput ref={inputRef} placeholder="请输入" />;
}

// React 18 及之前：需要 forwardRef
const CustomInput = forwardRef(function CustomInput(props, ref) {
  return <input ref={ref} {...props} />;
});
```

| 版本 | 传递 ref 的方式 |
|------|--------------|
| React 18 及之前 | `forwardRef` 包裹组件，第二个参数接收 `ref` |
| React 19 | `ref` 作为普通 prop，直接在参数中接收 |

> **注意**：在 React 19 中，`forwardRef` 仍然可用但不再必要。新代码应该直接将 `ref` 作为 prop 接收。

### 6.2.5 forwardRef 仍然需要的场景

虽然 React 19 简化了 ref 传递，但以下场景仍可能需要 `forwardRef` 或高阶组件：

1. **与旧版本 React 库兼容**：如果库需要支持 React 18 及以下
2. **需要同时支持 ref 作为 prop 和 forwardRef**：过渡期间

```jsx
// 同时兼容 React 18 和 19 的写法
const CustomInput = forwardRef(function CustomInput(
  { placeholder, ...rest },
  ref
) {
  return <input ref={ref} placeholder={placeholder} {...rest} />;
});
```

---

## 6.3 useImperativeHandle

`useImperativeHandle` 让你自定义通过 `ref` 暴露给父组件的值。默认情况下，父组件通过 `ref` 获得的是子组件的 DOM 节点，`useImperativeHandle` 可以让你精确控制暴露哪些方法。

### 6.3.1 基本语法

```jsx
useImperativeHandle(ref, createHandle, dependencies);
```

- `ref`：从父组件传入的 `ref`
- `createHandle`：返回要暴露给父组件的对象的函数
- `dependencies`：可选的依赖数组，依赖变化时重新创建暴露的对象

### 6.3.2 代码示例

#### 自定义输入框：暴露 focus、select、clear 方法

```jsx
import { useRef, useImperativeHandle, forwardRef } from 'react';

// React 19 写法：ref 作为 prop
function CustomInput({ ref, placeholder, defaultValue }) {
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    // 只暴露需要的方法，而不是整个 DOM 节点
    focus: () => {
      inputRef.current.focus();
    },
    select: () => {
      inputRef.current.select();
    },
    clear: () => {
      inputRef.current.value = '';
    },
    getValue: () => {
      return inputRef.current.value;
    }
  }), []); // 空依赖数组 → 方法引用稳定

  return (
    <div className="custom-input-wrapper">
      <input
        ref={inputRef}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="custom-input"
      />
    </div>
  );
}

// 父组件使用
function Form() {
  const inputRef = useRef(null);

  const handleFocus = () => inputRef.current.focus();
  const handleSelect = () => inputRef.current.select();
  const handleClear = () => inputRef.current.clear();
  const handleGetValue = () => {
    alert('当前值: ' + inputRef.current.getValue());
  };

  return (
    <div>
      <CustomInput
        ref={inputRef}
        placeholder="请输入内容"
        defaultValue="Hello React 19"
      />
      <button onClick={handleFocus}>聚焦</button>
      <button onClick={handleSelect}>全选</button>
      <button onClick={handleClear}>清空</button>
      <button onClick={handleGetValue}>获取值</button>
    </div>
  );
}
```

#### 表单组件：暴露 validate 和 submit 方法

```jsx
import { useRef, useImperativeHandle, useState } from 'react';

function useFormFields(initialValues) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});

  const handleChange = (name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: null }));
  };

  return { values, errors, setErrors, handleChange };
}

function ProfileForm({ ref, userId }) {
  const { values, errors, setErrors, handleChange } = useFormFields({
    name: '',
    email: '',
    age: ''
  });
  const formRef = useRef(null);

  const validate = () => {
    const newErrors = {};
    if (!values.name.trim()) newErrors.name = '姓名不能为空';
    if (!values.email.includes('@')) newErrors.email = '邮箱格式不正确';
    if (values.age < 0 || values.age > 150) newErrors.age = '年龄不合法';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submit = async () => {
    if (!validate()) return false;
    await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(values)
    });
    return true;
  };

  const reset = () => {
    handleChange('name', '');
    handleChange('email', '');
    handleChange('age', '');
    setErrors({});
  };

  // 自定义暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    validate,
    submit,
    reset
  }), [values]);

  return (
    <form>
      <div>
        <label>姓名</label>
        <input
          value={values.name}
          onChange={(e) => handleChange('name', e.target.value)}
        />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>
      <div>
        <label>邮箱</label>
        <input
          value={values.email}
          onChange={(e) => handleChange('email', e.target.value)}
        />
        {errors.email && <span className="error">{errors.email}</span>}
      </div>
      <div>
        <label>年龄</label>
        <input
          type="number"
          value={values.age}
          onChange={(e) => handleChange('age', e.target.value)}
        />
        {errors.age && <span className="error">{errors.age}</span>}
      </div>
    </form>
  );
}

// 父组件
function ProfileEditor({ userId }) {
  const formRef = useRef(null);

  const handleSubmit = async () => {
    const success = await formRef.current.submit();
    if (success) {
      alert('保存成功');
    }
  };

  const handleReset = () => {
    formRef.current.reset();
  };

  return (
    <div>
      <ProfileForm ref={formRef} userId={userId} />
      <button onClick={handleSubmit}>保存</button>
      <button onClick={handleReset}>重置</button>
    </div>
  );
}
```

### 6.3.3 何时使用 useImperativeHandle

| 场景 | 是否使用 |
|------|---------|
| 库作者暴露有限的命令式 API | 是 |
| 表单组件暴露 validate/submit/reset | 是 |
| 模态框组件暴露 open/close 方法 | 是 |
| 简单的 DOM 引用（只需 focus、scroll） | 否，直接用 useRef |
| 替代状态管理 | 否，应该用 props 和 state |

### 6.3.4 依赖数组的作用

```jsx
function Editor({ ref, content }) {
  const editorRef = useRef(null);

  // 不带依赖数组：每次渲染都重新创建暴露的对象
  useImperativeHandle(ref, () => ({
    getContent: () => editorRef.current.getContent()
  }));

  // 带空依赖数组：只在挂载时创建一次（方法引用稳定）
  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current.focus()
  }), []);

  // 带依赖：依赖变化时重新创建
  useImperativeHandle(ref, () => ({
    save: () => saveContent(content) // 使用最新的 content
  }), [content]);
}
```

> **推荐做法**：大多数情况下使用空依赖数组 `[]`，确保暴露的方法引用稳定。如果方法需要访问最新的 props 或 state，可以在方法内部使用 ref 来获取最新值，而不是添加依赖。

```jsx
function Editor({ ref, content }) {
  const editorRef = useRef(null);
  const contentRef = useRef(content);
  contentRef.current = content; // 始终保持最新

  useImperativeHandle(ref, () => ({
    save: () => {
      // 通过 ref 获取最新的 content，而不是闭包捕获
      saveContent(contentRef.current);
    }
  }), []); // 空依赖，方法引用稳定
}
```

---

## 6.4 三个 Hook 的对比与选择

| Hook | 核心功能 | 是否触发渲染 | 典型场景 |
|------|---------|-------------|---------|
| `useContext` | 跨层级传递数据 | 是（值变化时） | 主题、用户信息、配置 |
| `useRef` | 持久化可变引用 | 否 | DOM 操作、存储定时器 ID、追踪前值 |
| `useImperativeHandle` | 自定义 ref 暴露的方法 | 否 | 库组件、表单、模态框 |

### 选择决策

```
需要跨组件共享数据？
├── 是，数据不频繁变化
│   └── useContext
├── 是，数据频繁变化（如鼠标位置）
│   └── 考虑状态管理库（Zustand、Jotai 等）
└── 否

需要操作 DOM？
├── 是，只需获取 DOM 节点
│   └── useRef + ref 属性
├── 是，需要暴露自定义方法给父组件
│   └── useImperativeHandle
└── 否

需要存储跨渲染但不触发渲染的值？
└── useRef
```

---

## 6.5 小结

本章介绍了 React 中组件通信的三个关键 Hook：

1. **`useContext`**：解决了 prop drilling 问题，让数据在组件树中"广播"。需要注意性能——值变化时所有消费者都会重渲染。拆分 Context 和使用 `useMemo` 是关键优化手段。

2. **`useRef`**：提供了不触发渲染的可变存储，三大用途是 DOM 引用、可变值存储和追踪前值。React 19 简化了 ref 传递，不再强制使用 `forwardRef`。

3. **`useImperativeHandle`**：让组件精确控制暴露给父组件的命令式 API，是库作者和表单组件的重要工具。配合 `useRef` 使用，可以避免暴露过多内部实现细节。

理解这三个 Hook 的区别和适用场景，是构建可维护、可组合的 React 应用的基础。