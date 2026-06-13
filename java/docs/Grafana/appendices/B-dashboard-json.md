# 附录 B：企业级 Dashboard JSON 模型结构深度解析

## Dashboard JSON 整体结构

```json
{
  "title": "Service Overview",
  "uid": "service-overview-unique-id",
  "version": 5,
  "schemaVersion": 39,
  
  "description": "Production service overview dashboard",
  "tags": ["production", "backend", "sre"],
  "timezone": "browser",
  "editable": true,
  
  "time": {
    "from": "now-6h",
    "to": "now"
  },
  "timepicker": {
    "refresh_intervals": ["5s", "10s", "30s", "1m", "5m", "15m", "30m", "1h"],
    "time_options": ["5m", "15m", "1h", "6h", "12h", "24h", "2d", "7d", "30d"]
  },
  
  "templating": {
    "list": []
  },
  "annotations": {
    "list": []
  },
  "panels": [],
  "links": [],
  
  "refresh": "30s"
}
```

## 字段说明

### 基础字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | Dashboard 名称 |
| `uid` | string | 唯一标识符（用于 URL 和 API 引用） |
| `version` | number | 版本号（每次保存自动递增）|
| `schemaVersion` | number | Dashboard 模型版本 |
| `timezone` | string | `browser` / `utc` / `Asia/Shanghai` |
| `refresh` | string | 自动刷新间隔 |
| `editable` | boolean | 是否允许编辑 |

### Panel 结构

```json
{
  "id": 1,
  "title": "QPS",
  "type": "timeseries",
  "datasource": {
    "type": "prometheus",
    "uid": "P1"
  },
  "gridPos": {
    "h": 8,
    "w": 12,
    "x": 0,
    "y": 0
  },
  "targets": [
    {
      "expr": "sum(rate(http_requests_total[5m]))",
      "legendFormat": "QPS",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "reqps",
      "min": 0,
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 100 },
          { "color": "red", "value": 200 }
        ]
      }
    },
    "overrides": [
      {
        "matcher": { "id": "byName", "options": "error_rate" },
        "properties": [{ "id": "unit", "value": "percent" }]
      }
    ]
  },
  "options": {
    "legend": {
      "displayMode": "table",
      "placement": "bottom"
    },
    "tooltip": {
      "mode": "multi",
      "sort": "desc"
    }
  }
}
```

### Templating 结构

```json
{
  "name": "service",
  "type": "query",
  "query": "label_values(up, job)",
  "refresh": 1,
  "includeAll": true,
  "multi": true,
  "allValue": ".*",
  "sort": 1,
  "hide": 0
}
```

### Annotation 结构

```json
{
  "name": "Deploy Events",
  "datasource": { "type": "prometheus", "uid": "P1" },
  "enable": true,
  "expr": "changes(version[5m]) > 0",
  "iconColor": "blue",
  "titleFormat": "Deploy {{ $labels.version }}",
  "textFormat": "{{ $labels.service }}",
  "tags": ["deploy"]
}
```

## 用代码批量修改 Dashboard

```python
#!/usr/bin/env python3
"""批量更新 Dashboard JSON 的工具"""

import json
import os
import requests
from glob import glob

GRAFANA_URL = "http://grafana:3000"
API_KEY = os.environ.get("GRAFANA_API_KEY")

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

def update_datasource_uid(dashboard_json, old_uid, new_uid):
    """批量替换数据源 UID"""
    def _replace(obj):
        if isinstance(obj, dict):
            if obj.get("type") == "prometheus" and obj.get("uid") == old_uid:
                obj["uid"] = new_uid
            for v in obj.values():
                _replace(v)
        elif isinstance(obj, list):
            for item in obj:
                _replace(item)
    
    _replace(dashboard_json)
    return dashboard_json

def set_refresh_interval(dashboard_json, interval):
    """设置自动刷新间隔"""
    dashboard_json["refresh"] = interval
    return dashboard_json

def add_tag(dashboard_json, tag):
    """添加标签"""
    if "tags" not in dashboard_json:
        dashboard_json["tags"] = []
    if tag not in dashboard_json["tags"]:
        dashboard_json["tags"].append(tag)
    return dashboard_json

def upload_dashboard(dashboard_json, overwrite=True):
    """上传 Dashboard 到 Grafana"""
    payload = {
        "dashboard": dashboard_json,
        "overwrite": overwrite,
    }
    resp = requests.post(
        f"{GRAFANA_URL}/api/dashboards/db",
        headers=HEADERS,
        json=payload,
    )
    return resp.json()

def batch_upload(directory):
    """批量上传目录下的所有 JSON 文件"""
    for filepath in glob(f"{directory}/*.json"):
        with open(filepath) as f:
            dashboard = json.load(f)
        
        # 批量修改
        dashboard = set_refresh_interval(dashboard, "1m")
        dashboard = add_tag(dashboard, "auto-imported")
        
        # 上传
        result = upload_dashboard(dashboard)
        print(f"Uploaded {dashboard['title']}: {result.get('status')}")

if __name__ == "__main__":
    batch_upload("./dashboards")
```
