"""TCOP 监控指标 - Prometheus 客户端"""
import time
import functools
from prometheus_client import Counter, Histogram, Gauge, generate_latest, REGISTRY
from fastapi import Request
from fastapi.responses import Response

# 自定义指标
user_total = Gauge("user_service_users_total", "用户总数")
http_requests_total = Counter("user_service_http_requests_total", "HTTP 请求总数", ["method", "endpoint", "status"])
http_request_duration = Histogram("user_service_http_request_duration_seconds", "HTTP 请求耗时", ["method", "endpoint"], buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0])

def setup_metrics(app):
    """挂载 /metrics 端点"""
    @app.get("/metrics")
    async def metrics():
        return Response(content=generate_latest(REGISTRY), media_type="text/plain")

def track_request(endpoint: str):
    """请求追踪装饰器"""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            start = time.time()
            status = 200
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = getattr(e, "status_code", 500)
                raise
            finally:
                duration = time.time() - start
                http_requests_total.labels(method="POST", endpoint=endpoint, status=status).inc()
                http_request_duration.labels(method="POST", endpoint=endpoint).observe(duration)
        return wrapper
    return decorator
