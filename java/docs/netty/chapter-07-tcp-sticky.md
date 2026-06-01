# 第7章 TCP 粘包/半包的本质与 Netty 解码器矩阵

## 本章导读

假设你在开发一个 IM 系统，服务端收到了来自客户端的一条消息。你打印出收到的字节数组：`[0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x48, 0x69]`。

请问：这是一条消息 "HelloHi"？两条消息 "Hello" + "Hi"？还是 "Hel" + "loHi"？

答案是：**不知道。** 这就是 TCP 粘包/半包问题的本质——TCP 只负责**可靠地传输字节流**，不负责**维护消息的边界**。同样的字节序列，可以有多种不同的"消息拆分"方式，而你作为应用层开发者，必须告诉 Netty："消息的边界在哪里"。

80% 的 Netty 新手遇到的第一个 Bug 都跟粘包/半包有关。本章的目的是让你一次性搞清楚：粘包为什么会发生，以及如何用 Netty 的解码器矩阵——特别是"万金油" `LengthFieldBasedFrameDecoder`——一劳永逸地解决这个问题。

---

## 7.1 为什么会产生粘包/半包？

### TCP 是流式协议，不是消息协议

这是粘包/半包问题的**根本原因**，值得反复强调：TCP 看到的是"字节流"，不是"消息流"。

```
应用程序视角（发送方）：
  send("Hello")       ← 我们认为这是"一条消息"
  send("World")       ← 这是"另一条消息"

TCP 协议视角（传输层）：
  "HelloWorld"        ← 在 TCP 看来，这只是 10 个连续的字节
                        它不知道（也不关心）Hello 和 World 是两条消息

应用程序视角（接收方）：
  read() → 得到 "HelloWorld"  ← 粘包了（两条消息粘在一起）
  或者  read() → 得到 "Hel"   ← 半包了（一条消息被拆成两半）
  或者  read() → 得到 "Hello"  ← 运气好，正好是完整的一条
```

那么问题来了：**为什么应用程序发送时的"两条消息"到了接收端就可能变成一条或半条？** 下面三个原因可以解释。

### 原因一：Nagle 算法——小包合并

Nagle 算法是 TCP 协议栈的一个优化，它在 1984 年被提出，目的是解决"小包问题"：如果应用程序频繁发送小数据包（比如 Telnet 场景下每次按键发送一个字节），网络上就会充斥着大量只有几十字节有效数据、却有 40 字节 IP+TCP 头的"小包"，网络利用率极低。

```
Nagle 算法的工作规则：

  1. 当发送的数据 < MSS（最大报文段长度，通常 1460 字节）时
  2. 并且上一个数据包的 ACK 还没有收到
  3. 那么就"攒着"这些小数据，等 ACK 到了或攒够了再发

  举例：
  时间    应用程序调用          Nagle 算法的行为
  ──────────────────────────────────────────────
  T0      write("H")          先发出去（第一个包不需要等）
  T1      write("e")          攒着（等上一个 ACK）
  T2      write("l")          继续攒
  T3      write("l")          继续攒
  T4   ◄── ACK 到达 ─────────  收到上一次的确认
  T4                          把 "ell" 一次性发出

  结果：H 单独一包，"ell" 合并为一包
        应用程序的 4 次 write → TCP 层的 2 个包
```

**Nagle 算法对 Netty 的影响**：如果你的应用频繁发送小消息（比如 IM 消息、心跳），你又没有禁用 Nagle 算法（`TCP_NODELAY=false`），那么多个小消息可能被 Nagle 合并到一个 TCP 包中发送——接收方就会看到"粘包"。

### 原因二：TCP 滑动窗口——流量控制的副产品

TCP 的滑动窗口机制用于流量控制——接收方告诉发送方"我还能接收多少字节"，发送方据此控制发送速度。

