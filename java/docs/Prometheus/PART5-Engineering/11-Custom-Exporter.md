# 第11章 自定义 Exporter：打造你的专属监控工具

---

## 场景故事：DBA 小林的监控困境

小林是一家电商公司的 DBA，负责管理 50 多个 MySQL 实例。公司用了现成的 `mysqld_exporter` 来监控 MySQL，看起来该有的指标都有——连接数、慢查询、InnoDB 状态……但有一天，老板问了一个问题：

**"主从延迟超过 10 秒的数据库实例，最近一周发生了多少次？每次持续了多久？"**

小林愣住了。`mysqld_exporter` 确实暴露了 `mysql_slave_status_seconds_behind_master` 指标，但它只能告诉你"此时此刻的延迟是多少"。它没有记录"延迟超过 10 秒的事件次数"，也没有"最大延迟"或"平均延迟"的聚合信息。

更糟糕的是，公司的 MySQL 主从架构有些特殊——多个从库有不同的复制拓扑，有些是级联复制（A -> B -> C）。小林需要的是一个**定制化的 Exporter**，能够：

1. 从 `SHOW SLAVE STATUS` 中提取更多维度的信息
2. 计算衍生指标（延迟事件次数、最大延迟等）
3. 标记每个从库在拓扑中的角色

现成的 Exporter 做不到这些。小林必须**自己写一个 Exporter**。

这就是本章的主题：当现成工具不能满足需求时，如何用 Prometheus Client Library 编写自定义 Exporter。

---

## 11.1 为什么要写自定义 Exporter？

Prometheus 生态中有大量现成的 Exporter——MySQL、Redis、Nginx、Kubernetes……几乎覆盖了所有主流中间件。但在以下场景中，你仍然需要自己动手：

| 场景 | 为什么现成的不够 |
|------|-----------------|
| **业务指标** | 现成 Exporter 只暴露系统指标，不暴露业务数据（如订单量、支付成功率） |
| **特殊中间件** | 公司自研的 RPC 框架、消息队列，社区没有对应 Exporter |
| **定制逻辑** | 需要对原始指标做聚合、过滤、计算衍生指标 |
| **非标准协议** | 监控目标通过自定义 TCP/UDP 协议暴露状态，不是标准 HTTP |

本章通过一个完整的 Go 语言自定义 Exporter 示例，带你走通从设计到部署的全流程。

---

## 11.2 核心概念：Collector 接口

### 原理比喻：Collector 接口 = 问卷调查

想象你要在一栋办公楼里做一次员工满意度调查：

- **Describe 方法** = **问卷模板**：你提前设计好问卷上有哪些问题（"姓名"、"部门"、"满意度打分"）。Prometheus 通过 Describe 知道这个 Exporter 会暴露哪些指标。
- **Collect 方法** = **实地填问卷**：你拿着问卷挨个工位去问，把每个人的回答填进去。Prometheus 定期调用 Collect，获取当前时刻的指标值。
- **Registry** = **问卷管理员**：管理员把所有人的问卷收集起来，统一归档。Prometheus Client Library 的 Registry 负责管理所有已注册的 Collector。

```go
// 为什么这样写：Prometheus 的 Collector 接口只有两个方法
// Describe 告诉 Prometheus "我会暴露什么指标"
// Collect 告诉 Prometheus "这些指标的当前值是多少"
type Collector interface {
    // Describe 方法：向 Prometheus 描述这个 Collector 会暴露哪些指标
    // 相当于告诉管理员："我的问卷上有这三个问题"
    Describe(chan<- *Desc)
    
    // Collect 方法：执行实际的指标采集
    // 相当于去实地填问卷，把结果交给管理员
    Collect(chan<- Metric)
}
```

### 工作流程

```
Prometheus Server                    Your Exporter
     |                                      |
     |--- HTTP GET /metrics ---------------->|
     |                                      |
     |     |--- Collect() 被调用 ------------|
     |     |     |
     |     |     +-- 查询 MySQL SHOW SLAVE STATUS
     |     |     +-- 计算衍生指标
     |     |     +-- 返回 Metric 列表
     |     |<----|
     |                                      |
     |<--- 返回 metrics 文本 ----------------|
     |                                      |
     |--- 存储指标到 TSDB                    |
```

