# 附录B JS→TS 迁移 Checklist

> **版本**: TypeScript 5.x 适用
> **目标读者**: 正在或将要把 JavaScript 项目迁移到 TypeScript 的团队

---

## 概述

将现有的 JavaScript 项目迁移到 TypeScript 是一项系统工程，涉及工具链搭建、代码转换、类型修复和团队习惯改变等多个层面。本附录提供一份**可操作的、步骤化的迁移清单**，覆盖从项目评估到完全类型覆盖的完整路径。

本附录适合以下读者：

- 计划将中型或大型 JS 项目迁移到 TS 的技术负责人
- 需要为团队制定迁移计划的开发者
- 正在进行渐进式迁移、希望对照检查是否遗漏步骤的工程师

---

## 详细内容

### 阶段 0：评估与准备

在接触编译器之前，先了解项目的规模、依赖状况和团队准备程度。

| 操作 | 命令 / 工具 | 验证方式 | 预期结果 |
|------|-------------|----------|----------|
| 统计项目文件数量和行数 | `find src -name '*.js' \| wc -l` 或 `cloc src` | 输出文件数和代码行数 | 明确迁移范围，评估工作量 |
| 识别第三方依赖的类型覆盖率 | `npx typescript@latest --showConfig` + 查阅 `node_modules/@types` | 列出已有 `@types/` 包 | 知道哪些库自带类型，哪些需要手动声明 |
| 确定最低支持的 Node/浏览器版本 | 查阅 `package.json` 的 `engines` 字段或项目文档 | 版本号明确 | 决定 `target` 和 `lib` 编译选项 |
| 安装 TypeScript 和必需的工具 | `npm install -D typescript @types/node ts-node` | `npx tsc --version` 输出版本号 | 编译器和 Node 类型可用 |
| 安装项目依赖的 @types 包 | `npx types-pkg install` 或逐个安装 `npm install -D @types/react @types/express ...` | `ls node_modules/@types` 列出已安装包 | 所有主要依赖的类型声明已就绪 |
| 团队 TypeScript 基础知识培训 | 内部 workshop 或推荐阅读官方 Handbook | 团队成员能独立阅读和理解 `.ts` 文件 | 团队具备基本的类型读写能力 |

### 阶段 1：引入 TypeScript 编译器

目标：让 `tsc` 能正常编译项目，不产生错误。此时所有文件仍是 `.js`，编译器只做转译，不做类型检查。

| 操作 | 命令 / 工具 | 验证方式 | 预期结果 |
|------|-------------|----------|----------|
| 在项目根目录生成 tsconfig.json | `npx tsc --init` | 文件存在且内容有效 | 获得默认配置的 tsconfig.json |
| 设置 allowJs: true | 编辑 tsconfig.json: `"allowJs": true` | `npx tsc --showConfig` 输出包含 `allowJs: true` | 编译器允许处理 `.js` 文件 |
| 设置 checkJs: false（显式关闭） | 编辑 tsconfig.json: `"checkJs": false` | JS 文件中的类型错误不报错 | 暂时不做类型检查，只做转译 |
| 设置 outDir 为独立输出目录 | 编辑 tsconfig.json: `"outDir": "dist"` | `npx tsc` 后 `ls dist` 看到输出文件 | 编译产物与源码分离 |
| 配置 include/exclude | `"include": ["src"], "exclude": ["node_modules", "dist"]` | `npx tsc --listFiles` 列出参与编译的文件列表 | 只编译项目源码，排除无关目录 |
| 设置 rootDir | `"rootDir": "src"` | 输出目录结构保持与 src 一致 | 输出路径与源码路径对齐 |
| 运行首次编译 | `npx tsc` | 终端无错误输出 | 所有 JS 文件成功转译到 dist |
| 将编译命令加入 package.json | `"scripts": { "build": "tsc" }` | `npm run build` 执行成功 | 团队可通过统一命令编译 |
| 配置 sourceMap | `"sourceMap": true` | dist 中生成 `.js.map` 文件 | 调试时可映射回原始源码 |

**验证命令**:

```bash
# 一次完成所有验证
npx tsc --noEmit    # 只检查不输出，确认无语法错误
npx tsc             # 实际编译，检查 dist 目录
```

### 阶段 2：开启 checkJs 渐进检查

目标：在 `.js` 文件上启用类型检查，利用 JSDoc 注释逐步添加类型信息，让团队适应类型思维。

