#!/bin/bash
# Usage: benchmark.sh <target-url> <duration-sec>
wrk -t4 -c100 -d${2:-30}s --latency $1
