# 第4章 错误处理与异常机制

## 概述

你住在一套房子里。晚上你睡着了，厨房的烟雾报警器响了——"哔——哔——"。你被吵醒，跑到厨房一看：锅里的水烧干了，正在冒烟，但还没起火。你关掉火，打开窗户通风，然后回去继续睡觉。

另一种情况：烟雾报警器没响（或者你根本没装）。你睡得很香。一小时后，厨房已经燃起大火，消防车来了，整栋楼的人都要疏散。

Go的错误处理哲学，讲的就是"检查烟雾报警器 vs 等房子烧了再救火"的故事。Go选择了一种对错误"零容忍"的态度——每个可能出错的操作，都应该在代码中显式地检查和处理错误。它不允许你"假装错误不会发生"。

在Java或Python等语言中，异常机制让我们可以这样写代码：

```go
// 这不是Go代码，这是伪代码
try {
    result := doSomething()
    doNext(result)
} catch (Exception e) {
    // 统一处理异常
}
```

看起来挺干净，对吧？但问题是，`doSomething()` 内部的十层调用中，哪一行会抛出异常？你在阅读这段代码时，除非去查看每一层函数的文档，否则你根本不知道哪些地方可能出错。异常在调用栈中"隐式传递"，像一个幽灵——你看不见它，但它随时可能跳出来。

Go选择了另一条路：**错误是值，不是控制流**。这意味着错误只是一个普通的返回值，和整数、字符串、布尔值没有任何区别。函数如果可能出错，就在返回值中多返回一个 `error`。

这确实意味着你需要多写几行 `if err != nil`。但换来的是：**每一处错误处理都是显式的、可见的、不可忽视的。** 在阅读Go代码时，你永远不会"意外错过"一个可能的错误——它就在那里，清清楚楚地写在返回值里。

## 4.1 error接口的设计理念

Go的错误机制核心只有一个接口：

```go
type error interface {
    Error() string
}
```

这是Go标准库中最简单的接口之一——只有一个方法 `Error()`，返回一个字符串。但它的设计蕴含了深刻的思想。

**第一，错误是值。** 因为 `error` 是一个接口，任何实现了 `Error() string` 方法的类型都可以作为错误值。这意味着你可以把错误赋值给变量、作为参数传递、从函数返回、放进切片或映射中——它就是普通的值，和 `int`、`string`一样是一等公民。这不是一个"语法上的选择"，而是一个"哲学上的选择"：错误不应该是一个特殊的东西，它就应该是普通的数据。

**第二，错误是可组合的。** 因为错误是值，你可以像处理其他数据一样处理它。你可以把多个错误组合在一起，可以在错误上附加额外的上下文信息，可以在错误上实现自定义行为。这些在异常机制中很难做到的事情，在Go中变得自然而简单。

**第三，错误是不可忽视的。** 在Java中，如果你在方法上声明 `throws` 某些异常，调用者可以完全不处理它们——编译器不会抱怨。在Go中，如果函数返回了 `error`，但你在调用时用 `_` 忽略了它，Go的静态分析工具（如 `go vet`）会发出警告。你的团队也可以配置lint规则来禁止忽略错误返回。

我们可以用一个比喻来理解这个设计：异常机制像消防队——出了事才来救火，平时你看不见他们。Go的error像烟雾报警器——每个房间都装了一个，平时你可能觉得它们有点碍眼（"怎么这么多if err != nil"），但一旦有事发生，你会在第一时间知道，而且知道具体是哪个房间出了问题。

这种设计的另一个好处是：**函数签名自带了错误信息。** 当你看到一个函数的签名是 `func ReadFile(path string) ([]byte, error)`，你立刻知道：这个函数可能会出错。不需要看文档，不需要猜测，不需要记住。函数签名的"语言"本身就在告诉你"小心，这里可能有问题"。

## 4.2 错误处理的三种模式

