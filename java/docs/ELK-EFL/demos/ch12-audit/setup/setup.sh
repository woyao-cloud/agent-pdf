#!/bin/bash
# ============================================
# 第12章 —— 审计日志 ILM 策略与索引模板
# ============================================
# 审计日志要求：
#   1. 独立通道（独立索引）
#   2. 写入后 1 天自动设为只读（不可篡改）
#   3. 长期保留（默认 365 天）
#   4. dynamic: strict 防止字段被篡改
# ============================================
# 用法：bash ch12-audit/setup/setup.sh
# 前置：ES 集群必须已启动
# ============================================

ES_HOST="${ES_HOST:-http://localhost:9200}"

echo "===== 第12章：配置审计日志 ILM 策略与索引模板 ====="
echo ""

# ===== 1. 创建审计日志 ILM 策略 =====
echo ">>> 1. 创建 ILM 策略: audit-logs-policy"
echo "    特点：Hot(1d) → Warm(只读) → Delete(365d)"
curl -s -X PUT "$ES_HOST/_ilm/policy/audit-logs-policy" -H 'Content-Type: application/json' -d '{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_size": "10gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "1d",
        "actions": {
          "readonly": {},
          "set_priority": { "priority": 50 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": { "delete": {} }
      }
    }
  }
}'
echo ""

# ===== 2. 创建审计日志索引模板 =====
echo ">>> 2. 创建 Index Template: audit-logs-template"
echo "    匹配: audit-logs-*"
echo "    字段: timestamp, userId, userIp, action, resource, resourceId, detail, result"
curl -s -X PUT "$ES_HOST/_index_template/audit-logs-template" -H 'Content-Type: application/json' -d '{
  "priority": 200,
  "index_patterns": ["audit-logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "refresh_interval": "10s",
      "index.lifecycle.name": "audit-logs-policy"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":   { "type": "date" },
        "timestamp":    { "type": "date" },
        "userId":       { "type": "keyword" },
        "userIp":       { "type": "ip" },
        "action":       { "type": "keyword" },
        "resource":     { "type": "keyword" },
        "resourceId":   { "type": "keyword" },
        "detail":       { "type": "text", "index": false },
        "result":       { "type": "keyword" }
      }
    }
  }
}'
echo ""

# ===== 3. 创建第一个审计索引 =====
echo ">>> 3. 创建初始索引: audit-logs-000001"
curl -s -X PUT "$ES_HOST/audit-logs-000001" -H 'Content-Type: application/json' -d '{
  "aliases": { "audit-logs": { "is_write_index": true } }
}'
echo ""

echo ""
echo "===== 完成！====="
echo "验证："
echo "  curl $ES_HOST/_ilm/policy/audit-logs-policy?pretty"
echo "  curl $ES_HOST/_index_template/audit-logs-template?pretty"
echo "  curl $ES_HOST/_cat/indices/audit-logs-*?v"
echo ""

echo "提示："
echo "  审计日志索引当天可写入"
echo "  1 天后自动进入 Warm 阶段并设为只读（不可篡改）"
echo "  365 天后自动删除"