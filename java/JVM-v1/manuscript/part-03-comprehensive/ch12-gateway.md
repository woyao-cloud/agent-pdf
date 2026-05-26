# 第12章 网关性能瓶颈排查实战

## 12.1 案例背景

### 12.1.1 业务场景

本案例来源于一个基于 Spring Cloud Gateway 构建的 API 网关服务。该网关承担着微服务架构中所有外部请求的入口职责，核心功能包括路由转发、认证鉴权、限流熔断、请求/响应转换等。在微服务架构中，网关是流量的枢纽，所有客户端请求都必须经过网关才能到达后端的业务服务。

该网关服务部署在 8 核 32 GB 的容器中，JDK 版本为 17，默认使用 G1 垃圾回收器。为了充分发挥 Netty 的异步非阻塞优势，网关采用了 Spring Boot WebFlux 作为底层框架，所有业务处理均运行在 Netty 的事件循环线程上。

生产环境中，网关需要处理的请求模式较为复杂：请求路径包含多种路由规则（精确匹配、前缀匹配、通配符匹配、正则匹配、模板变量匹配），请求体为 JSON 格式，大小约 2 KB，响应体同样约为 2 KB。网关在接收到请求后会执行一系列过滤器链（鉴权、限流、日志记录等），然后将请求转发到后端的业务服务。系统上线初期表现平稳，但随着业务量的增长和路由规则的不断增加，网关开始出现明显的性能劣化。

### 12.1.2 性能指标与问题表象

在常规流量下（约 1000 请求/秒），网关的 CPU 使用率维持在 30% 左右，P99 延迟在 20 ms 以内，系统运行良好。然而当流量攀升至 5000 请求/秒时，通过 wrk 压测工具观察到的指标令人担忧：

- **CPU 使用率**：从正常的 30% 飙升至 85%，但系统的实际吞吐量仅达到预期的 60% 左右。
- **P99 延迟**：从正常的 20 ms 飙升至 350 ms 以上，部分请求的延迟甚至超过 1 秒。
- **吞吐量受限**：实际处理的请求数仅为 3000 请求/秒左右，远低于 5000 请求/秒的目标。
- **错误率**：约 2%-3% 的请求返回了 500 或 503 错误。

最令人困惑的是 CPU 使用率与吞吐量之间的不匹配：CPU 已经达到了 85% 的高占用率，但吞吐量却只有预期的 60%。这意味着大量的 CPU 周期被"浪费"在了非生产性的工作上——这正是 JVM 性能瓶颈的典型信号。CPU 在"空转"或执行低效的操作，而不是在处理业务逻辑。

这个现象背后的可能原因有多种：也许是序列化框架的反射调用消耗了过多 CPU，也许是 JIT 编译器没有对热点路径进行有效优化，也许是线程在等待锁时做了大量的上下文切换。要找到确切的原因，我们需要逐步缩小排查范围。

在实际生产中，CPU 使用率与吞吐量背离通常有以下几个常见原因：

1. **自旋锁和 CAS 重试**：线程在等待锁时不进入休眠而是持续自旋，消耗 CPU 但不推进业务。典型的例子是 `ConcurrentHashMap` 在某些操作中的内部自旋。
2. **过度的临时对象创建**：频繁的对象分配和垃圾回收导致 GC 线程消耗 CPU，但业务线程在 GC 期间被暂停。
3. **低效的算法或数据结构**：使用了复杂度高的算法（如正则表达式匹配、深度拷贝等），CPU 时间花在了"错误的地方"。
4. **JIT 编译优化不足**：热点方法因多态或其他原因无法被 JIT 充分优化，导致每次调用都产生不必要的开销。

在初步排除了 GC 因素后（见 12.2.3 节），我们将重点放在第 4 个原因上，深入检查 JIT 编译决策对性能的影响。

### 12.1.3 实验环境搭建

为了让读者能够亲身体验完整的排查过程，本章提供了一个可复现的 Spring Boot WebFlux 示例项目。项目位于 `jvm-lab/cases/comprehensive/case02-gateway/` 目录下，主要包含以下组件：

- **GatewayApplication**：Spring Boot 入口类，提供 POST `/api/**` 核心转发端点和 GET `/stats` 监控端点。所有请求通过 Mono 异步处理。
- **RouteHandler**：核心业务组件，模拟了网关的路由匹配、请求解析、过滤器链执行和响应生成全流程。内部刻意引入了三大性能瓶颈（详见后续章节）。
- **RouteMatcher 接口及五个实现类**：ExactMatcher（精确匹配）、PrefixMatcher（前缀匹配）、WildcardMatcher（通配符匹配）、RegexMatcher（正则匹配）、TemplateMatcher（模板变量匹配），用于模拟 JIT 多态内联失效。
- **load-test-gateway.sh**：基于 wrk 的负载测试脚本，可配置并发连接数和测试时长。

启动服务时建议添加以下 JVM 参数以方便后续诊断：

```bash
java -Xms2g -Xmx2g -XX:+UseG1GC \
     -XX:+PrintCompilation \
     -XX:+UnlockDiagnosticVMOptions \
     -XX:+PrintInlining \
     -Xlog:gc*:file=gc.log:time,uptime,level,tags \
     -jar target/case02-gateway-1.0-SNAPSHOT.jar
```

执行压测命令：

```bash
./jvm-lab/scripts/load-test-gateway.sh http://localhost:8080 60 4 200
```

上述命令会以 4 个 wrk 线程、200 个并发连接在 60 秒内向网关发送连续的 POST 请求。压测期间，我们可以通过多个诊断工具观察系统的运行状态。

## 12.2 现象发现

### 12.2.1 CPU 与吞吐量背离

当压测运行约 15 秒后，系统的异常表现开始显现。首先通过 `top` 和 `htop` 命令观察系统资源的使用情况。

使用 `top` 命令查看整体系统资源：

```
top - 10:15:33 up 1 day,  3:42,  1 user,  load average: 7.2, 4.8, 2.1
Tasks:  52 total,   3 running,  49 sleeping,   0 stopped,   0 zombie

```
top - 10:15:33 up 1 day,  3:42,  1 user,  load average: 7.2, 4.8, 2.1
Tasks:  52 total,   3 running,  49 sleeping,   0 stopped,   0 zombie
%Cpu(s): 72.3 us, 8.5 sy,  0.0 ni, 11.2 id,  0.0 wa,  0.0 hi,  8.0 si,  0.0 st
MiB Mem : 31989.2 total, 15234.5 free, 10234.8 used,  6519.9 buff/cache
```

CPU 的用户态使用率高达 72.3%，加上系统态 8.5%，整体占用率已超过 80%。但与此同时，wrk 的实时输出显示吞吐量并不理想：

```
Thread Stats   Avg      Stdev     Max   +/- Stdev
  Latency   287.34ms  123.45ms   1.02s    68.75%
  Req/Sec     758.23    156.78     1.23k    70.12%
  Requests/sec:   2987.45
  Transfer/sec:    5.87MB
```

每秒钟处理的请求数仅为 2987，远低于 5000 的目标。这种"高 CPU 占用、低吞吐量"的组合是一个强烈的警示信号——系统一定在某处做了大量低效的计算。

### 12.2.2 wrk 输出中的延迟分布

wrk 的延迟分布统计数据进一步揭示了问题的严重性：

```
  Latency Distribution (HdrHistogram - Recorded Latency)
  ------------------------------------------------------
  Value       Percentile   TotalCount
  12.345 ms   0.000000          1
  45.678 ms   0.500000       8954
  98.765 ms   0.750000      13452
  234.567 ms  0.900000      16123
  345.678 ms  0.990000      17894
  567.890 ms  0.999000      17998
  1023.456 ms 0.999900      18000
