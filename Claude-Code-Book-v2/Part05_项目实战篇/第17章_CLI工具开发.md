# 第17章：CLI 工具开发

## 章节概述

本章通过一个完整的 CLI 工具开发项目——文件批量重命名工具 `bulkrename`，展示如何使用 Claude Code 从零开始构建命令行应用。你将学会从需求分析、项目骨架生成、核心功能实现、用户体验优化到打包发布的完整流程。CLI 工具是 Claude Code 最擅长的生成方向之一，因为命令行接口定义清晰、功能边界明确，非常适合让 AI 辅助生成。

## 学习目标

- 掌握使用 Claude Code 开发 CLI 工具的完整流程
- 学会从需求描述生成项目骨架
- 理解命令行参数解析和用户交互设计
- 能够完成 CLI 工具的打包和发布

## 核心知识点

### 1. 项目初始化

#### 需求分析与功能定义

在开始编码之前，先用自然语言向 Claude Code 描述需求，这是最关键的一步。对于文件批量重命名工具，你需要考虑以下功能点：

- 支持多种重命名模式（替换、添加前缀/后缀、序号编号、正则替换）
- 支持过滤条件（文件类型、名称匹配）
- 支持预览模式（不实际执行，只显示将要发生的变更）
- 支持撤销操作（恢复上一次重命名）
- 支持递归处理子目录
- 彩色输出和进度指示

在与 Claude Code 对话时，可以这样开始：

```
/start 我需要开发一个 Python CLI 工具叫做 bulkrename，用于批量重命名文件。
主要功能包括：
1. 支持替换文件名中的指定字符串
2. 支持添加前缀或后缀
3. 支持按序号编号（如 file_001.jpg）
4. 支持正则表达式替换
5. 预览模式（--dry-run）
6. 按文件类型过滤（--ext .jpg）
7. 递归处理子目录（--recursive）
请帮我创建项目结构和入口文件。
```

#### 项目结构设计

Claude Code 会为你生成推荐的项目结构。一个规范的 CLI 项目通常采用如下结构：

```
bulkrename/
├── src/
│   └── bulkrename/
│       ├── __init__.py
│       ├── __main__.py      # python -m 入口
│       ├── cli.py           # 命令行接口定义
│       ├── core.py          # 核心重命名逻辑
│       ├── preview.py       # 预览和回滚功能
│       └── utils.py         # 工具函数
├── tests/
│   ├── test_core.py
│   └── test_cli.py
├── pyproject.toml
├── README.md
└── .gitignore
```

向 Claude Code 确认项目结构时，你可以给出反馈："把 `bulkrename` 改为直接放在项目根目录的 `bulkrename/` 包中，方便调试。" Claude Code 会即时调整。

#### 依赖管理

对于 Python CLI 项目，推荐使用 `pyproject.toml` 管理依赖。以下是 Claude Code 生成的 `pyproject.toml` 示例：

```toml
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "bulkrename"
version = "0.1.0"
description = "A powerful batch file renaming tool"
requires-python = ">=3.9"
dependencies = [
    "click>=8.1.0",
    "rich>=13.0.0",
    "pathvalidate>=3.0.0",
]

[project.scripts]
bulkrename = "bulkrename.cli:main"

[tool.setuptools.packages.find]
include = ["bulkrename*"]
```

用到的三方库说明：
- **Click**: 命令行参数解析库，比标准库 `argparse` 更简洁
- **Rich**: 提供彩色输出、表格、进度条等美观的终端渲染
- **pathvalidate**: 验证文件名合法性，防止生成非法文件名

#### 入口文件生成

入口文件 `bulkrename/__main__.py` 非常简单：

```python
from .cli import main

if __name__ == "__main__":
    main()
```

这可让用户通过 `python -m bulkrename` 运行你的工具。

### 2. 核心功能开发

#### 命令和子命令设计

使用 Click 设计命令结构。主命令 `bulkrename` 下有多个子命令对应不同的重命名模式。Claude Code 生成的 `cli.py` 文件如下：

