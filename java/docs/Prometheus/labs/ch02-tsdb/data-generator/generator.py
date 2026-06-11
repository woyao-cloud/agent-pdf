"""
正常时序数据生成器 — 模拟微服务标准指标

生成 3 种标准指标类型：
1. Counter: http_requests_total{method, endpoint, status}
2. Histogram: http_request_duration_seconds{method}
3. Gauge: memory_usage_bytes{component}

Label 数量有限、基数低，作为"对照组"对比 high-card-gen 的表现。
"""

from prometheus_client import start_http_server, Counter, Gauge, Histogram
import random
import time


class NormalGenerator:
    METHODS = ['GET', 'POST', 'PUT', 'DELETE']
    ENDPOINTS = ['/api/users', '/api/orders', '/api/products']
    STATUSES = ['200', '201', '400', '404', '500']
    STATUS_WEIGHTS = [0.70, 0.15, 0.05, 0.05, 0.05]
    COMPONENTS = ['heap', 'non-heap', 'cache', 'buffer']

    def __init__(self):
        self.requests = Counter(
            'http_requests_total', 'Total HTTP requests',
            ['method', 'endpoint', 'status'])
        self.duration = Histogram(
            'http_request_duration_seconds', 'Request latency in seconds',
            ['method'],
            buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0])
        self.memory = Gauge(
            'memory_usage_bytes', 'Memory usage in bytes',
            ['component'])

    def run_forever(self):
        while True:
            for method in self.METHODS:
                for endpoint in self.ENDPOINTS:
                    status = random.choices(self.STATUSES, weights=self.STATUS_WEIGHTS)[0]
                    self.requests.labels(
                        method=method, endpoint=endpoint, status=status).inc()
                    with self.duration.labels(method=method).time():
                        time.sleep(random.uniform(0.01, 0.15))
            for comp in self.COMPONENTS:
                self.memory.labels(component=comp).set(
                    random.randint(100, 2000) * 1024 * 1024)
            time.sleep(5)


if __name__ == '__main__':
    gen = NormalGenerator()
    start_http_server(8081)
    print("[DataGen] Normal metrics generator started on :8081")
    gen.run_forever()