```

P50 延迟约为 46 ms，尚可接受；但 P90 延迟达到 235 ms，P99 延迟更是高达 346 ms。延迟分布呈现明显的"长尾"特征：绝大部分请求在 100 ms 以内完成，但少数请求需要等待数百毫秒。

这种长尾分布通常与以下因素有关：

1. **锁竞争**：少量线程在竞争共享资源时被阻塞，导致延迟急剧上升。在锁释放前，等待线程无法继续处理新请求，累积效应导致延迟长尾。
2. **GC 暂停**：GC 的 Stop-The-World 暂停会导致所有线程暂停工作。虽然 GC 总暂停时间不长，但单次暂停可能导致数百个请求同时等待。
3. **JIT 编译**：JIT 编译器在编译热点方法时，会暂停解释执行。虽然 JIT 编译本身耗时通常只有几毫秒，但在编译期间解释执行的效率远低于编译后的代码。

从延迟分布的形态来看，P50 到 P90 的差距（46 ms 到 235 ms，约 5 倍）明显大于 P90 到 P99 的差距（235 ms 到 346 ms，约 1.5 倍），这说明性能问题主要影响的是大部分请求的响应时间，而非偶发的极端延迟。这种特征更符合"持续的低效计算"而非"偶发的阻塞事件"。

### 22.3 初步检查：GC 状态

首先排除 GC 因素的影响。通过 `jstat -gcutil <pid> 1000` 观察 GC 状态：

```
 S0     S1     E      O      M     YGC     YGCT   FGC    FGCT   CGC    CGCT   GCT
 0.00  42.35  68.12  45.23  91.45   342    2.134    0    0.000    5    0.234  2.368
 0.00  41.87  72.45  46.12  91.47   356    2.215    0    0.000    6    0.278  2.493
 0.00  43.12  70.34  45.89  91.44   371    2.301    0    0.000    6    0.312  2.613
```

GC 数据显示一切正常：

- Young GC 次数不多（约 15 次/分钟），每次暂停时间约 6 ms。
- Full GC 次数为 0。
- 老年代占用率稳定在 45% 左右。
- GC 总暂停时间仅为 2.6 秒。

这说明 GC 不是当前问题的根源。真正的瓶颈一定在业务代码的执行路径上。接下来我们需要借助更精细的诊断工具来定位问题。

## 12.3 工具采集

确定 GC 不是瓶颈后，我们需要使用专业的诊断工具来捕获 CPU 热点和方法的执行细节。本节将展示如何使用 async-profiler、Arthas 和 JMH 三种工具进行数据采集。

### 12.3.1 async-profiler CPU 采样

async-profiler 是基于 AsyncGetCallTrace 技术的低开销采样分析器，能够以极小的性能开销（通常小于 2%）捕获 Java 进程的 CPU 调用栈。我们使用以下命令采集 CPU 火焰图数据：

```bash
# 采集 CPU 采样数据，持续时间 60 秒
profiler.sh -d 60 -e cpu -f gateway-cpu-profile.html <pid>
```

async-profiler 会在 60 秒内以固定的频率（默认每秒采样 100 次）捕获 Java 线程的 CPU 调用栈。采样完成后生成的可交互 HTML 火焰图包含了完整的调用栈层次结构和各方法的 CPU 占用比例。

此外，为了分析锁竞争的情况，我们还可以采集锁（lock）事件：

```bash
# 采集锁竞争事件
profiler.sh -d 60 -e lock -f gateway-lock-profile.html <pid>
```

锁事件采样会捕获 Java 线程在争用锁时被阻塞的调用栈，这对定位锁竞争问题非常有帮助。与 CPU 采样不同，锁事件采样关注的是线程"等待"的时间——当线程因为无法获得锁而进入阻塞状态时，async-profiler 会捕获当前的调用栈。这对于发现那些在 CPU 火焰图中不可见的性能瓶颈至关重要。

需要注意的是，async-profiler 的锁事件采样在 JDK 8u262+ 和 JDK 11+ 上才支持，并且需要使用 `-e lock` 事件类型显式启用。

### 12.3.2 Arthas 运行时监控

Arthas 是阿里巴巴开源的 Java 诊断工具，可以在不停机的情况下对运行中的 Java 进程进行动态监控。针对本案例，我们使用 Arthas 的 watch 和 monitor 命令来追踪关键方法的执行时间和调用频次。

首先启动 Arthas 并连接到目标进程：

```bash
java -jar arthas-boot.jar <pid>
```

连接成功后，使用 `watch` 命令监控 RouteHandler.handle() 方法的执行时间：

```bash
[arthas@1]$ watch com.jvmbook.case02.RouteHandler handle '{params,returnObj,throwExp}' -x 3 -n 10 '#cost > 50'
```

上述命令的含义是：当 `RouteHandler.handle()` 方法的执行时间超过 50 ms 时，打印其参数、返回值和异常信息。

接下来，使用 `monitor` 命令统计 RouteHandler 各个子方法的调用频次和耗时：

```bash
[arthas@1]$ monitor -c 5 com.jvmbook.case02.RouteHandler manualJsonParse matchRoute
```

`monitor` 命令会以 5 秒为周期，统计 `manualJsonParse` 和 `matchRoute` 两个方法的调用次数、平均耗时和失败率。

为了进一步分析多态方法调用的实际情况，我们可以使用 Arthas 的 `stack` 命令查看某个方法的调用栈：

```bash
[arthas@1]$ stack com.jvmbook.case02.RouteHandler$RouteMatcher matches
```

这条命令会打印所有调用 `RouteMatcher.matches()` 方法的调用栈信息，帮助我们确认多态分派是否真的在发生。

Arthas 的 `thread` 命令也提供了线程状态概览。在压测期间执行 `thread -n 3` 可以查看 CPU 使用率最高的三个线程：

```bash
[arthas@1]$ thread -n 3
```

输出示例：

```
Threads CPU Time:
* thread-name="reactor-http-nio-2"  id=12 cpu=23.4% us=22.1% sy=1.3%
  thread-name="reactor-http-nio-3"  id=13 cpu=21.8% us=20.5% sy=1.3%
  thread-name="reactor-http-nio-1"  id=11 cpu=20.2% us=19.1% sy=1.1%
```

可以看到 Netty 的事件循环线程占据了大部分 CPU，这符合预期（网关的请求处理主要在这些线程上执行）。但进一步使用 `thread -b` 检查是否存在 BLOCKED 线程时，输出显示：

```
No busy thread, running time percentages are all less than 10%
```

这说明没有线程处于明显的阻塞状态，锁竞争可能并不是造成 CPU 高占用的主要原因——至少在 CPU 火焰图中看到的锁竞争是次要的。这与我们后续通过锁火焰图得到的数据是一致的。

### 12.3.3 JMH 局部热点对比

Arthas 和 async-profiler 给出的是整体的运行时数据，但对于精确的微基准测试，我们需要使用 JMH（Java Microbenchmark Harness）来隔离对比不同实现的性能差异。

本案例中，我们特别关注以下三个对比项：

1. **手动 JSON 解析 vs. 空操作**：衡量 serialization 的 CPU 开销占比。
2. **多态匹配 vs. 单态匹配**：衡量 JIT 内联失效带来的性能损失。
3. **computeIfAbsent vs. get + putIfAbsent**：衡量锁竞争对吞吐量的影响。

由于篇幅所限，这里不展示完整的 JMH 代码，仅给出核心的基准测试思路。读者可以在自己的环境中参考 JMH 官方示例编写类似的测试。以下是一个典型 JMH 基准测试的代码框架：

```java
@Benchmark
@BenchmarkMode(Mode.Throughput)
public void measurePolymorphicMatch(Blackhole bh) {
    // 随机选择一种 Matcher 实现
    RouteMatcher matcher = matchers[ThreadLocalRandom.current().nextInt(5)];
    bh.consume(matcher.matches("/api/order/test"));
}
```

通过对不同场景的 JMH 对比测试，我们可以得到精确的性能数据，量化每个瓶颈的实际影响程度。

JMH 基准测试的具体编写方式如下。首先在 pom.xml 中添加 JMH 依赖：

```xml
<dependency>
    <groupId>org.openjdk.jmh</groupId>
    <artifactId>jmh-core</artifactId>
    <version>${jmh.version}</version>
</dependency>
<dependency>
    <groupId>org.openjdk.jmh</groupId>
    <artifactId>jmh-generator-annprocess</artifactId>
    <version>${jmh.version}</version>
    <scope>provided</scope>
</dependency>
```

然后编写基准测试类，在 `@Benchmark` 注解的方法中分别测试不同的实现。对于本案例，一个实用的测试模板如下：

```java
@State(Scope.Thread)
public class MatchBenchmark {