```python
import click
from pathlib import Path
from .core import (
    rename_by_replace,
    rename_by_prefix,
    rename_by_suffix,
    rename_by_sequence,
    rename_by_regex,
)
from .preview import preview_changes, apply_changes

@click.group()
@click.version_option("0.1.0")
@click.option("--dry-run", is_flag=True, help="Preview changes without executing")
@click.option("--recursive", "-r", is_flag=True, help="Process subdirectories recursively")
@click.option("--ext", "-e", multiple=True, help="Filter by file extension (e.g., -e .jpg -e .png)")
@click.pass_context
def cli(ctx, dry_run, recursive, ext):
    """bulkrename - Batch file renaming tool"""
    ctx.ensure_object(dict)
    ctx.obj["DRY_RUN"] = dry_run
    ctx.obj["RECURSIVE"] = recursive
    ctx.obj["EXT"] = ext

@cli.command()
@click.argument("pattern", nargs=1)
@click.argument("replacement", nargs=1)
@click.argument("target", type=click.Path(exists=True))
@click.pass_context
def replace(ctx, pattern, replacement, target):
    """Replace 'pattern' with 'replacement' in filenames"""
    config = ctx.obj
    changes = rename_by_replace(
        Path(target),
        pattern,
        replacement,
        recursive=config["RECURSIVE"],
        extensions=config["EXT"],
    )
    _handle_changes(changes, config["DRY_RUN"])

@cli.command()
@click.argument("prefix", nargs=1)
@click.argument("target", type=click.Path(exists=True))
@click.pass_context
def prefix(ctx, prefix, target):
    """Add a prefix to filenames"""
    config = ctx.obj
    changes = rename_by_prefix(
        Path(target), prefix,
        recursive=config["RECURSIVE"],
        extensions=config["EXT"],
    )
    _handle_changes(changes, config["DRY_RUN"])

@cli.command()
@click.argument("suffix", nargs=1)
@click.argument("target", type=click.Path(exists=True))
@click.pass_context
def suffix(ctx, suffix, target):
    """Add a suffix to filenames (before extension)"""
    config = ctx.obj
    changes = rename_by_suffix(
        Path(target), suffix,
        recursive=config["RECURSIVE"],
        extensions=config["EXT"],
    )
    _handle_changes(changes, config["DRY_RUN"])

@cli.command()
@click.option("--start", default=1, help="Starting number")
@click.option("--digits", default=3, help="Number of digits (e.g., 3 -> 001)")
@click.option("--name", default="file", help="Base name")
@click.argument("target", type=click.Path(exists=True))
@click.pass_context
def sequence(ctx, start, digits, name, target):
    """Rename files to a numbered sequence"""
    config = ctx.obj
    changes = rename_by_sequence(
        Path(target), start, digits, name,
        recursive=config["RECURSIVE"],
        extensions=config["EXT"],
    )
    _handle_changes(changes, config["DRY_RUN"])

@cli.command()
@click.argument("pattern", nargs=1)
@click.argument("replacement", nargs=1)
@click.argument("target", type=click.Path(exists=True))
@click.pass_context
def regex(ctx, pattern, replacement, target):
    """Rename using regular expression substitution"""
    config = ctx.obj
    changes = rename_by_regex(
        Path(target), pattern, replacement,
        recursive=config["RECURSIVE"],
        extensions=config["EXT"],
    )
    _handle_changes(changes, config["DRY_RUN"])

def _handle_changes(changes, dry_run):
    """Helper: preview or apply changes"""
    from rich.console import Console
    console = Console()
    if not changes:
        console.print("[yellow]No files to rename.[/yellow]")
        return
    preview_changes(changes, console)
    if dry_run:
        console.print("\n[bold cyan]Dry-run complete. No files were modified.[/bold cyan]")
    else:
        apply_changes(changes, console)

def main():
    cli()
```

**Claude Code 提示示例：**
在 Claude Code 中，你可以这样迭代添加子命令：

```
请为 bulkrename 添加一个 "lowercase" 子命令，
将目标文件全部转为小写字母命名。
使用 click 的 @cli.command() 装饰器。
```

#### 参数解析详解

Click 提供了三种参数类型：

- **参数 (Arguments)**: 通过 `@click.argument()` 定义，是位置参数，用户必须按顺序提供
- **选项 (Options)**: 通过 `@click.option()` 定义，用 `--` 前缀标识，可带值或作为标志
- **标志 (Flags)**: 布尔型选项，如 `--dry-run` / `--verbose`

