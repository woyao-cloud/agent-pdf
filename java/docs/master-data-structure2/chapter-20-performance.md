# 第20章 性能优化实战

## 20.1 数据结构选择原则

### 选择决策树

```
需要什么操作？
├── 快速查找 → HashMap（O(1)）
│   ├── 需要有序 → TreeMap（O(log n)）
│   └── 需要线程安全 → ConcurrentHashMap
├── 频繁插入/删除
│   ├── 首部操作 → LinkedList / ArrayDeque
│   └── 尾部操作 → ArrayList
├── 需要优先级
│   └── 优先级队列 → PriorityQueue
├── 字符串匹配
│   └── 前缀匹配 → Trie
└── 需要连通性判断 → Union-Find
```

## 20.2-20.5 性能优化

### 性能分析工具链

| 阶段 | 工具 | 用途 |
|------|------|------|
| 开发 | JMH | 微基准测试 |
| 测试 | JProfiler/VisualVM | CPU/内存分析 |
| 生产 | JFR + JDK Mission Control | 生产监控 |
| 在线 | Arthas | 在线诊断 |

### 内存优化技巧

- 使用基本类型避免自动装箱
- 预分配集合容量
- 使用EnumaMap/EnumSet代替HashMap
- 使用String.intern()减少重复字符串
- 使用软引用/弱引用缓存

### 并发数据结构选择

| 场景 | 推荐 |
|------|------|
| 高并发读 | CopyOnWriteArrayList |
| 高并发KV | ConcurrentHashMap |
| 并发队列 | LinkedBlockingQueue / ArrayBlockingQueue |
| 并发有序Map | ConcurrentSkipListMap |
| 原子计数器 | LongAdder（优于AtomicLong） |

---

> **本章总结**：数据结构的选择直接影响系统性能。遵循"先测量后优化"的原则，根据具体场景（数据量、操作类型、并发要求）选择最合适的数据结构。善用JMH、JFR、Arthas等工具，定位真正的性能瓶颈，而非凭感觉优化。