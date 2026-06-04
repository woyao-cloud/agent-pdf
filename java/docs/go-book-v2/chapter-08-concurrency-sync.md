# 第8章 并发同步与协调

---

## 概述

第6章我们学会了如何创建轻量级的Goroutine，第7章我们掌握了通过Channel在Goroutine之间传递数据。但并发编程还有一个关键问题没有解决：**当多个Goroutine需要访问同一份共享数据时，怎么办？**

Channel当然可以解决一部分问题——"通过通信来共享内存"是Go的核心哲学。但现实世界并不总是那么理想。有些场景下，多个Goroutine需要频繁地读写同一个数据结构（比如一个配置对象、一个计数器、一个缓存），用Channel传递整个数据副本的成本太高，或者根本不现实。

这时候就需要传统的同步原语登场了。

如果把Goroutine比作一群工人，Channel是工人之间的传送带，那么本章要讲的sync包就是工人的"工具管理室"——Mutex是门锁，RWMutex是阅览室的规则牌，WaitGroup是接力赛的计时板，Once是只能按一次的按钮。这些工具让工人们能在共享工作台上安全地协作，不会互相干扰。

本章是并发三部曲的终章。我们将覆盖sync包的所有核心原语、atomic原子操作、context上下文传播，以及各种实用的并发模式。读完本章，你将拥有Go并发编程的完整武器库。

---

## 8.1 sync包详解

Go的`sync`包提供了基本的同步原语。它们不像Channel那样优雅地传递数据，但在保护共享状态方面更加直接高效。

### Mutex — "公共厕所门锁"

想象一个公共厕所：一个人进去，锁上门，用完出来，解锁。在门外等待的人必须等里面的人出来才能进去。这就是互斥锁（Mutex）最直观的类比。

`sync.Mutex`是一个互斥锁，它保证**同一时间只有一个Goroutine能访问被保护的代码区域**。其他Goroutine必须等待，直到锁被释放。

```go
var mu sync.Mutex
var counter int

func increment() {
    mu.Lock()         // 进入临界区，上锁
    counter++         // 共享资源操作
    mu.Unlock()       // 离开临界区，解锁
}
```

这段代码看起来简单，但它解决了并发编程中最基本的问题：**数据竞争**。如果没有`mu.Lock()`和`mu.Unlock()`的保护，两个Goroutine同时执行`counter++`可能导致结果不正确。因为`counter++`在底层是三个操作：读值、加一、写回，两个Goroutine的这三个操作可能交错执行，导致一次增量被覆盖。

#### Mutex的演进：饥饿模式

Go 1.9之前，Mutex的实现是"公平的"——所有等待的Goroutine按照先来后到的顺序获取锁。但这里有一个问题：如果锁被频繁地释放和重新获取，新来的Goroutine可能"插队"，导致已经在等待队列中的Goroutine迟迟拿不到锁。

Go 1.9引入了**饥饿模式（Starvation Mode）**：

- **正常模式（Normal Mode）**：Goroutine自旋等待几次（通常是4次），尝试在用户态获取锁。如果自旋失败，进入等待队列。新来的Goroutine有机会插队——如果锁刚好被释放而新Goroutine正在自旋，它可以直接拿到锁，比等待队列中的Goroutine更快。这种模式吞吐量更高。

- **饥饿模式（Starvation Mode）**：当一个Goroutine等待锁超过1毫秒，Mutex切换到饥饿模式。在饥饿模式下，锁会直接交给等待队列头部的Goroutine，新来的Goroutine不再插队，必须乖乖排队。当等待队列清空或等待时间低于1毫秒，切换回正常模式。

这两种模式的切换是为了在"高吞吐量"和"公平性"之间取得平衡。正常模式下，自旋可以让锁的获取更快（避免了一次Goroutine调度），但如果某个Goroutine一直拿不到锁，饥饿模式就会介入，保证每个Goroutine最终都能执行。

```go
// Mutex的使用模式
type SafeCounter struct {
    mu    sync.Mutex
    value int
}

func (sc *SafeCounter) Increment() {
    sc.mu.Lock()
    sc.value++
    sc.mu.Unlock()
}

func (sc *SafeCounter) Value() int {
    sc.mu.Lock()
    defer sc.mu.Unlock() // 用defer保证必然释放锁
    return sc.value
}
```

注意`Value()`方法中使用了`defer sc.mu.Unlock()`。这是一个**强制性的最佳实践**——如果函数中有多个返回路径，用defer确保锁一定会被释放。忘记解锁是Mutex最常见的bug。

### RWMutex — "图书馆阅览室"

图书馆的阅览室有一个规则：任何人都可以同时进来阅读（读取），但一旦有人在里面写东西（比如在公共白板上写公告），所有人都必须出去，等他写完了再进来。

