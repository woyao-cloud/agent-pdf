# 腾讯云 SRE 工具箱 — 技术附录

> **文档版本:** v1.0  
> **适用范围:** 腾讯云环境下的 SRE 日常运维、故障排查、架构治理  
> **目标读者:** 云平台运维工程师、SRE、后端开发工程师

---

## 附录 A：tccli 命令速查表

`tccli` 是腾讯云官方命令行工具，封装了所有云产品的 API。以下按场景分类整理高频命令。

### A.1 安装与配置

```bash
# 安装（Python 3.6+）
pip install tccli

# 交互式配置
tccli configure

# 非交互式配置
tccli configure set secretId AKIDxxxxx
tccli configure set secretKey xxxxx
tccli configure set region ap-guangzhou
tccli configure set output json

# 多账号 Profile
tccli configure --profile prod
tccli configure --profile test
tccli configure --profile prod set region ap-singapore

# 切换 Profile 调用
tccli cvm DescribeInstances --profile prod
```

### A.2 CVM（云服务器）

```bash
# 列出所有实例（含到期时间、VPC、镜像）
tccli cvm DescribeInstances \
  --Offset 0 --Limit 100 \
  --Filters '[{"Name":"instance-state","Values":["RUNNING"]}]'

# 查询实例详情（含监控状态）
tccli cvm DescribeInstanceDetail \
  --InstanceIds '["ins-xxxxx"]'

# 重置密码（需要关机）
tccli cvm ResetInstancePassword \
  --InstanceIds '["ins-xxxxx"]' \
  --Password "NewPass@2024"

# 修改实例配置（升降配）
tccli cvm ModifyInstancesAttribute \
  --InstanceIds '["ins-xxxxx"]' \
  --InstanceName "web-prod-01"

# 查询可用区与机型库存
tccli cvm DescribeZoneInstanceConfigInfos \
  --Filters '[{"Name":"zone","Values":["ap-guangzhou-7"]}]'

# 创建实例快照
tccli cvm CreateImage \
  --InstanceIds '["ins-xxxxx"]' \
  --ImageName "backup-20240601"

# 查询 CBS 云硬盘
tccli cbs DescribeDisks \
  --Filters '[{"Name":"disk-type","Values":["CLOUD_SSD"]}]'

# 扩容 CBS（需先卸载）
tccli cbs ResizeDisk \
  --DiskId "disk-xxxxx" \
  --DiskSize 200
```

### A.3 TKE（容器服务）

```bash
# 列出集群
tccli tke DescribeClusters \
  --Limit 50

# 获取集群 kubeconfig
tccli tke DescribeClusterKubeconfig \
  --ClusterId "cls-xxxxx"

# 查询集群节点
tccli tke DescribeClusterInstances \
  --ClusterId "cls-xxxxx" \
  --Offset 0 --Limit 100

# 查询节点池
tccli tke DescribeClusterNodePools \
  --ClusterId "cls-xxxxx"

# 扩缩容节点池
tccli tke ModifyClusterNodePool \
  --ClusterId "cls-xxxxx" \
  --NodePoolId "np-xxxxx" \
  --NodePoolDesiredCapacity 5

# 查询集群自动伸缩状态
tccli tke DescribeClusterAsOption \
  --ClusterId "cls-xxxxx"

# 创建集群（快速版）
tccli tke CreateCluster \
  --ClusterName "prod-bj" \
  --ClusterVersion "1.28" \
  --ClusterType "MANAGED_CLUSTER" \
  --VpcId "vpc-xxxxx" \
  --SubnetIds '["subnet-xxxxx"]'

# 查询集群事件
tccli tke DescribeClusterEvents \
  --ClusterId "cls-xxxxx"

# 查询集群资源使用
tccli monitor DescribeMonitorData \
  --Namespace "QCE/TKE2" \
  --MetricName "CpuUsage" \
  --Period 300 \
  --StartTime "2024-06-01T00:00:00+08:00" \
  --EndTime "2024-06-01T01:00:00+08:00" \
  --Instances '[{"Dimensions":[{"Name":"cluster_id","Value":"cls-xxxxx"}]}]'
```

### A.4 VPC（私有网络）

