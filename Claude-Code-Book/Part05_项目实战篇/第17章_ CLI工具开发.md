# 第17章 CLI 工具开发：从零到生产

## 17.1 项目规划与初始化

### 17.1.1 需求分析

**CLI 工具需求模板**

```markdown
## 项目：task-manager-cli

## 类型：命令行工具

## 功能需求
1. 创建任务
2. 列出任务
3. 标记完成
4. 删除任务
5. 任务分类

## 技术选型
- 语言：Python
- 框架：Click 或 Typer
- 数据存储：SQLite 或 JSON
```

### 17.1.2 技术选型

**Python CLI 框架对比**

| 框架 | 特点 | 适用场景 |
|------|------|----------|
| Click | 功能丰富、生态好 | 复杂 CLI |
| Typer | 类型注解、Modern | 新项目 |
| argparse | 标准库、无依赖 | 简单工具 |

**推荐：使用 Typer**

```python
import typer
from typing import Optional

app = typer.Typer()

@app.command()
def hello(name: str):
    print(f"Hello {name}!")

if __name__ == "__main__":
    app()
```

### 17.1.3 项目结构

**推荐目录结构**

```text
task-manager/
├── src/
│   ├── __init__.py
│   ├── main.py          # 入口
│   ├── models.py        # 数据模型
│   ├── storage.py       # 存储
│   └── commands.py     # 命令
├── tests/
│   ├── __init__.py
│   └── test_commands.py
├── pyproject.toml       # 项目配置
├── README.md
└── requirements.txt
```

## 17.2 核心功能实现

### 17.2.1 命令行解析

**基本命令结构**

```python
import typer
from typing import Optional, List

app = typer.Typer(
    name="task",
    help="任务管理工具"
)

@app.command()
def create(
    title: str = typer.Argument(..., help="任务标题"),
    description: Optional[str] = Option(None, "-d", "--desc"),
    priority: str = Option("normal", "-p", "--priority")
) -> str:
    """创建新任务"""
    pass

@app.command()
def list(
    show_completed: bool = Option(False, "-a", "--all"),
    category: Optional[str] = Option(None, "-c", "--category")
):
    """列出所有任务"""
    pass

@app.command()
def complete(task_id: int):
    """标记任务完成"""
    pass

@app.command()
def delete(task_id: int, force: bool = Option(False, "-f", "--force")):
    """删除任务"""
    pass
```

### 17.2.2 业务逻辑

**任务模型**

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List
from enum import Enum

class Priority(Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"

class TaskStatus(Enum):
    PENDING = "pending"
    COMPLETED = "completed"

@dataclass
class Task:
    id: int
    title: str
    description: Optional[str] = None
    priority: Priority = Priority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    category: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
```

### 17.2.3 输出格式化

**格式化输出**

```python
from rich.console import Console
from rich.table import Table
from rich import print as rprint

console = Console()

def print_task_table(tasks: List[Task]):
    table = Table(title="任务列表")
    table.add_column("ID", style="cyan")
    table.add_column("标题", style="green")
    table.add_column("优先级", style="yellow")
    table.add_column("状态", style="magenta")
    table.add_column("分类")

    for task in tasks:
        table.add_row(
            str(task.id),
            task.title,
            task.priority.value,
            task.status.value,
            task.category or "-"
        )

    console.print(table)
```

## 17.3 生产级特性

### 17.3.1 错误处理

**完善的错误处理**

```python
import sys
from typer import Exit

try:
    app()
except ValueError as e:
    console.print(f"[red]错误:[/red] {e}", err=True)
    raise Exit(code=1)
except FileNotFoundError as e:
    console.print(f"[red]文件未找到:[/red] {e}", err=True)
    raise Exit(code=2)
except KeyboardInterrupt:
    console.print("\n[yellow]已取消[/yellow]")
    raise Exit(code=0)
```

### 17.3.2 日志系统

**日志配置**

```python
import logging
from logging.handlers import RotatingFileHandler

def setup_logging(log_file: str = "task-cli.log"):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            RotatingFileHandler(log_file, maxBytes=10485760, backupCount=3),
            logging.StreamHandler()
        ]
    )

logger = logging.getLogger(__name__)
```

### 17.3.3 自动化测试

**测试示例**

```python
import pytest
from typer.testing import CliRunner
from main import app

runner = CliRunner()

def test_create_task():
    result = runner.invoke(app, ["create", "测试任务", "-d", "描述"])
    assert result.exit_code == 0
    assert "任务已创建" in result.output

def test_list_tasks():
    result = runner.invoke(app, ["list"])
    assert result.exit_code == 0
    assert "任务列表" in result.output
```

### 17.3.4 发布与分发

**pyproject.toml 配置**

```toml
[build-system]
requires = ["setuptools>=65.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "task-manager-cli"
version = "1.0.0"
description = "一个简单的任务管理 CLI 工具"
authors = [{name = "Your Name", email = "you@example.com"}]
license = {text = "MIT"}
requires-python = ">=3.8"
dependencies = [
    "typer>=0.9.0",
    "rich>=13.0.0",
    "sqlalchemy>=2.0.0",
]

[project.scripts]
task = "src.main:app"

[project.urls]
Homepage = "https://github.com/you/task-cli"
```

**发布到 PyPI**

```bash
# 构建
python -m build

# 发布
twine upload dist/*
```

## 本章小结

本章介绍了 CLI 工具开发。涵盖需求分析、技术选型、项目结构、命令解析、业务逻辑、错误处理、日志系统、测试和发布。

## 练习题

1. 开发一个文件管理 CLI 工具
2. 添加自动完成功能
3. 发布到 PyPI
