# 第6章 腾讯云计算服务选型指南

## 6.1 概述

计算服务是云平台的基石。腾讯云提供从虚拟机（CVM）、容器服务（TKE）到函数计算（SCF）的全谱计算产品，覆盖从传统单体应用到云原生微服务的所有场景。选型的本质是在**控制力**与**运维成本**之间做权衡：CVM 给你完整的 OS 控制权，但需要你管理补丁、扩缩容和故障转移；TKE 将编排层抽象掉，但你仍需关心节点池和调度策略；SCF 连服务器都不需要你看，但带来了冷启动和执行时长限制。

本章从 SRE 视角出发，逐一分析每种计算产品的适用场景、成本模型和运维要点，并给出可落地的 Terraform 代码示例。

## 6.2 云服务器 CVM

### 6.2.1 产品定位

CVM（Cloud Virtual Machine）是腾讯云最基础的计算单元，提供完整的虚拟机隔离环境。你拥有 root/Administrator 权限，可以自定义内核参数、安装任何软件、配置网络和存储。适合场景：

- 需要完整 OS 控制权的传统应用（如 Oracle 数据库、Windows 应用）
- 未容器化的遗留系统迁移
- 需要特定内核版本或内核模块的场景
- 对性能有极致要求、不希望引入额外虚拟化层开销的场景

### 6.2.2 实例族选型

腾讯云 CVM 实例按用途分为多个族，每个族针对不同负载特征优化。选型错误是云成本浪费的第一大来源。

| 实例族 | 系列 | CPU:内存比 | 适用场景 |
|--------|------|-----------|---------|
| 标准型 | S5/S6/S7 | 1:2 ~ 1:4 | Web 服务器、中小型数据库、微服务 |
| 计算型 | C5/C6 | 1:1 ~ 1:2 | 批处理、视频编码、高并发前端 |
| 内存型 | M5/M6 | 1:8 ~ 1:16 | Redis、内存数据库、大型缓存 |
| 大数据型 | D3 | 1:4 + 本地 HDD | Hadoop/Spark、日志处理 |
| GPU 型 | GN10Xp/GN7 | 配 GPU | 深度学习训练、推理、渲染 |

**选型原则：**

1. **先看 CPU:内存比**。如果应用实际使用中 CPU 跑满但内存只用了 30%，说明你买错了实例族——应该换计算型而不是升级配置。
2. **关注基准性能 vs 突发性能**。标准型实例有稳定的基准性能，而突发型（如 S6 的某些规格）在持续高负载下会被限速。生产环境避免突发型。
3. **网络带宽与实例规格绑定**。高规格实例自带更高带宽上限。如果业务是网络密集型（如网关、代理），不要买低规格实例然后期望通过调整限速来省钱。

### 6.2.3 计费模式

腾讯云 CVM 提供三种计费模式，选错是成本失控的常见原因。

**包年包月（预付费）：**

- 价格最低，折扣可达按量计费的 40%~60%
- 适合稳态负载：数据库、核心业务、生产环境
- 承诺周期越长折扣越大（1 年 vs 3 年）
- 退费有惩罚：提前退还按剩余价值的比例扣费

**按量计费（后付费）：**

- 秒级计费，灵活启停
- 适合弹性负载：测试环境、临时任务、配合弹性伸缩
- 价格最高，约为包年包月的 2~3 倍
- 关机不收费仅适用于"按量计费+不保留公网 IP"的场景

**竞价实例（Spot）：**

- 价格随供需波动，通常为按量计费的 10%~20%
- 实例可能被随时回收（回收前约 5 分钟通知）
- 适合无状态、可中断、可重试的负载：批处理、视频转码、大数据计算
- 不适合数据库、有状态服务、长时间运行的单体应用

**SRE 建议：** 核心服务用包年包月锁定折扣，弹性层用按量计费配合弹性伸缩，离线任务用竞价实例最大化成本效益。一个典型的三层架构中，数据库层包年包月、应用层按量计费+弹性伸缩、批处理层竞价实例。

### 6.2.4 抢占式实例（Spot）深入

竞价实例的核心风险是被回收。腾讯云在需要回收资源时会发送**约 5 分钟**的告警，实例状态变为"待回收"。SRE 需要做三件事：

1. **检测回收信号**：监听 metadata 中的 `spot/termination-time` 端点
2. **优雅退出**：收到信号后停止接受新请求，完成正在处理的请求，保存状态
3. **自动替换**：配合弹性伸缩组，自动启动新实例

```bash
# 检测竞价实例回收信号的脚本示例
#!/bin/bash
TERMINATION_URL="http://metadata.tencentyun.com/latest/meta-data/spot/termination-time"
while true; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $TERMINATION_URL)
  if [ "$HTTP_CODE" -eq 200 ]; then
    echo "Spot instance will be terminated soon. Draining connections..."
    # 从负载均衡摘除
    # 等待正在处理的请求完成
    # 保存状态到 COS
    break
  fi
  sleep 10
done
```

