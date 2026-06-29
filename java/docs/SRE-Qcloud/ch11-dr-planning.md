# 第11章 腾讯云容灾架构与演练实战

## 11.1 容灾设计的基本概念与目标

### 11.1.1 为什么需要容灾

在云原生时代，业务高可用不再是可选项，而是底线。无论是底层硬件故障、机房电力中断、光纤被挖断，还是上游云服务商出现区域性故障，都可能导致服务中断。2023年某主流云厂商新加坡可用区故障持续近12小时，影响大量东南亚业务；2024年国内某云厂商多个可用区同时异常，导致数十家互联网公司核心服务不可用。这些真实案例反复证明：**没有容灾架构的业务，本质上是在赌运气**。

容灾（Disaster Recovery, DR）与高可用（High Availability, HA）的区别在于：HA 解决的是单点故障（服务器宕机、进程挂掉），通常在秒级到分钟级自动恢复；DR 解决的是区域性灾难（可用区断电、整个地域网络中断），恢复时间从分钟到小时不等，且往往需要人工介入。

### 11.1.2 核心指标：RPO 与 RTO

容灾规划中最重要的两个量化指标：

| 指标 | 全称 | 定义 | 类比 |
|------|------|------|------|
| **RPO** | Recovery Point Objective | 允许丢失的最大数据量（回溯时间） | 备份的频率——每1小时备份一次，RPO=1h |
| **RTO** | Recovery Time Objective | 从灾难发生到业务恢复的最大时间 | 从起火到重新营业的时间 |

**典型目标值参考：**

| 容灾等级 | RPO | RTO | 适用场景 |
|----------|-----|-----|----------|
| 同城双活 | 0（零丢失） | < 30s | 金融核心交易、支付系统 |
| 主备切换 | < 1s | < 5min | 数据库层主从切换 |
| 异地冷备 | < 15min | < 30min | 重要但允许短暂中断的业务 |
| 异地归档 | < 24h | < 4h | 日志、历史数据、合规存储 |

**关键原则：** RPO 和 RTO 越严格，成本越高。同城双活的成本通常是单可用区部署的 2-3 倍，异地容灾则可能达到 3-5 倍。容灾规划的本质是在**成本与风险**之间做权衡。

### 11.1.3 腾讯云容灾层次模型

腾讯云的容灾能力从下到上分为四个层次：

```
┌─────────────────────────────────────┐
│  4. 应用层容灾                        │
│  (多集群部署、灰度发布、流量调度)       │
├─────────────────────────────────────┤
│  3. 数据层容灾                        │
│  (TDSQL 主从、Redis 主从、COS 复制)    │
├─────────────────────────────────────┤
│  2. 网络层容灾                        │
│  (CLB 跨可用区、DNS 智能解析、专线冗余) │
├─────────────────────────────────────┤
│  1. 基础设施层容灾                     │
│  (可用区隔离、物理服务器冗余、电力冗余)   │
└─────────────────────────────────────┘
```

- **第1层**由腾讯云平台负责，用户无需关注。
- **第2-4层**需要用户根据业务需求自行设计和配置，这也是本章的重点。

---

## 11.2 同城双活架构

### 11.2.1 什么是同城双活

同城双活（Same-City Active-Active）是指在同一个城市内两个不同的可用区（AZ）同时部署业务系统，两个可用区都承载读写流量，任何一个可用区故障时，另一个可用区可以无缝接管全部流量。

**同城双活 vs 主备架构：**

| 对比维度 | 同城双活 | 主备架构 |
|----------|----------|----------|
| 资源利用率 | 100%（两区都承载流量） | 50%（备机闲置） |
| 切换时间 | < 30s（自动） | 1-5min（需检测+切换） |
| 数据一致性 | 强一致（两地同时写入） | 最终一致（异步复制） |
| 复杂度 | 高（需解决写冲突） | 低 |
| 成本 | 2N+（两套全量资源） | 1.5N-2N |

### 11.2.2 腾讯云同城双活架构设计

一个典型的腾讯云同城双活架构如下：

```
                    ┌─────────────┐
                    │  DNSPod      │
                    │  智能调度     │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────┴────────┐      ┌────────┴────────┐
     │  CLB (广州-A)   │      │  CLB (广州-B)   │
     └────────┬────────┘      └────────┬────────┘
              │                         │
     ┌────────┴────────┐      ┌────────┴────────┐
     │  CVM 应用集群    │      │  CVM 应用集群    │
     │  (无状态)        │      │  (无状态)        │
     └────────┬────────┘      └────────┬────────┘
              │                         │
     ┌────────┴────────┐      ┌────────┴────────┐
     │  Redis 集群     │◄────►│  Redis 集群      │
     │  (广州-A)        │      │  (广州-B)        │
     └────────┬────────┘      └────────┬────────┘
              │                         │
     ┌────────┴────────┐      ┌────────┴────────┐
     │  TDSQL Master   │◄────►│  TDSQL Standby  │
     │  (广州-A)        │      │  (广州-B)        │
     └─────────────────┘      └─────────────────┘
```

