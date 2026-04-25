# 第五章：性能优化 Hooks

React 的默认行为是：父组件重新渲染时，所有子组件也会重新渲染。在大多数情况下这是合理的，但当组件树变得庞大或计算变得昂贵时，就需要性能优化 Hooks 来减少不必要的计算和渲染。

本章将介绍 React 提供的性能优化工具：`useMemo`、`useCallback`、`React.memo`、`useTransition` 和 `useDeferredValue`。每个工具都有明确的适用场景，过早或不当的优化反而会增加复杂度。

---

## 5.1 useMemo

`useMemo` 用于缓存（记忆化）昂贵的计算结果。当依赖项没有变化时，React 会跳过计算，直接返回上一次的结果。

### 5.1.1 基本语法

```jsx
const memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);
```

- 第一个参数：计算函数，返回需要缓存的值
- 第二个参数：依赖数组，仅在依赖变化时重新计算

### 5.1.2 何时使用

`useMemo` 应该用于以下三种场景：

#### 场景一：昂贵的计算

当计算确实耗时，缓存结果可以避免每次渲染都重复计算：

```jsx
function ProductDashboard({ products, filterText, sortBy }) {
  // 过滤和排序可能涉及大量数据
  const filteredProducts = useMemo(() => {
    console.log('执行过滤和排序...'); // 只在依赖变化时打印
    return products
      .filter(p => p.name.includes(filterText))
      .sort((a, b) => {
        if (sortBy === 'price') return a.price - b.price;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return a.id - b.id;
      });
  }, [products, filterText, sortBy]);

  return (
    <ul>
      {filteredProducts.map(product => (
        <li key={product.id}>{product.name} - ¥{product.price}</li>
      ))}
    </ul>
  );
}
```

#### 场景二：创建派生状态对象

当需要基于 props 或 state 创建新对象，且该对象会被作为其他 Hook 的依赖或传递给子组件时：

```jsx
function Chart({ data, width, height }) {
  const chartConfig = useMemo(() => ({
    type: 'bar',
    data,
    options: {
      responsive: true,
      width,
      height,
      plugins: {
        legend: { display: true }
      }
    }
  }), [data, width, height]);

  // chartConfig 作为依赖传递给其他 Hook
  useEffect(() => {
    renderChart(chartConfig);
  }, [chartConfig]);

  return <canvas ref={canvasRef} />;
}
```

#### 场景三：防止子组件不必要的重渲染

当传递给子组件的引用类型（对象、数组、函数）每次渲染都创建新实例时：

```jsx
function Parent({ items }) {
  // 没有 useMemo：每次渲染都创建新数组，子组件即使 memo 也会重渲染
  const sortedItems = items.filter(i => i.active).sort((a, b) => a.id - b.id);

  // 使用 useMemo：只在 items 变化时重新计算
  const memoizedItems = useMemo(
    () => items.filter(i => i.active).sort((a, b) => a.id - b.id),
    [items]
  );

  return <ItemList items={memoizedItems} />;
}
```

### 5.1.3 何时不使用

过度使用 `useMemo` 反而会降低性能，因为 `useMemo` 本身也有开销（依赖比较、闭包创建）：

```jsx
// 不需要 useMemo：简单计算比缓存开销更小
const fullName = `${firstName} ${lastName}`; // 直接计算即可

// 不需要 useMemo：原始值每次渲染本身就相等
const count = 42; // 数字是原始值，比较成本为零

// 不需要 useMemo：创建成本极低的对象
const style = { color: 'red' }; // 创建成本远低于 useMemo 的开销

// 需要 useMemo：昂贵计算
const primeNumbers = useMemo(
  () => findPrimesUpTo(largeNumber), // 可能需要几百毫秒
  [largeNumber]
);
```

**判断原则**：如果计算结果可以直接用原始值或简单表达式得到，就不需要 `useMemo`。

### 5.1.4 依赖数组行为

`useMemo` 使用 `Object.is` 比较依赖项：

