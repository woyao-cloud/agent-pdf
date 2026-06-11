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

    mysqlCollector := collector.NewMySQLCollector(db)
    prometheus.MustRegister(mysqlCollector)

    http.Handle("/metrics", promhttp.Handler())
    log.Println("MySQL Exporter starting on :9300")
    log.Fatal(http.ListenAndServe(":9300", nil))
}