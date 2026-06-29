# 腾讯云 TKE GitOps 实战方案：CNB + Helm + Skaffold + Python

## 方案概述

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                       开发者 Git Push                               │
│                    https://cnb.cool/woyao-code/firstApp              │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CNB CI 流水线                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Lint检查 │→│ Test运行 │→│ 镜像构建 │→│ 推送Docker│→ 邮件通知  │
│  │ (flake8) │  │ (pytest) │  │ (Docker) │  │   Hub    │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CD 流程 (Helm + Skaffold + Python)               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Python GitOps 脚本                                            │   │
│  │ 1. 拉取最新代码                                              │   │
│  │ 2. 更新 Helm values 中的镜像 Tag                             │   │
│  │ 3. 提交并推送 Git                                            │   │
│  │ 4. 调用 Skaffold 部署                                        │   │
│  │ 5. 健康检查                                                  │   │
│  │ 6. 失败回滚                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TKE 集群 (腾讯云)                                 │
│                                                                     │
│  ┌─────────────────────┐    ┌─────────────────────┐                │
│  │  dev 命名空间        │    │  production 命名空间  │                │
│  │  tke-gitops-dev     │    │  tke-gitops-prod    │                │
│  │                     │    │                     │                │
│  │  user-service:1.0.0 │    │  user-service:1.0.0 │                │
│  │  (1 replica)        │    │  (3 replicas)       │                │
│  └─────────────────────┘    └─────────────────────┘                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  CLS 日志采集 (LogListener DaemonSet)                        │   │
│  │  TCOP 监控 (Prometheus 指标 + 自定义指标)                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 组件 | 技术选型 | 用途 |
|------|---------|------|
| **微服务框架** | FastAPI (Python) | 用户管理 REST API |
| **数据库** | SQLite (aiosqlite) | 用户数据存储 |
| **CI 平台** | CNB (cnb.cool) | 代码托管 + CI 流水线 |
| **CD 工具** | Helm + Skaffold + Python | 部署编排 |
| **容器编排** | TKE (腾讯云) | K8s 集群 |
| **日志** | CLS (腾讯云日志服务) | 日志采集与分析 |
| **监控** | TCOP (腾讯云监控) | 指标与告警 |
| **IaC** | Terraform | 基础设施管理 |
| **镜像仓库** | Docker Hub | 镜像存储 |

---

## 目录结构

```
qcloud_gitops/
├── PLAN.md                          # 本方案文档
├── README.md                        # 项目使用文档
│
├── src/                             # FastAPI 微服务源码
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI 应用入口
│   │   ├── models.py                # SQLAlchemy 数据模型
│   │   ├── schemas.py               # Pydantic 请求/响应模型
│   │   ├── database.py              # 数据库连接配置
│   │   ├── crud.py                  # CRUD 操作
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   └── users.py             # 用户管理 API 路由
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   └── user_service.py      # 用户业务逻辑
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── logger.py            # CLS 日志集成
│   │       └── metrics.py           # TCOP 监控指标
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py              # 测试配置
│   │   └── test_users.py            # 用户 API 测试
│   ├── requirements.txt             # Python 依赖
│   ├── Dockerfile                   # 多阶段构建
│   └── .dockerignore
│
├── charts/                          # Helm Chart
│   └── user-service/
│       ├── Chart.yaml
│       ├── values.yaml              # 默认 values
│       ├── values-dev.yaml          # 开发环境 values
│       ├── values-prod.yaml         # 生产环境 values
│       └── templates/
│           ├── _helpers.tpl
│           ├── deployment.yaml
│           ├── service.yaml
│           ├── configmap.yaml       # 应用配置
│           ├── hpa.yaml             # 弹性伸缩
│           ├── pdb.yaml             # Pod 预算
│           └── serviceaccount.yaml
│
├── skaffold/                        # Skaffold 配置
│   ├── skaffold-dev.yaml            # 开发环境配置
│   └── skaffold-prod.yaml           # 生产环境配置
│
├── scripts/                         # Python GitOps 脚本
│   ├── gitops_deploy.py             # 主部署脚本
│   ├── health_check.py              # 健康检查
│   ├── rollback.py                  # 回滚脚本
│   └── notify.py                    # 通知脚本
│
├── terraform/                       # Terraform IaC
│   ├── main.tf                      # 主配置
│   ├── variables.tf                 # 变量定义
│   ├── outputs.tf                   # 输出
│   ├── modules/
│   │   ├── tke/                     # TKE 集群模块
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   ├── cls/                     # CLS 日志模块
│   │   │   ├── main.tf
│   │   │   └── variables.tf
│   │   └── tcop/                    # TCOP 监控模块
│   │       ├── main.tf
│   │       └── variables.tf
│   └── environments/
│       ├── dev.tfvars               # 开发环境变量
│       └── prod.tfvars              # 生产环境变量
│
├── cnb-pipeline.yaml                # CNB CI 流水线配置
│
└── docs/                            # 文档
    ├── setup.md                     # 环境搭建指南
    ├── deployment.md                # 部署指南
    └── api.md                       # API 文档
```