```jsx
function Example({ items, config }) {
  // Object.is 比较：
  // 原始值：值相等即为相同 → 1 === 1, 'hello' === 'hello'
  // 引用值：引用相同即为相同 → [] !== [] (新数组), obj === obj (同一对象)

  // 每次渲染 items 是同一引用：不会重新计算
  const result = useMemo(() => processItems(items), [items]);

  // 每次渲染创建新对象：config 每次都不同，useMemo 无效
  // <Example config={{ theme: 'dark' }} /> → 每次 config 都是新对象
}
```

---

## 5.2 useCallback

`useCallback` 用于缓存函数引用。它与 `useMemo` 密切相关：

```jsx
// useCallback 是 useMemo 的语法糖
const memoizedCallback = useCallback(() => doSomething(a, b), [a, b]);

// 等价于
const memoizedCallback = useMemo(() => () => doSomething(a, b), [a, b]);
```

### 5.2.1 基本语法

```jsx
const memoizedFn = useCallback(
  (param) => {
    doSomething(param, dependency);
  },
  [dependency]
);
```

### 5.2.2 与 React.memo 配合

`useCallback` 最常见的用途是与 `React.memo` 配合，防止子组件因为接收到了新的函数引用而不必要地重渲染：

```jsx
import { memo, useCallback, useState } from 'react';

// 子组件用 memo 包裹，仅当 props 变化时重渲染
const ListItem = memo(({ item, onDelete, onUpdate }) => {
  console.log(`ListItem "${item.name}" 渲染`);
  return (
    <div>
      <span>{item.name}</span>
      <button onClick={() => onDelete(item.id)}>删除</button>
      <button onClick={() => onUpdate(item.id, { done: !item.done })}>
        {item.done ? '取消完成' : '标记完成'}
      </button>
    </div>
  );
});

function TodoList({ items }) {
  const [list, setList] = useState(items);

  // 不用 useCallback：每次渲染都创建新函数 → ListItem 的 memo 失效
  // const handleDelete = (id) => { ... };

  // 使用 useCallback：函数引用稳定 → ListItem 的 memo 生效
  const handleDelete = useCallback((id) => {
    setList(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleUpdate = useCallback((id, updates) => {
    setList(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  }, []);

  return (
    <div>
      {list.map(item => (
        <ListItem
          key={item.id}
          item={item}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
}
```

### 5.2.3 何时使用

| 场景 | 是否需要 useCallback |
|------|---------------------|
| 传递给 `React.memo` 包裹的子组件 | 是 |
| 作为 `useEffect` 的依赖 | 是 |
| 仅在组件内部使用 | 否 |
| 传递给原生 DOM 元素（如 `<button onClick>`） | 否 |
| 子组件没有被 `memo` 包裹 | 否 |

```jsx
function SearchBox({ onSearch }) {
  const [query, setQuery] = useState('');

  // 作为 useEffect 的依赖 → 需要 useCallback
  const handleSearch = useCallback(() => {
    onSearch(query);
  }, [query, onSearch]);

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [handleSearch]);

  // 仅在组件内部使用 → 不需要 useCallback
  const handleChange = (e) => {
    setQuery(e.target.value);
  };

  return (
    <div>
      {/* 原生元素，不需要 useCallback */}
      <input value={query} onChange={handleChange} />
    </div>
  );
}
```

### 5.2.4 何时不使用

```jsx
// 不需要：传递给原生 DOM 元素
<button onClick={() => setCount(c => c + 1)}>点击</button>
// 原生元素不使用 memo，新函数引用没有额外开销

// 不需要：子组件没有 memo
function Parent() {
  // Child 没有 memo，即使 handleClick 是新引用也无所谓
  const handleClick = () => console.log('clicked');
  return <Child onClick={handleClick} />;
}

// 不需要：简单场景下为每个回调都加 useCallback
// 这增加了代码复杂度但没有性能收益
```

---

## 5.3 React.memo

`React.memo` 是一个高阶组件，用于对组件的渲染结果进行记忆化。当 props 没有变化时，跳过重渲染。

### 5.3.1 基本用法

```jsx
const MemoizedComponent = memo(function Component({ name, age }) {
  console.log(`${name} 渲染`);
  return <div>{name}, {age}岁</div>);
});
```

