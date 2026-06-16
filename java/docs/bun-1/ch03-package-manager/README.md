# 第3章：bun install 深度解析

## 概述

`bun install` 是 Bun 生态系统中最重要的命令之一。它不仅是一个包管理器，更是 Bun 整体架构中性能优化的集大成者。本章将深入剖析 `bun install` 的方方面面，从使用场景到底层实现，从潜在风险到最佳实践，帮助读者全面掌握 Bun 包管理器的能力。

在现代 JavaScript 和 TypeScript 开发中，包管理器是开发者每天都会使用的工具。从最初的 npm 到后来的 yarn、pnpm，再到如今的 bun，包管理器的发展历程反映了整个前端工程化领域的进步。Bun 的包管理器在兼容已有生态的基础上，通过全新的架构设计和实现，将依赖安装的速度提升到了前所未有的水平。

本章将按照从实践到理论、从基础到深入的顺序展开。首先介绍 bun install 的四种主要使用场景，然后深入分析其底层实现原理，接着讨论使用过程中的潜在风险和优化策略，最后通过三个完整的示例代码帮助读者巩固所学知识。

---

## 1. 使用场景

### 场景一：新项目初始化

当开发者启动一个新项目时，传统的做法是使用 `npm init` 或 `yarn init` 来生成 `package.json` 文件，然后通过 `npm install` 安装依赖。Bun 提供了完全兼容的替代方案，并且速度更快。

**基本用法：**

```bash
# 初始化项目（自动生成 package.json）
bun init

# 安装依赖
bun install

# 添加依赖
bun add express

# 添加开发依赖
bun add -d typescript

# 添加全局依赖
bun add -g nodemon

# 移除依赖
bun remove express

# 更新依赖
bun update

# 查看已安装的依赖树
bun pm ls
```

`bun init` 命令会交互式地引导用户创建 `package.json`，包括项目名称、版本、入口文件等基本信息。与 `npm init` 不同的是，`bun init` 默认会生成一个 TypeScript 友好的配置文件，包括 `tsconfig.json` 的基础模板。这反映了 Bun 对 TypeScript 的一等公民支持。

**`bun init` 的交互流程：**

```bash
$ bun init
package name (my-project):
entry point (index.ts):
  [bun] Initializing project...
  [bun] Created package.json
  [bun] Created tsconfig.json
  [bun] Created index.ts
  [bun] Done! Ready to code.
```

与 npm init 相比，bun init 的交互更加简洁，默认值也更加合理。它默认使用 TypeScript 作为入口文件类型，这符合现代前端开发的趋势。

**`bun add` 的多种用法：**

```bash
# 安装到 dependencies
bun add react

# 安装到 devDependencies
bun add -d typescript @types/node

# 安装到 optionalDependencies
bun add -o fsevents

# 安装到 peerDependencies
bun add -p react-dom

# 安装精确版本
bun add react@18.2.0

# 安装全局包
bun add -g nodemon

# 从 GitHub 安装
bun add github:user/repo

# 从本地路径安装
bun add ./packages/my-lib

# 从 tarball URL 安装
bun add https://example.com/package.tgz
```

**速度对比：**

在冷缓存（cold cache）场景下，首次安装 100 个依赖包，bun 的安装速度约为 5 秒，而 npm 需要约 60 秒。这是因为 bun 在多个层面进行了优化：

- 使用 Zig 编写的 HTTP 客户端，性能远高于 Node.js 的 HTTP 模块
- 并行下载所有依赖，而非 npm 的顺序下载
- 解析 `package.json` 时使用原生代码而非 JavaScript
- 全局缓存机制避免重复下载

**热缓存场景：**

在热缓存（warm cache）场景下，bun 的安装速度可以降至 1 秒以内。这是因为：

- 全局缓存中的包直接通过硬链接复制到项目的 `node_modules`
- 不需要重新下载、解压任何包
- 仅需要验证缓存中的版本与 `package.json` 中的约束是否匹配
- 锁文件的解析速度极快（二进制格式，约 5ms）

### 场景二：依赖安装

在已有项目中安装依赖是包管理器最核心的使用场景。`bun install` 在这一场景中展现出了显著的优势。

**兼容性说明：**

`bun install` 完全兼容 `package.json` 和 `package-lock.json`（以及 `yarn.lock`）。这意味着你可以在一个已有的 npm 或 yarn 项目中直接切换到 bun，而无需修改任何配置。

```bash
# 在已有项目中安装所有依赖
cd existing-project
bun install

# 安装特定版本
bun add react@18.2.0

# 从 package-lock.json 迁移到 bun.lockb
bun install  # 自动生成 bun.lockb
```

**锁文件处理策略：**

当 bun 检测到项目中同时存在 `package-lock.json`、`yarn.lock` 和 `bun.lockb` 时，它的优先级顺序是：

1. `bun.lockb` — 如果存在，完全信赖
2. `package-lock.json` — 如果存在 bun.lockb，忽略
3. `yarn.lock` — 最低优先级

当 `bun install` 运行时，如果检测到 `package-lock.json` 或 `yarn.lock` 但不存 `bun.lockb`，它会读取这些锁文件中的版本信息来确保一致性，然后生成自己的 `bun.lockb` 文件。

**迁移到 bun 的步骤：**

```bash
# 第一步：确保代码已提交
git add -A
git commit -m "backup before bun migration"

# 第二步：删除旧的锁文件和 node_modules
rm -rf node_modules package-lock.json yarn.lock

# 第三步：使用 bun 安装
bun install

# 第四步：验证项目可正常运行
bun run dev
bun run build

# 第五步：提交新的配置文件
git add -A
git commit -m "migrate from npm to bun"
```

**迁移过程中的注意事项：**

1. **scripts 兼容性** — bun 完全兼容 npm scripts，无需修改 `package.json` 中的 scripts 字段
2. **npx 替代方案** — `bunx` 可以替代 `npx`，用于执行一次性命令：`bunx create-react-app my-app`
3. **Node.js 版本** — bun 内置了 Node.js 兼容层，但某些依赖可能依赖于 Node.js 特有的 API
4. **原生模块** — 如果项目使用了 Node.js 原生模块（C++ addon），需要验证 bun 的兼容性

### 场景三：Monorepo 管理

Monorepo（单仓库多项目）是现代前端和后端工程中广泛使用的架构模式。Bun 通过内置的 workspaces 支持，提供了与 pnpm 和 yarn 类似的 monorepo 管理能力。

**为什么使用 Monorepo？**

在大型项目中，将代码拆分为多个独立包是一种常见的设计模式。Monorepo 相比于多仓库（Multi-repo）有以下优势：

1. **代码共享** — 多个项目可以直接引用公共的工具库和组件库，无需发布到 npm
2. **原子提交** — 跨多个包的修改可以在一个提交中完成，保证版本一致性
3. **统一构建** — 共享构建配置、lint 规则和测试框架
4. **简化依赖管理** — 公共依赖只需安装一次

**Workspaces 配置：**

```json
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ]
}
```

上述配置告诉 bun，`packages/` 和 `apps/` 目录下的每个子目录都是一个独立的包（workspace），它们之间可以相互依赖。

**Workspaces 的工作原理：**

当执行 `bun install` 时，bun 会执行以下步骤：

1. **扫描 workspace 声明** — 读取根目录 `package.json` 中的 `workspaces` 字段
2. **发现所有 workspace 包** — 遍历匹配的目录，读取每个子目录的 `package.json`
3. **构建依赖图** — 分析所有 workspace 包之间的依赖关系，确定安装顺序
4. **符号链接** — 将 workspace 包链接到根目录的 `node_modules` 中
5. **安装外部依赖** — 下载并安装所有非 workspace 的外部依赖

**与 pnpm workspaces 的对比：**

| 特性 | pnpm workspaces | bun workspaces |
|------|----------------|----------------|
| 链接方式 | 硬链接 + 符号链接 | 符号链接 |
| node_modules 结构 | 严格嵌套（非扁平） | 扁平（hoisted） |
| 磁盘空间优化 | 全局存储 + 硬链接 | 全局存储 + 硬链接 |
| 隐式依赖隔离 | 严格禁止 | 允许（同 npm） |
| 配置复杂度 | 需要 .npmrc | 零配置 |
| 速度 | 较快 | 最快 |

**常见 monorepo 模式：**

**模式 1：共享工具库**

```
my-project/
  packages/
    utils/          # 工具函数库
    ui/             # UI 组件库
    config/         # 共享配置
  apps/
    web/            # Web 应用
    mobile/         # 移动端应用
    api/            # API 服务
```

在这种模式下，`apps/web` 可以依赖 `packages/ui` 和 `packages/utils`，而 `packages/ui` 也可以依赖 `packages/utils`。所有包共享同一个 `node_modules`，版本完全一致。

**模式 2：渐进式迁移**

对于需要从 npm/yarn monorepo 迁移到 bun 的项目，可以采用渐进式策略：

```bash
# 第一步：在根目录安装 bun
npm install -g bun

# 第二步：使用 bun 安装依赖（无需修改 package.json）
bun install

# 第三步：验证构建是否正常
bun run build

# 第四步：将 CI 脚本中的 npm 替换为 bun
```

这种迁移方式的风险最低，因为 bun 保持了与 npm 的高度兼容性。

**模式 3：混合包管理器**

在某些团队中，可能需要在同一项目中混合使用 bun 和 pnpm。虽然不推荐，但可以通过以下方式实现：

```json
{
  "scripts": {
    "install:bun": "bun install",
    "install:pnpm": "pnpm install"
  }
}
```