| 操作 | 命令 / 工具 | 验证方式 | 预期结果 |
|------|-------------|----------|----------|
| 启用 checkJs: true | 编辑 tsconfig.json: `"checkJs": true` | `npx tsc --noEmit` 报告类型错误 | 编译器开始检查 JS 文件中的类型问题 |
| 在核心模块添加 JSDoc 类型注解 | 在函数/变量前加 `/** @param {string} name */` 等 | `npx tsc --noEmit` 该模块的错误减少 | 核心模块获得基本的类型信息 |
| 对暂时不处理的文件加 @ts-nocheck | 文件首行加 `// @ts-nocheck` | 该文件不再报错 | 按优先级逐步修复，不阻塞进度 |
| 对新文件启用 @ts-check 文件级检查 | 文件首行加 `// @ts-check` | 只有该文件接受类型检查 | 精确控制检查范围 |
| 修复 JSDoc 类型错误 | 根据错误信息修正类型注解 | `npx tsc --noEmit` 错误数量减少 | 类型错误逐步收敛 |
| 使用 @ts-expect-error 处理边界情况 | 在报错行前加 `// @ts-expect-error` 并附加注释 | 编译通过，错误被预期处理 | 已知问题被标记，未来可追踪 |
| 追踪 @ts-expect-error 数量 | `grep -r '@ts-expect-error' src \| wc -l` | 数量应随时间递减 | 技术债被持续监控 |

**验证命令**:

```bash
# 统计当前错误数量，作为基线
npx tsc --noEmit 2>&1 | grep -c "error TS"

# 追踪 @ts-expect-error 数量
grep -r '@ts-expect-error' src | wc -l
```

### 阶段 3：逐个文件迁移

目标：将 `.js` 文件重命名为 `.ts`，并添加完整的类型注解。按依赖图从叶子节点开始迁移。

| 操作 | 命令 / 工具 | 验证方式 | 预期结果 |
|------|-------------|----------|----------|
| 绘制模块依赖图 | `npx madge src --image deps.png` 或 `ts-morph` 脚本 | 生成依赖图可视化 | 明确文件迁移顺序：从叶子到根 |
| 从工具函数/Utils 开始迁移 | `mv src/utils/helper.js src/utils/helper.ts` | 文件名后缀变更 | 从无副作用的纯函数开始，风险最低 |
| 为导出函数添加完整类型签名 | 为参数和返回值添加类型注解 | `npx tsc --noEmit` 该文件无错误 | 函数接口类型明确 |
| 为内部变量添加类型（或推断） | 优先用类型推断，必要时显式注解 | 类型检查通过 | 变量类型明确 |
| 迁移数据模型/接口定义 | 用 `interface` 或 `type` 替换 JSDoc `@typedef` | 类型定义集中、可复用 | 数据模型类型化 |
| 处理 any 和 unknown | 能确定的类型用具体类型替换；不确定的先用 `unknown` + 类型收窄 | `grep -r ': any' src \| wc -l` 计数下降 | any 使用量逐步减少 |
| 迁移中间层模块（服务、控制器） | 依赖的叶子模块已迁移后，迁移上层模块 | 上层模块类型检查通过 | 依赖链完整的模块获得类型安全 |
| 迁移入口文件（main/index） | 最后迁移入口文件 | 全项目编译无错误 | 所有文件完成 .ts 转换 |
| 每次迁移后运行测试 | `npm test` | 测试全部通过 | 功能不受类型转换影响 |
| 提交代码并做 Code Review | `git add -A && git commit -m "migrate: ..."` | PR 审查通过 | 迁移变更被团队审查和记录 |

**推荐的迁移顺序**:

```
1. 工具函数 / 纯函数（无外部依赖）
2. 类型定义 / 常量 / 枚举
3. 数据访问层（DAO / Repository）
4. 服务层（Service / UseCase）
5. 控制器 / 路由 / 中间件
6. 入口文件 / 配置加载
```

### 阶段 4：开启严格模式

目标：逐步启用 TypeScript 的严格模式选项，消除最常见的类型安全隐患。

