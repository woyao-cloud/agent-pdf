package circuit

import (
	"errors"
	"sync"
	"time"
)

// State 熔断器状态
type State int

const (
	StateClosed State = iota // 关闭状态：正常请求通过
	StateOpen                // 打开状态：请求快速失败
	StateHalfOpen            // 半开状态：允许试探请求
)

var ErrCircuitOpen = errors.New("circuit breaker is open, request rejected")

// Breaker 熔断器
//
// 状态机：
//   Closed ──(失败超过阈值)──▶ Open
//   Open   ──(超时时间到)───▶ HalfOpen
//   HalfOpen ──(成功)────▶ Closed
//   HalfOpen ──(失败)────▶ Open
//
// 熔断器防止故障级联扩散：上游服务不可用时，
// 快速失败而不是等待超时，避免调用方资源耗尽。
type Breaker struct {
	state        State
	failureCount int           // 连续失败次数
	threshold    int           // 触发熔断的连续失败阈值
	timeout      time.Duration // 熔断后多久进入HalfOpen状态
	lastFailure  time.Time     // 上次失败时间
	mu           sync.Mutex
}

// New 创建熔断器
// threshold: 触发熔断的连续失败次数
// timeout: 熔断持续时间
func New(threshold int, timeout time.Duration) *Breaker {
	return &Breaker{
		state:     StateClosed,
		threshold: threshold,
		timeout:   timeout,
	}
}

// Call 在熔断器保护下执行请求
// fn 是实际调用上游服务的函数
func (cb *Breaker) Call(fn func() error) error {
	cb.mu.Lock()
	// 在持有锁的状态下判断并转换状态（state transition）
	if err := cb.beforeCall(); err != nil {
		cb.mu.Unlock()
		return err
	}
	cb.mu.Unlock()

	// 执行实际请求（不在锁内，避免持有锁期间调用上游）
	err := fn()

	// 根据结果更新状态
	cb.afterCall(err)
	return err
}

// beforeCall 在调用前检查熔断器状态
// 必须在持有锁的状态下调用
func (cb *Breaker) beforeCall() error {
	switch cb.state {
	case StateOpen:
		// 检查是否到了进入HalfOpen的时间
		if time.Since(cb.lastFailure) > cb.timeout {
			cb.state = StateHalfOpen
			return nil
		}
		return ErrCircuitOpen
	case StateHalfOpen:
		// 半开状态允许试探请求
		return nil
	case StateClosed:
		return nil
	}
	return nil
}

// afterCall 根据调用结果更新熔断器状态
func (cb *Breaker) afterCall(err error) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if err != nil {
		// 请求失败
		cb.failureCount++
		cb.lastFailure = time.Now()

		switch cb.state {
		case StateHalfOpen:
			// 试探请求失败，回到打开状态
			cb.state = StateOpen
		case StateClosed:
			// 连续失败超过阈值，打开熔断器
			if cb.failureCount >= cb.threshold {
				cb.state = StateOpen
			}
		}
		return
	}

	// 请求成功：重置连续失败计数
	cb.failureCount = 0
	if cb.state == StateHalfOpen {
		// 试探请求成功，关闭熔断器
		cb.state = StateClosed
	}
}

// Stats 返回熔断器当前状态（用于监控）
func (cb *Breaker) Stats() (State, int) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state, cb.failureCount
}

// StateString 返回状态的可读字符串
func StateString(s State) string {
	switch s {
	case StateClosed:
		return "CLOSED"
	case StateOpen:
		return "OPEN"
	case StateHalfOpen:
		return "HALF_OPEN"
	default:
		return "UNKNOWN"
	}
}

// Reset 重置熔断器到关闭状态
func (cb *Breaker) Reset() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.state = StateClosed
	cb.failureCount = 0
}