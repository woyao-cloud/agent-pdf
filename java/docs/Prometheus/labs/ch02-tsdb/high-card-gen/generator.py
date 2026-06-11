"""
高基数时序数据生成器 — 演示 Label Cardinality 对 TSDB 的影响

通过环境变量控制 Label 种类和每个 Label 的基数：
- CARD_ENDPOINT: endpoint Label 的取值数量（默认 5）
- CARD_USER: user_id Label 的取值数量（默认 100，核心观察变量）
- CARD_REGION: region Label 的取值数量（默认 3）
- CARD_VERSION: version Label 的取值数量（默认 2）

总时间序列数 = prod(所有 CARD_*)
例如默认值：5 × 100 × 3 × 2 = 3000 条序列

实验建议：
1. CARD_USER=10 → 5×10×3×2 = 300 条（正常）
2. CARD_USER=100 → 5×100×3×2 = 3000 条（开始膨胀）
3. CARD_USER=1000 → 5×1000×3×2 = 30000 条（高基数）
4. CARD_USER=10000 → 5×10000×3×2 = 300000 条（危险！请确保有足够内存）
"""

from prometheus_client import start_http_server, Gauge, Counter
import os
import itertools
import random
import time
import sys


class HighCardinalityGenerator:
    """可配置的高基数时序数据生成器"""

    def __init__(self):
        # 从环境变量读取基数配置
        card_endpoint = int(os.getenv('CARD_ENDPOINT', '5'))
        card_user = int(os.getenv('CARD_USER', '100'))
        card_region = int(os.getenv('CARD_REGION', '3'))
        card_version = int(os.getenv('CARD_VERSION', '2'))

        # 生成每个 Label 的取值列表
        endpoints = [f"/api/svc{i}" for i in range(card_endpoint)]
        users = [f"user_{i}" for i in range(card_user)]
        regions = ['us-east', 'eu-west', 'ap-southeast', 'sa-east'][:card_region]
        versions = [f"v{maj}.{min}" for maj in range(card_version) for min in range(2)][:card_version]

        # 计算总序列数
        self.series_count = card_endpoint * card_user * card_region * card_version
        print(f"[HighCardGen] Generating {self.series_count} time series:")
        print(f"  endpoint={card_endpoint} × user={card_user} × region={card_region} × version={card_version}")
        print(f"  Memory estimate: ~{self.series_count * 256 // 1024}KB per scrape")

        # 为每条 Label 组合创建指标
        self.gauges = {}
        self.counters = {}
        for endpoint, user, region, version in itertools.product(
                endpoints, users, regions, versions):
            labels = {
                'endpoint': endpoint,
                'user_id': user,
                'region': region,
                'version': version,
            }
            self.gauges[(endpoint, user, region, version)] = Gauge(
                'app_request_duration_ms',
                'Request duration in milliseconds (high cardinality demo)',
                labels)
            self.counters[(endpoint, user, region, version)] = Counter(
                'app_requests_total',
                'Total number of requests (high cardinality demo)',
                labels)

    def run_forever(self):
        """持续生成指标数据"""
        interval = int(os.getenv('SCRAPE_INTERVAL', '5'))
        while True:
            for key, gauge in self.gauges.items():
                gauge.set(random.uniform(10, 500))
            for key, counter in self.counters.items():
                counter.inc(random.randint(0, 5))
            time.sleep(interval)


if __name__ == '__main__':
    gen = HighCardinalityGenerator()
    start_http_server(8082)
    print("[HighCardGen] HTTP server started on :8082, exposing /metrics")
    gen.run_forever()