# 第17章 TypeScript + Vue 3 实战

> Vue 3 的 Composition API 就像给 Vue 组件装上了"类型探测雷达"——每个响应式变量、每个计算属性、每个事件处理函数，都自动获得了类型的"身份证"。你再也不用猜一个数据是什么类型，Vue 3 + TypeScript 就是"自带文档的框架"。

---

## 1. 核心概念

### Vue 3 的 TypeScript 架构

Vue 3 是从底层用 TypeScript 重写的——这意味着它的类型系统是"原生"的，而不是"后加"的补丁。这与 Vue 2 有本质区别：

| 对比 | Vue 2 + TS | Vue 3 + TS |
|---|---|---|
| 类型系统 | 通过 `vue-class-component` 等插件"补丁式"支持 | 原生 TS 支持，Composition API 天然类型友好 |
| Props 类型 | 运行时校验 + 手动声明类型 | `defineProps` 泛型直接推导 |
| 推导能力 | 有限，大量需要手动标注 | 强类型推导，几乎不需要手动标注 |

### script setup 与 TypeScript

`<script setup lang="ts">` 是 Vue 3 的"语法糖火箭"——它让组件脚本部分变得更简洁，同时保留了完整的 TypeScript 支持：

```vue
<script setup lang="ts">
// 这里的 TypeScript 代码会"提升"到组件的 setup 函数中
// 所有顶层绑定都会自动暴露给模板
</script>
```

### 响应式系统的类型推导

Vue 3 的响应式系统基于 Proxy，TypeScript 对其做了深度集成：

- **ref**：包装单值，通过 `.value` 访问，类型推导自动
- **reactive**：包装对象，深层响应式，但**解构会丢失响应性**
- **computed**：自动推导返回值类型

理解 ref 和 reactive 的差异，是掌握 Vue 3 + TS 的关键：

```
ref    → 适合基本类型 + 对象（通过 .value 访问）
         "带包装盒的礼物"——你需要打开盒子才能拿到内容
reactive → 适合对象（直接访问属性）
           "透明展示柜"——你能直接看到里面的物品，但整体搬不走
```

### Template Refs 与 InstanceType

当你在 Vue 中获取 DOM 元素或子组件实例时，需要正确的类型标注：

```typescript
// DOM 元素引用
const divRef = ref<HTMLDivElement | null>(null)

// 子组件实例引用——使用 InstanceType
const childRef = ref<InstanceType<typeof ChildComponent> | null>(null)
```

### Pinia 的类型安全

Pinia 是 Vue 3 的官方状态管理库，天然支持 TypeScript。它的类型推导是全自动的：

- Store 的状态类型从初始值推导
- Actions 的参数和返回类型从函数签名推导
- Getters 的类型从返回值推导

---

## 2. 典型问题与处理

### 问题 1：reactive 解构丢失响应性

```vue
<script setup lang="ts">
// ❌ Bad Code — 解构 reactive 对象
import { reactive } from 'vue'

interface UserState {
  name: string
  age: number
  email: string
}

const state = reactive<UserState>({
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
})

// 解构——这是陷阱！
const { name, age } = state

function updateName() {
  name = 'Bob'  // ❌ 这只是修改了一个普通变量，不会触发视图更新
}

function updateState() {
  state.name = 'Bob'  // ✅ 直接修改 state 才会触发更新
}
</script>

<template>
  <!-- name 永远不会更新为 'Bob'，因为它已经是一个普通变量 -->
  <p>{{ name }}</p>
  <!-- state.name 会更新 -->
  <p>{{ state.name }}</p>
</template>
```

**为什么不好？** `reactive` 返回的是一个 Proxy 对象，解构操作会**复制出原始值的副本**（对于基本类型）或**失去代理的引用**（对于对象类型）。解构后的变量不再是响应式的，视图永远不会更新。

```vue
<script setup lang="ts">
// ✅ Good Code — 保持 reactive 不解构，或使用 toRefs / toRef

// 方案 1：不解构，直接使用 state.xxx
import { reactive, toRefs, toRef } from 'vue'

interface UserState {
  name: string
  age: number
  email: string
}

const state = reactive<UserState>({
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
})

// 方案 2：使用 toRefs 保持响应性（适用于需要解构的场景）
const { name, age } = toRefs(state)
// name 现在是 Ref<string>，name.value 保持响应性
// age 现在是 Ref<number>，age.value 保持响应性

// 方案 3：使用 toRef 转换单个属性
const email = toRef(state, 'email')
// email 现在是 Ref<string>，email.value 保持响应性

function updateName() {
  name.value = 'Bob'  // ✅ 通过 Ref 修改，触发视图更新
}
</script>

<template>
  <p>{{ name }}</p>     <!-- 自动解包 Ref，显示 'Bob' -->
  <p>{{ age }}</p>       <!-- 自动解包 Ref -->
  <p>{{ email }}</p>     <!-- 自动解包 Ref -->
</template>
```

