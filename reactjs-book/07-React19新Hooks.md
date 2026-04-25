# 第七章：React 19 新 Hooks 深度解析

React 19 引入了一系列全新的 Hook，彻底改变了我们在 React 中处理表单、数据获取和异步操作的方式。本章将深入讲解四个最重要的新 Hook：`useActionState`、`useFormStatus`、`useOptimistic` 和 `use()`，并通过丰富的代码示例展示它们在实际项目中的最佳实践。

## 7.1 useActionState：表单状态管理的新范式

### 7.1.1 背景与动机

在 React 19 之前，处理表单状态是一项繁琐的工作。我们需要手动管理输入值、验证状态、提交状态、错误信息等多个状态变量，代码往往变得臃肿且难以维护。`useActionState`（在 React 19 RC 阶段曾名为 `useFormState`）正是为了解决这一问题而生。

`useActionState` 的核心思想是**将表单的异步操作与状态管理统一起来**，让开发者能够以声明式的方式处理表单提交、验证和状态更新。

### 7.1.2 基本用法

`useActionState` 的函数签名如下：

```typescript
const [state, formAction, isPending] = useActionState(
  action,        // 表单提交时执行的异步函数
  initialState,  // 状态的初始值
  permalink?     // 可选，用于 Server Actions 的永久链接
);
```

- **`action`**：一个异步函数，接收当前 state 和 FormData 作为参数，返回新的 state。
- **`initialState`**：状态的初始值。
- **`permalink`**：可选参数，用于 Next.js 等框架中的 Server Actions。
- **返回值**：`[state, formAction, isPending]`，分别代表当前状态、要传递给 `<form>` 的 action 函数、以及提交中的标志。

### 7.1.3 基础示例：用户注册表单

下面是一个完整的用户注册表单示例，展示了 `useActionState` 的核心用法：

```tsx
import { useActionState } from "react";

interface FormState {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
}

async function registerUser(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  "use server"; // 在 Next.js 中启用 Server Actions

  const username = formData.get("username") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // 模拟服务端验证
  const errors: Record<string, string[]> = {};

  if (!username || username.length < 3) {
    errors.username = ["用户名至少需要 3 个字符"];
  }

  if (!email || !email.includes("@")) {
    errors.email = ["请输入有效的邮箱地址"];
  }

  if (!password || password.length < 6) {
    errors.password = ["密码至少需要 6 个字符"];
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, message: "请修正表单错误", errors };
  }

  // 模拟 API 调用
  await new Promise((resolve) => setTimeout(resolve, 1500));

  return { success: true, message: "注册成功！" };
}

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerUser, {
    success: false,
    message: "",
  });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="username">用户名</label>
        <input
          id="username"
          name="username"
          type="text"
          disabled={isPending}
          className="border rounded px-3 py-2 w-full"
        />
        {state.errors?.username && (
          <p className="text-red-500 text-sm">{state.errors.username[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          name="email"
          type="email"
          disabled={isPending}
          className="border rounded px-3 py-2 w-full"
        />
        {state.errors?.email && (
          <p className="text-red-500 text-sm">{state.errors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password">密码</label>
        <input
          id="password"
          name="password"
          type="password"
          disabled={isPending}
          className="border rounded px-3 py-2 w-full"
        />
        {state.errors?.password && (
          <p className="text-red-500 text-sm">{state.errors.password[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {isPending ? "注册中..." : "注册"}
      </button>

      {state.message && (
        <p className={state.success ? "text-green-500" : "text-red-500"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
```

### 7.1.4 关键特性解析

1. **渐进式增强**：即使用户禁用了 JavaScript，表单仍然可以通过传统的表单提交方式工作（在 Server Actions 支持下）。

2. **自动管理 pending 状态**：不再需要手动设置 `isSubmitting` 状态变量，`isPending` 会自动反映提交状态。

3. **类型安全**：通过泛型参数可以严格定义 state 的类型，获得完整的 TypeScript 支持。

4. **表单验证一体化**：服务端验证和客户端状态更新无缝集成，错误信息可以直接映射到对应的表单字段。