```python
# 参数示例
@click.argument("target", type=click.Path(exists=True))

# 选项示例
@click.option("--start", default=1, help="Starting number")

# 标志示例
@click.option("--dry-run", is_flag=True, help="Preview changes")
```

Click 自动生成 `--help` 输出。当用户运行 `bulkrename --help` 时，会看到自动格式化的帮助信息，包括所有命令和全局选项。这是 Click 相比 `argparse` 的优势之一。

#### 核心重命名逻辑

`core.py` 文件实现具体的重命名算法。以下是 Claude Code 生成的核心逻辑：

```python
from pathlib import Path
import re
from .utils import collect_files, validate_new_name
from .preview import RenameOp

def rename_by_replace(target_dir: Path, pattern: str, replacement: str,
                      recursive: bool = False, extensions: tuple = ()) -> list:
    """Replace pattern with replacement in filenames"""
    changes = []
    for file in collect_files(target_dir, recursive, extensions):
        new_name = file.name.replace(pattern, replacement)
        if new_name == file.name:
            continue
        validate_new_name(file, new_name)
        changes.append(RenameOp(file, file.with_name(new_name)))
    return changes

def rename_by_prefix(target_dir: Path, prefix: str,
                     recursive: bool = False, extensions: tuple = ()) -> list:
    """Add prefix to filenames"""
    changes = []
    for file in collect_files(target_dir, recursive, extensions):
        new_name = prefix + file.name
        validate_new_name(file, new_name)
        changes.append(RenameOp(file, file.with_name(new_name)))
    return changes

def rename_by_suffix(target_dir: Path, suffix: str,
                     recursive: bool = False, extensions: tuple = ()) -> list:
    """Add suffix before file extension"""
    changes = []
    for file in collect_files(target_dir, recursive, extensions):
        stem = file.stem
        new_name = stem + suffix + file.suffix
        validate_new_name(file, new_name)
        changes.append(RenameOp(file, file.with_name(new_name)))
    return changes

def rename_by_sequence(target_dir: Path, start: int, digits: int, name: str,
                       recursive: bool = False, extensions: tuple = ()) -> list:
    """Rename to numbered sequence"""
    files = collect_files(target_dir, recursive, extensions)
    changes = []
    for i, file in enumerate(files, start=start):
        ext = file.suffix
        seq = str(i).zfill(digits)
        new_name = f"{name}_{seq}{ext}"
        validate_new_name(file, new_name)
        changes.append(RenameOp(file, file.with_name(new_name)))
    return changes

def rename_by_regex(target_dir: Path, pattern: str, replacement: str,
                    recursive: bool = False, extensions: tuple = ()) -> list:
    """Rename using regex substitution"""
    compiled = re.compile(pattern)
    changes = []
    for file in collect_files(target_dir, recursive, extensions):
        new_name = compiled.sub(replacement, file.name)
        if new_name == file.name:
            continue
        validate_new_name(file, new_name)
        changes.append(RenameOp(file, file.with_name(new_name)))
    return changes
```

`utils.py` 中的辅助函数：

```python
from pathlib import Path
from pathvalidate import validate_filename, sanitize_filename

def collect_files(target_dir: Path, recursive: bool, extensions: tuple) -> list:
    """Collect files matching criteria"""
    files = []
    if not target_dir.is_dir():
        # Single file mode
        return [target_dir]

    pattern = "**/*" if recursive else "*"
    for f in target_dir.glob(pattern):
        if not f.is_file():
            continue
        if extensions and f.suffix.lower() not in [e.lower() for e in extensions]:
            continue
        files.append(f)

    # Sort for deterministic ordering
    return sorted(files)

def validate_new_name(original: Path, new_name: str) -> None:
    """Validate that the new filename is legal and not taken"""
    try:
        validate_filename(new_name)
    except Exception as e:
        raise ValueError(f"Invalid name '{new_name}' for '{original.name}': {e}")

    if original.with_name(new_name).exists():
        raise FileExistsError(f"Target '{new_name}' already exists")
```

**Claude Code 提示示例：**
要扩展文件收集功能，可以这样要求 Claude Code：