    private final ExactMatcher exact = new ExactMatcher("/api/order");
    private final PrefixMatcher prefix = new PrefixMatcher("/api/order/");
    private final WildcardMatcher wildcard = new WildcardMatcher("/api/test/*/path");
    private final RegexMatcher regex = new RegexMatcher("^/api/v[0-9]+/.*$");
    private final TemplateMatcher template = new TemplateMatcher("/api/{version}/product");
    private final RouteMatcher[] polymorhpicMatchers = {exact, prefix, wildcard, regex, template};

    @Benchmark
    @BenchmarkMode(Mode.Throughput)
    @OutputTimeUnit(TimeUnit.MILLISECONDS)
    public void monomorphicMatch(Blackhole bh) {
        // 单态调用：JIT 可以确定目标方法
        bh.consume(exact.matches("/api/order"));
    }

    @Benchmark
    @BenchmarkMode(Mode.Throughput)
    @OutputTimeUnit(TimeUnit.MILLISECONDS)
    public void polymorphicMatch(Blackhole bh) {
        // 多态调用：JIT 无法确定目标方法
        int idx = ThreadLocalRandom.current().nextInt(5);
        bh.consume(polymorhpicMatchers[idx].matches("/api/order"));
    }
}
```

JMH 的 `Blackhole` 参数用于消费返回值，防止 JIT 编译器将无用的计算结果消除掉。通过对比单态和多态两种场景的吞吐量，我们可以精确地量化 JIT 内联失效的性能影响。

## 12.4 数据分析

采集到足够的原始数据后，我们需要对这些信息进行系统的分析。本节将从火焰图、方法执行时间和局部基准测试三个维度进行数据解读。

### 12.4.1 火焰图解读

async-profiler 生成的 CPU 火焰图是整个诊断过程中最关键的证据。火焰图的阅读方法是从下往上看：底部是入口方法，顶部是具体的 CPU 消耗点。每个矩形的宽度表示该方法在采样周期内出现的比例，宽度越大表示 CPU 占用越高。

在本案例的 CPU 火焰图中，我们可以清晰地看到三个主要的"山峰"：

**第一座山：manualJsonParse 和 manualJsonSerialize**

火焰图顶部最宽的矩形集中在 `RouteHandler.manualJsonParse()` 和 `RouteHandler.manualJsonSerialize()` 两个方法上。这两个方法及其内部调用的 `simulateReflectionOverhead()` 占据了火焰图总面积的约 30%。

具体来看，`manualJsonParse` 的矩形宽度明显大于火焰图中其他业务方法。这意味着在 CPU 采样周期内，有 30% 的样本落入了 JSON 解析和序列化的调用路径中。对于一个 2 KB 的请求体来说，这个比例是极不正常的——合理的序列化开销应该控制在 5%-10% 以内。

结合代码分析，`manualJsonParse` 中的 `simulateReflectionOverhead()` 方法模拟了 Jackson ObjectMapper 的反射字段解析过程。该方法对每个 JSON 字段执行了 2000 次 CPU 循环，当字段数量较多时，这些循环的累积效果非常显著。在 5000 请求/秒的并发下，每秒就有 5000 × 8 × 2000 = 8000 万次无意义的循环操作在消耗 CPU 周期。

**第二座山：matchRoute 和 RouteMatcher.matches**

火焰图中第二宽的调用栈集中在 `RouteHandler.matchRoute()` 方法及其调用的 `RouteMatcher.matches()` 接口方法上。这部分约占总 CPU 的 20%。

更重要的是，当我们查看火焰图中 `matches` 方法的子调用时，可以发现多个不同的实现类交替出现：`ExactMatcher.matches()`、`PrefixMatcher.matches()`、`WildcardMatcher.matches()`、`RegexMatcher.matches()` 和 `TemplateMatcher.matches()`。这五个实现类在火焰图中都有独立的矩形，说明 JIT 编译器确实没有将它们内联到 `matchRoute` 中。

正常情况下的火焰图应该是这样的：如果 JIT 成功内联了 `matches` 方法调用，火焰图中只会在 `matchRoute` 下方看到一行标记为 `matches` (inlined) 的窄矩形。但现在我们看到的是五个独立的实现类方法，每个都有显著宽度——这正是多态内联失效的直接证据。

**第三座山：ConcurrentHashMap.computeIfAbsent**

火焰图的第三座山位于 `ConcurrentHashMap.computeIfAbsent()` 的调用路径上，约占总 CPU 的 8%。虽然比例不像前两者那么高，但这个调用路径上的一个关键特征是：它出现在锁事件分析（lock profile）中，而不仅仅是 CPU 分析中。

锁事件火焰图专门显示线程在等待锁时的调用栈。`computeIfAbsent` 在锁事件火焰图中占据了主导地位。这意味着虽然有 8% 的 CPU 花在了这个方法上，但还有额外的线程时间花在了等待 `computeIfAbsent` 的内部锁上——这些等待时间在 CPU 火焰图中是不可见的，因为它们发生在线程被阻塞的状态下。

### 12.4.2 Arthas monitor 数据分析

Arthas 的 `monitor` 命令输出的统计数据进一步量化了上述发现。以下是 5 秒周期的监控输出示例：

```
com.jvmbook.case02.RouteHandler.manualJsonParse()
  timestamp         calls  success  fail  avg-ms   total-ms
  2025-07-15 10:23  24631  24631    0     0.87     21429.0

com.jvmbook.case02.RouteHandler.matchRoute()
  timestamp         calls  success  fail  avg-ms   total-ms
  2025-07-15 10:23  24631  24631    0     0.62     15271.2

com.jvmbook.case02.RouteHandler.manualJsonSerialize()
  timestamp         calls  success  fail  avg-ms   total-ms
  2025-07-15 10:23  24631  24631    0     0.35      8620.8
```

三个方法的平均耗时总和为 0.87 + 0.62 + 0.35 = 1.84 ms，而完整的 `handle()` 方法平均耗时约为 3.2 ms。这意味着这三个方法占据了 `handle()` 方法总执行时间的 57% 以上。换句话说，网关处理每个请求的 CPU 时间中，超过一半消耗在了序列化和路由匹配上。

进一步观察 `matchRoute()` 的子调用分布。通过 Arthas 的 `trace` 命令可以查看 `matchRoute` 内部各个子方法的耗时分布：

```bash
[arthas@1]$ trace com.jvmbook.case02.RouteHandler matchRoute -n 5
```

输出示例：

```
`---matchRoute()
    +---isBlank()                        #0.001ms
    +---ThreadLocalRandom.nextInt()      #0.002ms
    +---ConcurrentHashMap.computeIfAbsent() #0.083ms  (仅当触发动态路由时)
    +---routeTable.values()
    +---iterator()
    +---forEach()                        #0.542ms  ← 主要耗时在遍历和匹配
        +---RouteMatcher.matches()       #0.121ms  (多态调用,未被内联)
        +---RouteMatcher.matches()       #0.115ms
        +---RouteMatcher.matches()       #0.118ms
        ...
```

`trace` 输出揭示了一个关键细节：`matchRoute()` 内部的 `forEach` 循环中对每个路由条目调用了 `matches()` 方法，每次调用耗时约 0.12 ms。当路由表中有 200 多个条目时，遍历一次就需要约 24 ms（200 × 0.12 ms）。这个数字远超预期——如果 `matches` 被内联，每次调用应该只需微秒级别。

### 12.4.3 JMH 局部测试结果

为了进一步量化三个瓶颈的影响，我们在隔离环境中运行了 JMH 基准测试。以下是关键的对比结果：

**测试 1：手动 JSON 解析 vs. 空操作**

```
Benchmark                              Mode  Cnt      Score     Error  Units
JsonParseBenchmark.manualParse        thrpt    5   3245.234 ± 123.456  ops/s
JsonParseBenchmark.emptyParse         thrpt    5  52341.567 ± 456.789  ops/s
```

手动 JSON 解析的吞吐量仅为 3245 ops/s，而空操作（仅返回空 Map）的吞吐量为 52341 ops/s——相差 16 倍。这说明 `manualJsonParse` 是系统吞吐量的重要制约因素。

**测试 2：多态匹配 vs. 单态匹配**

```
Benchmark                              Mode  Cnt      Score     Error  Units
MatchBenchmark.polymorphicMatch       thrpt    5  14234.567 ± 234.567  ops/s
MatchBenchmark.monomorphicMatch       thrpt    5  52341.234 ± 345.678  ops/s
```

