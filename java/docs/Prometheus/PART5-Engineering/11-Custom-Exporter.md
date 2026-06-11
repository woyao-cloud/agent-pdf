# 第11章 自定义 Exporter 开发实战（Go 语言与 Python 实现）

## 11.1 prometheus.Collector 接口

要创建一个自定义 Exporter，核心是实现 `prometheus.Collector` 接口。该接口由两个方法组成：

**Go 版本：**
```go
type Collector interface {
    Describe(chan<- *Desc)  // 描述指标
    Collect(chan<- Metric)  // 返回指标值
}
```

**Python 版本：**
```python
# Python 的 prometheus_client 通过 REGISTRY.register() 注册自定义 Collector
class CustomCollector:
    def collect(self):
        # yield Metric 对象
        pass
```

### Describe() 方法

Describe 用于告诉 Prometheus 这个 Collector 会提供哪些指标。它发送 `*Desc`（指标描述符）到 channel 中。

```go
func (c *MySQLCollector) Describe(ch chan<- *prometheus.Desc) {
    ch <- c.slowQueries.Desc()
    ch <- c.replicationLag.Desc()
    ch <- c.threadsConnected.Desc()
}
```

### Collect() 方法

Collect 是真正执行采集的地方。**注意：Collect 不能阻塞太长时间**，否则会影响 Prometheus 的 scrape 周期。

```go
func (c *MySQLCollector) Collect(ch chan<- prometheus.Metric) {
    // 采集指标值并发送到 channel
    ch <- prometheus.MustNewConstMetric(c.slowQueries, prometheus.CounterValue, value, labels...)
}
```

## 11.2 实战：MySQL Exporter

### 核心功能

| 指标 | 类型 | 说明 |
|------|------|------|
| `mysql_slow_queries_total` | Counter | 慢查询累计数 |
| `mysql_replication_lag_seconds` | Gauge | 主从延迟秒数 |
| `mysql_threads_connected` | Gauge | 当前连接数 |

### Go 版本实现

**mysql_collector.go：**
```go
package collector

import (
    "database/sql"
    "github.com/prometheus/client_golang/prometheus"
    "log"
)

type MySQLCollector struct {
    mysqlDB          *sql.DB
    slowQueries      *prometheus.Desc
    replicationLag   *prometheus.Desc
    threadsConnected *prometheus.Desc
}

func NewMySQLCollector(db *sql.DB) *MySQLCollector {
    return &MySQLCollector{
        mysqlDB: db,
        slowQueries: prometheus.NewDesc(
            "mysql_slow_queries_total",
            "Total number of slow queries",
            []string{"host"}, nil,
        ),
        replicationLag: prometheus.NewDesc(
            "mysql_replication_lag_seconds",
            "Replication lag in seconds",
            []string{"host"}, nil,
        ),
        threadsConnected: prometheus.NewDesc(
            "mysql_threads_connected",
            "Number of connected threads",
            []string{"host"}, nil,
        ),
    }
}

func (c *MySQLCollector) Describe(ch chan<- *prometheus.Desc) {
    ch <- c.slowQueries
    ch <- c.replicationLag
    ch <- c.threadsConnected
}

func (c *MySQLCollector) Collect(ch chan<- prometheus.Metric) {
    // 异步采集：使用缓存机制，避免 Collect 阻塞
    slowQueries := c.collectSlowQueries()
    lag := c.collectReplicationLag()
    threads := c.collectThreadsConnected()

    ch <- prometheus.MustNewConstMetric(c.slowQueries, prometheus.CounterValue, slowQueries, "localhost")
    ch <- prometheus.MustNewConstMetric(c.replicationLag, prometheus.GaugeValue, lag, "localhost")
    ch <- prometheus.MustNewConstMetric(c.threadsConnected, prometheus.GaugeValue, threads, "localhost")
}

// 以下方法实际执行 MySQL 查询
func (c *MySQLCollector) collectSlowQueries() float64 {
    var count float64
    err := c.mysqlDB.QueryRow("SELECT COUNT(*) FROM mysql.slow_log").Scan(&count)
    if err != nil {
        log.Printf("Error collecting slow queries: %v", err)
        return 0
    }
    return count
}

func (c *MySQLCollector) collectReplicationLag() float64 {
    var lag sql.NullInt64
    err := c.mysqlDB.QueryRow("SELECT TIMESTAMPDIFF(SECOND, MAX(heartbeat.ts), NOW()) FROM mysql.heartbeat").Scan(&lag)
    if err != nil || !lag.Valid {
        return 0
    }
    return float64(lag.Int64)
}

func (c *MySQLCollector) collectThreadsConnected() float64 {
    var count float64
    err := c.mysqlDB.QueryRow("SELECT COUNT(*) FROM information_schema.processlist").Scan(&count)
    if err != nil {
        return 0
    }
    return count
}
```

