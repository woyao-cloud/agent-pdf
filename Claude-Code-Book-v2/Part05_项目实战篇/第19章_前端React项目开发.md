# 第19章：前端 React 项目开发

## 章节概述

本章通过开发一个数据分析仪表板项目，展示如何使用 Claude Code 进行 React 前端开发。你将学会从项目初始化、组件设计、状态管理、路由配置到 API 集成的完整流程。我们使用 React 18 + TypeScript + Vite 作为技术栈，这是目前最主流的前端开发组合。

## 学习目标

- 掌握使用 Claude Code 开发 React 应用的方法
- 学会组件设计和状态管理
- 理解前端路由和数据获取
- 能够集成后端 API

## 核心知识点

### 1. 项目初始化

#### 创建 React 项目

使用 Vite 创建 TypeScript React 项目是目前推荐的初始化方式。向 Claude Code 发出指令：

```
请帮我创建一个数据分析仪表板 React 项目。
使用 Vite + TypeScript + React 18，
项目名为 dashboard-app。需要包含以下依赖：
- React Router v6（路由）
- TanStack Query（数据获取）
- Recharts（图表）
- Tailwind CSS（样式）
- axios（HTTP 请求）
请配置好所有文件。
```

Claude Code 会执行以下命令（或直接在对话中生成文件）：

```bash
npm create vite@latest dashboard-app -- --template react-ts
cd dashboard-app
npm install react-router-dom @tanstack/react-query recharts axios
npm install -D tailwindcss @tailwindcss/vite
```

#### 目录结构设计

Claude Code 生成的前端项目结构：

```
dashboard-app/
├── src/
│   ├── main.tsx              # 入口文件
│   ├── App.tsx               # 根组件
│   ├── index.css             # 全局样式
│   ├── api/
│   │   └── client.ts         # axios 实例和 API 函数
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── Dashboard/
│   │   │   ├── StatsCard.tsx
│   │   │   ├── ChartWidget.tsx
│   │   │   └── RecentActivity.tsx
│   │   └── common/
│   │       ├── Loading.tsx
│   │       ├── ErrorBoundary.tsx
│   │       └── Pagination.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Analytics.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   └── useDashboard.ts
│   ├── types/
│   │   └── index.ts          # TypeScript 类型定义
│   └── utils/
│       └── format.ts         # 格式化工具函数
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

关键目录说明：
- **api/**: 所有与后端通信的代码集中在此，便于统一管理 baseURL、请求拦截器
- **components/**: 按照功能模块组织，每个子目录一个组件 + 子组件
- **pages/**: 页面级别的组件，每个文件对应一个路由
- **hooks/**: 自定义 Hook，封装可复用的状态逻辑
- **types/**: TypeScript 类型定义，前后端共享类型可在 monorepo 中统一管理
- **utils/**: 纯工具函数，不含 React 相关的逻辑

### 2. 组件开发

#### 组件树设计

仪表板的组件树结构：

```
App
└── BrowserRouter
    └── Layout
        ├── Sidebar（导航菜单）
        └── Main Content
            ├── Header（面包屑 + 用户信息）
            └── Outlet
                ├── Dashboard（仪表板首页）
                │   ├── StatsCard × 4（关键指标卡片）
                │   ├── ChartWidget（图表组件）
                │   └── RecentActivity（最近活动列表）
                ├── Analytics（分析页面）
                └── Settings（设置页面）
```

**Claude Code 提示：**

```
请按上述组件树结构，生成 Layout、Sidebar、Header 组件。
Layout 使用 React Router 的 Outlet 渲染子页面，
Sidebar 使用 react-router-dom 的 NavLink 实现导航高亮。
使用 Tailwind CSS 样式。
```

#### 关键组件实现

**StatsCard 组件**——展示关键指标的卡片：

```typescript
// src/components/Dashboard/StatsCard.tsx
import { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;  // 变化百分比，正数增加，负数减少
  icon: ReactNode;
  loading?: boolean;
}

