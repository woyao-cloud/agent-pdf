# 第3章：首次使用与 AI 对话

## 章节概述

本章引导读者完成 Claude Code 的首次使用体验——从启动第一个会话，到与 AI 进行有效对话，再到完成实际的编程任务。与 AI 对话是一门需要学习的技能：同样的需求，不同的表达方式会导致截然不同的结果。本章将系统讲解如何提出高质量的问题、如何提供恰到好处的上下文、以及如何通过迭代式对话逐步逼近理想结果。读完本章，你将不再是"只会简单提问"的新手，而是能自如驾驭 AI 对话的熟练用户。

## 学习目标

读完本章，你将能够：
- 启动并管理 Claude Code 会话，理解会话的生命周期
- 掌握与 AI 有效沟通的四大技巧：清晰提问、上下文提供、粒度控制和迭代策略
- 通过对话完成文件创建、代码生成和代码修改等常见任务
- 理解对话历史的管理方法，知道何时压缩、何时开启新会话
- 独立解决常见的连接问题和错误

## 核心知识点

### 1. 启动会话

#### 从命令行启动

启动 Claude Code 就像启动任何其他命令行工具一样简单：

```bash
# 最基本的启动方式——在当前目录启动交互式会话
claude
```

执行上述命令后，你会看到 Claude Code 的初始化过程：

```
╭─────────────────────────────────────────╮
│                                         │
│   ✦ Claude Code                         │
│   AI-powered terminal coding agent      │
│   by Anthropic                          │
│                                         │
╰─────────────────────────────────────────╯

Initializing Claude Code in /home/user/project...
Analyzing project structure...
  ✓ Found 234 files in 18 directories
  ✓ Detected project type: Node.js (package.json found)
  ✓ Found 3 main entry points: src/index.js, src/app.js, src/routes.js

Claude Code is ready. How can I help you?
>
```

这个启动过程不只是"打开了一个聊天窗口"。Claude Code 在后台做了大量工作：分析项目结构、识别语言和框架、发现入口文件、读取关键配置。所有这些信息都会成为初始上下文的一部分，让 Claude Code 从一开始就对项目有所了解。

#### 会话初始化过程

启动时，Claude Code 会执行以下初始化步骤：

1. **工作目录分析**：递归扫描当前目录，构建文件树
2. **项目类型识别**：根据 `package.json`、`Cargo.toml`、`pom.xml` 等文件判断项目类型
3. **关键文件读取**：读取配置文件、入口文件、README 等
4. **依赖分析**：检查项目依赖和版本
5. **Git 状态检查**：查看当前分支、未提交的变更、远程仓库状态
6. **环境检测**：确保 Node.js、Python 等运行时可用

这一系列操作为后续的 AI 交互奠定了坚实的上下文基础。这就是为什么 Claude Code 在首次启动时就会花费几秒钟进行初始化的原因。

**带初始提示启动**：你可以在启动时直接传入任务描述，跳过打招呼的环节：

```bash
# 启动后立即执行任务
claude -p "分析 src/ 目录的代码质量，找出潜在问题"
```

`-p` 参数表示 "prompt"，Claude Code 会在初始化完成后立即处理这个提示，就像你手动输入了一样。

**非交互模式**：对于自动化场景，可以使用 `-e`（execute）参数：

```bash
# 执行单条指令后退出
claude -e "运行所有测试并报告结果"
```

#### 工作目录选择

工作目录的选择会影响 Claude Code 的上下文范围和行为。选择合适的目录非常重要：

| 场景 | 推荐的工作目录 | 原因 |
|------|--------------|------|
| 开发单个项目 | 项目根目录 | Claude Code 能理解完整项目结构 |
| 微服务项目 | 各服务的根目录 | 避免上下文被不相关的服务稀释 |
| 新项目开发 | 目标项目目录（可为空） | Claude Code 从零创建项目结构 |
| 学习和实验 | 临时目录（如 `~/sandbox`） | 避免影响现有项目 |

```bash
# 在项目根目录启动
cd /home/user/projects/my-app
claude

# 在子目录启动（Claude Code 会将父目录识别为项目边界）
cd /home/user/projects/my-app/src
claude
# 注意：在子目录启动可能限制 Claude Code 的上下文范围

# 在新目录创建项目
mkdir ~/projects/new-app
cd ~/projects/new-app
claude
```

选择工作目录时的一个经验法则：**让 Claude Code 能"看到"项目中最关键的文件**。如果你在 `src/` 目录下启动，而项目的配置文件在根目录，Claude Code 可能需要额外操作才能读取到它们。

