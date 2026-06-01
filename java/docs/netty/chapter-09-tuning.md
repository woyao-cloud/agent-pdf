# 第9章 内核参数与 Netty 参数深度调优

## 本章导读

"为什么我的 Netty 服务在测试环境一切正常，上线后客户端经常连接超时？"——这个问题的答案，90% 的情况不是 Netty 的 Bug，而是**操作系统内核参数没调**。

想象一个场景：你的 Netty 网关在双 11 零点迎来流量高峰，一秒内涌入 10 万个新连接。服务端 `ServerSocketChannel` 的 `accept()` 方法逐个接受这些连接，但处理速度只有每秒 2 万个——剩下的 8 万个连接在哪里？它们在 TCP 的**全连接队列** 里排队。但如果排队的长度超过了你设置的值（默认 128），队列满了，多余的新连接**直接被拒绝**。客户端收到 "Connection Refused"——即使你的 Netty 应用本身完全不忙，它根本没机会处理这些连接。

这就是内核参数调优的意义——**你不告诉操作系统"我能接受多少连接"，操作系统就给你一个最保守（最小）的值**。Netty 运行在操作系统之上，它的高性能必须依赖操作系统的正确配置。这一章将操作系统参数和 Netty 参数作为一个整体来讲解。

---

## 9.1 Linux 操作系统内核调优

### TCP 连接队列与 backlog——拒绝连接的隐形门

每当一个 TCP 连接建立，操作系统内核会在内部经过两个队列：

```
TCP 连接建立的全流程（三次握手 + accept）：

  客户端                                服务端内核
    │                                     │
    │ 1. 发送 SYN                        │
    │ ──────────────────────────────►     │
    │                                     │ 进入半连接队列（SYN Queue）
    │                                     │ 由 tcp_max_syn_backlog 控制大小
    │                                     │
    │ 2. 回复 SYN+ACK                    │
    │ ◄──────────────────────────────     │
    │                                     │
    │ 3. 回复 ACK（完成三次握手）          │
    │ ──────────────────────────────►     │
    │                                     │ 从半连接队列移到全连接队列（Accept Queue）
    │                                     │ 由 min(SO_BACKLOG, somaxconn) 控制大小
    │                                     │
    │                                 4. 应用程序调 accept() 取出连接
    │                                    Netty 的 NioEventLoop 在这里取
```

**全连接队列满了的后果**：
```bash
# 内核的行为由 tcp_abort_on_overflow 控制
net.ipv4.tcp_abort_on_overflow = 0  # 默认：丢弃 ACK，客户端重试
net.ipv4.tcp_abort_on_overflow = 1  # 直接发 RST，客户端收到 Connection Refused
```

```
实际案例：
  SO_BACKLOG = 128（Netty 默认）
  somaxconn = 128（大部分 Linux 默认值）
  全连接队列最大长度 = 128

  Netty accept() 的处理速度 = 2000/s（因为有其他操作）
  客户端连接到达速度 = 5000/s

  1 秒后：全连接队列 128 满
  第 2 秒开始：所有到达的 ACK 被丢弃
  客户端：收不到响应，重试 SYN
  服务端：的的确确不忙，但就是接不入新连接！

  解决：将 SO_BACKLOG 设为 1024，将 somaxconn 设为 1024
  全连接队列最大长度 = 1024
  即使 accept() 偶尔慢一下，1024 的缓冲区足够应付
```

**如何验证全连接队列是否溢出**：

```bash
# 用 ss 命令查看全连接队列溢出情况
ss -lnt | grep 8080
# 输出: LISTEN 0 128 0.0.0.0:8080
#              ↑
#          当前队列中的连接数/最大队列长度
#          如果第一个数字长期接近第二个，说明队列不够大

# 查看溢出次数的统计
nstat -az TcpExtListenOverflows
# 如果这个数字在增长，说明队列溢出了
# 解决方案：增大 SO_BACKLOG + somaxconn
```

### TIME_WAIT 与端口耗尽

TIME_WAIT 是 TCP 协议中一个常被误解的状态。它出现在**主动关闭连接的一方**，持续 2MSL（约 60 秒）：