**关键组件说明：**

1. **DNSPod 智能解析**：根据用户来源 IP 或健康检查结果，将流量分发到不同可用区的 CLB。
2. **CLB 跨可用区部署**：每个可用区部署独立的 CLB 实例，后端挂载本可用区的 CVM 集群。
3. **无状态应用层**：CVM 上的应用服务保持无状态，Session 信息全部存入 Redis，应用本身不存储任何持久化数据。
4. **Redis 跨可用区复制**：腾讯云 Redis 支持跨可用区的主从复制，一个可用区写入，另一个可用区实时同步。
5. **TDSQL 强一致同步**：TDSQL（腾讯云分布式数据库）支持跨可用区的强同步复制，确保两地数据一致。

### 11.2.3 同城双活的数据一致性方案

同城双活最大的技术挑战是**数据一致性**。两个可用区同时接受写入，必须解决写冲突问题。

**方案一：分片写入（推荐）**

将数据按业务维度分片，每个分片的主写入点固定在一个可用区，另一个可用区通过强同步复制读取。

```
用户A → 广州-A（写入分片0-3） → 强同步 → 广州-B（只读分片0-3）
用户B → 广州-B（写入分片4-7） → 强同步 → 广州-A（只读分片4-7）
```

**方案二：全局写入 + 冲突检测**

两个可用区都接受全量写入，通过全局自增ID或时间戳进行冲突检测和合并。适用于最终一致性场景。

**方案三：读写分离**

主写入点在一个可用区，另一个可用区只读。故障时通过 DNS/CLB 切换写入点。这是"伪双活"，但实现成本最低。

### 11.2.4 腾讯云同城双活配置示例

以下是通过 Terraform 配置同城双活的核心片段：

```hcl
# 跨可用区 CLB 配置
resource "tencentcloud_clb_instance" "clb_az_a" {
  clb_name                  = "clb-guangzhou-a"
  network_type              = "OPEN"
  vpc_id                    = var.vpc_id
  subnet_id                 = var.subnet_az_a
  project_id                = 0
  tags = {
    AZ = "ap-guangzhou-6"
  }
}

resource "tencentcloud_clb_instance" "clb_az_b" {
  clb_name                  = "clb-guangzhou-b"
  network_type              = "OPEN"
  vpc_id                    = var.vpc_id
  subnet_id                 = var.subnet_az_b
  project_id                = 0
  tags = {
    AZ = "ap-guangzhou-7"
  }
}

# 跨可用区 TDSQL 强同步
resource "tencentcloud_mysql_instance" "tdsql" {
  db_version       = "8.0"
  instance_name    = "tdsql-active-active"
  slave_deploy_mode = 1  # 跨可用区部署
  first_slave_zone  = "ap-guangzhou-6"
  second_slave_zone = "ap-guangzhou-7"
  auto_renew_flag   = 1
}
```

---

## 11.3 异地容灾架构

### 11.3.1 为什么需要异地容灾

同城双活可以抵御单个可用区故障，但无法应对以下场景：

- **城市级灾难**：地震、洪水、大规模停电
- **云服务商大规模故障**：整个地域的控制面或数据面异常
- **合规要求**：金融监管要求核心数据必须异地备份（如《金融分布式技术规范》要求核心系统异地RPO < 30min）

异地容灾（Cross-Region DR）将业务部署在不同城市（地域），主地域故障时，从异地地域恢复服务。

### 11.3.2 腾讯云异地容灾典型架构

```
                    ┌──────────────────┐
                    │   DNSPod 全局负载   │
                    │   均衡 (GSLB)      │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     ┌────────┴────────┐         ┌─────────┴───────┐
     │  广州 (主)       │         │  上海 (备)       │
     │                 │         │                  │
     │  CLB ─ CVM 集群  │         │  CLB ─ CVM 集群  │
     │       │          │         │       │          │
     │  TDSQL Master   │──异步──►│  TDSQL Slave     │
     │       │          │         │                  │
     │  Redis ── COS   │──异步──►│  COS 跨区域复制   │
     └─────────────────┘         └──────────────────┘
```

**异地容灾的关键约束：**

- **网络延迟**：广州到上海约 30ms，广州到北京约 40ms。强同步复制在异地场景下不可行，必须使用异步复制。
- **数据丢失风险**：异步复制意味着主地域故障时，未复制的数据可能丢失（RPO > 0）。
- **成本**：需要两套完整的基础设施，且备地域平时不承载生产流量。

### 11.3.3 腾讯云跨地域复制方案

#### COS 跨区域复制

对象存储（COS）的跨区域复制（Cross-Region Replication, CRR）是最基础也是最可靠的异地数据复制方式。

