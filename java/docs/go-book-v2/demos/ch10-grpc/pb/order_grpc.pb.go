package pb

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/encoding"
)

// ---------- 自定义 JSON Codec (替代 protobuf 序列化) ----------

type jsonCodec struct{}

func (jsonCodec) Marshal(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

func (jsonCodec) Unmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

func (jsonCodec) Name() string {
	return "json"
}

func init() {
	encoding.RegisterCodec(jsonCodec{})
}

// ForceJSONCodec 返回一个 gRPC ServerOption / DialOption，
// 强制使用 JSON 编码。在 grpc.Dial / grpc.NewServer 中使用。
func ForceJSONCodec() grpc.ServerOption {
	return grpc.ForceCodec(jsonCodec{})
}

// ForceJSONCodecClient 返回客户端 DialOption
func ForceJSONCodecClient() grpc.DialOption {
	return grpc.ForceCodec(jsonCodec{})
}

// ---------- 服务名称 ----------

const (
	OrderServiceName = "order.OrderService"
	StockServiceName = "order.StockService"
)

// ---------- OrderService 服务端接口 ----------

type OrderServiceServer interface {
	CreateOrder(ctx context.Context, req *CreateOrderRequest) (*CreateOrderResponse, error)
	GetOrder(ctx context.Context, req *GetOrderRequest) (*GetOrderResponse, error)
}

// RegisterOrderService 将 OrderService 注册到 gRPC 服务器
func RegisterOrderService(s grpc.ServiceRegistrar, srv OrderServiceServer) {
	s.RegisterService(&OrderService_ServiceDesc, srv)
}

// OrderService_ServiceDesc gRPC 服务描述
var OrderService_ServiceDesc = grpc.ServiceDesc{
	ServiceName: OrderServiceName,
	HandlerType: (*OrderServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "CreateOrder",
			Handler: func(srv interface{}, ctx context.Context,
				dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {

				in := new(CreateOrderRequest)
				if err := dec(in); err != nil {
					return nil, err
				}
				if interceptor == nil {
					return srv.(OrderServiceServer).CreateOrder(ctx, in)
				}
				info := &grpc.UnaryServerInfo{
					Server:     srv,
					FullMethod: "/" + OrderServiceName + "/CreateOrder",
				}
				handler := func(ctx context.Context, req interface{}) (interface{}, error) {
					return srv.(OrderServiceServer).CreateOrder(ctx, req.(*CreateOrderRequest))
				}
				return interceptor(ctx, in, info, handler)
			},
		},
		{
			MethodName: "GetOrder",
			Handler: func(srv interface{}, ctx context.Context,
				dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {

				in := new(GetOrderRequest)
				if err := dec(in); err != nil {
					return nil, err
				}
				if interceptor == nil {
					return srv.(OrderServiceServer).GetOrder(ctx, in)
				}
				info := &grpc.UnaryServerInfo{
					Server:     srv,
					FullMethod: "/" + OrderServiceName + "/GetOrder",
				}
				handler := func(ctx context.Context, req interface{}) (interface{}, error) {
					return srv.(OrderServiceServer).GetOrder(ctx, req.(*GetOrderRequest))
				}
				return interceptor(ctx, in, info, handler)
			},
		},
	},
	Streams: []grpc.StreamDesc{},
}

// ---------- OrderService 客户端接口 ----------

type OrderServiceClient interface {
	CreateOrder(ctx context.Context, req *CreateOrderRequest) (*CreateOrderResponse, error)
	GetOrder(ctx context.Context, req *GetOrderRequest) (*GetOrderResponse, error)
}

type orderServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewOrderServiceClient(cc grpc.ClientConnInterface) OrderServiceClient {
	return &orderServiceClient{cc: cc}
}

func (c *orderServiceClient) CreateOrder(ctx context.Context, req *CreateOrderRequest) (*CreateOrderResponse, error) {
	out := new(CreateOrderResponse)
	err := c.cc.Invoke(ctx, "/"+OrderServiceName+"/CreateOrder", req, out)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *orderServiceClient) GetOrder(ctx context.Context, req *GetOrderRequest) (*GetOrderResponse, error) {
	out := new(GetOrderResponse)
	err := c.cc.Invoke(ctx, "/"+OrderServiceName+"/GetOrder", req, out)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ---------- StockService 服务端接口 ----------

type StockServiceServer interface {
	DeductStock(ctx context.Context, req *DeductStockRequest) (*DeductStockResponse, error)
}

func RegisterStockService(s grpc.ServiceRegistrar, srv StockServiceServer) {
	s.RegisterService(&StockService_ServiceDesc, srv)
}

var StockService_ServiceDesc = grpc.ServiceDesc{
	ServiceName: StockServiceName,
	HandlerType: (*StockServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "DeductStock",
			Handler: func(srv interface{}, ctx context.Context,
				dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {

				in := new(DeductStockRequest)
				if err := dec(in); err != nil {
					return nil, err
				}
				if interceptor == nil {
					return srv.(StockServiceServer).DeductStock(ctx, in)
				}
				info := &grpc.UnaryServerInfo{
					Server:     srv,
					FullMethod: "/" + StockServiceName + "/DeductStock",
				}
				handler := func(ctx context.Context, req interface{}) (interface{}, error) {
					return srv.(StockServiceServer).DeductStock(ctx, req.(*DeductStockRequest))
				}
				return interceptor(ctx, in, info, handler)
			},
		},
	},
	Streams: []grpc.StreamDesc{},
}

// ---------- StockService 客户端接口 ----------

type StockServiceClient interface {
	DeductStock(ctx context.Context, req *DeductStockRequest) (*DeductStockResponse, error)
}

type stockServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewStockServiceClient(cc grpc.ClientConnInterface) StockServiceClient {
	return &stockServiceClient{cc: cc}
}

func (c *stockServiceClient) DeductStock(ctx context.Context, req *DeductStockRequest) (*DeductStockResponse, error) {
	out := new(DeductStockResponse)
	err := c.cc.Invoke(ctx, "/"+StockServiceName+"/DeductStock", req, out)
	if err != nil {
		return nil, fmt.Errorf("扣减库存失败: %w", err)
	}
	return out, nil
}