**Workspaces 的最佳实践：**

1. **命名规范** — 使用 `@scope/name` 格式命名 workspace 包，避免与 npm 上的公共包冲突
2. **版本管理** — 在根 `package.json` 中统一管理公共依赖的版本
3. **构建缓存** — 使用 turborepo 或 nx 配合 bun workspaces 实现构建缓存
4. **CI 优化** — 在 CI 中缓存全局 bun 缓存目录加速安装

### 场景四：CI 环境

在持续集成（CI）环境中，依赖安装往往是整个流水线中最耗时的环节。Bun 在 CI 场景下有着显著的优势。

**为什么 bun 在 CI 中特别有优势？**

1. **安装速度快** — CI 环境通常是冷缓存，bun 的并行下载能力可以最大化利用 CI 的网络带宽
2. **二进制文件小** — bun 的二进制文件约 30MB，下载和安装非常快
3. **无需 Node.js** — bun 自带了 JavaScript 运行时，CI 中不需要额外安装 Node.js
4. **零配置** — 不需要 `.npmrc` 或其他配置文件

**GitHub Actions 配置示例：**

```yaml
name: CI
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Cache bun dependencies
        uses: actions/cache@v3
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
          restore-keys: |
            ${{ runner.os }}-bun-
      
      - name: Install dependencies
        run: bun install --frozen-lockfile
      
      - name: Run tests
        run: bun run test
      
      - name: Run lint
        run: bun run lint
```

**CI 优化要点：**

1. **使用 `--frozen-lockfile` 标志**：确保 CI 中安装的依赖版本与本地完全一致，防止锁文件被意外修改导致的不一致性。

2. **缓存全局缓存目录**：`~/.bun/install/cache` 是 bun 的全局缓存目录。在 CI 中缓存该目录可以显著加速后续的运行。

3. **缓存失效策略**：锁文件（`bun.lockb`）的哈希值作为缓存键（cache key）是最佳实践。当依赖发生变化时，缓存自动失效。

4. **Docker 镜像预热**：在 Docker 构建中，可以预先安装依赖来利用 Docker 的层缓存：

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
RUN bun run build
```

**CI 中的性能数据：**

| 环境 | 无缓存 | 有缓存 |
|------|--------|--------|
| npm CI | ~60s | ~20s |
| yarn --frozen-lockfile | ~40s | ~10s |
| pnpm install | ~25s | ~6s |
| bun install --frozen-lockfile | ~5s | ~1s |

**不同 CI 平台的配置：**

**CircleCI:**

```yaml
version: 2.1
orbs:
  bun: oven-sh/setup-bun@v1
jobs:
  test:
    docker:
      - image: cimg/base:stable
    steps:
      - checkout
      - bun/install
      - run: bun install --frozen-lockfile
      - run: bun run test
```

**GitLab CI:**

```yaml
image: oven/bun:latest

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - ~/.bun/install/cache

test:
  script:
    - bun install --frozen-lockfile
    - bun run test
```

**Jenkins:**

```groovy
pipeline {
  agent { docker { image 'oven/bun:latest' } }
  stages {
    stage('Install') {
      steps {
        sh 'bun install --frozen-lockfile'
      }
    }
    stage('Test') {
      steps {
        sh 'bun run test'
      }
    }
  }
}
```

### 性能对比总表

以下是 bun 与其他主流包管理器的全面对比：

| 特性 | npm | yarn classic | yarn berry | pnpm | bun |
|------|-----|-------------|------------|------|-----|
| 安装速度（冷缓存，50 包） | ~60s | ~40s | ~35s | ~25s | ~5s |
| 安装速度（热缓存，50 包） | ~15s | ~8s | ~7s | ~5s | ~1s |
| 安装速度（冷缓存，500 包） | ~180s | ~120s | ~100s | ~70s | ~15s |
| 安装速度（热缓存，500 包） | ~60s | ~30s | ~25s | ~15s | ~4s |
| lockfile 格式 | JSON | YAML | YAML | YAML | 二进制（protobuf） |
| lockfile 解析速度 | ~200ms | ~150ms | ~100ms | ~100ms | ~5ms |
| lockfile 文件大小（500 包） | ~500KB | ~400KB | ~350KB | ~400KB | ~100KB |
| 磁盘空间优化 | ❌ | ❌ | ❌ | ✅ 硬链接 | ✅ 硬链接 |
| Monorepo 支持 | 需要 lerna | workspaces | workspaces | workspaces | workspaces |
| 全局缓存 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 并行下载 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 零配置启动 | ❌ | ❌ | ❌ | 需要 .npmrc | ✅ |
| 隐式 hoisting | ✅ | ✅ | ❌ | ❌ | ✅ |
| TypeScript 原生支持 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 安装包大小 | ~50MB | ~30MB | ~25MB | ~15MB | ~30MB |
| 运行时内置 | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 2. 实现原理

### 2.1 全局缓存架构

Bun 的全局缓存是性能优化的核心基础。与 npm 不同（npm 没有全局缓存，每次安装都从 registry 下载），bun 将所有下载过的包存储在全局缓存目录中，供所有项目共享。

**缓存目录结构：**

```
~/.bun/install/cache/
  ├── express/
  │   ├── 4.18.2/
  │   │   ├── index.js
  │   │   ├── package.json
  │   │   └── ...
  │   └── 4.17.3/
  │       └── ...
  ├── lodash/
  │   └── 4.17.21/
  │       └── ...
  └── ...
```

**命名规则：**

缓存中的每个包按照 `<package-name>/<version>/` 的目录结构组织。这种结构的优点：

1. **直接映射** — 包名和版本号直接对应文件系统路径，无需额外索引
2. **并发安全** — 不同包的缓存操作互不干扰
3. **清理简单** — 直接删除目录即可清理特定版本的缓存

**缓存目录的配置：**

缓存目录可以通过环境变量 `BUN_INSTALL_CACHE_DIR` 来自定义：

```bash
# 自定义缓存目录
export BUN_INSTALL_CACHE_DIR=/path/to/custom/cache
bun install

# 或者在项目中指定
# bun 会优先使用环境变量，其次使用默认路径
```

**缓存的生命周期：**

1. **首次安装** — bun 从 registry 下载包，解压后存入缓存，然后复制到 `node_modules`
2. **后续安装（同一项目）** — bun 从缓存读取包，通过硬链接复制到 `node_modules`
3. **跨项目共享** — 项目 B 安装同一个包时，直接从缓存中硬链接，无需下载

**缓存下载流程的详细步骤：**

```
Step 1: 解析 package.json
    ↓
Step 2: 查询 registry，获取包信息
    ↓
Step 3: 检查缓存中是否已存在该包
    ├── 存在 → 从缓存硬链接到 node_modules
    └── 不存在 → 开始下载
          ↓
Step 4: 发送 HTTP 请求到 registry
    ↓
Step 5: 流式接收响应数据
    ↓
Step 6: 解压 tarball（边下载边解压）
    ↓
Step 7: 验证完整性哈希
    ↓
Step 8: 存入缓存目录
    ↓
Step 9: 从缓存硬链接到 node_modules
```

**缓存清理策略：**

bun 目前没有内置的缓存清理命令。推荐的清理方式：

```bash
# 查看缓存大小
du -sh ~/.bun/install/cache/