### 2. 对话基础技巧

#### 如何提出清晰的问题

与 AI 对话的质量直接取决于输入的质量。以下是几个核心原则：

**原则一：明确目标，而非步骤**

不要这样说：
```
帮我写一个函数来处理用户输入。
```

这样说更有效：
```
帮我写一个函数 validateUserInput(input)，它接收用户输入的字符串，
需要检查：
1. 长度在 3-50 个字符之间
2. 只包含字母、数字和下划线
3. 不能以数字开头
如果验证失败，返回具体的错误信息。
```

前者给 AI 留下了太多猜测空间，而后者清晰界定了边界条件。AI 不需要猜测"用户输入"是什么意思，不需要猜测"处理"包含哪些操作。

**原则二：说明上下文位置**

告诉 AI 这段代码将用在什么地方：

```
在这个 React 组件中（src/components/UserForm.tsx），
我需要添加一个表单验证函数。
当前组件使用 Formik 做表单管理，已经定义了 validationSchema。
请参考已有的验证规则风格。
```

**原则三：指定输出格式**

如果你对输出有格式要求，提前说明：

```
用 TypeScript 写这个函数，包含完整的类型定义。
返回一个 Promise<UserData> 类型的值。
添加 JSDoc 注释。
```

#### 上下文提供的最佳实践

不是所有上下文都有用。提供过多无关信息会稀释 AI 的关注点，浪费 Token，甚至导致输出质量下降。

**高质量上下文的特征：**

| 特征 | 好的做法 | 不好的做法 |
|------|---------|-----------|
| 相关性强 | 提供与任务直接相关的文件 | 粘贴整个项目的 README |
| 结构清晰 | 说明文件路径、函数名称 | 复制粘贴 500 行不相关的代码 |
| 简洁完整 | 关键信息齐全且无冗余 | "参考我们以前的做法"（太模糊） |
| 即时性高 | 提供当前状态的代码 | 提供已经修改过的旧版本 |

**推荐的上下文提供方式：**

```bash
# 方式一：让 Claude Code 自己读取
> 请查看 src/config/database.ts 中的数据库配置，
  然后检查 src/models/User.ts 中的用户模型是否与之匹配。

# 方式二：提供关键信息摘要
> 我有一个 User 表，包含 id (int), name (string), email (string) 字段。
  请帮我写一个 Sequelize 模型。

# 方式三：指定参考文件
> 请参照 src/utils/helpers.ts 中的风格，
  在 src/utils/validators.ts 中添加一个 email 验证函数。
```

**何时需要手动提供信息：**

当任务依赖于你不确定 Claude Code 能否自行发现的信息时，明确说出来：

```
这个项目使用了 pnpm（不是 npm）作为包管理器，
测试框架是 Vitest（不是 Jest）。
请基于这些信息进行操作。
```

#### 指令的粒度控制

指令的精细程度应该与任务的复杂度和你的需求明确度相匹配：

**粗粒度指令**（适用于你信任 AI 的自主决策能力）：

```
为这个项目添加用户认证功能。
```

粗粒度指令给了 AI 最大的自主权。它会自行决定：
- 使用 JWT 还是 Session？
- 密码如何加密？
- 路由结构如何设计？
- 是否需要数据库？

**细粒度指令**（适用于你有明确的技术偏好）：

```
在 src/auth/ 目录下添加 JWT 认证功能：
1. 创建 src/auth/authMiddleware.ts —— Express 中间件，验证 JWT Token
2. 创建 src/auth/authController.ts —— 登录/注册/刷新 Token 的处理器
3. 创建 src/auth/authRoutes.ts —— 定义路由
4. 使用 bcrypt 加密密码，jsonwebtoken 生成 Token
5. Token 有效期设置为 24 小时
```

**混合粒度**（最实用的方式）：

```
为这个项目添加用户认证功能（我倾向于使用 JWT）。
风格可以参考现有路由的实现方式。
核心要求：密码加密、Token 验证、路由保护。
其他细节你来决定。
```

#### 迭代式对话策略

很少有一次对话就生成完美的代码。高效的 Claude Code 用户通常会采用迭代式的工作流：

**第一轮：生成基础版本**
```
> 帮我创建一个 Express 服务器，包含基本的 CRUD API。
```

**第二轮：审查并指出问题**
```
> 代码能工作，但有三个问题：
> 1. 没有错误处理中间件
> 2. 路由应该拆分到单独的文件
> 3. 缺少请求参数验证
> 请修复这些问题。
```