```
TIME_WAIT 的产生
  主动关闭方                               被动关闭方
    │                                       │
    │── FIN ──────────────────────────────► │
    │                                       │
    │◄── ACK ───────────────────────────────│
    │                                       │（进入 CLOSE_WAIT）
    │◄── FIN ───────────────────────────────│
    │                                       │
    │── ACK ──────────────────────────────► │
    │                                       │
    │ 进入 TIME_WAIT（等待 60 秒）            │
    │ 目的：确保最后的 ACK 到达对端           │
    │       如果 ACK 丢失，对端会重发 FIN      │
```

**Netty 什么时候会碰到 TIME_WAIT？** 如果 Netty 作为**客户端**频繁创建短连接（比如每次请求都创建一个新的连接），那 Netty 客户端就是主动关闭方，会产生大量 TIME_WAIT。60 秒内的连接数不能超过可用端口数（默认 28232）。

```bash
# 查看 TIME_WAIT 数量
ss -tan | grep TIME_WAIT | wc -l

# 如果这个数字持续 > 20000，说明端口可能不够用了
# 查看可用端口范围
cat /proc/sys/net/ipv4/ip_local_port_range
# 输出: 32768 60999  ← 共 28232 个可用端口

# 优化 1：增大端口范围
net.ipv4.ip_local_port_range = 1024 65535

# 优化 2：允许复用 TIME_WAIT 的连接（客户端生效）
net.ipv4.tcp_tw_reuse = 1

# ⚠️ 注意：tcp_tw_recycle 在 Linux 4.12+ 已移除
# 这个参数在 NAT 环境下会导致严重问题（同一个 NAT IP 的不同客户端
# 的时间戳不一致，导致连接被丢弃），所以 Linux 直接移除了它
```

### 文件描述符限制——连接数的硬上限

每个 TCP 连接对应一个文件描述符（fd）。如果操作系统的文件描述符限制不够大，你的 Netty 连接数就上不去——这是**硬限制**，不是优化能解决的。

```bash
# 查看当前进程的文件描述符限制
ulimit -n
# 输出: 1024  ← 默认值，只够 1024 个连接！

# 临时修改
ulimit -n 1000000

# 永久修改（/etc/security/limits.conf）
# 添加：
* soft nofile 1000000
* hard nofile 1000000

# 系统级限制也要改
fs.file-max = 1000000    # /etc/sysctl.conf

# 验证：查看当前进程已使用的 fd 数
ls /proc/<pid>/fd | wc -l

# 查看系统级 fd 使用情况
cat /proc/sys/fs/file-nr
# 输出: 1024  0  1000000
#      已用  已释放  总量（接近总量时说明不够了）
```

### 完整内核优化脚本

```bash
#!/bin/bash
# netty-sysctl.sh —— Netty 部署标准内核参数优化

cat >> /etc/sysctl.conf <<'EOF'

# ===== 连接队列（最重要的调整） =====
net.core.somaxconn = 1024             # 全连接队列最大长度
net.ipv4.tcp_max_syn_backlog = 1024   # 半连接队列最大长度

# ===== TIME_WAIT 优化 =====
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15

# ===== TCP Keepalive =====
net.ipv4.tcp_keepalive_time = 120     # 空闲 120 秒后开始探测
net.ipv4.tcp_keepalive_intvl = 30     # 每 30 秒探测一次
net.ipv4.tcp_keepalive_probes = 3     # 3 次探测失败断开

# ===== 网络缓冲区（影响吞吐量） =====
net.core.rmem_max = 16777216          # 接收缓冲区最大 16MB
net.core.wmem_max = 16777216          # 发送缓冲区最大 16MB
net.ipv4.tcp_rmem = 4096 87380 16777216   # TCP 接收缓冲区 min default max
net.ipv4.tcp_wmem = 4096 65536 16777216   # TCP 发送缓冲区 min default max

# ===== 窗口缩放（高延迟链路必备） =====
net.ipv4.tcp_window_scaling = 1

# ===== 禁用空闲后慢启动（跨地域部署时有用） =====
net.ipv4.tcp_slow_start_after_idle = 0

# ===== 内存与文件描述符 =====
vm.swappiness = 1                     # 尽量不使用 Swap
vm.overcommit_memory = 1             # 允许内存超分配（fork() 需要）
fs.file-max = 1000000

# ===== TCP Fast Open（减少一次 RTT） =====
net.ipv4.tcp_fastopen = 3
EOF

sysctl -p
echo "Netty 内核参数优化完成"
```

---