**为什么好？** `toRefs` 将 reactive 对象的每个属性转换为独立的 `Ref`，这些 Ref 指向原始 Proxy 对象的属性。修改 `name.value` 本质上还是在修改 `state.name`，因此保持了响应性。

### 问题 2：ref 的泛型参数推导

```vue
<script setup lang="ts">
// ❌ Bad Code — 错误的 ref 类型推导

// 问题 1：初始值为 null 导致类型变为 Ref<null>
const count = ref(null)
count.value = 1  // ❌ 类型错误：不能将 number 赋给 null

// 问题 2：未指定泛型导致类型推导过于宽泛
const data = ref([])  // 类型推导为 Ref<never[]>
data.value.push({ id: 1 })  // ❌ 类型错误：不能将 { id: number } 推入 never[]

// 问题 3：错误的泛型参数
const input = ref<HTMLInputElement>(null)  
// ❌ 类型错误：不能将 null 赋给 HTMLInputElement
</script>
```

**为什么不好？** `ref` 的类型推导是从初始值来的。如果初始值是 `null`，类型就是 `null`；如果初始值是 `[]`，类型就是 `never[]`。这导致后续赋值时类型不匹配。

```vue
<script setup lang="ts">
// ✅ Good Code — 正确指定 ref 的泛型参数

// 方案 1：初始值为 null 时，显式指定泛型参数
const count = ref<number | null>(null)
count.value = 1  // ✅ 正确

// 方案 2：空数组时，指定元素类型
interface User {
  id: number
  name: string
}

const data = ref<User[]>([])
data.value.push({ id: 1, name: 'Alice' })  // ✅ 正确

// 方案 3：DOM 引用
const inputRef = ref<HTMLInputElement | null>(null)
// ✅ 正确：类型是 HTMLInputElement | null

// 方案 4：使用初始值自动推导
const name = ref('')      // 类型自动推导为 Ref<string>
const age = ref(0)        // 类型自动推导为 Ref<number>
const isActive = ref(true) // 类型自动推导为 Ref<boolean>

// 方案 5：复杂类型用类型断言
const config = ref({
  theme: 'dark',
  fontSize: 16
} as const)
// config.value.theme 类型为 'dark'（字面量类型，非 string）
</script>
```

**为什么好？** 显式指定泛型参数让 `ref` 的类型精确可控。特别是当初始值不能代表最终类型时（如 `null` 或空数组），泛型参数就是"告诉 TypeScript 将来会是什么类型"的关键。

### 问题 3：模板引用（Template Refs）的类型

```vue
<script setup lang="ts">
// ❌ Bad Code — 模板引用类型不准确
import { ref, onMounted } from 'vue'

// 问题：没有使用 InstanceType
import ChildComp from './ChildComp.vue'

const childRef = ref(null)

onMounted(() => {
  // childRef.value 的类型是 null，没有任何方法提示
  // 必须用类型断言
  ;(childRef.value as any).fetchData()
})
</script>

<template>
  <ChildComp ref="childRef" />
</template>
```

**为什么不好？** `ref(null)` 推导为 `Ref<null>`，`childRef.value` 没有任何有用的类型信息。每次访问都需要类型断言，这等于放弃了类型安全。

```vue
<script setup lang="ts">
// ✅ Good Code — 正确使用 InstanceType

// 使用 defineExpose 暴露子组件方法
// ChildComp.vue — 子组件通过 defineExpose 暴露方法
// <script setup lang="ts">
// function fetchData() { ... }
// function reset() { ... }
// defineExpose({ fetchData, reset })
// </script>

// ParentComp.vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ChildComp from './ChildComp.vue'

// InstanceType<typeof ChildComp> 获取组件实例的类型
// 自动包含 defineExpose 暴露的方法
const childRef = ref<InstanceType<typeof ChildComp> | null>(null)

onMounted(() => {
  // childRef.value 的类型是 ChildComp 实例类型
  // 有完整的智能提示！
  childRef.value?.fetchData()
  childRef.value?.reset()
})

// DOM 元素引用的类型
const divRef = ref<HTMLDivElement | null>(null)

onMounted(() => {
  // divRef.value 类型为 HTMLDivElement，有完整的 DOM API 提示
  console.log(divRef.value?.clientWidth)
})
</script>

<template>
  <div ref="divRef">
    <ChildComp ref="childRef" />
  </div>
</template>
```

**为什么好？** `InstanceType<typeof ChildComp>` 自动获取组件的实例类型（包括 `defineExpose` 暴露的方法和属性），无需手动声明接口。`ref<HTMLDivElement>` 提供了完整的 DOM API 类型提示。

---