### 7.1.5 与 Server Actions 的深度整合

在 Next.js 等支持 React Server Components 的框架中，`useActionState` 与 Server Actions 的结合展现了真正的威力：

```tsx
// app/actions.ts
"use server";

import { revalidatePath } from "next/cache";

export async function createPost(formData: FormData) {
  const title = formData.get("title");
  const content = formData.get("content");

  // 数据库操作...
  await db.post.create({ data: { title, content } });

  revalidatePath("/posts"); // 重新验证缓存
  return { success: true, message: "文章已发布" };
}
```

```tsx
// app/posts/new/page.tsx
"use client";

import { useActionState } from "react";
import { createPost } from "../actions";

export function NewPostForm() {
  const [state, formAction, isPending] = useActionState(createPost, {
    success: false,
    message: "",
  });

  return (
    <form action={formAction}>
      <input name="title" required disabled={isPending} />
      <textarea name="content" required disabled={isPending} />
      <button type="submit" disabled={isPending}>
        {isPending ? "发布中..." : "发布文章"}
      </button>
      {state.message && <p>{state.message}</p>}
    </form>
  );
}
```

## 7.2 useFormStatus：子组件中的表单状态感知

### 7.2.1 解决的问题

在实际开发中，提交按钮往往是一个独立的组件，需要知道表单的提交状态来显示加载动画或禁用按钮。在 React 19 之前，我们需要通过 props 层层传递 `isSubmitting` 状态。`useFormStatus` 允许子组件直接读取父级 `<form>` 的状态，无需 props 透传。

### 7.2.2 基本用法

```typescript
const { pending, data, method, action } = useFormStatus();
```

返回值：
- **`pending`**：布尔值，表示表单是否正在提交。
- **`data`**：`FormData` 对象，包含当前正在提交的表单数据（仅在 pending 为 true 时有值）。
- **`method`**：字符串，表示表单的 HTTP 方法（`GET` 或 `POST`）。
- **`action`**：字符串或函数，表示表单的 action URL 或函数。

### 7.2.3 使用限制

`useFormStatus` **必须**在 `<form>` 元素的子组件中调用。如果组件不在 `<form>` 内部，或者 `<form>` 在祖先链的更上层但组件本身不是直接或间接的子节点，则无法获取状态。

### 7.2.4 代码示例：智能提交按钮

```tsx
import { useFormStatus } from "react";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending, data } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`
        px-6 py-2 rounded font-medium transition-all
        ${pending
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-blue-600 hover:bg-blue-700 text-white"
        }
      `}
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner />
          {data?.get("username")
            ? `正在为 ${data.get("username")} 注册...`
            : "提交中..."}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function LoginForm() {
  async function login(_prev: unknown, formData: FormData) {
    await new Promise((r) => setTimeout(r, 2000));
    return { success: true };
  }

  const [, formAction] = useActionState(login, null);

  return (
    <form action={formAction} className="space-y-4 max-w-md mx-auto p-6">
      <div>
        <label htmlFor="username">用户名</label>
        <FormField name="username" type="text" />
      </div>

      <div>
        <label htmlFor="password">密码</label>
        <FormField name="password" type="password" />
      </div>

      <SubmitButton>登录</SubmitButton>
    </form>
  );
}
```

### 7.2.5 表单字段禁用状态

`useFormStatus` 也可以用来在提交时自动禁用所有表单字段：

```tsx
function FormField({
  name,
  type,
  placeholder,
}: {
  name: string;
  type: string;
  placeholder?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <input
      name={name}
      type={type}
      disabled={pending}
      placeholder={placeholder}
      className="border rounded px-3 py-2 w-full disabled:bg-gray-100"
    />
  );
}
```

这种模式使得表单字段组件可以自动响应提交状态，无需通过 props 传递 `isPending`。

## 7.3 useOptimistic：即时的乐观更新

### 7.3.1 概念与原理

乐观更新（Optimistic Update）是一种用户体验优化策略：**在服务端确认之前，先假设操作会成功，立即在界面上展示结果**。如果操作失败，再回滚到之前的状态。