**第三轮：优化和完善**
```
> 现在添加以下功能：
> 1. 请求日志记录（使用 morgan）
> 2. CORS 支持
> 3. 环境变量配置（.env 文件）
```

**第四轮：测试检查**
```
> 帮我为这些 API 端点编写集成测试。
```

每轮对话都应该有一个明确的焦点。不要在一轮中要求太多事情，也不要期待一轮就能达到完美。AI 对话和人类协作一样，需要不断反馈和调整。

### 3. 简单任务实践

#### 文件创建与读取

**任务：创建一个新文件**

```bash
> 在项目根目录创建一个 README.md 文件，包含项目的基本介绍和安装说明。
```

Claude Code 会执行以下操作：

```
📝 创建文件: README.md
📝 写入内容... (120 行)
✅ 文件创建完成
```

**任务：读取并理解现有文件**

```bash
> 读取 src/index.js，然后解释这个文件的主要功能。
```

Claude Code 会先读取文件，然后进行分析：

```
📁 读取文件: src/index.js (156 行)

分析结果：
src/index.js 是应用的入口文件，主要功能包括：
1. 导入 Express 和相关中间件
2. 配置数据库连接（MongoDB）
3. 注册路由模块
4. 启动 HTTP 服务器监听 3000 端口
5. 全局错误处理
```

#### 代码生成与修改

**任务：生成新代码**

```bash
> 在 src/services/ 目录下创建 userService.js，
  包含以下函数：
  - getUserById(id)
  - createUser(data)
  - updateUser(id, data)
  - deleteUser(id)
  使用 Prisma ORM 访问数据库。
```

```
📝 创建文件: src/services/userService.js
📝 内容:
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getUserById(id) {
  return prisma.user.findUnique({ where: { id } });
}

async function createUser(data) {
  return prisma.user.create({ data });
}
// ... 更多代码 ...
✅ 文件创建完成
```

**任务：修改现有代码**

```bash
> 在 src/controllers/userController.js 中，
  给 createUser 函数添加输入验证：
  检查 email 格式是否正确，密码长度是否 ≥ 8 位。
  如果验证失败，返回 400 状态码和错误信息。
```

Claude Code 会先读取 `userController.js`，定位到 `createUser` 函数，然后进行精确修改：

```
📁 读取文件: src/controllers/userController.js
🔍 定位到 createUser 函数 (第 23-45 行)
📝 修改文件: src/controllers/userController.js
  - 在第 25 行后添加 email 格式验证
  - 在第 30 行后添加密码长度验证
  - 添加验证失败的错误响应
✅ 修改完成
```

#### 问题咨询与解释

Claude Code 不仅是一个代码生成工具，也是一个强大的代码咨询助手：

```bash
> 解释一下 JavaScript 中 Promise 和 async/await 的区别，
  并给出实际使用场景的例子。
```

```
Promise 和 async/await 的核心区别：

1. 语法层面：
   - Promise 使用 .then()/.catch() 链式调用
   - async/await 使用更接近同步代码的写法

2. 错误处理：
   - Promise 使用 .catch() 捕获错误
   - async/await 使用 try/catch 

3. 示例对比：
```

```javascript
// Promise 写法
function fetchUser(id) {
  return fetch(`/api/users/${id}`)
    .then(res => res.json())
    .then(data => data.user)
    .catch(err => console.error(err));
}

// async/await 写法
async function fetchUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    const data = await res.json();
    return data.user;
  } catch (err) {
    console.error(err);
  }
}
```

### 4. 对话管理

#### 会话中断与恢复

**中断处理**：如果终端会话意外断开（如关闭了终端窗口、SSH 连接超时），当前会话会丢失。Claude Code 目前不会自动保存会话状态。

**防止中断的技巧：**
- 使用 `tmux` 或 `screen` 等终端复用工具
- 在长任务执行期间不要关闭终端
- 定期提交代码，避免工作丢失

```bash
# 使用 tmux 保持会话
tmux new -s claude-session
claude
# 即使 SSH 断开，任务也会继续在 tmux 中运行
# 重新连接后：tmux attach -t claude-session
```

**恢复策略**：如果会话意外丢失，可以快速恢复到类似的状态：
1. 回忆之前的主要任务和决策
2. 在新会话中告知 Claude Code 之前的上下文
3. 参考 Git 提交记录恢复代码更改的上下文

#### 历史记录查看

Claude Code 会在终端中保留当前会话的滚动历史。你可以在终端中向上滚动来查看之前的对话。

更系统化的历史管理方式：