```
滑动窗口导致半包：

  接收方的通告窗口 = 4096 字节（表示接收缓冲区还能接收 4096 字节）

  发送方有 6000 字节要发送：
  ┌─────────────────────────────────────────────────────┐
  │  [第 1 批] 发送 4096 字节 → 填满了窗口              │
  │  [等待窗口释放]                                     │
  │  [接收方处理了部分数据，窗口恢复到 1904 字节]         │
  │  [第 2 批] 发送 1904 字节 → 剩余的                  │
  └─────────────────────────────────────────────────────┘

  如果发送方这次发送的是应用程序的一条 6000 字节的消息：
  接收方第一次 read() → 得到 4096 字节（半包！）
  接收方第二次 read() → 得到 1904 字节（消息的剩下半）
```

**TCP 并不知道接收方一次 read() 应该读到什么程度**——它只是"有数据就扔给应用层"，至于应用层读取多少，完全取决于接收缓冲区中当前有多少数据。

### 原因三：MSS 与 IP 分片

MSS（Maximum Segment Size）是 TCP 层的一个概念，它等于 MTU - IP 头 - TCP 头。对于标准的以太网：

```
MTU（最大传输单元）= 1500 字节（链路层）
IP 头 = 20 字节
TCP 头 = 20 字节（无选项）
MSS = 1500 - 20 - 20 = 1460 字节

如果你一次发送 5000 字节：
TCP 层会拆分为 4 个数据段：
  段 1: 1460 字节
  段 2: 1460 字节
  段 3: 1460 字节
  段 4: 620 字节

IP 层将它们分片发送，接收方 IP 层重组后交给 TCP
最终应用层 read() 一次性读到 5000 字节？（取决于窗口大小和调度）
或者只读到一部分（半包）？都有可能
```

### 粘包/半包的总结

| 现象 | 本质原因 | 触发条件 |
|------|---------|---------|
| **粘包** | 多个小消息被合并到一个 TCP 包中 | Nagle 算法（默认开启）|
| **半包** | 一条消息被拆分成多个 TCP 包 | 滑动窗口限制、MSS 限制 |
| **正常** | 一个 TCP 包恰好包含一条完整消息 | 消息大小恰好与 TCP 段对齐 |

**重要结论**：粘包和半包是 TCP 的**正常行为**，不是 Bug。你无法"阻止"它们发生，你只能"处理"它们——用解码器。

---

## 7.2 Netty 内置解码器实战

Netty 提供了 4 种内置解码器来处理粘包/半包。它们的工作方式都一样：**读入字节流 → 找到消息边界 → 切分出一条条完整的消息 → 传递给下一个 Handler**。区别只在于"如何找到消息边界"。

### 解码器一：LineBasedFrameDecoder（换行符分割）

这是最简单的解码器——以换行符 `\n` 或 `\r\n` 作为消息边界。

```
TCP 字节流:   msg1\nmsg2\nmsg3\n
              ↓  LineBasedFrameDecoder
完整消息:     ["msg1", "msg2", "msg3"]
```

```java
// 通信协议：每条消息以换行符结尾
// 适用：Redis 协议（RESP）、简单的文本协议

pipeline.addLast(new LineBasedFrameDecoder(1024)); // 最大消息长度 1024
pipeline.addLast(new StringDecoder());             // ByteBuf → String
pipeline.addLast(new BusinessHandler());

// 输入：SayHello\nSayWorld\n
// BusinessHandler 的 channelRead0() 会被调用两次：
//   第一次收到 "SayHello"
//   第二次收到 "SayWorld"
```

**缺点**：消息体中不能包含换行符（否则会被误判为消息边界）。这意味着不能传输二进制数据。

### 解码器二：DelimiterBasedFrameDecoder（自定义分隔符）

与 LineBasedFrameDecoder 类似，但分隔符可以自定义。

```java
// 协议：每条消息以 $$ 结束
ByteBuf delimiter = Unpooled.copiedBuffer("$$".getBytes());
pipeline.addLast(new DelimiterBasedFrameDecoder(1024, delimiter));
pipeline.addLast(new StringDecoder());

// 输入：{"cmd":"login"}$${"cmd":"chat"}$$
// 输出：["{\"cmd\":\"login\"}", "{\"cmd\":\"chat\"}"]
```

### 解码器三：FixedLengthFrameDecoder（固定长度分割）

适用于传输固定长度消息的老系统，比如一些工业控制协议。