# 手动清理全部缓存
rm -rf ~/.bun/install/cache/*

# 清理特定包的缓存
rm -rf ~/.bun/install/cache/express/

# 保留最近 N 天修改的缓存
find ~/.bun/install/cache/ -atime +30 -delete
```

**缓存命中率的优化：**

在团队开发环境中，可以使用共享缓存目录来提高命中率：

```bash
# 在 CI 和开发环境中使用共享缓存目录
export BUN_INSTALL_CACHE_DIR=/shared/bun-cache
bun install
```

这种方式可以确保 CI 和本地开发使用相同的缓存，最大化缓存命中率。

**缓存目录的磁盘占用分析：**

随着使用时间的增长，缓存目录可能会变得非常大。以下是一些典型场景下的缓存大小：

| 场景 | 包数量 | 缓存大小 |
|------|--------|----------|
| 小型项目（10-20 包） | 50-100 版本 | ~50MB |
| 中型项目（50-100 包） | 200-500 版本 | ~200MB |
| 大型项目（200+ 包） | 500-2000 版本 | ~1GB |
| 多个项目累积 | 1000-5000 版本 | ~2-5GB |

### 2.2 硬链接机制

硬链接（Hard Link）是 bun 实现磁盘空间优化的核心技术。理解硬链接机制对于充分发挥 bun 的优势至关重要。

**什么是硬链接？**

硬链接是文件系统层面的概念。在 Unix/Linux 文件系统中，一个文件可以有多个硬链接，它们指向同一个 inode（物理存储块）。这意味着：

- 多个硬链接共享同一份物理数据
- 修改任意一个硬链接的内容，所有硬链接都会反映这个修改
- 只有当所有硬链接都被删除时，物理存储才会被释放
- 硬链接不能跨文件系统

**Bun 如何使用硬链接：**

当 bun 安装依赖时，它不会将包文件从缓存复制到项目的 `node_modules`，而是创建硬链接：

```
缓存中的文件 (物理存储)
  ~/.bun/install/cache/express/4.18.2/index.js
      ↑ 硬链接        ↑ 硬链接        ↑ 硬链接
      |               |               |
项目 A 的 node_modules  项目 B 的 node_modules  项目 C 的 node_modules
```

三个项目中的 `express/index.js` 都指向同一个物理文件。这意味着：

- **磁盘占用极小** — 无论多少个项目使用同一个版本的包，物理存储只有一份
- **安装速度极快** — 创建硬链接是文件系统级的操作，纳秒级完成
- **运行时完全透明** — 应用程序看到的是完整的文件，读取行为没有任何差异

**硬链接 vs 复制：性能对比**

| 操作 | 复制 | 硬链接 |
|------|------|--------|
| 100 个小文件 | ~10ms | ~0.1ms |
| 1000 个小文件 | ~100ms | ~1ms |
| 10000 个小文件 | ~1s | ~10ms |
| 磁盘占用 | 多份 | 一份 |
| 跨文件系统 | ✅ | ❌ |

**Copy on Write（COW）行为：**

硬链接的写时复制行为需要特别注意。当某个包在 `node_modules` 中被修改时（例如，开发者为了调试而修改了依赖包的源码）：

```
原始状态：
  缓存 inode #1001 ← 硬链接 1（缓存）← 硬链接 2（项目 A）

修改后：
  缓存 inode #1001 ← 硬链接 1（缓存）
  项目 A 的 node_modules ← inode #1002（新文件，内容已修改）
```

操作系统会自动为被修改的文件分配新的物理存储，这就是写时复制。这个过程对应用程序是完全透明的，开发者无需关心底层实现。

**Windows 上的硬链接支持：**

在 Windows 上，bun 使用 NTFS 的硬链接功能。Windows 的硬链接行为与 Unix/Linux 基本一致，但需要注意：

- Windows 上创建硬链接需要文件系统的支持（NTFS 支持，FAT32 不支持）
- Windows 上的硬链接不能跨卷（分区）
- Windows 上的硬链接权限模型略有不同
- Windows 上的硬链接要求管理员权限（在某些配置下）

**硬链接 vs 符号链接：**

| 特性 | 硬链接 | 符号链接 |
|------|--------|----------|
| 指向对象 | inode（物理数据） | 路径（字符串） |
| 跨文件系统 | ❌ | ✅ |
| 目标删除后 | 仍可用 | 断链（broken） |
| 目录支持 | ❌（仅文件） | ✅ |
| 性能 | 极高 | 高 |
| 磁盘空间 | 共享 | 共享 |
| 创建速度 | 纳秒级 | 纳秒级 |

Bun 在包级别使用硬链接（文件级别），在 workspace 级别使用符号链接（目录级别）。这种组合策略既保证了性能，又提供了灵活性。

**硬链接的局限性：**

1. **不能跨文件系统** — 如果缓存和 `node_modules` 在不同的文件系统或分区上，bun 会退化为复制操作
2. **不能用于目录** — 硬链接只能用于文件，不能用于目录。bun 通过为每个文件单独创建硬链接来解决这个问题
3. **修改传播** — 虽然通常不需要修改 `node_modules` 中的文件，但如果修改了，会影响所有使用该缓存的项目
4. **文件计数不准确** — 使用 `du` 等工具统计磁盘占用时，硬链接的文件可能被重复计算

### 2.3 二进制 lockfile

`bun.lockb` 是 Bun 使用的锁文件格式，它采用 Protocol Buffers（protobuf）编码，而非传统的 JSON 或 YAML 格式。

**为什么选择二进制格式？**

| 特性 | JSON (npm) | YAML (yarn/pnpm) | Protobuf (bun) |
|------|-----------|------------------|----------------|
| 解析速度 | ~200ms | ~150ms | ~5ms |
| 文件大小（500 包） | ~500KB | ~400KB | ~100KB |
| 人类可读 | ✅ | ✅ | ❌ |
| Git diff | ✅ | ✅ | ❌ |
| 版本兼容性 | 手动维护 | 手动维护 | 自动处理 |
| 结构化校验 | 运行时 | 运行时 | 编译时 |

**Protobuf 的优点：**

1. **极快的解析速度** — protobuf 是二进制编码，不需要字符串解析，直接映射到内存结构。对于包含数千个依赖的项目，解析时间从数百毫秒降至数毫秒。

2. **紧凑的编码** — protobuf 使用变长整数编码（varint）和紧凑的字段表示，生成的锁文件比 JSON 格式小 5-10 倍。

3. **严格的类型定义** — protobuf 要求预先定义消息格式，这意味着 `bun.lockb` 的结构是严格定义的，不会出现 JSON 中常见的字段名拼写错误或类型不一致问题。

4. **向前/向后兼容** — protobuf 的字段编号机制允许在保持向后兼容的同时添加新字段。

**bun.lockb 的内部结构（概念性）：**

```protobuf
message Lockfile {
  // 锁文件版本
  optional uint32 version = 1;
  
  // 所有包的信息
  repeated Package packages = 2;
  
  // Workspace 信息
  repeated Workspace workspaces = 3;
  
  // Registry 信息
  repeated Registry registries = 4;
  
  // 覆盖配置
  map<string, string> overrides = 5;
  
  // 信任的依赖列表
  repeated string trusted_dependencies = 6;
}

message Package {
  // 包名
  string name = 1;
  
  // 解析后的版本
  string version = 2;
  
  // 完整性校验哈希
  string integrity = 3;
  
  // 依赖列表
  map<string, string> dependencies = 4;
  
  // 可选依赖
  map<string, string> optional_dependencies = 5;
  
  // 对等依赖
  map<string, string> peer_dependencies = 6;
  
  // 解析后的依赖（完全解析后的版本）
  map<string, string> resolved_dependencies = 7;
  
  // 包类型（普通/workspace/链接等）
  enum PackageType {
    NORMAL = 0;
    WORKSPACE = 1;
    LINK = 2;
  }
  PackageType type = 8;
}
```

**bun.lockb 的生成过程：**

1. **读取 `package.json`** — bun 解析根目录和所有 workspace 的 `package.json`
2. **解析依赖树** — 递归解析所有依赖的版本范围，构建完整的依赖树
3. **去重和冲突解决** — 处理版本重叠和冲突，确保每个包只有一个版本被安装
4. **生成锁文件** — 将解析结果编码为 protobuf 格式写入 `bun.lockb`

**查看 bun.lockb 内容：**

```bash
# 将二进制锁文件转换为 JSON 格式输出
bun bun.lockb

# 保存为 JSON 文件
bun bun.lockb > lockfile.json

# 查看特定包的信息
bun bun.lockb | grep -A 10 '"express"'

# 统计锁文件中的包数量
bun bun.lockb | grep '"name"' | wc -l
```

**处理 bun.lockb 冲突：**

由于 `bun.lockb` 是二进制文件，无法像 JSON 锁文件那样进行 Git 合并。当出现冲突时，推荐的解决策略：

```bash
# 策略一：接受当前分支的版本，然后重新安装
git checkout --ours -- bun.lockb
bun install

# 策略二：接受合并分支的版本，然后重新安装
git checkout --theirs -- bun.lockb
bun install

# 策略三：删除锁文件，重新生成
rm bun.lockb
bun install
```

最佳实践是使用策略一或二，因为删除锁文件重新生成会导致所有依赖的版本被重新解析，可能引入意外的版本变化。

**锁文件验证：**

bun 提供了验证锁文件与 `package.json` 一致性的机制：

```bash
# 验证锁文件与 package.json 一致
bun install --frozen-lockfile

# 如果锁文件与 package.json 不一致，上述命令会失败
# 这在 CI 中特别有用
```

**锁文件的最佳实践：**

1. **始终提交 bun.lockb 到版本控制** — 这是确保可重现构建的关键
2. **在 .gitattributes 中将 bun.lockb 标记为二进制** — 防止 Git 尝试进行文本 diff
3. **使用 `--frozen-lockfile` 在 CI 中验证** — 确保 CI 和本地安装一致
4. **定期检查锁文件** — 使用 `bun bun.lockb` 查看锁文件内容

**.gitattributes 配置：**

```
bun.lockb binary diff=sha256
```

### 2.4 并行下载算法

Bun 的并行下载算法是其速度优势的核心之一。与传统包管理器的顺序下载不同，bun 使用高度并发的 HTTP 请求来同时下载所有依赖。

**下载架构对比：**

```
npm（顺序下载）:
  ┌─────────┐    ┌─────────┐    ┌─────────┐
  │ 包 A    │ →  │ 包 B    │ →  │ 包 C    │ → ...
  │ (2s)    │    │ (1.5s)  │    │ (1.8s)  │
  └─────────┘    └─────────┘    └─────────┘
  总时间: 5.3s + 解析时间

bun（并行下载）:
  ┌─────────┐
  │ 包 A    │ ─┐
  │ (2s)    │  │
  └─────────┘  │  ┌─────────┐
  ┌─────────┐  ├─→│ 解压队列 │ → node_modules
  │ 包 B    │ ─┘  └─────────┘
  │ (1.5s)  │
  └─────────┘
  ┌─────────┐
  │ 包 C    │ ─┘
  │ (1.8s)  │
  └─────────┘
  总时间: ~2s（取决于最慢的包）
```

**并发控制策略：**

Bun 使用以下策略来控制并发：

1. **动态并发数** — 根据网络状况动态调整并发请求数，初始默认 32 个并发连接
2. **连接复用** — 使用 HTTP/1.1 keep-alive 和 HTTP/2 多路复用来复用 TCP 连接
3. **请求优先级** — 先下载依赖树的叶子节点（没有自身依赖的包），再下载中间节点
4. **流式解压** — 边下载边解压，不需要等待完整下载后再解压

**与 npm 的并发对比：**

```javascript
// npm 的下载（简化示意）
async function npmInstall() {
  const tree = await resolveDependencyTree();
  // npm 是深度优先遍历，先处理一个分支再处理另一个
  for (const node of depthFirst(tree)) {
    await downloadAndExtract(node);
  }
}

// bun 的下载（简化示意）
async function bunInstall() {
  const tree = await resolveDependencyTree();
  const leaves = findLeafNodes(tree);
  // bun 是并行下载所有叶子节点
  await Promise.all(leaves.map(async (node) => {
    await downloadAndExtract(node);
    // 完成后处理其父节点
    await processParent(node.parent);
  }));
}
```

**网络优化的细节：**

1. **TCP 连接池** — bun 维护一个 TCP 连接池，复用与 registry 的连接，避免频繁的三次握手
2. **TLS 会话复用** — 对于 HTTPS 连接，bun 复用 TLS 会话，避免重复的 TLS 握手
3. **DNS 缓存** — bun 内部缓存 registry 的 DNS 解析结果，避免重复查询
4. **重试机制** — 对于失败的请求，bun 使用指数退避（exponential backoff）策略重试

**带宽控制：**

虽然 bun 默认使用高并发来最大化下载速度，但在某些场景下可能需要限制带宽：

```bash
# 通过环境变量限制并发数
export BUN_INSTALL_CONCURRENT_DOWNLOADS=8
bun install
```

**极端情况处理：**

在下载过程中，bun 会处理以下极端情况：

- **网络中断** — 自动重试失败的下载，最多重试 3 次
- **部分下载** — 如果下载中断，bun 会删除不完整的缓存文件，下次重新下载
- **校验失败** — 下载完成后验证包的完整性哈希（SHA-512），如果校验失败则重新下载
- **超时处理** — 单个请求超时 30 秒，超时后自动重试

**下载队列的实现原理：**

Bun 使用基于优先级的下载队列来管理并发请求：

```
下载队列（优先级排序）：
  [叶子节点] → [一级依赖] → [二级依赖] → ...

并发池（32 个插槽）：
  ┌────┬────┬────┬────┬────┬────┬────┬────┐
  │ 请求1 请求2 请求3 ... 请求32 │
  └────┴────┴────┴────┴────┴────┴────┴────┘

完成回调：
  当一个请求完成后，从队列中取出下一个请求
  如果请求失败，加入重试队列（最多 3 次）
```

### 2.5 依赖解析

依赖解析是包管理器最复杂的部分之一。Bun 的依赖解析算法在保证正确性的同时，力求最高效。

**版本范围解析：**

Bun 使用与 npm 兼容的 semver 解析算法，但实现上完全用 Zig 重写，性能大幅提升。

```json
{
  "dependencies": {
    "express": "^4.18.0",       // 兼容 4.x.x 且 >= 4.18.0
    "lodash": "~4.17.21",       // 兼容 4.17.x 且 >= 4.17.21
    "react": ">=17.0.0 <19.0.0", // 版本范围
    "vue": "3.2.0",             // 精确版本
    "typescript": "*",           // 任意版本
    "prettier": "latest"         // 最新版本
  }
}
```

**解析策略：**

当解析 `^4.18.0` 时，bun 的算法是：

1. 从 registry 获取 `express` 的所有版本列表
2. 筛选出符合 `^4.18.0` 的版本（`>=4.18.0 <5.0.0`）
3. 选择符合条件的最新版本（如 `4.18.2`）
4. 记录解析结果到 `bun.lockb`

**与 npm 解析的差异：**

虽然 bun 的版本范围语法与 npm 完全兼容，但在某些边界情况下存在差异：

| 场景 | npm | bun |
|------|-----|-----|
| `^0.2.3` 解析 | `>=0.2.3 <0.3.0` | `>=0.2.3 <0.3.0` |
| `^0.0.3` 解析 | `>=0.0.3 <0.0.4` | `>=0.0.3 <0.0.4` |
| `^1.2.3-beta.4` | `>=1.2.3-beta.4 <2.0.0` | `>=1.2.3-beta.4 <2.0.0` |
| 预发布标签优先级 | 较低 | 较低 |
| 空依赖集 | 报错 | 报错 |

在绝大多数情况下，bun 和 npm 的解析结果是一致的。

**依赖树构建：**

Bun 构建依赖树的过程分为两个阶段：

**阶段一：扁平化解析**

```
输入：
  root
    ├── react@^18.0.0
    └── react-dom@^18.0.0
          └── react@^18.0.0  (peer dependency)

解析过程：
  1. 确定 root 的直接依赖：react@^18.0.0, react-dom@^18.0.0
  2. 解析 react@^18.0.0 → react@18.2.0
  3. 解析 react-dom@^18.0.0 → react-dom@18.2.0
     - react-dom@18.2.0 需要 react@^18.0.0
     - react@18.2.0 已存在，满足约束 → 复用

结果（扁平化）：
  - react@18.2.0（安装一次）
  - react-dom@18.2.0
```

**阶段二：冲突解决**

当两个不同的依赖要求同一个包的不同版本时，bun 的冲突解决策略如下：

```
场景：
  root
    ├── pkg-a@^1.0.0
    │     └── lodash@^4.17.0
    └── pkg-b@^1.0.0
          └── lodash@^3.10.0

冲突：lodash@^4.17.0 vs lodash@^3.10.0

bun 的解决策略：
  1. 检查两个版本范围是否有交集
  2. 没有交集 → 安装两个版本
  3. 结果：
     - node_modules/lodash → lodash@4.17.21（最高版本）
     - pkg-b/node_modules/lodash → lodash@3.10.1
```

这种策略与 npm v3+ 的 hoisting 策略一致：尽量将包提升到顶层 `node_modules`，当版本冲突时，在子目录中安装冲突的版本。

**性能优化：**

Bun 在依赖解析阶段做了以下性能优化：

1. **懒惰解析** — 只在需要时才解析依赖，而非一次性解析所有依赖
2. **解析缓存** — 缓存已经解析过的包版本，避免重复请求 registry
3. **批量查询** — 使用 registry 的批量查询 API 一次获取多个包的信息
4. **并发解析** — 并行解析多个依赖树分支

**Registry 兼容性：**

Bun 支持以下类型的 registry：

```bash
# 默认使用 npmjs.org
bun install

# 使用自定义 registry
bun install --registry=https://registry.npmmirror.com

# 在 .npmrc 中配置
# registry=https://registry.npmmirror.com
```

支持的 registry 协议：
- HTTPS registry（标准 npm registry API）
- Verdaccio（本地 npm 代理）
- GitHub Packages
- AWS CodeArtifact
- 任何兼容 npm API 的 registry

**依赖解析的完整流程：**

```
输入: package.json
  │
  ▼
Step 1: 解析根 package.json
  │  - 读取 dependencies
  │  - 读取 devDependencies
  │  - 读取 peerDependencies
  │  - 读取 optionalDependencies
  │
  ▼
Step 2: 解析 workspace 配置
  │  - 读取 workspaces 字段
  │  - 扫描匹配的目录
  │  - 解析每个 workspace 的 package.json
  │
  ▼
Step 3: 构建初始依赖图
  │  - 创建依赖关系图
  │  - 标记直接依赖和间接依赖
  │
  ▼
Step 4: 解析直接依赖
  │  - 查询 registry 获取包信息
  │  - 应用版本范围约束
  │  - 选择最佳版本
  │
  ▼
Step 5: 递归解析间接依赖
  │  - 对每个直接依赖的依赖重复 Step 4
  │  - 直到所有依赖都被解析
  │
  ▼
Step 6: 扁平化和去重
  │  - 应用 hoisting 策略
  │  - 处理版本冲突
  │  - 确定最终的安装结构
  │
  ▼
Step 7: 生成 lockfile
  │  - 编码为 protobuf 格式
  │  - 写入 bun.lockb
  │
  ▼
输出: bun.lockb
```

---

## 3. 潜在风险与优化

### 3.1 二进制 lockfile 不可 Git Diff

这是 `bun.lockb` 最显著的局限性。由于锁文件是二进制格式，Git 无法对其内容进行逐行比较。

**影响：**

1. **代码审查困难** — 在 PR 审查中，无法通过 diff 看到依赖版本的具体变化
2. **冲突解决复杂** — 合并冲突时无法手动编辑锁文件
3. **审计困难** — 无法快速查看依赖树的变化

**应对策略：**

**策略一：使用 bun 提供的查看工具**

```bash
# 查看锁文件内容（JSON 格式输出）
bun bun.lockb

# 将锁文件转换为 JSON
bun bun.lockb > lockfile.json

# 比较两个锁文件
bun bun.lockb > lock-v1.json
git show HEAD:bun.lockb | bun > lock-v2.json
diff lock-v1.json lock-v2.json
```

**策略二：维护辅助文件**

在提交前运行 `bun bun.lockb > lock-summary.json` 并将生成的 JSON 文件一同提交，方便审查依赖变化。

```json
{
  "scripts": {
    "lock:diff": "bun bun.lockb | grep 'name\\|version\\|resolved' > .lock-summary.txt",
    "lock:check": "bun install --frozen-lockfile"
  }
}
```

**策略三：CI 自动检查**

在 CI 中添加步骤来验证锁文件的一致性，并生成差异报告：

```yaml
- name: Check lockfile consistency
  run: |
    bun bun.lockb > /tmp/lockfile-current.json
    git show HEAD:bun.lockb | bun > /tmp/lockfile-previous.json
    diff /tmp/lockfile-current.json /tmp/lockfile-previous.json || true
```

**策略四：使用 Git 的文本转换**

在 `.gitattributes` 中配置 bun.lockb 的 diff 行为：

```
bun.lockb diff=bun
```

然后在 Git 配置中添加自定义 diff 驱动：

```bash
git config diff.bun.textconv "bun bun.lockb"
```

这样 `git diff` 在比较 bun.lockb 时会自动将二进制格式转换为可读的 JSON 格式。

### 3.2 与 pnpm 的 node_modules 结构差异

Bun 使用扁平化的 `node_modules` 结构（与 npm 类似），这与 pnpm 的严格嵌套结构存在根本差异。

**pnpm 的 node_modules 结构：**

```
node_modules/
  .pnpm/
    express@4.18.2/
      node_modules/
        express/       # 硬链接
        body-parser/   # 硬链接
        ...
  express -> .pnpm/express@4.18.2/node_modules/express
```

**Bun 的 node_modules 结构：**

```
node_modules/
  express/
    index.js
    package.json
    ...
  body-parser/
    ...
```

**差异的影响：**

| 特性 | pnpm | bun |
|------|------|-----|
| 隐式依赖访问 | ❌ 严格禁止 | ✅ 允许 |
| 磁盘空间 | 极省 | 省 |
| 依赖隔离 | 完全隔离 | 不隔离 |
| 兼容性 | 可能破坏某些包 | 完全兼容 |
| 安装速度 | 较快 | 极快 |

**为什么要理解这个差异？**

当你从 pnpm 切换到 bun 时，需要注意以下问题：

1. **隐式依赖** — bun 允许访问未在 `package.json` 中声明的依赖（只要在依赖树中）。这可能会导致代码在 bun 下可以运行，但切换到其他包管理器时失败。

2. **安全性** — 扁平化的 `node_modules` 意味着所有依赖的依赖也对你的代码可见。这增加了供应链攻击的风险。如果一个间接依赖被恶意篡改，你的代码可能被影响。

3. **TypeScript 解析** — TypeScript 的类型查找算法在扁平化的 `node_modules` 中更容易找到类型定义。在 pnpm 中，TypeScript 可能需要额外的配置来解析类型。

**node_modules 结构对模块解析的影响：**

```javascript
// 在 bun 中（扁平化结构），以下代码可以正常工作
require('some-indirect-dependency'); // 虽然未在 package.json 中声明

// 在 pnpm 中（严格结构），上述代码会失败
// Error: Cannot find module 'some-indirect-dependency'
```

**如何检测隐式依赖：**

```bash
# 使用 eslint-plugin-import 检测未声明的依赖
# 在 .eslintrc 中配置：
{
  "rules": {
    "import/no-extraneous-dependencies": "error"
  }
}

# 或者使用 depcheck 工具
npx depcheck
```

### 3.3 私有 Registry 兼容性

Bun 对私有 registry 的兼容性总体良好，但仍有一些需要注意的地方。

**支持的认证方式：**

```ini
# .npmrc
registry=https://private-registry.example.com/
//private-registry.example.com/:username=myuser
//private-registry.example.com/:_password=base64encodedpassword
//private-registry.example.com/:email=user@example.com
```

**Bearer Token 认证：**

```ini
//private-registry.example.com/:_authToken=your-token-here
```

**作用域 registry：**

```ini
@mycompany:registry=https://private-registry.example.com/
//private-registry.example.com/:_authToken=your-token-here
```

**已知问题：**

1. **Verdaccio 兼容性** — bun 与 Verdaccio 的基本功能兼容，但某些高级功能（如 package 代理）可能需要额外配置
2. **AWS CodeArtifact** — 需要使用 AWS CLI 获取临时认证 token
3. **GitHub Packages** — 需要配置 `@scope:registry` 和认证 token
4. **认证信息缓存** — bun 可能不会像 npm 那样缓存认证信息，某些场景下需要每次运行时都提供认证

**调试私有 registry 问题：**

```bash
# 启用调试日志
BUN_DEBUG=1 bun install

# 测试 registry 连接
curl -I https://private-registry.example.com/

# 查看认证信息
cat .npmrc

# 测试特定包的查询
curl -H "Authorization: Bearer $NPM_TOKEN" \
  https://private-registry.example.com/@scope/package
```

**私有 registry 的最佳实践：**

1. **使用环境变量管理 token** — 不要在代码库中硬编码 token
2. **配置作用域 registry** — 只对私有包使用私有 registry，公共包仍从 npmjs.org 下载
3. **在 CI 中安全地传递 token** — 使用 CI 平台的 secrets 管理功能
4. **验证 registry 的可用性** — 在 CI 的第一步中测试 registry 连接

### 3.4 全局缓存膨胀问题

随着使用时间的增长，bun 的全局缓存可能会变得非常大。

**缓存膨胀的原因：**

1. **版本累积** — 每次安装不同版本的包，缓存中都会保留
2. **无用包** — 已不再使用的包版本不会被自动清理
3. **重复下载** — 如果某个包的完整性校验失败，会重新下载并缓存

**监控缓存大小：**

```bash
# 查看缓存总大小
du -sh ~/.bun/install/cache/

# 查看最大包的缓存
du -sh ~/.bun/install/cache/*/ | sort -rh | head -10