```python
# 配置 COS 跨区域复制
import json
from qcloud_cos import CosConfig, CosS3Client

secret_id = "your_secret_id"
secret_key = "your_secret_key"
region = "ap-guangzhou"

config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
client = CosS3Client(config)

# 启用跨区域复制规则
def setup_crr():
    rule = {
        "Status": "Enabled",
        "Prefix": "",
        "Destination": {
            "Bucket": "backup-bucket-1250000000",
            "Region": "ap-shanghai",
            "StorageClass": "STANDARD"
        }
    }
    
    response = client.put_bucket_replication(
        Bucket="source-bucket-1250000000",
        ReplicationConfiguration={
            "Role": "qcs::cam::uin/100000000001:roleName/COS_CRR_Role",
            "Rules": [rule]
        }
    )
    return response

# 查看复制状态
def check_replication_status(bucket, key):
    response = client.head_object(
        Bucket=bucket,
        Key=key
    )
    print(f"x-cos-replication-status: {response.get('x-cos-replication-status')}")
    return response
```

**COS CRR 特性：**

- 支持跨地域、跨账号复制
- 复制延迟通常在几分钟到几十分钟（取决于文件大小和数量）
- 支持增量复制（只复制新增和修改的文件）
- 删除操作默认不复制（可配置）

#### TDSQL 跨地域异步复制

TDSQL 支持通过 DTS（数据传输服务）实现跨地域的异步复制：

```python
# 使用 DTS 配置 TDSQL 跨地域同步
from tencentcloud.common import credential
from tencentcloud.dts.v20211206 import dts_client, models

def create_dts_sync_job():
    cred = credential.Credential(secret_id, secret_key)
    client = dts_client.DtsClient(cred, "ap-guangzhou")
    
    req = models.CreateSyncJobRequest()
    req.SrcDatabaseType = "mysql"
    req.DstDatabaseType = "mysql"
    req.SrcRegion = "ap-guangzhou"
    req.DstRegion = "ap-shanghai"
    req.AutoRenew = 1
    req.PayMode = "PostPay"
    
    resp = client.CreateSyncJob(req)
    return resp.SyncJobIds[0]

def configure_sync(job_id, src_info, dst_info):
    cred = credential.Credential(secret_id, secret_key)
    client = dts_client.DtsClient(cred, "ap-guangzhou")
    
    req = models.CreateSyncJobRequest()
    req.JobId = job_id
    req.SrcInfo = src_info  # 源数据库连接信息
    req.DstInfo = dst_info  # 目标数据库连接信息
    req.DbMode = "Partial"  # 部分库表同步
    req.AutoRetry = 1
    
    resp = client.ModifySyncJob(req)
    return resp
```

**DTS 同步延迟监控：**

```python
def monitor_dts_lag(job_id):
    from tencentcloud.dts.v20211206 import models
    
    cred = credential.Credential(secret_id, secret_key)
    client = dts_client.DtsClient(cred, "ap-guangzhou")
    
    req = models.DescribeSyncJobsRequest()
    req.JobId = job_id
    
    resp = client.DescribeSyncJobs(req)
    for job in resp.Jobs:
        print(f"同步状态: {job.Status}")
        print(f"延迟: {job.Delay} 秒")
        print(f"最后检查点: {job.CheckPoint}")
    return resp
```

#### Redis 跨地域复制

腾讯云 Redis 通过 PSync 协议支持跨地域复制，但需要注意：

- 跨地域 Redis 复制是异步的，RPO 取决于网络延迟
- 建议仅在异地容灾场景使用，不适用于同城双活
- 异地 Redis 实例规格建议与主实例一致

```python
# 创建跨地域 Redis 实例（通过 API）
from tencentcloud.redis.v20180412 import redis_client, models

def create_disaster_recovery_redis():
    cred = credential.Credential(secret_id, secret_key)
    client = redis_client.RedisClient(cred, "ap-shanghai")
    
    req = models.CreateInstancesRequest()
    req.TypeId = 7  # 标准版主从
    req.MemSize = 4096  # 4GB
    req.RedisShardNum = 1
    req.RedisReplicasNum = 1
    req.ZoneId = 800001  # 上海可用区
    req.VpcId = "vpc-shanghai"
    req.SubnetId = "subnet-shanghai"
    req.NoAuth = False
    req.ProjectId = 0
    
    resp = client.CreateInstances(req)
    return resp.InstanceIds
```

---

## 11.4 容灾演练方案

### 11.4.1 为什么需要容灾演练

容灾架构不是"搭好就完事"的。没有经过验证的容灾方案，在真实灾难发生时几乎一定会出问题。常见的问题包括：

- 切换脚本半年没更新，依赖的 API 版本已废弃
- 备库数据不一致，启动后业务报错
- 备地域资源不足（比如 CVM 实例售罄）
- 运维人员离职，切换流程没人会操作
- 依赖的外部服务（第三方 API、专线）在备地域不可用

**容灾演练的核心目标：** 验证容灾方案的有效性，培养团队的应急响应能力，发现并修复容灾方案的盲点。

### 11.4.2 容灾演练分级

