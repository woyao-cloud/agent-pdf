# 第16章 JVM 与操作系统级调优 Checklist

## 本章导读

"为什么我的 ES 集群经常卡死？"——这是 ES 运维中最常见的问题。绝大多数情况下，答案不是 ES 的 Bug，而是 **JVM 和操作系统配置不正确**。

ES 是一个对操作系统资源管理极其敏感的 Java 应用。下面这个案例非常典型：

某公司部署了一个 ES 集群，每台服务器 64GB 内存。运维人员按"默认设置"启动了 ES——JVM 堆大小是默认的 1GB。结果节点运行了半小时后开始频繁 Full GC，CPU 100%。运维改大了堆内存，直接设了 `-Xmx48g`（48GB）。结果更糟了——节点 OOM 了。

这里犯了两个错误：

- **第一次**：堆太小（1GB），频繁 GC
- **第二次**：堆太大（48GB），超过了 Java 的压缩指针上限（32GB），而且占用了操作系统的 PageCache 空间

正确的配置是：**-Xmx31g**（不超过 32GB 的最大安全值），**剩下的 33GB 留给操作系统做 PageCache**。

本章提供一份可以直接对照执行的调优清单。每一项都有明确的原理说明和推荐配置值。

---

## 16.1 JVM 堆内存设置的"两个铁律"

### 铁律一：堆内存不超过物理内存的 50%

ES（更确切地说是 Lucene）非常依赖操作系统的文件缓存（PageCache）。如果你把所有内存都给了 JVM 堆，PageCache 就没有内存可用。搜索请求命中 PageCache 时直接从内存读取，没命中时要从磁盘读取——延迟相差 1000 倍。

```
为什么必须留 50% 给操作系统？

  64GB 内存的服务器：

  配置 A（错误）：JVM 堆 48GB，PageCache 16GB
  ┌──────────────────────────────────────────────┐
  │  JVM Heap (48GB)     │  PageCache (16GB)      │
  │                       │                        │
  │  索引 Buffer:  5GB    │  Segment 缓存: 8GB     │
  │  查询结果缓存: 8GB    │  倒排索引:     4GB    │
  │  聚合内存:     5GB    │  DocValues:    3GB    │
  │  其他开销:     30GB   │  其他:         1GB     │
  │  (大量 GC 开销)      │                        │
  ├──────────────────────┼────────────────────────┤
  │  问题: 堆太大→GC 暂停长│ 问题: PageCache 太小   │
  │  频繁 Full GC        │  查询频繁读磁盘         │
  │  应用不稳定           │  查询延迟高             │
  └──────────────────────┴────────────────────────┘

  配置 B（正确）：JVM 堆 31GB，PageCache 33GB
  ┌──────────────────────┬────────────────────────┐
  │  JVM Heap (31GB)    │  PageCache (33GB)       │
  │                       │                        │
  │  索引 Buffer:  5GB   │  Segment 缓存: 15GB    │
  │  查询结果缓存: 5GB   │  倒排索引:     8GB     │
  │  聚合内存:     3GB   │  DocValues:    6GB     │
  │  其他:         18GB  │  其他:         4GB      │
  │  (GC 开销小)         │                        │
  ├──────────────────────┼────────────────────────┤
  │  堆适中→GC 暂停短    │  PageCache 充足         │
  │  Full GC 很少触发    │  查询命中缓存 > 90%     │
  │  应用稳定             │  查询延迟稳定           │
  └──────────────────────┴────────────────────────┘
```

### 铁律二：堆内存不超过 32GB（Compressed Oops 的极限）

Java 在堆内存小于 32GB 时，会启用 **Compressed Oops（压缩对象指针）**。普通对象指针是 64 位（8 字节），压缩后变成 32 位（4 字节）。这意味着：

```
Compressed Oops 的效果：

  堆内存 31GB（启用压缩）：
  ┌────────────────────────────────────────────┐
  │  每个对象引用: 4 字节（不是 8 字节）         │
  │  内存效率: 高                               │
  │  GC 效率: 高（更少的指针 = 更快的扫描）     │
  └────────────────────────────────────────────┘

  堆内存 33GB（禁用压缩）：
  ┌────────────────────────────────────────────┐
  │  每个对象引用: 8 字节（翻倍）                │
  │  内存效率: 低                               │
  │  同 33GB 堆实际能装的对象 ≈ 31GB 压缩堆      │
  │  多了 2GB 内存，但没多装任何东西！            │
  │  GC 效率: 低（每次 GC 多扫描 2 倍指针）     │
  └────────────────────────────────────────────┘
```

