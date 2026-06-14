# 第16章 TypeScript + React 实战

> 如果说 TypeScript 是给 JavaScript 戴上的"安全头盔"，那 React 就是前端开发的"乐高积木"。当两者相遇，我们得到了类型安全的组件系统——就像给每块乐高积木都印上了"只能拼在这里"的标记。

---

## 1. 核心概念

### 为什么需要 TypeScript + React？

React 的核心是**组件组合**——一个组件输出 Props，另一个组件消费这些 Props。如果没有类型系统，Props 的传递就像"盲人传话"：你永远不知道传丢了什么、传错了什么。

```
JavaScript 的 React 组件 → "随便传，运行才知道错"
TypeScript 的 React 组件 → "传错类型？编译时就告诉你"
```

### React.FC 的废弃之争

如果你翻看过老教程，一定会见到这样的写法：

```tsx
const MyComponent: React.FC<Props> = ({ name }) => <div>{name}</div>
```

但在 React 18 + TypeScript 5.x 中，**React.FC 已经不推荐使用了**。原因有三：

1. **隐式 children**：`React.FC` 默认给组件加上了 `children?: ReactNode`，这听起来方便，但实际造成了类型漏洞——你的组件可能本不该接收 children，但类型检查不会报错。

2. **泛型组件不友好**：`React.FC<Props>` 的写法让泛型组件的类型推导变得困难。

3. **返回类型限制**：`React.FC` 强制返回 `ReactElement | null`，但实际上函数组件可以返回 `ReactNode`（包括字符串、数字等）。

社区的主流实践现在改为**直接声明 Props 参数**：

```tsx
// ✅ 现在推荐：直接声明 Props
function MyComponent({ name }: Props) {
  return <div>{name}</div>
}
```

### Props 类型推导与事件处理

React 的类型系统为 JSX 提供了丰富的内置类型。核心原则是：**组件声明 Props 类型，事件处理函数使用 React 内置的事件类型**。

| 场景 | 类型 |
|---|---|
| 点击事件 | `React.MouseEventHandler<HTMLButtonElement>` |
| 表单提交 | `React.FormEventHandler<HTMLFormElement>` |
| 输入变化 | `React.ChangeEventHandler<HTMLInputElement>` |
| 键盘事件 | `React.KeyboardEventHandler<HTMLDivElement>` |

### 泛型组件

泛型组件是 React 类型系统中"威力最大"的部分。当你的组件需要根据传入的 Props 动态推导类型时（比如列表组件、选择器组件），就需要泛型。

想象泛型组件就像"智能调料机"——你放进什么食材，它就自动匹配相应的调料配方。

### Hooks 的类型最佳实践

React Hooks 的类型系统是"双向推导"的：

- **useState**：从初始值推导状态类型，但泛型参数可以覆盖推导
- **useRef**：最复杂——有 3 种重载，用于不同的场景
- **useReducer**：从 reducer 函数自动推导 dispatch 的类型
- **自定义 Hooks**：返回值的类型应该显式声明，输入参数的类型应该从参数推导

---

## 2. 典型问题与处理

### 问题 1：React.FC 中的隐式 children

```tsx
// ❌ Bad Code — 使用 React.FC，意外允许了 children
interface ButtonProps {
  label: string
  onClick: () => void
}

const Button: React.FC<ButtonProps> = ({ label, onClick }) => (
  <button onClick={onClick}>{label}</button>
)

// 以下代码不会报错，但 Button 组件根本没用到 children！
<Button label="Click" onClick={handleClick}>
  <span>这个 children 被吞掉了</span>
</Button>
```

**为什么不好？** `React.FC` 自动添加了 `children?: ReactNode`，这隐藏了一个 bug——调用方以为 children 会被渲染，但实际上被忽略了。TypeScript 本应捕获这类错误，但隐式 children 让类型检查"放行"了。

```tsx
// ✅ Good Code — 直接声明 Props
interface ButtonProps {
  label: string
  onClick: () => void
}

function Button({ label, onClick }: ButtonProps) {
  return <button onClick={onClick}>{label}</button>
}

// 现在 TypeScript 会报错：
// ❌ Property 'children' does not exist on type 'IntrinsicAttributes & ButtonProps'
<Button label="Click" onClick={handleClick}>
  <span>这会编译报错！</span>
</Button>
```