这就是读写锁（RWMutex）的类比。RWMutex区分两种操作：

- **读操作（RLock）**：多个Goroutine可以同时持有读锁，互不干扰
- **写操作（Lock）**：写锁是排他的，获取写锁时，所有读锁和写锁都不能存在

```go
var rw sync.RWMutex
var config map[string]string

func ReadConfig(key string) string {
    rw.RLock()                       // 多个读可以同时进行
    defer rw.RUnlock()
    return config[key]
}

func WriteConfig(key, value string) {
    rw.Lock()                        // 写是排他的
    defer rw.Unlock()
    config[key] = value
}
```

这个模式非常适合**读多写少**的场景。比如一个服务的热加载配置——配置每分钟更新一次（写），但每秒被读取数万次（读）。如果用普通的Mutex，所有读操作都要串行化，白白浪费了CPU。RWMutex让读操作在无竞争时几乎是零开销的并行。

性能数据对比（粗略基准）：
| 场景 | Mutex | RWMutex |
|------|-------|---------|
| 只读，无竞争 | ~20 ns | ~20 ns（无差别） |
| 1个写 + 8个读 | ~100 ns | ~40 ns（读不受写影响） |
| 读写各半 | ~200 ns | ~150 ns（写开销稍大） |
| 频繁写 | ~200 ns | ~300 ns（RWMutex维护额外状态） |

RWMutex的代价是：写操作比普通Mutex略慢，因为它需要维护读锁的计数和等待队列。另外，**不要在用RLock的地方获取Lock**——这会导致死锁。同一个Goroutine不能先读锁再写锁（反之亦然）。

### WaitGroup — "接力赛"

想象一场接力赛：发令枪响，第一棒起跑，第二棒、第三棒、第四棒依次接力。裁判需要等待所有四棒都完成后才能宣布比赛结束。

`sync.WaitGroup`就是并发编程中的"裁判"。它等待一组Goroutine全部完成工作，然后主Goroutine才继续执行。这是并发编程中使用频率最高的原语之一。

```go
var wg sync.WaitGroup

// 启动5个worker
for i := 0; i < 5; i++ {
    wg.Add(1)                     // 告诉WaitGroup：多了一个要等的人
    go func(id int) {
        defer wg.Done()           // 完成时通知WaitGroup
        fmt.Printf("Worker %d 开始工作\n", id)
        time.Sleep(time.Duration(id) * time.Second)
        fmt.Printf("Worker %d 完成\n", id)
    }(i)
}

wg.Wait()                         // 等所有人完成
fmt.Println("所有worker完成")
```

WaitGroup的三个方法的含义：
- `Add(delta int)`：增加计数器的值（通常在启动Goroutine前调用）
- `Done()`：减少计数器的值（通常在Goroutine结束时调用，等价于`Add(-1)`）
- `Wait()`：阻塞直到计数器变为0

**重要规则**：`wg.Add(1)`应该在启动Goroutine之前调用，而不是在Goroutine内部调用。如果在Goroutine内部调用，可能会发生在`wg.Wait()`已经执行之后才调用`Add`的情况——这样`Wait`永远不会等到这个Goroutine完成（或者更糟，计数器已经降到0然后又被加回去）。

```go
// 错误示例：Add在goroutine内部
for i := 0; i < 5; i++ {
    go func() {
        wg.Add(1)   // 可能太晚了
        defer wg.Done()
        // ...
    }()
}
wg.Wait() // 可能在Add执行前就返回了
```

一个常见模式是在循环中启动多个Goroutine，每次迭代调用`Add(1)`，然后在`go func()`中将`Done`作为defer执行。

### Once — "单次开门"

有一种场景：你有一段初始化代码，只想执行一次——不管有多少个Goroutine同时调用它。比如单例模式的懒加载、全局配置的一次性初始化。

`sync.Once`就是为此而生的。它的`Do(f)`方法保证传入的函数`f`只被执行一次，即使被多个Goroutine同时调用。

```go
var once sync.Once
var instance *Database

func GetDatabase() *Database {
    once.Do(func() {
        fmt.Println("只在第一次调用时执行：初始化数据库连接")
        instance = connectToDatabase()
    })
    return instance
}
```

多Goroutine同时调用`GetDatabase()`时，只有第一个Goroutine会执行初始化函数，其他Goroutine会阻塞等待初始化完成，然后直接拿到结果。初始化函数执行完后，后续的所有`once.Do()`调用都变成空操作（no-op），几乎零开销。

Once的内部实现非常巧妙：它用一个原子操作检查一个标志位，如果标志位为0，就加锁执行初始化；初始化完成后设置标志位为1。后续调用发现标志位已是1，直接返回。