# 统计包版本数量
ls ~/.bun/install/cache/ | wc -l

# 查看每个包的版本数量
for pkg in ~/.bun/install/cache/*/; do
  count=$(ls "$pkg" 2>/dev/null | wc -l)
  if [ "$count" -gt 1 ]; then
    echo "$(basename "$pkg"): $count 个版本"
  fi
done
```

**缓存清理策略：**

**策略一：定期全量清理**

```bash
# crontab 中配置每周清理
0 0 * * 0 rm -rf ~/.bun/install/cache/*
```

**策略二：按使用时间清理**

```bash
# 清理 30 天前未使用的缓存
find ~/.bun/install/cache/ -atime +30 -delete
```

**策略三：选择性清理**

```bash
# 保留每个包最新的 3 个版本
for pkg in ~/.bun/install/cache/*/; do
  ls -t "$pkg" | tail -n +4 | while read version; do
    rm -rf "$pkg/$version"
  done
done
```

**建议：**

- 在 CI 环境中，每次运行前清理缓存可以避免缓存膨胀
- 在开发环境中，建议每月清理一次缓存
- 可以使用磁盘配额工具限制缓存目录的大小
- 考虑使用共享缓存服务器（如 Nexus 或 Verdaccio）作为团队缓存

### 3.5 CI 环境中的缓存策略

在 CI 中正确配置 bun 缓存是保证构建速度的关键。

**GitHub Actions 缓存配置：**

```yaml
- name: Cache bun dependencies
  uses: actions/cache@v3
  with:
    path: |
      ~/.bun/install/cache
      node_modules
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
    restore-keys: |
      ${{ runner.os }}-bun-
