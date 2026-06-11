"""
Webhook 告警接收器 — 接收 Alertmanager 推送的告警
在终端展示告警内容和状态变化
"""

from flask import Flask, request, jsonify
import json
from datetime import datetime

app = Flask(__name__)

received_alerts = []


@app.route('/alert', methods=['POST'])
def receive_alert():
    data = request.json
    if data is None:
        return jsonify({"status": "error"}), 400

    timestamp = datetime.now().strftime("%H:%M:%S")
    alerts = data.get('alerts', [])

    for alert in alerts:
        status = alert.get('status', 'unknown')
        labels = alert.get('labels', {})
        annotations = alert.get('annotations', {})
        alertname = labels.get('alertname', 'unknown')
        severity = labels.get('severity', 'unknown')
        summary = annotations.get('summary', '')
        starts_at = alert.get('startsAt', '')

        if status == 'firing':
            emoji = '🚨'
        elif status == 'resolved':
            emoji = '✅'
        else:
            emoji = 'ℹ️'

        print(f"\n{emoji} [{timestamp}] {status.upper()} | {alertname} | {severity}")
        print(f"   Labels: {json.dumps(labels, ensure_ascii=False)}")
        print(f"   Summary: {summary}")
        print(f"   Started: {starts_at}")

        received_alerts.append({
            'timestamp': timestamp,
            'status': status,
            'alertname': alertname,
            'severity': severity,
            'summary': summary,
            'labels': labels,
        })

    return jsonify({"status": "ok", "received": len(alerts)})


@app.route('/alerts', methods=['GET'])
def list_alerts():
    return jsonify(received_alerts[-100:])


@app.route('/status', methods=['GET'])
def status():
    counts = {}
    for a in received_alerts:
        key = a['alertname']
        counts[key] = counts.get(key, 0) + 1
    return jsonify({
        "total": len(received_alerts),
        "by_alert": counts,
        "recent": received_alerts[-5:],
    })


if __name__ == '__main__':
    print("=" * 50)
    print("Webhook Alert Receiver starting on :5000")
    print("=" * 50)
    print("Waiting for alerts from Alertmanager...")
    app.run(host='0.0.0.0', port=5000)