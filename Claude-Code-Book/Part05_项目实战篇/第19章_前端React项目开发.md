# 第19章 前端 React 项目开发

## 19.1 项目初始化与架构

### 19.1.1 Vite + React 搭建

**项目创建**

```bash
npm create vite@latest my-react-app -- --template react-ts
cd my-react-app
npm install
```

**Vite 配置**

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
```

### 19.1.2 目录结构

**推荐结构**

```text
my-app/
├── src/
│   ├── components/       # 通用组件
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Modal.tsx
│   ├── pages/            # 页面组件
│   │   ├── Home.tsx
│   │   ├── About.tsx
│   │   └── Login.tsx
│   ├── hooks/            # 自定义 Hooks
│   ├── services/         # API 服务
│   ├── store/            # 状态管理
│   ├── utils/            # 工具函数
│   ├── types/            # 类型定义
│   ├── App.tsx
│   └── main.tsx
├── public/
├── package.json
└── vite.config.js
```

### 19.1.3 状态管理选择

**状态管理对比**

| 方案 | 特点 | 适用场景 |
|------|------|----------|
| useState | 简单、内置 | 小型应用 |
| Context | 跨组件共享 | 中型应用 |
| Zustand | 简单、现代化 | 中大型应用 |
| Redux Toolkit | 功能强大 | 大型应用 |

**Zustand 示例**

```typescript
import { create } from 'zustand'

interface User {
  id: number
  name: string
  email: string
}

interface UserStore {
  user: User | null
  setUser: (user: User | null) => void
  logout: () => void
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}))
```

## 19.2 组件开发

### 19.2.1 UI 组件库

**使用 TailwindCSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**配置**

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
      }
    },
  },
  plugins: [],
}
```

**使用**

```tsx
<button className="bg-primary text-white px-4 py-2 rounded hover:bg-blue-600">
  点击
</button>
```

### 19.2.2 业务组件

**组件示例**

```typescript
import { useState } from 'react'

interface UserCardProps {
  name: string
  email: string
  avatar?: string
  onEdit?: () => void
  onDelete?: () => void
}

export const UserCard: React.FC<UserCardProps> = ({
  name,
  email,
  avatar,
  onEdit,
  onDelete,
}) => {
  const [loading, setLoading] = useState(false)

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-4">
        <img
          src={avatar || '/default-avatar.png'}
          alt={name}
          className="w-12 h-12 rounded-full"
        />
        <div>
          <h3 className="font-semibold">{name}</h3>
          <p className="text-gray-500 text-sm">{email}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={onEdit} className="btn-primary">编辑</button>
        <button onClick={onDelete} className="btn-danger">删除</button>
      </div>
    </div>
  )
}
```

### 19.2.3 表单与验证

**表单处理**

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2, '名称至少2个字符'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少8位'),
})

type FormData = z.infer<typeof schema>

export const LoginForm = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema)
  })

  const onSubmit = (data: FormData) => {
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}

      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">提交</button>
    </form>
  )
}
```

## 19.3 与后端集成

### 19.3.1 API 调用封装

**API 服务层**

```typescript
// services/api.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 请求拦截
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 处理未授权
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// 使用
export const getUsers = () => api.get('/users')
export const createUser = (data: User) => api.post('/users', data)
```

### 19.3.2 认证与授权

**认证状态管理**

```typescript
import { create } from 'zustand'

interface AuthStore {
  token: string | null
  setToken: (token: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: localStorage.getItem('token'),
  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },
  logout: () => {
    localStorage.removeItem('token')
    set({ token: null })
  },
  isAuthenticated: () => !!get().token,
}))
```

### 19.3.3 错误处理

**全局错误处理**

```typescript
// ErrorBoundary
import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <div>出现错误: {this.state.error?.message}</div>
    }
    return this.props.children
  }
}
```

## 本章小结

本章介绍了前端 React 项目开发。涵盖 Vite + React 搭建、目录结构设计、状态管理、组件开发、表单验证、后端集成和错误处理。

## 练习题

1. 创建一个完整的 React 项目
2. 实现用户登录功能
3. 部署到 Vercel