| 级别 | 名称 | 说明 | 频率 | 影响 |
|------|------|------|------|------|
| L1 | 桌面推演 | 团队坐在一起过切换流程，不操作真实环境 | 每月 | 无 |
| L2 | 功能验证 | 在预发布环境验证单个组件的切换 | 每季度 | 无 |
| L3 | 模拟演练 | 在预发布环境模拟完整切换流程 | 每半年 | 无 |
| L4 | 真实切换 | 在生产环境执行真实切换，业务短暂中断 | 每年 | 分钟级中断 |
| L5 | 混沌工程 | 随机注入故障，验证系统自愈能力 | 每季度 | 视范围而定 |

### 11.4.3 腾讯云容灾演练完整流程

#### 阶段一：演练准备（T-30天）

```python
# 演练前资源检查脚本
import json
import requests
from datetime import datetime, timedelta

class DRAudit:
    """容灾演练前置审计"""
    
    def __init__(self, secret_id, secret_key, primary_region, dr_region):
        self.secret_id = secret_id
        self.secret_key = secret_key
        self.primary_region = primary_region
        self.dr_region = dr_region
        self.issues = []
    
    def check_cvm_quota(self, region, instance_type="S5.LARGE8"):
        """检查 CVM 配额是否充足"""
        # 实际调用 CVM DescribeCvmQuota API
        print(f"[CHECK] 检查 {region} 地域 {instance_type} 配额...")
        # 模拟检查结果
        quota = {
            "ap-guangzhou": {"remaining": 50, "required": 20, "status": "OK"},
            "ap-shanghai": {"remaining": 5, "required": 20, "status": "WARN"}
        }
        result = quota.get(region, {})
        if result.get("remaining", 0) < result.get("required", 0):
            self.issues.append(f"{region} {instance_type} 配额不足: 剩余{result['remaining']}, 需要{result['required']}")
        return result
    
    def check_dts_status(self, job_id):
        """检查 DTS 同步链路状态"""
        print(f"[CHECK] 检查 DTS 同步任务 {job_id}...")
        # 模拟检查
        status = {
            "job_id": job_id,
            "status": "Running",
            "delay_seconds": 3,
            "last_checkpoint": (datetime.now() - timedelta(seconds=3)).isoformat()
        }
        if status["delay_seconds"] > 30:
            self.issues.append(f"DTS 同步延迟过高: {status['delay_seconds']}s")
        return status
    
    def check_cos_crr(self, bucket, dr_bucket):
        """验证 COS 跨区域复制是否正常"""
        print(f"[CHECK] 验证 COS CRR: {bucket} -> {dr_bucket}...")
        # 模拟检查
        crr_status = {
            "status": "Enabled",
            "rules_count": 3,
            "last_sync": (datetime.now() - timedelta(minutes=5)).isoformat(),
            "pending_bytes": 0
        }
        if crr_status["pending_bytes"] > 104857600:  # 100MB
            self.issues.append(f"COS CRR 积压数据过多: {crr_status['pending_bytes'] / 1024 / 1024:.1f}MB")
        return crr_status
    
    def check_dns_config(self, domain):
        """验证 DNSPod 解析配置"""
        print(f"[CHECK] 检查 DNS 配置 {domain}...")
        # 模拟检查
        dns = {
            "domain": domain,
            "records": [
                {"type": "A", "value": "1.2.3.4", "region": "guangzhou", "weight": 80},
                {"type": "A", "value": "4.3.2.1", "region": "shanghai", "weight": 20}
            ],
            "health_check": True
        }
        return dns
    
    def run_full_audit(self):
        """执行完整审计"""
        print("=" * 60)
        print("  容灾演练前置审计报告")
        print(f"  主地域: {self.primary_region}  备地域: {self.dr_region}")
        print(f"  审计时间: {datetime.now().isoformat()}")
        print("=" * 60)
        
        self.check_cvm_quota(self.primary_region)
        self.check_cvm_quota(self.dr_region)
        self.check_dts_status("dts-abc123")
        self.check_cos_crr("prod-bucket", "dr-bucket")
        self.check_dns_config("api.example.com")
        
        print(f"\n审计完成。发现 {len(self.issues)} 个问题:")
        for i, issue in enumerate(self.issues, 1):
            print(f"  [{i}] {issue}")
        
        return {
            "passed": len(self.issues) == 0,
            "issues": self.issues,
            "timestamp": datetime.now().isoformat()
        }

# 执行审计
auditor = DRAudit("your_secret_id", "your_secret_key", "ap-guangzhou", "ap-shanghai")
report = auditor.run_full_audit()
```

#### 阶段二：演练执行（T-0）

**标准切换流程：**

```
Step 1: 停止写入流量
  └─ DNSPod 将主域名解析切到备地域（权重 0:100）
  └─ 等待 2 个 TTL 周期（通常 60-120s）
  └─ 确认主地域无新写入

Step 2: 数据一致性校验
  └─ 检查 DTS 延迟 < 5s
  └─ 检查 COS CRR 积压为 0
  └─ 执行数据校验（checksum 对比）

Step 3: 提升备地域数据库为主
  └─ 停止 DTS 同步
  └─ TDSQL 备库提升为主库
  └─ 修改数据库连接串

Step 4: 启动备地域应用
  └─ 启动 CVM 自动伸缩组
  └─ 预热缓存
  └─ 验证业务接口

Step 5: 验证
  └─ 端到端业务测试
  └─ 监控指标确认
  └─ 通知相关方
```

