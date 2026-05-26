#!/bin/bash
# ===========================================================
# run-zgc-test.sh — ZGC Configuration Comparison Runner
# ===========================================================
# Usage:
#   ./run-zgc-test.sh [mode]
#
# Modes:
#   default  — Default ZGC (-XX:+UseZGC)
#   tuned    — Tuned ZGC (ConcGCThreads, ZAllocationSpikeTolerance, THP)
#   gen      — Generational ZGC (-XX:+UseZGC -XX:+ZGenerational)
#   all      — Run all three configurations sequentially
#
# Each run produces a separate GC log under:
#   /workspace/cases/comprehensive/case03-bigmem/gc-<mode>.log
#
# NUMA binding (example, uncomment if running on multi-socket hardware):
#   numactl --cpunodebind=0 --membind=0 java ...
#
# For 128 GB heap demonstration (requires real hardware):
#   -Xmx128g -Xms128g -XX:ConcGCThreads=8 -XX:ZAllocationSpikeTolerance=3.0
#   numactl --cpunodebind=0 --membind=0
# ===========================================================

JAR="/workspace/cases/comprehensive/case03-bigmem/target/case03-bigmem-1.0-SNAPSHOT.jar"
BASE_DIR="/workspace/cases/comprehensive/case03-bigmem"

# Ensure the jar is built
if [ ! -f "$JAR" ]; then
  echo "[ERROR] JAR not found at $JAR"
  echo "        Run: mvn package -pl cases/comprehensive/case03-bigmem -am"
  exit 1
fi

run_default() {
  echo ""
  echo "============================================"
  echo " Mode: default — ZGC (default settings)"
  echo "============================================"
  java -XX:+UseZGC \
       -Xmx4g -Xms4g \
       -Xlog:gc*:file="${BASE_DIR}/gc-default.log" \
       -cp "$JAR" com.jvmbook.case03.BigMemoryProcessor
}

run_tuned() {
  echo ""
  echo "============================================"
  echo " Mode: tuned — ZGC with tuning parameters"
  echo "============================================"
  java -XX:+UseZGC \
       -Xmx4g -Xms4g \
       -XX:ConcGCThreads=4 \
       -XX:ZAllocationSpikeTolerance=3.0 \
       -XX:+UseTransparentHugePages \
       -Xlog:gc*:file="${BASE_DIR}/gc-tuned.log" \
       -cp "$JAR" com.jvmbook.case03.BigMemoryProcessor
}

run_gen() {
  echo ""
  echo "============================================"
  echo " Mode: gen — Generational ZGC"
  echo "============================================"
  java -XX:+UseZGC -XX:+ZGenerational \
       -Xmx4g -Xms4g \
       -Xlog:gc*:file="${BASE_DIR}/gc-gen.log" \
       -cp "$JAR" com.jvmbook.case03.BigMemoryProcessor
}

case "${1:-default}" in
  tuned)
    run_tuned
    ;;
  gen)
    run_gen
    ;;
  all)
    run_default
    echo ""
    echo "--- Waiting 3 seconds before next run ---"
    sleep 3
    run_tuned
    echo ""
    echo "--- Waiting 3 seconds before next run ---"
    sleep 3
    run_gen
    ;;
  *)
    run_default
    ;;
esac
