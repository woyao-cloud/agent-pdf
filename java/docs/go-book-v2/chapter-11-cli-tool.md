# 第11章 命令行工具开发

## 概述

命令行工具（CLI）是 Go 语言最经典的适用场景之一。Go 编译为单一静态二进制文件，无需任何外部依赖，天然跨平台——这些特性使其成为开发 CLI 工具的理想选择。从 Docker、Kubernetes 到 Hugo、Caddy，大量知名基础设施项目都用 Go 编写 CLI。

本章将从最佳实践出发，介绍如何用 Go 和 Cobra 库构建高质量的 CLI 工具，并涵盖进度显示、交互体验等进阶话题。

## 11.1 CLI工具的最佳实践

### 11.1.1 单一职责

一个命令只做一件事，并且把它做好。这是 Unix 哲学的核心原则。如果你的工具有多个功能，应该拆分为子命令，而不是用复杂的标志参数来区分行为。

```
# 好的设计
fsearch search "pattern" ./dir
fsearch config init
fsearch config show

# 不好的设计
fsearch --search "pattern" --dir ./dir --config-default
```

每个子命令对应一个独立的职责，用户心智负担小，也更容易测试和维护。

### 11.1.2 友好的帮助信息

帮助信息是 CLI 工具的"说明书"。好的帮助信息应该包含：

- **命令用途**：一句话说明这个命令做什么
- **使用示例**：至少 2-3 个常见用法示例
- **参数说明**：每个标志和参数的类型、默认值、含义
- **环境变量**：哪些配置可以通过环境变量覆盖

```
Flags:
      --color       enable color output (default true)
      --ext string  file extension filter (e.g. ".go,.md")
      --max-depth   max search depth (default -1, unlimited)
  -h, --help        help for search
```

### 11.1.3 正确的退出码

Unix 约定退出码 0 表示成功，非 0 表示失败。Go 的 `os.Exit()` 可以控制退出码：

```go
if err != nil {
    fmt.Fprintln(os.Stderr, "Error:", err)
    os.Exit(1)
}
```

常见的退出码约定：
| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 误用（参数错误等） |

### 11.1.4 环境变量支持

好的 CLI 工具应该支持通过环境变量覆盖配置，便于 CI/CD 和容器化场景。Cobra 可以方便地与 viper 集成实现这一功能，但即使单独使用，也应手动处理少量关键配置：

```go
func getDefaultDir() string {
    if d := os.Getenv("FSEARCH_DIR"); d != "" {
        return d
    }
    return "."
}
```

## 11.2 cobra库的使用

### 11.2.1 什么是 Cobra