```
请给 collect_files 函数添加 --min-size 和 --max-size 过滤参数，
单位使用 KB，只收集符合大小范围的文件。
```

### 3. 用户体验优化

#### 彩色输出与格式化

使用 `rich` 库可以极大提升 CLI 工具的视觉体验。`preview.py` 中实现预览输出：

```python
from dataclasses import dataclass
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.progress import Progress

@dataclass
class RenameOp:
    source: Path
    target: Path

def preview_changes(changes: list[RenameOp], console: Console) -> None:
    """Display a table of pending changes"""
    table = Table(title="Pending Rename Operations", title_style="bold cyan")
    table.add_column("#", style="dim", width=4)
    table.add_column("Original", style="red")
    table.add_column("→", style="yellow", width=4)
    table.add_column("New Name", style="green")

    for idx, op in enumerate(changes, 1):
        table.add_row(
            str(idx),
            op.source.name,
            "→",
            op.target.name,
        )

    console.print(table)
    console.print(f"\nTotal: [bold]{len(changes)}[/bold] file(s)")

def apply_changes(changes: list[RenameOp], console: Console) -> None:
    """Execute rename operations with progress bar"""
    with Progress() as progress:
        task = progress.add_task("Renaming files...", total=len(changes))
        for op in changes:
            op.source.rename(op.target)
            progress.advance(task)
```

你可以在 Claude Code 中请求改进输出格式：

```
帮我把预览表格改为按列对齐，如果文件名太长则用...截断到40个字符。
同时在底部显示成功/失败统计。
```

#### 交互式提示

对于破坏性操作（如重命名后可能导致覆盖），可以添加用户确认步骤。Claude Code 可以轻松添加 confirm 逻辑：

```python
from rich.prompt import Confirm

def _handle_changes(changes, dry_run):
    console = Console()
    if not changes:
        console.print("[yellow]No files to rename.[/yellow]")
        return
    preview_changes(changes, console)
    if dry_run:
        console.print("[bold cyan]Dry-run complete.[/bold cyan]")
        return
    if Confirm.ask("Apply these changes?"):
        apply_changes(changes, console)
        console.print("[bold green]Done![/bold green]")
    else:
        console.print("[yellow]Cancelled.[/yellow]")
```

### 4. 测试与发布

#### CLI 测试策略

Claude Code 会为你的 CLI 生成测试。使用 Click 的 `CliRunner` 测试 CLI 命令：

```python
# tests/test_cli.py
from click.testing import CliRunner
from bulkrename.cli import cli

def test_replace_command():
    runner = CliRunner()
    with runner.isolated_filesystem():
        # Create test files
        Path("test_foo.txt").write_text("hello")
        Path("test_bar.txt").write_text("world")

        # Run replace command
        result = runner.invoke(cli, [
            "replace", "test_", "renamed_", ".",
            "--dry-run",
        ])
        assert result.exit_code == 0
        assert "renamed_foo.txt" in result.output
        assert "renamed_bar.txt" in result.output

        # Actual rename
        result = runner.invoke(cli, [
            "replace", "test_", "renamed_", ".",
        ])
        assert result.exit_code == 0
        assert Path("renamed_foo.txt").exists()
        assert not Path("test_foo.txt").exists()

def test_help_output():
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "bulkrename" in result.output
```

Claude Code 提示：

```
请为 sequence 子命令编写测试用例，
测试 start、digits 和 name 参数的不同组合。
```

#### 打包发布

使用 `pyproject.toml` 中 `[project.scripts]` 配置，用户安装后即可全局使用：

```bash
# 安装到当前环境
pip install -e .

# 构建分发包
pip install build
python -m build

# 发布到 PyPI
pip install twine
twine upload dist/*
```

PyInstaller 打包为独立可执行文件：

```bash
pip install pyinstaller
pyinstaller --onefile --name bulkrename src/bulkrename/cli.py
```

生成的 `dist/bulkrename`（或 `dist/bulkrename.exe`）无需 Python 环境即可运行。

## 实战练习

### 完整项目步骤

**目标**: 使用 Claude Code 开发文件批量重命名工具 `bulkrename`。

**步骤 1**: 在 Claude Code 中初始化项目