**成本对比示例（2025 年参考价格，以广州区域 4C8G 为例）：**

| 计费模式 | 月成本（估算） | 适用场景 |
|---------|--------------|---------|
| 包年包月（1 年） | ~300 元 | 生产数据库 |
| 按量计费 | ~700 元 | 弹性伸缩补充 |
| 竞价实例 | ~80 元 | 离线批处理 |

### 6.2.5 使用 Terraform 管理 CVM

以下是一个完整的 Terraform 示例，创建包含 CVM 实例、安全组和弹性公网 IP 的基础设施。

```hcl
# providers.tf
terraform {
  required_providers {
    tencentcloud = {
      source = "tencentcloudstack/tencentcloud"
      version = ">= 1.81.0"
    }
  }
}

provider "tencentcloud" {
  secret_id  = var.secret_id
  secret_key = var.secret_key
  region     = var.region
}

# variables.tf
variable "secret_id" {
  type = string
  description = "腾讯云 API 密钥 ID"
}

variable "secret_key" {
  type = string
  description = "腾讯云 API 密钥 Key"
}

variable "region" {
  type    = string
  default = "ap-guangzhou"
}

variable "project_name" {
  type    = string
  default = "sre-demo"
}

# vpc.tf - 创建 VPC 和子网
resource "tencentcloud_vpc" "main" {
  name       = "${var.project_name}-vpc"
  cidr_block = "10.0.0.0/16"
}

resource "tencentcloud_subnet" "main" {
  name              = "${var.project_name}-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "ap-guangzhou-7"
}

# security_group.tf
resource "tencentcloud_security_group" "web_sg" {
  name        = "${var.project_name}-web-sg"
  description = "Web server security group"
}

resource "tencentcloud_security_group_rule" "ssh" {
  security_group_id = tencentcloud_security_group.web_sg.id
  type              = "INGRESS"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "tcp"
  port_range        = "22"
  policy            = "ACCEPT"
  description       = "SSH access"
}

resource "tencentcloud_security_group_rule" "http" {
  security_group_id = tencentcloud_security_group.web_sg.id
  type              = "INGRESS"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "tcp"
  port_range        = "80,443"
  policy            = "ACCEPT"
  description       = "HTTP/HTTPS access"
}

# cvm.tf - 创建 CVM 实例
data "tencentcloud_images" "ubuntu" {
  image_name_regex = "Ubuntu 22.04 LTS 64位"
  image_type       = ["PUBLIC_IMAGE"]
}

data "tencentcloud_instance_types" "web" {
  cpu_core_count = 4
  memory_size    = 8
  exclude_sold_out = true
  availability_zone = "ap-guangzhou-7"
}

resource "tencentcloud_key_pair" "deploy_key" {
  key_name   = "${var.project_name}-deploy-key"
  public_key = file("~/.ssh/id_rsa.pub")
}

resource "tencentcloud_instance" "web_server" {
  instance_name     = "${var.project_name}-web-01"
  availability_zone = "ap-guangzhou-7"
  image_id          = data.tencentcloud_images.ubuntu.images[0].image_id
  instance_type     = data.tencentcloud_instance_types.web.instance_types[0].instance_type
  system_disk_type  = "CLOUD_SSD"
  system_disk_size  = 50
  vpc_id            = tencentcloud_vpc.main.id
  subnet_id         = tencentcloud_subnet.main.id
  security_groups   = [tencentcloud_security_group.web_sg.id]
  key_pair_id       = tencentcloud_key_pair.deploy_key.id

  # 包年包月计费
  instance_charge_type = "PREPAID"
  instance_charge_type_prepaid_period = 12  # 12 个月
  instance_charge_type_prepaid_renew_flag = "NOTIFY_AND_AUTO_RENEW"

  # 分配公网 IP
  internet_max_bandwidth_out = 5
  allocate_public_ip         = true

  tags = {
    Environment = "production"
    Project     = var.project_name
    ManagedBy   = "Terraform"
  }
}

# eip.tf - 弹性公网 IP（可选，如果实例需要固定 IP）
resource "tencentcloud_eip" "web_eip" {
  name              = "${var.project_name}-web-eip"
  internet_charge_type = "TRAFFIC_POSTPAID_BY_HOUR"
}

resource "tencentcloud_eip_association" "web_eip_assoc" {
  eip_id      = tencentcloud_eip.web_eip.id
  instance_id = tencentcloud_instance.web_server.id
}

# output.tf
output "web_server_public_ip" {
  value = tencentcloud_eip.web_eip.public_ip
}

output "web_server_private_ip" {
  value = tencentcloud_instance.web_server.private_ip
}
```

**关键说明：**

- `instance_charge_type` 控制计费模式：`PREPAID` 为包年包月，`POSTPAID_BY_HOUR` 为按量计费
- 竞价实例需要在 `instance_charge_type` 中设置 `CDCPAID`（竞价计费），并配合 `spot_instance_type` 参数
- 生产环境建议使用密钥对而非密码登录
- 系统盘建议至少 50GB，数据盘通过 `data_disks` 参数单独挂载