```java
// 每条消息固定 100 字节
pipeline.addLast(new FixedLengthFrameDecoder(100));

// 输入：150 字节
// 输出：[第一条 100 字节, 第二条 50 字节]
// 注意：第二条只有 50 字节，还没到 100，解码器会等更多的数据
```

**现实应用**：很少单独使用。但有些简单的 GPS 追踪器协议会使用固定长度。

### 解码器四：LengthFieldBasedFrameDecoder（基于长度字段）⭐⭐⭐

**这是最重要的解码器，没有之一。** 它可以适配 99% 的自定义二进制协议。核心思想是：在消息的头部中用一个字段来**告诉解码器"消息体有多长"**。

```
典型的带长度字段的协议格式：

  ┌──────────────────────────────────────────────────────────────┐
  │  包头（可选）         │  长度字段（必须）  │  消息体           │
  │                      │                   │                  │
  │  魔数 + 版本 + ...   │   消息体长度       │  Protobuf/Kryo   │
  │  (N 字节)            │   (4 字节)        │  序列化后的数据    │
  └──────────────────────────────────────────────────────────────┘
```

`LengthFieldBasedFrameDecoder` 的 5 个参数是 Netty 初学者最容易搞混的地方。我们用一张图来说明每个参数的意义：

```
协议格式： [魔数(2B)][版本(1B)][消息体长度(4B)][消息体(N B)][CRC(2B)]

                                        lengthFieldOffset = 3
                                        （魔数+版本=3B）
                                        │
                                        ▼
  ┌────────┬──────┬────────────────┬────────────────────┬──────┐
  │  魔数   │ 版本  │  消息体长度(4B) │  消息体(N B)        │ CRC  │
  │  (2B)  │ (1B)  │                │                    │ (2B) │
  └────────┴──────┴────────────────┴────────────────────┴──────┘
                                           ↑              ↑
                                    lengthAdjustment = 2  │
                                    （长度字段后面还有     │
                                     2 字节 CRC）         │
                                                          │
                                           initialBytesToStrip = 9
                                           （跳过所有包头：2+1+4+2=9）
```

```java
// 5 个参数详解：
pipeline.addLast(new LengthFieldBasedFrameDecoder(
    1024,      // 1. maxFrameLength：整条消息（头+体）的最大长度
               //    超过此长度的消息直接被拒绝，防止恶意大包

    3,         // 2. lengthFieldOffset：长度字段的起始偏移
               //    这里 = 2(魔数) + 1(版本) = 3

    4,         // 3. lengthFieldLength：长度字段占用的字节数
               //    常见值：1(byte)、2(short)、4(int)

    2,         // 4. lengthAdjustment：长度调整值
               //    长度字段的值 = 消息体长度
               //    但消息体后面还有 CRC 校验码
               //    需要将长度调整为 消息体长度 + CRC长度
               //    所以 lengthAdjustment = 2

    9          // 5. initialBytesToStrip：剥离的字节数
               //    解码后的结果要不要去掉包头？
               //    剥离 9 字节 = 魔数2+版本1+长度4+CRC2
               //    后续的 Handler 只拿到"消息体"
));
```

**5 个参数的口诀**：

1. **maxFrameLength** —— 最多能有多长？超过就拒绝
2. **lengthFieldOffset** —— 从哪里开始是长度字段？
3. **lengthFieldLength** —— 长度字段自己占几个字节？
4. **lengthAdjustment** —— 长度字段的值之外，还有没有别的部分？
5. **initialBytesToStrip** —— 切出来的消息，要不要切掉包头？

### 一个完整的例子：从 RPC 协议到解码器配置

