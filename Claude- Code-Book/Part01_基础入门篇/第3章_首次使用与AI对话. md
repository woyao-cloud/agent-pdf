# 第3章 首次使用：与 AI 对话

## 3.1 第一次对话

### 3.1.1 基本对话指令

当你首次启动 Claude Code 时，会进入交互式对话模式。本节将介绍基本的对话指令和技巧。

**启动对话**

```bash
# 简单启动
claude

# 指定项目目录
claude /path/to/your/project

# 带初始提示
claude "帮我理解这个项目的结构"
```

**首次对话的最佳实践**

1. **提供清晰的上下文**：告诉 Claude 你的项目是什么，你想要完成什么
2. **从简单开始**：第一次对话可以选择简单的任务
3. **观察响应方式**：了解 Claude 如何处理你的请求

**基本指令格式**

```
# 直接提问
什么是装饰器模式？

# 请求操作
帮我写一个函数来计算斐波那契数列

# 指定约束
用 Python 实现，要求时间复杂度为 O(n)

# 寻求解释
解释这段代码的逻辑
```

### 3.1.2 会话管理

有效的会话管理能够帮助你保持工作的连续性和条理性。

**会话命令**

```bash
# 查看帮助
claude --help

# 开始新会话
/new 或 /reset

# 保存当前会话
/save 或 /session save

# 列出历史会话
/sessions 或 /history

# 加载历史会话
/load <session-id>

# 退出会话
/exit 或 /quit 或 Ctrl+D
```

**会话命名**

给会话命名可以方便后续查找：

```bash
claude "这是一个关于用户认证模块的会话"
# 会话自动命名为: 2024-01-15-用户认证模块-001
```

**会话保存和恢复**

```bash
# 保存当前会话
/save my-session-name

# 加载历史会话
/load 2024-01-15-001
```

### 3.1.3 对话技巧

**清晰表达需求**

❌ 不好： "帮我写点代码"

✅ 好： "帮我写一个 Python 函数，接受一个整数列表，返回所有偶数的和"

**分解复杂任务**

❌ 不好： "帮我重构整个后端"

✅ 好： "先帮我重构 user.py 中的用户验证逻辑，然后我们再处理订单模块"

**提供背景信息**

```bash
# 包含背景
"这是一个 FastAPI 项目，使用 SQLAlchemy 作为 ORM。请帮我设计一个用户模型。"

# 不包含背景
"设计一个用户模型"
```

**使用代码块**

当需要 Claude 分析或修改代码时，使用代码块：

```
请分析这段代码：
```python
def process_data(data):
    result = []
    for item in data:
        if item['active']:
            result.append(item)
    return result
```
```

## 3.2 文件操作

文件操作是 Claude Code 最常用的功能之一。本节将详细介绍如何高效地进行文件操作。

### 3.2.1 读取文件

**基本读取**

```
# 读取单个文件
读取 src/main.py

# 读取多个文件
读取 src/main.py 和 src/config.py

# 读取并显示行号
读取 -n src/main.py
```

**读取选项**

```
# 读取特定行
读取 src/main.py:10-20

# 读取前 N 行
读取 -n 50 src/main.py

# 读取后 N 行
读取 -t 20 src/main.py

# 搜索后读取
读取 --grep "class User" src/
```

**读取二进制文件**

Claude Code 可以自动识别并处理多种文件类型：

```
# 读取图片（Claude 会描述图片内容）
读取 assets/logo.png

# 读取 PDF（Claude 可以提取文本）
读取 docs/manual.pdf
```

### 3.2.2 创建/编辑文件

**创建新文件**

```
# 简单创建
创建 src/utils.py，内容如下：
```python
def hello():
    print("Hello, World!")
```
```

**使用模板创建**

```
# 基于模板创建
创建 src/test_foo.py，使用 pytest 模板

# 指定文件结构
创建项目结构如下：
src/
  __init__.py
  main.py
  config.py
tests/
  __init__.py
  test_main.py
```

**编辑现有文件**

```
# 修改特定部分
在 src/main.py 的第 20 行添加：logging.basicConfig(level=logging.INFO)

# 替换内容
将 src/main.py 中的 "TODO" 替换为实际的实现

# 添加到文件末尾
在 src/utils.py 末尾添加一个日期格式化函数
```

**编辑模式**

Claude Code 支持多种编辑模式：

```
# 精确替换
Replace src/app.py line 45-50 with:
def new_function():
    pass

# 插入内容
Insert after src/app.py line 20:
    # New initialization code

# 删除内容
Delete src/app.py lines 100-105
```

### 3.2.3 批量操作

**批量创建文件**

```
# 批量创建测试文件
创建 tests/test_user.py, tests/test_order.py, tests/test_product.py

# 批量创建组件
创建 src/components/Button.tsx, src/components/Input.tsx, src/components/Card.tsx
```

**批量修改**

```
# 批量重命名
将 src/ 目录下所有 .js 文件重命名为 .ts

# 批量替换
将所有 Python 文件中的 "print" 替换为 "logger.info"

# 批量添加注释
为 src/ 目录下所有函数添加文档字符串
```

**条件批量操作**