## 9.2 Netty 核心参数调优

### 参数配置总览（含解释）

```java
// 生产环境的 Netty ServerBootstrap 配置模板
// 每一行都有为什么要这么设
ServerBootstrap b = new ServerBootstrap();

b.group(bossGroup, workerGroup)
 .channel(NioServerSocketChannel.class)

 // ===== 服务端 ServerSocketChannel 的参数 =====
 .option(ChannelOption.SO_BACKLOG, 1024)
 // accept 队列大小。默认 128 太小，高并发时连接被拒绝。
 // 需要与内核参数 net.core.somaxconn 配合（取最小值）。
 // 比如设了 1024，但 somaxconn=128，实际队列=128。

 .option(ChannelOption.SO_REUSEADDR, true)
 // 端口复用。默认情况下，服务关闭后端口会进入 TIME_WAIT，
 // 短时间内重启会报 "Address already in use"。
 // 加上这个参数可以立即复用端口。

 // ===== 客户端连接的参数 =====
 .childOption(ChannelOption.TCP_NODELAY, true)
 // 禁用 Nagle 算法。几乎所有 Netty 应用都应该设成 true。
 // Nagle 会将小包攒到一起发，增加延迟。
 // 对 IM、RPC、实时推送等场景是灾难。
 // 只有大文件传输场景才考虑保留 Nagle。

 .childOption(ChannelOption.SO_KEEPALIVE, true)
 // 启用 TCP keepalive。当连接长时间空闲时，
 // 操作系统会发送探测包检查对端是否存活。
 // 注意：TCP keepalive 的间隔由内核参数决定（默认 2 小时，太长）。
 // 需要配合前面的 tcp_keepalive_time 调短。

 .childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT)
 // 使用池化内存分配器。必须启用。
 // 非池化版本每次读写都分配新内存，GC 压力极大。

 .childOption(ChannelOption.WRITE_BUFFER_WATER_MARK,
     new WriteBufferWaterMark(32 * 1024, 64 * 1024))
 // 写缓冲区水位线。当 ChannelOutboundBuffer 超过 64KB 时，
 // Channel.isWritable() 返回 false。
 // 可以在 channelWritabilityChanged 中暂停读取。
 // 默认为 32KB/64KB，大多数场景下够用。
 // 如果传输大消息，可以适当调高。

 .childOption(ChannelOption.RCVBUF_ALLOCATOR,
     new AdaptiveRecvByteBufAllocator(64, 4096, 65536))
 // 接收缓冲区自适应分配器。
 // 初始 4KB，如果数据量大自动增加到最多 64KB。
 // 大多数场景用默认值即可。
```

### 参数详解——为什么这些配置很重要

**SO_BACKLOG——被忽略的"第一道防线"**

```
一个真实的线上案例：

  某 Netty 服务在压测中，TPS 始终上不去。查看监控：CPU 不到 20%，内存充足。
  但客户端大量报 "Connection Refused"。

  排查步骤：
  1. `ss -lnt | grep 8080` → 显示队列 128/128（满了！）
  2. 检查 backlog 配置 → 忘了设，用的默认值 128
  3. 修改为 1024，配合调整 somaxconn → 队列不再溢出
  4. TPS 直接翻倍

  教训：SO_BACKLOG 是 Netty 配置中成本最低（一行代码）但收益最大的参数。
```

**TCP_NODELAY——延迟的"开关"**

```
Nagle 算法的工作演示：

  时间    客户端操作                      Nagle 开启（默认）         Nagle 关闭（TCP_NODELAY=true）
  ───────────────────────────────────────────────────────────────────────
  T0      发送 "H"                        发出（第一个包不等）      发出
  T1      发送 "e"                        等上一个 ACK               发出
  T2      发送 "l"                        继续等                     发出
  T3      发送 "l"                        继续等                     发出
  T4      发送 "o"                        继续等                     发出
  T5      ◄── 收到前一个包的 ACK          将 "ello" 一次性发出
                                                                                                            
  结果：
          Nagle 开启：2 个包（"H" + "ello"）
          Nagle 关闭：5 个包（"H"+"e"+"l"+"l"+"o"）

  在 IM 场景中，每条消息可能就是一个 "你好"（6 字节）。
  Nagle 开启后，这条消息最多会等 200ms（TCP_NODELAY 定时器）才发出。
  200ms 的延迟在 IM 中是完全不可接受的。

  结论：大多数 Netty 应用中，TCP_NODELAY=true 是必选项。
```

