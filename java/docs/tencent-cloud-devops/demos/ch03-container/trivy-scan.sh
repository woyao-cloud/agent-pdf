#!/bin/bash
# 使用Trivy扫描镜像漏洞
set -e

IMAGE=$1
if [ -z "$IMAGE" ]; then
    echo "用法: ./trivy-scan.sh <镜像名称>"
    echo "示例: ./trivy-scan.sh ccr.ccs.tencentyun.com/demo/app:latest"
    exit 1
fi

echo "=== 扫描镜像: $IMAGE ==="
echo ""

# 扫描高危和严重漏洞
trivy image --severity CRITICAL,HIGH --exit-code 1 --format table "$IMAGE"

if [ $? -eq 0 ]; then
    echo "✅ 未发现高危/严重漏洞"
else
    echo "❌ 发现高危/严重漏洞，请修复后重新构建"
    exit 1
fi

echo ""
echo "=== 生成SBOM ==="
trivy image --format cyclonedx --output sbom.json "$IMAGE"
echo "SBOM已保存到 sbom.json"