```bash
# 查看当前会话的状态
/status
# 输出：
# 会话时长: 45 分钟
# 消息轮次: 12
# 输入 Token: 45,678
# 输出 Token: 12,345

# 查看 Token 消耗详情
/cost
# 输出：
# 此会话总消耗: $0.32
```

**日志导出**（如果支持）：

```bash
# 将对话历史导出到文件
claude --log session-history.txt
```

#### 新会话启动时机

知道何时开启新会话是高效使用 Claude Code 的关键技能之一。

**应该开启新会话的情况：**

| 情况 | 原因 | 操作 |
|------|------|------|
| 任务主题彻底改变 | 旧上下文对新任务无帮助，反而浪费 Token | 开启新会话 |
| 对话超过 30-40 轮 | 上下文被早期对话稀释，模型"注意力"分散 | `/compact` 或新会话 |
| Cost 过高 | 每次请求携带大量历史，成本攀升 | 开启新会话 |
| 遇到奇怪的行为 | 模型"混淆"了早期和当前的任务目标 | 立即开启新会话 |
| 需要检查 git 状态 | Claude Code 的未提交更改可能跨会话 | 先提交再开新会话 |

**可以继续当前会话的情况：**

| 情况 | 原因 |
|------|------|
| 同一功能的迭代优化 | 保持上下文连续性，避免重复说明 |
| 逐步添加子功能 | 子功能与当前任务紧密相关 |
| 调试和修复 | AI 已经理解问题的上下文 |

**过渡技巧**：在切换会话前，让当前会话总结尚未完成的工作：

```bash
> 请在当前会话结束前，总结尚未完成的待办事项。
```

Claude Code 会输出类似这样的总结：

```
待办事项：
1. [未完成] 用户管理模块的删除功能
   - 需要添加 DELETE /api/users/:id 路由
   - 需要添加软删除逻辑

2. [已完成] 用户创建和查询功能
   - GET /api/users ✅
   - POST /api/users ✅
```

### 5. 常见问题与故障排除

#### 连接问题

**问题：启动时提示无法连接到 API**

```
Error: Could not connect to Anthropic API.
Please check your network connection and API key.
```

**排查步骤：**

```bash
# 步骤 1：检查 API Key 是否正确设置
echo $ANTHROPIC_API_KEY
# 应该输出以 sk-ant- 开头的字符串

# 步骤 2：检查网络连接
curl https://api.anthropic.com/v1/ping
# 应该返回正常响应

# 步骤 3：运行诊断命令
claude --doctor
```

**常见原因与解决方案：**

| 原因 | 表现 | 解决方案 |
|------|------|---------|
| API Key 未设置 | 提示认证失败 | 设置 `ANTHROPIC_API_KEY` 环境变量 |
| API Key 过期 | 401 认证错误 | 在 Anthropic Console 重新生成 Key |
| 网络被屏蔽 | 连接超时 | 检查代理/VPN 设置 |
| 区域限制 | 特定地区无法连接 | 检查 Anthropic 服务覆盖区域 |
| 账户余额不足 | API 返回 402 Payment Required | 充值账户余额 |

#### 响应超时处理

**问题：AI 响应时间过长或中断**

Claude Code 的响应时间受多种因素影响：

```bash
# 如果遇到超时，可以尝试：
# 1. 简化当前问题
> 先只生成 createUser 函数的骨架，不需要完整的实现。

# 2. 减少上下文
/compact
# 然后重新提问

# 3. 检查网络延迟
# 如果使用 VPN 或代理，尝试关闭后重试
```

**预估响应时间参考：**

| 任务类型 | 预期时间 | 说明 |
|---------|---------|------|
| 简单问答 | 1-3 秒 | 直接回答问题 |
| 单文件生成 | 3-10 秒 | 生成一个文件的代码 |
| 多文件任务 | 10-30 秒 | 涉及多个文件的创建/修改 |
| 复杂重构 | 30-60 秒 | 跨多个文件的协调修改 |
| 大型项目分析 | 1-3 分钟 | 扫描和分析大型代码库 |

#### 错误信息解读

Claude Code 的错误信息通常能直接指向问题根因。以下是最常见的错误类型：

**配置错误：**

```
Error: Invalid configuration in ~/.claude/claude.json
Details: Unknown configuration key "api_key" (did you mean "apiKey"?)
```
> 配置文件中的键名错误。检查 JSON 格式和键名拼写。

```
Error: Failed to parse configuration file
Details: Unexpected token } in JSON at position 156
```
> JSON 格式错误。检查是否有多余的逗号、括号不匹配等问题。

**权限错误：**

```
⚠️ 操作被拒绝: 没有读取 /etc/shadow 的权限
```
> 尝试读取系统保护文件。Claude Code 的安全模型阻止了此操作。