---

## 11.3 Go 语言实现：MySQL 主从延迟 Exporter

### 项目结构

```
mysql-replication-exporter/
├── main.go              # 入口：HTTP 服务启动
├── collector.go         # Collector 实现：Describe + Collect
├── scraper.go           # 数据抓取层：执行 SQL 查询
├── metrics.go           # 指标定义：Gauge、Counter 等
├── go.mod
└── go.sum
```

### 第一步：定义指标（metrics.go）

```go
package main

import "github.com/prometheus/client_golang/prometheus"

// 为什么这样写：集中定义所有指标，便于维护和审查
// 命名规范：使用 snake_case，以 exporter 前缀区分来源
type ReplicationMetrics struct {
    // Gauge：主从延迟秒数（当前值，可增可减）
    SecondsBehindMaster *prometheus.GaugeVec
    
    // Counter：延迟超过阈值的累积事件次数（只增不减）
    // 为什么用 Counter 而不是 Gauge：我们想统计"发生了多少次"，不是"当前是否延迟"
    DelayEventsTotal *prometheus.CounterVec
    
    // Gauge：从库的 IO 线程和 SQL 线程状态（1=运行，0=停止）
    SlaveIOThreadRunning  *prometheus.GaugeVec
    SlaveSQLThreadRunning *prometheus.GaugeVec
}

func NewReplicationMetrics() *ReplicationMetrics {
    return &ReplicationMetrics{
        // 为什么这样写：每个指标都标注清楚含义和单位
        // HELP 和 LABELS 是 Prometheus 的自文档机制
        SecondsBehindMaster: prometheus.NewGaugeVec(
            prometheus.GaugeOpts{
                Name: "mysql_replication_seconds_behind_master",
                Help: "当前主从延迟秒数，从 SHOW SLAVE STATUS 获取",
            },
            // 标签：标识具体的从库实例和复制拓扑角色
            []string{"instance", "replication_role", "master_host"},
        ),
        
        DelayEventsTotal: prometheus.NewCounterVec(
            prometheus.CounterOpts{
                Name: "mysql_replication_delay_events_total",
                Help: "主从延迟超过阈值的事件累积次数",
            },
            []string{"instance", "delay_threshold"},
        ),
        
        SlaveIOThreadRunning: prometheus.NewGaugeVec(
            prometheus.GaugeOpts{
                Name: "mysql_replication_io_thread_running",
                Help: "从库 IO 线程运行状态（1=运行，0=停止）",
            },
            []string{"instance"},
        ),
        
        SlaveSQLThreadRunning: prometheus.NewGaugeVec(
            prometheus.GaugeOpts{
                Name: "mysql_replication_sql_thread_running",
                Help: "从库 SQL 线程运行状态（1=运行，0=停止）",
            },
            []string{"instance"},
        ),
    }
}
```

### 第二步：实现数据抓取（scraper.go）

