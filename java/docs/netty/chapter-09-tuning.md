# 第9章 内核参数与 Netty 参数深度调优

## 9.1 Linux 操作系统内核调优

### TCP 队列与连接 backlog

```
TCP 连接建立的三个阶段：

  客户端                         服务端
    │                             │
    │ ── SYN ──────────────────►  │  半连接队列（SYN Queue）
    │                             │  tcp_max_syn_backlog
    │ ◄── SYN+ACK ─────────────── │
    │                             │
    │ ── ACK ──────────────────►  │  全连接队列（Accept Queue）
    │                             │  listen(fd, backlog)
    │                             │  somaxconn
    │                             │
    │ accept() 返回新 socket      │
    │ 应用层开始处理               │
```

```bash
# 全连接队列大小配置
net.core.somaxconn = 1024         # 系统级最大 backlog
# redis.conf / Netty ServerBootstrap 中设置
.option(ChannelOption.SO_BACKLOG, 1024)  # 应用级 backlog

# 如果 somaxconn < backlog，实际以 somaxconn 为准
# 检查全连接队列是否溢出：
ss -lnt  # 看 Send-Q 是否等于 backlog 设置值
# 如果 Recv-Q 经常不为 0，说明连接队列溢出了
```

```bash
# 半连接队列
net.ipv4.tcp_max_syn_backlog = 1024   # SYN 队列大小

# SYN Flood 防护
net.ipv4.tcp_syncookies = 1           # 启用 SYN Cookie（默认开启）
```

### TIME_WAIT 优化

```
TIME_WAIT 的危害：
  主动关闭连接的一方，会进入 TIME_WAIT 状态，持续 2MSL（约 60 秒）
  高并发短连接场景下，大量 TIME_WAIT 会耗尽可用端口

  # 查看 TIME_WAIT 数量
  ss -tan | grep TIME_WAIT | wc -l
```

```bash
# TIME_WAIT 优化（在 Netty 服务端同样适用）
# 服务端通常不需要优化（TIME_WAIT 在主动关闭方）
# 如果 Netty 客户端大量创建短连接：

net.ipv4.tcp_tw_reuse = 1             # 复用 TIME_WAIT 连接（客户端生效）
net.ipv4.tcp_fin_timeout = 15          # FIN_WAIT2 超时（默认 60 秒）

# 注意：tcp_tw_recycle 在 Linux 4.10+ 已移除，不要使用
```

### 文件描述符限制

```bash
# 查看当前限制
ulimit -n

# 修改（临时）
ulimit -n 1000000

# 修改（永久 /etc/security/limits.conf）
# 每个进程的文件描述符限制
* soft nofile 1000000
* hard nofile 1000000

# 系统级文件描述符限制
fs.file-max = 1000000

# 检查当前使用量
cat /proc/sys/fs/file-nr
# 输出: 1024  0    1000000
#      已用  已释放  总量
```

### Swap 与内存

```bash
# Redis 需要关闭 Swap（内存数据库用 Swap 会性能崩溃）
# Netty 同样建议尽量减少 Swap
vm.swappiness = 1                    # 尽量不使用 Swap

# 内存超分配（fork() 需要，NIO 也会用到）
vm.overcommit_memory = 1             # 允许超分配
```

### 完整内核优化脚本

```bash
#!/bin/bash
# sysctl-optimize.sh —— Netty 部署内核优化

cat >> /etc/sysctl.conf <<EOF

# ===== Netty 优化 =====
# TCP 连接队列
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 1024

# TIME_WAIT 优化
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15

# TCP Keepalive
net.ipv4.tcp_keepalive_time = 120    # 空闲 120 秒后开始探测
net.ipv4.tcp_keepalive_intvl = 30   # 每 30 秒发一次探测
net.ipv4.tcp_keepalive_probes = 3   # 3 次探测失败后断开

# 网络性能
net.core.rmem_default = 262144       # 接收缓冲区默认 256KB
net.core.wmem_default = 262144       # 发送缓冲区默认 256KB
net.core.rmem_max = 4194304          # 接收缓冲区最大 4MB
net.core.wmem_max = 4194304          # 发送缓冲区最大 4MB

# TCP 自动窗口缩放
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_rmem = 4096 87380 4194304   # min default max
net.ipv4.tcp_wmem = 4096 65536 4194304

# 减少慢启动
net.ipv4.tcp_slow_start_after_idle = 0

# 内存
vm.swappiness = 1
vm.overcommit_memory = 1

# 文件描述符
fs.file-max = 1000000

# TCP Fast Open（减少握手延迟）
net.ipv4.tcp_fastopen = 3
EOF

sysctl -p
```

---

## 9.2 Netty 核心参数调优

### ChannelOption 参数速查

```java
// ServerBootstrap 参数配置模板
ServerBootstrap b = new ServerBootstrap();

b.group(bossGroup, workerGroup)
 .channel(NioServerSocketChannel.class)

 // ===== 服务端 Socket 参数 =====
 .option(ChannelOption.SO_BACKLOG, 1024)        // accept 队列大小
 .option(ChannelOption.SO_REUSEADDR, true)      // 端口复用（快速重启）
 .option(ChannelOption.SO_RCVBUF, 262144)       // 接收缓冲区 256KB

 // ===== 客户端 Socket 参数（每个连接） =====
 .childOption(ChannelOption.TCP_NODELAY, true)  // 禁用 Nagle 算法
 .childOption(ChannelOption.SO_KEEPALIVE, true) // TCP keepalive
 .childOption(ChannelOption.SO_SNDBUF, 262144)  // 发送缓冲区
 .childOption(ChannelOption.SO_RCVBUF, 262144)  // 接收缓冲区

 // ===== Netty 特有参数 =====
 .childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT) // 内存池
 .childOption(ChannelOption.WRITE_BUFFER_WATER_MARK,
     new WriteBufferWaterMark(32 * 1024, 64 * 1024)) // 水位线
 .childOption(ChannelOption.RCVBUF_ALLOCATOR,
     new AdaptiveRecvByteBufAllocator(64, 4096, 65536)); // 自适应缓冲区
```

