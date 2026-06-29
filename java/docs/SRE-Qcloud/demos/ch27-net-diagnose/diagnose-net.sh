#!/bin/bash
# 腾讯云网络故障诊断脚本
# 使用：bash diagnose-net.sh <target-ip>

TARGET=${1:-8.8.8.8}

echo "=========================================="
echo "  腾讯云网络故障诊断"
echo "  目标: $TARGET"
echo "=========================================="

echo -e "\n--- 1. 本地网络接口 ---"
ip addr show | grep -E "^[0-9]|inet " | head -10

echo -e "\n--- 2. 路由表 ---"
ip route show | head -10

echo -e "\n--- 3. DNS 解析 ---"
nslookup $TARGET 2>/dev/null || echo "DNS 解析失败"
nslookup $TARGET 119.29.29.29 2>/dev/null || echo "腾讯云 DNS 解析失败"

echo -e "\n--- 4. ICMP 连通性 ---"
ping -c 4 -W 3 $TARGET 2>/dev/null || echo "Ping 失败（可能被禁 ping）"

echo -e "\n--- 5. TCP 端口检测 ---"
for port in 80 443 22 8080; do
    timeout 2 bash -c "echo >/dev/tcp/$TARGET/$port" 2>/dev/null && \
        echo "  Port $port: 可达" || \
        echo "  Port $port: 不可达"
done

echo -e "\n--- 6. 安全组诊断 ---"
echo "  检查安全组规则是否允许目标 IP 的流量"
echo "  建议: 检查腾讯云控制台安全组入站规则"

echo -e "\n--- 7. CLB 健康检查 ---"
echo "  检查 CLB 后端服务健康状态:"
echo "  tccli clb DescribeTargetHealth --LoadBalancerIds lb-xxxxx"

echo -e "\n=========================================="
echo "  诊断完成"
echo "=========================================="
