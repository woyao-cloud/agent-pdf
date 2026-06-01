# 第7章 TCP 粘包/半包的本质与 Netty 解码器矩阵

## 7.1 为什么会产生粘包/半包？

### TCP 是流式协议，不是消息协议

TCP 是**面向流**的协议——它不关心你发送的是什么消息，只负责把字节流可靠地从一端传输到另一端。这是粘包/半包问题的**根本原因**。

```
粘包/半包的直观理解：

  应用程序发送：
  ┌──────┐┌──────┐┌──────┐
  │消息 A ││消息 B ││消息 C │
  └──────┘└──────┘└──────┘

  TCP 实际接收（可能的情况）：
  情况 1（粘包）：┌──────────┐┌──────┐      ← A+B 粘在一起
                  │消息 A消息B││消息 C │
                  └──────────┘└──────┘

  情况 2（半包）：┌────┐┌────────┐┌───┐   ← A 被拆成两半
                  │消息A││消息A剩余││消息 C│
                  └────┘└────────┘└───┘

  情况 3（正常）：┌──────┐┌──────┐┌──────┐
                  │消息 A││消息 B││消息 C│
                  └──────┘└──────┘└──────┘
```

### 产生粘包的三个原因

```
原因一：Nagle 算法（TCP 默认开启）
  ┌────────────────────────────────────────────┐
  │  Nagle 算法的目的：减少小包传输              │
  │                                             │
  │  应用程序：write("H") write("e") write("l") │
  │  正常发送：3 个 TCP 包（每个 1 字节）        │
  │  Nagle 合并：1 个 TCP 包 "Hel"（等更多数据） │
  │  → 多个小消息被合并为一个包 = 粘包           │
  └────────────────────────────────────────────┘

原因二：TCP 滑动窗口
  ┌────────────────────────────────────────────┐
  │  接收方窗口大小 = 4096 字节                  │
  │  发送方发了 6000 字节 → 分两批发送           │
  │  第一批 4096 字节（填满窗口）                │
  │  第二批 1904 字节（等待窗口释放）            │
  │  → 一个消息被拆成两次发送 = 半包             │
  └────────────────────────────────────────────┘

原因三：MTU 限制
  ┌────────────────────────────────────────────┐
  │  以太网 MTU = 1500 字节                     │
  │  IP 头 + TCP 头 = 40 字节                   │
  │  最大 TCP 数据段 = 1460 字节                 │
  │                                              │
  │  如果你一次发送 5000 字节：                    │
  │  → IP 层必须分片：1460 + 1460 + 1460 + 220  │
  │  → 接收方重组 → 整包到达应用层               │
  │     （重组是 IP 层的功能，我们感知不到分片）   │
  └────────────────────────────────────────────┘
```

### 为什么 Netty 需要解码器？

```
没有解码器的后果：
  收到 bytes: [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x48, 0x69]

  不知道消息边界：
  是 "Hello" + "Hi"？（2 条消息）
  还是 "HelloHi"？（1 条消息）
  还是 "Hel" + "loHi"？（2 条半包）

  没有解码器的 Pipeline：
  TCP 流 → [4字节] → [3字节] → [5字节] → ...
  你根本不知道哪些字节属于哪条消息！
```

**Netty 的解码器就是解决这个问题的**——它知道何时"一条完整的消息"已经到达。

---

## 7.2 Netty 内置解码器实战

### LineBasedFrameDecoder（换行符分隔）

用换行符 `\n` 或 `\r\n` 作为消息边界：

```
适用场景：Redis 协议、简单的文本协议

  数据流：
  ┌──────────┐┌──────────┐┌──────────┐
  │ msg1\n   ││ msg2\n   ││ msg3\n   │
  └──────────┘└──────────┘└──────────┘

  LineBasedFrameDecoder 解析后：
  ["msg1", "msg2", "msg3"]
```

```java
pipeline.addLast(new LineBasedFrameDecoder(1024)); // 最大 1KB
pipeline.addLast(new StringDecoder()); // 字节 → 字符串
// 然后你的 Handler 拿到的就是完整的 "msg1"
```

### DelimiterBasedFrameDecoder（自定义分隔符）

与 LineBasedFrameDecoder 类似，但分隔符可自定义：

```java
// 使用自定义分隔符 "$$"
ByteBuf delimiter = Unpooled.copiedBuffer("$$".getBytes());
pipeline.addLast(new DelimiterBasedFrameDecoder(1024, delimiter));
pipeline.addLast(new StringDecoder());
// 输入：msg1$$msg2$$msg3$$
// 输出：["msg1", "msg2", "msg3"]
```

### FixedLengthFrameDecoder（固定长度）

每条消息都是固定长度，很少用，但在某些老系统中存在：

```java
// 每条消息固定 100 字节
pipeline.addLast(new FixedLengthFrameDecoder(100));
// 输入：100字节+100字节+100字节
// 输出：[3 条完整的 100 字节消息]
```

### LengthFieldBasedFrameDecoder（基于长度字段）⭐⭐⭐

这是 Netty **最重要的解码器**——基于消息头中的长度字段来分割消息，可以解决 99% 的自定义协议粘包问题：