```go
package main

import (
    "database/sql"
    "fmt"
    _ "github.com/go-sql-driver/mysql"
)

// SlaveStatus 存储 SHOW SLAVE STATUS 的结果
// 为什么这样写：定义一个结构体来映射 SQL 查询结果，比直接使用 map 更安全、更易维护
type SlaveStatus struct {
    // 为什么用 sql.NullString：MySQL 的某些字段可能为 NULL
    // 比如在没有主从复制配置的实例上，所有字段都是 NULL
    SecondsBehindMaster sql.NullInt64  // 延迟秒数，NULL 表示复制未配置或已停止
    MasterHost          sql.NullString // 主库主机名
    SlaveIORunning      string         // IO 线程状态："Yes" / "No" / "Connecting"
    SlaveSQLRunning     string         // SQL 线程状态："Yes" / "No"
    MasterLogFile       sql.NullString // 当前正在读取的主库 binlog 文件名
    ReadMasterLogPos    sql.NullInt64  // 当前读取到的 binlog 位置
    RelayMasterLogFile  sql.NullString // SQL 线程正在执行的 binlog 文件名
    ExecMasterLogPos    sql.NullInt64  // SQL 线程执行到的 binlog 位置
}

// ScrapeSlaveStatus 执行 SHOW SLAVE STATUS 并解析结果
// 为什么这样写：将数据库查询逻辑独立出来，便于单元测试和 mock
func ScrapeSlaveStatus(db *sql.DB) (*SlaveStatus, error) {
    // 执行 SHOW SLAVE STATUS
    // 注意：如果实例没有配置复制，这个查询会返回错误 ErrNoRows
    rows, err := db.Query("SHOW SLAVE STATUS")
    if err != nil {
        return nil, fmt.Errorf("执行 SHOW SLAVE STATUS 失败: %w", err)
    }
    defer rows.Close()

    if !rows.Next() {
        // 没有结果行 = 该实例没有配置主从复制
        return nil, nil
    }

    // 为什么这样写：SHOW SLAVE STATUS 有 50+ 列，我们只取需要的
    // 使用列索引而非列名扫描，性能更好
    status := &SlaveStatus{}
    err = rows.Scan(
        &placeholder, // 0: Server_id
        &placeholder, // 1: Master_host
        &status.MasterHost,          // 2: Master_User
        &placeholder, // 3: Master_Port
        &placeholder, // 4: Connect_Retry
        &placeholder, // 5: Master_Log_File
        &status.MasterLogFile,       // 6: Read_Master_Log_Pos
        &placeholder, // 7: Relay_Log_File
        &placeholder, // 8: Relay_Log_Pos
        &placeholder, // 9: Relay_Master_Log_File
        &status.SlaveIORunning,      // 10: Slave_IO_Running
        &status.SlaveSQLRunning,     // 11: Slave_SQL_Running
        // ... 省略其余字段
        &status.SecondsBehindMaster, // 33: Seconds_Behind_Master
        // ...
    )
    // ... 错误处理
    return status, nil
}
```

### 第三步：实现 Collector（collector.go）