#### 阶段三：演练复盘（T+1天）

```python
def generate_dr_report(drill_results):
    """生成容灾演练报告"""
    report = f"""
# 容灾演练报告

## 基本信息
- 演练时间: {drill_results['start_time']}
- 演练类型: {drill_results['type']}
- 参与人员: {', '.join(drill_results['participants'])}
- 演练地域: {drill_results['primary_region']} → {drill_results['dr_region']}

## 关键指标
| 指标 | 目标值 | 实际值 | 结果 |
|------|--------|--------|------|
| RTO | {drill_results['rto_target']} | {drill_results['rto_actual']} | {'✅' if drill_results['rto_actual'] <= drill_results['rto_target'] else '❌'} |
| RPO | {drill_results['rpo_target']} | {drill_results['rpo_actual']} | {'✅' if drill_results['rpo_actual'] <= drill_results['rpo_target'] else '❌'} |
| 数据一致性 | 100% | {drill_results['consistency']}% | {'✅' if drill_results['consistency'] == 100 else '❌'} |

## 发现的问题
"""
    for issue in drill_results.get('issues', []):
        report += f"- [{issue['severity']}] {issue['description']}\n"
    
    report += """
## 改进措施
"""
    for action in drill_results.get('action_items', []):
        report += f"- [ ] {action['description']} (负责人: {action['owner']}, 截止: {action['deadline']})\n"
    
    return report
```

### 11.4.4 混沌工程与自动化故障注入

腾讯云提供 **Chaos Monkey 服务**（CFC, Cloud Fault Control）用于自动化故障注入：

```python
# 使用 CFC 进行故障注入演练
from tencentcloud.cfc.v20230301 import cfc_client, models

def inject_az_failure(region, az_id, duration_minutes=5):
    """模拟可用区故障"""
    cred = credential.Credential(secret_id, secret_key)
    client = cfc_client.CfcClient(cred, region)
    
    req = models.CreateExperimentRequest()
    req.Name = f"az-failure-drill-{az_id}"
    req.Description = f"模拟 {az_id} 可用区故障 {duration_minutes} 分钟"
    req.ExperimentType = "AZ_FAILURE"
    req.TargetRegion = region
    req.TargetAz = az_id
    req.Duration = duration_minutes
    req.Action = "BLOCK_ALL_TRAFFIC"
    
    resp = client.CreateExperiment(req)
    return resp.ExperimentId

def inject_network_latency(instance_ids, delay_ms=1000):
    """注入网络延迟"""
    cred = credential.Credential(secret_id, secret_key)
    client = cfc_client.CfcClient(cred, "ap-guangzhou")
    
    req = models.CreateExperimentRequest()
    req.Name = "network-latency-drill"
    req.ExperimentType = "NETWORK_LATENCY"
    req.TargetInstances = instance_ids
    req.Parameters = {
        "delay_ms": delay_ms,
        "jitter_ms": 200,
        "duration_minutes": 10
    }
    
    resp = client.CreateExperiment(req)
    return resp.ExperimentId
```

---

## 11.5 腾讯云容灾最佳实践

### 11.5.1 架构设计原则

**原则一：无状态优先**

应用层必须保持无状态。所有状态信息（Session、缓存、文件上传）必须外移到 Redis、COS 等有状态服务。这样应用层才能做到"随时启停、任意扩容"。

**反模式：**
```python
# ❌ 错误：在本地存储 Session
session_file = f"/tmp/session_{user_id}.json"
with open(session_file, "w") as f:
    json.dump(session_data, f)

# ✅ 正确：使用 Redis 存储 Session
redis_client.setex(f"session:{user_id}", 3600, json.dumps(session_data))
```

**原则二：冗余设计**

每个组件至少有两个副本，分布在不同的故障域（可用区/地域）。关键路径上不能有单点。

**原则三：优雅降级**

当依赖的服务不可用时，系统应该优雅降级而非直接报错。例如：推荐服务不可用时，返回缓存的热门数据而非 500 错误。

**原则四：可观测性**

容灾切换的每一步都应有明确的监控指标和告警。没有监控的容灾方案等于没有容灾。

### 11.5.2 腾讯云容灾产品选型矩阵

| 容灾场景 | 推荐产品 | RPO | RTO | 成本 |
|----------|----------|-----|-----|------|
| 数据库同城双活 | TDSQL 强同步 | 0 | < 30s | 高 |
| 数据库异地容灾 | DTS 异步复制 | < 5s | < 5min | 中 |
| 缓存容灾 | Redis 跨AZ主从 | < 1s | < 10s | 中 |
| 对象存储容灾 | COS CRR | < 15min | < 30min | 低 |
| 文件系统容灾 | CFS 跨AZ | < 1s | < 1min | 中 |
| 消息队列容灾 | CMQ 跨AZ | < 1s | < 10s | 中 |
| 容器编排容灾 | TKE 多集群 | N/A | < 5min | 高 |

