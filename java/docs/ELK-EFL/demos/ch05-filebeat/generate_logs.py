#!/usr/bin/env python3
import json, time, random

LOG_FILE = "/logs/app-logs.json.log"

LOG_TEMPLATES = [
    '{"@timestamp":"%s","level":"INFO","message":"订单创建成功, orderId=ORD-%d","serviceName":"order-service","traceId":"trace-%d","userId":"user-%d"}',
    '{"@timestamp":"%s","level":"INFO","message":"调用支付服务, amount=%d","serviceName":"order-service","traceId":"trace-%d"}',
    '{"@timestamp":"%s","level":"INFO","message":"支付成功, transactionId=TXN-%d","serviceName":"payment-service","traceId":"trace-%d"}',
    '{"@timestamp":"%s","level":"ERROR","message":"库存扣减失败","serviceName":"stock-service","traceId":"trace-%d","stack_trace":"RuntimeException: 库存不足"}',
]

while True:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    template = random.choice(LOG_TEMPLATES)
    rand = random.randint(1000, 99999)
    line = template % (ts, rand, rand, rand)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")
    time.sleep(5)