**main.go：**
```go
package main

import (
    "database/sql"
    "log"
    "net/http"
    "time"

    _ "github.com/go-sql-driver/mysql"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"

    "mysql-exporter/collector"
)

func main() {
    dsn := "root:password@tcp(mysql:3306)/"
    db, err := sql.Open("mysql", dsn)
    if err != nil {
        log.Fatalf("Failed to connect to MySQL: %v", err)
    }
    db.SetMaxOpenConns(5)
    db.SetMaxIdleConns(2)
    db.SetConnMaxLifetime(5 * time.Minute)

    // 使用异步缓存机制：每隔 15s 采集一次，而不是每次 Collect 都查数据库
    mysqlCollector := collector.NewMySQLCollector(db)
    prometheus.MustRegister(mysqlCollector)

    http.Handle("/metrics", promhttp.Handler())
    log.Println("MySQL Exporter starting on :9300")
    log.Fatal(http.ListenAndServe(":9300", nil))
}
```

### Python 版本实现

```python
from prometheus_client import start_http_server, Gauge, Counter, REGISTRY
import mysql.connector
import time
import os

class MySQLCollector:
    """Python 版本的 MySQL Exporter，与 Go 版本功能一致"""
    
    def __init__(self, host='mysql', user='root', password='password'):
        self.host = host
        self.user = user
        self.password = password
        
        # 定义指标（与 Go 版本对应的命名）
        self.slow_queries = Counter('mysql_slow_queries_total', 
            'Total number of slow queries', ['host'])
        self.replication_lag = Gauge('mysql_replication_lag_seconds',
            'Replication lag in seconds', ['host'])
        self.threads = Gauge('mysql_threads_connected',
            'Number of connected threads', ['host'])
    
    def collect(self):
        """实现 python prometheus_client 的 collect 接口"""
        conn = None
        try:
            conn = mysql.connector.connect(
                host=self.host, user=self.user, password=self.password)
            cursor = conn.cursor()
            
            # 慢查询数
            cursor.execute("SELECT COUNT(*) FROM information_schema.processlist WHERE time > 2")
            slow = cursor.fetchone()[0]
            self.slow_queries.labels(host=self.host).inc(slow)
            
            # 连接数
            cursor.execute("SELECT COUNT(*) FROM information_schema.processlist")
            threads = cursor.fetchone()[0]
            self.threads.labels(host=self.host).set(threads)
            
            # 模拟主从延迟
            self.replication_lag.labels(host=self.host).set(0.5)
            
        except Exception as e:
            print(f"Error collecting metrics: {e}")
        finally:
            if conn: conn.close()

if __name__ == '__main__':
    collector = MySQLCollector()
    # 异步缓存：每 10s 采集一次数据
    def cache_metrics():
        while True:
            collector.collect()
            time.sleep(10)
    
    import threading
    t = threading.Thread(target=cache_metrics, daemon=True)
    t.start()
    
    start_http_server(9300)
    print("Python MySQL Exporter started on :9300")
    while True:
        time.sleep(1)
```

## 11.3 最佳实践：异步缓存机制

### 问题

Collect() 方法不能阻塞。如果每次 Prometheus scrape 时，Exporter 都去实时查询 MySQL，可能：
1. 查询耗时超过 scrape_timeout → Prometheus 采集失败
2. 大量 scrape 并发查询 → MySQL 压力过大

### 解决方案

使用异步缓存：在独立 goroutine 中定期采集数据，Collect() 直接读取缓存值。

```
┌──────────────┐     scrape      ┌──────────────────┐
│  Prometheus   │ ──────────────▶│  Exporter        │
│               │                │  :9300/metrics   │
└──────────────┘                 │  Collect() → 缓存 │
                                 └────────┬─────────┘
                                          │ 后台协程每 15s 刷新
                                          ▼
                                 ┌──────────────────┐
                                 │  MySQL 数据库     │
                                 └──────────────────┘
```

## 本章小结

- `Describe()` + `Collect()` 是自定义 Exporter 的核心接口
- 异步缓存机制是 Exporter 性能的关键：永远不要在 Collect() 中执行耗时操作
- Go 和 Python 的 prometheus_client 实现方式不同，但目标一致
- 实践：[Exporter 开发实验](../labs/ch11-custom-exporter/README.md)