```bash
# 列出 VPC
tccli vpc DescribeVpcs --Limit 100

# 列出子网
tccli vpc DescribeSubnets \
  --Filters '[{"Name":"vpc-id","Values":["vpc-xxxxx"]}]'

# 查询安全组规则
tccli vpc DescribeSecurityGroupPolicies \
  --SecurityGroupId "sg-xxxxx"

# 添加入站规则
tccli vpc CreateSecurityGroupPolicies \
  --SecurityGroupId "sg-xxxxx" \
  --SecurityGroupPolicySet '{"Ingress":[{"PolicyIndex":0,"Protocol":"TCP","Port":"443","CidrBlock":"0.0.0.0/0","Action":"ACCEPT","PolicyDescription":"HTTPS"}]}'

# 查询路由表
tccli vpc DescribeRouteTables \
  --Filters '[{"Name":"vpc-id","Values":["vpc-xxxxx"]}]'

# 创建对等连接
tccli vpc CreateVpcPeeringConnection \
  --Name "peer-bj-gz" \
  --VpcId "vpc-xxxxx" \
  --PeerVpcId "vpc-yyyyy" \
  --PeerRegion "ap-beijing"

# 查询流日志
tccli vpc DescribeFlowLogs \
  --Filters '[{"Name":"vpc-id","Values":["vpc-xxxxx"]}]'

# 查询 NAT 网关
tccli vpc DescribeNatGateways \
  --Filters '[{"Name":"vpc-id","Values":["vpc-xxxxx"]}]'
```

### A.5 CLB（负载均衡）

```bash
# 列出负载均衡器
tccli clb DescribeLoadBalancers --Limit 100

# 查询监听器
tccli clb DescribeListeners \
  --LoadBalancerId "lb-xxxxx"

# 查询后端 RS 健康状态
tccli clb DescribeTargetHealth \
  --LoadBalancerIds '["lb-xxxxx"]'

# 绑定后端服务器
tccli clb RegisterTargets \
  --LoadBalancerId "lb-xxxxx" \
  --ListenerId "lbl-xxxxx" \
  --Targets '[{"InstanceId":"ins-xxxxx","Port":80,"Weight":10}]'

# 解绑后端服务器
tccli clb DeregisterTargets \
  --LoadBalancerId "lb-xxxxx" \
  --ListenerId "lbl-xxxxx" \
  --Targets '[{"InstanceId":"ins-xxxxx","Port":80}]'

# 查询 CLB 访问日志（需启用 CLS）
tccli clb DescribeLoadBalancerLog \
  --LoadBalancerId "lb-xxxxx" \
  --StartTime "2024-06-01 00:00:00" \
  --EndTime "2024-06-01 01:00:00"
```

### A.6 COS（对象存储）

```bash
# 列出存储桶
tccli cos DescribeBuckets

# 查询存储桶详情
tccli cos HeadBucket --Bucket "example-1250000000"

# 上传文件
tccli cos PutObject \
  --Bucket "example-1250000000" \
  --Key "backup/db-20240601.sql" \
  --Body "/tmp/db-20240601.sql"

# 批量下载（使用 --recursive）
tccli cos GetObject \
  --Bucket "example-1250000000" \
  --Key "logs/app-20240601.log" \
  --OutputFile "./app-20240601.log"

# 设置生命周期
tccli cos PutBucketLifecycleConfiguration \
  --Bucket "example-1250000000" \
  --LifecycleConfiguration '{"Rules":[{"ID":"archive-30d","Status":"Enabled","Filter":{"Prefix":""},"Transitions":[{"Days":30,"StorageClass":"ARCHIVE"}]}]}'

# 生成预签名 URL（临时访问）
tccli cos GeneratePresignedUrl \
  --Bucket "example-1250000000" \
  --Key "report.pdf" \
  --Method GET \
  --ExpiresIn 3600
```

### A.7 TDSQL（分布式数据库）

```bash
# 列出 TDSQL 实例
tccli tdsql DescribeDBInstances --Limit 50

# 查询实例详情
tccli tdsql DescribeDBInstanceDetail \
  --InstanceId "tdsql-xxxxx"

# 查询慢查询
tccli tdsql DescribeSlowLogs \
  --InstanceId "tdsql-xxxxx" \
  --StartTime "2024-06-01T00:00:00+08:00" \
  --EndTime "2024-06-01T01:00:00+08:00" \
  --Limit 100

# 创建只读实例
tccli tdsql CreateTmpInstance \
  --InstanceId "tdsql-xxxxx" \
  --SrcInstanceRole "Master"

# 查询数据库参数
tccli tdsql DescribeDBParameters \
  --InstanceId "tdsql-xxxxx"

# 修改参数
tccli tdsql ModifyDBParameters \
  --InstanceId "tdsql-xxxxx" \
  --Params '[{"Param":"max_connections","Value":"2000"}]'

# 查询备份列表
tccli tdsql DescribeBackups \
  --InstanceId "tdsql-xxxxx" \
  --StartTime "2024-06-01T00:00:00+08:00" \
  --EndTime "2024-06-07T00:00:00+08:00"
```

