# 第23章 工程实践能力

## 23.1 JDK集合源码阅读方法

### 阅读策略

**分层阅读法**：

```
第一层（接口层）：阅读Javadoc，理解设计意图和适用场景
第二层（字段层）：阅读核心字段，理解底层数据结构
第三层（方法层）：阅读核心方法（CRUD）的实现
第四层（优化层）：阅读边界处理和性能优化
第五层（设计层）：理解设计模式和架构决策
```

**阅读顺序建议**：
1. ArrayList（最简单的集合）
2. LinkedList（链表实现）
3. HashMap（最重要的集合）
4. ConcurrentHashMap（并发集合）
5. TreeMap（红黑树）

---

## 23.2 开源项目中的数据结构

### 知名项目的数据结构应用

| 项目 | 使用的数据结构 | 用途 |
|------|-------------|------|
| Netty | HashedWheelTimer | 定时器（时间轮） |
| Disruptor | RingBuffer | 无锁环形队列 |
| Guava | BloomFilter | 布隆过滤器 |
| Caffeine | W-TinyLFU | 缓存淘汰策略 |
| Flink | 跳跃表 | 窗口管理 |

---

## 23.3 生产环境问题排查

### 常见问题

| 症状 | 可能原因 | 排查工具/方法 |
|------|---------|-------------|
| CPU飙高 | 集合遍历频繁、hashCode差 | jstack + 火焰图 |
| 内存溢出 | 集合无限增长 | heap dump + MAT |
| 响应变慢 | 链表遍历/哈希冲突 | JFR + Arthas |
| 死锁 | 并发集合使用不当 | jstack + 线程分析 |

### 排查工具

```bash
# jstack: 查看线程栈（定位死锁、死循环）
jstack <pid>

# jmap: 查看堆内存（定位OOM）
jmap -heap <pid>

# jstat: GC监控
jstat -gcutil <pid> 1000

# Arthas: 在线诊断
# 查看方法调用（定位性能瓶颈）
trace com.example.MyService methodName
# 查看方法参数和返回值
watch com.example.MyService methodName '{params, returnObj}'
```

---

## 23.4 技术选型与风险评估

### 选型决策框架

```
需求分析
├── 功能满足度
├── 性能指标（TPS、延迟、内存）
├── 稳定性（社区活跃度、测试覆盖）
├── 兼容性（JDK版本、依赖）
└── 维护成本（学习曲线、代码量）
```

### 典型风险评估

| 风险 | 示例 | 缓解措施 |
|------|------|---------|
| 无序集合 | 用HashSet但需要顺序 | 确认使用场景 |
| 线程安全 | 多线程用HashMap | 切换到ConcurrentHashMap |
| 内存溢出 | 无界队列堆积 | 使用有界队列 |
| 性能退化 | hashCode不均匀 | 检查hashCode实现 |
| 容量不足 | 集合容量不够 | 监控扩容次数 |

---

> **本章总结**：优秀的工程师善于从JDK源码和开源项目中学习。生产环境问题的排查需要掌握jstack、jmap、Arthas等工具。技术选型需要平衡功能、性能、稳定性和维护成本。理解数据结构在真实系统中的应用，是理论知识与工程实践的结合点。