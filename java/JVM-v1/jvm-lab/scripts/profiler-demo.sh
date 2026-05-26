#!/bin/bash
PID=$1
MODE=${2:-cpu}
DURATION=${3:-30}
OUTPUT_DIR="/workspace/cases/ch03-async-profiler"
OUTPUT_FILE="$OUTPUT_DIR/profile-${MODE}.html"

echo "Starting async-profiler (mode=$MODE) for PID=$PID, duration=${DURATION}s"
profiler.sh -e "$MODE" -d "$DURATION" -f "$OUTPUT_FILE" "$PID"
echo "Flame graph saved to $OUTPUT_FILE"
