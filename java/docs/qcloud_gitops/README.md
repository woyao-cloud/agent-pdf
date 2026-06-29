# 腾讯云 TKE GitOps 实战项目

> CNB + Helm + Skaffold + Python 实现微服务 GitOps 流程

## 项目概述

本项目演示如何在腾讯云 TKE 上使用 CNB + Helm + Skaffold + Python 实现完整的 GitOps 流程。

### 架构

```
Git Push → CNB CI (Lint → Test → Build → Push → 通知)
         → Python GitOps 脚本 (更新 Helm values → 提交 Git)
         → Skaffold CD (部署到 TKE dev/prod)
         → 健康检查 → 失败回滚
```

### 技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 微服务 | FastAPI (Python) | 用户管理 REST API |
| 数据库 | SQLite | 用户数据存储 |
| CI | CNB (cnb.cool) | 代码托管 + CI 流水线 |
| CD | Helm + Skaffold + Python | 部署编排 |
| 容器编排 | TKE (腾讯云) | K8s 集群 |
| 日志 | CLS (腾讯云日志服务) | 日志采集与分析 |
| 监控 | TCOP (腾讯云监控) | 指标与告警 |
| IaC | Terraform | 基础设施管理 |

## 快速开始

### 前置条件

1. 腾讯云账号并配置 API 密钥
2. 安装 Terraform、Skaffold、Helm、kubectl
3. CNB 账号并创建项目

### 1. 创建基础设施

```bash
cd terraform

# 开发环境
terraform workspace new dev
terraform apply -var-file=environments/dev.tfvars

# 生产环境
terraform workspace new prod
terraform apply -var-file=environments/prod.tfvars
```

### 2. 配置 kubectl

```bash
# 获取 kubeconfig
terraform output kubeconfig > kubeconfig
export KUBECONFIG=$(pwd)/kubeconfig

# 创建命名空间
kubectl create namespace tke-gitops-dev
kubectl create namespace tke-gitops-prod
```

### 3. 本地开发

```bash
# 安装依赖
cd src
pip install -r requirements.txt

# 运行服务
uvicorn app.main:app --reload --port 8080

# 运行测试
pytest tests/ -v
```

### 4. Skaffold 本地部署

```bash
# 部署到 dev 环境
skaffold dev --config skaffold/skaffold-dev.yaml

# 部署到 prod 环境
skaffold run --config skaffold/skaffold-prod.yaml
```

### 5. GitOps 部署

```bash
# 部署到 dev
python scripts/gitops_deploy.py dev v1.0.0

# 部署到 prod
python scripts/gitops_deploy.py prod v1.0.0
```

### 6. 销毁资源

```bash
cd terraform
terraform destroy -var-file=environments/dev.tfvars
terraform destroy -var-file=environments/prod.tfvars
```

## API 文档

启动服务后访问：
- Swagger UI: http://localhost:8080/docs
- ReDoc: http://localhost:8080/redoc
- 健康检查: http://localhost:8080/health
- 监控指标: http://localhost:8080/metrics

## 项目结构

```
qcloud_gitops/
├── src/                    # FastAPI 微服务源码
├── charts/                 # Helm Chart
├── skaffold/               # Skaffold 配置
├── scripts/                # Python GitOps 脚本
├── terraform/              # Terraform IaC
├── cnb-pipeline.yaml       # CNB CI 流水线
└── docs/                   # 文档
```
