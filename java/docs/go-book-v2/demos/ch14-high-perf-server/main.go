package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"go-book/demo/high-perf/pkg/circuit"
	"go-book/demo/high-perf/pkg/limiter"
	"go-book/demo/high-perf/pkg/middle"
	"go-book/demo/high-perf/pkg/pool"
)

// Config 网关配置
type Config struct {
	GatewayAddr      string        // 网关监听地址
	UpstreamBaseURL  string        // 上游服务基础URL（仅演示用）
	RateLimitPerSec  float64       // 每秒每个IP允许的请求数
	RateBurst        float64       // 令牌桶容量
	BreakerThreshold int           // 熔断失败阈值
	BreakerTimeout   time.Duration // 熔断超时
	PoolMaxIdle      int           // 连接池最大空闲连接数
	RequestTimeout   time.Duration // 上游请求超时
	PprofAddr        string        // pprof监听地址
}

// Stats 网关统计指标
type Stats struct {
	RequestsTotal    int64
	RequestsRejected int64 // 被限流拒绝的请求数
	RequestsFailed   int64 // 请求失败的次数
}

// Gateway API网关
type Gateway struct {
	config    *Config
	pool      *pool.ConnPool
	limiter   *limiter.IPLimiter
	breaker   *circuit.Breaker
	transport *http.Transport
	stats     Stats
}

// NewGateway 创建网关实例
func NewGateway(cfg *Config) *Gateway {
	// 创建连接池
	connPool := pool.New(cfg.PoolMaxIdle, func() (net.Conn, error) {
		return net.DialTimeout("tcp", cfg.UpstreamBaseURL, cfg.RequestTimeout)
	})

	// 创建IP限流器
	ipLimiter := limiter.NewIPLimiter(cfg.RateLimitPerSec, cfg.RateBurst)

	// 创建熔断器
	cb := circuit.New(cfg.BreakerThreshold, cfg.BreakerTimeout)

	return &Gateway{
		config:  cfg,
		pool:    connPool,
		limiter: ipLimiter,
		breaker: cb,
		transport: &http.Transport{
			MaxIdleConns:        cfg.PoolMaxIdle,
			MaxIdleConnsPerHost: cfg.PoolMaxIdle,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  true,
		},
	}
}

// Router 返回网关的HTTP路由器
func (g *Gateway) Router() http.Handler {
	mux := http.NewServeMux()

	// 健康检查端点
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","message":"Gateway is running"}`))
	})

	// 上游代理端点
	mux.HandleFunc("/api/", g.proxyHandler())

	// 统计信息端点
	mux.HandleFunc("/stats", g.statsHandler())

	// 中间件链
	var handler http.Handler = mux
	handler = middle.Logging(handler)

	return handler
}

// proxyHandler 返回上游代理处理函数
func (g *Gateway) proxyHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		clientIP := extractIP(r)

		// 1. 限流检查
		if !g.limiter.Allow(clientIP) {
			atomic.AddInt64(&g.stats.RequestsRejected, 1)
			http.Error(w, "429 Too Many Requests", http.StatusTooManyRequests)
			return
		}

		// 2. 熔断器保护下调用上游
		err := g.breaker.Call(func() error {
			return g.callUpstream(w, r)
		})

		atomic.AddInt64(&g.stats.RequestsTotal, 1)

		if err != nil {
			atomic.AddInt64(&g.stats.RequestsFailed, 1)
			if err == circuit.ErrCircuitOpen {
				http.Error(w, "503 Service Unavailable (circuit open)", http.StatusServiceUnavailable)
			} else {
				http.Error(w, "502 Bad Gateway", http.StatusBadGateway)
			}
			return
		}

		// 记录请求耗时（实际项目中使用异步队列）
		_ = time.Since(start)
	}
}

// callUpstream 调用上游服务
// 在完整实现中，这里会代理请求到实际的上游服务
// 当前演示版本返回模拟数据
func (g *Gateway) callUpstream(w http.ResponseWriter, r *http.Request) error {
	// 模拟上游调用
	// 在实际场景中，这里会使用 g.transport.RoundTrip() 转发请求

	// 演示效果：模拟一个耗时和可能失败的上游服务
	time.Sleep(time.Duration(5+int64(r.Context().Value("delay")!=nil)*10)) // nolint

	// 模拟上游响应
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := fmt.Sprintf(`{"message":"OK","path":"%s"}`, r.URL.Path)
	w.Write([]byte(response))

	return nil
}