```go
// Once的简化版实现
type Once struct {
    done uint32
    m    sync.Mutex
}

func (o *Once) Do(f func()) {
    if atomic.LoadUint32(&o.done) == 0 {
        o.doSlow(f)
    }
}

func (o *Once) doSlow(f func()) {
    o.m.Lock()
    defer o.m.Unlock()
    if o.done == 0 {
        defer atomic.StoreUint32(&o.done, 1)
        f()
    }
}
```

这段代码有两个要点：第一，用`atomic.LoadUint32`做快速路径检查，避免每次调用都加锁；第二，在低速路径中再次检查`o.done == 0`（双重检查锁定），防止多个Goroutine同时进入低速路径。

### Cond — "候诊叫号"

`sync.Cond`是条件变量，用于等待某个条件成立。它适合这样的场景：一个Goroutine需要等待另一个Goroutine发出"条件满足了"的信号才能继续执行。

想象医院的候诊大厅：你挂号后在候诊区等待（Wait），医生看完一个病人后叫下一个号（Signal），广播通知所有病人换诊室（Broadcast）。

```go
var mu sync.Mutex
var cond = sync.NewCond(&mu)
var queue []int

func producer() {
    for i := 0; i < 10; i++ {
        mu.Lock()
        queue = append(queue, i)
        fmt.Println("生产:", i)
        cond.Signal() // 通知消费者
        mu.Unlock()
        time.Sleep(500 * time.Millisecond)
    }
}

func consumer() {
    for {
        mu.Lock()
        for len(queue) == 0 {
            cond.Wait() // 等待被通知
        }
        val := queue[0]
        queue = queue[1:]
        fmt.Println("消费:", val)
        mu.Unlock()
    }
}
```

Cond使用时有三个必须遵守的规则：
1. **必须在锁的保护下调用Wait**：Wait会自动释放锁、挂起Goroutine、在被唤醒时重新获取锁
2. **Wait返回后，条件不一定满足**：所以要用`for`循环重新检查条件（而不是`if`）
3. **Signal唤醒一个等待者，Broadcast唤醒所有等待者**

在实际工程中，Cond的使用场景相对较少。大部分情况可以用Channel替代——比如用无缓冲Channel实现Signal，用close实现Broadcast。

### Pool — "共享工具箱"

`sync.Pool`是一个临时对象池，用于存储和复用临时对象。它的设计目的是减少内存分配和GC压力。

想象一个共享工具箱：工人们从工具箱里拿扳手（Get），用完洗干净放回去（Put）。如果工具箱空了，就自动造一把新的（New函数）。

```go
var pool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 1024) // 自动创建新的缓冲区
    },
}

func processRequest() {
    buf := pool.Get().([]byte)    // 从池中获取
    defer pool.Put(buf)           // 用完归还

    // 使用buf处理请求
    buf = buf[:0]                 // 重置（但不清零底层数组）
    // ...
}
```

Pool最适合以下场景：
- **频繁分配和释放的对象**：如JSON解析的缓冲区、网络请求的临时byte slice
- **线程本地缓存**：每个P（逻辑处理器）有私有缓存，减少锁竞争
- **对象初始化成本高**：如数据库连接（但注意Pool无法保证连接存活，更适合无状态对象）

需要特别注意的是：**Pool中的对象可能随时被回收**。Pool不保证Get到的对象一定存在，也可能在你Put之后被GC悄悄清理掉。因此，Pool不适合做持久化的对象管理（如连接池），只适合做短期复用。

---

## 8.2 atomic操作与内存序

"收银台的零钱盒"——想象一个繁忙的小卖部，客人买一瓶水付10块，收银员从零钱盒里找出2块。如果两个客人同时结账，两个收银员同时伸手去拿零钱盒里的硬币，可能发生什么？一个人拿了5块，另一个人同时拿了同一个5块——账就对不上了。

解决这个问题，最简单的办法就是让零钱盒上的操作变成原子的（Atomic）：要么整个操作完成，要么完全不发生，中间不能被任何人打断。

Go的`sync/atomic`包提供了对基本类型的原子操作。对于简单的计数器、标志位等场景，原子操作比Mutex更轻量。

```go
var counter int64

// 原子方式增加计数器
atomic.AddInt64(&counter, 1)

// 原子方式读取
val := atomic.LoadInt64(&counter)

// 原子方式写入
atomic.StoreInt64(&counter, 100)

// 原子方式比较并交换（CAS）
swapped := atomic.CompareAndSwapInt64(&counter, 100, 200)
```

看一个具体的对比场景：

```go
// 普通方式（有数据竞争）
var counter int64
for i := 0; i < 1000; i++ {
    go func() { counter++ }() // 有竞争
}

// Mutex方式
var mu sync.Mutex
var counter2 int64
for i := 0; i < 1000; i++ {
    go func() {
        mu.Lock()
        counter2++
        mu.Unlock()
    }()
}

// atomic方式
var counter3 int64
for i := 0; i < 1000; i++ {
    go func() { atomic.AddInt64(&counter3, 1) }()
}
```