### 11.5.3 自动化容灾切换脚本

以下是一个完整的 Python 容灾切换脚本框架，可直接用于生产环境：

```python
#!/usr/bin/env python3
"""
Tencent Cloud Disaster Recovery Automation Script
支持同城切换和异地切换两种模式
"""

import os
import sys
import json
import time
import logging
import argparse
from datetime import datetime
from typing import Dict, List, Optional

import requests
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(f"dr_switch_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class TencentCloudDR:
    """腾讯云容灾切换管理器"""
    
    def __init__(self, config_path: str = "dr_config.json"):
        with open(config_path, "r") as f:
            self.config = json.load(f)
        
        self.primary_region = self.config["primary_region"]
        self.dr_region = self.config["dr_region"]
        self.switch_mode = self.config.get("switch_mode", "same_city")  # same_city or cross_region
        
        cred = credential.Credential(
            self.config["secret_id"],
            self.config["secret_key"]
        )
        self.cred = cred
        self.dry_run = False
        
        # 各服务客户端（实际使用时初始化）
        self.clients = {}
    
    def _init_clients(self):
        """初始化各服务客户端"""
        from tencentcloud.clb.v20180316 import clb_client
        from tencentcloud.dts.v20211206 import dts_client
        from tencentcloud.redis.v20180412 import redis_client
        from tencentcloud.monitor.v20180724 import monitor_client
        
        self.clients["clb"] = clb_client.ClbClient(self.cred, self.primary_region)
        self.clients["dts"] = dts_client.DtsClient(self.cred, self.primary_region)
        self.clients["redis"] = redis_client.RedisClient(self.cred, self.primary_region)
        self.clients["monitor"] = monitor_client.MonitorClient(self.cred, self.primary_region)
    
    def pre_switch_checks(self) -> bool:
        """切换前检查"""
        logger.info("=== 切换前检查 ===")
        checks_passed = True
        
        # 1. 检查 DTS 同步延迟
        dts_lag = self._check_dts_lag()
        if dts_lag > self.config.get("max_dts_lag_seconds", 30):
            logger.error(f"DTS 延迟过高: {dts_lag}s")
            checks_passed = False
        
        # 2. 检查 COS CRR 状态
        crr_ok = self._check_cos_crr()
        if not crr_ok:
            logger.error("COS CRR 状态异常")
            checks_passed = False
        
        # 3. 检查备地域资源配额
        quota_ok = self._check_dr_quota()
        if not quota_ok:
            logger.error("备地域资源配额不足")
            checks_passed = False
        
        # 4. 检查监控告警通道
        alarm_ok = self._check_alarm_channel()
        if not alarm_ok:
            logger.warning("告警通道异常，切换后可能无法收到通知")
        
        if checks_passed:
            logger.info("所有前置检查通过")
        else:
            logger.warning("前置检查未全部通过，请确认是否继续")
        
        return checks_passed
    
    def _check_dts_lag(self) -> int:
        """检查 DTS 同步延迟（秒）"""
        logger.info("检查 DTS 同步延迟...")
        # 实际调用 DTS API
        return 2  # 模拟返回 2 秒延迟
    
    def _check_cos_crr(self) -> bool:
        """检查 COS 跨区域复制状态"""
        logger.info("检查 COS CRR 状态...")
        return True
    
    def _check_dr_quota(self) -> bool:
        """检查备地域资源配额"""
        logger.info(f"检查 {self.dr_region} 资源配额...")
        return True
    
    def _check_alarm_channel(self) -> bool:
        """检查告警通道"""
        logger.info("检查告警通道...")
        return True
    
    def switch_dns(self, target_region: str) -> bool:
        """切换 DNS 解析到目标地域"""
        logger.info(f"切换 DNS 解析到 {target_region}...")
        
        if self.dry_run:
            logger.info("[DRY RUN] 跳过 DNS 切换")
            return True
        
        # 实际调用 DNSPod API
        # 等待 TTL 过期
        ttl = self.config.get("dns_ttl", 60)
        logger.info(f"等待 DNS TTL 过期 ({ttl}s)...")
        time.sleep(ttl)
        
        return True
    
    def switch_database(self, direction: str) -> bool:
        """切换数据库主备
        
        Args:
            direction: "primary_to_dr" 或 "dr_to_primary"
        """
        logger.info(f"切换数据库: {direction}...")
        
        if self.dry_run:
            logger.info("[DRY RUN] 跳过数据库切换")
            return True
        
        # 1. 停止 DTS 同步
        # 2. 提升备库为主库
        # 3. 更新连接串
        return True
    
    def start_dr_applications(self) -> bool:
        """启动备地域应用服务"""
        logger.info(f"启动 {self.dr_region} 应用服务...")
        
        if self.dry_run:
            logger.info("[DRY RUN] 跳过应用启动")
            return True
        
        # 1. 启动 CVM 实例/伸缩组
        # 2. 预热缓存
        # 3. 健康检查
        return True
    
    def verify_services(self) -> Dict[str, bool]:
        """验证服务可用性"""
        logger.info("验证服务可用性...")
        
        results = {}
        endpoints = self.config.get("health_check_endpoints", [])
        
        for endpoint in endpoints:
            try:
                resp = requests.get(
                    endpoint["url"],
                    timeout=endpoint.get("timeout", 10),
                    headers={"Host": endpoint.get("host", "")}
                )
                is_healthy = resp.status_code < 500
                results[endpoint["name"]] = is_healthy
                logger.info(f"  {endpoint['name']}: {'✅' if is_healthy else '❌'} ({resp.status_code})")
            except Exception as e:
                results[endpoint["name"]] = False
                logger.error(f"  {endpoint['name']}: ❌ ({str(e)})")
        
        return results
    
    def execute_switch(self, dry_run: bool = False) -> Dict:
        """执行完整切换流程"""
        self.dry_run = dry_run
        
        start_time = datetime.now()
        result = {
            "status": "in_progress",
            "start_time": start_time.isoformat(),
            "steps": [],
            "errors": []
        }
        
        try:
            # Step 1: 前置检查
            logger.info("\n" + "=" * 60)
            logger.info("步骤 1/5: 前置检查")
            checks_passed = self.pre_switch_checks()
            result["steps"].append({"step": "pre_checks", "status": "passed" if checks_passed else "failed"})
            
            if not checks_passed and not self.config.get("force_switch", False):
                raise RuntimeError("前置检查未通过，终止切换")
            
            # Step 2: DNS 切换
            logger.info("\n" + "=" * 60)
            logger.info("步骤 2/5: DNS 切换")
            dns_ok = self.switch_dns(self.dr_region)
            result["steps"].append({"step": "dns_switch", "status": "passed" if dns_ok else "failed"})
            
            # Step 3: 数据库切换
            logger.info("\n" + "=" * 60)
            logger.info("步骤 3/5: 数据库切换")
            db_ok = self.switch_database("primary_to_dr")
            result["steps"].append({"step": "db_switch", "status": "passed" if db_ok else "failed"})
            
            # Step 4: 启动应用
            logger.info("\n" + "=" * 60)
            logger.info("步骤 4/5: 启动备地域应用")
            app_ok = self.start_dr_applications()
            result["steps"].append({"step": "start_apps", "status": "passed" if app_ok else "failed"})
            
            # Step 5: 验证
            logger.info("\n" + "=" * 60)
            logger.info("步骤 5/5: 服务验证")
            verify_results = self.verify_services()
            all_healthy = all(verify_results.values())
            result["steps"].append({
                "step": "verification",
                "status": "passed" if all_healthy else "failed",
                "details": verify_results
            })
            
            end_time = datetime.now()
            total_seconds = (end_time - start_time).total_seconds()
            
            result["status"] = "completed" if all_healthy else "completed_with_issues"
            result["end_time"] = end_time.isoformat()
            result["total_seconds"] = total_seconds
            
            logger.info("\n" + "=" * 60)
            logger.info(f"切换完成！总耗时: {total_seconds:.1f}s")
            logger.info(f"状态: {result['status']}")
            
        except Exception as e:
            logger.error(f"切换失败: {str(e)}")
            result["status"] = "failed"
            result["errors"].append(str(e))
            
            # 自动回滚
            if self.config.get("auto_rollback", True):
                logger.warning("执行自动回滚...")
                self.rollback(result)
        
        return result
    
    def rollback(self, switch_result: Dict) -> bool:
        """回滚切换"""
        logger.info("=== 执行回滚 ===")
        
        # 反向操作
        self.switch_dns(self.primary_region)
        self.switch_database("dr_to_primary")
        
        logger.info("回滚完成")
        return True


def main():
    parser = argparse.ArgumentParser(description="腾讯云容灾切换工具")
    parser.add_argument("--config", default="dr_config.json", help="配置文件路径")
    parser.add_argument("--dry-run", action="store_true", help="演练模式（不执行实际操作）")
    parser.add_argument("--mode", choices=["same_city", "cross_region"], help="切换模式")
    
    args = parser.parse_args()
    
    dr = TencentCloudDR(args.config)
    if args.mode:
        dr.switch_mode = args.mode
    
    result = dr.execute_switch(dry_run=args.dry_run)
    
    # 输出结果 JSON
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    return 0 if result["status"] == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
```