| 操作 | 命令 / 工具 | 验证方式 | 预期结果 |
|------|-------------|----------|----------|
| 启用 strictNullChecks | 编辑 tsconfig.json: `"strictNullChecks": true` | `npx tsc --noEmit` 报告新的 null/undefined 错误 | 发现潜在的 null 引用风险 |
| 修复 null/undefined 错误 | 添加 null 检查、可选链、空值合并 | 错误数量归零 | null 安全性得到保障 |
| 启用 noImplicitAny | 编辑 tsconfig.json: `"noImplicitAny": true` | 报告隐式 any 的错误位置 | 所有参数和返回值必须有类型 |
| 修复隐式 any | 为所有隐式 any 添加显式类型注解 | 错误数量归零 | 类型覆盖无死角 |
| 启用 strictPropertyInitialization | 编辑 tsconfig.json: `"strictPropertyInitialization": true` | 报告类属性未初始化的错误 | 类属性在构造函数中必须初始化 |
| 修复属性初始化错误 | 添加初始值或使用 `!` 非空断言 | 错误数量归零 | 类实例创建后状态完整 |
| 启用 strictFunctionTypes | 编辑 tsconfig.json: `"strictFunctionTypes": true` | 报告函数类型参数逆变/协变错误 | 函数类型检查更严格 |
| 启用 strictBindCallApply | 编辑 tsconfig.json: `"strictBindCallApply": true` | 报告 bind/call/apply 类型不匹配 | 函数调用方式更安全 |
| 启用 alwaysStrict | 编辑 tsconfig.json: `"alwaysStrict": true` | 编译后每个文件开头有 `"use strict"` | 所有代码运行在严格模式下 |
| 最终启用 strict: true | `"strict": true` 等价于开启以上所有选项 | `npx tsc --noEmit` 无错误 | 项目达到 TypeScript 最高安全级别 |

**各严格选项影响范围**:

| 选项 | 影响范围 | 典型修复成本 |
|------|----------|-------------|
| `strictNullChecks` | 最大，几乎影响所有文件 | 中～高 |
| `noImplicitAny` | 较大，影响无类型注解的函数 | 中 |
| `strictPropertyInitialization` | 影响类定义 | 低～中 |
| `strictFunctionTypes` | 影响函数类型和回调 | 低 |
| `strictBindCallApply` | 影响动态函数调用 | 低 |
| `alwaysStrict` | 纯语法转换，几乎无修复成本 | 极低 |

**验证命令**:

```bash
# 分别测试每个严格选项
npx tsc --strictNullChecks --noEmit
npx tsc --noImplicitAny --noEmit
npx tsc --strict --noEmit
```

### 阶段 5：完全类型覆盖

目标：项目达到 `strict: true`，第三方库类型完整覆盖，声明文件管理规范化。

| 操作 | 命令 / 工具 | 验证方式 | 预期结果 |
|------|-------------|----------|----------|
| 确保 tsconfig 中 `strict: true` | 检查 tsconfig.json | `"strict": true` | 所有严格选项已启用 |
| 为无 @types 的第三方库编写声明文件 | 创建 `src/types/xxx.d.ts` | `npx tsc --noEmit` 无模块找不到的错误 | 所有依赖都有类型声明 |
| 声明模块声明文件 | `declare module 'some-lib' { ... }` | 导入不报错 | 模块类型可用 |
| 声明全局类型 | 在 `.d.ts` 中使用 `declare global { ... }` | 全局变量和函数有类型 | 全局类型覆盖 |
| 消除项目中所有 @ts-expect-error | 逐条审查并修复 | `grep -r '@ts-expect-error' src` 无结果 | 没有隐藏的类型问题 |
| 将 any 替换为具体类型或 unknown | 审查所有 any 用法 | `grep -r ': any' src \| wc -l` 为零 | 全项目无显式 any |
| 配置 ESLint 的 TypeScript 规则 | `npm install -D @typescript-eslint/parser @typescript-eslint/eslint-plugin` | `npx eslint src` 通过 | 编码规范与类型检查双覆盖 |
| 在 CI 中加入类型检查 | 在 CI 配置文件添加 `npx tsc --noEmit` 步骤 | CI 构建日志中类型检查步骤通过 | 类型错误不会合并到主分支 |
| 将类型检查加入 pre-commit hook | `npx husky add .husky/pre-commit 'npx tsc --noEmit'` | `git commit` 时自动触发类型检查 | 提交前自动拦截类型错误 |
| 编写项目中高频模式的类型工具 | 如 `DeepPartial<T>`、`Nullable<T>`、`Result<T, E>` | 团队成员复用这些类型工具 | 类型工具库积累，提升开发效率 |
| 制定团队类型规范文档 | 记录团队的类型命名约定、泛型使用原则等 | 团队代码风格一致 | 类型风格长期可维护 |

**最终验证命令**:

```bash
# 终极验证：严格模式 + 无错误 + 无 any 遗漏
npx tsc --strict --noEmit
grep -r ': any' src | wc -l          # 期望输出: 0
grep -r '@ts-expect-error' src | wc -l  # 期望输出: 0

# 运行完整测试套件
npm test

# 生产构建
npm run build
```

### 技术债清理策略

迁移过程中不可避免地会产生技术债，以下策略帮助系统性地清理。

