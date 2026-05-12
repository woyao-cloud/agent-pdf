# 第14章 管道与过滤器模式（Pipe and Filter）
管道与过滤器模式是一种数据流处理架构，将数据处理过程分解为一系列独立的、可复用的过滤步骤，通过管道连接形成完整的处理流水线。
## 14.1 解决的问题与应用场景
### 14.1.1 问题分析
传统数据处理面临的挑战：
- **处理逻辑复杂**：单一模块承担过多职责
- **难以复用**：处理逻辑与业务流程强耦合
- **难以测试**：无法独立测试单个处理步骤
- **扩展困难**：新增处理步骤需要修改原有代码
### 14.1.2 典型应用场景
- 数据ETL处理
- 音视频编解码
- 日志处理与分析
- 图像处理流水线
- 文本处理（分词、过滤、转换）
- 金融数据风控
## 14.2 实现原理与结构
### 14.2.1 核心概念
管道与过滤器模式的三个核心组件：
```java
// 过滤器接口 - 数据处理单元
public interface Filter<T> {
    T process(T input);
}

// 管道 - 串联多个过滤器
public interface Pipe<T> {
    Pipe<T> addFilter(Filter<T> filter);
    T execute(T input);
}

// 数据流
// Input -> Filter1 -> Filter2 -> Filter3 -> Output
```
### 14.2.2 架构示意图
```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  输入   │───▶│ 过滤①  │───▶│ 过滤②  │───▶│ 过滤③  │───▶│  输出   │
│ (Data)  │    │(Filter) │    │(Filter) │    │(Filter) │    │(Result) │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                  │              │              │
              ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
              │ 解析/验证    │  │ 转换/计算   │  │ 格式化/输出  │
              │ - 字段提取   │  │ - 类型转换   │  │ - JSON序列化 │
              │ - 类型校验   │  │ - 数据计算   │  │ - 压缩       │
              │ - 异常过滤   │  │ - 聚合统计   │  │ - 加密       │
              └─────────────┘  └─────────────┘  └─────────────┘
```
### 14.2.3 基础实现
```java
// 抽象过滤器基类
public abstract class AbstractFilter<T> implements Filter<T> {
    protected Filter<T> nextFilter;

    @Override
    public Filter<T> setNext(Filter<T> filter) {
        this.nextFilter = filter;
        return filter;
    }

    @Override
    public T process(T input) {
        T result = doProcess(input);
        if (nextFilter != null) {
            return nextFilter.process(result);
        }
        return result;
    }

    protected abstract T doProcess(T input);
}

// 具体过滤器示例
public class UpperCaseFilter extends AbstractFilter<String> {
    @Override
    protected String doProcess(String input) {
        return input.toUpperCase();
    }
}

public class TrimFilter extends AbstractFilter<String> {
    @Override
    protected String doProcess(String input) {
        return input.trim();
    }
}

public class LengthFilter extends AbstractFilter<String> {
    private final int maxLength;

    public LengthFilter(int maxLength) {
        this.maxLength = maxLength;
    }

    @Override
    protected String doProcess(String input) {
        return input.length() > maxLength
            ? input.substring(0, maxLength)
            : input;
    }
}
```
### 14.2.4 管道构建器
```java
// 管道构建器
public class PipelineBuilder<T> {
    private final List<Filter<T>> filters = new ArrayList<>();

    public PipelineBuilder<T> addFilter(Filter<T> filter) {
        filters.add(filter);
        return this;
    }

    public Pipeline<T> build() {
        if (filters.isEmpty()) {
            return input -> input;
        }

        Pipeline<T> pipeline = filters.get(0)::process;
        for (int i = 1; i < filters.size(); i++) {
            final Filter<T> filter = filters.get(i);
            pipeline = pipeline.andThen(filter::process);
        }
        return pipeline;
    }
}

// 使用示例
public class TextProcessingPipeline {
    public static void main(String[] args) {
        Pipeline<String> pipeline = new PipelineBuilder<String>()
            .addFilter(new TrimFilter())
            .addFilter(new UpperCaseFilter())
            .addFilter(new LengthFilter(100))
            .addFilter(new SpecialCharFilter())
            .build();

        String result = pipeline.process("  hello world!  ");
        System.out.println(result); // "HELLO WORLD"
    }
}
```
## 14.3 高级特性
### 14.3.1 条件分支
```java
// 条件过滤器
public class ConditionalFilter<T> implements Filter<T> {
    private final Predicate<T> condition;
    private final Filter<T> trueFilter;
    private final Filter<T> falseFilter;

    @Override
    public T process(T input) {
        if (condition.test(input)) {
            return trueFilter.process(input);
        } else {
            return falseFilter.process(input);
        }
    }
}

// 并行分支
public class ParallelFilter<T> implements Filter<T> {
    private final List<Filter<T>> filters;

    @Override
    public T process(T input) {
        return filters.parallelStream()
            .map(f -> f.process(input))
            .reduce((a, b) -> merge(a, b))
            .orElse(input);
    }

    private T merge(T a, T b) { /* 合并结果 */ }
}
```
### 14.3.2 错误处理
```java
// 带错误处理的过滤器
public class ErrorHandlingFilter<T> implements Filter<T> {
    private final Filter<T> delegate;
    private final ErrorHandler<T> errorHandler;

    @Override
    public T process(T input) {
        try {
            return delegate.process(input);
        } catch (Exception e) {
            return errorHandler.handle(input, e);
        }
    }
}

// 错误处理器接口
public interface ErrorHandler<T> {
    T handle(T input, Exception e);
}
```
### 14.3.3 异步管道
```java
// 异步管道
public class AsyncPipeline<T> {
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final List<AsyncFilter<T>> filters;

    public CompletableFuture<T> executeAsync(T input) {
        CompletableFuture<T> future = CompletableFuture.completedFuture(input);
        for (AsyncFilter<T> filter : filters) {
            future = future.thenApplyAsync(filter::process, executor);
        }
        return future;
    }
}

// 异步过滤器接口
public interface AsyncFilter<T> {
    T process(T input) throws Exception;
}
```
## 14.4 典型应用场景
### 14.4.1 日志处理
```java
// 日志处理管道
public class LogProcessingPipeline {
    public void processLog(String logLine) {
        Pipeline<LogEvent> pipeline = new PipelineBuilder<LogEvent>()
            .addFilter(new LogParseFilter())        // 解析日志
            .addFilter(new LogLevelFilter())        // 过滤级别
            .addFilter(new TimestampFilter())       // 时间处理
            .addFilter(new MaskFilter())            // 敏感信息脱敏
            .addFilter(new StorageFilter())         // 存储
            .build();

        pipeline.execute(parseLogLine(logLine));
    }
}

class LogParseFilter extends AbstractFilter<LogEvent> {
    @Override
    protected LogEvent doProcess(String input) {
        // 解析日志行
        String[] parts = input.split(" ");
        return new LogEvent(
            LocalDateTime.parse(parts[0]),
            LogLevel.valueOf(parts[1]),
            parts[2]
        );
    }
}
```
### 14.4.2 图像处理
```java
// 图像处理管道
public class ImageProcessingPipeline {
    public BufferedImage process(BufferedImage image) {
        return new PipelineBuilder<BufferedImage>()
            .addFilter(new ResizeFilter(800, 600))
            .addFilter(new GrayscaleFilter())
            .addFilter(new ContrastFilter(1.2))
            .addFilter(new WatermarkFilter("©Company"))
            .addFilter(new CompressFilter(0.8f))
            .build()
            .process(image);
    }
}
```
### 14.4.3 金融风控
```java
// 风控规则管道
public class RiskControlPipeline {
    public RiskResult evaluate(Transaction tx) {
        return new PipelineBuilder<Transaction>()
            .addFilter(new BlacklistFilter())       // 黑名单检查
            .addFilter(new AmountLimitFilter())     // 金额限制
            .addFilter(new FrequencyFilter())       // 交易频率
            .addFilter(new LocationFilter())        // 位置异常
            .addFilter(new DeviceFilter())          // 设备指纹
            .addFilter(new ScoreAggregator())
            .build()
            .process(tx);
    }
}
```
## 14.5 潜在风险与问题
### 14.5.1 性能开销
- **问题**：每个过滤器都有额外的调用开销
- **解决方案**：合并频繁一起使用的过滤器，减少调用链深度
### 14.5.2 调试困难
- **问题**：数据经过多个过滤器，难以追踪问题
- **解决方案**：
  - 添加监控过滤器记录处理时间
  - 实现调试模式输出每个阶段的结果
  - 使用分布式追踪
