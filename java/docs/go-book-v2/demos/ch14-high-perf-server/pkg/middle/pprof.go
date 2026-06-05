package middle

import (
	"net/http"
	"net/http/pprof"
)

// RegisterPprof 将pprof端点注册到指定的ServeMux
// pprof是Go标准库自带的性能分析工具，提供CPU、内存、goroutine等采样数据
//
// 端点列表：
//   /debug/pprof/          - pprof主页
//   /debug/pprof/heap      - 堆内存分配
//   /debug/pprof/goroutine - 所有goroutine堆栈
//   /debug/pprof/profile   - CPU采样（默认30秒）
//   /debug/pprof/block     - 阻塞分析
//   /debug/pprof/mutex     - 互斥锁分析
func RegisterPprof(mux *http.ServeMux) {
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	mux.Handle("/debug/pprof/heap", pprof.Handler("heap"))
	mux.Handle("/debug/pprof/goroutine", pprof.Handler("goroutine"))
	mux.Handle("/debug/pprof/block", pprof.Handler("block"))
	mux.Handle("/debug/pprof/mutex", pprof.Handler("mutex"))
	mux.Handle("/debug/pprof/threadcreate", pprof.Handler("threadcreate"))
}

// MetricsHandler 返回一个简单的Prometheus指标端点
// 在实际生产环境中，建议使用 prometheus/client_golang 库
func MetricsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		w.Write([]byte(`# HELP go_gateway_requests_total Total number of requests
# TYPE go_gateway_requests_total counter
go_gateway_requests_total 0
# HELP go_gateway_requests_duration_seconds Request duration in seconds
# TYPE go_gateway_requests_duration_seconds histogram
go_gateway_requests_duration_seconds_bucket{le="0.005"} 0
go_gateway_requests_duration_seconds_bucket{le="0.01"} 0
go_gateway_requests_duration_seconds_bucket{le="0.025"} 0
go_gateway_requests_duration_seconds_bucket{le="0.05"} 0
go_gateway_requests_duration_seconds_bucket{le="0.1"} 0
go_gateway_requests_duration_seconds_bucket{le="0.25"} 0
go_gateway_requests_duration_seconds_bucket{le="0.5"} 0
go_gateway_requests_duration_seconds_bucket{le="1.0"} 0
go_gateway_requests_duration_seconds_bucket{le="+Inf"} 0
go_gateway_requests_duration_seconds_sum 0
go_gateway_requests_duration_seconds_count 0
`))
	})
}