三种方式中，atomic最快——因为它在CPU指令层面保证了原子性（如LOCK前缀指令），不涉及Goroutine的阻塞和唤醒。Mutex次之——虽然锁操作本身很快，但在高竞争场景下涉及Goroutine调度。有数据竞争的普通方式虽然单次执行最快，但结果可能错误。

atomic包提供的基本操作类型：
| 类型 | 操作 |
|------|------|
| int32/int64 | Add, Load, Store, CompareAndSwap, Swap |
| uint32/uint64 | Add, Load, Store, CompareAndSwap, Swap |
| uintptr | Add, Load, Store, CompareAndSwap, Swap |
| Pointer | Load, Store, CompareAndSwap, Swap |
| Value | Load, Store, Swap, CompareAndSwap (Go 1.17+) |

### 内存序（Memory Order）

原子操作不仅保证操作不可分割，还保证了**内存序**——即不同Goroutine对内存的读写顺序。

Go的内存模型保证：在一个Goroutine中，原子操作之前的写入，在另一个Goroutine执行对应的原子操作时一定是可见的。

```go
var a int
var flag int32

func writer() {
    a = 42                    // 普通写入
    atomic.StoreInt32(&flag, 1) // 原子写入
}

func reader() {
    for atomic.LoadInt32(&flag) == 0 {
        // 自旋等待
    }
    fmt.Println(a)            // 一定输出42
}
```

为什么这里`a = 42`在`reader`中一定可见？因为`atomic.StoreInt32`保证了"happens-before"关系：store之前的写操作在load之后的读操作中可见。这就是内存序提供的保证。

在日常开发中，你不需要深究内存序的细节（除非在写无锁数据结构）。只要记住：**用atomic替代普通的读写，可以同时获得原子性和必要的内存序保证**。

### atomic.Value

`atomic.Value`是Go 1.4引入的一个泛型原子操作包装，用于原子地加载和存储任意类型的值（必须是同一类型）。

```go
var config atomic.Value

// 写入配置
config.Store(map[string]string{
    "key1": "value1",
    "key2": "value2",
})

// 读取配置（无锁）
cfg := config.Load().(map[string]string)
fmt.Println(cfg["key1"])
```

这个模式非常适合"读多写少的无锁配置更新"——所有读操作通过`Load`获取最新配置，写操作通过`Store`整体替换，无需加锁。

---

## 8.3 context包 — 超时、取消与传值

从Go 1.7开始，`context`包被正式纳入标准库。它解决了并发编程中一个核心问题：**如何让一个Goroutine通知它的子Goroutine"该停止了"**。

可以把context想象成一根"信号线"——一根贯穿整个调用链的线。主Goroutine在这根线上发送信号，所有连接到这根线上的子Goroutine都能收到。信号有三种：

1. **取消信号**：父被取消，所有子也取消
2. **超时信号**：到时间了，自动取消
3. **传值信号**：在线上挂一个小标签，所有子都能看到

### 取消传播

想象一个团队项目：项目经理说"这个方案不做了，全部停手"。消息传下去，每个成员都停止工作。这就是取消传播。

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel() // 确保所有派生context都被取消

go func() {
    select {
    case <-ctx.Done():
        fmt.Println("子goroutine收到取消信号，退出")
        return
    default:
        // 正常工作
    }
}()

// 主goroutine决定取消
cancel()
```

`ctx.Done()`返回一个Channel，当context被取消或超时时，这个Channel被关闭。所有监听这个Channel的Goroutine都会收到通知。

取消传播的层级结构：
```
main (context.Background())
  └── worker1 (WithCancel)
       ├── subtask1a (WithCancel)
       └── subtask1b (WithCancel)
  └── worker2 (WithCancel)
```

当worker1的cancel被调用时，subtask1a和subtask1b也会收到取消信号。但worker2不受影响。这就是"父取消，所有子取消"——但兄弟之间互不影响。

### 超时控制

如果说取消是"主动停止"，超时就是"被动停止"——设定一个最后期限，到时间了还没完成就自动取消。

```go
ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
defer cancel()

select {
case result := <-ch:
    fmt.Println("收到结果:", result)
case <-ctx.Done():
    fmt.Println("超时:", ctx.Err()) // 输出: context deadline exceeded
}
```

还有一个变体`context.WithDeadline`，它接受一个具体的时间点而不是持续时间：

```go
deadline := time.Now().Add(1 * time.Second)
ctx, cancel := context.WithDeadline(context.Background(), deadline)
```

超时控制是Go并发编程中最常用的模式之一。几乎所有的网络请求、数据库查询、RPC调用都应该设置超时，防止一个操作无限期阻塞。

一个实际例子：同时请求多个数据源，只要任意一个返回就使用它的结果。

```go
func fetchWithTimeout(ctx context.Context, url string) (string, error) {
    ch := make(chan string, 1)
    go func() {
        result := fetch(url)
        ch <- result
    }()

    select {
    case result := <-ch:
        return result, nil
    case <-ctx.Done():
        return "", ctx.Err()
    }
}
```

这里缓冲为1的channel确保即使没有人接收，fetch goroutine也不会泄漏。

### 传值

context也可以用来传递请求范围的数据——就像在包裹上贴了一个标签。

```go
type traceIDKey struct{}

