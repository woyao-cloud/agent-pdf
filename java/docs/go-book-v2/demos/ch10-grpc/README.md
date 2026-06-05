# gRPC 微服务通信 Demo

使用 Go + gRPC + etcd 构建的订单-库存微服务示例，演示服务注册发现与 gRPC 服务间通信。

## 架构

```
client (gRPC 客户端)
  │
  ▼
order-server (:50051) ──gRPC──► stock-server (:50052)
  │                              │
  └────── etcd (:2379) ◄─────────┘
```

## 启动

前置条件：安装 Docker 和 Docker Compose。

```bash
# 一键启动所有服务
docker-compose up --build

# 观察日志输出，client 容器会自动执行创建订单测试
```

启动后 client 容器会自动执行以下操作：

1. 通过 gRPC 调用 order-server 创建订单
2. order-server 内部通过服务发现从 etcd 找到 stock-server 地址
3. order-server 调用 stock-server 扣减库存
4. 返回订单创建结果
5. 客户端打印订单状态

## 测试预期输出

```
[client] >>> 创建订单: user=u001, product=p001, quantity=2
[order]  ... 发现库存服务: stock-server:50052
[stock]  ... 扣减成功: 商品 p001, 数量 2, 剩余 98
[client] <<< 订单创建成功: order_id=ORD_...

[client] >>> 创建订单: user=u002, product=p001, quantity=999（期望库存不足）
[client] <<< 订单创建失败（库存不足）—— 符合预期
```

## 清理

```bash
docker-compose down
```

## 文件说明

```
demos/ch10-grpc/
├── proto/order.proto        # Protocol Buffers IDL 定义
├── gen.sh                   # protoc 代码生成脚本
├── pb/                      # 手写的 pb 包（替代 protoc 生成）
│   ├── order.pb.go          # 消息结构体
│   └── order_grpc.pb.go     # gRPC 服务接口 + JSON 编解码
├── order-server/            # 订单服务
│   ├── main.go              # 入口 + etcd 注册
│   └── service.go           # 订单业务逻辑
├── stock-server/            # 库存服务
│   ├── main.go              # 入口 + etcd 注册
│   └── service.go           # 库存扣减逻辑
├── client/                  # 客户端测试
│   └── main.go              # 发起创建订单请求
├── docker-compose.yml       # 编排所有服务
├── Dockerfile               # 每个子目录有独立的 Dockerfile
└── README.md                # 本文件
```

## 关键技术点

- 使用 gRPC 自定义 JSON Codec（无需 protoc 编译环境）
- 服务启动自动注册到 etcd（带 TTL 租约）
- 服务间通过 etcd 发现调用地址
- 优雅关闭时自动从 etcd 注销
- 演示了 gRPC Unary RPC 的完整调用流程