在Go的实际编码中，错误处理可以归纳为三种模式：哨兵错误、自定义错误类型和不透明错误。每种模式都有它的适用场景，理解它们的区别，能让你写出更清晰、更可维护的错误处理代码。

### 哨兵错误（Sentinel errors）

哨兵错误是预定义的、固定的错误值。它们像"哨兵"一样站在某个位置，告诉调用者"发生了这个特定的情况"。最经典的例子是 `io.EOF`——当你读取文件到末尾时，`Read` 方法返回这个错误：

```go
data := make([]byte, 100)
n, err := file.Read(data)
if err == io.EOF {
    fmt.Println("文件读取完毕，共读取", n, "字节")
    break
}
```

`io.EOF` 不是"出错了"——它更像一个信号："文件已经读到尾了，没有更多内容了。" 这是一种用错误值表达"正常状态转换"的方式。

其他常见的哨兵错误包括 `sql.ErrNoRows`（查询结果为空）和 `context.Canceled`（上下文被取消）。哨兵错误的核心特征是：它是一个固定的、不可变的错误值，调用者通过 `==` 来判断。

使用哨兵错误时需要注意：它们会成为包公共API的一部分。一旦你公开了一个哨兵错误，调用方代码就会依赖这个具体的错误值。这意味着你不能轻易地改变它或者删除它——这是API兼容性的一部分。

### 自定义错误类型

当你需要在错误中携带更多的上下文信息时，单纯的一个错误值就不够了。这时候你可以定义一个实现了 `error` 接口的结构体：

```go
type ValidationError struct {
    Field   string
    Value   interface{}
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("字段 %s 验证失败: %s（当前值: %v）", e.Field, e.Message, e.Value)
}
```

调用者不仅能看到错误消息，还能通过类型断言获取到具体的字段名、当前值和验证信息。这比一个单纯的字符串错误有用得多——比如在API层，你可以根据 `ValidationError.Field` 自动定位到具体的表单字段，然后给用户返回一个友好的错误提示：

```go
func validateAge(age int) error {
    if age < 0 || age > 150 {
        return &ValidationError{
            Field:   "age",
            Value:   age,
            Message: "年龄必须在0到150之间",
        }
    }
    return nil
}

func handleRequest(w http.ResponseWriter, r *http.Request) {
    err := validateAge(age)
    var verr *ValidationError
    if errors.As(err, &verr) {
        json.NewEncoder(w).Encode(map[string]interface{}{
            "field":   verr.Field,
            "message": verr.Message,
        })
        return
    }
}
```

自定义错误类型的核心优势是：**调用者可以针对性地处理不同类型的错误**，而不仅仅是打印一条错误消息。

### 不透明错误（Opaque errors）

很多时候，调用者并不需要知道错误的具体原因。它只需要知道"出错了"，然后决定如何处理——通常就是记录错误日志、返回给上层、或者重试。这种情况下，最好的做法是**不暴露错误的内部细节**。

不透明错误的理念可以用一句话概括："别问为什么，记住'出错了'就行。"

```go
func SaveUser(db *sql.DB, u User) error {
    // 如果数据库连接失败，调用者只需要知道"保存用户失败了"
    // 不需要知道具体是"连接超时"还是"DNS解析失败"
    _, err := db.Exec("INSERT INTO users (name, age) VALUES (?, ?)", u.Name, u.Age)
    if err != nil {
        return fmt.Errorf("保存用户失败: %w", err)
    }
    return nil
}
```

调用者只需要检查 `err != nil`，不需要知道内部细节。这种信息隐藏的好处是：**实现层可以自由更改内部逻辑，而不影响调用方的错误处理代码。** 你的数据库从MySQL切换到PostgreSQL了？没关系。你的SQL语句改了？没关系。只要 `SaveUser` 函数仍然在出错时返回一个 `error`，调用方就不需要知道内部发生了什么。

