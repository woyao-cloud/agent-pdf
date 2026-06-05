// Package pb 包含 proto/order.proto 定义的消息类型和服务接口。
// 代码为手写实现，使用 gRPC + JSON 编码（替代 protoc 生成的 proto 编码），
// 可编译运行。生产环境应使用 protoc 生成。
package pb

// ---------- 消息结构体 ----------

type CreateOrderRequest struct {
	UserId    string `json:"user_id"`
	ProductId string `json:"product_id"`
	Quantity  int32  `json:"quantity"`
}

type CreateOrderResponse struct {
	OrderId string `json:"order_id"`
	Success bool   `json:"success"`
}

type GetOrderRequest struct {
	OrderId string `json:"order_id"`
}

type GetOrderResponse struct {
	OrderId string `json:"order_id"`
	Status  string `json:"status"`
}

type DeductStockRequest struct {
	ProductId string `json:"product_id"`
	Quantity  int32  `json:"quantity"`
}

type DeductStockResponse struct {
	Success bool `json:"success"`
}