```

**多阶段缓存策略：**

```yaml
- name: Cache bun global cache
  uses: actions/cache@v3
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-global-${{ hashFiles('**/bun.lockb') }}
    restore-keys: |
      ${{ runner.os }}-bun-global-

- name: Cache node_modules
  uses: actions/cache@v3
  with:
    path: node_modules
    key: ${{ runner.os }}-bun-modules-${{ hashFiles('**/bun.lockb') }}
    restore-keys: |
      ${{ runner.os }}-bun-modules-
```

**缓存失效策略：**

| 场景 | 缓存键策略 | 效果 |
|------|-----------|------|
| lockfile 未变化 | 精确匹配 | 命中缓存，~1s 完成安装 |
| 添加了新依赖 | 回退匹配 | 部分命中，仅下载新增依赖 |
| lockfile 完全变化 | 无匹配 | 冷缓存，完整下载 |
| 分支切换 | 回退匹配 | 部分命中 |

**Docker 构建中的缓存：**

```dockerfile
# 基础层：安装操作系统依赖
FROM oven/bun:latest AS base
WORKDIR /app

# 依赖层：利用 Docker 层缓存
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --production

# 构建层
FROM base AS builder
COPY package.json bun.lockb ./
RUN bun install
COPY . .
RUN bun run build

# 运行层
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
CMD ["bun", "run", "start"]
```

这种分层构建策略确保了：
- 只有在 `package.json` 或 `bun.lockb` 变化时才重新安装依赖
- 构建镜像时利用 Docker 的层缓存加速
- 生产镜像不包含构建依赖，减小镜像大小

**CI 优化 checklist：**

- [ ] 是否配置了 bun 的全局缓存
- [ ] 是否使用了 `--frozen-lockfile` 标志
- [ ] 是否设置了合理的缓存键
- [ ] 是否考虑了缓存失效策略
- [ ] 是否在 Docker 构建中利用了层缓存
- [ ] 是否监控了缓存命中率
- [ ] 是否配置了 bun 的安装（使用 setup-bun action）
- [ ] 是否验证了锁文件的一致性

---

## 4. 典型问题处理

### 4.1 bun install 报 404

**现象：**

```bash
$ bun install
error: GET https://registry.npmjs.org/@private-pkg%2Fcore - 404
```

**原因：**

1. 包不存在于配置的 registry 中
2. 包是私有的，但未配置正确的认证信息
3. registry URL 配置错误
4. 包名拼写错误
5. 包已被 unpublish

**排查步骤：**

```bash
# 第一步：检查包是否存在
npm view @private-pkg/core

# 第二步：检查 registry 配置
cat .npmrc

# 第三步：检查认证信息
npm whoami --registry=https://private-registry.example.com/

# 第四步：检查 bun 的 registry 配置
bun config get registry

