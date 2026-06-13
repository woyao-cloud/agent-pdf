# 第2章 核心数据模型：Data Frame（数据帧）

## 2.1 为什么需要 Data Frame？

### 异构数据源的统一抽象

Grafana 需要同时处理来自不同数据源的数据，这些数据的格式千差万别：

| 数据源 | 原始数据格式 | 就像... |
|--------|-------------|---------|
| Prometheus | 时间序列 `metric{labels} value timestamp` | 一份份独立的报表 |
| Loki | 日志流 `timestamp log_line` | 连续的日记本 |
| SQL | 关系型表（行 × 列） | Excel 表格 |
| JSON API | 嵌套 JSON | 俄罗斯套娃 |

> **用一个生活类比来理解：** 想象你是一家跨国公司的 CEO，你的分公司（数据源）每月发来的报表格式各不相同：美国分公司用 Excel、德国分公司用 PDF、日本分公司用纸质文件。你需要一个**统一的模板**来汇总所有数据。Data Frame 就是 Grafana 的"统一报表模板"。

**如果没有 Data Frame：**
- Prometheus 插件需要自己画图
- Loki 插件需要自己画图
- MySQL 插件需要自己画图
- 每个插件各自为政，用户在不同面板间体验不一致

**有了 Data Frame：**
- 所有插件输出统一的 Data Frame
- Grafana 只需要一套渲染引擎
- 新数据源只需要实现"把数据转为 Data Frame"

### 使用场景

- **多数据源混合查询**：同一个面板中同时展示 Prometheus 指标和 MySQL 业务数据
- **数据转换（Transformations）**：在浏览器端对数据进行二次加工（Join、Reduce、计算字段）
- **插件开发**：所有 Data Source Plugin 的输出和 Panel Plugin 的输入都是 Data Frame
- **Explore 模式**：跨数据源的临时查询

### Data Frame 的数据流转链路

```
Data Source Plugin       Transformations         Panel Plugin
    │                        │                       │
    ▼                        ▼                       ▼
┌──────────┐          ┌──────────┐           ┌──────────┐
│ Prometheus│ ──Data──▶│ Join by  │ ──Data──▶│ Time     │
│ Plugin    │  Frame   │ field    │  Frame   │ Series   │
│ "翻译成   │          │ "把CPU和 │           │ Panel    │
│  统一格式"│          │  订单合  │           │ "直接画  │
└──────────┘          │  并"     │           │  图"     │
                      └──────────┘           └──────────┘
┌──────────┐          ┌──────────┐
│ MySQL    │ ──Data──▶│ Add      │
│ Plugin   │  Frame   │ field    │
│ "翻译成   │          │ from     │
│ 统一格式"│          │ calc     │
└──────────┘          │ "计算    │
                      │ 错误率"  │
                      └──────────┘
```

## 2.2 Data Frame 的结构

### 核心组成（拆开来看）

一个 Data Frame 由以下部分组成，我们可以把它想象成一个"智能表格"：

```
DataFrame（智能表格）
├── name: "CPU Usage"           ← 表格的名字
├── fields: [                   ← 表格的列（字段）
│   Field("time")               ← 第一列：时间
│   ├── type: time              ← 这一列是时间类型
│   ├── values: [t1, t2, ...]  ← 这一列的数据
│   └── config: {}              ← 这一列的显示设置
│   
│   Field("value")              ← 第二列：CPU值（web-1机器）
│   ├── type: number
│   ├── values: [45, 50, ...]
│   ├── labels: {host: "web-1"} ← 这一列属于"web-1"这台机器
│   └── config: {               ← 显示配置
│       unit: "percent",        ←   单位：百分比
│       decimals: 2             ←   保留2位小数
│   }
│   
│   Field("value")              ← 第三列：CPU值（web-2机器）
│   ├── type: number
│   ├── values: [60, 55, ...]
│   ├── labels: {host: "web-2"}
│   └── config: { unit: "percent" }
]
└── meta: {                     ← 元数据（表格的附加信息）
    type: "timeseries",
    preferredVisualisationType: "graph"
}
```

**关键理解：** 在 Data Frame 中，每个时间序列是**一列**而不是一行。如果你有 100 台机器，就有 100 个 Value 列 + 1 个 Time 列。这在下面"宽表 vs 长表"部分会详细解释。

### 字段类型（Field Type）

| 类型 | 说明 | 示例值 | 典型用途 |
|------|------|--------|---------|
| `time` | 时间戳（毫秒） | `1700000000000` | X 轴 |
| `number` | 数值 | `3.14` | Y 轴 |
| `string` | 字符串 | `"error"` | 表格展示 |
| `boolean` | 布尔值 | `true` | 状态灯 |
| `enum` | 枚举值 | `"critical"` | 告警级别 |
| `geo` | 地理坐标 | `{lat: 39.9, lng: 116.4}` | 地图 |
| `other` | JSON 任意值 | `{key: "value"}` | 复杂结构 |

### Labels（标签）—— 区分不同序列的"身份证"