### A.8 Redis

```bash
# 列出 Redis 实例
tccli redis DescribeInstances --Limit 100

# 查询实例详情
tccli redis DescribeInstanceDetail \
  --InstanceId "crs-xxxxx"

# 查询慢查询
tccli redis DescribeSlowLog \
  --InstanceId "crs-xxxxx" \
  --BeginTime "2024-06-01" \
  --EndTime "2024-06-02" \
  --MinQueryTime 1000

# 查询大 Key 分析
tccli redis DescribeBigKeyAnalysis \
  --InstanceId "crs-xxxxx"

# 创建备份
tccli redis CreateBackupInstance \
  --InstanceId "crs-xxxxx" \
  --Remark "daily-backup"

# 查询实例节点信息（集群版）
tccli redis DescribeInstanceNodeInfo \
  --InstanceId "crs-xxxxx"

# 修改维护时间窗
tccli redis ModifyMaintenanceWindow \
  --InstanceId "crs-xxxxx" \
  --StartTime "03:00" \
  --EndTime "06:00"
```

### A.9 TCOP（腾讯云可观测平台）

```bash
# 查询告警历史
tccli monitor DescribeAlarmHistory \
  --Module "monitor" \
  --StartTime "2024-06-01T00:00:00+08:00" \
  --EndTime "2024-06-02T00:00:00+08:00" \
  --Limit 100

# 查询告警策略
tccli monitor DescribeAlarmPolicy \
  --Module "monitor" \
  --PolicyId "policy-xxxxx"

# 创建告警策略
tccli monitor CreateAlarmPolicy \
  --Module "monitor" \
  --PolicyName "high-cpu-alert" \
  --Condition '{"MetricName":"CpuUsage","Period":60,"EvaluateType":"ANY","Statistic":"MAX","Value":80,"Unit":"%","ContinuePeriod":3}' \
  --EventCondition '[]' \
  --NoticeIds '["notice-xxxxx"]' \
  --TriggerTasks '[]'

# 查询监控数据（多维度）
tccli monitor DescribeMonitorData \
  --Namespace "QCE/CVM" \
  --MetricName "CpuUsage" \
  --Period 60 \
  --StartTime "2024-06-01T00:00:00+08:00" \
  --EndTime "2024-06-01T01:00:00+08:00" \
  --Instances '[{"Dimensions":[{"Name":"InstanceId","Value":"ins-xxxxx"}]}]'

# 查询事件总线
tccli monitor DescribeEventConditions \
  --Module "monitor"
```

### A.10 CLS（日志服务）

```bash
# 列出日志主题
tccli cls DescribeTopics \
  --Offset 0 --Limit 50

# 查询日志（Lucene 语法）
tccli cls SearchLog \
  --TopicId "xxxxx-xxxxx-xxxxx" \
  --From 1717200000 \
  --To 1717286400 \
  --Query "status:500 | select count(*) as cnt group by host" \
  --Limit 100

# 创建日志主题
tccli cls CreateTopic \
  --TopicName "nginx-access" \
  --LogsetId "logset-xxxxx"

# 创建投递任务（到 COS）
tccli cls CreateExport \
  --TopicId "xxxxx-xxxxx-xxxxx" \
  --From 1717200000 \
  --To 1717286400 \
  --Order "desc" \
  --Query "*"

# 查询仪表盘
tccli cls DescribeDashboards \
  --Offset 0 --Limit 20
```

---

## 附录 B：腾讯云推荐 SRE 工具链

### B.1 可观测性：Prometheus + Grafana

腾讯云提供托管的 **TMP（Tencent Managed Prometheus）** 和 **TMG（Tencent Managed Grafana）**，与自建方案相比免去了运维 Prometheus 本身的负担。

**架构建议：**

```
应用 / 业务指标
    │
    ▼
TMP (Prometheus) ◄── 节点指标 (Node Exporter)
    │                    ├── 容器指标 (kube-state-metrics)
    │                    ├── 数据库指标 (mysqld_exporter)
    │                    └── 负载均衡指标 (CLB Exporter)
    │
    ▼
TMP 告警规则 ──► 告警通知 (短信/企微/邮件)
    │
    ▼
TMG (Grafana) ──► 统一仪表盘
    ├── CVM 资源大盘
    ├── TKE 集群大盘
    ├── TDSQL 性能大盘
    └── 业务 SLO 大盘
```

