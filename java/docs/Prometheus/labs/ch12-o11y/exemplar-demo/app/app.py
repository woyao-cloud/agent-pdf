"""
Exemplar 演示应用 — 生成带 TraceID 的 Histogram 指标
展示 Exemplar 如何将 TraceID 嵌入 Prometheus 指标
"""

from prometheus_client import start_http_server, Histogram, generate_latest
import random
import time
import uuid

# 定义带 Exemplar 支持的 Histogram
REQUEST_DURATION = Histogram(
    'demo_request_duration_seconds',
    'Request duration with exemplar support',
    ['service', 'method'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)


def handle_request():
    """模拟一个 HTTP 请求，生成带 Exemplar 的指标"""
    trace_id = uuid.uuid4().hex[:16]
    service = random.choice(['api-gateway', 'order-service', 'user-service'])
    method = random.choice(['GET', 'POST', 'PUT'])

    # 模拟延迟（偶尔出现突刺）
    duration = random.expovariate(1.0 / 0.1)  # 平均 100ms
    if random.random() < 0.05:  # 5% 概率出现延迟突刺
        duration = random.uniform(1.0, 4.0)

    # 记录带 Exemplar 的观测值
    # Exemplar 携带 traceID，用于在 Grafana 中跳转到 Trace 详情
    REQUEST_DURATION.labels(
        service=service, method=method
    ).observe(duration, exemplar={'TraceID': trace_id})

    return trace_id, service, method, duration


if __name__ == '__main__':
    start_http_server(8089)
    print("[ExemplarDemo] Started on :8089")
    print("Generating metrics with exemplars (traceID embedded)...")

    while True:
        trace_id, service, method, duration = handle_request()
        if duration > 1.0:
            print(f"  ⚠ SLOW: {service}/{method} {duration:.2f}s trace={trace_id}")
        time.sleep(random.uniform(0.5, 2.0))