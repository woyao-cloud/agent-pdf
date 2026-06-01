以下为您构思的《Spring Boot 可观测性实战：深度集成 EFK/ELK 与全链路日志架构》书籍大纲。

本书定位为 **“开箱即用的实战指南”**，摒弃空洞理论，以一个完整的电商微服务（订单、库存、用户）为演示背景，带领读者从零搭建企业级日志与可观测性平台。本书所有代码、配置文件、Docker Compose 脚本均配套提供完整的 GitHub 仓库结构。

---

# 《Spring Boot 可观测性实战：深度集成 EFK/ELK 与全链路日志架构》

## 导读与配套资源说明
* **本书配套代码仓库结构全景**（`springboot-efk-elk-in-action`）
* **环境准备**：Docker Desktop / Linux 虚拟机最低配置要求
* **技术栈版本基线**：Spring Boot 3.2+, Elasticsearch 8.x, Kibana 8.x, Logstash 8.x, Filebeat/Fluent Bit, Kafka 3.x

---

## 第一部分：架构设计与基础设施搭建 (Infra)
*本部分解决“怎么搭”的问题，提供一键启动的企业级中间件集群。*

### 第1章 日志架构演进与选型决策
* 1.1 从 `tail -f` 到集中式日志：微服务时代的日志痛点
* 1.2 ELK vs EFK：Logstash 与 Fluentd/Fluent Bit 的深度对比与选型
* 1.3 企业级高可用日志架构图解（App -> Agent -> Kafka -> Aggregator -> ES）
* 1.4 【实操】规划本项目的网络拓扑与端口映射表

### 第2章 一键拉起基础设施 (Docker Compose 实战)
* 2.1 宿主机内核参数调优（`vm.max_map_count`、文件描述符限制）
* 2.2 【核心配置】编写企业级 `docker-compose.yml`
  * *包含：3节点 ES 集群、Kibana、Kafka + Zookeeper/KRaft、Logstash*
* 2.3 目录挂载与权限管理（解决 Docker 卷挂载导致的 ES 启动报错）
* 2.4 验证集群健康状态与 Kibana 初始化配置
* **【实操产出】**：完整的 `infra/docker-compose.yml` 及 `.env` 环境变量文件

---

## 第二部分：Spring Boot 应用端改造 (Application)
*本部分解决“怎么打日志”的问题，规范应用端输出，为后续检索打下完美基础。*

### 第3章 日志规范化与 JSON 结构化输出
* 3.1 为什么必须输出 JSON？（告别低效的 Grok 正则解析）
* 3.2 引入 `logstash-logback-encoder` 依赖
* 3.3 【核心配置】深度定制 `logback-spring.xml`
  * 控制台彩色输出与文件 JSON 输出的双 Appender 配置
  * 日志滚动策略（按天+按大小）与历史清理
* 3.4 统一异常处理（`@RestControllerAdvice`）与错误日志规范

### 第4章 全链路追踪：MDC 与 TraceId 注入
* 4.1 跨微服务排障的噩梦：如何串联分散的日志？
* 4.2 基于 Spring Boot 3 + Micrometer Tracing 的链路追踪集成
* 4.3 【核心代码】自定义 Servlet Filter / Spring Interceptor 注入 `traceId` 和 `spanId` 到 MDC
* 4.4 业务上下文注入：将 `userId`、`tenantId` 无缝织入日志
* **【实操产出】**：标准化的 `logback-spring.xml` 与 `TraceIdFilter.java` 模板代码

---

## 第三部分：日志采集、路由与清洗 (Agent & Pipeline)
*本部分解决“怎么搬数据”的问题，涵盖轻量级与重量级两种主流方案。*

### 第5章 方案 A：轻量级直连 (Filebeat -> Elasticsearch)
* 5.1 Filebeat 的 Harvester 与 Spooler 机制
* 5.2 【核心配置】编写 `filebeat.yml`
  * 抓取 Spring Boot JSON 日志并自动解析 (`json.keys_under_root`)
  * 附加 K8s/Docker 元数据 (Add Docker Metadata)
  * 配置 Ingest Pipeline 进行轻量级字段转换
* 5.3 适用场景与局限性分析

### 第6章 方案 B：企业级高吞吐架构 (Filebeat -> Kafka -> Logstash -> ES)
* 6.1 引入 Kafka 缓冲层的必要性（削峰填谷、防雪崩）
* 6.2 【核心配置】Filebeat 输出到 Kafka Topic 的配置
* 6.3 【核心配置】Logstash 消费 Kafka 并清洗数据 (`logstash.conf`)
  * Input: Kafka 消费组配置与反序列化
  * Filter: 基于 Ruby 脚本或 Grok 的复杂数据脱敏（如隐藏手机号、身份证）
  * Filter: 根据日志级别（ERROR/INFO）动态路由到不同的 ES 索引
  * Output: 批量写入 ES 与死信队列（DLQ）兜底配置
* **【实操产出】**：完整的 `filebeat.yml` 与 `logstash/pipeline/logstash.conf`

### 第7章 方案 C：云原生标配 (Fluent Bit 边缘采集)
* 7.1 为什么 K8s 环境首选 Fluent Bit 而非 Fluentd？
* 7.2 【核心配置】编写 `fluent-bit.conf` 与 `parsers.conf`
* 7.3 利用 Fluent Bit 的 Lua 脚本进行高级日志改写
* 7.4 Fluent Bit 内存缓冲与文件系统缓冲（防丢失）调优

---

## 第四部分：存储、检索与可视化 (Storage & UI)
*本部分解决“怎么存、怎么查、怎么看”的问题。*