`React.memo` 对 props 进行浅比较（`Object.is`）。如果所有 props 都与上次相同，组件不会重新渲染。

### 5.3.2 自定义比较函数

当浅比较不够用（例如嵌套对象），可以传入自定义比较函数：

```jsx
const arePropsEqual = (prevProps, nextProps) => {
  // 返回 true 表示 props 相等，跳过渲染
  // 返回 false 表示 props 不同，需要渲染
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.status === nextProps.item.status
  );
};

const MemoizedListItem = memo(function ListItem({ item, onSelect }) {
  return <div onClick={() => onSelect(item.id)}>{item.name}</div>;
}, arePropsEqual);
```

> **警告**：自定义比较函数需要非常小心，如果遗漏了某个 prop 的比较，组件可能不会在应该更新时更新，导致 UI 与数据不一致。

### 5.3.3 memo 的局限

```jsx
// 问题：传递内联对象/数组 → 每次渲染都是新引用 → memo 失效
<MemoizedComponent
  config={{ theme: 'dark' }}   // 每次新对象
  items={[1, 2, 3]}            // 每次新数组
  onClick={() => {}}            // 每次新函数
/>

// 解决方案：使用 useMemo 和 useCallback
const config = useMemo(() => ({ theme: 'dark' }), []);
const items = useMemo(() => [1, 2, 3], []);
const handleClick = useCallback(() => {}, []);

<MemoizedComponent config={config} items={items} onClick={handleClick} />
```

### 5.3.4 何时使用 memo

| 适用场景 | 原因 |
|---------|------|
| 列表中的子项组件 | 列表通常有很多项，memo 可以避免单项变化导致全列表重渲染 |
| 渲染成本高的组件 | 复杂计算、大量 DOM 节点的组件 |
| 经常重渲染的父组件中的纯子组件 | 父组件频繁更新但子组件的 props 不常变化 |
| 接收事件回调的组件 | 配合 useCallback 保持回调引用稳定 |

| 不适用场景 | 原因 |
|---------|------|
| 简单组件 | memo 本身的比较开销可能大于渲染开销 |
| props 经常变化的组件 | memo 的比较总是失败，白白增加了开销 |
| 组件使用了 context | context 变化时 memo 无法阻止重渲染 |

```jsx
// 适合 memo：列表子项
const UserCard = memo(function UserCard({ user, onSelect }) {
  return (
    <div onClick={() => onSelect(user.id)}>
      <img src={user.avatar} alt={user.name} />
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
});

function UserList({ users }) {
  const [selectedId, setSelectedId] = useState(null);
  const handleSelect = useCallback((id) => setSelectedId(id), []);

  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} onSelect={handleSelect} />
      ))}
    </div>
  );
}
```

---

## 5.4 useTransition

`useTransition` 是 React 18 引入的 Hook，它让你能够将状态更新标记为**非紧急**（可中断），从而保持 UI 的响应性。

### 5.4.1 问题背景

默认情况下，所有状态更新都是紧急的。当用户输入时触发了一个昂贵的计算（如搜索过滤大列表），输入会变得卡顿：

```jsx
// 问题：每次输入都触发昂贵计算，导致输入卡顿
function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(allItems);

  const handleChange = (e) => {
    setQuery(e.target.value);
    // 昂贵计算阻塞了输入
    setResults(allItems.filter(item =>
      item.name.toLowerCase().includes(e.target.value.toLowerCase())
    ));
  };

  return (
    <div>
      <input value={query} onChange={handleChange} />
      <ResultList results={results} /> {/* 大列表渲染 */}
    </div>
  );
}
```

### 5.4.2 基本语法

```jsx
const [isPending, startTransition] = useTransition();
```

- `isPending`：布尔值，表示是否有过渡更新正在进行
- `startTransition`：函数，接收一个回调，其中的状态更新被标记为非紧急

### 5.4.3 使用示例

#### 搜索输入与结果