### 14.5.3 状态管理
- **问题**：过滤器可能有状态，导致线程不安全
- **解决方案**：使用无状态设计，或采用线程安全的状态管理
## 14.6 优化策略
### 14.6.1 过滤器合并
```java
// 合并频繁使用的过滤器组合
public class CombinedFilters {
    // 将多个小过滤器合并为一个，减少调用开销
    public static <T> Filter<T> combine(Filter<T>... filters) {
        return input -> {
            T result = input;
            for (Filter<T> filter : filters) {
                result = filter.process(result);
            }
            return result;
        };
    }
}
```
### 14.6.2 短路优化
```java
// 短路 - 快速失败
public class ShortCircuitFilter<T> implements Filter<T> {
    private final Predicate<T> shouldStop;

    @Override
    public T process(T input) {
        if (shouldStop.test(input)) {
            return input; // 短路，后续过滤器不执行
        }
        return doProcess(input);
    }
}
```
### 14.6.3 并行处理
```java
// 并行过滤器链
public class ParallelPipeline<T> {
    public T executeParallel(T input, List<Filter<T>> filters) {
        return filters.parallelStream()
            .map(f -> f.process(input))
            .reduce(this::mergeResults)
            .orElse(input);
    }

    private T mergeResults(T a, T b) { /* 合并结果 */ }
}
```
## 14.7 本章小结
管道与过滤器模式将复杂的数据处理分解为独立的、可复用的步骤，通过灵活的组合适应不同业务需求。
**核心要点**：
- 过滤器独立职责，可单独测试和复用
- 管道串联过滤器，形成处理流水线
- 支持条件分支、并行处理、错误处理等高级特性
- 适用于数据转换、处理、过滤等场景
**使用建议**：- 适合处理流程清晰、步骤可拆解的场景
- 避免单个过滤器过于复杂
- 注意性能监控和问题追踪
---
## 当前完成进度
- ✅ 第1-7章：基础篇 + 分层架构（chapter 01-07）
- ✅ 第8章：SOA（chapter-07-soa）  
- ✅ 第9章：微服务（chapter-08）
- ✅ 第10章：事件驱动（chapter-09）
- ✅ 第11章：云原生（chapter-10）
- ✅ 第12章：最佳实践（chapter-11）
- ✅ 第13章：架构师技能（chapter-12）
- ✅ 第13章：空间架构（chapter-13）
- ✅ 第14章：管道与过滤器（chapter-14）
- ✅ README目录
还需要确认第8章（客户端-服务器）是否需要单独内容，还是 chapter-05 已包含。