**关键配置示例：**

```yaml
# TMP 告警规则示例（CVM CPU 高）
groups:
  - name: cvm-alerts
    rules:
      - alert: CpuHighUsage
        expr: avg by (instance) (cpu_usage_user + cpu_usage_system) > 0.85
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "CVM {{ $labels.instance }} CPU 使用率超过 85%"
```

**Grafana 推荐 Dashboard：**

| 仪表盘 | 用途 | 数据源 |
|--------|------|--------|
| Node Exporter Full | CVM 资源全景 | TMP |
| Kubernetes Cluster | TKE 集群状态 | TMP |
| TDSQL Overview | 数据库性能 | TMP + 自建 |
| SLO Burn Rate | 服务等级目标燃烧速率 | TMP |

### B.2 持续交付：ArgoCD

在 TKE 上部署 ArgoCD 实现 GitOps 工作流。

**部署命令：**

```bash
# 在 TKE 集群中安装 ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 获取初始密码
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# 端口转发访问 UI
kubectl port-forward -n argocd service/argocd-server 8080:443
```

**GitOps 工作流示例：**

```yaml
# application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://git.tencent.com/your-team/k8s-manifests.git
    targetBranch: main
    path: overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

**SRE 最佳实践：**

- 使用 `kustomize` 管理环境差异（production / staging / testing）
- 开启 `selfHeal` 确保集群状态与 Git 一致
- 配置 Webhook 实现自动同步（避免轮询延迟）
- 使用 `argocd-rollout` 实现蓝绿发布和金丝雀发布

### B.3 服务网格：Istio

在 TKE 上启用 Istio 实现灰度发布、流量管理和可观测性。

**安装方式：**

```bash
# 方式一：使用 TKE 服务网格（推荐，免运维）
# 在 TKE 控制台开启服务网格功能

# 方式二：自行安装
istioctl install --set profile=tencent-cloud \
  --set meshConfig.accessLogFile=/dev/stdout

# 注入 Sidecar
kubectl label namespace production istio-injection=enabled
```

**典型流量治理场景：**

```yaml
# 金丝雀发布：10% 流量到新版本
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: svc-a
  namespace: production
spec:
  hosts:
    - svc-a
  http:
    - route:
        - destination:
            host: svc-a
            subset: stable
          weight: 90
        - destination:
            host: svc-a
            subset: canary
          weight: 10
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: svc-a
  namespace: production
spec:
  host: svc-a
  subsets:
    - name: stable
      labels:
        version: v1
    - name: canary
      labels:
        version: v2
```

**故障注入测试：**

```yaml
# 注入 50% 的 503 错误，验证容错能力
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: svc-a-fault
spec:
  hosts:
    - svc-a
  http:
    - fault:
        abort:
          httpStatus: 503
          percentage:
            value: 50
      route:
        - destination:
            host: svc-a
```

### B.4 基础设施即代码：Terraform

使用 Terraform 管理腾讯云资源，实现基础设施版本化。

**Provider 配置：**

```hcl
# versions.tf
terraform {
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = ">= 1.81.0"
    }
  }
}

# provider.tf
provider "tencentcloud" {
  secret_id  = var.secret_id
  secret_key = var.secret_key
  region     = var.region
}
```

**典型资源编排示例：**

```hcl
# 创建 VPC + 子网 + CVM + CLB
resource "tencentcloud_vpc" "main" {
  name       = "prod-vpc"
  cidr_block = "10.0.0.0/16"
}

resource "tencentcloud_subnet" "main" {
  name              = "prod-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "ap-guangzhou-7"
}

resource "tencentcloud_instance" "web" {
  instance_name     = "web-prod-01"
  availability_zone = "ap-guangzhou-7"
  image_id          = "img-xxxxx"
  instance_type     = "S5.LARGE8"
  vpc_id            = tencentcloud_vpc.main.id
  subnet_id         = tencentcloud_subnet.main.id
  security_groups   = [tencentcloud_security_group.web.id]
}

resource "tencentcloud_clb_instance" "main" {
  clb_name = "prod-clb"
  network_type = "OPEN"
  vpc_id    = tencentcloud_vpc.main.id
  subnet_id = tencentcloud_subnet.main.id
}
```

**SRE 工作流建议：**

```
开发环境 → 测试环境 → 预发布环境 → 生产环境
    │           │           │            │
    ▼           ▼           ▼            ▼
  terraform workspace dev / test / staging / prod