所以 **31GB 是 ES 的"最优堆大小"**（不超过 32GB 的整数，同时留有 JVM 自身的开销空间）。

```bash
# config/jvm.options —— ES JVM 配置（64GB 物理机）
# 堆内存 = 31GB（不超过 32GB，开启压缩指针）
-Xms31g
-Xmx31g

# GC 使用 G1GC（ES 7.x+ 默认）
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200        # 目标 GC 暂停 200ms
-XX:G1ReservePercent=25          # 预留 25% 空间防止晋升失败
-XX:InitiatingHeapOccupancyPercent=30  # G1 开始并发标记的阈值

# Logstash 的 JVM（通常 2GB-4GB 就够了）
# config/jvm.options
-Xms2g
-Xmx2g
```

### 物理内存 vs 堆大小的速查表

```bash
# 物理内存     ES 堆大小     PageCache     Logstash 堆
# 16GB          8GB           7.5GB       1GB
# 32GB         16GB          15.5GB       1-2GB
# 64GB         31GB          32.5GB       2-4GB
# 128GB        31GB          96.5GB       4-8GB
# 256GB        31GB         224.5GB       4-8GB

# 注意: 物理内存 > 64GB 时，堆仍然不超过 31GB
# 剩余内存全部给 PageCache
# 大内存机器可以跑多个 ES 节点
```

---

## 16.2 禁用 Swap 的三种方法

Swap（交换分区）的本质是用磁盘模拟内存。当物理内存不足时，操作系统把一部分内存数据写入磁盘（swap out），需要时再读回来（swap in）。**但对于 ES，使用 Swap 是灾难性的**——搜索操作需要访问大量内存数据，如果这些数据被 swap out 到了磁盘，每次访问都变成磁盘 I/O，延迟从纳秒级变成毫秒级：

```
Swap 开启时 ES 的性能表现：

  正常情况（无 Swap）：
  搜索请求 → 访问倒排索引（在 PageCache 中）→ 纳秒级
  搜索请求 → 访问 DocValues（在 PageCache 中）→ 纳秒级

  有 Swap 的情况：
  ES 进程被 swap out → 搜索请求 → 内存访问 → 缺页异常
  → 从磁盘读回 swap 数据 → 毫秒级（慢 100 万倍）
  → 同时其他请求排队等待
  → 整个集群响应变慢
```

```bash
# 方法 1：操作系统级关闭 Swap（最彻底）
# 临时关闭
sudo swapoff -a

# 永久关闭（/etc/fstab 中注释掉 swap 行）
# 注释或删除 /etc/fstab 中包含 swap 的行
# UUID=xxxx-xxx  swap  swap  defaults  0  0
# 或者用 sed 命令
sudo sed -i '/swap/s/^/#/' /etc/fstab

# 验证 swap 是否已关闭
free -h
# 输出中的 Swap total 应该为 0

# 方法 2：ES 配置 bootstrap.memory_lock
# elasticsearch.yml
bootstrap.memory_lock: true

# 验证 memory_lock 是否生效
# 调用 ES API
GET _nodes/stats/process?filter_path=**.mlockall

# 期望输出：
# {
#   "nodes": {
#     "node-1": { "process": { "mlockall": true } }
#   }
# }
# 如果返回 false，说明配置没生效

# 方法 3：Docker 环境中的 ulimits 配置
# 在 docker-compose.yml 中必须设置 memlock
services:
  es-node1:
    image: elasticsearch:8.12.0
    ulimits:
      memlock:
        soft: -1        # -1 = 不限制
        hard: -1
    environment:
      - bootstrap.memory_lock=true
```

---

## 16.3 文件系统选择与挂载优化

### XFS vs EXT4

ES 官方推荐的两种文件系统，优先选择 XFS：

```
XFS vs EXT4 在 ES 场景下的对比：

  XFS（推荐）：
  ┌────────────────────────────────────────────┐
  │  特点：大文件性能好                          │
  │  ES 的 Segment 文件通常几百 MB 到数 GB      │
  │  XFS 对大文件的分配和删除效率更高             │
  │  并发 I/O 性能更好                          │
  │  推荐用于索引数据的目录                      │
  └────────────────────────────────────────────┘

  EXT4：
  ┌────────────────────────────────────────────┐
  │  特点：小文件性能好                          │
  │  适合存储小的配置文件                        │
  │  在大文件场景下不如 XFS                     │
  │  可以用，但不推荐用于 ES 的数据目录           │
  └────────────────────────────────────────────┘
```