### 参数详解

**SO_BACKLOG**

```java
// 全连接队列大小
.option(ChannelOption.SO_BACKLOG, 1024)
```

```
当 Netty 处理 accept() 的速度跟不上连接接入的速度时，
连接会在全连接队列中排队。队列满了之后，新的连接会被拒绝。

建议值：
  服务端：1024（默认 128，对高并发应用太小了）
  Redis 配置：511
```

**TCP_NODELAY**

```java
// 禁用 Nagle 算法
.childOption(ChannelOption.TCP_NODELAY, true)
```

```
Nagle 算法：将多个小包合并为一个大包发送
目的：提高网络利用率
代价：增加延迟（最多等待 200ms）

适用场景：
  实时性要求高的场景（聊天、游戏、RPC）：禁用 Nagle
  大文件传输、批量数据：保留 Nagle（默认）

几乎所有的 Netty 应用都应该设置 TCP_NODELAY = true
```

**ALLOCATOR**

```java
// 内存分配器
.childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT)

// 或者在 JVM 参数中全局设置
// -Dio.netty.allocator.type=pooled
// -Dio.netty.allocator.maxOrder=9  // 16MB Chunk 大小
// -Dio.netty.allocator.numHeapArenas=8  // Arena 数量
// -Dio.netty.allocator.numDirectArenas=8
```

```
PooledByteBufAllocator vs UnpooledByteBufAllocator：

  场景         池化          非池化
  高并发      快（复用内存）  慢（每次分配新内存）
  内存碎片     低             高
  GC 压力    小              大

  生产环境：必须使用 PooledByteBufAllocator
```

**WRITE_BUFFER_WATER_MARK**

```java
.childOption(ChannelOption.WRITE_BUFFER_WATER_MARK,
    new WriteBufferWaterMark(32 * 1024, 64 * 1024))
```

```
水位线的作用：

  低水位（32KB）：缓冲区内数据少于 32KB → 认为"可写"
  高水位（64KB）：缓冲区内数据超过 64KB → 认为"不可写"
  
  配合 channelWritabilityChanged 使用
  当 Channel 不可写时，暂停读取上游数据（背压）

  建议值：
    低延迟场景：32KB / 64KB
    大流量场景：64KB / 128KB
    极端情况：256KB / 512KB
```

**RCVBUF_ALLOCATOR**

```java
// 自适应接收缓冲区分配器
.childOption(ChannelOption.RCVBUF_ALLOCATOR,
    new AdaptiveRecvByteBufAllocator(64, 4096, 65536));
```

```
三个参数：min, initial, max

  min（64 字节）：初始缓冲区大小
  initial（4096 字节）：默认初始大小  
  max（65536 字节）：最大缓冲区大小

  自适应逻辑：
  如果连续几次读到的数据都接近当前缓冲区大小 → 增大
  如果连续几次读到的数据都远小于当前缓冲区大小 → 减小

  Netty 默认就是 AdaptiveRecvByteBufAllocator
  大多数场景不需要显式设置
```

### EventLoopGroup 线程数

```java
EventLoopGroup bossGroup = new NioEventLoopGroup(1); // Boss：1 个足够
EventLoopGroup workerGroup = new NioEventLoopGroup(); // Worker：默认 CPU×2

// 也可以指定
int workerThreads = Runtime.getRuntime().availableProcessors() * 2;
EventLoopGroup workerGroup = new NioEventLoopGroup(workerThreads);
```

```
线程数选择建议：

  Boss Group:
    通常 = 1（accept 操作不是瓶颈）
    如果服务器有多个网卡绑定不同的 IP，可以设置为 IP 数量

  Worker Group:
    默认 = CPU 核数 × 2（大多数场景的最佳实践）
    纯 I/O 密集型：CPU 核数 × 2 到 × 4
    含业务逻辑：CPU 核数 × 1 到 × 2
    别超过 16（再多了锁竞争收益下降）
```

---

## 本章总结

| 参数 | 默认值 | 生产推荐 | 说明 |
|------|--------|---------|------|
| SO_BACKLOG | 128 | 1024 | accept 队列，太小丢连接 |
| TCP_NODELAY | false | **true** | 禁用 Nagle，降低延迟 |
| SO_KEEPALIVE | false | **true** | 启用 TCP keepalive |
| ALLOCATOR | 池化 | PooledByteBufAllocator | 内存池必须开启 |
| WRITE_BUFFER_WATER_MARK | 32K/64K | 按需调整 | 背压控制的关键 |
| Worker 线程数 | CPU×2 | CPU×2 ~ CPU×4 | 别超过 16 |

**核心原则**：
1. **TCP_NODELAY 几乎是必开的**——Nagle 算法在大多数 Netty 场景下弊大于利
2. **池化分配器是标配**——`PooledByteBufAllocator` 在高并发下的性能是非池化的数倍
3. **内核参数要和 Netty 参数配合调整**——`somaxconn` < `SO_BACKLOG` = 白设