### 6.2.6 CVM 运维最佳实践

**镜像与启动模板：**

使用自定义镜像（可通过 Terraform `tencentcloud_image` 资源创建）确保新实例启动时已预装所有软件。结合启动模板（`tencentcloud_launch_template`）和弹性伸缩组（`tencentcloud_autoscaling_group`），实现故障自动替换。

**定期打快照：**

```hcl
resource "tencentcloud_cbs_snapshot_policy" "daily" {
  snapshot_policy_name = "${var.project_name}-daily-snapshot"
  repeat_hours        = [2]    # 凌晨 2 点
  repeat_weekdays     = [1,2,3,4,5,6,7]  # 每天
  retention_days      = 7
}

resource "tencentcloud_cbs_snapshot_policy_attachment" "attach" {
  snapshot_policy_id = tencentcloud_cbs_snapshot_policy.daily.id
  storage_id         = tencentcloud_instance.web_server.system_disk_id
}
```

**监控与告警：**

通过腾讯云监控（CM）为 CVM 配置关键指标告警：CPU 使用率 > 80%、内存使用率 > 85%、磁盘 IO 等待时间 > 100ms。配合云拨测（CAT）检测公网可达性。

## 6.3 容器服务 TKE

### 6.3.1 产品定位

TKE（Tencent Kubernetes Engine）是腾讯云托管的 Kubernetes 服务。相比自建 K8s 集群，TKE 免去了 etcd 运维、控制面高可用、证书轮换等脏活。TKE 提供两种集群模式：

- **独立集群**：控制面由腾讯云托管，Worker 节点由用户管理
- **Serverless 集群**（EKS）：无需管理节点，按 Pod 粒度计费

### 6.3.2 何时选择 TKE

TKE 适合以下场景：

- 应用已容器化，需要 K8s 编排能力
- 微服务架构，服务数量超过 10 个
- 需要蓝绿部署、金丝雀发布、自动扩缩容
- 多环境（开发/测试/生产）统一部署平台

**不适用场景：**

- 单体应用且无容器化计划（直接用 CVM 更简单）
- 对 K8s 版本有特殊定制需求（TKE 支持的版本有限）
- 需要直接操作 etcd 或控制面组件

### 6.3.3 节点池与实例选型

TKE 的 Worker 节点本质上是 CVM 实例，实例选型原则与 6.2.2 节一致。但 TKE 引入了**节点池**的概念，允许在同一集群中混合不同规格的节点。

**节点池设计原则：**

1. **按负载类型拆分节点池**：计算密集型 Pod 调度到计算型节点，内存密集型 Pod 调度到内存型节点
2. **使用节点亲和性**：通过 `nodeSelector` 或 `nodeAffinity` 将 Pod 绑定到正确的节点池
3. **预留节点 vs 弹性节点**：基础负载用包年包月节点池，突发负载用按量计费节点池

```yaml
# Pod 调度到指定节点池的示例
apiVersion: v1
kind: Pod
metadata:
  name: memory-intensive-app
spec:
  nodeSelector:
    node.kubernetes.io/instance-type: "M6"
  containers:
  - name: app
    image: myapp:latest
    resources:
      requests:
        memory: "8Gi"
        cpu: "2"
```

### 6.3.4 使用 Terraform 创建 TKE 集群

以下示例创建一个完整的 TKE 集群，包含两个节点池（基础池和弹性池）。