```
LengthFieldBasedFrameDecoder 的 5 个参数：

  ┌──────────────────────────────────────────────────────┐
  │  完整消息包：                                          │
  │  ┌──────────┬────────────┬────────────────────────┐  │
  │  │ 魔数+版本 │  长度字段    │   消息体               │  │
  │  │ (3B)     │  (4B)      │   (N B)               │  │
  │  └──────────┴────────────┴────────────────────────┘  │
  │             ↑                                        │
  │        lengthFieldOffset=3                           │
  │        lengthFieldLength=4                           │
  │        lengthAdjustment=0                            │
  │        initialBytesToStrip=7 (跳过整个头)             │
  └──────────────────────────────────────────────────────┘

  示例配置：自定义 RPC 协议
  [魔数 2B][版本 1B][消息长度 4B][消息体 N B]
  
  maxFrameLength:      65535  (最大消息长度)
  lengthFieldOffset:   3      (长度字段从第 3 字节开始)
  lengthFieldLength:   4      (长度字段占 4 字节)
  lengthAdjustment:    0      (长度字段的值就是消息体长度，不需要调整)
  initialBytesToStrip: 7      (解码后剥离整个包头，只保留消息体)
```

```java
/**
 * 自定义 RPC 协议解码器
 *
 * 协议格式：[魔数 2B][版本 1B][消息长度 4B][消息体 N B]
 *          └──── 包头 7B ────┘└──── 消息体 ────┘
 */
public class RpcDecoderInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    protected void initChannel(SocketChannel ch) {
        ChannelPipeline p = ch.pipeline();

        // 基于长度字段的解码器——解决粘包/半包
        p.addLast(new LengthFieldBasedFrameDecoder(
            65535,      // maxFrameLength：最大帧长度
            3,          // lengthFieldOffset：长度字段起始偏移（跳过魔数+版本）
            4,          // lengthFieldLength：长度字段占 4 字节
            0,          // lengthAdjustment：长度调整（不调整）
            7           // initialBytesToStrip：跳过整个包头（魔数+版本+长度）
        ));

        // 解码后的 ByteBuf 是完整的消息体 → 反序列化
        p.addLast(new RpcMessageDecoder());
        p.addLast(new RpcBusinessHandler());
    }
}
```

### 解码器的高级用法：多个长度字段

```
更复杂的协议格式 - 带 CRC 校验：
  [魔数(2B)][命令(1B)][头部长(1B)][消息体长(4B)][消息体(N B)][CRC(2B)]
                                             ↑
  真正的消息体长度在这里，但前面多了额外的包头我们需要跳过

  lengthFieldOffset:      4   (消息体长度字段在第 4 字节)
  lengthFieldLength:      4   (4 字节表示长度)
  lengthAdjustment:       2   (长度字段值只包含消息体，但后面还有 2 字节 CRC)
  initialBytesToStrip:   10   (跳过所有包头 = 2+1+1+4+2)
```

---

## 7.3 Netty 解码器的内部工作原理

理解解码器的"内幕"有助于排查问题：

```
ByteToMessageDecoder 的工作循环：

  ┌─────────────────────────────────────────────────────────┐
  │  每次 channelRead() 被调用时：                            │
  │                                                          │
  │  1. 将收到的 ByteBuf 追加到内部累积缓冲区                  │
  │     cumulation.writeBytes(in);                           │
  │                                                          │
  │  2. 调用 decode() 方法，尝试从累积缓冲区中解码出消息        │
  │     decode(ctx, cumulation, out);                        │
  │                                                          │
  │  3. 如果 decode() 向 out 中添加了消息：                    │
  │     将这些消息传给下一个 Handler                          │
  │     → 继续调用 decode()（可能累积缓冲区中还有更多消息）    │
  │                                                          │
  │  4. 如果 decode() 没有添加消息（半包）：                   │
  │     等待更多数据到达，下次 channelRead 继续               │
  │                                                          │
  │  ┌─── 关键：cumulation 是一个动态增长的缓冲区 ────┐       │
  │  │  如果 cumulation 持续增长（说明总是半包），           │       │
  │  │  最终会 OOM！                                     │       │
  │  └────────────────────────────────────────────────┘     │
  └─────────────────────────────────────────────────────────┘
```

### 常见问题排查

```
问题 1：解码器不起作用，Handler 仍然收到半包
  原因：解码器的顺序不对
  正确：decoder → stringDecoder → businessHandler
  错误：stringDecoder → decoder → businessHandler（StringDecoder 先处理了）

问题 2：内存泄漏
  原因：LengthFieldBasedFrameDecoder 的 maxFrameLength 设置太小
        → 超过限制时，解码器会跳过这些字节
        → 跳过的字节没有被释放 → 累积 → OOM
  解决：增大 maxFrameLength，或确保不会收到超长消息

问题 3：解码后消息体少了字节
  原因：initialBytesToStrip 设置错误
  检查：打印消息体长度，与协议定义的长度字段对比
```

---

## 本章总结

| 解码器 | 适用场景 | 核心参数 |
|--------|---------|---------|
| LineBasedFrameDecoder | 换行符分隔的文本协议 | maxLength |
| DelimiterBasedFrameDecoder | 自定义分隔符协议 | delimiter, maxLength |
| FixedLengthFrameDecoder | 固定长度协议 | frameLength |
| **LengthFieldBasedFrameDecoder** | **自定义 RPC 协议（99% 场景）** | **四个长度字段参数** |

**核心原则**：
1. **TCP 粘包/半包不是 Bug，是特性**——TCP 保证的是"字节的可靠性"，不是"消息的完整性"
2. **解码器必须放在 Pipeline 的最前面**——其他 Handler 依赖于解码器提供的完整消息
3. **LengthFieldBasedFrameDecoder 解决 99% 的问题**——几乎所有自定义协议都可以用这个解码器适配
4. **maxFrameLength 是安全防线**——设置合理的上限防止畸形报文撑爆内存