```go
package main

import (
    "database/sql"
    "log"
    
    "github.com/prometheus/client_golang/prometheus"
)

// MySQLReplicationCollector 实现了 prometheus.Collector 接口
// 原理：Describe = 告诉 Prometheus 我会暴露什么，Collect = 去数据库查并填值
type MySQLReplicationCollector struct {
    db      *sql.DB          // 数据库连接池
    metrics *ReplicationMetrics // 定义的指标集合
    delayThreshold int64     // 延迟告警阈值（秒）
}

// 确保 MySQLReplicationCollector 实现了 Collector 接口
// 为什么这样写：编译期检查，如果接口没实现会编译失败
var _ prometheus.Collector = (*MySQLReplicationCollector)(nil)

func NewMySQLReplicationCollector(db *sql.DB, threshold int64) *MySQLReplicationCollector {
    return &MySQLReplicationCollector{
        db:             db,
        metrics:        NewReplicationMetrics(),
        delayThreshold: threshold,
    }
}

// Describe 方法：告诉 Prometheus 这个 Collector 会暴露哪些指标
// 参数 ch 是一个只写 channel，我们把所有指标的描述信息发送进去
// 
// 为什么这样写：Describe 只是"宣告"，不是"采集"
// Prometheus 在注册 Collector 时调用 Describe 来了解指标元信息
// 真正的数据采集在 Collect 中完成
func (c *MySQLReplicationCollector) Describe(ch chan<- *prometheus.Desc) {
    log.Println("Describe 被调用：注册指标描述信息")
    
    // 把每个指标的 Desc 发送到 channel
    c.metrics.SecondsBehindMaster.Describe(ch)
    c.metrics.DelayEventsTotal.Describe(ch)
    c.metrics.SlaveIOThreadRunning.Describe(ch)
    c.metrics.SlaveSQLThreadRunning.Describe(ch)
}

// Collect 方法：执行实际的指标采集
// 这是 Exporter 的核心逻辑——每次 Prometheus scrape 都会调用此方法
// 
// 为什么这样写：
// 1. Collect 方法会阻塞 Prometheus 的 scrape，必须控制执行时间
// 2. 推荐在 Collect 开始时重置所有指标，避免数据残留
// 3. 任何 panic 都应该被 recover，防止整个 Exporter 崩溃
func (c *MySQLReplicationCollector) Collect(ch chan<- prometheus.Metric) {
    log.Println("Collect 被调用：开始采集指标")
    
    // 重置所有指标，避免上一次采集的数据残留
    // 为什么这样写：GaugeVec 不会自动清空，如果不重置，
    // 上次采集的实例标签值会一直保留
    c.metrics.SecondsBehindMaster.Reset()
    c.metrics.SlaveIOThreadRunning.Reset()
    c.metrics.SlaveSQLThreadRunning.Reset()
    
    // 执行 SQL 查询
    status, err := ScrapeSlaveStatus(c.db)
    if err != nil {
        log.Printf("采集失败: %v", err)
        // 返回一个表示采集失败的指标，而不是直接返回
        // 这样 Prometheus 可以知道这个目标采集失败了
        ch <- prometheus.NewInvalidMetric(
            prometheus.NewDesc(
                "mysql_replication_scrape_failed",
                "采集 MySQL 复制状态失败",
                nil, nil,
            ),
            float64(1),
        )
        return
    }
    
    if status == nil {
        // 该实例没有配置主从复制
        log.Println("该实例没有配置主从复制")
        return
    }
    
    // 设置主从延迟指标
    // SecondsBehindMaster 是 Gauge 类型，表示当前值
    delaySeconds := float64(status.SecondsBehindMaster.Int64)
    c.metrics.SecondsBehindMaster.With(prometheus.Labels{
        "instance":         c.instanceName,
        "replication_role": "slave",
        "master_host":      status.MasterHost.String,
    }).Set(delaySeconds)
    
    // 判断是否超过告警阈值
    // 如果超过，增加延迟事件计数
    if status.SecondsBehindMaster.Int64 > c.delayThreshold {
        c.metrics.DelayEventsTotal.With(prometheus.Labels{
            "instance":       c.instanceName,
            "delay_threshold": fmt.Sprintf("%ds", c.delayThreshold),
        }).Inc()
    }
    
    // 设置 IO 线程和 SQL 线程状态
    // 为什么用 1/0：Prometheus 不直接支持布尔类型，用 1=运行 0=停止
    ioRunning := boolToFloat64(status.SlaveIORunning == "Yes")
    sqlRunning := boolToFloat64(status.SlaveSQLRunning == "Yes")
    c.metrics.SlaveIOThreadRunning.WithLabelValues(c.instanceName).Set(ioRunning)
    c.metrics.SlaveSQLThreadRunning.WithLabelValues(c.instanceName).Set(sqlRunning)
    
    // 将指标发送到 channel
    // 为什么这样写：通过 channel 批量发送，效率更高
    c.metrics.SecondsBehindMaster.Collect(ch)
    c.metrics.DelayEventsTotal.Collect(ch)
    c.metrics.SlaveIOThreadRunning.Collect(ch)
    c.metrics.SlaveSQLThreadRunning.Collect(ch)
}

func boolToFloat64(b bool) float64 {
    if b {
        return 1
    }
    return 0
}
```

### 第四步：启动 HTTP 服务（main.go）