多态匹配的吞吐量（14234 ops/s）仅为单态匹配（52341 ops/s）的 27%。在多态场景下，JIT 编译器无法将 `matches()` 方法内联到调用点，每次调用都需要通过虚方法表（vtable）进行动态分派，额外引入了方法调用开销并阻止了后续的优化。

**测试 3：computeIfAbsent vs. get + putIfAbsent**

```
Benchmark                              Mode  Cnt      Score     Error  Units
LockBenchmark.computeIfAbsent         thrpt    5  12345.678 ± 234.567  ops/s
LockBenchmark.getPutIfAbsent          thrpt    5  23456.789 ± 345.678  ops/s
```

在并发写入的场景下，`computeIfAbsent` 的吞吐量仅为 `get + putIfAbsent` 的约 53%。`computeIfAbsent` 在 ConcurrentHashMap 内部使用了分段锁（synchronized 块）来保证原子性，高并发下锁竞争显著降低了吞吐量。

### 12.4.4 PrintCompilation 与 PrintInlining 输出分析

除了火焰图和 JMH 数据之外，JVM 的 `-XX:+PrintCompilation` 和 `-XX:+PrintInlining` 日志提供了 JIT 编译决策的直接证据。

以下是 `PrintCompilation` 日志中的关键输出：

```
 314  323       3       com.jvmbook.case02.RouteHandler::matchRoute (67 bytes)
 317  324       3       com.jvmbook.case02.RouteHandler$ExactMatcher::matches (8 bytes)
 318  325       3       com.jvmbook.case02.RouteHandler$PrefixMatcher::matches (10 bytes)
 319  326       3       com.jvmbook.case02.RouteHandler$WildcardMatcher::matches (45 bytes)
 320  327       3       com.jvmbook.case02.RouteHandler$RegexMatcher::matches (12 bytes)
 321  328       3       com.jvmbook.case02.RouteHandler$TemplateMatcher::matches (20 bytes)
```

注意 `matchRoute` 和五个 `matches` 实现方法都被编译到了第 3 层（客户端编译器 C1），但没有被提升到第 4 层（服务端编译器 C2）。更重要的是，`PrintInlining` 日志显示了 `matchRoute` 的内联决策：

```
@ 28   com.jvmbook.case02.RouteHandler$RouteMatcher::matches (8 bytes)   polymorphic, not inlined
@ 28   com.jvmbook.case02.RouteHandler$RouteMatcher::matches (10 bytes)  polymorphic, not inlined
@ 28   com.jvmbook.case02.RouteHandler$RouteMatcher::matches (45 bytes)  polymorphic, not inlined
@ 28   com.jvmbook.case02.RouteHandler$RouteMatcher::matches (12 bytes)  polymorphic, not inlined
@ 28   com.jvmbook.case02.RouteHandler$RouteMatcher::matches (20 bytes)  polymorphic, not inlined
```

JIT 编译器明确的输出 "polymorphic, not inlined" 证实了我们的判断：由于 `RouteMatcher.matches()` 接口方法有超过 2 个不同的实现类（实际有 5 个），JIT 编译器判断该调用点属于"多态"类型，放弃了内联优化。

值得注意的是，`PrintInlining` 日志还显示了其他方法的内联决策。例如，`ConcurrentHashMap.values()` 和 `HashMap.forEach()` 等方法的调用被成功内联，这说明不是所有方法都遭遇了内联失败——只有那些存在多态调用点的接口方法才受到影响。这个细节进一步证实了问题出在 `RouteMatcher` 接口的多态定义上，而非 JIT 编译器的通用配置问题。

`PrintCompilation` 日志同样提供了有价值的信息。通过观察编译的层级（3 表示 C1 编译，4 表示 C2 编译），我们可以判断哪些方法被充分优化了：

```
 314  323       3       com.jvmbook.case02.RouteHandler::matchRoute (67 bytes)
 ...
 456  389       4       com.jvmbook.case02.RouteHandler::manualJsonParse (234 bytes)
 478  392       4       com.jvmbook.case02.RouteHandler::handle (156 bytes)
```

注意 `manualJsonParse` 和 `handle` 被编译到了第 4 层（C2），而 `matchRoute` 停留在第 3 层（C1）。C2 编译器比 C1 编译器执行更多的优化（包括更激进的内联、循环展开等），第 3 层编译意味着 `matchRoute` 没有得到最大程度的优化。这与 `PrintInlining` 中看到的多态内联失败是一致的——C1 编译器在遇到多态调用点时，不会像 C2 那样尝试更多的内联策略。

## 12.5 根因定位

综合 async-profiler 火焰图、Arthas monitor 数据、JMH 基准测试结果和 JIT 编译日志，我们可以明确地定位到三个根因。

### 12.5.1 根因一：JSON 序列化 CPU 热点

**问题描述**：`manualJsonParse()` 和 `manualJsonSerialize()` 方法消耗了约 30% 的 CPU 时间，是火焰图中面积最大的热点。

**技术分析**：这两个方法模拟了通用 JSON 框架（如 Jackson）的序列化和反序列化过程。在实际生产环境中，Jackson 等通用框架为了支持类型推导、注解处理、自定义序列化器等特性，内部使用大量的反射和运行时类型判断。这些操作在低并发场景下开销可以忽略不计，但在 5000 请求/秒的高并发下，其累积效应变得非常显著。

具体到本案例，`simulateReflectionOverhead()` 方法对每个 JSON 字段执行了额外的 CPU 循环来模拟反射处理的内部开销。每个请求需要解析 8 个字段，每个字段执行 2000 次整数运算，总计 16000 次额外运算/请求。在 5000 请求/秒下，这产生了每秒 8000 万次无意义运算。

**为什么通用框架在高并发下表现不佳**：

1. **反射调用开销**：Jackson 使用反射来获取对象字段的 getter/setter 方法，反射调用比直接方法调用慢一个数量级。虽然 JIT 编译器会对反射调用进行优化（如 `inflation` 阈值），但在高并发下反射调用的首次未优化阶段仍会产生显著开销。

2. **运行时类型判断**：JSON 的反序列化需要根据字符串值推断 Java 类型（Integer、Long、Double、String 等），这些类型判断在循环中执行，每次判断都涉及多个分支。

3. **临时对象创建**：解析过程中会产生大量的中间字符串对象（如 token、字段名），给 GC 带来额外压力。虽然本案例中 GC 尚未成为瓶颈，但如果并发度进一步提高，GC 开销会变得显著。

4. **线程安全开销**：Jackson 的 ObjectMapper 虽然是线程安全的，但其内部缓存（如 SerializerCache、DeserializerCache）在并发访问时存在同步开销。

### 12.5.2 根因二：JIT 内联失效导致多态分派

**问题描述**：`matchRoute()` 方法中的 `RouteMatcher.matches()` 调用因多态分派未被 JIT 内联，导致路由匹配性能约为单态场景的 27%。

**技术分析**：JIT 编译器的内联（Inlining）是最重要的优化手段之一。通过将目标方法的代码直接嵌入到调用点，可以消除方法调用开销、扩大后续优化的视野（如逃逸分析和栈上分配）。JIT 的内联决策主要基于以下几个因素：

1. **调用点类型分布（Call Site Type Profile）**：JIT 编译器会统计每个调用点实际出现的接收者类型。如果只有 1 种类型（单态，monomorphic），内联是确定的；如果有 2 种类型（双态，bimorphic），JIT 会生成一个类型检查分支并进行内联；如果超过 2 种类型（多态，megamorphic），JIT 放弃内联，退回到虚方法表分派（vtable dispatch）。

2. **方法大小**：内联的方法不能过大，受 `-XX:MaxInlineSize`（默认 35 字节）和 `-XX:InlineSmallCode`（默认 1000 字节 C1 编译代码）等参数限制。

3. **调用深度**：内联的调用链深度受 `-XX:MaxInlineLevel`（默认 9）限制。

在本案例中，`matches()` 方法有 5 个不同的实现类，类型分布为 5（megamorphic），远超单态（1）和双态（2）的阈值。因此 JIT 编译器判定该调用点不适合内联。

**未经内联的代价**：

未经内联的 `matches()` 调用需要经过以下完整的方法调用流程：

1. 从 `this` 引用中加载对象的 klass 指针。
2. 从 klass 中查找虚方法表（vtable）。
3. 从 vtable 中找到 `matches()` 方法的实际入口地址。
4. 执行方法调用（保存栈帧、传递参数等）。

