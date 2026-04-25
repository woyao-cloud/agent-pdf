# 第三章：状态管理 Hooks

状态是 React 组件的灵魂。React 提供了三个核心的状态管理 Hook：`useState`、`useReducer` 和 `useSyncExternalStore`。它们各有适用场景，共同构成了 React 状态管理的完整图谱。

## 3.1 useState

`useState` 是最基础、最常用的状态管理 Hook，适用于简单的独立状态。

### 3.1.1 基础用法

```jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>当前计数: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
      <button onClick={() => setCount(0)}>重置</button>
    </div>
  );
}
```

`useState` 返回一个数组：
- 第一个元素：当前状态值
- 第二个元素：状态更新函数（setter）

### 3.1.2 函数式更新

当新状态依赖于前一个状态时，应该使用函数式更新，而非直接引用外部变量：

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  // 错误：在快速连续点击时可能丢失更新
  function incrementBad() {
    setCount(count + 1); // count 可能是过期值
  }

  // 正确：函数式更新保证基于最新状态计算
  function incrementGood() {
    setCount(prev => prev + 1); // prev 始终是最新值
  }

  // 连续调用时差异明显
  function incrementThree() {
    // 错误方式：三次 setCount(count + 1) 最终只加了 1（批处理 + 闭包）
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);

    // 正确方式：每次都基于前一个值
    setCount(prev => prev + 1);
    setCount(prev => prev + 1);
    setCount(prev => prev + 1); // count += 3
  }

  return <button onClick={incrementGood}>+1</button>;
}
```

函数式更新的执行流程：

```
初始状态: count = 0

setCount(prev => prev + 1)  → 队列: [prev => prev + 1]
setCount(prev => prev + 1)  → 队列: [prev => prev + 1, prev => prev + 1]
setCount(prev => prev + 1)  → 队列: [prev => prev + 1, prev => prev + 1, prev => prev + 1]

渲染阶段处理队列:
  baseState = 0
  应用 update1: 0 + 1 = 1
  应用 update2: 1 + 1 = 2
  应用 update3: 2 + 1 = 3
  最终状态: 3
