# 第13章 场景三：基于日志的实时业务指标监控（伪 BI）

## 本章导读

双 11 零点，运营总监跑到你工位前："大屏上的 GMV 怎么不动了？！"

你看了一眼——数据库查询超时了。订单表每秒写入 5000 条，`SELECT SUM(amount) FROM orders WHERE create_time > now-5m` 这个查询走到数据库上，直接触发了慢查询，把数据库打挂了。

这就是传统 BI 的问题——**业务数据库扛不住实时聚合查询**。但如果你的日志系统已经接入了所有订单数据，可以直接在 ES 中做聚合——ES 的列式存储（DocValues）天生适合这种"全表扫描求和"的操作，而且完全不影响业务数据库。

本章展示如何从日志中提取业务指标，在 Kibana 中搭建实时 GMV 大屏。整个过程**不需要改动业务代码**（只需要加一行日志），**不需要额外的埋点系统**（ELK 就是你的埋点系统）。

---

## 13.1 从日志中提取业务指标

### 常规方案 vs 日志方案

```
实现"实时 GMV 大屏"的三种方案对比：

  方案 A：直接查数据库
  ┌────────────────────────────────────────────┐
  │  SELECT SUM(amount) FROM orders           │
  │  WHERE status = 'paid' AND create_time >  │
  │        now-5m                              │
  │                                            │
  │  问题：订单表在双 11 高峰期每秒写入 5000 条  │
  │        这个查询会触发大量 I/O                 │
  │        数据库连接池很快被打满                 │
  │  → DB 挂 → 整个应用不可用                    │
  └────────────────────────────────────────────┘

  方案 B：埋点系统（如埋点到 Kafka → Flink 计算）
  ┌────────────────────────────────────────────┐
  │  需要引入 Flink、维护流式计算作业            │
  │  成本高、周期长                             │
  │  适合长期建设，不适合快速上线                │
  └────────────────────────────────────────────┘

  方案 C：从日志中提取（本章的做法）
  ┌────────────────────────────────────────────┐
  │  在日志中打印一条结构化日志                   │
  │  log.info("ORDER_METRIC: amount={}", amt) │
  │  → Filebeat 采集 → Kafka → Logstash 解析   │
  │  → ES 聚合 → Kibana 大屏                   │
  │                                            │
  │  优点：不碰数据库、不引入新组件、快速上线     │
  │  缺点：不是精确的 OLAP，适合实时趋势展示      │
  └────────────────────────────────────────────┘
```

### 在业务代码中输出可聚合的日志

```java
// 方案 A：在 Service 中打印结构化的业务日志
// 这是最简单的做法——只需要一行 log.info

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Order createOrder(OrderRequest request) {
        // ... 业务逻辑（创建订单、扣减库存、处理支付）...

        // ✅ 打印结构化的业务指标日志
        // 用固定的前缀 ORDER_METRIC: 方便 Logstash 识别
        // 用 key=value 格式方便 Grok 解析
        log.info("ORDER_METRIC: action=create_order, amount={}, city={}, " +
                "category={}, payType={}, success=true",
            request.getAmount(),
            request.getCity(),
            request.getCategory(),
            request.getPayType());

        return order;
    }

    public void cancelOrder(String orderId) {
        // ... 取消订单逻辑 ...

        log.info("ORDER_METRIC: action=cancel_order, orderId={}, success=true",
            orderId);
    }
}

// 方案 B：使用专门的 MetricLogger（更规范）
// 将业务指标和业务日志分离
@Component
public class MetricLogger {

    private static final Logger metricLog = LoggerFactory.getLogger("METRIC");

    public void recordOrderMetric(String action, double amount, String city,
                                  String category, String payType, boolean success) {
        metricLog.info("ORDER_METRIC: action={}, amount={}, city={}, " +
                "category={}, payType={}, success={}",
            action, amount, city, category, payType, success);
    }

    public void recordUserAction(String userId, String action, String target) {
        metricLog.info("USER_ACTION: userId={}, action={}, target={}",
            userId, action, target);
    }
}
```

### Logstash 解析业务指标

```conf
# logstash.conf —— 解析 ORDER_METRIC 日志

filter {
  # 只处理包含 ORDER_METRIC 的日志
  # 普通日志不需要经过 Grok（保留原样）
  if "ORDER_METRIC" in [message] {
    # 使用 Grok 提取业务字段
    grok {
      match => {
        "message" => "ORDER_METRIC: action=%{WORD:metric_action}, amount=%{NUMBER:metric_amount:float}, city=%{DATA:metric_city}, category=%{DATA:metric_category}, payType=%{DATA:metric_payType}, success=%{WORD:metric_success}"
      }
    }

    # 字段类型转换
    mutate {
      convert => {
        "metric_amount" => "float"
      }
      remove_field => ["message"]
    }

    # 写入到独立的业务指标索引
    #（与日志索引分离，查询时不影响）
    mutate {
      add_field => { "[@metadata][target_index]" => "metrics-order" }
    }
  }
}

output {
  # 业务指标路由到独立的索引
  if [@metadata][target_index] == "metrics-order" {
    elasticsearch {
      hosts => ["es-node:9200"]
      index => "metrics-order-%{+YYYY.MM.dd}"
    }
  }
  # 其余日志写入正常日志索引
  else {
    elasticsearch {
      hosts => ["es-node:9200"]
      index => "app-logs-%{+YYYY.MM.dd}"
    }
  }
}
```

---

## 13.2 在 Kibana 中构建实时 GMV 大屏

### 创建 Data View