```go
package main

import (
    "database/sql"
    "flag"
    "net/http"
    "os"
    
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
    _ "github.com/go-sql-driver/mysql"
)

func main() {
    // 命令行参数：配置 MySQL 连接信息
    var (
        dsn       = flag.String("dsn", "", "MySQL DSN，格式：user:password@tcp(host:port)/")
        addr      = flag.String("addr", ":9104", "Exporter 监听地址")
        threshold = flag.Int64("threshold", 10, "主从延迟告警阈值（秒）")
    )
    flag.Parse()
    
    if *dsn == "" {
        // 为什么这样写：优先从环境变量读取 DSN，避免密码硬编码在命令行
        *dsn = os.Getenv("MYSQL_DSN")
    }
    
    // 创建数据库连接池
    // 为什么这样写：sql.DB 是连接池，不是单个连接
    // 它会在内部管理多个连接，避免每次采集都创建新连接
    db, err := sql.Open("mysql", *dsn)
    if err != nil {
        panic(err)
    }
    defer db.Close()
    
    // 设置连接池参数
    // 为什么这样写：避免连接泄漏和长时间占用
    db.SetMaxOpenConns(3)      // 最大连接数，Prometheus scrape 一般同时只有 1 个请求
    db.SetMaxIdleConns(1)      // 空闲连接数，保留一个避免频繁创建
    db.SetConnMaxLifetime(5 * time.Minute) // 连接最大生命周期
    
    // 创建自定义 Collector 并注册到默认 Registry
    collector := NewMySQLReplicationCollector(db, *threshold)
    prometheus.MustRegister(collector)
    
    // 为什么这样写：promhttp.Handler() 使用 prometheus.DefaultGatherer
    // 它会自动收集所有已注册的 Collector 的指标
    http.Handle("/metrics", promhttp.Handler())
    
    // 添加健康检查端点，方便 K8s 探活
    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        // 检查数据库连接是否正常
        if err := db.Ping(); err != nil {
            w.WriteHeader(http.StatusServiceUnavailable)
            return
        }
        w.WriteHeader(http.StatusOK)
    })
    
    http.ListenAndServe(*addr, nil)
}
```

---

## 11.4 Python 实现：快速原型开发

如果团队以 Python 为主，也可以用 `prometheus_client` 库快速实现自定义 Exporter。

### 代码旁白：Python 版本的 MySQL Exporter

```python
# 为什么这样写：Python 版本适合快速原型验证
# 但生产环境建议用 Go——性能更好，没有 GIL 问题

import pymysql
from prometheus_client import start_http_server, Gauge, Counter, CollectorRegistry
import time
import logging

# 配置日志
# 为什么这样写：Exporter 通常在后台运行，日志是排查问题的主要手段
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MySQLReplicationCollector:
    """
    自定义 Collector 类
    
    原理比喻：这个类就像一张调查问卷
    - __init__: 设计问卷上有哪些问题
    - collect: 拿着问卷去填答案
    """
    
    def __init__(self, host, port, user, password, delay_threshold=10):
        """
        初始化 Collector
        
        为什么这样写：在 __init__ 中定义指标结构，在 collect 中赋值
        """
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.delay_threshold = delay_threshold
        
        # 定义指标
        # 为什么用 Gauge：延迟秒数是"当前值"，可增可减
        self.seconds_behind_master = Gauge(
            'mysql_replication_seconds_behind_master',
            '当前主从延迟秒数',
            ['instance', 'master_host']
        )
        
        # 为什么用 Counter：延迟事件次数是"累积值"，只增不减
        self.delay_events_total = Counter(
            'mysql_replication_delay_events_total',
            '延迟超过阈值的事件累积次数',
            ['instance', 'delay_threshold']
        )
        
        self.io_thread_running = Gauge(
            'mysql_replication_io_thread_running',
            'IO 线程运行状态（1=运行，0=停止）',
            ['instance']
        )
        
        self.sql_thread_running = Gauge(
            'mysql_replication_sql_thread_running',
            'SQL 线程运行状态（1=运行，0=停止）',
            ['instance']
        )
    
    def collect(self):
        """
        采集方法：每次 Prometheus scrape 时调用
        
        为什么这样写：collect 是生成器方法，yield 返回每个指标
        使用 try-finally 确保数据库连接被正确关闭
        """
        conn = None
        try:
            # 建立数据库连接
            conn = pymysql.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password
            )
            
            with conn.cursor() as cursor:
                # 执行 SHOW SLAVE STATUS
                cursor.execute("SHOW SLAVE STATUS")
                row = cursor.fetchone()
                
                if row is None:
                    logger.warning(f"实例 {self.host} 没有配置主从复制")
                    return
                
                # SHOW SLAVE STATUS 的列索引
                # 为什么这样写：使用列索引比列名更高效
                seconds_behind_master = row[32]  # Seconds_Behind_Master
                slave_io_running = row[10]       # Slave_IO_Running
                slave_sql_running = row[11]      # Slave_SQL_Running
                master_host = row[1]             # Master_Host
                
                # 处理 NULL 值
                if seconds_behind_master is None:
                    seconds_behind_master = -1  # -1 表示复制未运行
                
                # 设置指标值
                labels = [self.host, master_host]
                self.seconds_behind_master.labels(*labels).set(seconds_behind_master)
                
                # 检查是否超过阈值
                if seconds_behind_master > self.delay_threshold:
                    self.delay_events_total.labels(
                        self.host, f"{self.delay_threshold}s"
                    ).inc()
                
                # 设置线程状态
                io_val = 1 if slave_io_running == 'Yes' else 0
                sql_val = 1 if slave_sql_running == 'Yes' else 0
                self.io_thread_running.labels(self.host).set(io_val)
                self.sql_thread_running.labels(self.host).set(sql_val)
                
                # yield 每个指标
                # 为什么这样写：yield 使这个方法成为生成器
                # Prometheus Python 库会逐个消费生成的指标
                yield self.seconds_behind_master
                yield self.delay_events_total
                yield self.io_thread_running
                yield self.sql_thread_running
                
        except Exception as e:
            logger.error(f"采集失败: {e}")
            # 采集失败时不应 yield 任何指标
            # Prometheus 会检测到 scrape 失败
        finally:
            if conn:
                conn.close()


if __name__ == '__main__':
    # 启动 Exporter
    start_http_server(9104)
    logger.info("MySQL Replication Exporter 已启动，监听端口 9104")
    
    # 主循环
    while True:
        time.sleep(1)
```