```

### 3.1.3 惰性初始化

当初始状态需要通过昂贵计算得到时，应该传入初始化函数，而非直接传入计算结果：

```jsx
function ExpensiveComponent() {
  // 错误：每次渲染都执行 expensiveComputation
  const [data, setData] = useState(expensiveComputation());

  // 正确：只在首次渲染时执行
  const [data, setData] = useState(() => expensiveComputation());

  return <div>{data}</div>;
}
```

`useState` 接受的参数如果是函数，只在挂载时调用一次；如果直接传入函数调用结果，则每次渲染都会执行该计算。

常见使用场景：从 localStorage 读取初始值：

```jsx
function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch (error) {
      console.error(`读取 localStorage key "${key}" 失败:`, error);
      return defaultValue;
    }
  });

  // 同步写入 localStorage
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function Settings() {
  const [theme, setTheme] = usePersistedState('theme', 'light');
  const [fontSize, setFontSize] = usePersistedState('fontSize', 14);

  return (
    <div style={{ fontSize: `${fontSize}px` }}>
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        切换主题: {theme}
      </button>
      <button onClick={() => setFontSize(s => s + 1)}>增大字体</button>
    </div>
  );
}
```

### 3.1.4 常见陷阱

**陷阱一：对象状态不会自动合并**

与 Class 组件的 `this.setState`（浅合并）不同，`useState` 的 setter 是**直接替换**：

```jsx
function UserProfile() {
  const [profile, setProfile] = useState({ name: '张三', age: 25, city: '北京' });

  // 错误：只会保留 age，丢失 name 和 city
  function updateAgeBad() {
    setProfile({ age: 26 });
  }

  // 正确方式1：展开运算符手动合并
  function updateAgeGood() {
    setProfile(prev => ({ ...prev, age: 26 }));
  }

  // 正确方式2：如果经常需要部分更新，考虑使用 useReducer

  return <div>{profile.name}, {profile.age}岁, {profile.city}</div>;
}
```

**陷阱二：批处理误解**

```jsx
function BatchDemo() {
  const [count, setCount] = useState(0);
  const [flag, setFlag] = useState(false);

  function handleClick() {
    setCount(c => c + 1); // 不会立即重新渲染
    setFlag(f => !f);      // 不会立即重新渲染
    // React 将两次更新批处理，只触发一次渲染
    console.log(count); // 仍然是旧值！
  }

  // 在 React 18 之前，setTimeout 中的更新不会批处理
  // React 18+：所有上下文中的更新都会自动批处理
  function asyncHandle() {
    setTimeout(() => {
      setCount(c => c + 1);
      setFlag(f => !f);
      // React 18+：仍然只触发一次渲染
    }, 100);
  }

  return <button onClick={handleClick}>count: {count}</button>;
}
```

**陷阱三：数组状态需要创建新引用**

```jsx
function TodoList() {
  const [todos, setTodos] = useState([]);

  // 错误：直接修改原数组
  function addTodoBad(text) {
    todos.push({ text, done: false }); // 修改原数组
    setTodos(todos);                    // 引用未变，React 不会重新渲染
  }

  // 正确：创建新数组
  function addTodoGood(text) {
    setTodos(prev => [...prev, { text, done: false }]);
  }

  // 正确：更新某一项
  function toggleTodo(index) {
    setTodos(prev => prev.map((todo, i) =>
      i === index ? { ...todo, done: !todo.done } : todo
    ));
  }

  // 正确：删除某一项
  function removeTodo(index) {
    setTodos(prev => prev.filter((_, i) => i !== index));
  }

  return (
    <ul>
      {todos.map((todo, i) => (
        <li key={i} onClick={() => toggleTodo(i)}>
          <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>
            {todo.text}
          </span>
          <button onClick={(e) => { e.stopPropagation(); removeTodo(i); }}>删除</button>
        </li>
      ))}
    </ul>
  );
}
```

## 3.2 useReducer

当状态逻辑变得复杂——多个子值相互依赖，或下一个状态依赖前一个状态时，`useReducer` 是比 `useState` 更好的选择。

### 3.2.1 基本概念

`useReducer` 接受三个参数：

```jsx
const [state, dispatch] = useReducer(reducer, initialArg, init);
```

- **reducer**：`(state, action) => newState` 纯函数
- **initialArg**：初始状态（或传给 init 的参数）
- **init**（可选）：惰性初始化函数

### 3.2.2 何时选择 useReducer 而非 useState

| 场景 | 推荐 |
|------|------|
| 独立的简单状态（布尔值、数字、字符串） | `useState` |
| 需要函数式更新的简单状态 | `useState` + 函数式更新 |
| 多个子值相互依赖的复杂状态 | `useReducer` |
| 状态转换逻辑复杂（多分支、多条件） | `useReducer` |
| 需要回溯/重放状态变化 | `useReducer` |
| 需要通过 Context 共享状态逻辑 | `useReducer` + `useContext` |

### 3.2.3 表单状态管理

复杂表单是 `useReducer` 的典型应用场景：

```jsx
const formReducer = (state, action) => {
  switch (action.type) {
    case 'FIELD_CHANGE':
      return { ...state, [action.field]: action.value };
    case 'RESET':
      return action.initialState;
    case 'SET_ERRORS':
      return { ...state, errors: action.errors };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };
    case 'SUBMIT_SUCCESS':
      return { ...state, isSubmitting: false, submitted: true, errors: {} };
    default:
      return state;
  }
};

