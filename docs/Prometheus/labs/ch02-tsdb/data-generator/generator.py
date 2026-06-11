"""
正常时序数据生成器

模拟正常微服务场景的指标：
3 个常用指标，少量 Label：
- http_requests_total{method, endpoint, status}
- http_request_duration_seconds{method}
- memory_usage_bytes{component}
"""

from prometheus_client import start_http_server, Gauge, Counter, Histogram
import random
import time


class NormalGenerator:

    METHODS = ['GET', 'POST', 'PUT', 'DELETE']
    ENDPOINTS = ['/api/users', '/api/orders', '/api/products']
    STATUSES = ['200', '201', '400', '500']
    COMPONENTS = ['heap', 'non-heap', 'cache', 'buffer']

    def __init__(self):
        self.requests = Counter('http_requests_total', 'Total requests',
                                ['method', 'endpoint', 'status'])
        self.duration = Histogram('http_request_duration_seconds', 'Request latency',
                                  ['method'], buckets=[0.01, 0.05, 0.1, 0.5, 1])
        self.memory = Gauge('memory_usage_bytes', 'Memory usage', ['component'])

    def run(self):
        while True:
            for method in self.METHODS:
                for endpoint in self.ENDPOINTS:
                    status = random.choices(self.STATUSES, weights=[0.7, 0.15, 0.1, 0.05])[0]
                    self.requests.labels(method=method, endpoint=endpoint, status=status).inc()
                    with self.duration.labels(method=method).time():
                        time.sleep(random.uniform(0.01, 0.15))
            for comp in self.COMPONENTS:
                self.memory.labels(component=comp).set(random.randint(100, 2000))
            time.sleep(5)


if __name__ == '__main__':
    gen = NormalGenerator()
    start_http_server(8081)
    gen.run()