这三种模式对应了不同的需求层次：
- **不透明错误**："出错了"——对调用者最友好，信息隐藏最佳，推荐默认使用。
- **哨兵错误**："出了特定的错误"——调用者需要区分不同的预期情况（如文件读完）。
- **自定义错误类型**："出了什么错、在哪里、有什么细节"——调用者需要丰富的错误上下文来做出精确的响应。

选择原则是：**能用不透明的就用不透明的，需要特定判断时用哨兵，需要丰富上下文时用自定义类型。** 不要一上来就设计复杂的错误类型体系——从最简单的开始，等真正需要的时候再扩展。

## 4.3 panic与recover — Go的"异常"机制

Go虽然没有传统的try-catch异常机制，但它提供了 `panic` 和 `recover` 这两个内置函数来处理"真正异常"的情况。

首先要明确：**panic不是替代try-catch的工具。** panic是为"不可能发生的情况"准备的——比如程序员的代码写错了、前置条件不满足、或者发生了不可恢复的致命错误。

什么情况会触发 panic？

- **索引越界**：访问数组或切片中不存在的索引
- **空指针解引用**：对nil指针调用方法或访问字段
- **显式调用panic()**：你在代码中主动调用 `panic("something went wrong")`
- **类型断言失败**（未使用ok模式）：`val.(int)` 这种写法在类型不匹配时会panic

当 panic 发生时，Go的运行时会执行以下流程：

1. 当前函数立即停止执行
2. 当前函数的所有defer函数开始执行
3. 如果defer函数中没有调用recover，panic会继续向上传播到调用者
4. 调用者函数立即停止执行
5. 调用者的所有defer函数开始执行
6. 以此类推，直到最外层函数
7. 最外层函数也没有recover的话，程序崩溃

用一句话概括：**panic沿着调用栈向上传播，执行每一层的defer，直到被recover捕获或者程序崩溃。**

`recover()` 函数只能在defer函数中生效：

```go
func riskyOperation() {
    defer func() {
        if r := recover(); r != nil {
            fmt.Println("捕获到panic:", r)
        }
    }()

    // 这里会发生panic
    var data []int
    fmt.Println(data[0]) // index out of range
}
```

recover() 返回传给panic()的值。如果当前没有panic在传播，recover()返回nil。

需要强调的是，**recover并不是Go鼓励你频繁使用的功能。** 它的正确使用场景非常有限：

- **作为HTTP服务器的中间件**：捕获所有goroutine中出现的panic，返回500错误而不是让服务器崩溃。这是最经典的用法——net/http包的标准服务器默认就会这样做，但你自己启动的goroutine需要手动处理。

- **保护库代码的边界**：如果你的库被其他人调用，你不希望某个内部bug导致调用方的整个程序崩溃。在库的公共API入口处使用recover可以防止panic逃逸出去。

- **启动时的初始化检查**：如果某个goroutine启动后立即panic了，用recover捕获后可以优雅地重试。

