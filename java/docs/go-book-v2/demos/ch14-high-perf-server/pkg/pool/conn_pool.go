package pool

import (
	"errors"
	"net"
	"sync"
	"time"
)

// ErrPoolExhausted 连接池耗尽错误
var ErrPoolExhausted = errors.New("connection pool exhausted")

// ErrPoolClosed 连接池已关闭错误
var ErrPoolClosed = errors.New("connection pool is closed")

// ConnPool TCP连接池
//
// 连接池的核心价值：
//   - 复用已建立的TCP连接，避免三次握手开销
//   - 在高并发场景下，连接池可带来数量级的性能提升
//
// 设计要点：
//   - 懒惰创建：连接只在需要时创建
//   - LIFO策略：后归还的连接优先被复用（热点连接）
//   - 优雅降级：池空时直接创建新连接，不阻塞
type ConnPool struct {
	maxIdle int           // 最大空闲连接数
	idle    []*idleConn   // 空闲连接队列
	mu      sync.Mutex    // 保护并发访问
	factory func() (net.Conn, error) // 创建连接的工厂函数
	closed  bool          // 池是否已关闭
}

type idleConn struct {
	conn       net.Conn
	returnedAt time.Time // 归还时间，用于过期清理
}

// New 创建连接池
// maxIdle: 最大空闲连接数
// factory: 创建新连接的工厂函数
func New(maxIdle int, factory func() (net.Conn, error)) *ConnPool {
	return &ConnPool{
		maxIdle: maxIdle,
		idle:    make([]*idleConn, 0, maxIdle),
		factory: factory,
	}
}

// Get 从池中获取一个连接
// 优先从空闲队列中获取，队列为空时调用工厂函数新建
func (p *ConnPool) Get() (net.Conn, error) {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil, ErrPoolClosed
	}
	// 从空闲队列尾部获取（LIFO策略）
	if n := len(p.idle); n > 0 {
		ic := p.idle[n-1]
		p.idle = p.idle[:n-1]
		p.mu.Unlock()
		return ic.conn, nil
	}
	p.mu.Unlock()

	// 队列为空，创建新连接
	return p.factory()
}

// Put 将连接归还到池中
// 如果池已满或已关闭，则关闭该连接
func (p *ConnPool) Put(conn net.Conn) {
	if conn == nil {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed || len(p.idle) >= p.maxIdle {
		conn.Close()
		return
	}

	p.idle = append(p.idle, &idleConn{
		conn:       conn,
		returnedAt: time.Now(),
	})
}

// Close 关闭连接池，释放所有空闲连接
func (p *ConnPool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.closed = true
	for _, ic := range p.idle {
		ic.conn.Close()
	}
	p.idle = nil
}

// Len 返回当前空闲连接数
func (p *ConnPool) Len() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.idle)
}

// CleanIdle 清理超过指定时间未使用的空闲连接
func (p *ConnPool) CleanIdle(maxAge time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	keep := p.idle[:0]
	for _, ic := range p.idle {
		if now.Sub(ic.returnedAt) > maxAge {
			ic.conn.Close()
		} else {
			keep = append(keep, ic)
		}
	}
	p.idle = keep
}