### 挂载参数优化

```bash
# ES 数据目录的推荐挂载参数
# /etc/fstab

# XFS 格式的 ES 数据盘
/dev/sda1 /data/es xfs defaults,noatime,nodiratime,allocsize=1m 0 0

# 参数说明：
# noatime:        不更新文件访问时间（减少写 I/O）
# nodiratime:     不更新目录访问时间（减少写 I/O）
# allocsize=1m:   预分配 1MB 块（减少文件碎片，提高大文件性能）
# nobarrier:      禁用写屏障（XFS 默认已禁用，不需要显式指定）

# 挂载后验证
mount | grep /data/es
# 输出应包含 noatime,nodiratime
```

### mmapfs 优化

ES 使用 `mmap` 映射索引文件到内存（映射到 PageCache）。mmap 的默认配置对 ES 来说太小，必须调大：

```bash
# ES 必需的 vm.max_map_count 配置
# 默认值 65530 不够 ES 使用
# ES 官方要求至少 262144

# 临时修改
sudo sysctl -w vm.max_map_count=262144

# 永久修改
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 查看当前值
sysctl vm.max_map_count
# 输出: vm.max_map_count = 262144
```

---

## 16.4 完整调优 Checklist

```bash
#!/bin/bash
# es-tuning-check.sh —— ES 调优验证脚本
# 检查所有关键配置是否已正确设置

echo "===== ES 调优检查 ====="
echo ""

# 1. 检查 vm.max_map_count
echo "1. vm.max_map_count:"
CURRENT_MAP=$(sysctl -n vm.max_map_count)
if [ "$CURRENT_MAP" -ge 262144 ]; then
  echo "   ✅ $CURRENT_MAP (>= 262144)"
else
  echo "   ❌ $CURRENT_MAP (< 262144, 需要执行 sysctl -w vm.max_map_count=262144)"
fi

# 2. 检查 Swap
echo "2. Swap 状态:"
SWAP_USED=$(free -m | grep Swap | awk '{print $3}')
if [ "$SWAP_USED" -eq 0 ]; then
  echo "   ✅ Swap 已关闭"
else
  echo "   ❌ Swap 未关闭 (已使用 ${SWAP_USED}MB)"
fi

# 3. 检查 ES JVM 堆大小
echo "3. ES JVM 堆大小 (需要从节点 API 获取):"
curl -s http://localhost:9200/_nodes/stats/jvm?pretty 2>/dev/null | \
  jq -r '.nodes[] | "\(.name): \(.jvm.mem.heap_max_in_bytes / 1024 / 1024 / 1024)GB"'

# 4. 检查文件描述符限制
echo "4. 文件描述符限制:"
CURRENT_FD=$(ulimit -n)
if [ "$CURRENT_FD" -ge 65535 ]; then
  echo "   ✅ $CURRENT_FD (>= 65535)"
else
  echo "   ❌ $CURRENT_FD (< 65535)"
fi

echo ""
echo "===== 检查完成 ====="
```

---

## 本章总结

```yaml
调优速查表：

  配置项                   推荐值                        检查方法
  ───────────────────────────────────────────────────────────────────
  ES 堆内存                -Xms31g -Xmx31g              GET _nodes/stats/jvm
  Logstash 堆内存          -Xms2g -Xmx2g                查看进程参数
  vm.max_map_count         262144                        sysctl vm.max_map_count
  Swap                     关闭                          free -h
  bootstrap.memory_lock    true                          GET _nodes/stats/process
  文件描述符               ulimit -n 65535                ulimit -n
  文件系统                 XFS (noatime,nodiratime)       mount | grep noatime
```

**核心原则**——ES 调优一句话总结：
1. **堆内存给 31GB**（不超过 32GB 且不超过物理内存的 50%）
2. **禁用 Swap**（bootstrap.memory_lock: true + swapoff -a）
3. **vm.max_map_count 设到 262144**（否则 mmap 文件时可能出错）
4. **文件系统用 XFS**（上 noatime 挂载参数）