**为什么好？** 没有隐式 children，组件 Props 类型就是"诚实"的声明。调用方传了多余的 children，TypeScript 会立刻指出错误。

### 问题 2：useRef 的 3 种重载

```tsx
// ❌ Bad Code — 混淆 useRef 的用法
const Component = () => {
  // 问题：useRef(null) 的返回值类型是 MutableRefObject<null>
  // 但 ref 属性要求 RefObject<HTMLDivElement>
  const divRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    // 这里需要非空断言，因为类型是 MutableRefObject<HTMLDivElement | null>
    divRef.current?.focus()
  }, [])
  
  return <div ref={divRef}>Hello</div>
}
```

**为什么不好？** 这段代码看似"正确"，但 `useRef<HTMLDivElement>(null)` 的实际返回值类型是 `MutableRefObject<HTMLDivElement | null>`。当你把它传给 `ref` 属性时，React 的类型定义期望一个 `RefObject<HTMLDivElement>`（只读），这产生了类型不匹配。

```tsx
// ✅ Good Code — 正确使用 useRef 的 3 种重载

// 场景 1：DOM 引用（最常用）
// useRef<T>(null) 返回 RefObject<T>，current 是只读的
const divRef = useRef<HTMLDivElement>(null)

// 通过非空断言处理初始 null
function AutoFocusInput() {
  const inputRef = useRef<HTMLInputElement>(null!)
  
  useEffect(() => {
    // null! 保证了 ref.current 在 mount 后是非空的
    inputRef.current.focus()
  }, [])
  
  return <input ref={inputRef} />
}

// 场景 2：可变值（存储定时器 ID、前一个值等）
// 使用明确的初始值，返回 MutableRefObject<T>，current 可读写
const timerRef = useRef<number | undefined>(undefined)
timerRef.current = setTimeout(() => {}, 1000)  // ✅ 可写

// 场景 3：需要读写 DOM 引用的场景
// useRef<T | null>(null) 返回 MutableRefObject<T | null>
const canvasRef = useRef<HTMLCanvasElement | null>(null)

// 三种重载的返回值差异：
// useRef<T>(null)       → RefObject<T>              （只读，给 ref 属性）
// useRef<T>(initial)    → MutableRefObject<T>       （可读写，存值）
// useRef<T | null>(null)→ MutableRefObject<T | null>（可读写，DOM + 可变）
```

**为什么好？** 理解了 useRef 的 3 种重载，就能为不同场景选择正确的用法：
1. `useRef<T>(initialValue: T)` → `MutableRefObject<T>`（可读写，用于存储值）
2. `useRef<T>(initialValue: T | null)` → `MutableRefObject<T | null>`（可读写，初始为 null）
3. `useRef<T>(null)` → `RefObject<T>`（只读，用于 DOM 引用）

### 问题 3：事件处理函数的类型

```tsx
// ❌ Bad Code — 使用 any 类型
function Form() {
  const handleSubmit = (e: any) => {
    e.preventDefault()
    const data = new FormData(e.target) // ❌ e.target 类型是 any
  }
  
  const handleChange = (e: any) => {
    console.log(e.target.value) // ❌ 没有类型提示
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input onChange={handleChange} />
    </form>
  )
}
```

**为什么不好？** `any` 等于关闭了类型检查。`e.target` 没有智能提示，拼写错误（比如写成 `e.taarget`）不会被捕获，而且 refactor 时没有类型保障。

```tsx
// ✅ Good Code — 使用 React 内置事件类型
import { FormEvent, ChangeEvent } from 'react'

interface FormData {
  email: string
  password: string
}

function LoginForm() {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // e.target 类型为 HTMLFormElement，有智能提示
    const formData = new FormData(e.currentTarget)
    // e.currentTarget 是 HTMLFormElement（非空）
    // e.target 可能是 EventTarget（类型更宽泛）
  }
  
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // e.target.value 类型是 string，有完整的智能提示
    console.log(e.target.value)
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        name="email"
        type="email"
        onChange={handleChange}
      />
      <button type="submit">登录</button>
    </form>
  )
}
```