# 使用 Terraform Cloud 或 CI/CD 执行
terraform plan -out=tfplan
terraform apply tfplan
```

**状态管理：**

```bash
# 使用 COS 作为远程状态后端
terraform init \
  -backend-config="bucket=tfstate-1250000000" \
  -backend-config="prefix=terraform/production" \
  -backend-config="region=ap-guangzhou"
```

---

## 附录 C：腾讯云 SLA 与技术支持渠道

### C.1 核心产品 SLA 汇总

| 产品 | SLA 承诺 | 不可用时长月赔付比例 |
|------|----------|---------------------|
| CVM（单实例） | 99.95% | ≥5min: 10%, ≥30min: 25%, ≥1h: 50% |
| CVM（多可用区） | 99.99% | 同上 |
| CLB | 99.95% | ≥5min: 10%, ≥30min: 25%, ≥1h: 50% |
| TKE（托管集群） | 99.95% | ≥5min: 10%, ≥30min: 25%, ≥1h: 50% |
| TDSQL | 99.99% | ≥5min: 10%, ≥30min: 25%, ≥1h: 50% |
| Redis | 99.95% | ≥5min: 10%, ≥30min: 25%, ≥1h: 50% |
| COS（标准存储） | 99.99% | ≥5min: 10%, ≥30min: 25%, ≥1h: 50% |
| CDN | 99.99% | 按月度账单比例赔付 |
| API 网关 | 99.99% | ≥5min: 10%, ≥30min: 25%, ≥1h: 50% |

**SLA 计算公式：**

```
SLA = (总分钟数 - 不可用分钟数) / 总分钟数 × 100%
```

**不可用判定标准：**
- 实例无法连接（TCP 连接超时）
- 实例宕机超过 5 分钟
- 因腾讯云侧故障导致的服务中断
- 因用户侧原因（配置错误、资源超限、欠费）导致的不可用不计入

### C.2 工单提交流程

**标准工单：**

```
腾讯云控制台 → 右上角"支持" → 提交工单
```

**工单分类与响应时间：**

| 工单类型 | 描述 | 响应时间（铂金） | 响应时间（企业） | 响应时间（基础） |
|----------|------|-----------------|-----------------|-----------------|
| 生产故障 | 线上服务不可用 | 5 分钟 | 15 分钟 | 30 分钟 |
| 紧急问题 | 功能异常但可降级 | 15 分钟 | 30 分钟 | 1 小时 |
| 一般问题 | 咨询、配置变更 | 30 分钟 | 1 小时 | 4 小时 |
| 建议反馈 | 产品建议 | 24 小时 | 48 小时 | 72 小时 |

**提交流程：**

1. 确定问题类型（故障 / 咨询 / 变更）
2. 收集必要信息：
   - 资源 ID（InstanceId、ClusterId 等）
   - 问题发生时间（精确到分钟）
   - 错误日志截图或文本
   - 复现步骤
3. 选择对应产品分类
4. 填写问题描述（建议包含：现象 → 影响范围 → 已尝试的排查步骤）
5. 设置紧急程度
6. 提交后关注工单进度

**工单加速技巧：**

- 使用"生产故障"标签获得最高优先级
- 附上 `tccli` 查询结果和监控截图
- 明确标注影响范围（影响多少用户、多少业务）
- 提供最小复现 Demo 或测试用例

### C.3 紧急联系方式

| 渠道 | 说明 | 适用场景 |
|------|------|----------|
| 在线工单 | 控制台提交 | 非紧急问题 |
| 电话热线 | 400-910-0100 | 生产故障（需提前绑定） |
| 企业微信群 | 售后技术支持群 | 日常运维咨询 |
| 腾讯云助手 App | 移动端工单 | 随时随地 |
| 专属技术经理 | 仅铂金/企业级支持 | 架构评审、重大变更 |

**电话热线使用前提：**
- 账号已绑定手机号
- 已购买对应级别的技术支持服务
- 准备好账号 UIN 和资源 ID

### C.4 故障赔付申请流程

1. 确认故障时间（以腾讯云监控数据为准）
2. 计算不可用时长
3. 登录控制台 → 费用中心 → 工单管理
4. 提交赔付申请工单，附上：
   - 故障时间范围
   - 受影响的资源 ID 列表
   - 监控截图（证明不可用）
5. 腾讯云在 5 个工作日内审核
6. 赔付以代金券形式发放，有效期 6 个月

---

## 附录 D：故障排查决策树

### D.1 Pod 异常排查决策树

```
Pod 状态异常
    │
    ├── Pending
    │   ├── 检查资源不足
    │   │   └── kubectl describe pod <pod> → Events 中查看 FailedScheduling
    │   │       ├── CPU/Mem 不足 → 扩容节点 / 调整 Request
    │   │       ├── GPU 资源不足 → 检查 GPU 节点池
    │   │       └── 节点污点不匹配 → kubectl describe node | grep Taints
    │   │
    │   ├── 检查 PVC 绑定
    │   │   └── kubectl get pvc → 状态为 Pending
    │   │       └── 检查 StorageClass 是否存在、是否支持动态供给
    │   │
    │   └── 检查镜像拉取
    │       └── kubectl describe pod → ImagePullBackOff / ErrImagePull
    │           ├── 镜像不存在 → 检查镜像名称和 Tag
    │           ├── 镜像仓库认证失败 → 检查 imagePullSecrets
    │           └── 镜像仓库限频 → 等待或使用镜像加速
    │
    ├── CrashLoopBackOff
    │   ├── 查看日志
    │   │   └── kubectl logs <pod> --previous
    │   │       ├── OOMKilled → 增加 memory limits
    │   │       ├── 启动命令失败 → 检查 entrypoint / CMD
    │   │       ├── 依赖服务不可用 → 检查 DB / Redis 连接
    │   │       └── 配置错误 → 检查 ConfigMap / Secret
    │   │
    │   └── 检查健康检查
    │       └── kubectl describe pod → Liveness / Readiness probe 失败
    │           ├── 探测路径错误 → 修正 httpGet.path
    │           ├── 探测端口未监听 → 检查容器监听端口
    │           └── 超时时间过短 → 调整 initialDelaySeconds / timeoutSeconds
    │
    ├── ImagePullBackOff
    │   └── 见 Pending 分支的镜像拉取检查
    │
    ├── Running 但 Readiness 探测失败
    │   ├── 服务未就绪
    │   │   └── kubectl exec -it <pod> -- curl localhost:8080/health
    │   │       ├── 返回非 200 → 检查应用健康检查逻辑
    │   │       └── 连接拒绝 → 检查监听端口
    │   │
    │   └── 网络策略限制
    │       └── 检查 NetworkPolicy 是否放通了健康检查流量
    │
    └── Evicted
        ├── 节点资源压力
        │   └── kubectl describe node → 查看 Pressure 状态
        │       ├── DiskPressure → 清理节点磁盘 / 调整 emptyDir 大小限制
        │       ├── MemoryPressure → 减少 Pod 内存使用 / 增加节点
        │       └── PIDPressure → 减少 Pod 数量
        │
        └── 节点不可用
            └── kubectl get node → 检查节点状态
                └── NotReady → 检查 kubelet 状态 / 联系腾讯云售后
