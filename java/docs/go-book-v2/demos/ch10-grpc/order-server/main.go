package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go-book/demo/grpc/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	clientv3 "go.etcd.io/etcd/client/v3"
)

const (
	port     = ":50051"
	etcdAddr = "etcd:2379" // docker-compose 网络中的 etcd 地址
)

func main() {
	// 1. 初始化 etcd 客户端用于服务注册
	etcdClient, err := clientv3.New(clientv3.Config{
		Endpoints:   []string{etcdAddr},
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		log.Fatalf("连接 etcd 失败: %v", err)
	}
	defer etcdClient.Close()

	// 2. 注册当前服务到 etcd
	serviceKey := "/services/order/instance1"
	serviceValue := "order-server:50051"
	if err := registerService(etcdClient, serviceKey, serviceValue, 10); err != nil {
		log.Fatalf("服务注册失败: %v", err)
	}
	log.Printf("服务已注册到 etcd: %s -> %s", serviceKey, serviceValue)

	// 3. 创建 gRPC 服务器
	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("监听端口失败: %v", err)
	}

	// 使用 JSON 编码的 gRPC 服务器（无需 protoc 生成代码）
	grpcServer := grpc.NewServer(pb.ForceJSONCodec())
	reflection.Register(grpcServer)

	// 4. 注册 OrderService 实现
	orderSvc := NewOrderService(etcdClient)
	pb.RegisterOrderService(grpcServer, orderSvc)

	// 5. 优雅退出
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Println("正在关闭服务器...")
		deregisterService(etcdClient, serviceKey)
		grpcServer.GracefulStop()
	}()

	log.Printf("OrderService gRPC 服务器启动在 %s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}

// registerService 将当前服务的地址注册到 etcd，并绑定租约
func registerService(cli *clientv3.Client, key, value string, ttl int64) error {
	resp, err := cli.Grant(context.Background(), ttl)
	if err != nil {
		return err
	}

	_, err = cli.Put(context.Background(), key, value, clientv3.WithLease(resp.ID))
	if err != nil {
		return err
	}

	// 后台定期续约
	ch, err := cli.KeepAlive(context.Background(), resp.ID)
	if err != nil {
		return err
	}

	go func() {
		for range ch {
			// 续约成功，不做额外处理
		}
	}()

	return nil
}

// deregisterService 从 etcd 注销服务
func deregisterService(cli *clientv3.Client, key string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cli.Delete(ctx, key)
	log.Printf("服务已从 etcd 注销: %s", key)
}