# 第五步：使用 curl 直接测试
curl -I https://registry.npmjs.org/@private-pkg%2Fcore
```

**解决方案：**

```ini
# 方案一：配置作用域 registry
@private-pkg:registry=https://private-registry.example.com/
//private-registry.example.com/:_authToken=your-token-here

# 方案二：使用 npm registry 镜像
registry=https://registry.npmmirror.com/

# 方案三：检查包名是否正确
# 注意作用域包的写法：@scope/package-name

# 方案四：如果包是私有的，确保已登录
npm login --registry=https://private-registry.example.com/
```

### 4.2 bun.lockb 冲突

**现象：**

在 Git 合并时，`bun.lockb` 文件产生冲突。

**解决方案：**

```bash
# 方案一：接受当前分支版本后重新安装（推荐）
git checkout --ours -- bun.lockb
bun install

# 方案二：接受合并分支版本后重新安装
git checkout --theirs -- bun.lockb
bun install

# 方案三：重新生成锁文件（不推荐）
rm bun.lockb
bun install
```

**为什么方案一和方案二优于方案三？**

方案三会完全重新解析所有依赖的版本，可能导致：
- 间接依赖的版本发生变化
- 引入非预期的破坏性变更
- 难以追踪版本变化
- 可能引入安全漏洞（如果解析到被污染的版本）

**最佳实践：**

1. 在 `git merge` 前确保 `bun.lockb` 是最新的
2. 合并后立即运行 `bun install` 更新锁文件
3. 在 CI 中使用 `bun install --frozen-lockfile` 验证锁文件一致性
4. 考虑在合并前使用 `bun bun.lockb > lockfile.json` 生成可 diff 的副本

### 4.3 与 package-lock.json 共存

**场景：**

团队中部分成员使用 npm，部分使用 bun，导致两个锁文件同时存在。

**问题：**

- 两个锁文件可能包含不一致的版本信息
- 每次切换工具都可能导致锁文件更新
- Git 提交历史中包含不必要的锁文件变更

**解决方案：**

**方案一：统一使用 bun（推荐）**

```json
{
  "scripts": {
    "postinstall": "rm -f package-lock.json"
  }
}
```

同时在 `.gitignore` 中添加：

```
package-lock.json
yarn.lock
```

**方案二：使用 .gitattributes 忽略 npm 锁文件**

```gitattributes
package-lock.json linguist-generated=true
yarn.lock linguist-generated=true
```

**方案三：在 CI 中强制使用一种锁文件**

```yaml
- name: Ensure only bun.lockb exists
  run: |
    rm -f package-lock.json yarn.lock
    bun install --frozen-lockfile
```

**方案四：完全迁移到 bun**

迁移步骤：
1. 通知团队成员统一使用 bun
2. 删除 `package-lock.json` 和 `yarn.lock`
3. 将 `bun.lockb` 加入版本控制
4. 更新 CI 配置
5. 更新开发文档

### 4.4 依赖版本不一致

**现象：**

不同环境下安装的依赖版本不同，导致"在我机器上能运行"的问题。

**原因：**

1. 锁文件未提交到版本控制
2. 锁文件未正确更新
3. 使用了宽松的版本范围（如 `*` 或 `^0.0.0`）
4. 不同环境使用了不同的 registry 镜像

**解决方案：**

```bash
# 确保锁文件已提交
git add bun.lockb
git commit -m "chore: update bun.lockb"

# 验证锁文件一致性
bun install --frozen-lockfile

# 检查实际安装的版本
bun pm ls

# 查看特定包的信息
bun pm ls express

# 比较不同环境的安装
bun bun.lockb > lockfile.json
# 在不同环境中运行上述命令，比较输出
```

**锁定所有依赖版本：**

```json
{
  "dependencies": {
    "express": "4.18.2",
    "lodash": "4.17.21"
  }
}
```

使用精确版本号可以避免意外升级，但也会错过补丁更新。推荐的做法是使用 `^` 范围加上锁文件来保证一致性。

**版本一致性的最佳实践：**

1. 始终提交锁文件
2. 在 CI 中使用 `--frozen-lockfile`
3. 定期运行 `bun update` 更新依赖
4. 使用 Dependabot 或 Renovate 自动管理依赖更新
5. 在 package.json 中使用合理的版本范围（推荐使用 `^`）

### 4.5 私有包认证

**场景：**

项目中依赖了私有 registry 中的包，需要配置认证信息。

**配置方法：**

```ini
# .npmrc（推荐放在项目根目录）
@mycompany:registry=https://npm.mycompany.com/
//npm.mycompany.com/:_authToken=${NPM_TOKEN}

# 也可以使用用户名密码
# //npm.mycompany.com/:username=myuser
# //npm.mycompany.com/:_password=${BASE64_PASSWORD}
# //npm.mycompany.com/:email=user@example.com
```

**环境变量配置：**

```bash
# 在 CI 中设置
export NPM_TOKEN=your-token-here

# 在本地开发中
export NPM_TOKEN=$(cat ~/.npmrc | grep _authToken | head -1 | cut -d= -f2)

# Windows PowerShell
$env:NPM_TOKEN="your-token-here"
```

**多 registry 配置：**

```ini
registry=https://registry.npmjs.org/
@internal:registry=https://internal-npm.example.com/
@internal2:registry=https://other-npm.example.com/
```

**认证调试：**

```bash
# 测试认证是否生效
curl -H "Authorization: Bearer $NPM_TOKEN" \
  https://npm.mycompany.com/@mycompany/core

# 查看 bun 使用的 registry
bun config get registry

# 使用详细模式查看认证过程
BUN_DEBUG=1 bun install

# 验证 .npmrc 配置
npm config list
```

**安全最佳实践：**

1. **不要将 token 提交到代码库** — 使用环境变量或 secrets 管理
2. **使用最小权限 token** — 只授予需要的权限
3. **定期轮换 token** — 设置 token 的过期时间
4. **使用作用域 registry** — 只对私有包使用私有 registry

---

## 5. 必备知识与技能

### 5.1 Semver 版本范围语法

Semver（语义化版本控制）是理解包管理器的基础。Bun 完全遵循 semver 规范。

**基本格式：**

```
主版本号.次版本号.补丁号[-预发布号][+构建元数据]
示例: 1.2.3-beta.1+sha.12345
```

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能新增
- **补丁号**：向下兼容的问题修复
- **预发布号**：不稳定版本，优先级低于正式版

**版本范围操作符：**

| 操作符 | 含义 | 示例 | 匹配范围 |
|--------|------|------|----------|
| `^` | 兼容主版本 | `^1.2.3` | `>=1.2.3 <2.0.0` |
| `~` | 兼容次版本 | `~1.2.3` | `>=1.2.3 <1.3.0` |
| `>=` | 大于等于 | `>=1.2.3` | `>=1.2.3` |
| `<=` | 小于等于 | `<=1.2.3` | `<=1.2.3` |
| `>` | 大于 | `>1.2.3` | `>1.2.3` |
| `<` | 小于 | `<1.2.3` | `<1.2.3` |
| `=` | 精确匹配 | `=1.2.3` | `1.2.3` |
| `-` | 范围 | `1.2.3 - 2.0.0` | `>=1.2.3 <=2.0.0` |
| `\|\|` | 或 | `1.x \|\| >=2.5.0` | 满足任一 |
| `x` | 通配 | `1.2.x` | `>=1.2.0 <1.3.0` |
| `*` | 任意 | `*` | 任意版本 |

**实际应用示例：**

```json
{
  "dependencies": {
    "express": "^4.18.0",       // 允许 4.18.x 补丁升级
    "lodash": "~4.17.21",      // 仅允许 4.17.x 补丁升级
    "react": "18.2.0",         // 精确版本，不允许任何升级
    "typescript": "5.x",       // 允许 5.x.x 任何版本
    "prettier": ">=2.0.0 <3.0.0",  // 版本范围
    "eslint": "^8.0.0 || ^9.0.0"   // 多个范围
  }
}
```

**预发布版本的处理：**

预发布版本（如 `1.0.0-beta.1`）在依赖解析中有特殊规则：

```
^1.0.0-beta.1
  - 匹配 1.0.0-beta.2 ✅
  - 匹配 1.0.0 ✅（如果没有预发布版本比 1.0.0-beta.1 更新）
  - 匹配 1.0.0-alpha.1 ❌（alpha 比 beta 旧）
```

预发布版本默认不会被自动匹配，除非依赖本身声明了预发布版本。

**常见的版本策略：**

| 策略 | 示例 | 优点 | 缺点 |
|------|------|------|------|
| 宽松策略 | `^1.0.0` | 自动获取补丁更新 | 可能引入破坏性变更 |
| 保守策略 | `~1.0.0` | 仅获取补丁更新 | 可能错过次版本的新功能 |
| 精确策略 | `1.0.0` | 完全可控 | 需要手动更新 |
| 最新策略 | `*` | 始终使用最新 | 极不稳定 |

### 5.2 Lockfile 的作用与原理

**Lockfile 的作用：**

锁文件（lockfile）是包管理器用来固定所有依赖（包括间接依赖）版本的文件。它的核心目标是确保可重现的安装。

**没有锁文件的问题：**

```
Day 1:
  package.json: express@^4.18.0
  npm install → express@4.18.1  (当时最新)

Day 30:
  package.json: express@^4.18.0（未修改）
  npm install → express@4.18.2  (4.18.2 已发布)
  
结果：两个安装结果不同，依赖版本不一致
```

**有锁文件的解决方案：**

```
Day 1:
  package.json: express@^4.18.0
  bun.lockb: express@4.18.1（锁定）
  bun install → express@4.18.1