| 技术债类型 | 标识方法 | 清理策略 | 优先级 |
|-----------|----------|----------|--------|
| `@ts-expect-error` 注释 | `grep -r '@ts-expect-error' src` | 每次迭代修复 10-20 个，记录跟踪表 | 高 |
| 显式 `any` 类型 | `grep -r ': any' src` | 逐个替换为具体类型或 `unknown` | 高 |
| 隐式 `any` | `npx tsc --noImplicitAny --noEmit` | 为所有隐式 any 添加显式类型 | 高 |
| 缺失类型的第三方库 | `npx tsc --noEmit \| grep "Could not find a declaration file"` | 编写 `.d.ts` 声明文件 | 中 |
| 宽松的 `@types` 版本 | `npm outdated \| grep @types` | 更新到最新版本 | 中 |
| 测试文件缺少类型 | 检查测试文件是否也为 `.ts` | 将测试文件一并迁移 | 低 |
| JSDoc 注释残留 | `.ts` 文件中仍存在的 `@param` / `@returns` | 转换为 TypeScript 类型注解后删除 | 低 |

**@ts-expect-error 追踪表示例**:

```markdown
| # | 文件 | 行号 | 原因 | 责任人 | 创建日期 | 预期修复日期 |
|---|------|------|------|--------|----------|-------------|
| 1 | src/service/user.ts | 42 | 第三方 API 返回类型未定义 | 张三 | 2025-06-01 | 2025-06-15 |
| 2 | src/util/parser.ts | 18 | JSON.parse 返回类型待细化 | 李四 | 2025-06-03 | 2025-06-20 |
```

---

## 使用方式

1. **首次迁移**：按阶段 0 → 1 → 2 → 3 → 4 → 5 的顺序依次执行，每个阶段完成后再进入下一个。
2. **渐进式迁移**：如果时间有限，可以停留在阶段 2 或阶段 3 长期运行，逐步推进。
3. **对照检查**：每完成一个阶段，用该阶段的"验证方式"列确认是否达到预期结果。
4. **技术债管理**：在阶段 3-5 并行推进技术债清理，使用追踪表记录 `@ts-expect-error`。
5. **团队同步**：每个阶段完成后，在团队内做知识分享和阶段性回顾。

### 常见场景处理

| 场景 | 建议策略 |
|------|----------|
| **大型项目（>10万行）** | 停留在阶段 2 运行 1-2 个月，让团队适应后再进入阶段 3 |
| **小型项目（<1万行）** | 可直接进入阶段 3，逐文件迁移，1-2 周完成 |
| **第三方库无类型** | 优先查找社区 `@types/` 包；没有则编写最小声明文件 |
| **团队 TS 经验不足** | 阶段 2 拉长，用 JSDoc 培养类型思维后再进入阶段 3 |
| **有大量测试文件** | 测试文件与源码同步迁移，或先迁移源码再迁移测试 |
| **与 Babel 共存** | 使用 `@babel/preset-typescript` 做转译，`tsc` 只做类型检查 |

---

## 相关章节

- **第26章 平滑迁移与渐进式重构** — 详细介绍迁移策略、风险控制和大型项目迁移案例
- **第13章 tsconfig.json 配置详解** — 所有 tsconfig 选项的完整参考
- **第4章 类型注解** — 函数、变量、对象的类型注解语法
- **第5章 接口与类型别名** — `interface` 和 `type` 的用法和选择
- **第6章 泛型** — 泛型函数和泛型类型的定义与使用
- **第10章 声明文件** — `.d.ts` 文件的编写和发布
- **第11章 类型工具** — 内置工具类型和自定义类型工具

---

## 必须掌握的技能

完成本附录的学习和实践后，读者应掌握以下技能：

1. **项目评估能力**：能独立评估 JS 项目的迁移难度、工作量和风险点
2. **工具链搭建**：能配置 tsconfig.json、安装 @types 包、集成 ESLint 和 CI
3. **渐进式迁移执行**：能按阶段逐步推进迁移，在每个阶段控制风险
4. **类型错误修复**：能理解和修复 `strictNullChecks`、`noImplicitAny` 等严格模式下的类型错误
5. **声明文件编写**：能为无类型的第三方库编写基本的 `.d.ts` 声明文件
6. **技术债管理**：能追踪和管理迁移过程中产生的 `@ts-expect-error` 和 `any` 技术债
7. **团队协作**：能制定团队类型规范，在 Code Review 中检查类型质量
8. **CI/CD 集成**：能将类型检查集成到 CI 流水线和 pre-commit hook 中