```hcl
# tke-cluster.tf
# 创建 TKE 托管集群
resource "tencentcloud_kubernetes_cluster" "main" {
  cluster_name        = "${var.project_name}-cluster"
  cluster_version     = "1.28"
  cluster_os          = "ubuntu22.04"
  cluster_internet    = true  # 开启公网访问 kube-apiserver
  cluster_intranet    = true  # 同时开启内网访问
  vpc_id              = tencentcloud_vpc.main.id
  subnet_id           = tencentcloud_subnet.main.id

  # 托管模式：控制面由腾讯云管理
  cluster_deploy_type = "MANAGED_CLUSTER"

  # 容器网络配置
  container_runtime = "containerd"
  network_type      = "VPC-CNI"  # 使用 VPC-CNI 模式，Pod 直接分配 VPC IP
  service_cidr     = "172.16.0.0/16"
  cluster_cidr     = "10.20.0.0/16"

  # 基础节点池：包年包月，运行核心服务
  worker_config {
    count              = 3
    instance_type      = "S6.2XLARGE16"  # 8C16G
    system_disk_type   = "CLOUD_SSD"
    system_disk_size   = 50
    internet_charge_type       = "TRAFFIC_POSTPAID_BY_HOUR"
    internet_max_bandwidth_out = 5
    key_id             = tencentcloud_key_pair.deploy_key.id
    security_group_ids = [tencentcloud_security_group.web_sg.id]
    data_disk {
      disk_type = "CLOUD_SSD"
      disk_size = 100
    }
    # 包年包月计费
    instance_charge_type = "PREPAID"
    instance_charge_type_prepaid_period = 12
  }

  # 标签
  labels = {
    "env"     = "production"
    "managed" = "terraform"
  }
}

# 弹性节点池：按量计费，运行弹性负载
resource "tencentcloud_kubernetes_node_pool" "spot_pool" {
  name              = "${var.project_name}-spot-pool"
  cluster_id        = tencentcloud_kubernetes_cluster.main.id
  max_size          = 20
  min_size          = 0
  node_count        = 0
  vpc_id            = tencentcloud_vpc.main.id
  subnet_ids        = [tencentcloud_subnet.main.id]
  instance_type     = "S6.2XLARGE16"
  system_disk_type  = "CLOUD_SSD"
  system_disk_size  = 50
  key_id            = tencentcloud_key_pair.deploy_key.id
  security_group_ids = [tencentcloud_security_group.web_sg.id]

  # 竞价实例
  instance_charge_type = "CDCPAID"

  # 自动扩缩容配置
  auto_scaling_config {
    max_size = 20
    min_size = 0
  }

  labels = {
    "pool-type" = "spot"
  }

  taints {
    key    = "spot"
    value  = "true"
    effect = "NoSchedule"
  }
}

# 为竞价节点池创建对应的 PodDisruptionBudget
resource "kubernetes_pod_disruption_budget_v1" "spot_workloads" {
  metadata {
    name      = "spot-pdb"
    namespace = "default"
  }
  spec {
    min_available = "50%"
    selector {
      match_labels = {
        "app" = "batch-worker"
      }
    }
  }
}

# 输出 kubeconfig
output "kubeconfig" {
  value     = tencentcloud_kubernetes_cluster.main.kube_config
  sensitive = true
}

output "cluster_id" {
  value = tencentcloud_kubernetes_cluster.main.id
}
```

**关键说明：**

- `cluster_deploy_type = "MANAGED_CLUSTER"` 表示托管集群，控制面免费
- `network_type = "VPC-CNI"` 使用 VPC-CNI 网络模式，Pod 直接获得 VPC IP，性能优于传统网桥模式
- 竞价节点池通过 `instance_charge_type = "CDCPAID"` 启用
- 竞价节点池设置了 `taint`（污点），只有容忍该污点的 Pod 才能调度上去，避免关键服务被意外调度到可能被回收的节点
- `PodDisruptionBudget` 确保竞价节点被回收时，同一时间最多中断 50% 的副本

### 6.3.5 TKE 运维要点

**集群升级：**

TKE 控制面由腾讯云负责升级，但 Worker 节点需要手动或自动升级。建议开启**节点自动升级**功能，配合维护窗口，在业务低峰期完成升级。

**组件管理：**

TKE 提供丰富的扩展组件（通过 `tencentcloud_kubernetes_addon_attachment` 管理）：

- `cbs`：块存储 CSI 插件，为 Pod 提供持久化存储
- `tcr`：镜像拉取加速
- `hpa`：自动扩缩容
- `cgw`：云原生网关

**日志与监控：**

- 开启集群审计日志到 CLS（日志服务）
- 开启事件持久化，记录 K8s 事件
- 安装 Prometheus + Grafana（TKE 提供托管 Prometheus 服务）

## 6.4 云函数 SCF

### 6.4.1 产品定位

SCF（Serverless Cloud Function）是腾讯云的事件驱动型计算服务。你只需上传代码，SCF 负责自动扩缩容和高可用。计费按实际执行次数和执行时间结算，无调用时不产生费用。

### 6.4.2 适用场景

SCF 适合以下场景：

- **事件驱动处理**：COS 文件上传后自动处理、CDN 回源触发、Ckafka 消息消费
- **轻量 API 后端**：请求量波动大、单次处理时间短（< 5 分钟）
- **定时任务**：Cron 表达式触发，替代传统的 crontab 服务器
- **Webhook 处理**：GitHub/GitLab 事件回调、告警通知转发

**不适用场景：**

- 长时间运行的 WebSocket 连接
- 需要 GPU 的深度学习推理（SCF 不支持 GPU）
- 延迟敏感的核心交易链路（冷启动可能增加 200ms~1s 延迟）
- 需要本地磁盘持久化的大数据任务

### 6.4.3 冷启动与性能

冷启动是 SCF 最需要关注的性能问题。当函数在一段时间未被调用后，平台会回收资源，下次调用需要重新初始化运行环境。

**冷启动优化策略：**

1. **设置预留并发**：为关键函数预留一定数量的并发实例，消除冷启动
2. **代码包瘦身**：移除不必要的依赖，使用层（Layer）管理公共依赖
3. **使用更轻的运行语言**：Go、Node.js 冷启动快于 Java、Python
4. **初始化逻辑延迟**：将非关键初始化放到首次请求时执行

