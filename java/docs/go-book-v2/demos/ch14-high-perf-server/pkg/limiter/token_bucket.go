package limiter

import (
	"sync"
	"time"
)

// TokenBucket 令牌桶限流器
// 算法原理：
//   - 令牌以固定速率放入桶中
//   - 桶有最大容量，超过的部分溢出丢弃
//   - 每次请求消耗一个令牌，有令牌则通过，否则拒绝
//
// 相比固定窗口限流，令牌桶允许一定量的突发请求（由 capacity 控制）
// 同时保证长期平均速率不超过 rate。
type TokenBucket struct {
	rate       float64   // 每秒放入的令牌数
	capacity   float64   // 桶的最大容量
	tokens     float64   // 当前令牌数
	lastRefill time.Time // 上次补充令牌的时间
	mu         sync.Mutex
}

// New 创建一个令牌桶限流器
// rate: 每秒放入的令牌数
// capacity: 桶的最大容量
func New(rate, capacity float64) *TokenBucket {
	return &TokenBucket{
		rate:       rate,
		capacity:   capacity,
		tokens:     capacity, // 初始时桶是满的，允许突发
		lastRefill: time.Now(),
	}
}

// Allow 尝试消费一个令牌
// 返回 true 表示允许通过，false 表示限流
func (tb *TokenBucket) Allow() bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	// 惰性补充：根据时间差计算应补充的令牌数
	// 不需要额外定时器，每次请求时按需计算
	now := time.Now()
	elapsed := now.Sub(tb.lastRefill).Seconds()
	tb.tokens += elapsed * tb.rate
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}
	tb.lastRefill = now

	// 消耗令牌
	if tb.tokens >= 1 {
		tb.tokens--
		return true
	}
	return false
}

// SetRate 运行时调整速率（热点重载支持）
func (tb *TokenBucket) SetRate(rate float64) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	tb.rate = rate
}

// IPLimiter 按客户端IP进行限流
// 每个IP对应一个独立的令牌桶
type IPLimiter struct {
	limiters map[string]*TokenBucket
	rate     float64
	capacity float64
	mu       sync.RWMutex
}

// NewIPLimiter 创建IP限流器
func NewIPLimiter(rate, capacity float64) *IPLimiter {
	return &IPLimiter{
		limiters: make(map[string]*TokenBucket),
		rate:     rate,
		capacity: capacity,
	}
}

// Allow 判断指定IP的请求是否允许通过
func (il *IPLimiter) Allow(ip string) bool {
	il.mu.RLock()
	tb, ok := il.limiters[ip]
	il.mu.RUnlock()

	if !ok {
		tb = New(il.rate, il.capacity)
		il.mu.Lock()
		// 双检锁模式：第二次检查避免覆盖
		if existing, ok := il.limiters[ip]; ok {
			tb = existing
		} else {
			il.limiters[ip] = tb
		}
		il.mu.Unlock()
	}
	return tb.Allow()
}

// Cleanup 清理超过指定时间未使用的限流器
// 防止内存无限增长
func (il *IPLimiter) Cleanup(maxAge time.Duration) {
	il.mu.Lock()
	defer il.mu.Unlock()
	now := time.Now()
	for ip, tb := range il.limiters {
		if now.Sub(tb.lastRefill) > maxAge {
			delete(il.limiters, ip)
		}
	}
}