```java
/**
 * 自定义 RPC 协议解码器
 *
 * 协议： [魔数(2B)][版本(1B)][消息体长度(4B)][消息体(N B)]
 *
 * 解码器要做的：
 *   1. 找到消息边界——完整的消息 = 7B 头 + N B 体
 *   2. 切掉 7B 头，把 N B 体交给下一个 Handler
 */
public class RpcProtocolInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    protected void initChannel(SocketChannel ch) {
        ChannelPipeline p = ch.pipeline();

        // ===== 第 1 步：解决粘包/半包 =====
        p.addLast("frameDecoder", new LengthFieldBasedFrameDecoder(
            1024 * 1024,  // maxFrameLength: 最大 1MB
            3,            // lengthFieldOffset: 魔数2+版本1=3
            4,            // lengthFieldLength: 消息体长度占 4 字节
            0,            // lengthAdjustment: 长度字段的值 = 消息体长度，不需要调整
            7             // initialBytesToStrip: 去掉魔数+版本+长度 = 7 字节
        ));

        // ===== 第 2 步：将 ByteBuf（消息体）反序列化为消息对象 =====
        p.addLast("messageDecoder", new ByteToMessageDecoder() {
            @Override
            protected void decode(ChannelHandlerContext ctx, ByteBuf in, List<Object> out) {
                // 这里的 ByteBuf 已经是"完整的一条消息体"了
                // 不需要处理粘包/半包！
                int bodyLength = in.readableBytes();
                byte[] body = new byte[bodyLength];
                in.readBytes(body);

                // 反序列化（假设用 Kryo）
                RpcRequest request = KryoSerializer.deserialize(body);
                out.add(request);
            }
        });

        p.addLast("business", new RpcBusinessHandler());
    }
}
```

### 解码器配置的"灵魂拷问"

**问**：如果我的协议头除了长度字段外还有其他字段，`initialBytesToStrip` 设多少？

**答**：`initialBytesToStrip` 设为你想要"切掉"的字节数。通常你不想让后续的 Handler 看到协议头（魔数、版本、长度），所以 `initialBytesToStrip = 协议头的总字节数`。

**问**：如果我不 strip 协议头会怎样？

**答**：后续的 Handler 收到的消息从协议头开始。你需要自己在业务 Handler 中解析协议头。通常不建议这样做——协议头的解析应该在解码阶段完成。

**问**：我协议中的长度字段包含协议头本身怎么办？

**答**：这种情况下需要 `lengthAdjustment`。假设你的协议是 `[长度(2B)] [消息体(N B)]`，长度字段的值 = 2 + N（包含自己）。这时 `lengthAdjustment = -2`（因为长度字段的值比实际的消息体长度多了 2）。

---

## 7.3 Netty 解码器的内部工作原理

理解解码器的内部机制有助于排查那些"看起来解码器不起作用"的诡异问题。

```
ByteToMessageDecoder 的工作流程（当你调用 addLast(decoder) 时）：

  ┌──────────────────────────────────────────────────────────────────┐
  │  channelRead(ctx, ByteBuf in) 被调用                              │
  │  这是 EventLoop 收到 TCP 数据时触发的                              │
  │                                                                  │
  │  ↓                                                               │
  │                                                                  │
  │  步骤 1：将收到的数据追加到累积缓冲区（cumulation）                 │
  │  ┌─────────────────────────────────────────────┐                │
  │  │  cumulation 之前缓存的未处理数据               │                │
  │  │  加上这次新到达的数据                          │                │
  │  └─────────────────────────────────────────────┘                │
  │                                                                  │
  │  ↓                                                               │
  │                                                                  │
  │  步骤 2：调用子类的 decode() 方法尝试解码                          │
  │  ┌─────────────────────────────────────────────┐                │
  │  │  decode(ctx, cumulation, out)               │                │
  │  │                                              │                │
  │  │  你的实现会检查 cumulation 中是否有足够的数据：│                │
  │  │  - 知道消息头的长度吗？先看够不够头长度               │                │
  │  │  - 从头部读出消息体长度                          │                │
  │  │  - cumulation 的长度 ≥ 头长 + 体长？               │                │
  │  │    → 是：读取一条完整消息，放入 out                │                │
  │  │    → 否：不放入 any thing，等更多数据              │                │
  │  └─────────────────────────────────────────────┘                │
  │                                                                  │
  │  ↓                                                               │
  │                                                                  │
  │  步骤 3：如果 out 不为空 → 将 out 中的消息传给下一个 Handler         │
  │  步骤 4：如果 out 不为空 → 再次调用 decode()（可能累积缓冲区中还有更多）  │
  │  步骤 5：如果 out 为空 → 等待更多数据                              │
  │                                                                  │
  │  ⚠️ 关键问题：cumulation 的大小                                  │
  │  如果对方频繁发送"半包"（每次都只能拼出半条消息），                    │
  │  cumulation 就会持续增长，但永远不会输出消息                        │
  │  这种情况叫"积累但不解码"，最终可能导致 OOM                        │
  │  解决方案：设置 maxFrameLength 防止无限增长                        │
  └──────────────────────────────────────────────────────────────────┘
```