```python
# 冷启动优化示例：使用全局缓存
import json
import boto3  # 腾讯云 SCF 兼容 AWS 事件格式

# 全局作用域的代码只在冷启动时执行一次
_cache = {}

def init_heavy_resource():
    """延迟初始化，仅在首次调用时执行"""
    if "client" not in _cache:
        _cache["client"] = boto3.client("s3")
    return _cache["client"]

def main_handler(event, context):
    client = init_heavy_resource()
    # 业务逻辑
    return {"statusCode": 200, "body": json.dumps({"message": "ok"})}
```

### 6.4.4 计费模型

SCF 计费由三部分组成：

1. **调用次数**：每月前 200 万次免费，超出后按 1.33 元/百万次计费
2. **执行时长**：按内存 × 时间计费，每月 40 万 GBs 免费
3. **公网出流量**：按量计费

**成本估算示例：**

假设一个 API 函数，内存 128MB，平均执行时间 100ms，日调用 100 万次：

- 月调用次数：3000 万次，免费 200 万次，付费 2800 万次 ≈ 37 元
- 月执行时长：3000 万 × 0.1s × 128MB/1024MB = 37500 GBs，免费 40 万 GBs，实际免费额度已覆盖
- 月总成本：约 37 元 + 流量费

同样负载如果用 CVM（4C8G 包年包月），月成本约 300 元。SCF 在低负载场景下成本优势明显。

### 6.4.5 使用 Terraform 管理 SCF

```hcl
# scf.tf
# 创建 SCF 函数
resource "tencentcloud_scf_function" "image_processor" {
  name        = "${var.project_name}-image-process"
  namespace   = "default"
  runtime     = "Python3.9"
  handler     = "main.main_handler"
  description = "COS 图片上传后自动处理"

  # 代码来源：本地 ZIP 包
  zip_file = "./function-code.zip"

  # 环境变量
  environment {
    variables = {
      "TARGET_BUCKET" = "processed-images-123456"
      "QUALITY"       = "85"
    }
  }

  # 内存和超时
  mem_size      = 256
  timeout       = 60

  # 触发方式：COS 事件
  triggers {
    type         = "cos"
    cos_bucket_name = "source-images-123456"
    cos_bucket_region = "ap-guangzhou"
  }

  # 预留并发
  reserved_concurrency = 10

  # VPC 配置（如果需要访问内网资源）
  vpc_config {
    vpc_id    = tencentcloud_vpc.main.id
    subnet_id = tencentcloud_subnet.main.id
  }

  # 角色授权
  role = "SCF_QcsRole"
}

# 定时触发器（独立创建）
resource "tencentcloud_scf_function" "daily_report" {
  name      = "${var.project_name}-daily-report"
  namespace = "default"
  runtime   = "Python3.9"
  handler   = "report.main_handler"
  zip_file  = "./report-code.zip"
  mem_size  = 128
  timeout   = 300

  triggers {
    type = "timer"
    # Cron 表达式：每天早上 8 点执行
    trigger_desc = "0 0 8 * * * *"
  }
}
```

### 6.4.6 SCF 与 API 网关集成

SCF 最常见的用途是作为 API 后端。通过 API 网关触发 SCF，可以快速构建 RESTful API。

```hcl
resource "tencentcloud_api_gateway_service" "api" {
  service_name = "${var.project_name}-api"
  protocol     = "http"
  service_desc = "SCF API Gateway"
}

resource "tencentcloud_api_gateway_api" "hello" {
  service_id            = tencentcloud_api_gateway_service.api.id
  api_name              = "hello"
  api_desc              = "Hello API"
  auth_type             = "NONE"
  protocol              = "HTTP"
  enable_cors           = true
  request_config_path   = "/hello"
  request_config_method = "GET"

  # 后端指向 SCF
  service_config_type      = "SCF"
  service_config_scf_function_name = tencentcloud_scf_function.image_processor.name
  service_config_scf_function_namespace = "default"
  service_config_scf_function_qualifier = "$LATEST"
  service_config_path       = "/"
  service_config_method     = "ANY"
}
```

## 6.5 计算服务选型决策框架

### 6.5.1 决策树

面对一个业务需求，按以下顺序判断应该使用哪种计算服务：

```
是否需要完整 OS 控制权？
├── 是 → CVM
│   ├── 是否已容器化？
│   │   ├── 是 → 在 CVM 上自建 Docker
│   │   └── 否 → 直接部署到 CVM
│   └── 是否需要 GPU？
│       └── 是 → GPU 实例
│
└── 否 → 是否已容器化？
    ├── 是 → TKE
    │   ├── 负载是否稳定？
    │   │   ├── 是 → 包年包月节点池
    │   │   └── 否 → 按量计费 + 竞价节点池
    │   └── 是否需要 GPU？
    │       └── 是 → TKE + GPU 节点池
    │
    └── 否 → 是否事件驱动或短任务？
        ├── 是 → SCF
        └── 否 → 考虑容器化后使用 TKE
```

