from prometheus_client import start_http_server, Counter, Histogram, generate_latest
import random
import time

REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint'])
REQUEST_DURATION = Histogram('http_request_duration_seconds', 'Request latency',
                             ['method'], buckets=[0.01, 0.05, 0.1, 0.5, 1, 5])


def handle_request(method, endpoint):
    with REQUEST_DURATION.labels(method=method).time():
        REQUEST_COUNT.labels(method=method, endpoint=endpoint).inc()
        time.sleep(random.uniform(0.01, 0.2))  # 模拟处理耗时


if __name__ == '__main__':
    start_http_server(8080)  # 暴露 /metrics
    while True:
        handle_request(random.choice(['GET', 'POST', 'PUT']),
                       random.choice(['/api/users', '/api/orders', '/api/products']))