// statsHandler 返回统计信息
func (g *Gateway) statsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		state, failures := g.breaker.Stats()
		fmt.Fprintf(w, `{
	"requests_total": %d,
	"requests_rejected": %d,
	"requests_failed": %d,
	"breaker_state": "%s",
	"breaker_failures": %d,
	"pool_idle": %d
}`,
			atomic.LoadInt64(&g.stats.RequestsTotal),
			atomic.LoadInt64(&g.stats.RequestsRejected),
			atomic.LoadInt64(&g.stats.RequestsFailed),
			circuit.StateString(state),
			failures,
			g.pool.Len(),
		)
	}
}

// extractIP 从请求中提取客户端IP
func extractIP(r *http.Request) string {
	// 优先从X-Forwarded-For头获取
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	// 从RemoteAddr提取
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}

// loadConfig 从命令行参数加载配置
func loadConfig() *Config {
	cfg := &Config{}

	flag.StringVar(&cfg.GatewayAddr, "addr", ":8080", "Gateway listen address")
	flag.StringVar(&cfg.UpstreamBaseURL, "upstream", "localhost:9091", "Upstream service address")
	flag.Float64Var(&cfg.RateLimitPerSec, "rate", 100.0, "Rate limit per IP (requests/sec)")
	flag.Float64Var(&cfg.RateBurst, "burst", 200.0, "Rate limit burst capacity")
	flag.IntVar(&cfg.BreakerThreshold, "breaker-threshold", 5, "Circuit breaker failure threshold")
	flag.DurationVar(&cfg.BreakerTimeout, "breaker-timeout", 10*time.Second, "Circuit breaker timeout")
	flag.IntVar(&cfg.PoolMaxIdle, "pool-idle", 50, "Connection pool max idle")
	flag.DurationVar(&cfg.RequestTimeout, "timeout", 5*time.Second, "Request timeout")
	flag.StringVar(&cfg.PprofAddr, "pprof-addr", ":6060", "pprof listen address")
	flag.Parse()

	return cfg
}

func main() {
	cfg := loadConfig()

	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds | log.Lshortfile)
	log.Printf("Starting API Gateway on %s", cfg.GatewayAddr)
	log.Printf("Config: rate=%.1f/s burst=%.0f breaker=thresh:%d/timeout:%v pool=%d",
		cfg.RateLimitPerSec, cfg.RateBurst, cfg.BreakerThreshold, cfg.BreakerTimeout, cfg.PoolMaxIdle)

	// 创建网关
	gateway := NewGateway(cfg)

	// 启动pprof服务器（独立的goroutine，不影响主服务）
	go func() {
		pprofMux := http.NewServeMux()
		middle.RegisterPprof(pprofMux)
		pprofMux.Handle("/metrics", middle.MetricsHandler())
		log.Printf("pprof server listening on %s", cfg.PprofAddr)
		if err := http.ListenAndServe(cfg.PprofAddr, pprofMux); err != nil {
			log.Fatalf("pprof server error: %v", err)
		}
	}()

	// 启动IP限流器自动清理（每5分钟清理一次不活跃的限流记录）
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			gateway.limiter.Cleanup(30 * time.Minute)
		}
	}()

	// 启动连接池空闲连接清理（每10分钟清理超过5分钟未使用的连接）
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			gateway.pool.CleanIdle(5 * time.Minute)
		}
	}()

	// 启动HTTP服务器
	srv := &http.Server{
		Addr:         cfg.GatewayAddr,
		Handler:      gateway.Router(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// 优雅关闭
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down gateway...")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Fatalf("Gateway shutdown error: %v", err)
		}
		gateway.pool.Close()
		log.Println("Gateway stopped.")
	}()

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Gateway error: %v", err)
	}

	// 模拟上游服务（用于演示）
	go startMockUpstream(":9091")
}

// startMockUpstream 启动一个模拟的上游服务用于演示
func startMockUpstream(addr string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// 模拟处理延迟
		time.Sleep(time.Duration(2+int64(r.URL.Query().Get("delay") == "true")*10)) // nolint
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"service":"mock-upstream","status":"ok"}`))
	})

	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	log.Printf("Mock upstream service listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		// 端口被占用忽略（用于测试时重复启动）
		if !strings.Contains(err.Error(), "address already in use") {
			log.Printf("Mock upstream error: %v", err)
		}
	}
}

// 确保io包被使用（main.go中当前未直接引用，但proxyHandler未来会用到）
var _ = io.Discard