Day 30:
  package.json: express@^4.18.0（未修改）
  bun.lockb: express@4.18.1（未修改）
  bun install → express@4.18.1（与 Day 1 完全一致）
```

**锁文件的内容：**

锁文件包含了以下关键信息：

1. **所有依赖的精确版本** — 不仅是直接依赖，还包括所有间接依赖
2. **完整性哈希** — 每个包的 SHA-512 哈希值，用于验证包内容的完整性
3. **解析后的依赖关系** — 每个包的 resolved dependencies
4. **Registry 信息** — 包来自哪个 registry
5. **Workspace 信息** — monorepo 中的 workspace 映射

**锁文件的生成策略：**

```bash
# 生成/更新锁文件
bun install

# 只使用锁文件安装（不更新锁文件）
bun install --frozen-lockfile

# 只使用锁文件安装（不更新锁文件，也忽略 package.json 变化）
bun install --frozen-lockfile --ignore-scripts
```

**锁文件与版本范围的关系：**

```
package.json: express@^4.18.0
     ↓
bun.lockb: express@4.18.2 (解析后的精确版本)
     ↓
node_modules: express@4.18.2 (安装的精确版本)
```

- `package.json` 定义版本范围（宽松约束）
- `bun.lockb` 锁定精确版本（严格约束）
- `node_modules` 安装锁文件中指定的版本

**何时需要更新锁文件：**

1. 添加或移除依赖
2. 更新依赖版本范围
3. 运行 `bun update` 命令
4. 合并包含锁文件变更的分支

### 5.3 Monorepo 管理策略

**什么是 Monorepo？**

Monorepo（单仓库）是将多个相关项目放在同一个版本控制仓库中的管理策略。与多仓库（Multi-repo）相比，Monorepo 有以下优缺点：

| 特性 | Monorepo | Multi-repo |
|------|----------|------------|
| 代码共享 | 直接引用 | 需要发布到 registry |
| 原子提交 | ✅ | ❌ |
| 一致性 | 版本统一 | 版本分散 |
| 构建复杂度 | 高 | 低 |
| Git 仓库大小 | 大 | 小 |
| 权限管理 | 统一 | 灵活 |

**Monorepo 工具对比：**

| 工具 | 特点 | 适用场景 |
|------|------|----------|
| bun workspaces | 内置、轻量、极快 | 中小型项目 |
| pnpm workspaces | 严格隔离、省磁盘 | 大型项目 |
| yarn workspaces | 生态成熟 | 已有 yarn 项目 |
| turborepo | 构建缓存、并行任务 | 需要构建编排 |
| nx | 智能依赖分析、分布式 | 超大型项目 |
| lerna | 发布管理 | 需要版本发布 |

**Monorepo 最佳实践：**

1. **命名规范** — 使用 `@scope/name` 命名空间避免包名冲突
2. **版本管理** — 使用统一的版本策略（统一版本或独立版本）
3. **依赖管理** — 尽量保持依赖版本一致，减少版本冲突
4. **构建策略** — 使用构建缓存和增量构建加速 CI
5. **测试策略** — 只测试受影响的包

**Monorepo 目录结构设计：**

```
my-monorepo/
  ├── package.json           # 根 package.json，声明 workspaces
  ├── bun.lockb              # 统一的锁文件
  ├── packages/              # 共享包
  │   ├── core/              # 核心库
  │   ├── utils/             # 工具库
  │   └── ui/                # UI 组件库
  ├── apps/                  # 应用
  │   ├── web/               # Web 应用
  │   ├── mobile/            # 移动端应用
  │   └── api/               # API 服务
  ├── tools/                 # 工具和脚本
  │   ├── eslint-config/     # ESLint 配置
  │   └── tsconfig/          # TypeScript 配置
  └── scripts/               # 构建和部署脚本
```

### 5.4 依赖解析算法

**依赖解析的基本流程：**

```
1. 读取根 package.json
2. 解析直接依赖的版本范围
3. 查询 registry 获取每个包的信息
4. 确定每个直接依赖的精确版本
5. 递归解析每个直接依赖的依赖
6. 构建完整的依赖树
7. 扁平化依赖树（hoisting）
8. 处理版本冲突
9. 生成锁文件
```

**版本冲突解决策略：**

当依赖树中出现同一个包的不同版本时，解析器需要决定如何处理。

**策略一：嵌套安装（npm v2 方式）**

```
node_modules/
  pkg-a/
    node_modules/
      lodash@4.17.21
  pkg-b/
    node_modules/
      lodash@3.10.1
```

**策略二：提升 + 嵌套（npm v3+, bun）**

```
node_modules/
  lodash@4.17.21    ← 提升到顶层
  pkg-a/
  pkg-b/
    node_modules/
      lodash@3.10.1 ← 冲突版本嵌套
```

**策略三：严格提升（pnpm）**

```
node_modules/
  .pnpm/
    lodash@4.17.21/
    lodash@3.10.1/
    pkg-a/
    pkg-b/
  pkg-a → .pnpm/pkg-a@1.0.0
  pkg-b → .pnpm/pkg-b@1.0.0
```

**Bun 的策略选择：**

Bun 使用策略二（提升 + 嵌套），原因：

1. **兼容性最好** — 与 npm v3+ 的行为一致，现有代码无需修改
2. **性能最优** — 扁平化结构使模块查找更快
3. **类型安全** — TypeScript 的类型解析在扁平化结构中更可靠

**依赖解析的边界情况：**

**情况一：循环依赖**

```json
{
  "name": "pkg-a",
  "dependencies": { "pkg-b": "^1.0.0" }
}
{
  "name": "pkg-b",
  "dependencies": { "pkg-a": "^1.0.0" }
}
```

Bun 可以处理循环依赖，但会在运行时可能出现问题。最佳实践是避免循环依赖。

**情况二：Peer 依赖**

```json
{
  "name": "react-plugin",
  "peerDependencies": {
    "react": "^18.0.0"
  }
}
```

Bun 会自动安装 peer 依赖，如果已存在兼容版本则复用。

**情况三：可选依赖**

```json
{
  "optionalDependencies": {
    "fsevents": "^2.3.2"
  }
}
```

如果可选依赖安装失败，bun 不会报错，而是继续安装过程。

**情况四：依赖覆盖（overrides）**

```json
{
  "overrides": {
    "lodash": "4.17.21",
    "react": "$react"
  }
}
```

Overrides 允许强制指定某个依赖的版本，即使其他依赖要求不同的版本。

---

## 6. 示例代码与配置

本章提供了三个示例程序，分别对应不同的使用场景。下面逐一进行详细讲解。

### 6.1 workspace-demo.ts 详解

**文件位置：** `examples/01-basic/workspace-demo.ts`

**功能概述：**

该脚本演示了如何使用 Bun 的 workspaces 功能创建一个临时的 monorepo 项目，包含两个 workspace 包（`@demo/utils` 和 `@demo/app`），并展示它们之间的依赖关系。

**代码逐段分析：**

```typescript
import { $ } from "bun";
```

导入 Bun 的内置 Shell 工具。`$` 是一个模板标签函数，可以像在 Shell 中一样执行命令，并自动处理输入输出。这是 Bun 的一个特色功能，比 Node.js 的 `child_process` API 更简洁。

```typescript
const tmpDir = "/tmp/bun-workspace-demo";
await $`rm -rf ${tmpDir} && mkdir -p ${tmpDir}/packages/{utils,app}`;
```

创建临时目录结构。`${}` 语法自动处理路径中的特殊字符，无需担心 Shell 注入问题。

**为什么使用临时目录？**

这个脚本设计为可重复运行，每次运行都会创建新的临时目录，演示完毕后自动清理。这样既不会污染文件系统，也方便多次测试。

**Workspace 配置要点：**

```json
{
  "name": "workspace-demo",
  "private": true,
  "workspaces": ["packages/*"]
}
```

- `private: true` — workspace 根目录不能发布到 npm registry
- `workspaces: ["packages/*"]` — 声明 workspace 包的位置

**依赖解析过程：**

当 `@demo/app` 依赖 `@demo/utils` 时，bun 的解析过程是：

1. 检查 `@demo/utils` 是否是一个 workspace 包 → 是
2. 创建符号链接：`node_modules/@demo/utils` → `packages/utils`
3. 不再从 registry 下载 `@demo/utils`

**符号链接验证：**

```typescript
await $`ls -la ${tmpDir}/node_modules/@demo/`;
```

输出类似：
```
lrwxr-xr-x  ...  @demo/utils -> ../../packages/utils
```

确认 `node_modules` 中的包是通过符号链接指向 workspace 目录的。

**学习要点：**

1. Bun 的 `$` Shell 工具提供了简洁的命令执行方式
2. Workspace 包之间通过符号链接实现本地引用
3. 无需发布包即可在项目内部使用
4. 所有 workspace 包共享同一个 `node_modules`

### 6.2 cache-analysis.ts 详解

**文件位置：** `examples/02-advanced/cache-analysis.ts`

**功能概述：**

该脚本分析了 Bun 的全局缓存目录，包括缓存的存在性、包数量和大小等信息。它帮助开发者理解 Bun 缓存的工作原理。

**代码逐段分析：**

```typescript
const cacheDir = process.env.BUN_INSTALL_CACHE_DIR || 
  resolve(process.env.HOME || "/root", ".bun/install/cache");