```go
func HTTPMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                http.Error(w, "Internal Server Error", http.StatusInternalServerError)
                log.Printf("panic recovered: %v", err)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

但panic绝对不应该用于常规的错误处理。以下情况**不应该**使用panic：

- 用户输入验证失败 —— 应该返回error
- 数据库查询失败 —— 应该返回error
- 网络连接超时 —— 应该返回error
- 配置文件解析失败 —— 应该返回error
- 任何你预期可能会发生的错误 —— 应该返回error

Go社区有一条简单的规则来区分什么时候该用error、什么时候该用panic：**"error是你可以预见并处理的，panic是你不应该预见或者无法处理的。"** 文件不存在是error，不是panic；数组越界是panic，不是error——因为数组索引应该是编程时就确定无误的。

## 4.4 Go 1.13+ 错误链（Error Wrapping）

在实际项目中，一个函数出错后，调用者通常需要在错误上附加自己的上下文信息："调用X函数时发生了Y错误。" 在Go 1.13之前，开发者通常用 `fmt.Errorf` 配合 `%v` 来包装错误：

```go
err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething失败: %v", err) // 错误信息被"拍平"了
}
```

这样做的问题是：原始错误的信息被"拍平"成了一个字符串。调用者无法再通过 `==` 或类型断言来判断原始错误的类型。如果 `doSomething()` 返回的是 `io.EOF`，你无法在包装后判断它是不是 `io.EOF`。

从Go 1.13开始，标准库提供了**错误链（Error Wrapping）机制**，通过 `%w` 这个格式化动词来包装错误：

```go
err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething失败: %w", err) // 保留原始错误链
}
```

`%w` 和 `%v` 的区别在于：`%w` 把原始错误"嵌入"到新错误中，形成一个错误链。这个链可以通过两个新函数来检查：

**`errors.Is`** —— 判断错误链中是否包含某个特定的错误值：

```go
err := openConfigFile("config.yaml")
if errors.Is(err, os.ErrNotExist) {
    // 配置文件不存在，使用默认配置
    return loadDefaultConfig()
}
```

`errors.Is` 会沿着错误链逐层检查，如果链中的任何一个错误等于目标值（通过 `==` 比较），就返回true。这解决了哨兵错误在包装后无法识别的问题。

**`errors.As`** —— 从错误链中提取特定类型的错误：

```go
err := processUserInput(input)
var valErr *ValidationError
if errors.As(err, &valErr) {
    // 从 ValidationError 中提取具体信息
    return fmt.Sprintf("字段 %s 验证失败: %s", valErr.Field, valErr.Message)
}
```

`errors.As` 会沿着错误链逐层查找，找到第一个类型匹配的错误，并将其赋值给目标变量。这解决了自定义错误类型在包装后无法获取的问题。

错误链的底层实现依赖于 `Unwrap()` 方法。当一个错误类型实现了 `Unwrap() error` 方法时，`errors.Is` 和 `errors.As` 就会沿着这个链条逐层查找。`fmt.Errorf` 使用 `%w` 创建的错误自动实现了 `Unwrap()`。

如果你想在自定义错误类型中支持错误链：

```go
type WrappedError struct {
    Msg   string
    Cause error
}

func (e *WrappedError) Error() string {
    return fmt.Sprintf("%s: %v", e.Msg, e.Cause)
}

func (e *WrappedError) Unwrap() error {
    return e.Cause
}
```

有了 `Unwrap()` 方法，你的自定义错误类型就可以被 `errors.Is` 和 `errors.As` 遍历了。

错误链让Go的错误处理在"保留原始信息"和"添加上下文信息"之间找到了平衡点。你既可以通过链上的每个节点添加自己的上下文，又可以在需要时追溯到最原始的根因。这比传统异常机制中的堆栈跟踪更有优势——因为堆栈跟踪只告诉你"哪行代码调用了哪行代码"，而错误链还告诉你了"每层处理者认为发生了什么"。

## 常见问题与处理

### 1. 错误被吞掉

最常见也最危险的错误处理问题就是"吞掉错误"。这通常发生在两种情况下：

```go
// 问题1：用_忽略错误
result, _ := doSomething()
_ = result

