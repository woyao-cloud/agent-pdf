# 第7章 React/Vue 组件类型安全

## 概述

现代前端开发中，TypeScript 与 React、Vue 等框架的结合已成为行业标准。类型安全不仅能在编译期捕获错误，还能提供更好的 IDE 智能提示和代码补全体验。本章将深入探讨如何在 React 和 Vue 组件中实现全面的类型安全，涵盖泛型组件、Hooks 类型推断、高阶组件类型包装等核心主题。

---

## 模块一：React 组件的基础类型

### 1.1 函数组件的类型标注

React 函数组件最基本的类型标注方式如下：

```tsx
// 使用 React.FC 泛型类型
import React from 'react';

interface GreetingProps {
  name: string;
  age?: number;
}

const Greeting: React.FC<GreetingProps> = ({ name, age }) => {
  return <div>Hello, {name}! {age && `You are ${age} years old.`}</div>;
};
```

`React.FC<P>` 是一个预定义的类型别名，它自动包含了 `children` 属性的定义。然而，在 React 18 中，`React.FC` 已经移除了对 `children` 的隐式包含，这使得它与直接标注返回类型的方式更加一致。

### 1.2 直接标注 Props 类型

另一种更推荐的方式是直接解构 Props 并标注类型：

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

function Button({ label, onClick, disabled = false, variant = 'primary' }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {label}
    </button>
  );
}
```

这种方式更加直观，且不依赖 `React.FC` 的隐式行为，是当前社区的主流实践。

### 1.3 事件处理器的类型

React 合成事件（SyntheticEvent）的类型需要与具体的 DOM 元素匹配：

```tsx
function InputField() {
  const [value, setValue] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Submitted:', value);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" value={value} onChange={handleChange} />
      <button type="submit">Submit</button>
    </form>
  );
}
```

常见的事件类型包括：
- `React.ChangeEvent<HTMLInputElement>` — 输入框变化事件
- `React.FormEvent<HTMLFormElement>` — 表单提交事件
- `React.MouseEvent<HTMLButtonElement>` — 鼠标点击事件
- `React.KeyboardEvent<HTMLInputElement>` — 键盘事件

---

## 模块二：泛型组件

### 2.1 为什么需要泛型组件

当组件需要处理多种数据类型，且希望保持类型安全时，泛型组件是最佳选择。例如，一个列表组件应该能够接受任意类型的 items，同时保持对 item 属性的类型推断。

### 2.2 泛型组件的定义

```tsx
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

export function List<T>({ items, renderItem, keyExtractor, emptyMessage }: ListProps<T>) {
  if (items.length === 0) {
    return <div>{emptyMessage ?? 'No items'}</div>;
  }
  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>{renderItem(item, index)}</li>
      ))}
    </ul>
  );
}
```

### 2.3 泛型组件的使用

```tsx
// 类型自动推断
const items = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
];

<List
  items={items}
  keyExtractor={item => item.id}       // item 类型自动推断为 { id: string; name: string; email: string }
  renderItem={item => <span>{item.name}</span>}
/>
```

TypeScript 会根据传入的 `items` 自动推断泛型参数 `T` 的类型，从而确保 `renderItem` 和 `keyExtractor` 的参数类型一致。

### 2.4 泛型约束

有时需要对泛型参数施加约束，确保传入的数据满足特定结构：

```tsx
interface Identifiable {
  id: string;
}