### 常见问题排查

**问题 1：解码器不起作用，业务 Handler 仍然收到半包**

```
可能原因：解码器在 Pipeline 中的位置不对

  ❌ 错误的 Pipeline 顺序：
  pipeline.addLast("business", new BusinessHandler());  // 业务 Handler 先添加
  pipeline.addLast("decoder", new LengthFieldBasedFrameDecoder(...));  // 解码器后添加

  消息处理流程：
  TCP 字节流 → BusinessHandler ← 直接收到未解码的半包！
                ↑ 业务 Handler 在解码器之前被执行
                因为 Pipeline 是从第一个 Handler 开始执行的

  ✅ 正确的 Pipeline 顺序：
  pipeline.addLast("decoder", new LengthFieldBasedFrameDecoder(...)); // 1. 先解码
  pipeline.addLast("business", new BusinessHandler());                  // 2. 再处理

  消息处理流程：
  TCP 字节流 → LengthFieldBasedFrameDecoder（解码）→ BusinessHandler（收到完整消息）
```

**问题 2：解码器配置了但整个消息被丢弃了**

```
可能原因：maxFrameLength 设置得太小

  你设置 maxFrameLength = 1024，但收到了 1500 字节的消息：
  → LengthFieldBasedFrameDecoder 发现消息超长
  → 它跳过整个消息（不放入 out），并记录一个异常
  → 跳过的字节从累积缓冲区中移除
  → 后面的消息"感觉"丢失了

  这种"跳过"机制是为了防止 OOM——如果 maxFrameLength 远小于实际消息
  累积缓冲区会无限增长，最终撑爆内存
  所以宁愿丢弃超长消息，也不冒险

  排查方法：在 LoggingHandler 中查看是否有"too large frame"的日志
```

**问题 3：解码后消息体少了几字节**

```
可能原因：initialBytesToStrip 设多了

  协议：[魔数 2B][长度 4B][消息体 N B][CRC 2B]
  你设 initialBytesToStrip = 8（明明总头=2+4+2=8B）

  解码后送到下一个 Handler 的 ByteBuf：
  → 恰好，正是 N 字节的消息体 ✓（正确）

  但如果你设 initialBytesToStrip = 10：
  → 解码器切掉了 10 字节
  → 送到下一个 Handler 的是 N-2 字节
  → 消息体被"咬掉"了 2 字节！数据损坏
```

---

## 本章总结

| 解码器 | 边界识别方式 | 适用场景 | 典型配置 |
|--------|------------|---------|---------|
| **LineBasedFrameDecoder** | 换行符 `\n` / `\r\n` | 文本协议、Redis 协议 | maxLength |
| **DelimiterBasedFrameDecoder** | 自定义分隔符 | 简单的分隔符协议 | delimiter, maxLength |
| **FixedLengthFrameDecoder** | 固定字节长度 | 老系统、工控协议 | frameLength |
| **LengthFieldBasedFrameDecoder** | 头部的长度字段 | **自定义二进制协议（99% 场景）** | 5 个参数 |

**核心原则**：
1. **TCP 粘包/半包不是 Bug，是特性**——TCP 保证的是"字节的可靠性"，不是"消息的完整性"。你必须在应用层解决消息边界问题
2. **解码器必须放在 Pipeline 的最前面**——后续所有 Handler 都依赖于解码器提供完整的消息。一个常见的低级错误是顺序放反了
3. **LengthFieldBasedFrameDecoder 解决 99% 的问题**——几乎所有自定义协议都可以用这个解码器适配。5 个参数看着复杂，但只要理解了"协议的结构"，配置就不难
4. **maxFrameLength 是安全防线**——设置合理的上限（比如 1MB），防止畸形报文或 Bug 导致累积缓冲区无限增长。这是防御性编程的基本要求