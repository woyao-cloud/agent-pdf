package middle

import (
	"log"
	"net/http"
	"time"
)

// responseWriter 包装 http.ResponseWriter，捕获状态码
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Logging 返回一个HTTP请求日志记录中间件
// 记录每个请求的方法、路径、状态码和处理时间
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// 包装 ResponseWriter 以捕获状态码
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		next.ServeHTTP(rw, r)

		// 异步日志记录（在实际网关中应使用异步队列）
		duration := time.Since(start)
		log.Printf("[%s] %s %s - %d (%v)",
			r.Method,
			r.URL.Path,
			r.RemoteAddr,
			rw.statusCode,
			duration,
		)
	})
}

// LoggingWithQueue 使用channel实现异步日志记录
// bufferSize: 队列缓冲区大小
func LoggingWithQueue(next http.Handler, bufferSize int) http.Handler {
	logChan := make(chan string, bufferSize)

	// 后台goroutine消费日志
	go func() {
		for entry := range logChan {
			log.Println(entry)
		}
	}()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)

		// 非阻塞提交日志
		select {
		case logChan <- formatLog(r, rw.statusCode, time.Since(start)):
		default:
			// 队列满则丢弃日志，不阻塞请求路径
		}
	})
}

func formatLog(r *http.Request, statusCode int, duration time.Duration) string {
	return r.Method + " " + r.URL.Path + " " + r.RemoteAddr + " - " +
		http.StatusText(statusCode) + " (" + duration.String() + ")"
}