```kibana
# 在 Kibana → Data Views 中创建
# Name: metrics-order
# Index pattern: metrics-order-*
# Timestamp field: @timestamp

# 字段说明：
# metric_amount      → 金额（float，用于 SUM 聚合）
# metric_city        → 城市（keyword，用于 Terms 聚合）
# metric_category    → 品类（keyword）
# metric_payType     → 支付方式（keyword）
# metric_action      → 操作类型（create_order / cancel_order）
```

### 配置大屏面板

```
大屏布局（4 个核心面板）：

  面板 1：实时 GMV 翻牌器（最重要的指标）
  ┌──────────────────────────────────────────────┐
  │                 实时 GMV                      │
  │              ¥ 12,345,678                     │
  │          较昨日 +12.3%                        │
  │                                                │
  │  配置：                                        │
  │  可视化类型：Metric                           │
  │  指标：SUM(metric_amount)                     │
  │  筛选：metric_action: create_order            │
  │        AND metric_success: true               │
  │  时间范围：now-24h                             │
  └──────────────────────────────────────────────┘

  面板 2：各品类销售额排行
  ┌──────────────────────────────────────────────┐
  │  品类      销售额       占比                   │
  │  手机      ¥5,000,000   40%                  │
  │  电脑      ¥3,000,000   24%                  │
  │  家电      ¥2,000,000   16%                  │
  │  服饰      ¥1,500,000   12%                  │
  │  食品      ¥1,000,000   8%                   │
  │                                                │
  │  配置：                                        │
  │  可视化类型：Data Table                        │
  │  分组：Terms(metric_category)                  │
  │  指标：SUM(metric_amount)                      │
  │  排序：按 SUM 降序                              │
  └──────────────────────────────────────────────┘

  面板 3：实时订单趋势
  ┌──────────────────────────────────────────────┐
  │  订单量                                        │
  │  ↑                                            │
  │  │    ██                                      │
  │  │  ██████    ████                            │
  │  │  ████████  ████████    ████                │
  │  └─────────────────────────────────── 时间    │
  │  10:00    10:05    10:10    10:15              │
  │                                                │
  │  配置：                                        │
  │  可视化类型：Line                              │
  │  Y 轴：Count                                   │
  │  X 轴：@timestamp（每 1 分钟）                  │
  │  按 metric_category 拆分为多条线                │
  └────────────────────────────────────────────────┘

  面板 4：地域热力图
  ┌──────────────────────────────────────────────┐
  │  [地图]                                       │
  │  广东 ████████████████████                    │
  │  浙江 ██████████████                          │
  │  江苏 █████████████████                       │
  │  北京 ██████████                              │
  │                                                │
  │  配置：                                        │
  │  可视化类型：Map                               │
  │  字段：metric_city                              │
  │  指标：SUM(metric_amount)                      │
  └────────────────────────────────────────────────┘
```

### 大屏自动刷新

```yaml
# 大屏自动刷新配置
# 在 Kibana Dashboard 右上角设置：

# 刷新间隔：5 秒
# 说明：Dashboard 每 5 秒自动重新查询 ES
# 效果：GMV 翻牌器数字实时跳动

# 注意：刷新间隔越短，ES 查询压力越大
# 建议：大促期间 5秒，日常 30秒
```

---

## 13.3 注意事项与局限性

### ES 聚合的精度问题

```java
// ES 的聚合在某些场景下不是 100% 精确的
// 特别是在高基数场景下（如 terms 聚合有 100 万个 bucket）

// 所以：ES 适合"实时趋势展示"，不适合"财务对账"

// ✅ ES 适合的场景：实时 GMV 趋势、品类占比、热力图
// ❌ ES 不适合的场景：对账报表、精确的财务统计
// 精确统计还是要靠数据库或离线数仓
```

### 数据延迟

```
从"业务发生"到"出现在大屏上"的延迟：

  业务发生 → log.info(...) → 写入日志文件 → Filebeat 读取
  → Kafka → Logstash 消费 → 写入 ES → Refresh（5 秒）
  → Kibana 查询 → 显示在大屏上

  总延迟：约 10-15 秒

  所以：这个方案叫"近实时 BI"，不是"实时 BI"
  如果需要毫秒级延迟，需要用 Flink 或 Spark Streaming
```

---

## 本章总结

| 对比维度 | 传统 DB 查询 | ES 日志聚合 |
|---------|-------------|------------|
| **实时性** | 实时到秒级（但扛不住高并发） | 近实时（10-15 秒延迟）|
| **对业务影响** | 高（查询影响数据库性能） | 零（不碰数据库）|
| **实施成本** | 低（写一条 SQL） | 低（加一行日志 + Logstash config）|
| **精度** | 100% 精确 | 聚合统计，可能有误差 |
| **适用场景** | 财务对账、精确报表 | 实时大屏、趋势展示、热力图 |

**核心原则**：
1. **日志是"免费的"业务指标数据源**——你已经在打印日志了，只需要加一个前缀（如 `ORDER_METRIC:`) 就可以把业务数据"顺便"发到 ELK，完全不需要新引入埋点系统
2. **业务指标和普通日志分开索引**——避免普通日志的庞大数量影响业务指标的查询速度。在 Logstash output 中通过条件路由将指标数据写入独立的 metrics-* 索引
3. **ES 的聚合适合展示趋势，不适合精确对账**——大屏上显示"实时 GMV 1,234 万"是没问题的。但财务说"今天 GMV 到底是 1,234 万还是 1,235 万？"——你还是要查数据库
4. **注意数据延迟**——从业务发生到显示在大屏上约 10-15 秒。运营人员需要知道"有延迟"，不然他们会对着 15 秒前的数据做决策