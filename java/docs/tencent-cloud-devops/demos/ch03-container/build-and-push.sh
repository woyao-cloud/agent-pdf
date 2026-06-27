#!/bin/bash
# 使用Docker构建并推送到TCR
set -e

TCR_REGISTRY="ccr.ccs.tencentyun.com"
PROJECT="demo"
APP_NAME="app"
VERSION=$(date +%Y%m%d-%H%M%S)

echo "=== 构建镜像 ==="
docker build -t ${TCR_REGISTRY}/${PROJECT}/${APP_NAME}:${VERSION} .
docker tag ${TCR_REGISTRY}/${PROJECT}/${APP_NAME}:${VERSION} ${TCR_REGISTRY}/${PROJECT}/${APP_NAME}:latest

echo "=== 推送到TCR ==="
docker push ${TCR_REGISTRY}/${PROJECT}/${APP_NAME}:${VERSION}
docker push ${TCR_REGISTRY}/${PROJECT}/${APP_NAME}:latest

echo "=== 完成 ==="
echo "镜像: ${TCR_REGISTRY}/${PROJECT}/${APP_NAME}:${VERSION}"

# 使用Jib构建（无需Docker守护进程）
echo ""
echo "=== 使用Jib构建（无需Docker） ==="
echo "mvn compile jib:build -DTCR_USERNAME=xxx -DTCR_PASSWORD=yyy"