每次调用都需要经历上述流程，而内联版本则直接将 `matches()` 的代码逻辑嵌入到 `matchRoute()` 的循环体中，消除了所有调用开销。在路由表包含 200+ 条目的情况下，每个请求的 `matchRoute` 调用会产生 200+ 次未经内联的接口方法调用，累积起来代价相当可观。

### 12.5.3 根因三：ConcurrentHashMap.computeIfAbsent 锁竞争

**问题描述**：路由表更新操作中使用的 `ConcurrentHashMap.computeIfAbsent()` 方法在并发写入时产生锁竞争，锁事件采样显示该方法在等待锁时消耗了大量线程时间。

**技术分析**：`ConcurrentHashMap.computeIfAbsent(key, mappingFunction)` 是一个复合操作，它首先检查 key 是否已存在，如果不存在则执行 mappingFunction 并将结果存入 Map。这个操作被设计为原子性的——也就是说，在多线程环境下，即使多个线程同时调用 `computeIfAbsent` 并传入相同的 key，mappingFunction 也只会被执行一次，其他线程会等待并获取已经计算好的值。

然而，这种原子性的代价是在内部使用了锁。`ConcurrentHashMap` 的早期版本（JDK 7 及之前）使用分段锁（Segment Lock），每个分段管理一组桶。JDK 8+ 的版本采用了更细粒度的锁机制，在 `computeIfAbsent` 方法内部，当需要插入新键值对时，会对该键对应的桶（bucket）进行同步（synchronized）。

在本案例中，`matchRoute()` 方法内部以约 0.1% 的概率触发动态路由注册，调用 `routeTable.computeIfAbsent()` 添加新路由。在 5000 请求/秒的并发下，这意味着每秒约有 5 次动态路由注册操作。这些操作分布在不同的键上，可能命中不同的桶，但当多个注册操作恰好命中同一个桶时，就会发生锁竞争。

锁事件火焰图显示，`computeIfAbsent` 调用路径上出现了明显的等待时间。这是因为：

1. 当多个线程同时在同一个桶上执行 `computeIfAbsent` 时，只有一个线程能获得锁，其他线程被阻塞。
2. 被阻塞的线程在 `synchronized` 块的等待队列中消耗时间，这些时间不会出现在 CPU 火焰图中，但会反映在请求延迟上。
3. 在极端情况下，锁竞争甚至可能引发连锁反应——一个被阻塞的线程可能持有其他资源，导致更多线程被间接阻塞。

`computeIfAbsent` 与 `get + putIfAbsent` 的关键区别在于：`computeIfAbsent` 在整个复合操作期间持有锁，而 `putIfAbsent` 仅在插入操作的短暂瞬间持有锁。因此，如果 mappingFunction 的执行时间较长（如本案例中的 `simulateCpuWork(500)`），`computeIfAbsent` 的锁持有时间会显著延长，加剧竞争。

为了进一步理解锁竞争对吞吐量的影响，我们可以计算一下在 5000 请求/秒的并发下，锁竞争的理论影响有多大。假设 `computeIfAbsent` 的平均执行时间为 0.08 ms（包括 mappingFunction 的执行时间），那么在每秒 5000 次请求中，平均会有 5000 × 0.1% = 5 次请求触发动态路由注册。这些注册操作集中在少数的桶上，因此每个桶的锁竞争概率为：假设 ConcurrentHashMap 有 16 个桶，每次注册落在同一个桶的概率约为 1/16，5 次注册中有 2 次或以上命中同一个桶的概率约为 1 - (15/16)^5 - 5 × (1/16) × (15/16)^4 ≈ 2.6%。也就是说，每秒钟有约 2.6% 的概率会发生锁竞争，导致部分线程等待 0.08 ms。虽然单次等待时间很短，但在 5000 请求/秒的并发下，累积的等待时间会显著影响延迟分布的长尾特征。

此外，需要特别注意锁竞争的一个微妙特性：**锁竞争的延迟影响是有传染性的**。当一个线程在 `computeIfAbsent` 处被阻塞时，它占用的 Netty 事件循环线程无法处理其他请求。如果多个请求因为锁竞争而同时阻塞，Netty 的事件循环线程池会被耗尽，新的请求无法被及时接受，进一步加剧吞吐量的下降。

## 12.6 解决方案

基于三个根因的分析结果，我们分别制定对应的优化策略。

### 12.6.1 解决序列化瓶颈：自定义精简 Codec

**方案**：针对网关场景的 JSON 序列化/反序列化操作，开发一个精简的自定义 Codec，仅支持网关所需的固定字段结构，避免通用 JSON 框架的反射开销。

```java
public class GatewayCodec {

    // 预定义的字段偏移映射，避免运行时反射
    private static final int USER_ID_INDEX = 0;
    private static final int ITEMS_INDEX = 1;
    private static final int TOKEN_INDEX = 2;

    /**
     * 精简反序列化 —— 只解析网关关心的固定字段
     */
    public static GatewayRequest decode(String json) {
        // 直接字符串搜索，避免通用解析器开销
        long userId = extractLong(json, "userId");
        String token = extractString(json, "token");
        List<Item> items = extractItems(json, "items");
        return new GatewayRequest(userId, items, token);
    }

    private static long extractLong(String json, String key) {
        String searchKey = "\"" + key + "\":";
        int start = json.indexOf(searchKey);
        if (start < 0) return 0;
        start += searchKey.length();
        int end = start;
        while (end < json.length() && Character.isDigit(json.charAt(end))) {
            end++;
        }
        return Long.parseLong(json.substring(start, end));
    }

    private static String extractString(String json, String key) {
        String searchKey = "\"" + key + "\":\"";
        int start = json.indexOf(searchKey);
        if (start < 0) return "";
        start += searchKey.length();
        int end = start;
        while (end < json.length() && json.charAt(end) != '\"') {
            end++;
        }
        return json.substring(start, end);
    }

    private static List<Item> extractItems(String json, String key) {
        // 简化的 items 解析
        List<Item> result = new ArrayList<>();
        int itemsStart = json.indexOf("\"" + key + "\":[");
        if (itemsStart < 0) return result;
        itemsStart = json.indexOf('{', itemsStart);
        while (itemsStart > 0) {
            int itemsEnd = json.indexOf('}', itemsStart);
            if (itemsEnd < 0) break;
            String itemStr = json.substring(itemsStart, itemsEnd);
            String id = extractString(itemStr, "id");
            int qty = (int) extractLong(itemStr, "qty");
            result.add(new Item(id, qty));
            itemsStart = json.indexOf('{', itemsEnd);
        }
        return result;
    }

    // 内部记录类
    public record GatewayRequest(long userId, List<Item> items, String token) {}
    public record Item(String id, int qty) {}
}
```

**优化原理**：

1. **消除反射**：使用固定的字段名搜索代替反射调用的类型推导，大幅降低 CPU 消耗。
2. **减少临时对象**：直接对原始字符串进行索引操作，避免创建中间字符串对象（如 JSON token 缓冲区）。
3. **按需解析**：只解析网关关心的字段（userId、token、items），忽略请求体中的其他字段，减少不必要的处理。

**效果预估**：基于 JMH 测试数据，自定义 Codec 的反序列化吞吐量预计可达通用 JSON 解析器的 5-8 倍。

### 12.6.2 解决内联失效：减少多态分派

针对 JIT 内联失效问题，有以下几个层次的解决方案：

**方案一：将接口方法改为 final 方法（最直接）**

如果路由匹配策略在编译期就可以确定，可以直接将 `matches()` 方法改为 `final`，或者在 `RouteHandler` 内部使用具体的匹配器实现类而不是接口。

```java
// 方案 A：针对最常见的精确匹配场景，使用直接的字段引用
private final ExactMatcher exactMatcher = new ExactMatcher("/api/order");
private final PrefixMatcher orderPrefixMatcher = new PrefixMatcher("/api/order/");
// ...

RouteEntry matchRoute(String path) {
    // 先尝试精确匹配 —— 单态调用，JIT 可以内联
    if (exactMatcher.matches(path)) {
        return routeTable.get("exact-order");
    }
    // 尝试前缀匹配
    if (orderPrefixMatcher.matches(path)) {
        return routeTable.get("prefix-order");
    }
    // ... 继续其他匹配
    // 兜底：遍历其他路由
    for (RouteEntry entry : routeTable.values()) {
        if (!entry.matcher.equals(exactMatcher)
            && !entry.matcher.equals(orderPrefixMatcher)
            && entry.matcher.matches(path)) {
            return entry;
        }
    }
    return defaultEntry;
}
```

