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
	port     = ":50052"
	etcdAddr = "etcd:2379"
)

func main() {
	// 1. 连接 etcd 注册服务
	etcdClient, err := clientv3.New(clientv3.Config{
		Endpoints:   []string{etcdAddr},
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		log.Fatalf("连接 etcd 失败: %v", err)
	}
	defer etcdClient.Close()

	// 2. 注册库存服务到 etcd
	serviceKey := "/services/stock/instance1"
	serviceValue := "stock-server:50052"
	if err := registerService(etcdClient, serviceKey, serviceValue, 10); err != nil {
		log.Fatalf("服务注册失败: %v", err)
	}
	log.Printf("库存服务已注册到 etcd: %s -> %s", serviceKey, serviceValue)

	// 3. 创建 gRPC 服务器
	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("监听端口失败: %v", err)
	}

	grpcServer := grpc.NewServer(pb.ForceJSONCodec())
	reflection.Register(grpcServer)

	// 4. 注册 StockService 实现
	stockSvc := NewStockService()
	pb.RegisterStockService(grpcServer, stockSvc)

	// 5. 优雅退出
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Println("正在关闭库存服务...")
		deregisterService(etcdClient, serviceKey)
		grpcServer.GracefulStop()
	}()

	log.Printf("StockService gRPC 服务器启动在 %s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}

func registerService(cli *clientv3.Client, key, value string, ttl int64) error {
	resp, err := cli.Grant(context.Background(), ttl)
	if err != nil {
		return err
	}
	_, err = cli.Put(context.Background(), key, value, clientv3.WithLease(resp.ID))
	if err != nil {
		return err
	}
	ch, err := cli.KeepAlive(context.Background(), resp.ID)
	if err != nil {
		return err
	}
	go func() {
		for range ch {
		}
	}()
	return nil
}

func deregisterService(cli *clientv3.Client, key string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cli.Delete(ctx, key)
	log.Printf("库存服务已从 etcd 注销: %s", key)
}