function RegistrationForm() {
  const initialState = {
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    errors: {},
    isSubmitting: false,
    submitted: false,
  };

  const [state, dispatch] = useReducer(formReducer, initialState);

  const handleChange = (field) => (e) => {
    dispatch({ type: 'FIELD_CHANGE', field, value: e.target.value });
  };

  const validate = () => {
    const errors = {};
    if (!state.username.trim()) errors.username = '用户名不能为空';
    if (!/\S+@\S+\.\S+/.test(state.email)) errors.email = '邮箱格式不正确';
    if (state.password.length < 8) errors.password = '密码至少8位';
    if (state.password !== state.confirmPassword) errors.confirmPassword = '两次密码不一致';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'SET_ERRORS', errors });
      return;
    }

    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });
    try {
      await api.register({
        username: state.username,
        email: state.email,
        password: state.password,
      });
      dispatch({ type: 'SUBMIT_SUCCESS' });
    } catch (err) {
      dispatch({ type: 'SET_ERRORS', errors: { server: err.message } });
    }
  };

  if (state.submitted) {
    return <div>注册成功！</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={state.username}
        onChange={handleChange('username')}
        placeholder="用户名"
      />
      {state.errors.username && <span className="error">{state.errors.username}</span>}

      <input
        value={state.email}
        onChange={handleChange('email')}
        placeholder="邮箱"
      />
      {state.errors.email && <span className="error">{state.errors.email}</span>}

      <input
        type="password"
        value={state.password}
        onChange={handleChange('password')}
        placeholder="密码"
      />
      {state.errors.password && <span className="error">{state.errors.password}</span>}

      <button type="submit" disabled={state.isSubmitting}>
        {state.isSubmitting ? '提交中...' : '注册'}
      </button>
    </form>
  );
}
```

### 3.2.4 购物车

```jsx
const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingIndex = state.items.findIndex(i => i.id === action.item.id);
      if (existingIndex >= 0) {
        // 商品已在购物车中，增加数量
        const newItems = state.items.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
        return { ...state, items: newItems };
      }
      return { ...state, items: [...state.items, { ...action.item, quantity: 1 }] };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.id),
      };

    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.id
            ? { ...item, quantity: Math.max(0, action.quantity) }
            : item
        ).filter(item => item.quantity > 0), // 数量为0时移除
      };

    case 'CLEAR_CART':
      return { ...state, items: [] };

    case 'APPLY_COUPON':
      return { ...state, coupon: action.coupon };

    default:
      return state;
  }
};

// 计算派生数据（可提取为自定义 Hook）
function useCart() {
  const [state, dispatch] = useReducer(cartReducer, { items: [], coupon: null });

  const subtotal = state.items.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  );
  const discount = state.coupon ? subtotal * state.coupon.discount : 0;
  const total = subtotal - discount;

  return { state, dispatch, subtotal, discount, total };
}

function ShoppingCart() {
  const { state, dispatch, subtotal, discount, total } = useCart();

  return (
    <div>
      <h2>购物车</h2>
      {state.items.map(item => (
        <div key={item.id}>
          <span>{item.name} x {item.quantity}</span>
          <span>¥{item.price * item.quantity}</span>
          <button onClick={() => dispatch({ type: 'REMOVE_ITEM', id: item.id })}>
            删除
          </button>
        </div>
      ))}

      <div>小计: ¥{subtotal}</div>
      {discount > 0 && <div>优惠: -¥{discount}</div>}
      <div>总计: ¥{total}</div>

      <button onClick={() => dispatch({ type: 'CLEAR_CART' })}>清空购物车</button>
    </div>
  );
}
```

### 3.2.5 撤销/重做

`useReducer` 非常适合实现撤销/重做功能，因为所有状态转换都通过 reducer 集中管理：

```jsx
const UNDO = 'UNDO';
const REDO = 'REDO';
const SET = 'SET';