---

## 各模块详细设计

### 1. FastAPI 用户管理微服务

**API 接口：**

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/v1/users` | 创建用户 |
| GET | `/api/v1/users/{id}` | 获取用户详情 |
| GET | `/api/v1/users` | 获取用户列表（分页） |
| PUT | `/api/v1/users/{id}` | 修改用户信息 |
| DELETE | `/api/v1/users/{id}` | 删除用户 |
| GET | `/health` | 健康检查 |
| GET | `/metrics` | Prometheus 指标 |

**用户模型：**

```python
class User(Base):
    id: int (自增主键)
    username: str (唯一)
    email: str (唯一)
    full_name: str
    age: int | None
    phone: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
```

**CLS 集成：** 通过 Python logging handler 将结构化 JSON 日志发送到 CLS
**TCOP 集成：** 通过 Prometheus client 暴露自定义指标（用户数、请求数、延迟）

### 2. TKE 环境规划

| 环境 | 命名空间 | 副本数 | 资源限制 | 数据库 |
|------|---------|--------|---------|--------|
| dev | tke-gitops-dev | 1 | 0.5C/512M | SQLite 文件 |
| production | tke-gitops-prod | 3 | 1C/1G | SQLite 文件（PV） |

### 3. CNB CI 流水线

**触发条件：** git push 到 main 分支

**流水线阶段：**
1. **Lint 检查**：flake8 + black 代码格式检查
2. **Test 运行**：pytest 单元测试 + 覆盖率报告
3. **Docker 构建**：多阶段构建，推送到 Docker Hub
4. **邮件通知**：构建结果通过邮件通知

### 4. CD 流程（Helm + Skaffold + Python）

**Python GitOps 脚本流程：**
1. 检测到新镜像版本
2. 更新 Helm values 中的 image.tag
3. 提交并推送到 Git 仓库
4. 调用 Skaffold 部署到 TKE
5. 健康检查（等待 Pod 就绪）
6. 失败时自动回滚

### 5. Terraform 资源

| 资源 | 说明 |
|------|------|
| TKE 集群 | 托管集群，2 节点池（dev/prod） |
| CLS 日志集 | 日志主题 + 采集配置 |
| TCOP 告警 | 告警策略 + 通知模板 |
| VPC + 子网 | 网络基础设施 |
| 安全组 | 访问控制 |

---

## 文件清单

| 编号 | 文件路径 | 说明 |
|------|---------|------|
| 1 | `PLAN.md` | 本方案文档 |
| 2 | `README.md` | 项目使用文档 |
| 3 | `src/app/main.py` | FastAPI 应用入口 |
| 4 | `src/app/models.py` | 数据模型 |
| 5 | `src/app/schemas.py` | Pydantic 模型 |
| 6 | `src/app/database.py` | 数据库配置 |
| 7 | `src/app/crud.py` | CRUD 操作 |
| 8 | `src/app/routers/users.py` | 用户 API 路由 |
| 9 | `src/app/services/user_service.py` | 用户业务逻辑 |
| 10 | `src/app/utils/logger.py` | CLS 日志集成 |
| 11 | `src/app/utils/metrics.py` | TCOP 监控指标 |
| 12 | `src/tests/conftest.py` | 测试配置 |
| 13 | `src/tests/test_users.py` | 用户 API 测试 |
| 14 | `src/requirements.txt` | Python 依赖 |
| 15 | `src/Dockerfile` | Docker 多阶段构建 |
| 16 | `src/.dockerignore` | Docker 忽略文件 |
| 17 | `charts/user-service/Chart.yaml` | Helm Chart 定义 |
| 18 | `charts/user-service/values.yaml` | 默认 values |
| 19 | `charts/user-service/values-dev.yaml` | 开发环境 values |
| 20 | `charts/user-service/values-prod.yaml` | 生产环境 values |
| 21 | `charts/user-service/templates/_helpers.tpl` | Helm 辅助模板 |
| 22 | `charts/user-service/templates/deployment.yaml` | Deployment 模板 |
| 23 | `charts/user-service/templates/service.yaml` | Service 模板 |
| 24 | `charts/user-service/templates/configmap.yaml` | ConfigMap 模板 |
| 25 | `charts/user-service/templates/hpa.yaml` | HPA 模板 |
| 26 | `charts/user-service/templates/pdb.yaml` | PDB 模板 |
| 27 | `charts/user-service/templates/serviceaccount.yaml` | ServiceAccount 模板 |
| 28 | `skaffold/skaffold-dev.yaml` | Skaffold 开发配置 |
| 29 | `skaffold/skaffold-prod.yaml` | Skaffold 生产配置 |
| 30 | `scripts/gitops_deploy.py` | GitOps 主部署脚本 |
| 31 | `scripts/health_check.py` | 健康检查脚本 |
| 32 | `scripts/rollback.py` | 回滚脚本 |
| 33 | `scripts/notify.py` | 通知脚本 |
| 34 | `terraform/main.tf` | Terraform 主配置 |
| 35 | `terraform/variables.tf` | Terraform 变量 |
| 36 | `terraform/outputs.tf` | Terraform 输出 |
| 37 | `terraform/modules/tke/main.tf` | TKE 模块 |
| 38 | `terraform/modules/tke/variables.tf` | TKE 模块变量 |
| 39 | `terraform/modules/tke/outputs.tf` | TKE 模块输出 |
| 40 | `terraform/modules/cls/main.tf` | CLS 模块 |
| 41 | `terraform/modules/cls/variables.tf` | CLS 模块变量 |
| 42 | `terraform/modules/tcop/main.tf` | TCOP 模块 |
| 43 | `terraform/modules/tcop/variables.tf` | TCOP 模块变量 |
| 44 | `terraform/environments/dev.tfvars` | 开发环境变量 |
| 45 | `terraform/environments/prod.tfvars` | 生产环境变量 |
| 46 | `cnb-pipeline.yaml` | CNB CI 流水线配置 |
| 47 | `docs/setup.md` | 环境搭建指南 |
| 48 | `docs/deployment.md` | 部署指南 |
| 49 | `docs/api.md` | API 文档 |

---

## 执行步骤

1. 创建目录结构
2. 生成 FastAPI 微服务源码（含 CLS + TCOP 集成）
3. 生成 Helm Chart 配置
4. 生成 Skaffold 配置
5. 生成 Python GitOps 脚本
6. 生成 Terraform IaC 文件
7. 生成 CNB CI 流水线配置
8. 生成使用文档