Labels 是 Data Frame 中用于区分不同时间序列的键值对。这与 Prometheus 的 Label 概念一致：

```typescript
// 一个包含两个序列的 Data Frame
const frame = {
    name: "http_requests_total",
    fields: [
        { name: "Time", type: "time", values: [t1, t2, t3] },  // 时间轴
        { 
            name: "Value", 
            type: "number", 
            values: [100, 120, 140],
            labels: { method: "GET", status: "200" }  // GET请求的计数器
        },
        { 
            name: "Value", 
            type: "number", 
            values: [50, 60, 70],
            labels: { method: "POST", status: "200" } // POST请求的计数器
        },
    ]
};
```

> **思考题：** 如果 GET 请求有 4 种 method、10 种 status、20 个 endpoint，会产生多少条序列？
> 答案：4 × 10 × 20 = 800 条序列。这就是为什么高基数很危险。

### Config（显示配置）—— 告诉前端"怎么画"

每个 Field 可以携带一个 config 对象，控制前端如何渲染这个字段。可以理解为给图表"化妆"：

```typescript
interface FieldConfig {
    // 单位
    unit?: string;              // "percent"（百分比）、"bytes"（字节）、"reqps"（每秒请求数）
    decimals?: number;          // 保留几位小数
    
    // 显示范围
    min?: number;               // Y 轴最小值
    max?: number;               // Y 轴最大值
    
    // 阈值（决定图表颜色）—— 一目了然看出是否超标
    thresholds?: {
        mode: "absolute" | "percentage";
        steps: [
            { value: null, color: "green" },    // 默认绿色（正常）
            { value: 50, color: "yellow" },       // >= 50 黄色（警告）
            { value: 80, color: "red" },           // >= 80 红色（危险）
        ];
    };
    
    // 链接（点击图表跳转到其他页面）
    links?: DataLink[];
    
    // 自定义属性（插件扩展）
    custom?: Record<string, any>;
}
```

## 2.3 宽表模型（Wide）vs 长表模型（Long）

Data Frame 支持两种数据排列方式。理解它们的区别非常重要，因为错误的选择会导致性能问题。

### 用生活例子理解

想象你在记录三个朋友（张三、李四、王五）的体重：

**长表（Long）—— 像日记本：**
```
日期        姓名  体重(kg)
2024-01-01  张三   70
2024-01-01  李四   65
2024-01-01  王五   80
2024-01-02  张三   71
2024-01-02  李四   64
```

**宽表（Wide）—— 像 Excel 表格：**
```
日期        张三   李四   王五
2024-01-01   70     65     80
2024-01-02   71     64     81
```

### 长表模型（Long Format）

```
Time                 host   cpu
2024-01-01T00:00:00  web-1  45
2024-01-01T00:00:00  web-2  60
2024-01-01T00:01:00  web-1  50
2024-01-01T00:01:00  web-2  55
```

**对应 Data Frame：** `Fields: [Time, host, cpu]`

**特点：**
- 适合 SQL 数据源（SQL 天然返回行格式）
- 易于理解：每一行就是一个数据点
- 便于过滤：`WHERE host = 'web-1'`
- 缺点：数据量大时行数 = 序列数 × 时间点数

### 宽表模型（Wide Format）

```
Time                 web-1  web-2
2024-01-01T00:00:00  45     60
2024-01-01T00:01:00  50     55
```

**对应 Data Frame：** `Fields: [Time, Value{host=web-1}, Value{host=web-2}]`

**特点：**
- 适合时序数据：时间轴只存一次，节省空间
- 查询效率高：CPU 缓存友好（连续内存）
- 面板渲染快：uPlot 可以直接使用
- 缺点：序列数多时列数爆炸

### 什么时候该用哪个？

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| SQL 查询结果 | 长表 | SQL 天然返回行格式 |
| Prometheus 查询 | 宽表 | Prometheus 天然返回列格式 |
| 10 条序列以内 | 都可以 | 差别不大 |
| 100+ 条序列 | 宽表 | 长表的行数 = 100 × N，太大 |
| 需要做 WHERE 过滤 | 长表 | 宽表没有"行"的概念，不好过滤 |
| 需要做时间轴对齐 | 宽表 | 宽表的时间轴天然对齐 |

### 两种模型的转换

Grafana 的 Transformations 提供了 `Group by` 操作实现转换：

```typescript
// 长表 → 宽表（Group by → 按 host 分组）
// 输入：Time, host, cpu
// 输出：Time, web-1, web-2

// 宽表 → 长表（Reduce → Group by）
// 输入：Time, web-1, web-2
// 输出：Time, host, cpu
```

## 2.4 数据流转完整链路

### 从查询到渲染（一个数据点的完整旅程）