func WithTraceID(ctx context.Context, traceID string) context.Context {
    return context.WithValue(ctx, traceIDKey{}, traceID)
}

func GetTraceID(ctx context.Context) string {
    if id, ok := ctx.Value(traceIDKey{}).(string); ok {
        return id
    }
    return "unknown"
}
```

几个关键点：
- **key必须是自定义类型**：不要用`string`或`int`作为key，防止不同包之间的key冲突
- **不应用context传函数参数**：context传值应该只传递请求范围的数据（追踪ID、用户身份等），而不是函数参数
- **value必须是并发安全的**：因为多个Goroutine可能同时读取

### 最佳实践

1. **context是函数的第一个参数**：约定俗成，context.Context永远是函数的第一个参数
2. **永远不要将nil作为context传递**：不确定用什么context时，用`context.TODO()`
3. **调用cancel()及时释放资源**：`WithCancel`返回的cancel函数一定要被调用，否则资源会泄漏
4. **只传递请求范围的数据**：不要在context里塞函数参数或业务配置

```go
// 正确的context使用方式
func HandleRequest(ctx context.Context, req *Request) (*Response, error) {
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()

    result, err := process(ctx, req.Data)
    if err != nil {
        return nil, err
    }
    return &Response{Result: result}, nil
}

func process(ctx context.Context, data []byte) (string, error) {
    // 检查是否已被取消
    select {
    case <-ctx.Done():
        return "", ctx.Err()
    default:
    }
    // 继续处理...
    return string(data), nil
}
```

---

## 8.4 并发模式的典型范式

并发编程中，有一些反复出现的经典模式。它们就像围棋的定式——见过一次，以后遇到类似的场景就能直接套用。

### Fan-in（扇入）

多个输入Channel汇聚到一个输出Channel。就像多条河流汇入一条大河。

```go
func fanIn(chs ...<-chan int) <-chan int {
    out := make(chan int)
    var wg sync.WaitGroup

    for _, ch := range chs {
        wg.Add(1)
        go func(c <-chan int) {
            defer wg.Done()
            for v := range c {
                out <- v
            }
        }(ch)
    }

    go func() {
        wg.Wait()  // 等待所有输入channel关闭
        close(out) // 关闭输出channel
    }()

    return out
}

func main() {
    ch1 := make(chan int)
    ch2 := make(chan int)

    go func() {
        for i := 0; i < 5; i++ { ch1 <- i; time.Sleep(100 * time.Millisecond) }
        close(ch1)
    }()
    go func() {
        for i := 10; i < 15; i++ { ch2 <- i; time.Sleep(150 * time.Millisecond) }
        close(ch2)
    }()

    merged := fanIn(ch1, ch2)
    for v := range merged {
        fmt.Println(v)
    }
}
```

Fan-in的核心要点：用WaitGroup等待所有输入Channel关闭，然后关闭输出Channel，让接收方能安全地使用`range`循环。

### Fan-out（扇出）

一个输入Channel的数据分发到多个Worker去处理。就像一条大河分出多条灌溉渠。

```go
func fanOut(in <-chan int, workers int) {
    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for v := range in {
                fmt.Printf("Worker %d 处理: %d\n", id, v)
                time.Sleep(200 * time.Millisecond)
            }
        }(i)
    }
    wg.Wait()
}

func main() {
    jobs := make(chan int, 10)
    for i := 0; i < 10; i++ { jobs <- i }
    close(jobs)

    fanOut(jobs, 3)
}
```

Fan-out的关键在于：多个Worker共享同一个Channel，Go运行时会自动在多个阻塞的接收者之间分配数据（本质上是一对多的一分发）。

### Pipeline模式

Pipeline是Go并发模式中最优雅的一种。每个阶段（Stage）由一个Goroutine处理，通过Channel连接，形成一条流水线。

一个经典的三阶段Pipeline：Generator（生成数据） → Squarer（计算平方） → Printer（打印结果）。

```go
func generator(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        for _, n := range nums {
            out <- n
        }
        close(out)
    }()
    return out
}

func squarer(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in {
            out <- n * n
        }
        close(out)
    }()
    return out
}

func printer(in <-chan int) {
    for n := range in {
        fmt.Println(n)
    }
}