export function StatsCard({ title, value, change, icon, loading }: StatsCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 animate-pulse">
        <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
        <div className="h-8 w-20 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {change !== undefined && (
          <span
            className={`text-sm font-medium ${
              change >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
```

**ChartWidget 组件**——使用 Recharts 的折线图：

```typescript
// src/components/Dashboard/ChartWidget.tsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface DataPoint {
  date: string;
  value: number;
  previous?: number;
}

interface ChartWidgetProps {
  title: string;
  data: DataPoint[];
  loading?: boolean;
}

export function ChartWidget({ title, data, loading }: ChartWidgetProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {loading ? (
        <div className="h-72 bg-gray-100 rounded animate-pulse" />
      ) : (
        <ResponsiveContainer width="100%" height={288}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
            <YAxis stroke="#9ca3af" fontSize={12} />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="This Month"
            />
            <Line
              type="monotone"
              dataKey="previous"
              stroke="#9ca3af"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Last Month"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

**TypeScript 类型定义**：

```typescript
// src/types/index.ts
export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  revenue: number;
  conversionRate: number;
  changes: {
    totalUsers: number;
    activeUsers: number;
    revenue: number;
    conversionRate: number;
  };
}

export interface ChartDataPoint {
  date: string;
  value: number;
  previous?: number;
}

export interface RecentActivityItem {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface DashboardData {
  stats: DashboardStats;
  chartData: ChartDataPoint[];
  recentActivity: RecentActivityItem[];
}
```

### 3. 状态管理与路由

#### TanStack Query 配置

TanStack Query（React Query）是 React 中最强大的数据获取和缓存库。它自动处理加载状态、错误状态、缓存失效和重新获取。

```typescript
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 分钟内数据视为"新鲜"，不重新请求
      retry: 2,                    // 失败后重试 2 次
      refetchOnWindowFocus: false, // 不因窗口聚焦而重新获取
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
```

**关键配置说明**：
- `staleTime`: 数据过期时间。设为 5 分钟意味着用户切换页面后 5 分钟内回到仪表板页面不会重新请求，减少不必要的网络请求
- `retry`: 请求失败后的重试次数。对于网络不稳定的情况非常有用
- `refetchOnWindowFocus`: 默认是 true，但仪表板数据不需要如此频繁刷新

#### 自定义 Hook 封装数据获取

```typescript
// src/hooks/useDashboard.ts
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardData } from "../api/client";
import type { DashboardData } from "../types";

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardData,
    // 也可以设置 refetchInterval 实现自动轮询
    // refetchInterval: 30000, // 每 30 秒刷新
  });
}

// 还可以封装其他数据获取 Hook
export function useAnalytics(dateRange: string) {
  return useQuery({
    queryKey: ["analytics", dateRange],
    queryFn: () => fetchAnalytics(dateRange),
    enabled: !!dateRange, // 只在 dateRange 有值时执行查询
  });
}
```

**Claude Code 提示：**

```
请为 useDashboard 添加错误处理和 Loading 骨架屏。
当请求失败时，显示一个带有重试按钮的错误卡片；
加载中时显示 skeleton 动画。
```

#### React Router 配置

```typescript
// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
```

使用嵌套路由模式：父路由 `<Layout>` 渲染 Sidebar + Header + `<Outlet>`，子路由仅渲染页面内容，避免刷新的 Sidebar。

### 4. 样式与集成

#### Tailwind CSS 配置

Vite + Tailwind CSS 的集成配置：

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

使用 Vite 的 proxy 配置开发时反向代理，将 `/api` 请求转发到后端（第18章开发的 FastAPI 服务）。这样前端开发中请求 `/api/v1/todos` 即可，无需配置完整 URL，也避免了 CORS 问题。

对于生产环境，后端的 CORS 中间件已经配置好 `allow_origins=["*"]`。

#### API 调用封装

```typescript
// src/api/client.ts
import axios from "axios";
import type { DashboardData, ChartDataPoint, DashboardStats, RecentActivityItem } from "../types";

