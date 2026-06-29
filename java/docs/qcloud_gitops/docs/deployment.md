# 部署指南

## 完整部署流程

### 1. 创建基础设施

```bash
cd terraform

# 初始化
terraform init

# 开发环境
terraform workspace select dev 2>/dev/null || terraform workspace new dev
terraform plan -var-file=environments/dev.tfvars -out=dev.tfplan
terraform apply dev.tfplan

# 生产环境
terraform workspace select prod 2>/dev/null || terraform workspace new prod
terraform plan -var-file=environments/prod.tfvars -out=prod.tfplan
terraform apply prod.tfplan
```

### 2. 配置集群访问

```bash
# 获取 kubeconfig
terraform output -raw kubeconfig > kubeconfig
export KUBECONFIG=$(pwd)/kubeconfig

# 验证连接
kubectl cluster-info
kubectl get nodes
```

### 3. 创建命名空间

```bash
kubectl create namespace tke-gitops-dev
kubectl create namespace tke-gitops-prod
```

### 4. 配置 CLS 日志采集

```bash
# 部署 LogListener DaemonSet
helm repo add tencent https://charts.tencent.com
helm upgrade --install cls-loglistener tencent/cls-loglistener \
  --namespace cls \
  --create-namespace \
  --set topicId=<CLS_TOPIC_ID>
```

### 5. 部署应用

```bash
# 方式一：Skaffold 直接部署
skaffold run --config skaffold/skaffold-dev.yaml

# 方式二：GitOps 脚本部署
python scripts/gitops_deploy.py dev v1.0.0

# 方式三：Helm 直接部署
helm upgrade --install user-service charts/user-service \
  --namespace tke-gitops-dev \
  --values charts/user-service/values.yaml \
  --values charts/user-service/values-dev.yaml
```

### 6. 验证部署

```bash
# 检查 Pod
kubectl get pods -n tke-gitops-dev

# 健康检查
python scripts/health_check.py dev

# 测试 API
kubectl port-forward -n tke-gitops-dev svc/user-service 8080:8080 &
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/users
```

### 7. 生产环境部署

```bash
# 部署到生产
python scripts/gitops_deploy.py prod v1.0.0

# 验证
python scripts/health_check.py prod
```

## 回滚操作

```bash
# 回滚到上一版本
python scripts/rollback.py dev

# 回滚到指定版本
python scripts/rollback.py dev 3

# 查看部署历史
kubectl rollout history deployment/user-service -n tke-gitops-dev
```

## 销毁资源

```bash
# 删除应用
helm uninstall user-service -n tke-gitops-dev
helm uninstall user-service -n tke-gitops-prod

# 销毁基础设施
cd terraform
terraform destroy -var-file=environments/dev.tfvars
terraform destroy -var-file=environments/prod.tfvars
```