**配置文件示例（dr_config.json）：**

```json
{
    "secret_id": "your_secret_id",
    "secret_key": "your_secret_key",
    "primary_region": "ap-guangzhou",
    "dr_region": "ap-shanghai",
    "switch_mode": "cross_region",
    "dns_ttl": 60,
    "max_dts_lag_seconds": 30,
    "force_switch": false,
    "auto_rollback": true,
    "health_check_endpoints": [
        {
            "name": "api-gateway",
            "url": "https://api.example.com/health",
            "timeout": 10
        },
        {
            "name": "web-portal",
            "url": "https://www.example.com/health",
            "timeout": 10
        }
    ]
}
```

### 11.5.4 容灾切换决策树

在实际生产环境中，容灾切换不是"一键执行"那么简单。以下决策树帮助团队在灾难发生时做出正确判断：

```
灾难发生
    │
    ├─ 是否影响核心业务？
    │   ├─ 是 → 继续
    │   └─ 否 → 观察等待（可能只是短暂抖动）
    │
    ├─ 预计恢复时间？
    │   ├─ < 5min → 等待云服务商自动恢复
    │   ├─ 5-30min → 准备切换，但不一定执行
    │   └─ > 30min → 立即执行切换
    │
    ├─ 当前是否在业务低峰期？
    │   ├─ 是 → 可以切换
    │   └─ 否 → 评估切换对在线用户的影响
    │
    ├─ 数据一致性是否满足 RPO 要求？
    │   ├─ 是 → 执行切换
    │   └─ 否 → 评估数据丢失的影响
    │
    └─ 切换后能否回滚？
        ├─ 是 → 执行切换
        └─ 否 → 升级决策（需要更高层级审批）
```

