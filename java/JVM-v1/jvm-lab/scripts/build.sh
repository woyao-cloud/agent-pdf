#!/bin/bash
cd /workspace/cases
mvn clean package -DskipTests
echo "Build complete."