### 6.5.2 成本对比速查

| 维度 | CVM | TKE | SCF |
|------|-----|-----|-----|
| 最小计费粒度 | 秒（按量）/ 月（包年） | 秒（节点）/ 秒（Pod EKS） | 毫秒 |
| 闲置成本 | 高（即使不用也付费） | 中（节点付费，Pod 不付费） | 零（无调用不付费） |
| 运维人力成本 | 高（OS、补丁、监控） | 中（管理节点池和应用） | 低（只需关注代码） |
| 扩缩容速度 | 分钟级 | 秒级（Pod）/ 分钟级（节点） | 毫秒级 |
| 适用负载特征 | 稳态、可预测 | 稳态 + 弹性混合 | 突发、间歇性 |

### 6.5.3 混合部署策略

大型系统通常不会只用一种计算服务。推荐的混合策略：

1. **数据库层**：CVM 包年包月（或直接使用腾讯云数据库 CDB）
2. **应用层**：TKE 标准节点池（包年包月）+ 弹性节点池（按量计费）
3. **批处理/离线任务**：TKE 竞价节点池 或 SCF
4. **事件处理/定时任务**：SCF
5. **GPU 训练**：CVM GPU 实例包年包月（长期训练）或竞价 GPU（短期实验）

## 6.6 实例规格选择详解

### 6.6.1 标准型实例

标准型（S 系列）是腾讯云最通用的实例族，CPU:内存比在 1:2 到 1:4 之间。适合大多数 Web 应用、微服务和中小型数据库。

**推荐场景：**

- Nginx/OpenResty 反向代理
- Spring Boot / Go 微服务
- MySQL 5.7/8.0（中小规模）
- Elasticsearch 数据节点（配合 SSD 云盘）

**不推荐场景：**

- 视频编码（需要计算型）
- 大型内存数据库（需要内存型）
- 深度学习训练（需要 GPU）

### 6.6.2 计算型实例

计算型（C 系列）CPU:内存比 1:1 到 1:2，CPU 主频更高，适合计算密集型负载。

**推荐场景：**

- 视频转码（FFmpeg）
- 批处理任务
- 高并发 API 网关
- 游戏服务器
- CI/CD 构建节点

**选型注意：** 计算型实例的 CPU 基准频率通常高于标准型。例如 C6 系列使用 Intel Xeon Platinum 8375C，全核睿频可达 3.5GHz，适合对单线程性能敏感的应用。

### 6.6.3 内存型实例

内存型（M 系列）CPU:内存比 1:8 到 1:16，配备大容量内存，适合内存密集型负载。

**推荐场景：**

- Redis / Memcached 缓存集群
- SAP HANA
- 大型内存数据库（如 VoltDB）
- 实时数据分析（如 Apache Druid）

**选型注意：** 内存型实例的单价高于标准型，但如果你的应用确实需要大量内存，用标准型加更多 CPU 反而是浪费。例如一个 32GB 内存需求的应用，用 M6.2XLARGE32（8C32G）比用 S6.4XLARGE32（16C32G）便宜约 20%。

### 6.6.4 GPU 实例

GPU 实例是腾讯云最昂贵的计算资源，选型需要格外谨慎。

**实例类型对比：**

| 实例族 | GPU 型号 | 显存 | 适用场景 |
|--------|---------|------|---------|
| GN7 | T4 | 16GB | 推理、轻量训练、图形渲染 |
| GN10Xp | V100 | 32GB | 中大规模训练 |
| GN11 | A100 | 80GB | 大规模分布式训练 |

**选型原则：**

1. **训练 vs 推理**：训练需要大显存和高算力（A100/V100），推理可以用 T4 甚至 CPU
2. **显存是第一瓶颈**：模型参数 + 优化器状态 + batch size 必须在单卡显存内
3. **多卡通信**：多机多卡训练需要高带宽网络（GN10Xp 支持 RDMA）
4. **竞价 GPU**：短期实验和调参可以用竞价 GPU 实例，成本降低 60%~80%

```hcl
# GPU 实例 Terraform 示例
resource "tencentcloud_instance" "gpu_train" {
  instance_name     = "${var.project_name}-gpu-train-01"
  availability_zone = "ap-guangzhou-6"
  image_id          = "img-gpu-ubuntu2204"  # 预装 GPU 驱动的镜像
  instance_type     = "GN10Xp.2XLARGE80"   # 1×V100 32GB
  system_disk_type  = "CLOUD_SSD"
  system_disk_size  = 100

  data_disk {
    disk_type = "CLOUD_SSD"
    disk_size = 500
  }

  vpc_id    = tencentcloud_vpc.main.id
  subnet_id = tencentcloud_subnet.main.id
  security_groups = [tencentcloud_security_group.web_sg.id]
  key_pair_id     = tencentcloud_key_pair.deploy_key.id

  # 竞价实例
  instance_charge_type = "CDCPAID"
  spot_instance_type   = "ONE-TIME"

  tags = {
    Environment = "training"
    GPU         = "V100"
  }
}
```