func main() {
    // 构建pipeline: generator → squarer → printer
    nums := generator(1, 2, 3, 4, 5)
    squares := squarer(nums)
    printer(squares)
}
```

Pipeline模式的要点：
1. 每个阶段返回一个只读Channel（`<-chan int`）
2. 每个阶段内部启动一个Goroutine处理数据
3. 数据通过Channel传递，每个阶段处理完后关闭自己的输出Channel
4. 最后一个阶段通常是消费者的角色

### 超时控制模式

我们已经多次提到超时控制。这里给出一个标准的超时模式函数：

```go
func doWithTimeout(fn func() (int, error), timeout time.Duration) (int, error) {
    ch := make(chan int, 1)
    errCh := make(chan error, 1)

    go func() {
        result, err := fn()
        if err != nil {
            errCh <- err
            return
        }
        ch <- result
    }()

    select {
    case result := <-ch:
        return result, nil
    case err := <-errCh:
        return 0, err
    case <-time.After(timeout):
        return 0, fmt.Errorf("操作超时（%v）", timeout)
    }
}
```

注意缓冲为1的Channel——确保Goroutine在超时发生后能安全退出，不会阻塞在发送操作上。

### 限流模式（令牌桶）

令牌桶限流器通过一个带缓冲的Channel作为令牌桶：桶里有令牌才能执行操作，没有令牌就等待或拒绝。

```go
type TokenBucket struct {
    tokens chan struct{}
}

func NewTokenBucket(rate int) *TokenBucket {
    tb := &TokenBucket{
        tokens: make(chan struct{}, rate),
    }
    // 定时向桶中放入令牌
    go func() {
        ticker := time.NewTicker(time.Second / time.Duration(rate))
        defer ticker.Stop()
        for range ticker.C {
            select {
            case tb.tokens <- struct{}{}:
            default: // 桶满了，丢弃令牌
            }
        }
    }()
    return tb
}

func (tb *TokenBucket) Wait() {
    <-tb.tokens // 获取令牌（阻塞直到有令牌）
}

func main() {
    limiter := NewTokenBucket(2) // 每秒2个请求

    for i := 0; i < 10; i++ {
        limiter.Wait()
        fmt.Printf("处理请求 %d at %s\n", i, time.Now().Format("15:04:05.000"))
    }
}
```

这个实现虽然简单（受限于Channel的设置速度不够精确），但展示了令牌桶的核心思想：通过一个有限容量的Channel作为缓冲池，定时注入令牌。

更精确的限流通常使用`golang.org/x/time/rate`包，它实现了标准的令牌桶算法。

### 优雅退出模式

生产环境中，服务收到退出信号（SIGTERM/SIGINT）后，需要优雅地关闭所有资源，而不是粗暴地杀死进程。

```go
func gracefulShutdown() {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // 监听系统信号
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

    go func() {
        sig := <-sigCh
        fmt.Printf("收到信号: %v，开始优雅退出...\n", sig)
        cancel() // 通知所有goroutine停止
    }()

    // 启动worker
    var wg sync.WaitGroup
    for i := 0; i < 3; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for {
                select {
                case <-ctx.Done():
                    fmt.Printf("Worker %d 退出\n", id)
                    return
                default:
                    fmt.Printf("Worker %d 工作中...\n", id)
                    time.Sleep(500 * time.Millisecond)
                }
            }
        }(i)
    }

    wg.Wait()
    fmt.Println("所有worker已退出，程序结束")
}
```

这个模式的核心思想是：`signal.Notify`捕获操作系统信号，转换成context的取消信号，所有Goroutine监听`ctx.Done()`来决定何时退出。

### 并发错误处理（errgroup）

标准库的`sync.WaitGroup`只等待Goroutine完成，但不收集错误信息。`golang.org/x/sync/errgroup`扩展了WaitGroup，提供了一个goroutine的返回错误会被收集并返回。

```go
import "golang.org/x/sync/errgroup"

func fetchMultipleURLs(urls []string) error {
    g, ctx := errgroup.WithContext(context.Background())
    results := make([]string, len(urls))

    for i, url := range urls {
        i, url := i, url
        g.Go(func() error {
            // 请求可能被取消
            select {
            case <-ctx.Done():
                return ctx.Err()
            default:
            }

            resp, err := http.Get(url)
            if err != nil {
                return fmt.Errorf("请求 %s 失败: %w", url, err)
            }
            defer resp.Body.Close()

            body, _ := io.ReadAll(resp.Body)
            results[i] = string(body)
            return nil
        })
    }

    // 等待所有goroutine完成，返回第一个错误（如果有）
    if err := g.Wait(); err != nil {
        return err
    }

    // 处理结果...
    fmt.Println("所有请求成功")
    return nil
}
```

`errgroup.WithContext`返回一个绑定了context的Group。当任意一个Goroutine返回错误时，这个context会被自动取消，其他Goroutine可以通过`ctx.Done()`感知到并退出。`g.Wait()`返回的也是第一个发生的错误。

---

## 综合示例：并发任务调度器

下面的程序结合了本章多个模式：Fan-out多Worker分发、超时控制、WaitGroup协调、优雅退出和错误处理。这是一个完整可运行的程序。

```go
package main