```
请帮我创建一个 bulkrename 项目的骨架，使用 Click + Rich，
包含 replace、prefix、suffix、sequence、regex 五个子命令。
项目根目录下执行。
```

**步骤 2**: 实现核心逻辑

告诉 Claude Code：

```
请实现 bulkrename/core.py 中的五个重命名函数，
每个函数接收目标目录、参数，返回 RenameOp 列表。
```

**步骤 3**: 添加预览和回滚功能

```
请为 bulkrename 添加两个功能：
1. 预览模式（dry-run）- 显示表格对比修改前后
2. 回滚功能 - 执行重命名时自动生成一个 undo 脚本，可用 --undo 还原
```

**步骤 4**: 编写测试

```
请为 bulkrename 的每个子命令编写 Click CliRunner 测试，
覆盖正常情况和边界情况（空目录、不匹配的文件等）。
```

**步骤 5**: 测试运行

```bash
# 创建测试文件
mkdir test_files && cd test_files
touch report_2024.txt report_2025.txt photo_vacation.jpg

# 替换模式
bulkrename replace "report_" "annual_" . --dry-run

# 添加前缀
bulkrename prefix "draft_" . --ext .txt --dry-run

# 序号编号
bulkrename sequence --start 1 --digits 4 --name photo . --ext .jpg --dry-run

# 实际执行（去掉 --dry-run）
bulkrename sequence --start 1 --digits 4 --name photo . --ext .jpg
```

**步骤 6**: 打包

```
请帮我配置 pyproject.toml，使得执行 pip install -e . 后
可以通过 bulkrename 命令全局调用。
```

**预期输出示例**（运行 `bulkrename replace "report_" "annual_" . --dry-run`）：

```
┌──────────────────────────────────────────────┐
│         Pending Rename Operations             │
├──────┬──────────────────┬─────┬───────────────┤
│  #   │ Original         │  →  │ New Name      │
├──────┼──────────────────┼─────┼───────────────┤
│  1   │ report_2024.txt  │  →  │ annual_2024.. │
│  2   │ report_2025.txt  │  →  │ annual_2025.. │
├──────┼──────────────────┼─────┼───────────────┤
│           Total: 2 file(s)                    │
└──────────────────────────────────────────────┘
Dry-run complete. No files were modified.
```

## 本章小结

1. **用自然语言描述需求是起点**：向 Claude Code 清晰描述 CLI 工具的功能需求和约束，是获得高质量生成结果的关键。越具体，生成的代码越准确。

2. **Click + Rich 是 Python CLI 开发的最佳组合**：Click 提供了声明式的参数解析和自动帮助信息生成，Rich 提供了美观的终端渲染，二者结合能快速开发专业级 CLI 工具。

3. **CLI 设计遵循最小惊讶原则**：子命令设计应直观一致（如 `git commit`、`npm install` 的风格），选项命名遵循惯例（`--verbose`/`-v`、`--help`），用户不用看文档就能上手。

4. **预览-确认-执行模式很重要**：对于有副作用的操作（如重命名文件），务必提供 `--dry-run` 预览机制和用户确认步骤，防止误操作。

5. **测试覆盖命令行和核心逻辑**：使用 Click 的 CliRunner 测试命令行解析和输出，同时独立测试核心重命名函数的逻辑正确性。

6. **CI/CD 自动构建发布**：配置 GitHub Actions 在 push 时自动运行测试、构建分发包并发布到 PyPI，实现一键发布。

## 思考题

1. **CLI 工具设计中最重要的用户体验要素是什么？**
   - **提示**: 从用户首次使用（--help 清晰度）、日常使用（命令简洁性、一致性）、出错时（错误信息可理解性）三个阶段考虑。关键要素包括：一致的命令结构、明确的错误信息、合理的默认值、完整的帮助文档、预览/确认机制。

2. **如何确保 CLI 工具在不同平台上的兼容性？**
   - **提示**: 考虑路径分隔符（Windows 用 `\`，Unix 用 `/`）、换行符、文件名非法字符差异（Windows 不允许 `\ / : * ? " < > |`）、编码问题。使用 `pathlib` 跨平台路径操作，在 CI 中配置多平台测试矩阵（Windows/macOS/Linux），使用 `pathvalidate` 库统一验证文件名合法性。