```

**常用诊断命令速查：**

```bash
# 查看 Pod 事件
kubectl describe pod <pod> -n <ns>

# 查看容器日志（含前一次崩溃）
kubectl logs <pod> -n <ns> --previous

# 进入容器调试
kubectl exec -it <pod> -n <ns> -- /bin/sh

# 临时启动调试 Pod
kubectl run debug --image=nicolaka/netshoot -it --rm -- /bin/bash

# 查看节点资源
kubectl top node
kubectl top pod -n <ns>

# 查看节点状态详情
kubectl describe node <node>
```

### D.2 网络故障排查决策树

```
网络连通性异常
    │
    ├── 同 VPC 内不通
    │   ├── 检查安全组
    │   │   └── tccli vpc DescribeSecurityGroupPolicies
    │   │       ├── 入站规则未放通 → 添加对应端口规则
    │   │       └── 出站规则限制 → 检查出站规则
    │   │
    │   ├── 检查 ACL
    │   │   └── tccli vpc DescribeNetworkAcls
    │   │       └── ACL 规则未放通 → 添加入站/出站规则
    │   │
    │   ├── 检查路由表
    │   │   └── tccli vpc DescribeRouteTables
    │   │       └── 目标子网路由缺失 → 添加路由条目
    │   │
    │   └── 检查 CLB 后端状态
    │       └── tccli clb DescribeTargetHealth
    │           └── RS 异常 → 检查 RS 端口监听 / 健康检查配置
    │
    ├── 跨 VPC 不通
    │   ├── 检查对等连接
    │   │   └── tccli vpc DescribeVpcPeeringConnections
    │   │       ├── 状态非 ACTIVE → 检查对端是否接受
    │   │       └── 路由未添加 → 两端 VPC 均需添加路由
    │   │
    │   ├── 检查 CCN
    │   │   └── tccli vpc DescribeCcnAttachedInstances
    │   │       └── 实例未关联 → 将 VPC 关联到 CCN
    │   │
    │   └── 检查私有 DNS
    │       └── 是否启用了 Private DNS 解析
    │
    ├── 公网访问不通
    │   ├── 检查 EIP
    │   │   └── tccli vpc DescribeAddresses
    │   │       └── 未绑定 EIP → 申请并绑定
    │   │
    │   ├── 检查 NAT 网关
    │   │   └── tccli vpc DescribeNatGateways
    │   │       ├── NAT 网关状态异常 → 检查 NAT 网关
    │   │       └── 路由未指向 NAT → 添加默认路由指向 NAT
    │   │
    │   ├── 检查 CLB
    │   │   └── CLB 是否已绑定公网 IP
    │   │
    │   └── 检查带宽限制
    │       └── tccli monitor DescribeMonitorData → 查看出带宽是否打满
    │
    └── DNS 解析异常
        ├── 检查 Private DNS
        │   └── tccli privatedns DescribePrivateZoneList
        │       └── 解析记录是否存在
        │
        ├── 检查 /etc/resolv.conf
        │   └── nameserver 是否正确（腾讯云内网 DNS: 183.60.83.19 / 183.60.82.98）
        │
        └── 检查 CoreDNS（TKE 内）
            └── kubectl -n kube-system logs -l k8s-app=kube-dns
                └── CoreDNS 是否正常解析