## 3. 示例代码

### 示例 1：完整的 Composition API 组件

```vue
<!-- user-profile.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'

// === Props 定义 ===
interface UserProfileProps {
  userId: number
  editable?: boolean
}

// defineProps 的泛型参数：Props 类型
const props = defineProps<UserProfileProps>()

// === Emits 定义 ===
// defineEmits 的类型参数：事件名及载荷
const emit = defineEmits<{
  'update': [user: UserData]
  'error': [message: string]
}>()

// === 类型定义 ===
interface UserData {
  id: number
  name: string
  email: string
  role: 'admin' | 'user'
}

interface FormState {
  name: string
  email: string
  role: 'admin' | 'user'
}

// === 响应式状态 ===
const loading = ref(true)
const error = ref<string | null>(null)

const form = reactive<FormState>({
  name: '',
  email: '',
  role: 'user'
})

// === 计算属性 ===
const isValid = computed(() => {
  return form.name.length > 0 && form.email.includes('@')
})

const isDirty = computed(() => {
  return form.name !== '' || form.email !== ''
})

// === 方法 ===
async function fetchUser() {
  loading.value = true
  error.value = null
  
  try {
    const response = await fetch(`/api/users/${props.userId}`)
    if (!response.ok) throw new Error('获取用户信息失败')
    
    const user: UserData = await response.json()
    form.name = user.name
    form.email = user.email
    form.role = user.role
  } catch (e) {
    const message = e instanceof Error ? e.message : '未知错误'
    error.value = message
    emit('error', message)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  if (!isValid.value) return
  
  try {
    const response = await fetch(`/api/users/${props.userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    
    if (!response.ok) throw new Error('更新失败')
    
    const updated: UserData = await response.json()
    emit('update', updated)
  } catch (e) {
    const message = e instanceof Error ? e.message : '未知错误'
    error.value = message
    emit('error', message)
  }
}

// === 生命周期 ===
onMounted(() => {
  fetchUser()
})

// === 侦听器 ===
watch(() => props.userId, () => {
  fetchUser()
})
</script>

<template>
  <div class="user-profile">
    <div v-if="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <form v-else @submit.prevent="handleSubmit">
      <div>
        <label>用户名</label>
        <input v-model="form.name" type="text" />
      </div>
      <div>
        <label>邮箱</label>
        <input v-model="form.email" type="email" />
      </div>
      <div>
        <label>角色</label>
        <select v-model="form.role">
          <option value="user">用户</option>
          <option value="admin">管理员</option>
        </select>
      </div>
      <button type="submit" :disabled="!isValid || loading">
        保存
      </button>
    </form>
  </div>
</template>
```

### 示例 2：Pinia Store 的类型安全

```typescript
// stores/user-store.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 类型定义
interface User {
  id: number
  name: string
  email: string
  avatar?: string
}

interface LoginCredentials {
  email: string
  password: string
}

interface AuthResponse {
  user: User
  token: string
}

// 使用 Setup Store 语法（推荐）
export const useUserStore = defineStore('user', () => {
  // === State ===
  // ref 就是 state
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const loginLoading = ref(false)
  
  // === Getters ===
  // computed 就是 getters
  const isLoggedIn = computed(() => user.value !== null && token.value !== null)
  const userName = computed(() => user.value?.name ?? '未登录')
  const userEmail = computed(() => user.value?.email ?? '')
  
  // === Actions ===
  // 普通函数就是 actions
  async function login(credentials: LoginCredentials): Promise<boolean> {
    loginLoading.value = true
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      })
      
      if (!response.ok) return false
      
      const data: AuthResponse = await response.json()
      user.value = data.user
      token.value = data.token
      
      // 持久化 token
      localStorage.setItem('token', data.token)
      
      return true
    } finally {
      loginLoading.value = false
    }
  }
  
  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }
  
  // 返回所有暴露的属性和方法
  return {
    // State
    user,
    token,
    loginLoading,
    // Getters
    isLoggedIn,
    userName,
    userEmail,
    // Actions
    login,
    logout
  }
})
```

### 示例 3：在组件中使用类型安全的 Pinia

```vue
<!-- login-form.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores/user-store'

// 类型安全的 store（所有类型自动推导）
const userStore = useUserStore()

// userStore.user         → User | null
// userStore.isLoggedIn  → ComputedRef<boolean>
// userStore.userName    → ComputedRef<string>
// userStore.login()     → (credentials: LoginCredentials) => Promise<boolean>

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)

async function handleLogin() {
  error.value = null
  
  if (!email.value || !password.value) {
    error.value = '请填写邮箱和密码'
    return
  }
  
  const success = await userStore.login({
    email: email.value,
    password: password.value
  })
  
  if (!success) {
    error.value = '登录失败，请检查邮箱和密码'
  }
}
</script>