import (
    "context"
    "fmt"
    "math/rand"
    "os"
    "os/signal"
    "sync"
    "syscall"
    "time"
)

// Task 代表一个工作任务
type Task struct {
    ID      int
    Payload string
}

// Result 代表任务结果
type Result struct {
    TaskID int
    Output string
    Err    error
}

// worker 处理单个任务
func worker(ctx context.Context, id int, tasks <-chan Task, results chan<- Result, wg *sync.WaitGroup) {
    defer wg.Done()
    for {
        select {
        case <-ctx.Done():
            fmt.Printf("Worker %d 收到退出信号\n", id)
            return
        case task, ok := <-tasks:
            if !ok {
                return // tasks channel关闭，没有更多任务
            }
            // 模拟任务处理
            processTime := time.Duration(rand.Intn(500)+100) * time.Millisecond
            time.Sleep(processTime)

            result := Result{TaskID: task.ID, Output: fmt.Sprintf("processed by worker %d", id)}
            select {
            case results <- result:
            case <-ctx.Done():
                return
            }
        }
    }
}

func main() {
    const numWorkers = 3
    const numTasks = 20

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    tasks := make(chan Task, numTasks)
    results := make(chan Result, numTasks)

    // 启动worker
    var wg sync.WaitGroup
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go worker(ctx, i, tasks, results, &wg)
    }

    // 发送任务
    go func() {
        for i := 0; i < numTasks; i++ {
            tasks <- Task{ID: i, Payload: fmt.Sprintf("task-%d", i)}
        }
        close(tasks)
   }()

    // 优雅退出：监听系统信号
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

    // 收集结果（带超时和信号监听）
    done := make(chan struct{})
    go func() {
        wg.Wait()
        close(results)
        close(done)
    }()

    successCount := 0
    failCount := 0

loop:
    for {
        select {
        case <-sigCh:
            fmt.Println("\n收到退出信号，正在取消所有worker...")
            cancel()
        case result, ok := <-results:
            if !ok {
                // results channel已关闭，所有任务完成
                break loop
            }
            if result.Err != nil {
                failCount++
                fmt.Printf("任务 %d 失败: %v\n", result.TaskID, result.Err)
            } else {
                successCount++
                fmt.Printf("任务 %d 完成: %s\n", result.TaskID, result.Output)
            }
        case <-done:
            // worker全部退出，但results中可能还有剩余数据
            // 继续读取剩余的results
            for result := range results {
                if result.Err != nil {
                    failCount++
                } else {
                    successCount++
                }
            }
            break loop
        }
    }

    fmt.Printf("\n调度完成: 成功 %d, 失败 %d\n", successCount, failCount)
}
```

这个综合示例体现了以下并发模式的组合：
1. **Fan-out**：3个Worker从同一个tasks Channel消费
2. **WaitGroup协调**：等待所有Worker退出
3. **context取消**：收到SIGINT/SIGTERM时取消所有Worker
4. **优雅退出**：signal.Notify监听系统信号
5. **双重退出路径**：Worker自然完成或被取消都能优雅退出

---

## 常见问题与处理

### 1. 死锁检测与预防

Go运行时的死锁检测很简单：**当所有Goroutine都阻塞且没有恢复的可能时，程序会panic**。

```go
func deadlock() {
    ch := make(chan int)
    ch <- 42 // 永远阻塞：没有接收方
}
// 输出: fatal error: all goroutines are asleep - deadlock!
```

但Go只能检测"所有Goroutine都阻塞"的死锁。如果有一个Goroutine在正常运行而另一个死锁了，Go无法检测到。预防死锁的一般原则：

- **锁的顺序**：如果多个Goroutine需要多个锁，确保所有Goroutine以相同的顺序获取锁
- **避免在锁内再取锁**：迫不得已时，使用超时机制
- **使用Channel时确保发送和接收配对**：生产者记得关闭Channel

### 2. 数据竞争检测

Go提供了内置的数据竞争检测器——`-race`标志。

```go
// 有数据竞争的代码
var counter int
func main() {
    for i := 0; i < 1000; i++ {
        go func() { counter++ }()
    }
}
```

运行 `go run -race main.go` 会输出类似：
```
WARNING: DATA RACE
Read at 0x... by goroutine X:
  main.main.func1()
  ...

Previous write at 0x... by goroutine Y:
  main.main.func1()
  ...