## 6.7 弹性伸缩设计

### 6.7.1 CVM 弹性伸缩

腾讯云提供弹性伸缩组（AS，Auto Scaling），根据负载自动增加或减少 CVM 实例数量。

```hcl
# as.tf - 弹性伸缩组
resource "tencentcloud_as_scaling_group" "web_asg" {
  scaling_group_name = "${var.project_name}-web-asg"
  vpc_id             = tencentcloud_vpc.main.id
  subnet_ids         = [tencentcloud_subnet.main.id]
  min_size           = 2
  max_size           = 10
  desired_size       = 3
  project_id         = 0

  # 使用启动配置
  launch_configuration_id = tencentcloud_as_launch_configuration.web_lc.id

  # 关联负载均衡
  load_balancer_ids = [tencentcloud_clb_instance.web_clb.id]

  # 健康检查
  health_check_type = "CLB"
}

resource "tencentcloud_as_launch_configuration" "web_lc" {
  configuration_name = "${var.project_name}-web-lc"
  image_id          = data.tencentcloud_images.ubuntu.images[0].image_id
  instance_type     = "S6.2XLARGE16"
  system_disk_type  = "CLOUD_SSD"
  system_disk_size  = 50
  key_id            = tencentcloud_key_pair.deploy_key.id
  security_group_ids = [tencentcloud_security_group.web_sg.id]

  # 按量计费
  instance_charge_type = "POSTPAID_BY_HOUR"

  # 用户数据：实例启动时执行的脚本
  user_data = base64encode(<<-EOF
    #!/bin/bash
    systemctl start nginx
    systemctl enable nginx
  EOF
  )
}

# 伸缩策略：基于 CPU 使用率
resource "tencentcloud_as_scaling_policy" "cpu_scale_out" {
  scaling_group_id    = tencentcloud_as_scaling_group.web_asg.id
  policy_name         = "${var.project_name}-cpu-scale-out"
  adjustment_type     = "CHANGE_IN_CAPACITY"
  adjustment_value    = 1
  cooldown            = 120

  metric {
    metric_name = "CPU_UTILIZATION"
    statistic   = "AVERAGE"
    threshold   = 70
    period      = 60
    continuous_time = 3
    comparison_operator = "GREATER_THAN"
  }
}

resource "tencentcloud_as_scaling_policy" "cpu_scale_in" {
  scaling_group_id    = tencentcloud_as_scaling_group.web_asg.id
  policy_name         = "${var.project_name}-cpu-scale-in"
  adjustment_type     = "CHANGE_IN_CAPACITY"
  adjustment_value    = -1
  cooldown            = 300

  metric {
    metric_name = "CPU_UTILIZATION"
    statistic   = "AVERAGE"
    threshold   = 30
    period      = 60
    continuous_time = 5
    comparison_operator = "LESS_THAN"
  }
}
```

### 6.7.2 TKE 自动扩缩容

TKE 的自动扩缩容分为两个层面：

1. **Pod 层面**：HPA（Horizontal Pod Autoscaler）根据 CPU/内存/自定义指标调整 Pod 副本数
2. **节点层面**：Cluster Autoscaler 在 Pod 因资源不足而 Pending 时自动扩容节点，在节点利用率低时缩容节点

```yaml
# hpa.yaml - Pod 自动扩缩容
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
```

### 6.7.3 SCF 自动扩缩容

SCF 的扩缩容由平台自动管理，无需任何配置。但需要注意：

- **并发上限**：每个函数有默认并发配额（例如 1000），超过后请求会被限流（返回 429）
- **预留并发**：预留并发会占用配额，设置时需预留余量给非预留函数
- **预置并发**：提前初始化指定数量的实例，消除冷启动，但会产生闲置费用

## 6.8 实战案例：电商平台计算架构

### 6.8.1 需求分析

假设一个电商平台，包含以下模块：

- **用户服务**：登录注册、用户信息管理
- **商品服务**：商品 CRUD、搜索、详情
- **订单服务**：下单、支付、退款
- **库存服务**：库存扣减、库存同步
- **推荐服务**：个性化推荐（需要 GPU 推理）
- **数据分析**：离线报表、用户行为分析
- **图片处理**：商品图片上传后自动压缩、裁剪

### 6.8.2 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                      API 网关                            │
└────────┬────────┬────────┬────────┬────────┬────────────┘
         │        │        │        │        │
    ┌────┘   ┌────┘   ┌────┘   ┌────┘   ┌────┘
    ▼        ▼        ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐
│用户  │ │商品  │ │订单  │ │库存  │ │推荐推理   │
│服务  │ │服务  │ │服务  │ │服务  │ │(SCF)     │
└──────┘ └──────┘ └──────┘ └──────┘ └──────────┘
   │         │        │        │
   └─────────┴────────┴────────┘
              │
              ▼
       ┌──────────────┐
       │  TKE 集群    │
       │  (微服务)    │
       └──────────────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌────────┐       ┌──────────┐
│ MySQL  │       │ Redis    │
│ (CVM)  │       │ (CVM)    │
└────────┘       └──────────┘
```

### 6.8.3 选型决策

| 模块 | 计算服务 | 实例规格 | 计费模式 | 理由 |
|------|---------|---------|---------|------|
| 微服务（用户/商品/订单/库存） | TKE | S6.2XLARGE16（8C16G） | 包年包月 3 节点 + 按量弹性 | 稳态负载用包年包月，促销活动用弹性节点 |
| 推荐推理 | SCF + API 网关 | 内存 512MB | 按量 | 推理请求量波动大，SCF 按调用计费 |
| 图片处理 | SCF + COS 触发 | 内存 1024MB | 按量 | 事件驱动，无调用不付费 |
| MySQL 主库 | CVM | M6.2XLARGE32（8C32G） | 包年包月 3 年 | 数据库需要稳定性能，长期锁定折扣 |
| Redis 集群 | CVM | M6.4XLARGE64（16C64G）× 3 | 包年包月 1 年 | 内存型实例，包年包月 |
| 数据分析 | TKE 竞价节点池 | C6.4XLARGE16（16C16G） | 竞价 | 离线任务可中断，成本降低 80% |
| CI/CD | CVM | S6.LARGE8（4C8G） | 按量（工作时间启动） | 非工作时间关机不收费 |

### 6.8.4 成本估算

| 模块 | 月成本（估算） |
|------|--------------|
| TKE 包年包月节点（3 × 8C16G） | ~900 元 |
| TKE 弹性节点（按量，平均 2 台） | ~400 元 |
| TKE 竞价节点（数据分析） | ~100 元 |
| MySQL CVM（包年包月 3 年） | ~500 元 |
| Redis CVM（包年包月 1 年 × 3） | ~1800 元 |
| SCF 图片处理 | ~50 元 |
| SCF 推荐推理 | ~200 元 |
| CI/CD CVM | ~100 元 |
| **合计** | **~4050 元/月** |

如果全部使用按量计费 CVM，同等配置月成本约 8000~10000 元。合理的选型和计费策略可以节省 50% 以上的成本。

## 6.9 常见陷阱与避坑指南

### 陷阱 1：实例规格买大不买小

很多团队习惯"先买大规格，以后再说"，结果资源利用率长期低于 20%。**正确做法**：先买小规格，通过监控确定瓶颈后再升级。云平台的优势之一就是弹性，不要用物理机的思维选型。

### 陷阱 2：竞价实例用于有状态服务

竞价实例随时可能被回收，用于数据库、消息队列等有状态服务会导致数据丢失。**正确做法**：竞价实例只用于无状态、可重试的负载，有状态服务使用包年包月或按量计费。

### 陷阱 3：TKE 节点池不做污点隔离

所有节点混在一个池子里，竞价节点被回收时导致关键服务中断。**正确做法**：不同节点池设置不同的 taint，通过 toleration 控制 Pod 调度。

### 陷阱 4：SCF 不做冷启动优化

生产环境突然出现大量请求，冷启动导致响应时间从 10ms 飙升到 2s。**正确做法**：为关键函数设置预留并发，代码包控制在 10MB 以内，使用层管理依赖。

### 陷阱 5：忽略网络带宽限制

买了高规格 CVM 但发现网络吞吐上不去，检查后发现实例规格的带宽上限就是瓶颈。**正确做法**：网络密集型应用选择高带宽规格的实例，或使用多实例负载均衡。

### 陷阱 6：TKE 使用传统网桥模式

TKE 默认的网络模式是 Global Router（传统网桥），Pod 经过 iptables 转发，性能有损耗。**正确做法**：新集群使用 VPC-CNI 模式，Pod 直接分配 VPC IP，性能接近宿主机网络。

## 6.10 本章小结

计算服务选型没有银弹。CVM 给你最大的控制力，TKE 给你最好的编排能力，SCF 给你最低的运维成本。SRE 的核心能力不是精通某一种计算服务，而是根据业务特征在三种服务之间做出合理的权衡。

**关键决策原则：**

1. **有状态、需控制 → CVM**：数据库、中间件、遗留系统
2. **已容器化、微服务 → TKE**：应用层、API 服务、批处理
3. **事件驱动、间歇性 → SCF**：图片处理、定时任务、Webhook
4. **成本优化**：稳态用包年包月，弹性用按量计费，离线用竞价实例
5. **性能优化**：匹配负载特征选择实例族（标准/计算/内存/GPU），避免规格错配

下一章将深入讨论腾讯云网络服务的架构设计与选型，包括 VPC 规划、CLB 负载均衡、DNS 解析和混合云网络互联。