const undoableReducer = (state, action) => {
  switch (action.type) {
    case SET:
      return {
        past: [...state.past, state.present],  // 当前状态推入历史
        present: action.newPresent,              // 设置新状态
        future: [],                              // 清空未来状态
      };
    case UNDO: {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case REDO: {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
};

function useUndoable(initialState) {
  const [state, dispatch] = useReducer(undoableReducer, {
    past: [],
    present: initialState,
    future: [],
  });

  const set = (newPresent) => dispatch({ type: SET, newPresent });
  const undo = () => dispatch({ type: UNDO });
  const redo = () => dispatch({ type: REDO });
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  return { state: state.present, set, undo, redo, canUndo, canRedo };
}

// 使用示例：文本编辑器
function TextEditor() {
  const { state: text, set, undo, redo, canUndo, canRedo } = useUndoable('');

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => set(e.target.value)}
        placeholder="输入内容..."
      />
      <div>
        <button onClick={undo} disabled={!canUndo}>撤销</button>
        <button onClick={redo} disabled={!canRedo}>重做</button>
      </div>
    </div>
  );
}
```

状态流转示意图：

```
操作序列: 输入"A" → 输入"B" → 输入"C" → 撤销 → 撤销 → 重做

past         present   future
[]           "A"       []
["A"]        "B"       []
["A","B"]    "C"       []

撤销:
["A"]        "B"       ["C"]
撤销:
[]           "A"       ["B","C"]
重做:
["A"]        "B"       ["C"]
```

### 3.2.6 惰性初始化

`useReducer` 的第三个参数是惰性初始化函数，与 `useState` 的惰性初始化类似：

```jsx
function init(initialCount) {
  return {
    count: initialCount,
    history: [initialCount],
  };
}

const reducer = (state, action) => {
  switch (action.type) {
    case 'INCREMENT':
      return {
        count: state.count + 1,
        history: [...state.history, state.count + 1],
      };
    case 'RESET':
      return init(action.payload); // 重置时可复用 init 函数
    default:
      return state;
  }
};

function Counter({ initialCount }) {
  const [state, dispatch] = useReducer(reducer, initialCount, init);

  return (
    <div>
      <p>计数: {state.count}</p>
      <p>历史: {state.history.join(' → ')}</p>
      <button onClick={() => dispatch({ type: 'INCREMENT' })}>+1</button>
      <button onClick={() => dispatch({ type: 'RESET', payload: initialCount })}>
        重置
      </button>
    </div>
  );
}
```

### 3.2.7 useReducer + useContext 简易全局状态

对于中等规模的应用，`useReducer` + `useContext` 可以替代 Redux，无需引入额外依赖：

```jsx
// 1. 定义 reducer
const appReducer = (state, action) => {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.id),
      };
    case 'LOGOUT':
      return { ...state, user: null };
    default:
      return state;
  }
};

// 2. 创建 Context
const AppStateContext = createContext(null);
const AppDispatchContext = createContext(null);

// 3. 创建 Provider 组件
function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, {
    user: null,
    theme: 'light',
    notifications: [],
  });

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

// 4. 创建自定义 Hook
function useAppState() {
  const context = useContext(AppStateContext);
  if (context === null) {
    throw new Error('useAppState 必须在 AppProvider 内使用');
  }
  return context;
}

function useAppDispatch() {
  const context = useContext(AppDispatchContext);
  if (context === null) {
    throw new Error('useAppDispatch 必须在 AppProvider 内使用');
  }
  return context;
}

// 5. 在组件中使用
function Header() {
  const { user, theme } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <header>
      {user ? (
        <span>
          欢迎, {user.name}
          <button onClick={() => dispatch({ type: 'LOGOUT' })}>退出</button>
        </span>
      ) : (
        <a href="/login">登录</a>
      )}
      <button onClick={() => dispatch({
        type: 'SET_THEME',
        payload: theme === 'light' ? 'dark' : 'light',
      })}>
        {theme === 'light' ? '深色' : '浅色'}模式
      </button>
    </header>
  );
}

function NotificationList() {
  const { notifications } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="notifications">
      {notifications.map(n => (
        <div key={n.id} className={`notification notification-${n.type}`}>
          {n.message}
          <button onClick={() => dispatch({ type: 'REMOVE_NOTIFICATION', id: n.id })}>
            关闭
          </button>
        </div>
      ))}
    </div>
  );
}