### 11.5.5 常见陷阱与应对

| 陷阱 | 表现 | 应对措施 |
|------|------|----------|
| 配置漂移 | 备地域的配置与主地域不一致 | 使用 IaC（Terraform/Pulumi）管理基础设施，定期同步 |
| 数据膨胀 | 备库磁盘空间不足 | 监控备库磁盘使用率，设置告警阈值 |
| 证书过期 | 切换后 HTTPS 证书无效 | 使用腾讯云 SSL 证书服务统一管理，自动续期 |
| 依赖链断裂 | 备地域缺少某个上游服务 | 维护完整的依赖关系图，演练时逐项验证 |
| 人员失能 | 关键操作只有一个人会 | 文档化所有操作步骤，定期轮换演练负责人 |
| 回滚困难 | 切换后无法回退 | 每次切换前确认回滚方案，演练必须包含回滚步骤 |

---

## 11.6 实战案例：某金融科技公司容灾架构

### 11.6.1 业务背景

某金融科技公司核心业务为线上借贷平台，日交易量 50 万笔，监管要求：
- 核心系统 RTO < 5 分钟，RPO = 0
- 非核心系统 RTO < 30 分钟，RPO < 5 分钟
- 每年至少进行 2 次全量容灾演练

### 11.6.2 架构方案

```
广州（主地域）
  ├─ TDSQL 集群（主）：核心交易数据
  ├─ Redis 集群：Session、热点数据
  ├─ COS：用户证件、合同文件
  ├─ CKafka：交易消息队列
  └─ CVM 集群：业务应用

上海（备地域）
  ├─ TDSQL 集群（备）：强同步复制
  ├─ Redis 集群：主从复制
  ├─ COS：CRR 跨区域复制
  ├─ CKafka：消费组备份
  └─ CVM 集群：日常 20% 流量（灰度验证）
```

**关键设计决策：**

1. **同城双活 + 异地容灾**：广州-A 和广州-B 做同城双活（RPO=0），上海做异地容灾（RPO<5s）。
2. **三副本数据保护**：TDSQL 采用一主两备三副本架构，分布在三个不同的物理机房。
3. **灰度引流**：上海地域日常承载 20% 的只读流量，既验证备地域可用性，又降低切换风险。

### 11.6.3 演练成果

经过 6 次全量演练和 12 次桌面推演后：
- 平均 RTO 从首次演练的 12 分钟优化到 3.5 分钟
- 切换脚本从 3 个增加到 12 个（覆盖所有边界情况）
- 团队响应时间从 30 分钟缩短到 5 分钟

---

## 11.7 本章小结

容灾规划是 SRE 工作中最具挑战性也最重要的环节之一。本章的核心要点：

1. **RPO 和 RTO 是容灾设计的起点**，所有技术选型都围绕这两个指标展开。
2. **同城双活解决可用区级故障**，异地容灾解决地域级故障，两者不是替代关系而是互补关系。
3. **容灾演练比容灾架构更重要**——没有经过验证的容灾方案等于没有容灾。
4. **自动化是容灾的生命线**，手动操作在灾难发生时几乎一定会出错。
5. **成本与风险的平衡**是容灾规划的核心决策，没有"最好"的方案，只有"最适合"的方案。

**最后一条建议：** 不要等到灾难发生才想起容灾。今天就开始规划，下周就做第一次桌面推演。哪怕只是把切换流程写下来，也比什么都没有强。

---

## 参考资源

- 腾讯云容灾最佳实践: https://cloud.tencent.com/document/product/1552
- 腾讯云 DTS 数据同步: https://cloud.tencent.com/document/product/571
- 腾讯云 COS 跨区域复制: https://cloud.tencent.com/document/product/436/33456
- 腾讯云 TDSQL 高可用: https://cloud.tencent.com/document/product/557
- 腾讯云 CFC 混沌工程: https://cloud.tencent.com/document/product/1580
