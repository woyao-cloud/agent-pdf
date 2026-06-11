from flask import Flask, request, jsonify
import time
import threading

app = Flask(__name__)

# 内存中存储的指标
metrics_store = {}
lock = threading.Lock()
request_count = 0
error_count = 0


@app.route('/push', methods=['POST'])
def push_metric():
    global request_count, error_count
    data = request.json
    with lock:
        request_count += 1
        key = (data['metric'], data.get('value', 0))
        metrics_store[key] = metrics_store.get(key, 0) + 1
    return jsonify({"status": "ok"})


@app.route('/metrics')
def metrics():
    # 模拟暴露收集到的指标（但已滞后）
    lines = []
    with lock:
        for (metric, val), count in metrics_store.items():
            lines.append(f"push_{metric}{{count=\"{count}\"}} {val}")
    return "\n".join(lines) + "\n"


@app.route('/status')
def status():
    with lock:
        return jsonify({
            "total_requests": request_count,
            "error_rate": error_count / max(request_count, 1),
            "store_size": len(metrics_store)
        })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