[Cobra](https://github.com/spf13/cobra) 是 Go 生态中事实标准的 CLI 框架，被 Kubernetes、Hugo、GitHub CLI 等大量主流项目使用。它提供了：

- 命令、子命令和标志的完整支持
- 自动生成的帮助信息（`-h` / `--help`）
- 自动生成补全脚本（bash / zsh / fish / PowerShell）
- 支持持久标志和本地标志
- 支持命令别名

### 11.2.2 基本结构

Cobra 程序通常按照以下结构组织代码：

```
my-cli/
├── main.go          # 入口，执行 rootCmd
├── cmd/
│   ├── root.go      # 根命令配置
│   ├── search.go    # search 子命令
│   └── config.go    # config 子命令
```

每个命令是一个 `cobra.Command` 结构体：

```go
var searchCmd = &cobra.Command{
    Use:   "search [pattern] [directory]",
    Short: "search files for a pattern",
    Long:  `Recursively search files in a directory matching the given pattern.`,
    Args:  cobra.MinimumNArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        // 执行逻辑
        return nil
    },
}
```

### 11.2.3 Flags：持久标志 vs 本地标志

Cobra 提供两种标志作用域：

- **持久标志（PersistentFlags）**：在当前命令及其所有子命令中可用。适合全局选项，如 `--verbose`、`--config`。
- **本地标志（Flags）**：仅对当前命令生效。适合特定子命令的参数。

```go
// 根命令的持久标志，对所有子命令可见
rootCmd.PersistentFlags().BoolP("verbose", "v", false, "verbose output")

// search 命令的本地标志，仅 search 可用
searchCmd.Flags().String("ext", "", "file extension filter")
```

获取标志值：

```go
verbose, _ := cmd.Flags().GetBool("verbose")
ext, _ := cmd.Flags().GetString("ext")
```

### 11.2.4 参数验证

Cobra 内置了常用的参数验证器：

```go
Args: cobra.MinimumNArgs(1),        // 至少 N 个参数
Args: cobra.MaximumNArgs(2),        // 最多 N 个参数
Args: cobra.RangeArgs(1, 3),        // 参数数量在范围内
Args: cobra.ExactArgs(2),           // 恰好 N 个参数
Args: cobra.OnlyValidArgs,          // 参数必须在 ValidArgs 列表中
Args: cobra.ArbitraryArgs,          // 任意参数（默认）
```

也可以自定义验证：

```go
Args: func(cmd *cobra.Command, args []string) error {
    if len(args) < 1 {
        return fmt.Errorf("requires at least one arg")
    }
    return nil
},
```

### 11.2.5 添加子命令

在 `init()` 函数中将子命令注册到父命令：

```go
func init() {
    rootCmd.AddCommand(searchCmd)
    rootCmd.AddCommand(configCmd)
}
```

## 11.3 进度显示与交互

命令行工具的用户体验不仅仅是功能正确。在耗时操作中显示进度，可以让用户感知到程序"活着"而非卡死。

### 11.3.1 Spinner（旋转动画）

Spinner 的核心原理是：用 `\r` 回车符覆盖当前行，循环显示不同的字符。常用字符序列：

```
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
```

最简单的实现：

```go
func Spinner(duration time.Duration) {
    chars := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
    i := 0
    for {
        fmt.Printf("\r%s Searching...", chars[i%len(chars)])
        i++
        time.Sleep(100 * time.Millisecond)
    }
}
```

使用 `\r` 回车符是关键——它让光标回到行首，实现原地更新效果。

### 11.3.2 Progress Bar（进度条）

对于已知总量的任务，进度条比 spinner 更有信息量：

```go
func ProgressBar(current, total int) {
    width := 50
    filled := current * width / total
    bar := strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
    pct := current * 100 / total
    fmt.Printf("\r[%s] %d%%", bar, pct)
}
```

### 11.3.3 彩色输出

彩色输出可以显著提升可读性，尤其是搜索结果中的关键字高亮。可以使用 [fatih/color](https://github.com/fatih/color) 库：

```go
import "github.com/fatih/color"

var (
    Red    = color.New(color.FgRed).SprintFunc()
    Green  = color.New(color.FgGreen).SprintFunc()
    Yellow = color.New(color.FgYellow).SprintFunc()
    Cyan   = color.New(color.FgCyan).SprintFunc()
)

fmt.Printf("%s: %s\n", Green(file), Red(line))
```

需要注意的是，彩色输出在非终端环境（如重定向到文件）时应自动关闭。可以通过检测 `os.Stdout` 的文件描述符来判断：

```go
func isTerminal() bool {
    fi, _ := os.Stdout.Stat()
    return (fi.Mode() & os.ModeCharDevice) != 0
}
```

## 常见问题与处理

### 1. 命令行参数解析太复杂

**问题**：手动解析 `os.Args` 很快就变得难以维护，尤其是需要处理标志、子命令、参数验证时。

**解决方案**：使用 Cobra。它将参数解析、验证、帮助生成、补全脚本生成全部封装好，你只需要声明命令和标志即可。一个常见的误区是想"先自己实现一个简单的，等复杂了再改 Cobra"——实际上从一开始就用 Cobra 更省事，因为迁移成本远高于初始集成的成本。

### 2. 跨平台兼容性问题

**问题**：在 Linux/Mac 上正常，在 Windows 上路径分隔符出错。

**解决方案**：

```go
// 错误：使用硬编码的 "/"
path := dir + "/" + file

// 正确：使用 filepath.Join
path := filepath.Join(dir, file)
```

此外还需要注意：
- Windows 控制台不支持 ANSI 转义序列（需要 `fatih/color` 或 `go-colorable` 自动处理）
- 换行符差异（`\n` 在 Windows 下是 `\r\n`，但大部分现代 Go 库已处理好）
- 隐藏文件判断：`strings.HasPrefix(name, ".")` 在 Windows 上也适用

### 3. 输出格式化

**问题**：命令行输出表格时手动对齐非常痛苦。

**解决方案**：使用 `text/tabwriter` 包来自动对齐列：

```go
w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
fmt.Fprintln(w, "File\tMatches\tSize")
fmt.Fprintln(w, "a.go\t42\t1.2KB")
fmt.Fprintln(w, "b.go\t7\t0.3KB")
w.Flush()
```

输出：
```
File    Matches  Size
a.go    42       1.2KB
b.go    7        0.3KB
```

`tabwriter` 根据 `\t` 分隔符自动对齐各列，支持设置最小列宽、缩进、填充字符等。

## 小结

本章介绍了 Go CLI 工具开发的核心实践：

- **单一职责**原则让 CLI 的设计更清晰：一个子命令做一件事
- **Cobra 库**是 Go CLI 开发中的标准选择，它提供了命令注册、标志管理、参数验证、自动帮助等全套能力
- **友好的用户体验**包括清晰的帮助信息、正确的退出码、环境变量支持
- **进度显示**通过 spinner 和 progress bar 提升等待体验，色彩增强可读性
- **跨平台兼容**使用 `filepath.Join` 和适当的库可以轻松解决

Go 编译为单一二进制的特性，加上 Cobra 这样成熟的框架，使得用 Go 开发 CLI 工具的生产力极高。下一章我们将进一步探索 Go 在开发工具和 DevOps 场景中的应用。

---

## 附录：Demo 项目结构

本章配套的 `fsearch` 演示项目展示了完整的 Cobra CLI 工具开发流程：

```
demos/ch11-cli/
├── main.go              # 入口
├── go.mod               # 模块定义
├── cmd/
│   ├── root.go          # 根命令 + 全局标志
│   ├── search.go        # search 子命令
│   └── config.go        # config 子命令 (init/show)
├── pkg/
│   ├── searcher/        # 核心搜索逻辑
│   │   └── search.go
│   └── spinner/         # 进度显示组件
│       └── spinner.go
├── Dockerfile           # 多阶段构建
└── README.md            # 使用说明
```