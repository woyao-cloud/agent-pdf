from prometheus_client import start_http_server, Gauge, Counter, REGISTRY
import mysql.connector
import time
import os
import threading

class MySQLCollector:
    def __init__(self, host='mysql', user='root', password='password'):
        self.host = host
        self.user = user
        self.password = password
        self.slow_queries = Counter('mysql_slow_queries_total',
            'Total number of slow queries', ['host'])
        self.replication_lag = Gauge('mysql_replication_lag_seconds',
            'Replication lag in seconds', ['host'])
        self.threads = Gauge('mysql_threads_connected',
            'Number of connected threads', ['host'])

    def collect_metrics(self):
        conn = None
        try:
            conn = mysql.connector.connect(
                host=self.host, user=self.user, password=self.password)
            cursor = conn.cursor()

            cursor.execute("SELECT COUNT(*) FROM information_schema.processlist WHERE time > 2")
            slow = cursor.fetchone()[0]
            self.slow_queries.labels(host=self.host).inc(slow)

            cursor.execute("SELECT COUNT(*) FROM information_schema.processlist")
            threads = cursor.fetchone()[0]
            self.threads.labels(host=self.host).set(threads)

            self.replication_lag.labels(host=self.host).set(0.5)

        except Exception as e:
            print(f"Error collecting metrics: {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

def cache_loop(collector, interval=15):
    while True:
        collector.collect_metrics()
        time.sleep(interval)

if __name__ == '__main__':
    collector = MySQLCollector()
    t = threading.Thread(target=cache_loop, args=(collector, 15), daemon=True)
    t.start()
    start_http_server(9300)
    print("Python MySQL Exporter started on :9300")
    while True:
        time.sleep(1)