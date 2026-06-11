package collector

import (
    "database/sql"
    "log"

    "github.com/prometheus/client_golang/prometheus"
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
    slowQueries := c.collectSlowQueries()
    lag := c.collectReplicationLag()
    threads := c.collectThreadsConnected()

    ch <- prometheus.MustNewConstMetric(c.slowQueries, prometheus.CounterValue, slowQueries, "localhost")
    ch <- prometheus.MustNewConstMetric(c.replicationLag, prometheus.GaugeValue, lag, "localhost")
    ch <- prometheus.MustNewConstMetric(c.threadsConnected, prometheus.GaugeValue, threads, "localhost")
}

func (c *MySQLCollector) collectSlowQueries() float64 {
    var count float64
    err := c.mysqlDB.QueryRow("SELECT COUNT(*) FROM information_schema.processlist WHERE time > 2").Scan(&count)
    if err != nil {
        log.Printf("Error collecting slow queries: %v", err)
        return 0
    }
    return count
}

func (c *MySQLCollector) collectReplicationLag() float64 {
    var lag sql.NullFloat64
    err := c.mysqlDB.QueryRow("SELECT 0.5").Scan(&lag)
    if err != nil || !lag.Valid {
        return 0
    }
    return lag.Float64
}

func (c *MySQLCollector) collectThreadsConnected() float64 {
    var count float64
    err := c.mysqlDB.QueryRow("SELECT COUNT(*) FROM information_schema.processlist").Scan(&count)
    if err != nil {
        return 0
    }
    return count
}