### 第8章 Elasticsearch 索引设计与生命周期管理 (ILM)
* 8.1 拒绝 Mapping 爆炸：设计严格的 Index Template
* 8.2 【核心配置】定义 `index-template.json` (定义 text/keyword/date 类型，关闭动态映射)
* 8.3 存储降本增效：配置 Hot-Warm-Cold 冷热分离架构
* 8.4 【核心配置】编写 ILM 策略（Rollover 滚动、Shrink 收缩、Delete 删除）

### 第9章 Kibana 数据探索与大屏实战
* 9.1 创建 Data View (原 Index Pattern) 与字段格式化
* 9.2 KQL (Kibana Query Language) 高级查询语法速成
* 9.3 【实战】搭建“微服务健康度实时监控大屏”
  * 指标 1：各服务 ERROR 日志趋势图 (Lens)
  * 指标 2：Top 10 耗时接口聚合分析
  * 指标 3：基于 TraceId 的瀑布流链路查看 (APM 视图)

### 第10章 智能告警与自动化运维
* 10.1 Kibana Alerting 机制原理
* 10.2 【实战】配置“核心接口 5 分钟内错误率 > 1%”的告警规则
* 10.3 集成企业微信/钉钉/飞书 Webhook 实现告警推送
* 10.4 告警降噪：抑制风暴与静默期配置

---

## 第五部分：典型业务场景深度实战 (Scenarios)
*本部分将日志系统融入具体业务，发挥数据的最大价值。*

### 第11章 场景一：全链路排障与“客诉秒级定位”
* 11.1 业务痛点：客服接到投诉，开发查日志需要半小时
* 11.2 解决方案：基于 `userId` 或 `orderId` 在 Kibana 一键拉出跨 3 个微服务的完整调用链日志
* 11.3 代码演示：在 Feign Client / RestTemplate 拦截器中透传 TraceId

### 第12章 场景二：安全审计与合规日志 (防篡改)
* 12.1 业务痛点：财务/操作审计日志需要长期保存，且不能被应用侧修改
* 12.2 解决方案：应用端通过 Kafka 发送审计事件，Logstash 路由至独立的“审计索引”
* 12.3 ES 端配置：利用 ILM 将冷数据归档至 S3/MinIO，并开启索引只读（Read-Only）

### 第13章 场景三：基于日志的实时业务指标监控 (伪 BI)
* 13.1 业务痛点：埋点上报慢，想看实时的大促订单量
* 13.2 解决方案：Logstash 解析业务日志中的 `order_amount`，利用 ES 聚合功能
* 13.3 Kibana 实战：构建实时 GMV (商品交易总额) 翻牌器与地域分布热力图

---

## 第六部分：生产排坑、典型问题与性能调优 (Troubleshooting)
*本部分是“老中医”经验传承，直击生产环境最头疼的疑难杂症。*

### 第14章 采集端与缓冲层典型问题
* 14.1 **问题**：Filebeat 注册表 (Registry) 损坏导致日志重复采集或漏采
  * *解决*：Registry 备份机制与 `clean_removed` 策略
* 14.2 **问题**：Kafka 消费 Lag 持续飙升，Logstash 处理不过来
  * *解决*：Logstash `pipeline.workers` 与 `batch.size` 调优，排查 Grok 正则灾难
* 14.3 **问题**：单条日志过大（如超长 SQL 或异常堆栈）导致 Agent OOM
  * *解决*：配置 `max_bytes` 截断与多行日志（Multiline）合并策略

### 第15章 Elasticsearch 写入与查询灾难
* 15.1 **问题**：`es_rejected_execution_exception` (写入线程池队列打满)
  * *解决*：Logstash 端指数退避重试，ES 端调整 `refresh_interval` 与 Translog 异步刷盘
* 15.2 **问题**：集群状态变 Yellow/Red，分片未分配 (Unassigned Shards)
  * *解决*：使用 `_cluster/allocation/explain` 诊断，处理磁盘 Watermark 水位线报警
* 15.3 **问题**：Kibana 查询超时 (Timeout) 或 OOM
  * *解决*：杜绝深度分页 (`from+size`)，改用 `search_after`；优化 DSL，将条件移入 `filter` 上下文利用缓存

### 第16章 JVM 与操作系统级调优 Checklist
* 16.1 ES JVM 堆内存设置的“50% 与 32GB 铁律”
* 16.2 禁用 Swap 的三种方法（`bootstrap.memory_lock` 验证）
* 16.3 文件系统选择（XFS vs EXT4）与 `mmapfs` 优化

---

## 附录
* **附录 A**：Spring Boot 日志打印规范与避坑指南（Do's and Don'ts）
* **附录 B**：Logstash 常用 Filter 插件与 Grok 正则速查表
* **附录 C**：Kibana KQL 与 Lucene 查询语法对照表
* **附录 D**：一键清理与重置 Docker 环境的 Shell 脚本 (`cleanup.sh`)
* **附录 E**：面试高频：日志架构与 ES 底层原理面试题解析

---

### 💡 本书特色说明（致读者）：
1. **拒绝碎片化**：市面上的教程往往只讲 ES 怎么装，或者 Logstash 怎么写。本书将 Spring Boot 代码、Agent 配置、Kafka 缓冲、ES 存储串联成一个**闭环的流水线**。
2. **代码即文档**：书中所有的 `docker-compose.yml`、`logback-spring.xml`、`logstash.conf` 均经过生产环境验证，读者可直接 Copy 到公司项目中进行微调使用。
3. **拥抱现代技术栈**：全面基于 **Spring Boot 3.x** (Jakarta EE) 和 **Elastic Stack 8.x** 编写，摒弃过时的 API 和配置，并引入 Fluent Bit 等云原生前沿组件。