```jsx
import { useState, useTransition } from 'react';

function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(allItems);
  const [isPending, startTransition] = useTransition();

  const handleChange = (e) => {
    // 紧急更新：立即更新输入框
    setQuery(e.target.value);

    // 非紧急更新：搜索结果可以延迟
    startTransition(() => {
      setResults(
        allItems.filter(item =>
          item.name.toLowerCase().includes(e.target.value.toLowerCase())
        )
      );
    });
  };

  return (
    <div>
      <input value={query} onChange={handleChange} placeholder="搜索..." />
      {isPending && <p>加载中...</p>}
      <ResultList results={results} />
    </div>
  );
}
```

当用户快速输入时，React 会：
1. 立即更新输入框（紧急更新）
2. 开始渲染搜索结果（过渡更新）
3. 如果用户继续输入，**中断**当前渲染，重新开始
4. 最终显示最后一次输入的结果

#### 标签页切换

```jsx
import { useState, useTransition } from 'react';

function TabContainer() {
  const [activeTab, setActiveTab] = useState('home');
  const [isPending, startTransition] = useTransition();

  const handleTabChange = (tab) => {
    // 标签高亮状态立即更新
    setActiveTab(tab);

    // 标签页内容作为过渡更新
    startTransition(() => {
      setActiveTab(tab);
    });
  };

  return (
    <div>
      <nav>
        {['home', 'profile', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={{
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              opacity: isPending && activeTab !== tab ? 0.7 : 1
            }}
          >
            {tab}
          </button>
        ))}
      </nav>
      <div style={{ opacity: isPending ? 0.7 : 1 }}>
        <TabContent tab={activeTab} />
      </div>
    </div>
  );
}
```

### 5.4.4 与 setTimeout 和 debounce 的区别

| 特性 | useTransition | setTimeout | debounce |
|------|-------------|-----------|----------|
| 更新方式 | 可中断的 React 更新 | 延迟执行 | 延迟执行 |
| UI 响应性 | 保持响应，可中断 | 延迟期间不响应 | 等待静默后执行 |
| 最新结果保证 | 始终显示最新结果 | 可能显示过时结果 | 显示最终结果 |
| React 集成 | 原生并发支持 | 无 | 无 |
| 适用场景 | 昂贵渲染的非紧急更新 | 定时任务 | 限制事件频率 |

```jsx
// setTimeout 方案：固定延迟，无法中断
const handleChange = (e) => {
  setQuery(e.target.value);
  setTimeout(() => {
    setResults(filterItems(e.target.value));
  }, 300);
};

// debounce 方案：等待静默后执行
const debouncedSearch = debounce((query) => {
  setResults(filterItems(query));
}, 300);

// useTransition 方案：立即响应输入，后台更新结果，始终显示最新
const handleChange = (e) => {
  setQuery(e.target.value);
  startTransition(() => {
    setResults(filterItems(e.target.value));
  });
};
```

### 5.4.5 使用原则

- **紧急更新**（输入框、按钮点击、下拉选择）不要放入 `startTransition`
- **非紧急更新**（搜索结果、列表过滤、标签页内容）放入 `startTransition`
- `isPending` 可以用来显示加载指示器，提升用户体验

---

## 5.5 useDeferredValue

`useDeferredValue` 让你推迟渲染某部分 UI，与 `useTransition` 类似，但适用于不同的场景。

### 5.5.1 基本语法

```jsx
const deferredValue = useDeferredValue(value);
```

它返回一个"延迟版"的值——在紧急更新期间，这个值保持旧值；当 UI 空闲时，它才会更新为新值。

### 5.5.2 使用示例

#### 搜索结果延迟渲染

```jsx
import { useState, useDeferredValue } from 'react';

function SearchPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  // 使用延迟值来渲染结果列表
  const results = useMemo(
    () => filterItems(deferredQuery),
    [deferredQuery]
  );

  return (
    <div>
      {/* 输入框使用即时值，保持响应 */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索..."
      />
      {/* 结果列表使用延迟值，不阻塞输入 */}
      <ResultList results={results} />
    </div>
  );
}
```

### 5.5.3 useTransition 与 useDeferredValue 的区别

这两个 Hook 解决的是同一个问题（保持 UI 响应性），但 API 风格不同：