```

获取缓存目录路径。优先使用环境变量 `BUN_INSTALL_CACHE_DIR`，否则使用默认路径。这种设计允许用户自定义缓存位置。

**环境变量优先级：**

1. `BUN_INSTALL_CACHE_DIR` 环境变量（最高优先级）
2. 默认路径 `~/.bun/install/cache/`

**缓存目录遍历：**

```typescript
const entries = await readdir(cacheDir);
```

读取缓存目录中的所有条目。每个条目对应一个包名（如 `express`、`lodash`）。

**缓存大小的计算：**

```typescript
let totalSize = 0;
for (const entry of entries.slice(0, 20)) {
  const stats = await stat(resolve(cacheDir, entry));
  totalSize += stats.size;
  console.log(`  ${entry}: ${(stats.size / 1024).toFixed(1)} KB`);
}
```

脚本遍历前 20 个缓存条目，计算每个包的大小。注意：这里计算的是顶层条目的大小，实际上每个包目录下还有多个版本子目录。

**缓存结构的实际观察：**

```
~/.bun/install/cache/
  express/
    4.18.2/    ← 包的特定版本
    4.18.1/
  lodash/
    4.17.21/
```

每个版本目录包含完整的包内容（`package.json`、源码文件等）。

**学习要点：**

1. Bun 使用全局缓存避免重复下载
2. 缓存按 `<包名>/<版本>` 的结构组织
3. 可以通过环境变量自定义缓存位置
4. 缓存中的包通过硬链接共享到各个项目

### 6.3 monorepo-manager.ts 详解

**文件位置：** `examples/03-production/monorepo-manager.ts`

**功能概述：**

这是一个实用的 monorepo 管理工具，提供了扫描、列表、依赖分析和循环依赖检测等功能。它展示了 Bun 在 monorepo 管理中的实际应用。

**代码架构分析：**

```typescript
interface Package {
  name: string;
  path: string;
  version: string;
  dependencies: Record<string, string>;
}

class MonorepoManager {
  packages: Package[] = [];
  // ...
}
```

`MonorepoManager` 类封装了 monorepo 管理的主要功能，包括扫描、查询和依赖分析。

**扫描算法：**

```typescript
async scan(rootDir: string): Promise<void> {
  const { readdir, stat } = require("fs").promises;
  const entries = await readdir(rootDir);
  
  for (const entry of entries) {
    const pkgPath = `${rootDir}/${entry}`;
    const pkgJsonPath = `${pkgPath}/package.json`;
    const stats = await stat(pkgPath).catch(() => null);
    if (stats?.isDirectory()) {
      const pkgJson = Bun.file(pkgJsonPath);
      if (await pkgJson.exists()) {
        const pkg = await pkgJson.json();
        this.packages.push({...});
      }
    }
  }
}
```

扫描过程：
1. 读取根目录的所有条目
2. 检查每个条目是否为目录
3. 如果是目录，检查是否存在 `package.json`
4. 如果存在 `package.json`，解析并记录包信息

**依赖查询：**

```typescript
findDependents(packageName: string): string[] {
  return this.packages
    .filter(p => Object.keys(p.dependencies).includes(packageName))
    .map(p => p.name);
}
```

这个方法查找所有依赖指定包的其他包。例如，如果想知道哪些包依赖了 `lodash`，调用 `findDependents("lodash")` 即可。

**循环依赖检测：**

```typescript
detectCycles(): string[][] {
  const visited = new Set<string>();
  const cycles: string[][] = [];
  
  function dfs(current: string, path: string[], pkgs: Map<string, Package>): void {
    if (path.includes(current)) {
      cycles.push([...path.slice(path.indexOf(current)), current]);
      return;
    }
    if (visited.has(current)) return;
    visited.add(current);
    
    const pkg = pkgs.get(current);
    if (pkg) {
      for (const dep of Object.keys(pkg.dependencies)) {
        dfs(dep, [...path, current], pkgs);
      }
    }
  }
  // ...
}
```

循环依赖检测使用深度优先搜索（DFS）算法：
1. 从每个包开始进行 DFS 遍历
2. 记录当前路径上的所有节点
3. 如果遇到已在路径上的节点，说明存在循环
4. 输出所有检测到的循环

**Mock 仓库结构：**

```
mock-repo/
  package.json          ← 根配置，声明 workspaces
  packages/
    pkg-a/              ← 依赖 pkg-b
    pkg-b/              ← 依赖 pkg-c
    pkg-c/              ← 依赖 lodash
```

这个结构模拟了真实的 monorepo 场景：
- `pkg-a → pkg-b → pkg-c → lodash`
- 没有循环依赖
- 展示了依赖链的传递

**管理工具的实际应用：**

在生产环境中，`MonorepoManager` 可以扩展为：

1. **版本检查** — 检查所有 workspace 包使用的依赖版本是否一致
2. **依赖审计** — 分析依赖树，识别过时或有安全问题的依赖
3. **构建排序** — 根据依赖关系确定构建顺序
4. **变更影响分析** — 当某个包发生变化时，识别所有受影响的包

**学习要点：**

1. 使用 `Bun.file()` API 读取文件，比 `fs.readFile` 更简洁
2. DFS 算法可用于依赖分析和循环检测
3. `console.table()` 可以格式化输出表格数据
4. 依赖管理工具可以大幅提高 monorepo 的可维护性

---

## 总结

本章深入剖析了 `bun install` 命令的方方面面。从使用场景到实现原理，从潜在风险到最佳实践，我们全面地覆盖了 Bun 包管理器的核心功能。

**使用场景方面**，我们覆盖了新项目初始化、依赖安装、Monorepo 管理和 CI 环境四个主要场景。Bun 在所有这些场景中都展现出了显著的速度优势，特别是在冷缓存场景下，安装速度比 npm 快 10 倍以上。

**实现原理方面**，我们详细分析了全局缓存架构、硬链接机制、二进制 lockfile、并行下载算法和依赖解析算法。这些技术共同构成了 bun 高性能包管理的基础：

- 全局缓存避免重复下载，硬链接节省磁盘空间
- 二进制 lockfile 提供了极速的解析性能
- 并行下载算法最大化网络带宽利用率
- 智能依赖解析确保版本一致性

**潜在风险方面**，我们讨论了二进制 lockfile 的不可 diff 问题、与 pnpm 的结构差异、私有 registry 兼容性、缓存膨胀问题和 CI 缓存策略。理解这些风险有助于在实际项目中做出正确的技术选型。

**典型问题处理**，我们提供了 bun install 404 错误、锁文件冲突、与 npm 锁文件共存、依赖版本不一致和私有包认证等常见问题的解决方案。这些实战经验可以帮助读者快速解决日常工作中遇到的问题。

**必备知识与技能**，我们涵盖了 semver 版本范围语法、lockfile 原理、Monorepo 管理策略和依赖解析算法。这些知识是深入理解包管理器的基础，也是每个前端开发者应该掌握的技能。

**示例代码**，我们提供了三个实用示例：workspace 演示、缓存分析和 Monorepo 管理工具。这些代码可以直接运行，帮助读者在实践中理解概念。建议读者在本地环境运行这些示例，以加深对 Bun 包管理器的理解。

通过本章的学习，读者应该能够：

1. 熟练使用 `bun install` 进行日常依赖管理
2. 理解 Bun 包管理器的底层实现原理
3. 在实际项目中正确配置和使用 bun workspaces
4. 诊断和解决常见的依赖管理问题
5. 在 CI 环境中配置最优的缓存策略
6. 理解 semver 版本范围和锁文件的作用
7. 掌握 monorepo 管理的基本策略和工具

下一章将深入探讨 Bun 的运行时和脚本执行机制，包括 `bun run`、`bun test` 等核心命令的深度解析，敬请期待。

---

## 附录

### A. 常用命令速查表

| 命令 | 功能 | 等效 npm 命令 |
|------|------|--------------|
| `bun init` | 初始化项目 | `npm init` |
| `bun install` | 安装依赖 | `npm install` |
| `bun add <pkg>` | 添加依赖 | `npm install <pkg>` |
| `bun add -d <pkg>` | 添加开发依赖 | `npm install -D <pkg>` |
| `bun remove <pkg>` | 移除依赖 | `npm uninstall <pkg>` |
| `bun update` | 更新依赖 | `npm update` |
| `bun run <script>` | 运行脚本 | `npm run <script>` |
| `bunx <cmd>` | 执行命令 | `npx <cmd>` |
| `bun pm ls` | 查看依赖树 | `npm ls` |
| `bun pm cache` | 缓存管理 | `npm cache` |
| `bun bun.lockb` | 查看锁文件 | 无等效命令 |

### B. 环境变量参考

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `BUN_INSTALL_CACHE_DIR` | 缓存目录路径 | `~/.bun/install/cache` |
| `BUN_INSTALL_CONCURRENT_DOWNLOADS` | 并行下载数 | 32 |
| `BUN_DEBUG` | 启用调试日志 | 未设置 |
| `NPM_TOKEN` | npm 认证 token | 未设置 |
| `npm_config_registry` | registry URL | `https://registry.npmjs.org` |

### C. 常见 registry 镜像

| 名称 | URL | 适用地区 |
|------|-----|----------|
| npm 官方 | `https://registry.npmjs.org` | 全球 |
| 淘宝镜像 | `https://registry.npmmirror.com` | 中国大陆 |
| 华为云 | `https://repo.huaweicloud.com/repository/npm` | 中国大陆 |
| 腾讯云 | `https://mirrors.tencent.com/npm` | 中国大陆 |
| GitHub Packages | `https://npm.pkg.github.com` | 全球 |
