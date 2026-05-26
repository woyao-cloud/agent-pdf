#!/bin/bash
PID=$1
DURATION=${2:-60}
OUTPUT="/workspace/cases/ch02-jfr/recording.jfr"

echo "Starting JFR recording for PID=$PID, duration=${DURATION}s"
jcmd "$PID" JFR.start name=demo duration="${DURATION}s" filename="$OUTPUT" settings=profile
echo "Recording saved to $OUTPUT"

echo ""
echo "Manual control alternative:"
echo "  jcmd $PID JFR.start name=demo settings=profile"
echo "  sleep $DURATION"
echo "  jcmd $PID JFR.dump name=demo filename=$OUTPUT"
echo "  jcmd $PID JFR.stop name=demo"
