#!/bin/bash
# 代码生成脚本：使用 protoc 编译 proto 文件
# 需要安装 protoc 和 protoc-gen-go-grpc

protoc --go_out=. --go-grpc_out=. proto/order.proto