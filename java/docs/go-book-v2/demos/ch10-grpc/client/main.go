package main

import (
	"context"
	"log"
	"time"

	"go-book/demo/grpc/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const (
	orderServiceAddr = "order-server:50051"
)

func main() {
	log.Println("==============================")
	log.Println("  gRPC 微服务 Demo 客户端")
	log.Println("==============================")

	// 1. 连接到订单服务
	conn, err := grpc.DialContext(context.Background(), orderServiceAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		pb.ForceJSONCodecClient())
	if err != nil {
		log.Fatalf("连接订单服务失败: %v", err)
	}
	defer conn.Close()

	orderClient := pb.NewOrderServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 2. 创建订单（商品 p001，数量 2）
	log.Println(">>> 创建订单: user=u001, product=p001, quantity=2")
	createResp, err := orderClient.CreateOrder(ctx, &pb.CreateOrderRequest{
		UserId:    "u001",
		ProductId: "p001",
		Quantity:  2,
	})
	if err != nil {
		log.Fatalf("创建订单失败: %v", err)
	}

	if createResp.Success {
		log.Printf("<<< 订单创建成功: order_id=%s", createResp.OrderId)

		// 3. 查询刚创建的订单
		log.Printf(">>> 查询订单: order_id=%s", createResp.OrderId)
		getResp, err := orderClient.GetOrder(ctx, &pb.GetOrderRequest{
			OrderId: createResp.OrderId,
		})
		if err != nil {
			log.Fatalf("查询订单失败: %v", err)
		}
		log.Printf("<<< 订单状态: id=%s, status=%s", getResp.OrderId, getResp.Status)
	} else {
		log.Println("<<< 订单创建失败（可能库存不足）")
	}

	// 4. 尝试创建另一个订单（商品 p001，数量 999，期望库存不足）
	log.Println(">>> 创建订单: user=u002, product=p001, quantity=999（期望库存不足）")
	createResp2, err := orderClient.CreateOrder(ctx, &pb.CreateOrderRequest{
		UserId:    "u002",
		ProductId: "p001",
		Quantity:  999,
	})
	if err != nil {
		log.Fatalf("创建订单失败: %v", err)
	}
	if createResp2.Success {
		log.Printf("<<< 订单创建成功: order_id=%s", createResp2.OrderId)
	} else {
		log.Println("<<< 订单创建失败（库存不足）—— 符合预期")
	}

	log.Println("==============================")
	log.Println("  Demo 运行完成")
	log.Println("==============================")
}