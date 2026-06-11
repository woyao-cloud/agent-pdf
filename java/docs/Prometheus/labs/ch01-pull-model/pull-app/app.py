"""
Pull 模型标准应用 — 演示 Prometheus Pull 模式的工作方式

设计意图：
使用 prometheus_client 库的标准方式暴露 /metrics 端点。
Prometheus 主动拉取（Pull）指标，无需应用主动上报。

对比 push-app，在相同负载下：
- Pull 模式由 Prometheus 控制节奏（scrape_interval）
- 应用只需准备好 /metrics 端点
- Prometheus 的重试和 backoff 保证采集可靠性
"""

from prometheus_client import (start_http_server, Counter, Gauge,
                               Histogram, generate_latest)
import random
import time


# === 指标定义 ===
REQUEST_COUNT = Counter(
    'http_requests_total', 'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'http_request_duration_seconds', 'Request latency in seconds',
    ['method'],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5]
)

IN_FLIGHT = Gauge(
    'http_requests_in_flight', 'Current number of in-flight requests',
    ['method']
)

MEMORY_USAGE = Gauge(
    'process_memory_bytes', 'Process memory usage',
    ['component']
)

# 模拟的请求参数
METHODS = ['GET', 'POST', 'PUT', 'DELETE']
ENDPOINTS = ['/api/users', '/api/orders', '/api/products', '/api/auth']
STATUSES = ['200', '201', '400', '404', '500']
# 权重：正常响应占多数
STATUS_WEIGHTS = [0.70, 0.15, 0.05, 0.05, 0.05]
COMPONENTS = ['heap', 'non-heap', 'cache', 'buffer']


def simulate_request():
    """模拟一次 HTTP 请求处理"""
    method = random.choice(METHODS)
    endpoint = random.choice(ENDPOINTS)
    status = random.choices(STATUSES, weights=STATUS_WEIGHTS)[0]

    IN_FLIGHT.labels(method=method).inc()

    with REQUEST_DURATION.labels(method=method).time():
        # 模拟处理耗时，符合长尾分布
        delay = random.expovariate(1 / 0.05)  # 平均 50ms
        delay = min(delay, 1.0)  # 上限 1s
        time.sleep(delay)

    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=status).inc()
    IN_FLIGHT.labels(method=method).dec()


def update_memory():
    """模拟内存使用变化"""
    for comp in COMPONENTS:
        MEMORY_USAGE.labels(component=comp).set(
            random.randint(100, 2000) * 1024 * 1024
        )


if __name__ == '__main__':
    # 在 8080 端口启动 HTTP 服务器，暴露 /metrics
    start_http_server(8080)
    print("Pull Model App started on :8080")
    print("Prometheus scrape endpoint: http://localhost:8080/metrics")
    print("Generating simulated traffic...")

    while True:
        # 每秒模拟 10-30 个请求
        for _ in range(random.randint(10, 30)):
            simulate_request()
        update_memory()
        time.sleep(1)