---

## 11.5 真实案例：Collect 中执行耗时操作导致 scrape 超时

### 事故现场

某公司在生产环境中部署了一个自定义 Exporter，用于监控内部消息队列的堆积情况。Exporter 启动后前几周运行正常，但突然有一天，Grafana 上的所有面板都出现了断点。

### 问题排查

**现象**：Prometheus Server 的 `prometheus_target_scrape_pool_targets` 显示该 Exporter 的 target 状态为 `down`。

**初步排查**：
1. Exporter 进程还在运行
2. 直接访问 `/metrics` 接口，等了 **30 秒**才返回数据
3. 查看 Exporter 日志，发现 Collect 方法中执行了复杂的消息队列查询

**根因分析**：

```go
// Before: 错误写法——在 Collect 中做了太多事情
func (c *QueueCollector) Collect(ch chan<- prometheus.Metric) {
    // 问题 1：在 Collect 中执行耗时的数据清理操作
    c.cleanupExpiredMessages()  // 这个操作耗时 10+ 秒！
    
    // 问题 2：每次 Collect 都创建新的数据库连接
    db, _ := sql.Open("mysql", c.dsn)  // 连接建立也需要时间
    
    // 问题 3：在 Collect 中调用了外部 HTTP API
    resp, _ := http.Get("http://internal-api/queue/deep-stats")  
    // 如果 API 响应慢，Collect 就卡住了
    
    // 问题 4：在 Collect 中做了大量计算
    for _, q := range queues {
        // 遍历 10 万个消息计算统计信息
        result := heavyComputation(q)  // CPU 密集型操作
        ch <- prometheus.MustNewConstMetric(...)
    }
}
```

**Prometheus 默认 scrape 超时是 10 秒**。Collect 方法执行超过 10 秒，Prometheus 就会放弃这次采集，标记 target 为 down。

### After：正确写法

```go
// After: 正确做法——Collect 只做轻量操作
func (c *QueueCollector) Collect(ch chan<- prometheus.Metric) {
    // Collect 方法应该只做轻量操作
    // 耗时操作应该在后台 goroutine 中预计算
    
    // 从缓存中读取预计算的结果
    stats := c.cache.Get()  // 缓存每 15 秒刷新一次
    if stats == nil {
        // 如果缓存还未准备好，返回上次的指标值
        // 而不是阻塞等待
        return
    }
    
    for _, metric := range stats.Metrics {
        ch <- metric
    }
}

// 后台 goroutine：定期更新缓存
func (c *QueueCollector) backgroundUpdate() {
    ticker := time.NewTicker(15 * time.Second)
    for range ticker.C {
        stats := c.computeStats()  // 耗时操作在后台执行
        c.cache.Set(stats)
    }
}
```

