"""
Push 模型模拟器 — 模拟传统监控系统的 Push 接收端

功能：
1. POST /push — 接收外部指标推送（模拟 Agent 上报）
2. GET /metrics — 暴露已收集的指标（用于对比 Pull 模型）
3. GET /status — 查看当前状态（请求数、错误率）

设计意图：
当大量并发请求涌入时，观察 Push 模型的"雪崩效应"：
- 响应延迟升高
- 内存占用增长
- 请求丢失/超时

对比 pull-app 在相同压力下的表现。
"""

from flask import Flask, request, jsonify
import threading
import time
from collections import defaultdict

app = Flask(__name__)

# 内存中存储的指标
metric_counts = defaultdict(int)
metric_values = defaultdict(float)
lock = threading.Lock()

request_count = 0
error_count = 0
start_time = time.time()


@app.route('/push', methods=['POST'])
def push_metric():
    """模拟旧式 Push 模型的指标上报端点"""
    global request_count, error_count

    data = request.get_json(silent=True)
    if not data or 'metric' not in data:
        error_count += 1
        return jsonify({"status": "error", "message": "invalid payload"}), 400

    metric_name = data['metric']
    value = float(data.get('value', 0))
    labels = data.get('labels', {})

    # 模拟带延迟的写入操作（Push 的典型瓶颈）
    time.sleep(0.001)  # 1ms 处理延迟

    with lock:
        request_count += 1
        key = (metric_name, str(labels))
        metric_counts[key] += 1
        metric_values[key] = value

    return jsonify({"status": "ok", "received": metric_name})


@app.route('/metrics', methods=['GET'])
def metrics():
    """以 Prometheus 格式暴露收集到的指标"""
    lines = [
        '# HELP push_metrics_total Metrics received via Push model',
        '# TYPE push_metrics_total counter',
    ]
    with lock:
        for (metric, labels_str), count in metric_counts.items():
            labels = eval(labels_str)
            label_str = ",".join(f'{k}="{v}"' for k, v in labels.items())
            lines.append(f'push_{metric}_total{{{label_str}}} {count}')

    uptime = time.time() - start_time
    lines.extend([
        '',
        '# HELP push_uptime_seconds Push server uptime',
        '# TYPE push_uptime_seconds gauge',
        f'push_uptime_seconds {uptime:.0f}',
    ])
    return "\n".join(lines) + "\n"


@app.route('/status')
def status():
    """查看 Push 服务器状态"""
    with lock:
        return jsonify({
            "total_requests": request_count,
            "error_count": error_count,
            "error_rate": round(error_count / max(request_count, 1), 4),
            "unique_series": len(metric_counts),
            "uptime_seconds": int(time.time() - start_time),
        })


if __name__ == '__main__':
    print("Push Model Server starting on :5000")
    print("Endpoints:")
    print("  POST /push    - Send metrics (simulate Agent push)")
    print("  GET  /metrics - View collected metrics (Prometheus format)")
    print("  GET  /status  - Server health status")
    app.run(host='0.0.0.0', port=5000)