function ListWithId<T extends Identifiable>({ items }: { items: T[] }) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{JSON.stringify(item)}</li>
      ))}
    </ul>
  );
}
```

通过 `T extends Identifiable`，我们要求传入的 items 必须包含 `id: string` 属性，否则 TypeScript 会报错。

---

## 模块三：Hooks 类型推断

### 3.1 useState 的类型推断

`useState` 是最常用的 React Hook，TypeScript 能够根据初始值自动推断状态类型：

```tsx
const [count, setCount] = useState(0);        // count: number
const [name, setName] = useState('');          // name: string
const [isActive, setIsActive] = useState(true); // isActive: boolean
```

当初始值为 `null` 或需要联合类型时，需要显式标注泛型参数：

```tsx
const [user, setUser] = useState<User | null>(null);
const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
```

### 3.2 useReducer 的类型安全

`useReducer` 适合管理复杂状态，结合 TypeScript 的联合类型可以实现精确的状态转换控制：

```tsx
type Action =
  | { type: 'increment'; payload: number }
  | { type: 'decrement'; payload: number }
  | { type: 'reset' };

interface State {
  count: number;
  lastAction: string;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment':
      return { count: state.count + action.payload, lastAction: 'increment' };
    case 'decrement':
      return { count: state.count - action.payload, lastAction: 'decrement' };
    case 'reset':
      return { count: 0, lastAction: 'reset' };
    default:
      return state;
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0, lastAction: 'none' });

  // dispatch 的类型被精确推断为 (action: Action) => void
  dispatch({ type: 'increment', payload: 1 });  // OK
  // dispatch({ type: 'increment', payload: '1' }); // Error: 类型不匹配
}
```

### 3.3 自定义 Hooks 的类型设计

自定义 Hook 的返回值类型应当精确且易于使用：

```tsx
interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useApi<T>(fetcher: () => Promise<T>): UseApiResult<T> {
  const [state, setState] = useState<UseApiResult<T>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch(error => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => { cancelled = true; };
  }, [fetcher]);

  return state;
}
```

使用示例：

```tsx
interface User {
  id: number;
  name: string;
  email: string;
}

function UserProfile({ userId }: { userId: number }) {
  const { data: user, loading, error } = useApi<User>(() =>
    fetch(`/api/users/${userId}`).then(res => res.json())
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{user?.name}</div>;
}
```

### 3.4 泛型 Hook 的最佳实践

设计泛型 Hook 时，应遵循以下原则：

1. **泛型参数应出现在参数或返回值中**，否则 TypeScript 无法推断
2. **返回值类型应精确描述所有可能的状态**，包括 loading、error 和 data
3. **考虑使用 discriminated union 替代多字段对象**，使状态互斥

```tsx
// 使用 discriminated union 改进状态管理
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });

  useEffect(() => {
    setState({ status: 'loading' });
    fn().then(
      data => setState({ status: 'success', data }),
      error => setState({ status: 'error', error })
    );
  }, [fn]);

  return state;
}
```

---

## 模块四：高阶组件（HOC）类型包装

### 4.1 HOC 的基本类型

高阶组件是一个接受组件并返回新组件的函数。类型安全的关键在于正确传递 Props 类型：

```tsx
interface WithLoadingProps {
  loading: boolean;
}

function withLoading<P extends object>(
  Component: React.ComponentType<P & WithLoadingProps>
): React.FC<P & WithLoadingProps> {
  return ({ loading, ...props }) => {
    if (loading) return <div>Loading...</div>;
    return <Component loading={loading} {...(props as P)} />;
  };
}
```

### 4.2 注入 Props 的 HOC

当 HOC 向被包装组件注入额外的 Props 时，需要从最终的 Props 类型中排除注入的 Props：

```tsx
interface InjectedProps {
  timestamp: number;
}

function withTimestamp<P extends InjectedProps>(
  Component: React.ComponentType<P>
): React.FC<Omit<P, keyof InjectedProps>> {
  return (props) => {
    const timestamp = Date.now();
    return <Component {...(props as P)} timestamp={timestamp} />;
  };
}
```

`Omit<P, keyof InjectedProps>` 确保调用者不需要传递 `timestamp` 属性，而组件内部可以正常使用。

### 4.3 条件 Props 的 HOC

更复杂的 HOC 可能需要根据条件改变 Props 类型：

```tsx
type WithAuthProps<T extends boolean> = T extends true
  ? { user: { id: string; name: string } }
  : {};