const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 重定向到登录页面
      window.location.href = "/login";
    }
    console.error("API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// 模拟数据（当后端未就绪时使用）
const MOCK_DATA: DashboardData = {
  stats: {
    totalUsers: 12847,
    activeUsers: 3892,
    revenue: 45230,
    conversionRate: 3.24,
    changes: { totalUsers: 12.5, activeUsers: -2.3, revenue: 8.7, conversionRate: 0.5 },
  },
  chartData: [
    { date: "2025-01", value: 4000, previous: 3500 },
    { date: "2025-02", value: 4200, previous: 3700 },
    { date: "2025-03", value: 3800, previous: 3900 },
    { date: "2025-04", value: 5100, previous: 4100 },
    { date: "2025-05", value: 4900, previous: 4300 },
    { date: "2025-06", value: 5600, previous: 4700 },
  ],
  recentActivity: [
    { id: "1", user: "Alice", action: "创建了", target: "新项目", timestamp: "2 分钟前" },
    { id: "2", user: "Bob", action: "更新了", target: "用户设置", timestamp: "15 分钟前" },
    { id: "3", user: "Charlie", action: "删除了", target: "旧报告", timestamp: "1 小时前" },
  ],
};

export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const response = await api.get<DashboardData>("/v1/dashboard");
    return response.data;
  } catch {
    // 后端未就绪时返回模拟数据
    await new Promise((r) => setTimeout(r, 800)); // 模拟网络延迟
    return MOCK_DATA;
  }
}
```

#### ErrorBoundary 组件

```typescript
// src/components/common/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 可以在这里上报错误到监控服务
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center min-h-64 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">出错了</h2>
            <p className="text-gray-500 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
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

### 完整页面组装

仪表板页面将上述组件组装在一起：

```typescript
// src/pages/Dashboard.tsx
import { StatsCard } from "../components/Dashboard/StatsCard";
import { ChartWidget } from "../components/Dashboard/ChartWidget";
import { RecentActivity } from "../components/Dashboard/RecentActivity";
import { useDashboard } from "../hooks/useDashboard";

export function Dashboard() {
  const { data, isLoading, error } = useDashboard();

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">Failed to load dashboard data</p>
        <button onClick={() => window.location.reload()} className="btn-primary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Users"
          value={data?.stats.totalUsers ?? "—"}
          change={data?.stats.changes.totalUsers}
          loading={isLoading}
          icon={<UsersIcon />}
        />
        <StatsCard
          title="Active Users"
          value={data?.stats.activeUsers ?? "—"}
          change={data?.stats.changes.activeUsers}
          loading={isLoading}
          icon={<ActivityIcon />}
        />
        <StatsCard
          title="Revenue"
          value={data?.stats.revenue ? `$${(data.stats.revenue / 1000).toFixed(1)}k` : "—"}
          change={data?.stats.changes.revenue}
          loading={isLoading}
          icon={<DollarIcon />}
        />
        <StatsCard
          title="Conversion"
          value={data?.stats.conversionRate ? `${data.stats.conversionRate}%` : "—"}
          change={data?.stats.changes.conversionRate}
          loading={isLoading}
          icon={<TrendingIcon />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartWidget
            title="Revenue Trend"
            data={data?.chartData ?? []}
            loading={isLoading}
          />
        </div>
        <div>
          <RecentActivity
            items={data?.recentActivity ?? []}
            loading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
```

**Claude Code 提示：**

```
请把 StatsCard 的图标换成 lucide-react 库的图标，
并添加简短的过渡动画效果。
```

## 实战练习

### 完整项目步骤

**步骤 1**: 创建项目并运行

```bash
npm create vite@latest dashboard-app -- --template react-ts
cd dashboard-app
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`，确认 Vite + React 项目正常运行。

**步骤 2**: 让 Claude Code 生成组件