| 特性 | useTransition | useDeferredValue |
|------|-------------|-----------------|
| 控制方式 | 主动包装状态更新 | 被动延迟某个值 |
| 适用场景 | 你控制状态更新的代码 | 你无法控制状态更新的代码 |
| 状态更新控制 | 可以在 `startTransition` 内选择哪些更新是过渡性的 | 无法选择，整个值的更新被延迟 |
| 加载状态 | 提供 `isPending` | 需要自己比较 `value !== deferredValue` |
| 典型场景 | 标签页切换、搜索触发 | 搜索输入框、来自 props 的数据 |

```jsx
// useTransition：你控制状态更新 → 主动标记
function TabSwitcher() {
  const [tab, setTab] = useState('home');
  const [isPending, startTransition] = useTransition();

  const switchTab = (newTab) => {
    startTransition(() => {
      setTab(newTab); // 主动将此更新标记为过渡性
    });
  };

  return <div>{isPending ? '加载中...' : <Content tab={tab} />}</div>;
}

// useDeferredValue：你无法控制状态更新 → 被动延迟
function SearchResults({ query }) {
  // query 来自 props，无法用 startTransition 包裹
  const deferredQuery = useDeferredValue(query);

  return <ExpensiveList query={deferredQuery} />;
}
```

### 5.5.4 完整示例：列表过滤

```jsx
import { useState, useDeferredValue, useMemo } from 'react';

const ITEMS = Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  name: `项目 ${i}`,
  category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
}));

function FilterableList() {
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);

  const filteredItems = useMemo(() => {
    return ITEMS.filter(item =>
      item.name.toLowerCase().includes(deferredSearchText.toLowerCase())
    );
  }, [deferredSearchText]);

  const isStale = searchText !== deferredSearchText;

  return (
    <div>
      <input
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="搜索项目..."
      />
      {isStale && <span>过滤中...</span>}
      <ul style={{ opacity: isStale ? 0.7 : 1 }}>
        {filteredItems.slice(0, 50).map(item => (
          <li key={item.id}>{item.name} - 类别 {item.category}</li>
        ))}
        {filteredItems.length > 50 && (
          <li>...还有 {filteredItems.length - 50} 个结果</li>
        )}
      </ul>
    </div>
  );
}
```

---

## 5.6 性能优化 Hooks 对比

| Hook | 记忆化内容 | 适用场景 | 关键特点 |
|------|-----------|---------|---------|
| `useMemo` | 计算值 | 昂贵计算、派生状态 | 依赖不变时跳过计算 |
| `useCallback` | 函数引用 | 回调传给 memo 子组件、作为 Effect 依赖 | 依赖不变时返回同一函数引用 |
| `React.memo` | 组件渲染结果 | 列表子项、纯展示组件 | props 不变时跳过渲染 |
| `useTransition` | 状态更新优先级 | 非紧急的状态更新 | 可中断、提供 `isPending` |
| `useDeferredValue` | 渲染值 | 延迟昂贵渲染 | 被动延迟、不阻塞紧急更新 |

### 选择流程

```
性能问题？
├── 计算耗时？
│   └── 是 → useMemo
├── 函数引用导致子组件重渲染？
│   └── 是 → useCallback + React.memo
├── 组件 props 不变但仍重渲染？
│   └── 是 → React.memo
├── 输入时 UI 卡顿？
│   ├── 你控制状态更新 → useTransition
│   └── 你不控制状态更新 → useDeferredValue
└── 没有实际性能问题？
    └── 不需要优化
```

---

## 5.7 小结

React 性能优化 Hooks 是精准工具，不是通用补丁。核心原则：

1. **先测量，后优化**：使用 React DevTools Profiler 找到真正的瓶颈
2. **`useMemo`** 缓存计算结果，只在计算确实昂贵时使用
3. **`useCallback`** 缓存函数引用，与 `React.memo` 配合使用
4. **`React.memo`** 缓存组件渲染，适用于纯展示组件和列表子项
5. **`useTransition`** 主动标记非紧急更新，保持输入响应性
6. **`useDeferredValue`** 被动延迟值的渲染，适用于无法控制状态更新的场景

过早优化是万恶之源。只在 React DevTools 中观察到实际性能问题时，才引入这些 Hooks。对于一个简单组件，渲染的开销远小于记忆化的开销。