# 附录 D：面试高频：时序数据库底层原理与 PromQL 陷阱面试题解析

## 基础概念

### Q1：Prometheus 的 Pull 模型和 Push 模型有什么区别？

**考察点：** 理解 Pull 模型的三大优势（健康自证明、服务发现、本地调试）。

**参考答案：**
- Pull 模型：Prometheus 主动从目标拉取数据，目标只需暴露 /metrics 端点
- Push 模型：Agent 主动上报，存在状态管理复杂、雪崩效应、服务发现困难三大痛点
- Pull 模型的最大优势是"健康自证明"——scrape 超时 = 目标宕机，不需要额外心跳

### Q2：什么是 Prometheus 的时间序列？它和关系型数据库的存储有什么区别？

**考察点：** 理解时间序列的本质和 Label 索引机制。

**参考答案：**
- 时间序列 = metric_name + labels + (timestamp, value) 组合
- 关系型数据库按行存储，查询用 WHERE 过滤；Prometheus 按时间序列存储，通过倒排索引定位
- 关系型的行数随数据量增长，Prometheus 的序列数只随 Label 组合数增长

## 高基数问题

### Q3：什么是高基数？为什么它会导致 OOM？

**考察点：** 理解 Cardinality 对 TSDB 的影响。

**参考答案：**
- 高基数指某个 Label 有大量取值（如 user_id 有 100 万）
- 每条 Label 组合=一条时间序列，总序列数 = ∏(所有 Label 基数)
- 每条序列在 TSDB 的倒排索引和 Head Block 中占用内存
- 序列数达到几百万时，内存被索引占满 → OOM

### Q4：如何排查和解决高基数问题？

**考察点：** 排障能力。

**参考答案：**
1. 排查：`promtool tsdb analyze` 查看 Top 10 高基数指标
2. 排查：`/api/v1/status/tsdb` API 查看 labelValueCountByLabelName
3. 紧急止血：`metric_relabel_configs` 中的 `labeldrop` 丢弃高危 Label
4. 长效方案：Label 基数预算、Review 机制、业务埋点规范

## PromQL 陷阱

### Q5：rate() 和 irate() 有什么区别？什么场景用哪个？

**考察点：** PromQL 函数理解。

**参考答案：**
- rate()：窗口内所有样本的平均速率，平滑但滞后，适合 QPS 趋势
- irate()：窗口内最后两样本的瞬时速率，敏感但锯齿，适合 CPU 突刺检测
- 选型原则：要宏观趋势用 rate，要瞬时检测用 irate

### Q6：为什么不能直接看 Counter 的原始值？

**考察点：** 理解 Counter 设计哲学。

**参考答案：**
- Counter 是单调递增的，只看原始值没有任何信息量
- 必须通过 rate() 或 increase() 计算变化速率
- 例如 `http_requests_total` 原始值可能是 1 亿，但只有 5 QPS 才知道当前流量

### Q7：为什么 Summary 的分位数不能跨实例聚合？

**考察点：** 理解 Histogram vs Summary 的本质区别。

**参考答案：**
- Summary 在客户端计算分位数，只暴露 {quantile="0.95"} 的结果
- 跨实例聚合时，3 个 P95 的平均值不等于全局 P95
- Histogram 暴露 bucket/_sum/_count，可以在服务端重新计算分位数，所以可聚合

## 架构设计

### Q8：Prometheus 的单机瓶颈是什么？如何解决？

**考察点：** 高可用架构理解。

**参考答案：**
- 单机瓶颈：不能水平扩展、WAL 不防磁盘损坏、默认 retention 15 天
- 解决方案：Thanos（全局视图+对象存储）或 VictoriaMetrics（高压缩率+Remote Write）
- 选型：小规模用 VM，大规模跨集群用 Thanos

### Q9：Thanos 的核心组件有哪些？各自的作用是什么？

**考察点：** Thanos 架构理解。

**参考答案：**
- Sidecar：上传 Block 到对象存储
- Store Gateway：从对象存储读取历史数据
- Query：全局聚合查询
- Compactor：下采样和压缩历史 Block

### Q10：怎么设计一个有效的告警规则？

**考察点：** 告警设计能力。

**参考答案：**
1. 必须加 `for` 持续时间，避免瞬时抖动触发告警
2. 多级阈值（warning/critical），预留响应时间
3. 使用 Inhibition 抑制级联告警
4. 告警内容要包含有用的 labels 和 annotations
5. 分组配置避免告警风暴