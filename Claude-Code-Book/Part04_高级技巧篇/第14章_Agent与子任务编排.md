# 第14章 Agent 与子任务编排

## 14.1 Agent 系统概述

### 14.1.1 Agent 定义与分类

**什么是 Agent**

Agent 是能够自主完成任务的 AI 系统，具有以下特征：

- 自主决策能力
- 环境交互能力
- 持续执行能力
- 目标导向行为

**Agent 分类**

| 类型 | 特点 | 适用场景 |
|------|------|----------|
| 简单 Agent | 单次调用，直接响应 | 问答、简单任务 |
| 工具 Agent | 可调用外部工具 | 数据处理、代码生成 |
| 状态 Agent | 维护内部状态 | 多轮对话、复杂流程 |
| 多 Agent | 多个 Agent 协作 | 复杂系统、大任务 |

```python
class SimpleAgent:
    def run(self, task):
        return self.llm.complete(task)

class ToolAgent:
    def __init__(self):
        self.tools = [FileTool(), BashTool(), SearchTool()]

    def run(self, task):
        plan = self.plan(task)
        for step in plan:
            result = self.execute_step(step)
        return result
```

### 14.1.2 适用场景

**适合使用 Agent**

- 复杂的多步骤任务
- 需要调用多个工具
- 需要保持上下文
- 需要处理异常情况
- 需要并行执行多个子任务

**不适合使用 Agent**

- 简单的一次性任务
- 需要精确控制的任务
- 资源受限的环境
- 实时性要求高的任务

```bash
# 使用 Claude Code 的 Agent 模式
claude "分析整个代码库并生成安全审计报告"

# Claude 会自动：
# 1. 读取代码
# 2. 分析安全性
# 3. 生成报告
```

### 14.1.3 优势与局限

**优势**

1. **自动化**：减少人工干预
2. **一致性**：标准化处理流程
3. **可扩展**：容易扩展能力
4. **容错**：处理异常情况

**局限**

1. **不可预测**：可能产生意外结果
2. **资源消耗**：计算成本较高
3. **调试困难**：问题定位不易
4. **安全风险**：可能被恶意利用

## 14.2 子任务编排

### 14.2.1 任务分解策略

**分解原则**

1. **单一职责**：每个子任务只做一件事
2. **可独立执行**：子任务可以单独运行
3. **接口清晰**：子任务之间有明确定义
4. **层次分明**：按抽象层次组织

**分解方法**

```python
# 任务：生成一个完整的 Web 应用
# 分解为：
subtasks = [
    {"name": "设计数据库架构", "deps": []},
    {"name": "实现后端 API", "deps": ["设计数据库架构"]},
    {"name": "实现前端页面", "deps": []},
    {"name": "编写测试", "deps": ["实现后端 API", "实现前端页面"]},
    {"name": "部署上线", "deps": ["编写测试"]}
]
```

### 14.2.2 串行与并行

**串行执行**

```python
async def execute_serial(tasks):
    results = []
    for task in tasks:
        result = await execute(task)
        results.append(result)
    return results

# 依赖链：
# Task A -> Task B -> Task C -> Task D
```

**并行执行**

```python
async def execute_parallel(tasks):
    results = await asyncio.gather(*[execute(t) for t in tasks])
    return results

# 无依赖：
# Task A --
# Task B --
# Task C --
```

**混合执行**

```python
async def execute_mixed(task_graph):
    # 按层级并行执行
    for level in task_graph.levels:
        level_tasks = [task for task in level if task.ready()]
        results = await asyncio.gather(*[
            execute(t) for t in level_tasks
        ])
        task_graph.update_completed(results)
    return task_graph.results
```

### 14.2.3 错误处理与重试

**重试策略**

```python
class RetryStrategy:
    def __init__(self, max_retries=3, backoff=1):
        self.max_retries = max_retries
        self.backoff = backoff

    async def execute(self, func, *args):
        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                return await func(*args)
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    wait = self.backoff * (2 ** attempt)
                    await asyncio.sleep(wait)
        raise last_error
```

**错误恢复**

```python
class AgentErrorHandler:
    def __init__(self):
        self.recovery_strategies = {
            "file_not_found": self.recover_file,
            "timeout": self.retry_task,
            "permission_denied": self.request_permission
        }

    async def handle(self, error, context):
        error_type = error.__class__.__name__
        if error_type in self.recovery_strategies:
            return await self.recovery_strategies[error_type](error, context)
        raise error
```

## 14.3 实战：构建 Agent 系统

### 14.3.1 需求分析

**任务：构建代码审查 Agent**

```markdown
# 代码审查 Agent 需求

## 功能
1. 读取代码文件
2. 分析代码质量
3. 检查安全问题
4. 生成审查报告

## 工作流程
1. 接收代码路径
2. 扫描文件
3. 并行执行检查
4. 汇总结果
5. 生成报告

## 输出格式

```json
{
  "score": 85,
  "issues": [...],
  "suggestions": [...]
}
```
```

### 14.3.2 架构设计

**系统架构**

```python
class CodeReviewAgent:
    def __init__(self):
        self.analyzers = [
            SecurityAnalyzer(),
            QualityAnalyzer(),
            StyleAnalyzer()
        ]
        self.reporter = ReportGenerator()

    async def review(self, code_path):
        files = await self.scan(code_path)
        results = await self.analyze_parallel(files)
        report = await self.reporter.generate(results)
        return report

    async def analyze_parallel(self, files):
        tasks = [analyzer.analyze(files) for analyzer in self.analyzers]
        return await asyncio.gather(*tasks)
```

### 14.3.3 实现与优化

**基础实现**

```python
import aiofiles
from pathlib import Path

class CodeReviewAgent:
    async def analyze_file(self, file_path):
        async with aiofiles.open(file_path, 'r') as f:
            content = await f.read()

        issues = []
        # 安全检查
        issues.extend(await self.check_security(content))
        # 质量检查
        issues.extend(await self.check_quality(content))
        # 风格检查
        issues.extend(await self.check_style(content))

        return {"file": str(file_path), "issues": issues}

    async def check_security(self, content):
        # 实现安全检查逻辑
        pass
```

**性能优化**

```python
# 优化1：缓存分析结果
@lru_cache(maxsize=1000)
def analyze_code(analysis_type, file_hash):
    # 相同文件不重复分析
    pass

# 优化2：增量分析
async def incremental_review(changes):
    modified_files = [f for f in changes if f.modified]
    return await self.batch_analyze(modified_files)

# 优化3：并行分析池
semaphore = asyncio.Semaphore(5)

async def analyze_with_limit(file):
    async with semaphore:
        return await analyze_file(file)
```

## 本章小结

本章介绍了 Agent 与子任务编排。涵盖 Agent 定义、适用场景、子任务分解策略、串行与并行执行、错误处理与重试，以及实战构建 Agent 系统。

## 练习题

1. 设计一个任务拆解方案
2. 实现一个简单的 Agent 系统
3. 添加错误处理和重试机制