**为什么好？** 使用具体的事件类型，`e.target` 有了准确的 DOM 元素类型，编辑器可以提供属性补全、方法提示。`e.currentTarget` 更是保证了非空——因为事件处理函数中的 `currentTarget` 就是绑定事件的元素本身。

---

## 3. 示例代码

### 示例 1：泛型列表组件

```tsx
// generic-list.tsx
import { ReactNode } from 'react'

// 泛型组件：T 由传入的 items 类型自动推导
interface ListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  keyExtractor: (item: T) => string | number
  emptyMessage?: string
}

function List<T>({ items, renderItem, keyExtractor, emptyMessage = '暂无数据' }: ListProps<T>) {
  if (items.length === 0) {
    return <p className="empty">{emptyMessage}</p>
  }
  
  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>
          {renderItem(item, index)}
        </li>
      ))}
    </ul>
  )
}

// 使用示例：T 自动推导为 User
interface User {
  id: number
  name: string
  email: string
}

const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
]

function UserList() {
  return (
    <List
      items={users}
      keyExtractor={(user) => user.id}  // user 类型自动推导为 User
      renderItem={(user) => (            // user 类型自动推导为 User
        <div>
          <span>{user.name}</span>
          <span>{user.email}</span>
        </div>
      )}
    />
  )
}
```

### 示例 2：自定义 Hook 的类型设计

```tsx
// use-local-storage.ts
import { useState, useEffect, useCallback } from 'react'

// 自定义 Hook：类型安全的 localStorage
function useLocalStorage<T>(key: string, initialValue: T) {
  // 状态类型为 T
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })
  
  // setter 类型为 React.Dispatch<React.SetStateAction<T>>
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const valueToStore = value instanceof Function ? value(prev) : value
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
      return valueToStore
    })
  }, [key])
  
  // 返回值类型：[T, (value: T | ((prev: T) => T)) => void]
  return [storedValue, setValue] as const
}

// 使用示例
function Settings() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light')
  const [fontSize, setFontSize] = useLocalStorage<number>('font-size', 16)
  
  // theme 类型为 'light' | 'dark'
  // setTheme 只接受 'light' | 'dark'
  
  return (
    <div className={theme}>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        切换主题
      </button>
    </div>
  )
}
```

### 示例 3：useReducer 的类型安全

```tsx
// counter-reducer.tsx
import { useReducer } from 'react'

// 定义 Action 联合类型
type CounterAction =
  | { type: 'INCREMENT'; payload: number }
  | { type: 'DECREMENT'; payload: number }
  | { type: 'RESET' }
  | { type: 'SET'; payload: number }

interface CounterState {
  count: number
  lastAction: string
}

// reducer 函数的类型自动推导
function counterReducer(state: CounterState, action: CounterAction): CounterState {
  switch (action.type) {
    case 'INCREMENT':
      return { ...state, count: state.count + action.payload, lastAction: 'INCREMENT' }
    case 'DECREMENT':
      return { ...state, count: state.count - action.payload, lastAction: 'DECREMENT' }
    case 'RESET':
      return { count: 0, lastAction: 'RESET' }
    case 'SET':
      return { ...state, count: action.payload, lastAction: 'SET' }
    default:
      return state
  }
}

function Counter() {
  const [state, dispatch] = useReducer(counterReducer, { count: 0, lastAction: 'INIT' })
  
  // dispatch 类型自动推导为 React.Dispatch<CounterAction>
  // 这意味着：
  dispatch({ type: 'INCREMENT', payload: 1 })   // ✅ 正确
  dispatch({ type: 'RESET' })                    // ✅ 正确
  // dispatch({ type: 'INCREMENT' })             // ❌ 缺少 payload
  // dispatch({ type: 'DELETE' })                // ❌ 未知 action type
  
  return (
    <div>
      <p>计数: {state.count}</p>
      <p>上次操作: {state.lastAction}</p>
      <button onClick={() => dispatch({ type: 'INCREMENT', payload: 1 })}>+1</button>
      <button onClick={() => dispatch({ type: 'DECREMENT', payload: 1 })}>-1</button>
      <button onClick={() => dispatch({ type: 'RESET' })}>重置</button>
    </div>
  )
}
```