// 6. 应用入口
function App() {
  return (
    <AppProvider>
      <Header />
      <NotificationList />
      <Main />
    </AppProvider>
  );
}
```

分离 State Context 和 Dispatch Context 是一个重要优化——只读取 state 的组件不会因为 dispatch 变化而重渲染，只调用 dispatch 的组件不会因为 state 变化而重渲染。

## 3.3 useSyncExternalStore

`useSyncExternalStore` 是 React 18 引入的 Hook，用于订阅 React 之外的外部状态存储，确保并发模式下的数据一致性。

### 3.3.1 解决什么问题

在并发模式下，React 渲染可能被中断和恢复。如果组件在渲染过程中从外部存储读取数据，而外部存储在渲染间隙发生了变化，就会导致"撕裂"（Tearing）——UI 的不同部分显示了不同时刻的状态。

```
时间线:
t1: 开始渲染 → 组件A读取 store.value = 1
t2: 渲染被中断（高优先级更新插入）
t3: store.value 变为 2
t4: 恢复渲染 → 组件B读取 store.value = 2
t5: 渲染完成 → UI 中 A 显示1，B 显示2 → 状态不一致！
```

`useSyncExternalStore` 通过在渲染阶段强制读取快照，确保同一渲染批次中所有组件看到相同的状态值。

### 3.3.2 API 签名

```jsx
const value = useSyncExternalStore(
  subscribe,            // (callback) => unsubscribe
  getSnapshot,          // () => value   客户端快照
  getServerSnapshot     // () => value   服务端快照（可选）
);
```

- **subscribe**：注册回调函数，当外部存储变化时调用此回调通知 React
- **getSnapshot**：返回当前存储的快照值，React 会在渲染阶段多次调用以检测变化
- **getServerSnapshot**：SSR 时使用的快照函数，避免客户端与服务端不一致

### 3.3.3 订阅浏览器 API

**在线状态检测：**

```jsx
function useOnlineStatus() {
  const isOnline = useSyncExternalStore(
    // subscribe: 注册/注销事件监听
    (callback) => {
      window.addEventListener('online', callback);
      window.addEventListener('offline', callback);
      return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
      };
    },
    // getSnapshot: 返回当前值
    () => navigator.onLine,
    // getServerSnapshot: SSR 时的默认值
    () => true // 服务端假设在线
  );

  return isOnline;
}

function StatusBar() {
  const isOnline = useOnlineStatus();

  return (
    <div style={{ color: isOnline ? 'green' : 'red' }}>
      {isOnline ? '在线' : '离线'}
    </div>
  );
}
```

**窗口尺寸监听：**

```jsx
function useWindowSize() {
  const size = useSyncExternalStore(
    (callback) => {
      window.addEventListener('resize', callback);
      return () => window.removeEventListener('resize', callback);
    },
    () => ({ width: window.innerWidth, height: window.innerHeight }),
    () => ({ width: 1920, height: 1080 }) // SSR 默认值
  );

  return size;
}
```

**媒体查询：**

```jsx
function useMediaQuery(query) {
  const matches = useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
    () => false // SSR 默认不匹配
  );

  return matches;
}

function ResponsiveLayout() {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
      <Sidebar collapsed={isMobile} />
      <MainContent />
    </div>
  );
}
```

### 3.3.4 订阅第三方状态管理库

以 Redux 为例，展示如何用 `useSyncExternalStore` 安全地订阅 Redux Store：

```jsx
import { useSyncExternalStore } from 'react';

function useReduxStore(store, selector) {
  const selectedValue = useSyncExternalStore(
    // subscribe: 订阅 Redux store 的变化
    store.subscribe,

    // getSnapshot: 使用 selector 提取所需数据
    () => selector(store.getState()),

    // getServerSnapshot: SSR 时的快照
    () => selector(store.getState())
  );

  return selectedValue;
}