```

**网络排查工具箱：**

```bash
# 在 TKE 集群中启动网络调试 Pod
kubectl run netshoot --image=nicolaka/netshoot -it --rm -- /bin/bash

# 常用网络诊断命令（在 netshoot 容器内）
ping <target-ip>                          # 基础连通性
traceroute <target-ip>                    # 路由追踪
mtr <target-ip>                           # 综合网络质量
nslookup <domain>                         # DNS 解析
curl -v http://<target>:<port>            # HTTP 探测
nc -zv <target> <port>                    # TCP 端口探测
tcpdump -i eth0 port 80                   # 抓包分析
ss -tlnp                                   # 查看本地监听端口
ip route                                   # 查看路由表
```

### D.3 数据库故障排查决策树

```
数据库访问异常
    │
    ├── 连接超时
    │   ├── 检查安全组
    │   │   └── 数据库端口（TDSQL: 3306, Redis: 6379）是否放通
    │   │
    │   ├── 检查连接数
    │   │   └── 是否达到最大连接数限制
    │   │       ├── TDSQL: show variables like 'max_connections'
    │   │       └── Redis: info clients → connected_clients
    │   │
    │   ├── 检查网络延迟
    │   │   └── tcping <db-ip> <port>
    │   │       └── 延迟 > 50ms → 检查是否跨可用区访问
    │   │
    │   └── 检查实例状态
    │       └── tccli tdsql DescribeDBInstanceDetail
    │           └── Status 是否为 running
    │
    ├── 慢查询
    │   ├── 查看慢查询日志
    │   │   └── tccli tdsql DescribeSlowLogs
    │   │       ├── 全表扫描 → 检查 SQL 是否缺少索引
    │   │       ├── 锁等待 → show processlist 查看锁状态
    │   │       └── 数据量过大 → 考虑分库分表 / 归档
    │   │
    │   ├── 检查索引
    │   │   └── show index from <table>
    │   │       ├── 缺少索引 → 创建合适的索引
    │   │       └── 索引失效 → 检查字段类型是否匹配
    │   │
    │   └── 检查资源瓶颈
    │       └── tccli monitor DescribeMonitorData
    │           ├── CPU > 80% → 升级实例规格
    │           ├── IOPS 打满 → 优化 SQL / 升级磁盘
    │           └── 内存不足 → 检查是否有大查询 / 增加内存
    │
    ├── 主从延迟
    │   ├── 检查延迟时间
    │   │   └── show slave status → Seconds_Behind_Master
    │   │       ├── 大事务 → 拆分事务
    │   │       ├── 从库写入 → 检查从库是否有写入负载
    │   │       └── 网络延迟 → 检查主从之间的网络质量
    │   │
    │   └── 检查从库性能
    │       └── 从库 CPU/IO 是否打满
    │
    └── Redis 大 Key / 热 Key
        ├── 大 Key 检测
        │   └── tccli redis DescribeBigKeyAnalysis
        │       ├── String 大 Key → 拆分 / 使用 Hash
        │       ├── List 大 Key → 拆分 / 使用 List 分片
        │       └── Set/Zset 大 Key → 拆分 / 清理过期数据
        │
        └── 热 Key 检测
            └── redis-cli --hotkeys
                ├── 热 Key 读 → 本地缓存 / 副本读取
                └── 热 Key 写 → 拆分 Key / 使用本地队列