<template>
  <div>
    <div v-if="userStore.isLoggedIn">
      欢迎回来，{{ userStore.userName }}
      <button @click="userStore.logout()">退出</button>
    </div>
    <form v-else @submit.prevent="handleLogin">
      <div v-if="error" class="error">{{ error }}</div>
      <input v-model="email" type="email" placeholder="邮箱" />
      <input v-model="password" type="password" placeholder="密码" />
      <button type="submit" :disabled="userStore.loginLoading">
        {{ userStore.loginLoading ? '登录中...' : '登录' }}
      </button>
    </form>
  </div>
</template>
```

### 示例 4：自定义组合式函数（Composable）

```typescript
// composables/use-pagination.ts
import { ref, computed } from 'vue'

interface PaginationOptions {
  pageSize?: number
  initialPage?: number
}

interface PaginationState {
  currentPage: number
  pageSize: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export function usePagination<T>(
  fetchFn: (page: number, pageSize: number) => Promise<T[]>,
  options: PaginationOptions = {}
) {
  const currentPage = ref(options.initialPage ?? 1)
  const pageSize = ref(options.pageSize ?? 10)
  const total = ref(0)
  const data = ref<T[]>([])
  const loading = ref(false)
  
  const totalPages = computed(() => Math.ceil(total.value / pageSize.value))
  const hasNext = computed(() => currentPage.value < totalPages.value)
  const hasPrev = computed(() => currentPage.value > 1)
  
  async function loadPage(page: number) {
    loading.value = true
    try {
      data.value = await fetchFn(page, pageSize.value)
      currentPage.value = page
    } finally {
      loading.value = false
    }
  }
  
  async function nextPage() {
    if (hasNext.value) {
      await loadPage(currentPage.value + 1)
    }
  }
  
  async function prevPage() {
    if (hasPrev.value) {
      await loadPage(currentPage.value - 1)
    }
  }
  
  return {
    data,       // Ref<T[]>
    loading,    // Ref<boolean>
    currentPage, // Ref<number>
    pageSize,   // Ref<number>
    total,      // Ref<number>
    totalPages, // ComputedRef<number>
    hasNext,    // ComputedRef<boolean>
    hasPrev,    // ComputedRef<boolean>
    loadPage,
    nextPage,
    prevPage
  }
}

// 使用示例
interface Post {
  id: number
  title: string
}

// fetchFn 的类型约束保证了类型安全
const { data: posts, loading, hasNext, nextPage } = usePagination<Post>(
  async (page, size) => {
    const res = await fetch(`/api/posts?page=${page}&size=${size}`)
    return res.json()
  },
  { pageSize: 20 }
)

// posts.value → Post[]（类型安全）
// loading.value → boolean
</script>
```

---

## 4. 配置/环境示例

### tsconfig.json 的 Vue 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": [
      "vite/client"
    ]
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.vue",
    "env.d.ts"
  ],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### env.d.ts（Vue 文件类型声明）

```typescript
// env.d.ts
/// <reference types="vite/client" />

// 告诉 TypeScript .vue 文件是一个 Vue 组件
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
```

### Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
```

### Pinia 配置

```typescript
// main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
```

---

## 5. 必须掌握的技能

### 基础知识

- [x] 理解 `ref` 和 `reactive` 的区别及各自的适用场景
- [x] 掌握 `<script setup lang="ts">` 的语法和类型推导机制
- [x] 理解 `reactive` 解构丢失响应性的原因，掌握 `toRefs` / `toRef` 的正确使用

### 进阶技能

- [x] 能正确使用 `defineProps` 的泛型参数声明 Props 类型
- [x] 掌握 `defineEmits` 的类型参数语法（Vue 3.3+ 的泛型 emits）
- [x] 理解模板引用的类型标注：`InstanceType<typeof Component>`
- [x] 能在 `defineExpose` 中暴露方法并保留类型信息

### Pinia 状态管理

- [x] 掌握 Setup Store 语法的类型安全写法
- [x] 理解 Store 中 state、getters、actions 的类型自动推导
- [x] 能在组件中类型安全地使用 Store

### 实战能力

- [x] 能编写类型安全的组合式函数（Composables）
- [x] 理解泛型在 composables 中的应用
- [x] 会配置 Vue 3 + TypeScript 项目的 tsconfig 和 vite 配置
- [x] 理解 `.vue` 文件的模块声明（`env.d.ts`）

### 一句话总结

> **Vue 3 + TypeScript 的核心理念是"类型推导优先，手动标注为辅"——充分利用 Composition API 的天然类型友好特性，让 TypeScript 自动推导 90% 的类型，只在边界处手动声明。**

---

*下一章预告：第18章 TypeScript + Node.js 与全栈共享——从后端 ORM 到 tRPC 的完整类型安全方案*