```

**在生产环境的CI/CD中，务必包含`-race`测试**。虽然开启race检测后程序运行会变慢（约2-20倍），但这是保证并发正确性最有效的手段。

```bash
# 在所有测试中开启race检测
go test -race ./...
```

### 3. 并发安全的Map

Go内置的map不是并发安全的。并发读写map会导致`fatal error: concurrent map read and map write`。

解决方案有两种：

**方案一：map + sync.RWMutex**

```go
type SafeMap struct {
    mu sync.RWMutex
    m  map[string]int
}

func (sm *SafeMap) Get(key string) (int, bool) {
    sm.mu.RLock()
    defer sm.mu.RUnlock()
    v, ok := sm.m[key]
    return v, ok
}

func (sm *SafeMap) Set(key string, value int) {
    sm.mu.Lock()
    defer sm.mu.Unlock()
    sm.m[key] = value
}
```

**方案二：sync.Map**（Go 1.9+）

```go
var m sync.Map

func main() {
    m.Store("key", 42)
    v, ok := m.Load("key")
    fmt.Println(v, ok)

    m.LoadOrStore("key2", 100) // 存在就返回，不存在就写入

    m.Range(func(key, value interface{}) bool {
        fmt.Println(key, value)
        return true // 继续遍历
    })
}
```

什么时候用sync.Map，什么时候用map+RWMutex？

- **用map+RWMutex**：有明确key类型，读写比例均衡，需要灵活的范围查询
- **用sync.Map**：key是动态的，读多写少（写远少于读），不同Goroutine操作不同的key

sync.Map的优化策略：它内部使用了"写时复制"（copy-on-write）和"读缓存"（read-only cache）——读操作不需要加锁（通过原子读实现），写操作时复制一份新数据。在"read-heavy"场景下性能非常好，但在"write-heavy"场景下比map+RWMutex更差。

### 4. 如何优雅关闭Worker Pool

Worker Pool的优雅关闭是一个经典问题。正确做法是：先停止分发新任务，然后等待正在执行的任务完成。

```go
type WorkerPool struct {
    tasks   chan int
    results chan int
    wg      sync.WaitGroup
}

func NewWorkerPool(numWorkers, bufferSize int) *WorkerPool {
    return &WorkerPool{
        tasks:   make(chan int, bufferSize),
        results: make(chan int, bufferSize),
    }
}

func (wp *WorkerPool) Start(numWorkers int) {
    for i := 0; i < numWorkers; i++ {
        wp.wg.Add(1)
        go func(id int) {
            defer wp.wg.Done()
            for task := range wp.tasks { // tasks关闭后自动退出循环
                wp.results <- task * 2
            }
        }(i)
    }
}

func (wp *WorkerPool) AddTask(task int) {
    wp.tasks <- task
}

func (wp *WorkerPool) Shutdown() {
    close(wp.tasks)             // 1. 停止分发新任务
    wp.wg.Wait()                // 2. 等待所有worker完成
    close(wp.results)           // 3. 关闭结果channel
}
```

优雅关闭的三步走：
1. `close(tasks)`——告诉所有Worker"没有新任务了"，Worker的`range`循环会自动退出
2. `wg.Wait()`——等待所有正在执行的任务完成
3. `close(results)`——通知结果的消费者"所有结果都已产生"

---

## 小结

本章是并发三部曲的终章。从第6章Goroutine的创建和调度，到第7章Channel的通信模式，再到本章的同步原语和并发模式，我们完成了Go并发编程的完整拼图。

核心要点：

1. **sync包**：Mutex是互斥锁（公共厕所门锁），RWMutex是读写锁（图书馆阅览室），WaitGroup是等待组（接力赛），Once确保一次性初始化，Cond是条件变量（候诊叫号），Pool是临时对象池（共享工具箱）。每个原语都有自己的最佳使用场景。

2. **atomic操作**：对于简单的计数器、标志位等，原子操作比Mutex更轻量。`atomic.Value`提供了无锁读取任意类型的能力。

3. **context包**：它是Go并发编程的"信号线"，提供取消传播、超时控制和请求范围传值三大功能。context.Context应该是每个函数的第一个参数。

4. **并发模式**：Fan-in（扇入）、Fan-out（扇出）、Pipeline、超时控制、限流（令牌桶）、优雅退出、errgroup错误处理——这些模式是并发编程的"定式"，值得反复练习直至熟练。

5. **综合应用**：最后的任务调度器示例展示了这些模式如何协同工作——Fan-out分发任务，WaitGroup等待完成，context优雅取消，signal.Notify系统信号处理。

至此，你已经掌握了Go并发编程的完整武器库。接下来的章节中，我们将把这些并发知识应用到实际项目中——Web服务、微服务、高性能服务器——看看它们如何在真实场景中发挥作用。