传统的做法需要手动管理"乐观状态"和"实际状态"，容易出错。`useOptimistic` 提供了标准化的实现方案。

### 7.3.2 基本用法

```typescript
const [optimisticState, addOptimistic] = useOptimistic(
  state,    // 实际状态
  updateFn  // 更新函数，接收当前状态和要添加的乐观值
);
```

- **`state`**：实际的后端状态。
- **`updateFn`**：`(currentState, optimisticValue) => newState`，定义如何将乐观值合并到当前状态中。
- **返回值**：`[optimisticState, addOptimistic]`，`optimisticState` 是可能包含未确认数据的展示状态，`addOptimistic` 用于触发乐观更新。

### 7.3.3 示例：乐观点赞按钮

```tsx
import { useOptimistic, useActionState } from "react";

interface Post {
  id: string;
  title: string;
  likes: number;
  isLiked: boolean;
}

async function toggleLike(
  _prev: Post,
  formData: FormData
): Promise<Post> {
  const postId = formData.get("postId") as string;

  // 模拟 API 调用，有 10% 的概率失败
  await new Promise((r) => setTimeout(r, 1000));

  if (Math.random() < 0.1) {
    throw new Error("点赞失败，请重试");
  }

  // 返回更新后的服务端数据
  return {
    /* 从服务端获取的最新数据 */
  } as Post;
}

function LikeButton({ post }: { post: Post }) {
  const [optimisticPost, addOptimistic] = useOptimistic(
    post,
    (currentPost: Post, _newLikeCount: number) => ({
      ...currentPost,
      likes: currentPost.isLiked
        ? currentPost.likes - 1
        : currentPost.likes + 1,
      isLiked: !currentPost.isLiked,
    })
  );

  async function handleLike() {
    // 立即触发乐观更新
    addOptimistic(null);

    // 执行实际的异步操作
    try {
      const response = await fetch(`/api/posts/${post.id}/like`, {
        method: "POST",
      });

      if (!response.ok) {
        // 如果失败，乐观更新会自动回滚
        throw new Error("点赞失败");
      }
    } catch (error) {
      // 错误处理：乐观状态会恢复到 addOptimistic 之前的值
      console.error("点赞失败:", error);
    }
  }

  return (
    <button
      onClick={handleLike}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-full transition-all
        ${optimisticPost.isLiked
          ? "bg-red-100 text-red-600 hover:bg-red-200"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }
      `}
    >
      <span>{optimisticPost.isLiked ? "❤️" : "🤍"}</span>
      <span>{optimisticPost.likes}</span>
    </button>
  );
}
```

### 7.3.4 示例：乐观消息发送

聊天应用是乐观更新的经典用例——用户发送消息后应该立即看到自己的消息出现在对话中，而不是等待服务端确认。

```tsx
import { useOptimistic, useRef } from "react";

interface Message {
  id: string;
  text: string;
  sender: string;
  status: "sending" | "sent" | "failed";
}

