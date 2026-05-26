#!/bin/bash
PID=$1
echo "=== Arthas Deadlock Diagnosis ==="
echo "Target PID: $PID"
echo "thread -b" | java -jar /opt/arthas-boot.jar "$PID" &
sleep 5
kill %1 2>/dev/null