### 示例 4：高阶组件（HOC）的类型包装

```tsx
// with-logging.tsx
import { ComponentType, useEffect } from 'react'

// HOC：为组件添加日志功能
function withLogging<P>(WrappedComponent: ComponentType<P>, componentName: string) {
  // 返回的组件 Props 类型与传入组件一致
  return function WithLogging(props: P) {
    useEffect(() => {
      console.log(`${componentName} 挂载`)
      return () => console.log(`${componentName} 卸载`)
    }, [])
    
    useEffect(() => {
      console.log(`${componentName} 更新`, props)
    })
    
    return <WrappedComponent {...props} />
  }
}

// 使用示例
interface UserCardProps {
  name: string
  age: number
}

function UserCard({ name, age }: UserCardProps) {
  return <div>{name} ({age}岁)</div>
}

// UserCardWithLogging 的 Props 类型仍然是 UserCardProps
const UserCardWithLogging = withLogging(UserCard, 'UserCard')

function App() {
  return <UserCardWithLogging name="Alice" age={30} />
}
```

---

## 4. 配置/环境示例

### tsconfig.json 的 React 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

**配置说明：**

- `"jsx": "react-jsx"` — 使用 React 17+ 的 JSX transform（不再需要 `import React from 'react'`）
- `"jsxImportSource": "react"` — 明确 JSX 编译目标为 React
- `"moduleResolution": "bundler"` — 适配 Vite / Webpack 等打包工具
- `"isolatedModules": true` — 确保每个文件可独立编译（Vite 要求）

### 组件 Props 类型设计规范

```tsx
// 组件 Props 类型命名规范
// ✅ 推荐：ComponentNameProps
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost'
  size: 'sm' | 'md' | 'lg'
  disabled?: boolean
  children?: React.ReactNode
}

// ✅ 使用 Pick 从已有类型派生
interface User {
  id: number
  name: string
  email: string
  avatar: string
  role: 'admin' | 'user'
}

// UserCard 只需要 name 和 avatar
type UserCardProps = Pick<User, 'name' | 'avatar'>

// ✅ 使用 extends 扩展 HTML 元素属性
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  error?: string
  size?: 'sm' | 'md' | 'lg'  // 覆盖 HTML 的 size 属性
}
```

### ESLint 配置

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "rules": {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

---

## 5. 必须掌握的技能

### 基础知识

- [x] 理解为什么 React.FC 不再被推荐使用（隐式 children、泛型问题、返回类型限制）
- [x] 掌握 Props 的类型定义方式：interface 命名规范、可选 Props、默认值
- [x] 掌握 React 内置事件类型的正确使用（`ChangeEvent`、`FormEvent`、`MouseEvent` 等）

### 进阶技能

- [x] 能够设计泛型组件，让 Props 类型随传入数据自动推导
- [x] 理解 useRef 的 3 种重载及其适用场景
- [x] 掌握 useReducer 配合 Discriminated Union 的完整类型安全模式
- [x] 能够编写类型安全的自定义 Hooks，包括泛型参数和返回值类型

### 实战能力

- [x] 会配置 tsconfig.json 的 JSX 相关选项
- [x] 能够使用 `Omit`、`Pick`、`extends` 等工具组合 Props 类型
- [x] 理解组件 Props 与 HTML 原生属性之间的关系和类型映射
- [x] 能够写出类型安全的 HOC（高阶组件）和 Render Props 模式

### 一句话总结

> **React + TypeScript 的核心就是"用 Props 类型定义组件的 API 契约"——每个组件都有一份类型签名，就像函数的参数和返回值声明一样清晰。**

---

*下一章预告：第17章 TypeScript + Vue 3 实战——从 Option API 到 Composition API 的类型蜕变*
