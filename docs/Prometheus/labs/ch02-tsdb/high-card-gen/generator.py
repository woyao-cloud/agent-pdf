"""
高基数时序数据生成器

通过环境变量控制 Label 种类和每个 Label 的基数：
- CARD_ENDPOINT: endpoint 标签的基数（默认 5）
- CARD_USER: user_id 标签的基数（默认 100，核心观察变量）
- CARD_REGION: region 标签的基数（默认 3）
- SCRAPE_INTERVAL: 生成间隔（默认 5）

总时间序列数 = CARD_ENDPOINT × CARD_USER × CARD_REGION
"""

from prometheus_client import start_http_server, Gauge, Counter
import os
import itertools
import random
import time


class HighCardinalityGenerator:

    def __init__(self):
        endpoint_card = int(os.getenv('CARD_ENDPOINT', '5'))
        user_card = int(os.getenv('CARD_USER', '100'))
        region_card = int(os.getenv('CARD_REGION', '3'))

        # 生成所有 Label 组合（笛卡尔积）
        endpoints = [f"/api/{i}" for i in range(endpoint_card)]
        users = [f"user_{i}" for i in range(user_card)]
        regions = ['us-east', 'eu-west', 'ap-southeast'][:region_card]

        self.series_count = endpoint_card * user_card * region_card
        print(f"Generating {self.series_count} time series "
              f"(endpoint={endpoint_card} × user={user_card} × region={region_card})")

        # 为每条序列创建一个 Gauge 和 Counter
        self.gauges = {}
        self.counters = {}
        for endpoint, user, region in itertools.product(endpoints, users, regions):
            labels = {'endpoint': endpoint, 'user_id': user, 'region': region}
            self.gauges[(endpoint, user, region)] = Gauge(
                'app_request_duration_ms', 'Request duration in ms', labels)
            self.counters[(endpoint, user, region)] = Counter(
                'app_requests_total', 'Total requests', labels)

    def run(self):
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
    gen.run()