// 问题2：在defer中忽略错误
defer file.Close()  // Close()返回的error被忽略了
```

被吞掉的错误就像被掩盖的火灾隐患——你不会立即看到问题，但它迟早会以更糟糕的方式爆发出来。

**解决方案**：永远不要用`_`忽略错误返回。如果你确定某个错误可以安全忽略，加上明确的注释说明原因。对于defer中的 `Close()` 调用，至少应该记录错误：

```go
defer func() {
    if err := file.Close(); err != nil {
        log.Printf("关闭文件失败: %v", err)
    }
}()
```

### 2. panic滥用

有些从Java或Python转过来的开发者，会把panic当成throw来用——"反正能recover。" 这是Go社区最深恶痛绝的做法之一。

```go
// 这是反模式！不要把panic当成异常用
func parseAge(s string) int {
    age, err := strconv.Atoi(s)
    if err != nil {
        panic("invalid age: " + s)  // 错误的做法
    }
    return age
}
```

**解决方案**：记住那条简单的规则——"error是你可以预见并处理的，panic是你不应该预见或者无法处理的。" 用户输入错误是可以预见并处理的，所以应该返回error。只有当程序遇到了"理论上不可能发生的情况"时，才应该使用panic。

### 3. 错误链断裂

使用 `fmt.Errorf` 包装错误时，如果用了 `%v` 而不是 `%w`，原始错误就会被"拍平"，错误链就此断裂：

```go
func loadConfig() error {
    err := readFile("config.yaml")
    if err != nil {
        // 错误链断裂：readFile返回的错误信息变成了字符串
        return fmt.Errorf("读取配置失败: %v", err)
    }
    return nil
}

// 调用方无法通过errors.Is来判断原始错误的类型
err := loadConfig()
if errors.Is(err, os.ErrNotExist) {
    // 这永远不会触发！因为错误链已经断了
}
```

**解决方案**：除非你有意要隐藏错误细节（不透明错误模式），否则始终使用 `%w` 来包装错误。如果你确实需要隐藏细节，也要确保你的选择是刻意的而不是疏忽的。

### 4. 错误处理代码太啰嗦

`if err != nil` 的重复出现，是Go被吐槽最多的地方。在一个稍复杂的函数中，可能会有七八个这样的检查：

```go
func process() error {
    a, err := step1()
    if err != nil { return fmt.Errorf("step1失败: %w", err) }
    b, err := step2(a)
    if err != nil { return fmt.Errorf("step2失败: %w", err) }
    c, err := step3(b)
    if err != nil { return fmt.Errorf("step3失败: %w", err) }
    d, err := step4(c)
    if err != nil { return fmt.Errorf("step4失败: %w", err) }
    return nil
}
```

**解决方案**：首先，接受这个模式是Go的"常态"——它本身并不是问题，它只是显式。但如果确实觉得太重复，可以考虑以下做法：

一是保持一致的错误包装风格。定义一个错误包装函数，减少重复的 `fmt.Errorf` 调用：

```go
func wrapErr(err error, msg string) error {
    if err == nil {
        return nil
    }
    return fmt.Errorf("%s: %w", msg, err)
}
```

二是考虑将底层的错误处理抽象出去。如果你的每个步骤都是相同的模式（先做某事，然后包装错误），可以用一个辅助函数来减少重复。但要注意：不要为了"少写几行代码"而创造出难以理解的抽象——Go的哲学是"显式"而不是"简洁"。

## 小结

1. **error是一个接口**——`type error interface { Error() string }`——它的设计哲学是"错误是值，不是控制流"。错误像其他值一样可以被传递、存储和检查，而不是像异常那样在调用栈中隐式传播。

2. **三种错误处理模式服务于不同的需求**——不透明错误（信息隐藏，推荐默认使用）、哨兵错误（特定情况判断）、自定义错误类型（丰富的上下文信息）。从最简单的模式开始，按需升级。

3. **panic和recover是Go的"最后防线"，不是日常工具**——panic只应该用于"不可能发生"的情况（数组越界、空指针等）。recover只应该用于保护程序边界（HTTP中间件、库API入口）。常规错误处理永远应该使用error。

4. **Go 1.13+的错误链机制**——通过 `%w` 包装错误，通过 `errors.Is` 和 `errors.As` 检查错误链。这让错误在保留原始信息的同时可以逐层添加上下文，实现了"每个处理层都说清楚发生了什么"。

5. **常见陷阱有明确的解决方案**——不要吞掉错误（检查并记录）、不要滥用panic（用error代替）、不要搞断错误链（用`%w`代替`%v`）、不要抱怨啰嗦（显式处理就是Go的方式）。