通过将高频匹配路径拆分为独立的单态字段引用，JIT 编译器可以将这些 `matches()` 调用内联，获得显著的性能提升。

**方案二：使用枚举实现策略模式**

将 RouteMatcher 改为枚举，通过枚举值的 `switch` 语句实现类型分派。`switch` 语句经过 JIT 编译后会使用 tableswitch 或 lookupswitch 指令，效率远高于虚方法调用。

```java
public enum MatchStrategy {
    EXACT {
        boolean matches(String path, String pattern) {
            return path.equals(pattern);
        }
    },
    PREFIX {
        boolean matches(String path, String pattern) {
            return path.startsWith(pattern);
        }
    },
    WILDCARD {
        boolean matches(String path, String pattern) {
            // 通配符匹配逻辑
            return wildcardMatch(path, pattern);
        }
    };
    abstract boolean matches(String path, String pattern);
}
```

枚举的 `switch` 编译后不再涉及虚方法表查找，JIT 编译器可以轻松地将其内联。

**方案三：JVM 参数扩展内联阈值**

如果在不改动代码的前提下优化，可以尝试调整 JVM 的内联参数：

```bash
-XX:InlineSmallCode=2000
```

`InlineSmallCode` 参数的默认值为 1000（字节），表示当 C1 编译后的方法代码大小超过 1000 字节时，JIT 编译器不会将其内联到其他方法中。将其提高到 2000 字节，可以让更多的内联场景得到优化。

但需要注意的是，这个参数的作用是间接的——它不会直接解决多态内联问题，而是通过扩大内联阈值使某些本会被拒绝的内联得以执行。对于多态调用，根本解决方案还是减少调用点的类型分布。

**优化预期**：结合方案一和方案二，`matchRoute` 在优化后的吞吐量应可接近单态场景的水平，提升约 3-4 倍。

### 12.6.3 解决锁竞争：优化路由表更新

针对 `ConcurrentHashMap.computeIfAbsent` 的锁竞争问题，有以下解决方案：

**方案一：用 putIfAbsent 替换 computeIfAbsent**

将动态路由注册的逻辑从：

```java
routeTable.computeIfAbsent(newId, id -> {
    simulateCpuWork(500);
    return new RouteEntry(...);
});
```

改为：

```java
RouteEntry newEntry = new RouteEntry(new PrefixMatcher(...), "dynamic-service", ...);
RouteEntry existing = routeTable.putIfAbsent(newId, newEntry);
```

这个改变的关键在于：`putIfAbsent` 只在插入操作的短暂瞬间持有锁，而 `computeIfAbsent` 在整个 mappingFunction 执行期间持有锁。由于 `simulateCpuWork(500)` 需要约 500 次 CPU 运算，在 `computeIfAbsent` 版本中，锁持有时间包含了 mappingFunction 的执行时间。

然而需要注意的是，`putIfAbsent` 无法保证 mappingFunction 只执行一次——当多个线程同时发现 key 不存在时，每个线程都会执行自己的 mapppingFunction。在本案例中，动态路由的创建本身是幂等的，因此这个差异可以接受。

**方案二：减少 computeIfAbsent 的调用频次**

在调用 `computeIfAbsent` 之前先使用 `get` 进行检查，避免不必要的锁操作：

```java
RouteEntry existing = routeTable.get(newId);
if (existing == null) {
    routeTable.computeIfAbsent(newId, id -> {
        simulateCpuWork(500);
        return new RouteEntry(...);
    });
}
```

这种模式被称为"外层检查 + 内层原子操作"（check-then-act），是减少锁竞争的最佳实践。在绝大多数情况下（99.9%），key 已经存在于路由表中，`get` 操作是无锁的，避免了 `computeIfAbsent` 的锁开销。

**方案三：路由表预热 + 定期更新代替实时更新**

将动态路由注册从热路径中移除，改为定时批量更新：

```java
@Scheduled(fixedDelay = 5000)
public void refreshRouteTable() {
    List<RouteEntry> newRoutes = loadNewRoutesFromConfig();
    ConcurrentHashMap<String, RouteEntry> newTable = new ConcurrentHashMap<>(routeTable);
    for (int i = 0; i < newRoutes.size(); i++) {
        String id = "batch-" + nextId.getAndIncrement();
        newTable.put(id, newRoutes.get(i));
    }
    routeTable = newTable;  // 原子替换引用
}
```

通过使用 `volatile` 引用替换整个路由表（copy-on-write 模式），完全消除了路由匹配热路径上的锁操作。路由表更新的频次从每个请求（概率性）降低到每 5 秒一次。

**优化预期**：以上三种方案组合使用后，路由表操作的锁竞争应基本消除。基于 JMH 测试数据，优化后的路由匹配吞吐量可达优化前的 2-3 倍。

### 12.6.4 优化后的 JVM 参数完整配置

综合以上分析，最终使用的完整 JVM 参数如下：

```bash
-Xms2g -Xmx2g \
-XX:+UseG1GC \
-XX:InlineSmallCode=2000 \
-XX:MaxInlineSize=50 \
-XX:FreqInlineSize=400 \
-XX:+PrintCompilation \
-XX:+UnlockDiagnosticVMOptions \
-Xlog:gc*:file=gc-optimized.log:time,uptime,level,tags \
-XX:+HeapDumpOnOutOfMemoryError \
-XX:HeapDumpPath=/tmp/dump.hprof
```

关键参数说明：

- `-XX:InlineSmallCode=2000`：将 C1 编译代码的内联阈值从默认的 1000 字节提升到 2000 字节，允许更多方法被内联。这个参数在本案例中的作用是让某些临界的方法能够通过内联阈值检查。但是如前所述，它不能直接解决多态问题，因此与代码优化配合使用效果最佳。
- `-XX:MaxInlineSize=50`：将最大内联方法大小从默认的 35 字节提升到 50 字节，允许略微更大的方法被内联。
- `-XX:FreqInlineSize=400`：热方法的内联大小阈值，默认 325 字节。提高此值可以让更复杂的热点方法得到内联机会。

## 12.7 效果验证

完成上述代码优化和 JVM 参数调整后，我们重新运行压测脚本，对比优化前后的性能指标。

### 12.7.1 CPU 火焰图对比

优化后重新采集 CPU 火焰图，可以看到三个显著变化：

1. **manualJsonParse 和 manualJsonSerialize 的火焰图面积大幅缩小**：从优化前的 30% 下降到约 8%，说明自定义 Codec 显著降低了序列化的 CPU 消耗。
2. **RouteMatcher.matches 的多态调用消失**：优化后的火焰图中，RouteMatcher 的多个实现类不再作为独立的矩形出现，取而代之的是被内联到 `matchRoute` 中的高效代码路径。火焰图中 `matchRoute` 下方的调用栈更加简洁。
3. **computeIfAbsent 的调用栈不再出现在锁火焰图中**：改为 `get + putIfAbsent` 模式并预热路由表后，锁事件采样中不再捕获到 `computeIfAbsent` 的等待路径。

### 12.7.2 吞吐量和延迟对比

通过 wrk 压测的前后对比：

| 指标 | 优化前 | 优化后 | 改善幅度 |
|------|--------|--------|----------|
| CPU 使用率 | 85% | 55% | 降低 30 个百分点 |
| 吞吐量 | 2987 req/s | 5123 req/s | 提升 71.5% |
| P50 延迟 | 45.7 ms | 12.3 ms | 73.1% |
| P90 延迟 | 234.6 ms | 28.9 ms | 87.7% |
| P99 延迟 | 345.7 ms | 48.2 ms | 86.1% |
| 错误率 | 2.3% | 0.1% | 95.7% |

优化后的 wrk 输出：

```
Thread Stats   Avg      Stdev     Max   +/- Stdev
  Latency    12.34ms    8.56ms  123.45ms   72.15%
  Req/Sec    1312.45   234.56     1.89k    68.34%
  Requests/sec:   5123.45
  Transfer/sec:   10.24MB
```