### 修复效果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| scrape 耗时 | 15-30 秒 | 50-100 毫秒 |
| target 状态 | 经常 down | 稳定 up |
| CPU 使用率 | 采集时飙升到 90% | 稳定在 20% |

### 核心教训

> **Collect 方法应该像服务员上菜——菜是后厨（后台 goroutine）做好的，服务员只负责端上来。**

---

## 11.6 工程化实践

### Before/After 对比

#### 1. 连接管理

**Before**：每次 Collect 创建新连接
```go
func (c *Collector) Collect(ch chan<- prometheus.Metric) {
    conn, _ := net.Dial("tcp", c.target)  // 每次新建连接
    // ...
    conn.Close()
}
```

**After**：使用连接池复用连接
```go
type Collector struct {
    pool *redis.Pool  // 连接池
}
func (c *Collector) Collect(ch chan<- prometheus.Metric) {
    conn := c.pool.Get()  // 从池中获取
    defer conn.Close()    // 归还到池中
    // ...
}
```

#### 2. 超时控制

**Before**：没有超时
```go
resp, _ := http.Get("http://api.example.com/stats")
```

**After**：设置超时
```go
client := &http.Client{Timeout: 5 * time.Second}
resp, _ := client.Get("http://api.example.com/stats")
```

#### 3. 指标命名

**Before**：随意命名
```go
Name: "slave_delay_sec"  // 不符合 Prometheus 命名规范
```

**After**：遵循规范
```go
Name: "mysql_replication_seconds_behind_master"  // 命名空间_子系统_单位_描述
```

---

## 11.7 部署与监控

### Docker 部署

```dockerfile
# 为什么这样写：多阶段构建，减小镜像体积
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o exporter .

FROM alpine:3.18
COPY --from=builder /app/exporter /usr/local/bin/
EXPOSE 9104
ENTRYPOINT ["/usr/local/bin/exporter"]
```

### Prometheus 配置

```yaml
scrape_configs:
  - job_name: 'mysql_replication'
    static_configs:
      - targets:
        - 'exporter-01:9104'  # 数据库实例 1
        - 'exporter-02:9104'  # 数据库实例 2
    # 为什么这样写：自定义 Exporter 可能需要更长的超时时间
    scrape_timeout: 30s
    # 为什么这样写：降低采集频率，给 Exporter 足够的计算时间
    scrape_interval: 60s
```

### 自我监控

自定义 Exporter 也需要被监控：

```go
// 在 Exporter 中暴露自身性能指标
var (
    scrapeDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
        Name: "exporter_scrape_duration_seconds",
        Help: "每次采集的耗时",
        Buckets: []float64{0.01, 0.05, 0.1, 0.5, 1, 5},
    })
    
    scrapeErrors = prometheus.NewCounter(prometheus.CounterOpts{
        Name: "exporter_scrape_errors_total",
        Help: "采集失败的累积次数",
    })
)
```

---

## 本章小结

| 知识点 | 核心要点 |
|--------|---------|
| Collector 接口 | Describe 宣告指标结构，Collect 采集实际值 |
| 性能优化 | Collect 中只做轻量操作，耗时逻辑放后台 |
| 连接管理 | 使用连接池而非每次新建连接 |
| 超时控制 | 所有外部调用都设置超时 |
| 指标命名 | 遵循 `命名空间_子系统_单位_描述` 规范 |
| 自我监控 | Exporter 自身也需要暴露性能和错误指标 |

---

## 扩展阅读

- [Prometheus Client Library Go 文档](https://pkg.go.dev/github.com/prometheus/client_golang/prometheus)
- [Writing Exporters 官方指南](https://prometheus.io/docs/instrumenting/writing_exporters/)
- [Exporter 最佳实践](https://prometheus.io/docs/instrumenting/writing_exporters/#best-practices)