// 使用示例
function TodoList() {
  const todos = useReduxStore(store, state => state.todos);
  const filter = useReduxStore(store, state => state.filter);

  const visibleTodos = todos.filter(todo => {
    if (filter === 'all') return true;
    if (filter === 'completed') return todo.completed;
    return !todo.completed;
  });

  return (
    <ul>
      {visibleTodos.map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

### 3.3.5 自定义外部存储

可以实现完全自定义的外部存储，只需遵循 `subscribe` + `getSnapshot` 协议：

```jsx
// 自定义事件总线存储
function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    setState: (updater) => {
      state = typeof updater === 'function' ? updater(state) : updater;
      listeners.forEach(listener => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// 创建全局存储
const counterStore = createStore({ count: 0, step: 1 });

// 非React代码可以直接修改状态
counterStore.setState(s => ({ ...s, count: s.count + s.step }));

// React 组件安全地订阅
function Counter() {
  const { count, step } = useSyncExternalStore(
    counterStore.subscribe,
    counterStore.getState
  );

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => counterStore.setState(s => ({ ...s, count: s.count + s.step }))}>
        +{step}
      </button>
      <button onClick={() => counterStore.setState(s => ({ ...s, step: s.step + 1 }))}>
        步长: {step}
      </button>
    </div>
  );
}
```

### 3.3.6 getSnapshot 的重要约束

`getSnapshot` 必须满足两个条件，否则可能导致无限循环或不必要的渲染：

1. **必须是纯函数**：多次调用返回相同的值（当存储未变化时）
2. **返回值必须可比较**：React 使用 `Object.is` 比较新旧快照

```jsx
// 错误：每次调用返回新对象引用，导致无限重渲染
const size = useSyncExternalStore(
  subscribe,
  () => ({ width: window.innerWidth, height: window.innerHeight }) // 每次创建新对象！
);

// 修正：缓存结果
let cachedSize = null;
let cachedWidth = -1;
let cachedHeight = -1;

function getSizeSnapshot() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width !== cachedWidth || height !== cachedHeight) {
    cachedWidth = width;
    cachedHeight = height;
    cachedSize = { width, height };
  }
  return cachedSize;
}

const size = useSyncExternalStore(subscribe, getSizeSnapshot);
```

## 3.4 三种状态管理 Hook 对比

| 特性 | useState | useReducer | useSyncExternalStore |
|------|----------|------------|---------------------|
| **适用场景** | 简单独立状态 | 复杂状态逻辑 | 外部状态订阅 |
| **状态来源** | React 内部 | React 内部 | React 外部 |
| **更新方式** | setter 函数 | dispatch + reducer | 外部修改 |
| **并发安全** | 自动安全 | 自动安全 | 通过快照机制保证 |
| **初始化** | 值或惰性函数 | 值或惰性函数 | getSnapshot |
| **中间件** | 不支持 | 可扩展 | 不支持 |
| **DevTools** | 支持 | 支持（action 追踪） | 依赖外部工具 |
| **SSR 支持** | 自动 | 自动 | 需要 getServerSnapshot |

## 3.5 小结

本章系统讲解了 React 的三个状态管理 Hook：

1. **useState**：最简单的状态管理工具。掌握函数式更新和惰性初始化是核心要点，理解对象状态的非合并行为和批处理机制是避免常见陷阱的关键。

2. **useReducer**：复杂状态管理的利器。将状态转换逻辑从组件中解耦为纯函数 reducer，使逻辑可测试、可复用。结合 useContext，可以构建轻量级的全局状态方案，无需 Redux。

3. **useSyncExternalStore**：连接 React 与外部世界的桥梁。确保并发模式下数据一致性，避免撕裂问题。适用于浏览器 API、第三方状态管理库以及自定义外部存储的订阅。

选择状态管理 Hook 的决策路径：

```
需要管理状态？
├── 状态来源在 React 外部？ → useSyncExternalStore
├── 简单独立状态？ → useState
├── 复杂逻辑/多值依赖？ → useReducer
└── 需要全局共享？ → useReducer + useContext
```

下一章将深入副作用管理 Hooks，系统讲解 `useEffect`、`useLayoutEffect` 和 `useInsertionEffect` 的使用与最佳实践。