```

**数据库常用诊断命令：**

```bash
# TDSQL 诊断
mysql -h <tdsql-ip> -u <user> -p
> show full processlist;                    # 查看当前连接
> show engine innodb status\G;             # InnoDB 引擎状态
> select * from information_schema.innodb_lock_waits;  # 锁等待
> explain <slow-sql>;                       # SQL 执行计划
> show global status like 'Threads_connected';  # 连接数
> show global status like 'Innodb_row_lock_current_waits';  # 行锁等待

# Redis 诊断
redis-cli -h <redis-ip> -p 6379 -a <password>
> info server                               # 服务器信息
> info memory                               # 内存使用
> info clients                              # 客户端连接
> info stats                                # 统计信息
> slowlog get 100                           # 慢查询
> memory usage <key>                        # 查看 Key 内存占用
> object encoding <key>                     # 查看 Key 编码类型
> cluster info                              # 集群信息（集群版）
> cluster nodes                             # 集群节点（集群版）

# 腾讯云监控查询
tccli monitor DescribeMonitorData \
  --Namespace "QCE/TDSQL" \
  --MetricName "CpuUsage" \
  --Period 60 \
  --StartTime "2024-06-01T00:00:00+08:00" \
  --EndTime "2024-06-01T01:00:00+08:00" \
  --Instances '[{"Dimensions":[{"Name":"InstanceId","Value":"tdsql-xxxxx"}]}]'
```

---

## 附录 E：SRE 日常巡检清单

### E.1 每日巡检

| 检查项 | 命令 / 方法 | 预期结果 |
|--------|------------|----------|
| CVM 实例状态 | `tccli cvm DescribeInstances` | 所有实例 RUNNING |
| CVM CPU 使用率 | 监控大盘 | < 80% |
| CVM 磁盘使用率 | 监控大盘 / df -h | < 85% |
| CLB 健康检查 | `tccli clb DescribeTargetHealth` | 所有 RS 健康 |
| TKE 节点状态 | `kubectl get node` | 所有节点 Ready |
| TKE Pod 状态 | `kubectl get pod --all-namespaces` | 无 CrashLoopBackOff |
| 数据库连接数 | `tccli tdsql DescribeDBInstanceDetail` | < 80% 最大连接数 |
| Redis 内存 | `tccli redis DescribeInstanceDetail` | < 80% maxmemory |
| 证书到期 | `tccli ssl DescribeCertificates` | > 30 天 |

### E.2 每周巡检

| 检查项 | 说明 |
|--------|------|
| 慢查询分析 | 检查 TDSQL / Redis 慢查询日志，识别新增慢 SQL |
| 容器镜像漏洞 | 扫描 TKE 使用的镜像（Trivy / 腾讯云容器镜像安全） |
| 备份验证 | 确认数据库备份任务完成，随机抽取一个备份进行恢复测试 |
| 日志容量 | 检查 CLS 日志主题的存储用量，调整索引周期 |
| 成本分析 | 查看上周云资源消费，识别异常增长 |

### E.3 每月巡检

| 检查项 | 说明 |
|--------|------|
| 安全组审计 | 检查是否有过于宽松的规则（0.0.0.0/0 的非必要端口） |
| 访问密钥轮转 | 检查 API 密钥是否超过 90 天未轮转 |
| 资源利用率分析 | 识别低负载 CVM / CLB / 数据库，评估降配或释放 |
| SLA 达标率 | 计算本月各产品实际可用性，对比 SLA 承诺 |
| 灾备演练 | 执行跨可用区切换 / 数据库主从切换演练 |
| 容量规划 | 根据业务增长趋势，评估下月资源需求 |

---

> **附录维护说明：** 本文档应随腾讯云产品迭代和团队运维经验积累持续更新。建议每季度 review 一次，确保命令示例和决策树与实际环境保持一致。