```
请为我的 dashboard-app 项目添加以下组件：
1. Layout、Sidebar、Header（响应式侧边栏布局）
2. Dashboard 页面，包含 StatsCard、ChartWidget、RecentActivity
3. 使用 TanStack Query 管理数据获取
4. 使用 Tailwind CSS 样式
所有文件放在 src/ 对应子目录中。
```

**步骤 3**: 与后端联调

将 `vite.config.ts` 中的 proxy 配置指向实际的 FastAPI 后端。如果第 18 章的 Todo API 在 `localhost:8000` 运行，proxy 配置如下：

```typescript
proxy: {
  "/api": {
    target: "http://localhost:8000",
    changeOrigin: true,
  },
}
```

如果后端暂时不可用，Claude Code 生成的模拟数据（MOCK_DATA）能让前端独立开发和预览。

**步骤 4**: 优化用户体验

```
请为仪表板添加以下体验优化：
1. 数据加载时显示骨架屏（skeleton loading）
2. 卡片组件的悬浮动画
3. 响应式布局，移动端适配
4. 添加数据为空时的空状态提示
```

**预期效果描述**：
页面左侧是 Sidebar 导航，包含 Dashboard、Analytics、Settings 三个菜单项，当前页面高亮显示。右上方是 Header，显示页面标题。主区域是 4 个 StatsCard 排列在一行，下面是图表（占 2/3 宽度）和最近活动列表（占 1/3 宽度）。加载时卡片显示灰色骨架动画，数据就绪后平滑显示数值和图表曲线。

## 本章小结

1. **Vite + TypeScript + React 18 是当前最佳实践**：Vite 提供极快的 HMR（热模块替换）开发体验，TypeScript 提供类型安全，React 18 提供并发特性。Claude Code 对这三者的组合理解最好。

2. **TanStack Query 解决数据获取的所有痛点**：自动管理 loading/error/success 状态、缓存、后台刷新、分页、乐观更新。在大多数应用中可以完全替代全局状态管理工具（Redux）的数据获取部分。

3. **组件设计遵循"单一职责"原则**：每个组件只做一件事——StatsCard 只负责展示指标卡片，不关心数据来源；ChartWidget 只负责渲染图表。复杂页面通过组合多个小组件构建。

4. **Proxy 代理解决开发时的 CORS 问题**：Vite 的 proxy 配置将前端 `/api` 请求转发到后端，生产环境通过 Nginx 反向代理或后端 CORS 中间件处理。

5. **Mock 数据让前后端并行开发**：在后端 API 就绪前，使用 Mock 数据可以让前端独立开发和验证 UI。Claude Code 能根据类型定义自动生成逼真的 Mock 数据。

6. **ErrorBoundary 兜底，骨架屏提升体验**：ErrorBoundary 防止组件崩溃导致整个页面白屏，骨架屏代替传统的 Loading Spinner 让用户感觉加载更快。

## 思考题

1. **React 项目中状态管理方案如何选择？**
   - **提示**: 从三个维度评估——作用范围（组件级/页面级/全局）、更新频率（低/高）、数据来源（客户端/服务端）。一般原则：服务端数据用 TanStack Query，客户端表单状态用 React Hook Form + Zod，全局共享状态（用户信息、主题）用 Context + useReducer，只有真正需要跨组件频繁通信的复杂状态才用 Zustand 或 Redux Toolkit。80% 的 React 应用不需要 Redux。

2. **前端开发中如何优化用户体验？**
   - **提示**: 从四个层面考虑——(1) 感知速度：骨架屏、乐观更新、预加载、图片懒加载；(2) 交互反馈：按钮状态（loading/disabled）、Toast 通知、动画过渡；(3) 容错设计：ErrorBoundary、重试按钮、空状态提示、网络离线提示；(4) 无障碍：语义化 HTML、ARIA 属性、键盘导航、对比度、字体大小可调。Claude Code 可以帮助实现这些优化（提示："请为这个组件添加无障碍支持"）。