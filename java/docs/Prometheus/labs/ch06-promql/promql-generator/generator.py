"""
PromQL 实验数据生成器 — 生成多种模式的时序数据

数据模式：
1. normal: 平稳的 HTTP 请求速率（模拟正常流量）
2. spike: 带有瞬时突刺的指标（演示 rate vs irate 差异）
3. step: 阶梯变化的指标（演示 increase 计算）
4. sine: 正弦波变化的指标（演示趋势分析）
"""

from prometheus_client import start_http_server, Counter, Gauge, Histogram
import random
import math
import time


class PromQLDataGenerator:
    METHODS = ['GET', 'POST', 'PUT', 'DELETE']
    ENDPOINTS = ['/api/users', '/api/orders', '/api/products', '/api/auth']
    STATUSES = ['200', '201', '400', '500']
    STATUS_WEIGHTS = [0.70, 0.15, 0.10, 0.05]
    REGIONS = ['us-east', 'eu-west', 'ap-southeast']
    INSTANCES = ['web-1', 'web-2', 'web-3']

    def __init__(self):
        self.requests = Counter(
            'demo_http_requests_total',
            'Demo HTTP requests with various labels',
            ['method', 'endpoint', 'status', 'region', 'instance'])

        self.spike = Gauge(
            'demo_cpu_spike_percent',
            'CPU usage with occasional spikes (demo irate vs rate)',
            ['instance'])

        self.sine_wave = Gauge(
            'demo_sine_wave_value',
            'Sine wave pattern for trend analysis',
            ['series'])

        self.step = Counter(
            'demo_step_counter_total',
            'Step-change counter for increase demo',
            ['stage'])

        self.latency = Histogram(
            'demo_request_duration_seconds',
            'Request latency histogram for quantile demo',
            ['method', 'region'],
            buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5])

    def run_forever(self):
        tick = 0
        while True:
            for method in self.METHODS:
                for region in self.REGIONS:
                    for instance in self.INSTANCES:
                        count = max(1, int(random.gauss(5, 2)))
                        for _ in range(count):
                            endpoint = random.choice(self.ENDPOINTS)
                            status = random.choices(self.STATUSES, weights=self.STATUS_WEIGHTS)[0]
                            self.requests.labels(
                                method=method, endpoint=endpoint, status=status,
                                region=region, instance=instance).inc()

            for instance in self.INSTANCES:
                base = 30 + 10 * math.sin(tick * 0.1)
                if random.random() < 0.05:
                    spike_value = base + random.uniform(50, 70)
                else:
                    spike_value = base + random.gauss(0, 5)
                self.spike.labels(instance=instance).set(max(0, min(100, spike_value)))

            for i in range(3):
                val = 50 + 40 * math.sin(tick * 0.05 + i * 2.094)
                self.sine_wave.labels(series=f"series_{i}").set(val)

            for stage in ['dev', 'staging', 'prod']:
                if random.random() < 0.02:
                    self.step.labels(stage=stage).inc(random.randint(10, 50))
                self.step.labels(stage=stage).inc(random.randint(0, 3))

            for method in self.METHODS:
                for region in self.REGIONS:
                    if method == 'GET':
                        mean_latency = 0.05
                    elif method == 'POST':
                        mean_latency = 0.15
                    else:
                        mean_latency = 0.10
                    latency = random.expovariate(1.0 / mean_latency)
                    self.latency.labels(method=method, region=region).observe(min(latency, 2.0))

            tick += 1
            time.sleep(1)


if __name__ == '__main__':
    gen = PromQLDataGenerator()
    start_http_server(8087)
    print("[PromQLGen] Data generator started on :8087")
    gen.run_forever()