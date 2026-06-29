# 环境搭建指南

## 1. 腾讯云账号准备

### 注册与认证
1. 注册腾讯云账号：https://cloud.tencent.com
2. 完成实名认证
3. 开通 TKE、CLS、TCOP 等服务

### API 密钥
```bash
# 在腾讯云控制台 -> 访问管理 -> API 密钥管理 创建密钥
export TENCENTCLOUD_SECRET_ID="your-secret-id"
export TENCENTCLOUD_SECRET_KEY="your-secret-key"
```

## 2. 本地工具安装

### Terraform
```bash
# Windows (choco)
choco install terraform

# macOS
brew install terraform

# Linux
wget https://releases.hashicorp.com/terraform/1.8.0/terraform_1.8.0_linux_amd64.zip
unzip terraform_*.zip && sudo mv terraform /usr/local/bin/
```

### Skaffold
```bash
# Windows (choco)
choco install skaffold

# macOS
brew install skaffold

# Linux
curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64
chmod +x skaffold && sudo mv skaffold /usr/local/bin/
```

### Helm
```bash
# Windows (choco)
choco install kubernetes-helm

# macOS
brew install helm

# Linux
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### kubectl
```bash
# Windows (choco)
choco install kubernetes-cli

# macOS
brew install kubectl

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/
```

### Python
```bash
# 安装 Python 3.11+
python --version

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/macOS
venv\Scripts\activate     # Windows

# 安装依赖
pip install -r src/requirements.txt
```

## 3. CNB 项目配置

1. 登录 https://cnb.cool
2. 创建项目 `woyao-code/firstApp`
3. 推送代码到 CNB 仓库
4. 配置 CI 流水线（使用 cnb-pipeline.yaml）

## 4. Docker Hub 配置

```bash
# 登录 Docker Hub
docker login

# 创建仓库
# 在 Docker Hub 创建 user-service 仓库
```

## 5. 验证安装

```bash
# 验证所有工具
terraform --version
skaffold version
helm version
kubectl version --client
python --version
docker --version
```
