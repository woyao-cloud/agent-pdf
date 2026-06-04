package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// Logger is a middleware that logs each incoming HTTP request.
// It records the HTTP method, request path, response status code, and latency.
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		method := c.Request.Method

		// Process request
		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		log.Printf("[%d] %s %s (%v)", status, method, path, latency)
	}
}