```
Step 1: 浏览器发起查询请求
  POST /api/ds/query
  {
    "queries": [
      {
        "datasource": { "type": "prometheus", "uid": "P1" },
        "expr": "rate(http_requests_total[5m])",
        "refId": "A"
      }
    ]
  }

Step 2: Data Source Plugin 执行查询
  Prometheus Plugin → 调用 Prometheus HTTP API
  → 获取 JSON 响应
  → 转换为 Data Frame（关键步骤！）

Step 3: Transformations（如果有）
  Data Frame → Join / Reduce / Calculate
  → 新的 Data Frame

Step 4: Panel Renderer 接收 Data Frame
  Time Series Panel → 提取 Time Field + Value Fields
  → 传递给 uPlot 渲染
```

### 类型脚本中的 Data Frame

```typescript
// @grafana/data 中的核心类型
interface DataFrame {
    refId?: string;           // 查询引用 ID（对应面板中的查询 A/B/C）
    fields: Array<Field>;     // 字段数组（核心！）
    length: number;           // 数据点数（行的数量）
    name?: string;            // 帧名称
    labels?: Record<string, string>;  // 标签
    meta?: DataFrameMeta;     // 元数据
}

interface Field<T = any> {
    name: string;             // 字段名
    type: FieldType;          // 字段类型（time/number/string...）
    values: Vector<T>;        // 数据向量（实际数据）
    labels?: Record<string, string>;  // 标签（用于区分不同序列）
    config: FieldConfig;      // 显示配置（单位、阈值...）
    state?: FieldState;       // 内部状态
}
```

### 开发者需要掌握的技能

- 理解 Data Frame 的 `Fields[]` + `Vector` 结构
- 掌握 Labels 在时间序列分组中的作用
- 理解 Field Config 中的阈值和单位配置
- 熟悉宽表/长表模型的转换
- 了解 Arrow 列存格式（Grafana 内部使用）

## 2.5 潜在风险与优化

### 风险 1：Fields 数量过多

**问题：** 当 Labels 组合很多时，Data Frame 的 Fields 数量会线性增长。1000 条时间序列 = 1 个 Time Field + 1000 个 Value Fields。每个 Field 都有独立的内存开销。

**真实案例：** 某公司在一个 Dashboard 中查询 `http_requests_total` 没有加任何过滤条件，返回了 5000 条序列。浏览器收到 Data Frame 后直接卡死，因为 5001 个 Field 需要分配大量内存。

**优化：**
1. 在查询层面限制返回的序列数（如 Prometheus 的 `topk(10, ...)`）
2. 使用 Transformations 的 `Group by` 聚合减少序列数
3. 合理设计 Dashboard 的过滤条件

### 风险 2：大数据量下的内存占用

**问题：** Data Frame 在浏览器内存中全量加载。计算一下：
- 1000 条序列 × 1000 个时间点 = 1,000,000 个数据点
- 每个浮点数 8 字节 = 8MB
- 加上 Field 对象开销 ≈ 50MB
- 如果同时有 10 个面板 = 500MB
- 浏览器很容易 OOM

**优化：**
1. 设置数据源的 `maxDataPoints` 限制（默认 500000）
2. 使用 `$__interval` 自动调整采样粒度（时间范围越大，采样越粗）
3. 启用 Grafana 的缓存机制减少重复查询

```ini
[query]
max_data_points = 500000  # 每个查询最多返回 50 万个数据点
```

### 风险 3：时间轴未对齐

**问题：** 当从两个不同的数据源查询时序数据时，时间戳可能不对齐。比如 Prometheus 每 15s 一个点，MySQL 每 1h 一个点。

**后果：** Join 时大量空值，图表出现"断层"。

**解决：** Grafana 的 Query Engine 会自动进行时间对齐，但需要确保查询的时间范围一致。

## 2.6 典型问题处理

### 问题 1：面板显示 "No data"

**排查步骤：**
1. 在 Explore 模式下用同样的查询语句测试
2. 检查 Data Frame 是否为空（浏览器 DevTools → Network → 查看响应）
3. 检查 Labels 是否匹配面板的过滤条件

### 问题 2：图表显示多条相同的线

**原因：** Data Frame 中多个 Fields 的 Labels 组合相同，导致被渲染为多条序列。

**举例：** 查询 `node_cpu_seconds_total{mode="user"}` 按 `instance` 聚合时忘记加 `by (instance)`，结果每个 instance 的 user 模式 CPU 数据重复出现。

**解决：** 在查询中使用 `sum by (instance)` 或 `group by` 聚合。

### 问题 3：Transformations 后数据丢失

**原因：** Join by field 时两个数据源的时间戳精度不同（毫秒 vs 秒），导致无法匹配。

**解决：** 在查询中将时间戳统一到相同精度。

## 本章小结

- Data Frame 是 Grafana 统一所有数据源的底层抽象——就像"统一报表模板"
- 核心组成：Fields（字段数组）+ Labels（标签）+ Config（显示配置）
- 支持宽表（Wide）和长表（Long）两种模型，各有适用场景
- Labels 用于区分时间序列，等同于 Prometheus 的 Label 概念
- Field Config 控制前端渲染行为（单位、阈值、小数位）
- 数据流转：Data Source Plugin → Data Frame → Transformations → Panel
- 大数据量下需限制 maxDataPoints 和启用缓存