```
⚠️ 操作被拒绝: 执行命令 "sudo rm -rf /" 需要二次确认
```
> 高危命令被安全策略拦截。

**工具执行错误：**

```
❌ 命令执行失败 (exit code: 1)
npm ERR! code ENOENT
npm ERR! syscall open
npm ERR! path /home/user/project/package.json
```
> 命令执行出错——可能是缺少 `package.json`，或不在正确的目录中。

```
❌ 文件写入失败: 没有写入权限
Path: /usr/local/lib/node_modules/
```
> 写入系统目录需要管理员权限。建议写入项目目录。

**通用故障排除流程：**

```bash
# 使用 /doctor 命令进行全面诊断
claude --doctor
```

`/doctor` 或 `claude --doctor` 会检查：
- Node.js 版本是否满足要求
- npm 配置是否正确
- 网络连接是否正常
- API Key 是否有效
- 配置文件是否有错误
- 环境变量是否正确设置

## 实战练习

**练习：通过 Claude Code 创建并完善一个 "Hello World" Web 应用**

1. 创建一个新目录并启动 Claude Code：
   ```bash
   mkdir ~/hello-claude
   cd ~/hello-claude
   claude
   ```

2. 在 Claude Code 中输入：
   ```
   创建一个 Node.js + Express 的 Web 应用，包含一个路由 /hello/:name，
   返回 "Hello, {name}!" 的 JSON 响应。使用 ES modules 语法。
   ```

3. 审查生成的代码，然后要求优化：
   ```
   添加一个根路由 /，返回 HTML 页面，显示当前时间。
   并在页面中加入一个简单的计数器按钮（纯前端 JavaScript）。
   ```

4. 启动应用验证：
   ```
   帮我配置 package.json 的启动脚本，然后启动服务器。
   我需要能在 http://localhost:3000 访问。
   ```

5. 完成练习后，输入 `/exit` 退出会话。

## 本章小结

1. 启动 Claude Code 只需在项目目录中执行 `claude` 命令。启动时它会自动分析项目结构、识别框架和依赖，为后续对话构建上下文基础。可使用 `-p` 参数直接传入初始提示。

2. 高质量对话的核心四要素：① 明确目标而非步骤——告诉 AI"做什么"而非"怎么做"；② 提供高质量的上下文——相关、简洁、即时；③ 指令粒度从粗到细灵活切换——信任 AI 时用粗粒度，有明确偏好时用细粒度；④ 采用迭代策略——先出基础版本，再逐步优化，每轮聚焦一个主题。

3. Claude Code 能执行三类典型任务：文件创建与读取（新文件、现有文件分析）、代码生成与修改（增量添加功能、精确修改现有代码）、问题咨询与解释（技术概念讲解、代码评审）。

4. 对话管理的关键是知道何时开启新会话：任务主题彻底改变、对话超过 30 轮、Cost 过高、AI 出现混乱行为时都应开启新会话。同一功能的迭代优化和调试可继续当前会话。

5. 常见问题大多可以通过 `/doctor` 诊断命令解决：连接问题主要检查 API Key 和网络；响应超时可尝试简化问题或执行 `/compact` 压缩上下文；配置文件错误需检查 JSON 格式和键名。

## 思考题

1. **在与 AI 对话时，提供上下文的最佳策略是什么？**
   > **提示**：思考"上下文质量"而非"上下文数量"。最佳策略包括：① 相关性优先——只提供与当前任务直接相关的代码和说明，不相关的信息会分散 AI 的注意力；② 让 Claude Code 自行读取——通过文件名和路径引用让 AI 自己读取文件，这比粘贴代码更高效；③ 明确约定——如果项目使用了特定框架、库或代码风格，提前告知 AI；④ 补充隐式知识——AI 不可能知道你的商业逻辑、团队约定等未写入代码的信息，需要你明确告知。一句话总结：少而精，直击要点。

2. **什么情况下应该开启新会话而不是继续当前对话？**
   > **提示**：从"上下文效用递减"的角度考虑。以下信号表明需要新会话：① 发现 AI 开始混淆不同任务的细节（比如把 A 功能的需求应用到 B 功能中）；② 每次请求的成本明显增加（通过 `/cost` 监控），但新增的对话历史对当前任务无帮助；③ 任务主题发生了根本性变化（从"实现登录功能"变成了"优化数据库查询"）；④ `/compact` 之后仍然感觉 AI 的表现不佳。经验法则：每天开始工作时开启一个新的会话，每次开始一个独立的功能开发时也开启新会话。