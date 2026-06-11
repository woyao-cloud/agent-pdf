#!/bin/bash
# 模拟 MySQL 查询流量
echo "Generating simulated MySQL queries..."
for i in $(seq 1 100); do
    echo "SELECT * FROM users WHERE id = $i" | mysql -h localhost -u root -ppassword 2>/dev/null &
    sleep 0.1
done
wait
echo "Done."