function withAuth<T extends boolean = false>(
  required: T
): <P extends object>(
  Component: React.ComponentType<P & WithAuthProps<T>>
) => React.FC<P & WithAuthProps<T>> {
  return (Component) => {
    return (props) => {
      if (required) {
        const user = { id: '1', name: 'Alice' };
        return <Component {...(props as P)} user={user} />;
      }
      return <Component {...(props as P)} />;
    };
  };
}
```

---

## 模块五：Render Props 与类型安全

### 5.1 Render Props 模式

Render Props 是一种通过函数 prop 共享代码的模式，类型安全的关键在于正确标注函数参数类型：

```tsx
interface MouseTrackerProps {
  render: (position: { x: number; y: number }) => React.ReactNode;
}

function MouseTracker({ render }: MouseTrackerProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
  };

  return <div onMouseMove={handleMouseMove}>{render(position)}</div>;
}
```

### 5.2 泛型 Render Props

当 Render Props 需要处理多种数据类型时，泛型同样适用：

```tsx
interface DataProviderProps<T> {
  fetcher: () => Promise<T>;
  children: (result: { data: T | null; loading: boolean; error: Error | null }) => React.ReactNode;
}

function DataProvider<T>({ fetcher, children }: DataProviderProps<T>) {
  const result = useApi(fetcher);
  return <>{children(result)}</>;
}
```

---

## 模块六：Vue 3 组合式 API 的类型安全

### 6.1 defineComponent 的类型推断

Vue 3 的 `defineComponent` 提供了完善的类型推断支持：

```typescript
import { defineComponent, PropType, ref, computed } from 'vue';

interface User {
  id: number;
  name: string;
}

const UserCard = defineComponent({
  name: 'UserCard',
  props: {
    user: {
      type: Object as PropType<User>,
      required: true,
    },
    role: {
      type: String as PropType<'admin' | 'user' | 'guest'>,
      default: 'user',
    },
  },
  emits: {
    'update': (user: User) => true,
  },
  setup(props, { emit }) {
    const greeting = computed(() => `Hello, ${props.user.name}`);
    const handleClick = () => {
      emit('update', props.user);
    };
    return { greeting, handleClick };
  },
});
```

### 6.2 ref 和 reactive 的类型标注

```typescript
import { ref, reactive, Ref } from 'vue';

// 自动推断
const count = ref(0);           // Ref<number>
const name = ref('');            // Ref<string>

// 显式标注
const user = ref<User | null>(null);  // Ref<User | null>

// reactive 的类型推断
const state = reactive({
  count: 0,
  name: '',
});  // { count: number; name: string }
```

### 6.3 组合式函数的类型设计

```typescript
interface UseCounterOptions {
  initial?: number;
  step?: number;
}

function useCounter(options: UseCounterOptions = {}) {
  const { initial = 0, step = 1 } = options;
  const count = ref(initial);

  const increment = () => { count.value += step; };
  const decrement = () => { count.value -= step; };
  const reset = () => { count.value = initial; };

  return { count: readonly(count), increment, decrement, reset };
}
```

---

## 模块七：高级类型模式

### 7.1 组件 Props 的联合与交叉类型

```tsx
// 联合类型 Props
type ButtonProps =
  | { variant: 'primary'; primaryColor: string }
  | { variant: 'secondary'; secondaryColor: string };

function Button(props: ButtonProps) {
  // 通过类型收窄访问特定属性
  if (props.variant === 'primary') {
    return <button style={{ background: props.primaryColor }}>Primary</button>;
  }
  return <button style={{ background: props.secondaryColor }}>Secondary</button>;
}
```

### 7.2 条件类型与组件 Props

```tsx
type InputProps<T extends 'text' | 'number'> = {
  type: T;
  value: T extends 'number' ? number : string;
  onChange: (value: T extends 'number' ? number : string) => void;
};