```
# 只修改符合条件的文件
在所有包含 "TODO" 注释的 TypeScript 文件中，移除 // TODO 注释

# 基于文件内容选择
在所有导出类的文件中，添加 constructor 参数验证
```

## 3.3 Shell 命令执行

Claude Code 能够直接执行 Shell 命令，这在开发过程中非常有用。

### 3.3.1 命令执行原理

**执行流程**

当你在 Claude Code 中执行 Shell 命令时：

1. **命令解析**：Claude 解析你输入的命令
2. **权限检查**：验证命令是否在允许列表中
3. **执行命令**：在指定的 Shell 环境中运行
4. **结果返回**：将命令输出返回给对话上下文

**安全机制**

```
# 权限检查示例
输入: "运行 rm -rf /"
结果: [拒绝] 命令不在允许列表中

输入: "运行 npm install"
结果: [允许] 执行命令并返回输出
```

### 3.3.2 安全考虑

**危险命令警告**

Claude Code 会对潜在危险的操作发出警告：

```
# 尝试删除系统文件
> 删除 /etc/passwd
⚠️ 警告：这个操作会破坏系统稳定性。继续？
  - 确认执行
  - 取消

# 尝试强制覆盖
> 强制写入 config.py
⚠️ 警告：这将覆盖现有文件。继续？
  - 确认执行
  - 取消
```

**命令历史审计**

所有执行的命令都会被记录：

```bash
# 查看命令历史
claude /commands

# 输出格式：
# 2024-01-15 10:30: [允许] npm run build
# 2024-01-15 10:32: [拒绝] rm -rf /
# 2024-01-15 10:35: [允许] git push origin main
```

**沙箱执行**

对于不信任的命令，Claude Code 可以在沙箱环境中执行：

```
# 在沙箱中执行
在沙箱中运行: pip install untrusted-package

# 沙箱特点：
# - 隔离的文件系统
# - 限制的网络访问
# - 临时环境
# - 执行后可清理
```

### 3.3.3 输出解释

**输出格式化**

Claude Code 会智能格式化命令输出：

```
# 原始输出
$ npm test
> my-project@1.0.0 test
> jest

PASS  src/__tests__/index.test.js
PASS  src/__tests__/utils.test.js
Test Suites:  2 passed, 2 total
Tests:       15 passed, 15 total

# Claude 格式化后
✓ 2 test suites passed
✓ 15 tests passed
执行时间: 2.3s
```

**输出分析**

```
# 请求分析
运行 npm test 后，分析输出：
> "测试结果显示所有测试通过，没有失败用例。代码覆盖率为 78%。"

# 请求错误帮助
运行 python app.py 后出错：
> "这个错误是 ImportError，表示模块 'requests' 未安装。
> 解决方案：运行 pip install requests"
```

**输出重定向**

```
# 保存到文件
运行 pytest -v > test-results.txt

# 追加到文件
运行 npm test >> build-log.txt

# 通过管道处理
运行 git diff | claude "审查这些变更"
```

## 3.4 实战示例

### 3.4.1 项目初始化

让我们通过一个完整的示例，展示如何使用 Claude Code 初始化一个新项目。

**步骤 1：启动并提供上下文**

```bash
$ claude

> 我想创建一个新的 Python Flask 项目，名为 "todo-api"
> 项目用于管理待办事项，需要用户认证功能
```

**步骤 2：创建项目结构**

```
> 好的，我来帮你创建这个 Flask 项目。首先让我规划一下项目结构：
- app/：应用主目录
  - __init__.py：Flask 应用初始化
  - models/：数据模型
  - routes/：路由定义
  - utils/：工具函数
- tests/：测试文件
- config.py：配置文件
- requirements.txt：依赖
```

```
> 创建这些文件和目录结构
```

**步骤 3：配置依赖**

```
> 在 requirements.txt 中添加必要的依赖：
- flask
- flask-sqlalchemy
- flask-jwt-extended
- python-dotenv

> 运行 pip install -r requirements.txt
```

### 3.4.2 实现核心功能

**创建数据模型**

```
> 创建 app/models/user.py，实现用户模型
```

Claude 会生成：

```python
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }
```

**创建路由**

```
> 创建 app/routes/auth.py，实现用户认证路由
```

### 3.4.3 测试和验证

**编写测试**

```
> 使用 pytest 为用户模型编写单元测试
```

**运行测试**

```
> 运行 pytest -v
```

**修复问题**

如果测试失败：

```
> 分析测试失败的原因
```

## 本章小结

本章通过实际操作示例，展示了 Claude Code 的基本使用方法。通过本章的学习，你应该能够：

1. 启动 Claude Code 并进行基本对话
2. 熟练使用文件读取、创建和编辑功能
3. 理解 Shell 命令执行的原理和安全机制
4. 完成一个完整的项目初始化流程

## 练习题

1. 使用 Claude Code 创建一个新的 Python 项目
2. 尝试使用各种文件操作命令
3. 在项目中执行一些 Shell 命令
4. 模拟一个完整的开发流程：从创建到测试
5. 体验会话保存和恢复功能

## 参考资源

- 快速开始指南：https://docs. anthropic.com/claude- code/quick-start
- 命令参考：https://docs. anthropic.com/ claude-code/commands
- 示例项目：https://github.com/anthropics/claude-code-examples