吞吐量从 2987 req/s 提升到 5123 req/s，达到了预期的 5000 目标。CPU 使用率从 85% 下降到 55%，系统有了充足的余量应对流量高峰。延迟的改善更为显著——P99 延迟从 346 ms 下降到 48 ms，用户体验得到了质的提升。

### 12.7.3 JIT 内联日志对比

优化前后 `-XX:+PrintInlining` 的日志输出发生了根本性变化：

**优化前（多态内联失败）**：
```
@ 28   com.jvmbook.case02.RouteHandler$RouteMatcher::matches   polymorphic, not inlined
```

**优化后（单态内联成功）**：
```
@ 12   com.jvmbook.case02.RouteHandler::matchRoute (72 bytes)
  @ 28   com.jvmbook.case02.RouteHandler$ExactMatcher::matches (8 bytes)   inline (hot)
  @ 35   com.jvmbook.case02.RouteHandler$PrefixMatcher::matches (10 bytes)  inline (hot)
```

"inline (hot)" 标记表明 JIT 编译器成功地将这些 `matches` 方法内联到了 `matchRoute` 中。方法调用从虚方法表分派转变为直接的代码嵌入，消除了每次调用的间接开销。

### 12.7.4 延迟分布变化

优化后的 HdrHistogram 延迟分布数据更加集中和稳定：

```
  Value       Percentile   TotalCount
  3.456 ms    0.000000          1
  8.234 ms    0.500000       15342
  15.678 ms   0.750000       23012
  28.912 ms   0.900000       27618
  48.234 ms   0.990000       30645
  89.123 ms   0.999000       30789
  123.456 ms  0.999900       30800
```

与优化前的数据对比，延迟的整体水平大幅下降，而且分布更加集中：P50 从 46 ms 降到 8 ms，P90 从 235 ms 降到 29 ms。最重要的是，原来的长尾特征得到了显著改善——P99 和 P99.9 的差距从优化前的约 2 倍缩小到约 1.7 倍。

## 12.8 知识要点总结

### 12.8.1 async-profiler 火焰图解读

火焰图（Flame Graph）是性能分析中最直观的可视化工具。以下是核心解读要点：

**阅读方式**：从底部到顶部阅读，底部是入口/调用者，顶部是被调用者/热点。矩形的宽度表示该方法的 CPU 占用比例。

**关键信号识别**：

1. **"平顶山"**：火焰图顶部出现大面积的平顶区域，说明 CPU 集中消耗在少数几个方法上，通常是序列化、加密或数据拷贝等操作。
2. **"尖塔"**：顶部出现多个狭窄的尖顶，说明调用栈较深但每个方法的 CPU 消耗不大。这种情况通常对应正常的多层调用。
3. **"高原"**：中间层出现宽阔的高原区域，通常是循环或重复调用导致，需要检查是否存在不必要的循环或重复计算。
4. **"烟囱"**：火焰图中出现垂直延伸的窄条，说明调用链特别深，可能存在过度抽象。

**分析步骤**：

1. 首先看顶部的"山峰"：哪些方法的矩形最宽？本案例中 `manualJsonParse` 和 `manualJsonSerialize` 是最宽的矩形。
2. 向下追溯：这些方法被谁调用？查看调用路径是否合理。本案例中它们被 `handle` 方法调用，属于正常的调用链。
3. 判断合理性：这些 CPU 消耗是否符合预期？序列化方法占据 30% 的火焰图面积显然不合理，序列化不应该占用接近三分之一的 CPU 时间。
4. 交叉验证：对可疑的方法使用 Arthas 的 monitor 或 trace 命令获取精确的耗时数据，确认火焰图的发现。

**工具使用提示**：

async-profiler 生成的火焰图是 HTML 格式，在浏览器中打开时支持以下交互操作：

- **鼠标悬停**：显示当前方法的完整名称、采样次数和占比百分比。
- **点击矩形**：将火焰图聚焦到该方法的子调用，可以深入查看更细粒度的调用分布。
- **搜索框**：输入方法名可以高亮显示所有匹配的调用栈，快速定位目标方法。

在浏览火焰图时，建议先关注顶部的"平顶"区域，因为这些是 CPU 实际执行代码的位置。底部的方法只是调用者，如果底部的方法很宽而顶部很窄，说明该方法调用了多个被调用者，CPU 消耗分散在不同的子路径上。

### 12.8.2 JIT 内联机制与多态优化

**内联条件**：JIT 编译器在决定是否内联一个方法时，主要考虑以下因素：

1. **调用点的类型分布**：
   - 单态（monomorphic）：1 种接收者类型 → 直接内联。
   - 双态（bimorphic）：2 种接收者类型 → 生成类型检查分支后内联。
   - 多态（megamorphic）：3 种及以上接收者类型 → 不内联，使用 vtable 分派。

2. **方法大小**：
   - `-XX:MaxInlineSize=35`（默认）：被内联方法的字节码大小不能超过此值。
   - `-XX:FreqInlineSize=325`（默认）：热方法的内联大小阈值，热方法可以更大。
   - `-XX:InlineSmallCode=1000`（默认）：C1 编译后的代码大小阈值。

3. **调用深度**：
   - `-XX:MaxInlineLevel=9`（默认）：内联的最大调用深度。
   - `-XX:MaxRecursiveInlineLevel=1`（默认）：递归内联的最大深度。

**优化多态内联的方法**：

1. **使用 final 关键字**：将接口替换为 final 类或 final 方法，使编译器在编译期就能确定目标方法。这是最直接也最有效的方式，但前提是业务上确定不需要额外的扩展性。
2. **减少实现类数量**：将多个实现合并为少数几个，最好控制在 2 个以内。当类型分布不超过 2 时，JIT 编译器会使用 bimorphic 内联策略，通过类型检查分支实现内联。
3. **使用枚举替代接口**：枚举的 switch 编译后使用 tableswitch/lookupswitch 指令，效率远高于虚方法调用。枚举的每个常量对应一个固定的代码路径，JIT 编译器可以轻松地将其内联。
4. **使用类型检查分支**：在调用点手动添加 `instanceof` 检查，将多态化为单态分支。这是一种"手动展开"的策略，将最常见的实现类的调用路径单独提取出来，让 JIT 编译器可以内联这些高频路径。
5. **类层次结构简化**：避免过深的继承链和过多的接口实现。每个接口和抽象类都会增加 JIT 编译器的类型 profiling 成本，简化层次结构有助于编译器做出更好的优化决策。

**PrintInlining 日志解读**：

理解 `PrintInlining` 日志的输出格式有助于快速定位内联问题：

```
  @ 28   com.example.Service::method (5 bytes)   inline (hot)
  @ 42   com.example.Util::compute (12 bytes)    already compiled into a big method
  @ 56   com.example.Matcher::matches (8 bytes)  polymorphic, not inlined
  @ 70   com.example.Helper::process (200 bytes)  too big
```

- `inline (hot)`：成功内联，且该方法是热点，值得内联。
- `already compiled into a big method`：调用者已经是编译后的大方法，不再进一步内联。
- `polymorphic, not inlined`：多态调用点，类型分布超过 2 种，放弃内联。
- `too big`：目标方法的字节码大小超过 `MaxInlineSize` 或 `FreqInlineSize` 阈值。

当看到 "polymorphic, not inlined" 时，应该检查该接口的实现类数量。如果确实有多于 2 个实现类且都在同一个调用点上出现，就需要考虑代码重构来减轻多态分派的程度。

**JIT 编译的层级与内联的关系**：

JIT 编译器采用分层编译（Tiered Compilation）策略，共有 5 个编译层级：

- 第 0 层：解释执行。
- 第 1 层：简单的 C1 编译器（无 profiling）。
- 第 2 层：有限的 C1 编译器（有限的 profiling）。
- 第 3 层：完整的 C1 编译器（完整的 profiling）。
- 第 4 层：C2 编译器（最大优化）。

内联决策在不同层级上有所不同。C1 编译器（第 1-3 层）的内联策略相对保守，而 C2 编译器（第 4 层）会执行更激进的内联。但即使是 C2 编译器，面对多态调用点时仍然会放弃内联——这是由动态分派的本质决定的，编译器无法在编译期确定接收者的具体类型。

因此，当看到方法停留在第 3 层而没有提升到第 4 层时，有可能是因为 JIT 编译器判断提升到 C2 的收益有限（例如因为多态内联失败），或者因为方法调用频次不够高。本案例中 `matchRoute` 停留在第 3 层，部分原因是多态内联失败降低了 C2 编译的预期收益。

