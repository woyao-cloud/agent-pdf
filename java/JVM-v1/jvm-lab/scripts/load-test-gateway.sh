#!/bin/bash
# Gateway performance load test using wrk
# Usage: ./load-test-gateway.sh [url] [duration] [threads] [connections]
#   url        - target URL (default: http://localhost:8080)
#   duration   - test duration in seconds (default: 30)
#   threads    - number of wrk threads (default: 4)
#   connections - number of concurrent connections (default: 100)

URL="${1:-http://localhost:8080}"
DURATION="${2:-30}"
THREADS="${3:-4}"
CONNECTIONS="${4:-100}"

echo "========================================="
echo " Gateway Performance Load Test"
echo "========================================="
echo "Target URL:  ${URL}"
echo "Duration:    ${DURATION}s"
echo "Threads:     ${THREADS}"
echo "Connections: ${CONNECTIONS}"
echo "========================================="

wrk -t"$THREADS" -c"$CONNECTIONS" -d"${DURATION}s" --timeout 5s \
  -s <(echo '
    wrk.method = "POST"
    wrk.body   = "{\"userId\":123,\"items\":[{\"id\":\"sku1\",\"qty\":2}],\"data\":{\"token\":\"test-token-xyz\",\"rate_count\":0}}"
    wrk.headers["Content-Type"] = "application/json"
  ') "${URL}/api/order"