function ChatRoom({ initialMessages }: { initialMessages: Message[] }) {
  const [optimisticMessages, addOptimistic] = useOptimistic(
    initialMessages,
    (currentMessages: Message[], newMessage: Message) => [
      ...currentMessages,
      newMessage,
    ]
  );

  const formRef = useRef<HTMLFormElement>(null);

  async function sendMessage(formData: FormData) {
    const text = formData.get("message") as string;
    if (!text.trim()) return;

    // 创建临时消息对象
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      text,
      sender: "我",
      status: "sending",
    };

    // 立即显示在 UI 中
    addOptimistic(tempMessage);
    formRef.current?.reset();

    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        body: JSON.stringify({ text }),
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("发送失败");
      }

      // 实际消息已由服务端返回，下次刷新时会替换临时消息
    } catch (error) {
      // 乐观更新自动回滚，临时消息消失
      console.error("消息发送失败:", error);
      // 可以在这里添加错误提示
    }
  }

  const [, formAction] = useActionState(sendMessage, null);

  return (
    <div className="flex flex-col h-[600px] border rounded-lg">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {optimisticMessages.map((msg) => (
          <div
            key={msg.id}
            className={`
              p-3 rounded-lg max-w-[70%]
              ${msg.sender === "我"
                ? "ml-auto bg-blue-500 text-white"
                : "bg-gray-100"
              }
              ${msg.status === "sending" ? "opacity-70" : ""}
              ${msg.status === "failed" ? "border-2 border-red-500" : ""}
            `}
          >
            <p>{msg.text}</p>
            {msg.status === "sending" && (
              <span className="text-xs opacity-70">发送中...</span>
            )}
            {msg.status === "failed" && (
              <span className="text-xs text-red-300">发送失败</span>
            )}
          </div>
        ))}
      </div>

      <form ref={formRef} action={formAction} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            name="message"
            type="text"
            placeholder="输入消息..."
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}
```

### 7.3.5 useOptimistic 的注意事项

1. **只用于非关键操作**：乐观更新适用于点赞、评论、聊天等非关键操作。对于支付、删除等重要操作，建议等待服务端确认后再更新 UI。

2. **自动回滚**：当组件重新渲染时，`optimisticState` 会自动恢复为实际的 `state` 值，无需手动处理回滚逻辑。

3. **不可与 useActionState 混用**：注意不要在一个组件中同时使用 `useOptimistic` 和 `useActionState` 处理同一个表单的同一个操作，这会导致状态冲突。

## 7.4 use()：在渲染中直接读取 Promise 和 Context

### 7.4.1 革命性的变化

`use()` 是 React 19 中最为革命性的新 API。与传统的 Hook 不同，`use()` **可以在条件语句和循环中调用**，打破了"只在组件顶层调用 Hook"的规则。

更重要的是，`use()` 可以直接读取 Promise，并与 Suspense 无缝集成，实现真正声明式的数据获取。

### 7.4.2 读取 Context

`use(Context)` 是 `useContext(Context)` 的替代方案，但更加灵活：

```tsx
import { use } from "react";
import { ThemeContext, UserContext } from "./contexts";

function ThemedHeader() {
  // 使用 use() 读取 Context
  const theme = use(ThemeContext);
  const user = use(UserContext);

  return (
    <header
      style={{
        background: theme === "dark" ? "#333" : "#fff",
        color: theme === "dark" ? "#fff" : "#333",
      }}
    >
      <h1>欢迎, {user.name}</h1>
    </header>
  );
}

// 对比：传统方式需要使用 useContext 两次
function ThemedHeaderOld() {
  const theme = useContext(ThemeContext);
  const user = useContext(UserContext);

  return <>{/* ... */}</>;
}
```

### 7.4.3 读取 Promise（数据获取的革命）

`use(promise)` 是 `use()` 最令人兴奋的特性。它让数据获取变得极其简洁：

```tsx
import { use, Suspense } from "react";

// 创建一个预加载的 Promise
function fetchUser(id: string): Promise<User> {
  return fetch(`/api/users/${id}`).then((res) => res.json());
}