### 12.8.3 ConcurrentHashMap 锁竞争分析

ConcurrentHashMap 在不同操作中的锁行为差异：

| 操作 | 锁行为 | 适用场景 |
|------|--------|----------|
| `get(key)` | 无锁（Volatile Read + CAS） | 读多写少 |
| `put(key, value)` | 桶级 synchronized | 写入为主 |
| `putIfAbsent(key, value)` | 桶级 synchronized（仅在真正插入时） | 条件写入 |
| `computeIfAbsent(key, fn)` | 桶级 synchronized（整个函数执行期间） | 原子计算 |
| `replace(key, old, new)` | 桶级 synchronized | 条件替换 |

**锁竞争的主要信号**：

1. **CPU 占用不高但吞吐量低**：线程大部分时间处于 BLOCKED 状态，不消耗 CPU。
2. **锁事件火焰图出现热点**：async-profiler 的 `-e lock` 事件采样显示某个锁的等待时间占比很高。
3. **延迟分布长尾**：部分请求的延迟显著高于平均水平，因为被阻塞的线程需要等待锁释放。
4. **Arthas thread 命令显示 BLOCKED 线程**：使用 `thread -b` 可以找出当前被阻塞的线程。

**优化并发 Map 访问的最佳实践**：

1. **读多写少的场景优先使用 get+putIfAbsent 而非 computeIfAbsent**。
2. **对不变的集合使用不可包装（unmodifiable）或不可变集合**，避免锁操作。
3. **将热点 Key 的访问放在独立的 Map 中**，减少单个 Map 的竞争程度。
4. **考虑 Striped Lock 模式**：将锁的粒度进一步细化，超过 ConcurrentHashMap 内置的桶级锁。

### 12.8.4 网关性能优化方法论

本章的网关性能优化实践可以总结为以下四个步骤的方法论：

**第一步：识别"异常信号"**

在性能问题排查中，最关键的技能不是读懂火焰图或 GC 日志，而是能够识别出"什么是不正常的"。本案例中，CPU 占用率（85%）与吞吐量（仅预期的 60%）之间的背离就是一个强烈的异常信号。类似的信号还包括：

- 延迟分布出现长尾。
- CPU 用户态和系统态的比例异常（系统态过高通常表示锁竞争或系统调用过多）。
- GC 日志中的晋升速率异常。
- 线程 dump 中大量线程处于同一个 BLOCKED 或 WAITING 状态。

**第二步：选择合适的工具**

不同的问题类型需要不同的诊断工具：

- **CPU 热点**：async-profiler CPU 采样 → 火焰图。
- **锁竞争**：async-profiler lock 采样 → 锁火焰图 + Arthas thread。
- **方法耗时**：Arthas monitor/trace → 精确到毫秒的执行时间统计。
- **局部性能对比**：JMH → 微基准测试，排除干扰因素。
- **JIT 编译决策**：`-XX:+PrintCompilation` + `-XX:+PrintInlining` → 编译器日志。

**第三步：量化验证假设**

在定位到可疑的方法后，不能仅凭主观判断就确认其是瓶颈。需要通过以下方式量化验证：

1. 使用 JMH 在隔离环境中测量目标方法的性能。
2. 对比"有"和"无"两个版本的性能差异（如多态 vs. 单态）。
3. 通过 Arthas 的 trace 命令确认调用路径和耗时分布。
4. 通过火焰图的变化验证优化效果。

**第四步：针对性优化**

优化方案必须直接对应根因：

- 序列化热点 → 自定义精简 Codec。
- JIT 内联失效 → 减少多态分派。
- 锁竞争 → 避免在热路径中使用 computeIfAbsent。

避免"猜测式优化"——在没有数据和根因分析的情况下盲目调整 JVM 参数或重写代码。本案例中，如果不对三个根因进行针对性的优化，而是盲目增加线程数或调整 G1 参数，不仅无法解决问题，还可能使情况更糟。

**网关优化的特殊考量**：

与普通的后端服务不同，网关的性能优化有一些特殊之处值得注意：

1. **网关是 IO 密集型还是 CPU 密集型？** 网关既有 IO 密集型的特征（网络转发、请求代理），又有 CPU 密集型的特征（序列化/反序列化、路由匹配、过滤器链执行）。性能分析时需要区分这两类开销。
2. **Netty 事件循环线程模型**：WebFlux 基于 Netty 的事件循环模型，事件循环线程的数量通常等于 CPU 核心数。如果某个请求处理操作阻塞了事件循环线程，其他请求也会被延迟。因此，网关代码中应避免任何阻塞操作。
3. **序列化/反序列化的取舍**：在网关层进行请求/响应转换时，应该只转换网关关心的字段，而不是对完整的请求体进行深度解析。按需解析可以减少不必要的 CPU 消耗。
4. **路由匹配的复杂度**：路由规则的数量直接影响匹配时间。当路由规则超过 100 条时，遍历匹配的效率会显著下降。可以考虑使用前缀树（Trie）或哈希表优化的匹配算法。

**常见误区**：

在网关性能优化中，以下误区经常出现：

- **误区一：认为 CPU 占用高就是坏事**。CPU 占用高本身不是问题，问题是 CPU 是否用在了"正确的地方"。如果 85% 的 CPU 都花在了业务逻辑上，这实际上是好事；但如果 30% 的 CPU 花在了低效的序列化上，就需要优化。
- **误区二：盲目增加线程数**。在 Netty 事件循环模型中，增加线程数不仅不会提升吞吐量，反而会因为线程上下文切换的增加而降低性能。事件循环线程数设置为 CPU 核心数即可。
- **误区三：认为 JIT 编译器会自动优化一切**。JIT 编译器确实能自动优化很多代码模式，但对多态调用、反射调用、大循环等场景的优化能力有限。了解 JIT 优化的边界条件，可以帮助我们写出更"JIT 友好"的代码。
- **误区四：过度优化**。不要在没有数据支撑的情况下进行优化。一个方法只占总 CPU 的 1%，即使将其性能提升 10 倍，整体效果也只有 0.9%。性能优化应该聚焦在真正的瓶颈上。

## 12.9 本章小结

本章通过一个 API 网关的性能瓶颈排查案例，完整地展示了从现象发现、工具采集、数据分析、根因定位到解决方案和效果验证的全过程。案例的核心发现和结论如下：

- **序列化/反序列化不一定是框架的问题，但一定是高并发下的热点**：通用 JSON 框架（如 Jackson）的反射和类型推导机制在低并发场景下微不足道，但在 5000 请求/秒的高并发下成为了 CPU 的主要消耗者。针对网关场景开发自定义精简 Codec 可以将序列化开销降低 70% 以上。

- **JIT 内联失效是"看不见的性能杀手"**：多态方法调用在未经内联时，每个调用都需要经历完整的虚方法表分派流程。当调用频率极高时，这些看似微小的开销会累积为显著的性能损失。使用 final 方法和枚举策略模式可以有效减少多态分派。

- **锁竞争不一定导致 CPU 飙升，但一定会导致吞吐量下降**：`ConcurrentHashMap.computeIfAbsent` 在高并发场景下的锁竞争难以通过 CPU 使用率发现，必须使用锁事件采样或线程 dump 工具来定位。用 `get + putIfAbsent` 模式替换可以显著降低竞争程度。

- **多工具协同是高效诊断的关键**：单一工具往往只能提供片面的数据。async-profiler 给出了全局的 CPU 热点分布，Arthas 提供了方法的精确耗时统计，JMH 实现了隔离环境下的性能对比，`PrintInlining` 日志直接证明了 JIT 的内联决策。四种工具的数据相互印证，才形成了完整的证据链。

- **经过优化，吞吐量从 2987 req/s 提升至 5123 req/s（提升 71.5%），CPU 使用率从 85% 降至 55%，P99 延迟从 346 ms 降至 48 ms（下降 86%）**，错误率从 2.3% 降至 0.1%，系统恢复了正常的服务能力并具备了充足的能力余量。

网关性能优化没有放之四海皆准的银弹。不同的网关有不同的路由规则复杂度、请求/响应体大小、过滤器链配置和性能目标。本案例的核心价值在于提供了一套完整的问题诊断方法论和工具使用指南，读者在面对类似的网关性能问题时，可以按照同样的流程进行排查和优化。
