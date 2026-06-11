# 附录：术语表

## SRE 核心术语

| 术语 | 英文 | 解释 |
|------|------|------|
| 可用性 | Availability | 服务正常工作时间的比例，通常用"几个九"表示 |
| 错误预算 | Error Budget | SLO 允许的不可用时间上限 |
| 错误率 | Error Rate | 请求失败的比例 |
| 延迟 | Latency | 请求处理所需的时间 |
| 分位数 | Percentile | 将数据按大小排序后的百分比位置 |
| 监控 | Monitoring | 预设指标的收集和告警 |
| 可观测性 | Observability | 通过数据探索未知问题的能力 |
| 事后复盘 | Postmortem | 事件后的系统性回顾分析 |
| 恢复点目标 | RPO | 可容忍的最大数据丢失量 |
| 恢复时间目标 | RTO | 可容忍的最大服务中断时间 |
| 服务水平指标 | SLI | 服务质量的量化测量值 |
| 服务水平目标 | SLO | 服务质量的内部目标值 |
| 服务水平协议 | SLA | 服务质量的对外合同承诺 |
| SRE | Site Reliability Engineering | 站点可靠性工程 |
| 吞吐量 | Throughput | 单位时间内处理的请求量 |
| 琐事 | Toil | 重复性的、手动的运维操作 |

## GCP 服务术语

| 术语 | 英文 | 解释 |
|------|------|------|
| Cloud Armor | Cloud Armor | GCP 的 Web 应用防火墙和 DDoS 防护服务 |
| Cloud CDN | Cloud CDN | GCP 的内容分发网络服务 |
| Cloud Functions | Cloud Functions | GCP 的事件驱动无服务器计算服务 |
| Cloud KMS | Cloud Key Management Service | GCP 的密钥管理服务 |
| Cloud Load Balancing | Cloud Load Balancing | GCP 的分布式负载均衡服务 |
| Cloud Logging | Cloud Logging | GCP 的日志收集和分析服务 |
| Cloud Monitoring | Cloud Monitoring | GCP 的监控和告警服务 |
| Cloud Profiler | Cloud Profiler | GCP 的持续性能分析服务 |
| Cloud Run | Cloud Run | GCP 的无服务器容器平台 |
| Cloud Scheduler | Cloud Scheduler | GCP 的定时任务服务 |
| Cloud SQL | Cloud SQL | GCP 的托管关系型数据库服务 |
| Cloud Storage | Cloud Storage | GCP 的对象存储服务 |
| Cloud Trace | Cloud Trace | GCP 的分布式追踪服务 |
| Cloud VPN | Cloud VPN | GCP 的托管 VPN 服务 |
| Compute Engine | Compute Engine | GCP 的虚拟机服务 |
| Firestore | Firestore | GCP 的 NoSQL 文档数据库 |
| GKE | Google Kubernetes Engine | GCP 的托管 Kubernetes 服务 |
| IAM | Identity and Access Management | GCP 的身份和访问管理 |
| MIG | Managed Instance Group | GCP 的托管实例组 |
| Secret Manager | Secret Manager | GCP 的密钥管理服务 |
| Spanner | Cloud Spanner | GCP 的全球分布式关系型数据库 |
| VPC | Virtual Private Cloud | GCP 的虚拟私有云网络 |

## Kubernetes 术语

| 术语 | 英文 | 解释 |
|------|------|------|
| Pod | Pod | Kubernetes 中最小的部署单元 |
| Deployment | Deployment | 管理 Pod 副本的 Kubernetes 资源 |
| Service | Service | 提供网络访问的 Kubernetes 资源 |
| Ingress | Ingress | 管理外部访问的 Kubernetes 资源 |
| Namespace | Namespace | 集群内的逻辑隔离单元 |
| Node | Node | Kubernetes 集群中的工作节点 |
| Cluster | Cluster | Kubernetes 集群 |
| HPA | Horizontal Pod Autoscaler | Pod 水平自动扩缩容 |
| VPA | Vertical Pod Autoscaler | Pod 垂直自动扩缩容 |
| PDB | PodDisruptionBudget | Pod 中断预算 |
| ConfigMap | ConfigMap | 配置管理资源 |
| Secret | Secret | 敏感信息管理资源 |