function TypedInput<T extends 'text' | 'number'>(props: InputProps<T>) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = props.type === 'number'
      ? Number(e.target.value)
      : e.target.value;
    (props.onChange as (value: string | number) => void)(val);
  };

  return <input type={props.type} value={String(props.value)} onChange={handleChange} />;
}
```

### 7.3 多态组件与 as prop

多态组件允许调用者指定渲染的 HTML 标签或自定义组件：

```tsx
type PolymorphicProps<
  T extends React.ElementType,
  P = {}
> = {
  as?: T;
  children?: React.ReactNode;
} & P &
  Omit<React.ComponentPropsWithoutRef<T>, keyof (P & { as?: T; children?: React.ReactNode })>;

function Box<T extends React.ElementType = 'div'>({
  as,
  children,
  ...props
}: PolymorphicProps<T>) {
  const Component = as || 'div';
  return <Component {...props}>{children}</Component>;
}

// 使用示例
<Box as="section" id="main">Content</Box>
<Box as="a" href="/home">Home</Box>
```

---

## 模块八：测试与类型验证

### 8.1 运行时测试

使用 `@testing-library/react` 进行组件渲染测试：

```tsx
import { render, screen } from '@testing-library/react';
import { List } from '../src/components/List';

describe('List', () => {
  const items = [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ];

  it('should render all items', () => {
    render(
      <List
        items={items}
        keyExtractor={item => item.id}
        renderItem={item => <span>{item.name}</span>}
      />
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('should show empty message when no items', () => {
    render(
      <List
        items={[]}
        keyExtractor={item => item.id}
        renderItem={item => <span>{item.name}</span>}
        emptyMessage="Nothing here"
      />
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});
```

### 8.2 编译期类型验证

使用 `expect-type` 库在编译期验证类型推断是否正确：

```typescript
import { expectTypeOf } from 'expect-type';

it('should infer item type from props', () => {
  type Item = { id: string; name: string };
  expectTypeOf<Item>().toHaveProperty('id');
  expectTypeOf<Item>().toHaveProperty('name');
});

it('should have correct useApi return type', () => {
  type Result = { data: { id: number } | null; loading: boolean; error: Error | null };
  expectTypeOf<Result>().toMatchTypeOf<{ loading: boolean }>();
});
```

### 8.3 类型测试策略

完整的类型安全测试策略应包括：

1. **编译检查**：通过 `tsc --noEmit` 确保代码无类型错误
2. **类型断言**：使用 `expect-type` 验证泛型推断结果
3. **运行时测试**：通过组件渲染测试验证运行时行为
4. **边界情况**：测试空数据、错误状态、边缘条件

---

## 总结

本章深入探讨了 React 和 Vue 组件类型安全的各个方面：

- **React 组件基础类型**：函数组件、Props 类型、事件处理器的正确标注
- **泛型组件**：通过泛型参数实现组件的类型复用和自动推断
- **Hooks 类型推断**：useState、useReducer 和自定义 Hook 的类型设计
- **高阶组件类型包装**：HOC 的 Props 注入、条件类型和类型排除
- **Render Props 模式**：泛型 Render Props 的类型安全
- **Vue 3 组合式 API**：defineComponent、ref、reactive 的类型标注
- **高级类型模式**：联合/交叉类型、条件类型、多态组件
- **测试与验证**：运行时测试和编译期类型验证

类型安全是大型前端项目的基石。通过合理运用 TypeScript 的类型系统，可以在编译期捕获大量潜在错误，提升代码的可维护性和开发效率。在实际项目中，建议从简单的 Props 类型标注开始，逐步引入泛型组件和自定义 Hook 的类型设计，最终建立完整的类型安全体系。

## 参考资源

- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [Vue 3 TypeScript Guide](https://vuejs.org/guide/typescript/overview.html)
- [TypeScript Handbook: Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/)
- [expect-type](https://github.com/mmkal/expect-type)