// 数据获取组件直接使用 use()
function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise); // 如果 Promise 未完成，组件会"挂起"

  return (
    <div>
      <img src={user.avatar} alt={user.name} />
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

// 父组件使用 Suspense 包裹
function UserPage({ userId }: { userId: string }) {
  const userPromise = fetchUser(userId);

  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}

// 骨架屏组件
function UserSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="w-20 h-20 bg-gray-200 rounded-full" />
      <div className="h-4 bg-gray-200 rounded mt-2 w-32" />
      <div className="h-3 bg-gray-200 rounded mt-1 w-48" />
    </div>
  );
}
```

### 7.4.4 与 useEffect + useState 的对比

传统方式（React 18 及之前）：

```tsx
function UserProfileOld({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setUser(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <UserSkeleton />;
  if (error) return <p>加载失败: {error.message}</p>;
  if (!user) return null;

  return <div>{/* 渲染用户信息 */}</div>;
}
```

使用 `use()` 的新方式：

```tsx
function UserProfileNew({ userId }: { userId: string }) {
  // Promise 在父组件中创建，在这里消费
  const [userPromise, setUserPromise] = useState<Promise<User>>();

  useEffect(() => {
    setUserPromise(fetchUser(userId));
  }, [userId]);

  // 如果没有 promise，显示骨架屏
  if (!userPromise) return <UserSkeleton />;

  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserData userPromise={userPromise} />
    </Suspense>
  );
}

function UserData({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <div>{/* 渲染用户信息 */}</div>;
}
```

### 7.4.5 并行数据获取

`use()` 的真正威力体现在并行数据获取中。传统方式中，我们需要手动管理多个 Promise 的加载状态：

```tsx
function Dashboard() {
  // 同时发起多个请求
  const userPromise = fetchUser();
  const postsPromise = fetchPosts();
  const notificationsPromise = fetchNotifications();

  return (
    <div className="dashboard">
      <Suspense fallback={<UserSkeleton />}>
        <UserData userPromise={userPromise} />
      </Suspense>

      <Suspense fallback={<PostsSkeleton />}>
        <PostsList postsPromise={postsPromise} />
      </Suspense>

      <Suspense fallback={<NotificationSkeleton />}>
        <Notifications dataPromise={notificationsPromise} />
      </Suspense>
    </div>
  );
}

function UserData({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <UserCard user={user} />;
}

function PostsList({ postsPromise }: { postsPromise: Promise<Post[]> }) {
  const posts = use(postsPromise);
  return posts.map((post) => <PostCard key={post.id} post={post} />);
}

function Notifications({ dataPromise }: { dataPromise: Promise<Notification[]> }) {
  const notifications = use(dataPromise);
  return <NotificationBell count={notifications.length} />;
}
```

每个数据请求独立加载，互不阻塞，且各自的 Suspense fallback 独立显示。

### 7.4.6 错误处理与 Error Boundary

`use()` 抛出的 Promise 错误可以通过 Error Boundary 捕获：

```tsx
import { Component } from "react";

class DataErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="error-state">
            <h3>数据加载失败</h3>
            <p>{this.state.error?.message}</p>
            <button onClick={() => this.setState({ hasError: false, error: null })}>
              重试
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

### 7.4.7 use() 的最佳实践

1. **Promise 应在父组件中创建**：不要在调用 `use()` 的同一组件中创建 Promise，否则每次渲染都会创建新的 Promise，导致无限循环。

2. **结合 Suspense 使用**：`use(promise)` 需要 Suspense 边界来显示加载状态。

3. **缓存策略**：对于重复的请求，建议结合缓存库（如 SWR、TanStack Query）使用，或者手动实现 Promise 缓存：

```tsx
const cache = new Map<string, Promise<any>>();

function fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    cache.set(key, fetcher());
  }
  return cache.get(key)!;
}

function UserProfile({ userId }: { userId: string }) {
  const userPromise = fetchWithCache(`user-${userId}`, () =>
    fetch(`/api/users/${userId}`).then((r) => r.json())
  );

  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserData userPromise={userPromise} />
    </Suspense>
  );
}
```

4. **避免滥用**：`use()` 适用于 Suspense 驱动的数据获取。对于不需要 Suspense 的场景，传统的 `useEffect` 仍然是合适的选择。

## 7.5 本章小结

React 19 的四个新 Hook 代表了 React 在以下几个方向的重要演进：

| Hook | 核心用途 | 解决的问题 |
|------|----------|-----------|
| `useActionState` | 表单状态管理 | 简化表单提交、验证和状态更新 |
| `useFormStatus` | 子组件感知表单状态 | 消除 props 透传，实现解耦的 UI 组件 |
| `useOptimistic` | 乐观 UI 更新 | 标准化乐观更新模式，自动回滚 |
| `use()` | 读取 Promise/Context | 声明式数据获取，与 Suspense 原生集成 |

这些新 API 共同推动了 React 向**更声明式、更少样板代码**的方向发展。在实际项目中，合理组合使用这些 Hook 可以显著提升开发效率和用户体验。

在下一章中，我们将探讨 React 中的性能优化策略，包括如何识别和解决常见的性能问题。