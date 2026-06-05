#!/bin/bash
# 性能基准测试脚本
# 使用 wrk 或 hey 对 API 网关进行压力测试
#
# 前置条件：
#   1. 安装 wrk (https://github.com/wg/wrk)
#   2. 启动网关: go run main.go
#   3. 确保网关监听在 :8080
#
# 用法:
#   bash bench/bench.sh [concurrency] [duration]

set -e

CONCURRENCY=${1:-10}    # 默认并发数 10
DURATION=${2:-30s}      # 默认测试时长 30秒
GATEWAY_URL=${GATEWAY_URL:-http://localhost:8080}

echo "========================================"
echo "API Gateway 性能基准测试"
echo "========================================"
echo "目标地址:    $GATEWAY_URL"
echo "并发连接数:  $CONCURRENCY"
echo "测试时长:    $DURATION"
echo "========================================"
echo ""

# 测试 1: 健康检查端点（无业务逻辑）
echo "--- 测试 1: 健康检查端点 /health ---"
wrk -t$CONCURRENCY -c$CONCURRENCY -d$DURATION --latency "$GATEWAY_URL/health"
echo ""

# 测试 2: API代理端点（含限流+熔断）
echo "--- 测试 2: API代理端点 /api/test ---"
wrk -t$CONCURRENCY -c$CONCURRENCY -d$DURATION --latency "$GATEWAY_URL/api/test"
echo ""

# 测试 3: 高并发场景（测试限流器效果）
echo "--- 测试 3: 高并发 /api/test (1000并发) ---"
wrk -t10 -c1000 -d$DURATION --latency "$GATEWAY_URL/api/test"
echo ""

# 测试 4: 大流量突发测试（测试令牌桶突发能力）
echo "--- 测试 4: 突发流量 /api/test ---"
for i in {1..5}; do
    # 瞬间发送 500 个请求，观察限流效果
    wrk -t4 -c$((500)) -d5s --latency "$GATEWAY_URL/api/test"
    sleep 2
done
echo ""

# 测试 5: 统计信息
echo "--- 网关统计 ---"
curl -s "$GATEWAY_URL/stats" | python -m json.tool 2>/dev/null || curl -s "$GATEWAY_URL/stats"
echo ""

echo "========================================"
echo "测试完成！"
echo "========================================"
echo ""
echo "提示："
echo "  1. 使用 pprof 分析性能热点："
echo "     go tool pprof http://localhost:6060/debug/pprof/profile"
echo "     go tool pprof http://localhost:6060/debug/pprof/heap"
echo ""
echo "  2. 在浏览器中查看 pprof 可视化："
echo "     http://localhost:6060/debug/pprof/"
echo ""
echo "  3. 查看 Prometheus 指标："
echo "     curl http://localhost:6060/metrics"