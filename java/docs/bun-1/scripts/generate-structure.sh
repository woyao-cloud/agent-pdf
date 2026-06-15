#!/bin/bash
# Generate the directory skeleton for the Bun book
# Run from docs/bun-1/

DIRS=(
  ch01-environment
  ch02-core-identity
  ch03-package-manager
  ch04-bundler
  ch05-test-runner
  ch06-bun-file
  ch07-bun-sqlite
  ch08-macros
  ch09-ffi
  ch10-edge-htmlrewriter
  ch11-jsc-vs-v8
  ch12-zig
  ch13-event-loop
  ch14-web-frameworks
  ch15-database-orm
  ch16-container-deploy
  ch17-compatibility
  ch18-migration-checklist
  ch19-performance-tuning
  ch20-future
  scripts
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
done

echo "All directories created successfully."
