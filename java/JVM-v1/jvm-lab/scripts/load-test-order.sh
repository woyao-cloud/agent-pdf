#!/bin/bash
# Load test for the flash-sale order service using k6
# Usage: ./load-test-order.sh [url] [duration]
#   url       - target URL (default: http://localhost:8080)
#   duration  - test duration in seconds (default: 60)

URL="${1:-http://localhost:8080}"
DURATION="${2:-60}"

k6 run --vus 50 --duration "${DURATION}s" -e URL="${URL}" - <<'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export default function () {
    const userId = Math.floor(Math.random() * 10000);
    const amount = (Math.random() * 1000).toFixed(2);
    const items = Math.floor(Math.random() * 5) + 1;

    const params = {
        userId: userId.toString(),
        amount: amount,
        items: items.toString(),
    };

    const res = http.post(`${__ENV.URL || "http://localhost:8080"}/order`, params);

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response has ok status': (r) => {
            try {
                return JSON.parse(r.body).status === 'ok';
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.1);
}
EOF
