package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go-book/demo/grpc/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	clientv3 "go.etcd.io/etcd/client/v3"
)

// OrderService 是 pb.OrderServiceServer 的实现
type OrderService struct {
	etcdClient *clientv3.Client
	orders     map[string]*orderInfo // 模拟内存数据库
}

type orderInfo struct {
	UserId    string
	ProductId string
	Quantity  int32
	Status    string
}

func NewOrderService(etcdClient *clientv3.Client) *OrderService {
	return &OrderService{
		etcdClient: etcdClient,
		orders:     make(map[string]*orderInfo),
	}
}

// CreateOrder 创建订单，同时调用库存服务扣减库存
func (s *OrderService) CreateOrder(ctx context.Context, req *pb.CreateOrderRequest) (*pb.CreateOrderResponse, error) {
	orderID := fmt.Sprintf("ORD_%d", time.Now().UnixMilli())

	log.Printf("[订单服务] 收到创建订单请求: user=%s product=%s quantity=%d",
		req.UserId, req.ProductId, req.Quantity)

	// 1. 调用库存服务扣减库存
	if err := s.deductStock(ctx, req.ProductId, req.Quantity); err != nil {
		log.Printf("[订单服务] 扣减库存失败: %v", err)
		return &pb.CreateOrderResponse{
			OrderId: "",
			Success: false,
		}, nil
	}
	log.Printf("[订单服务] 库存扣减成功")

	// 2. 保存订单（模拟数据库）
	s.orders[orderID] = &orderInfo{
		UserId:    req.UserId,
		ProductId: req.ProductId,
		Quantity:  req.Quantity,
		Status:    "created",
	}

	log.Printf("[订单服务] 订单创建成功: %s", orderID)
	return &pb.CreateOrderResponse{
		OrderId: orderID,
		Success: true,
	}, nil
}

// GetOrder 查询订单
func (s *OrderService) GetOrder(ctx context.Context, req *pb.GetOrderRequest) (*pb.GetOrderResponse, error) {
	order, exists := s.orders[req.OrderId]
	if !exists {
		return &pb.GetOrderResponse{
			OrderId: req.OrderId,
			Status:  "not_found",
		}, nil
	}

	return &pb.GetOrderResponse{
		OrderId: req.OrderId,
		Status:  order.Status,
	}, nil
}

// deductStock 通过服务发现从 etcd 获取库存服务地址，然后调用扣减库存
func (s *OrderService) deductStock(ctx context.Context, productID string, quantity int32) error {
	// 1. 从 etcd 发现库存服务地址
	resp, err := s.etcdClient.Get(ctx, "/services/stock/", clientv3.WithPrefix())
	if err != nil {
		return fmt.Errorf("发现库存服务失败: %w", err)
	}

	if len(resp.Kvs) == 0 {
		return fmt.Errorf("未发现库存服务实例")
	}

	// 取第一个可用实例
	stockAddr := string(resp.Kvs[0].Value)
	log.Printf("[订单服务] 发现库存服务: %s", stockAddr)

	// 2. 连接到库存服务并扣减库存
	conn, err := grpc.DialContext(ctx, stockAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		pb.ForceJSONCodecClient())
	if err != nil {
		return fmt.Errorf("连接库存服务失败: %w", err)
	}
	defer conn.Close()

	stockClient := pb.NewStockServiceClient(conn)
	stockResp, err := stockClient.DeductStock(ctx, &pb.DeductStockRequest{
		ProductId: productID,
		Quantity:  quantity,
	})
	if err != nil {
		return fmt.Errorf("扣减库存 RPC 调用失败: %w", err)
	}
	if !stockResp.Success {
		return fmt.Errorf("库存扣减失败：库存不足")
	}

	return nil
}