**ALLOCATOR——内存池是必选项**

```java
// 验证 PooledByteBufAllocator 的效果
// 用微基准测试对比：

// 情况 A：未池化（每次创建新对象）
for (int i = 0; i < 100000; i++) {
    ByteBuf buf = Unpooled.buffer(1024);
    buf.writeBytes(data);
    process(buf);
    buf.release();
    // 每次创建新对象，GC 压力巨大
}

// 情况 B：池化
for (int i = 0; i < 100000; i++) {
    ByteBuf buf = PooledByteBufAllocator.DEFAULT.buffer(1024);
    buf.writeBytes(data);
    process(buf);
    buf.release();
    // 释放后内存回到池中，下一次分配直接复用
}

// 两者的吞吐量差异在高并发下可以达到 3-5 倍
```

### EventLoopGroup 线程数——多少算合适？

Netty 新手最容易问的问题："BossGroup 设几个线程？WorkerGroup 设几个？"

```
BossGroup 线程数：
  ┌──────────────────────────────────────────────┐
  │  Boss 线程只做一件事：accept 新连接             │
  │  accept() 本身是一个极其轻量的操作              │
  │  一个线程一秒钟可以 accept 数万个连接            │
  │                                                │
  │  所以：BossGroup 通常 = 1                       │
  │                                                │
  │  例外：如果你在不同的端口上监听（比如 8080 和    │
  │  8443 两个端口），可以用 2 个 Boss 线程         │
  └──────────────────────────────────────────────┘

WorkerGroup 线程数：
  ┌──────────────────────────────────────────────┐
  │  Worker 线程负责：Channel 的读写、解码、业务   │
  │                                               │
  │  默认值 = CPU 核数 × 2（大多数场景的最佳实践） │
  │                                               │
  │  如果你有 8 核 CPU：                          │
  │  默认 = 16 个 Worker 线程                      │
  │  每个 Worker 管理 1/16 的连接                 │
  │                                               │
  │  如果你的 Handler 中处理逻辑比较重：           │
  │  → 减少 Worker 线程数到 CPU 核数 × 1          │
  │  → 或者（更推荐）把业务逻辑异步化             │
  │                                               │
  │  别超过 16 个（即使你有 32 核 CPU）：          │
  │  → 线程数过多导致锁竞争加剧                    │
  │  → 上下文切换开销增加                          │
  │  → 收益递减                                   │
  └──────────────────────────────────────────────┘
```

---

## 本章总结

| 参数 | 作用域 | 默认值 | 生产推荐值 | 如果不调... |
|------|--------|--------|-----------|------------|
| `SO_BACKLOG` | Netty | 128 | 1024 | 高并发时连接被拒绝 |
| `somaxconn` | OS | 128 | 1024 | SO_BACKLOG 设再大也没用 |
| `TCP_NODELAY` | Netty | false | **true** | 小消息延迟 200ms |
| `SO_KEEPALIVE` | Netty | false | true | TCP 不检测死连接 |
| `tcp_keepalive_time` | OS | 7200 (2h) | 120 (2min) | 死连接占 2 小时才释放 |
| `ALLOCATOR` | Netty | Pooled | Pooled(必须) | 高并发下 GC 压力山大 |
| `WRITE_BUFFER_WATER_MARK` | Netty | 32K/64K | 按需调整 | 慢客户端导致 OOM |
| `Worker 线程数` | Netty | CPU×2 | CPU×2 ~ CPU×4 | 设太多反而更慢 |

**核心原则**：
1. **内核参数和 Netty 参数必须协同调整**——`SO_BACKLOG=1024` 加上 `somaxconn=128`，实际是 128。你以为是 1024，其实是 128。这是最常见的配置失误
2. **TCP_NODELAY 几乎是必开的**——Nagle 算法在大多数 Netty 场景下弊大于利。只有大文件传输场景才考虑保留它
3. **池化分配器是标配**——`PooledByteBufAllocator` 在高并发下的性能是非池化的 3-5 倍。没有理由不用它
4. **不要调自己没有压测过的参数**——每个参数调整都需要有压测数据支撑。不要因为"看了篇文章说这样设好"就盲目改。先压测，再调参，再压测