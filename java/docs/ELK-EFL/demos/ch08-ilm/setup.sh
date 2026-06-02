#!/bin/bash
# ============================================
# 第8章 —— ILM 策略设置脚本
# ============================================
# 用法：./ch08-ilm/setup.sh
# 前置：ES 集群必须已启动
# ============================================

ES_HOST="${ES_HOST:-http://localhost:9200}"

echo "===== 第8章：配置 ILM 策略 ====="

# 1. 创建 ILM 策略
echo ">>> 1. 创建 ILM 策略: app-logs-policy"
curl -s -X PUT "$ES_HOST/_ilm/policy/app-logs-policy" -H 'Content-Type: application/json' -d '{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_size": "10gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "delete": {
        "min_age": "3d",
        "actions": { "delete": {} }
      }
    }
  }
}' | jq '.'

# 2. 创建 Index Template
echo ">>> 2. 创建 Index Template: app-logs-template"
curl -s -X PUT "$ES_HOST/_index_template/app-logs-template" -H 'Content-Type: application/json' -d '{
  "priority": 100,
  "index_patterns": ["app-logs-*", "app-logs-error-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "refresh_interval": "5s",
      "index.lifecycle.name": "app-logs-policy"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":   { "type": "date" },
        "level":        { "type": "keyword" },
        "logger":       { "type": "keyword" },
        "message":      { "type": "text" },
        "serviceName":  { "type": "keyword" },
        "traceId":      { "type": "keyword" },
        "userId":       { "type": "keyword" },
        "stack_trace":  { "type": "text", "index": false }
      }
    }
  }
}' | jq '.'

# 3. 创建第一个索引
echo ">>> 3. 创建初始索引: app-logs-000001"
curl -s -X PUT "$ES_HOST/app-logs-000001" -H 'Content-Type: application/json' -d '{
  "aliases": { "app-logs": { "is_write_index": true } }
}' | jq '.'

echo ""
echo "===== 完成！====="
echo "验证：curl $ES_HOST/app-logs-*/_ilm/explain"