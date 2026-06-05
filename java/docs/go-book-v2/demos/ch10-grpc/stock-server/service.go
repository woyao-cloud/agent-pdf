package main

import (
	"context"
	"log"
	"sync"

	"go-book/demo/grpc/pb"
)

// StockService 是 pb.StockServiceServer 的实现
type StockService struct {
	mu     sync.Mutex
	stock  map[string]int32 // 模拟商品库存
}

// NewStockService 初始化库存，预设一些商品
func NewStockService() *StockService {
	return &StockService{
		stock: map[string]int32{
			"p001": 100, // 商品 p001 初始库存 100
			"p002": 50,  // 商品 p002 初始库存 50
		},
	}
}

// DeductStock 扣减商品库存
func (s *StockService) DeductStock(ctx context.Context, req *pb.DeductStockRequest) (*pb.DeductStockResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	currentStock, exists := s.stock[req.ProductId]
	if !exists {
		log.Printf("[库存服务] 商品 %s 不存在", req.ProductId)
		return &pb.DeductStockResponse{Success: false}, nil
	}

	if currentStock < req.Quantity {
		log.Printf("[库存服务] 商品 %s 库存不足: 当前 %d, 请求 %d",
			req.ProductId, currentStock, req.Quantity)
		return &pb.DeductStockResponse{Success: false}, nil
	}

	// 扣减库存
	s.stock[req.ProductId] = currentStock - req.Quantity
	log.Printf("[库存服务] 扣减成功: 商品 %s, 数量 %d, 剩余 %d",
		req.ProductId, req.Quantity, s.stock[req.ProductId])

	return &pb.DeductStockResponse{Success: true}, nil
}