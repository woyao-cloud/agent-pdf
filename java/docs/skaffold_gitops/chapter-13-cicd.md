# 第13章 CI/CD 流水线集成（GitHub Actions + Skaffold）

## 13.1 GitHub Actions 流水线设计

### 解决的问题

将 Skaffold + Helm + Python 集成到 GitHub Actions 中，实现从代码提交到生产部署的全自动化。

### 核心原理

流水线阶段：
1. **Build**：Skaffold 构建镜像并推送到 ECR
2. **Test**：运行单元测试和 Helm 测试
3. **Deploy**：Skaffold 部署到开发环境
4. **Verify**：Python 健康检查脚本验证
5. **Promote**：自动或手动 Promotion 到生产环境

### 代码/配置实现

**GitHub Actions 工作流：**

```yaml
name: Build and Deploy

on:
  push:
    branches: [main, 'release/*']
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REGISTRY: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com
  APP_NAME: my-app

permissions:
  id-token: write
  contents: read

jobs:
  build:
    name: Build and Push
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
        aws-region: ${{ env.AWS_REGION }}

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v2

    - name: Setup Skaffold
      run: |
        curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64
        chmod +x skaffold
        sudo mv skaffold /usr/local/bin/

    - name: Build and push images
      run: |
        skaffold build --profile dev \
          --default-repo $ECR_REGISTRY \
          --file-output build-artifacts.json \
          --tag ${{ github.sha }}

    - name: Upload build artifacts
      uses: actions/upload-artifact@v4
      with:
        name: build-artifacts
        path: build-artifacts.json

  deploy-dev:
    name: Deploy to Dev
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
        aws-region: ${{ env.AWS_REGION }}

    - name: Download build artifacts
      uses: actions/download-artifact@v4
      with:
        name: build-artifacts

    - name: Deploy to dev
      run: |
        skaffold deploy --profile dev \
          --build-artifacts build-artifacts.json

    - name: Health check
      run: |
        python scripts/health_check.py --namespace my-app-dev --timeout 120

  deploy-staging:
    name: Deploy to Staging
    needs: deploy-dev
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/heads/release/')
    steps:
    - uses: actions/checkout@v4
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
        aws-region: ${{ env.AWS_REGION }}
    - name: Download build artifacts
      uses: actions/download-artifact@v4
      with:
        name: build-artifacts
    - name: Deploy to staging
      run: |
        skaffold deploy --profile staging \
          --build-artifacts build-artifacts.json
    - name: Health check
      run: |
        python scripts/health_check.py --namespace my-app-staging --timeout 120

  deploy-prod:
    name: Deploy to Production
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    environment: production
    steps:
    - uses: actions/checkout@v4
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
        aws-region: ${{ env.AWS_REGION }}
    - name: Download build artifacts
      uses: actions/download-artifact@v4
      with:
        name: build-artifacts
    - name: Deploy to production
      run: |
        skaffold deploy --profile prod \
          --build-artifacts build-artifacts.json
    - name: Health check
      run: |
        python scripts/health_check.py --namespace my-app-prod --timeout 180
```

### 使用场景

- 自动化 CI/CD 流水线
- 多环境部署
- 生产环境审批

### 潜在风险与注意事项

- GitHub Actions 运行时间限制
- OIDC 凭证过期
- 构建产物传递

### 本章小结

- 分阶段流水线：Build → Deploy → Verify
- 不同分支触发不同环境
- 生产环境需要审批

---

## 13.2 Skaffold CI 模式

### 解决的问题

CI 环境中需要高效的构建和部署，Skaffold 的 CI 模式支持分离构建和部署步骤。

### 核心原理

Skaffold CI 模式：
- `skaffold build`：构建镜像并推送到仓库
- `skaffold deploy`：从仓库拉取镜像并部署
- `--file-output`：保存构建产物供后续使用
- `--build-artifacts`：使用之前构建的产物

### 代码/配置实现

**CI 构建命令：**

```bash
# 构建并推送
skaffold build \
  --profile prod \
  --default-repo $ECR_REGISTRY \
  --file-output build-artifacts.json \
  --tag $GIT_SHA

# 查看构建产物
cat build-artifacts.json
# {
#   "builds": [
#     {
#       "imageName": "my-app",
#       "tag": "1234567.dkr.ecr.us-east-1.amazonaws.com/my-app:abc1234"
#     }
#   ]
# }

# 使用构建产物部署
skaffold deploy \
  --profile prod \
  --build-artifacts build-artifacts.json
```

**缓存优化：**

```yaml
# skaffold.yaml 缓存配置
build:
  artifacts:
  - image: my-app
    docker:
      dockerfile: Dockerfile
      cacheFrom:
      - $ECR_REGISTRY/my-app:latest
  local:
    useBuildkit: true
    concurrency: 0
```

### 使用场景

- CI/CD 流水线构建
- 多步骤部署
- 构建缓存优化

### 潜在风险与注意事项

- 构建产物文件格式变化
- 缓存失效导致构建变慢
- 并发构建冲突

### 本章小结

- 分离构建和部署步骤
- `--file-output` 传递构建产物
- 使用 BuildKit 缓存加速

---

## 13.3 Python 脚本集成

### 解决的问题

CI/CD 流水线中需要灵活的自动化逻辑，Python 脚本提供比 YAML 更强大的能力。

### 核心原理

Python 脚本在 CI/CD 中的角色：
- 环境检查
- 配置更新
- 健康验证
- 回滚处理
- 通知发送

### 代码/配置实现

**CI 集成的 Python 脚本：**

```python
#!/usr/bin/env python3
"""CI/CD 集成脚本"""
import os
import subprocess
import json
import sys
import time

class CICDPipeline:
    def __init__(self):
        self.aws_region = os.environ.get('AWS_REGION', 'us-east-1')
        self.ecr_registry = os.environ.get('ECR_REGISTRY')
        self.app_name = os.environ.get('APP_NAME', 'my-app')
        self.git_sha = os.environ.get('GITHUB_SHA', 'latest')
    
    def run_skaffold_build(self):
        """执行 Skaffold 构建"""
        print("=== 开始构建 ===")
        result = subprocess.run([
            'skaffold', 'build',
            '--profile', 'dev',
            '--default-repo', self.ecr_registry,
            '--file-output', 'build-artifacts.json',
            '--tag', self.git_sha
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"构建失败: {result.stderr}")
            sys.exit(1)
        
        with open('build-artifacts.json') as f:
            artifacts = json.load(f)
        
        print(f"构建成功: {artifacts['builds'][0]['tag']}")
        return artifacts
    
    def run_skaffold_deploy(self, profile, artifacts_file):
        """执行 Skaffold 部署"""
        print(f"=== 部署到 {profile} ===")
        result = subprocess.run([
            'skaffold', 'deploy',
            '--profile', profile,
            '--build-artifacts', artifacts_file
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"部署失败: {result.stderr}")
            return False
        
        print(f"部署成功")
        return True
    
    def wait_for_rollout(self, namespace, timeout=180):
        """等待部署完成"""
        print(f"等待 {namespace} 部署完成...")
        start = time.time()
        while time.time() - start < timeout:
            result = subprocess.run([
                'kubectl', 'rollout', 'status', f'deployment/{self.app_name}',
                '-n', namespace, '--timeout=10s'
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                print("部署完成")
                return True
            
            time.sleep(5)
        
        print("部署超时")
        return False
    
    def run(self):
        """执行完整流水线"""
        # 1. 构建
        artifacts = self.run_skaffold_build()
        
        # 2. 部署到 dev
        if not self.run_skaffold_deploy('dev', 'build-artifacts.json'):
            sys.exit(1)
        
        # 3. 等待就绪
        if not self.wait_for_rollout(f'{self.app_name}-dev'):
            sys.exit(1)
        
        print("=== CI/CD 流水线完成 ===")

if __name__ == '__main__':
    pipeline = CICDPipeline()
    pipeline.run()
```

### 使用场景

- CI/CD 流水线自动化
- 自定义部署逻辑
- 错误处理和重试

### 潜在风险与注意事项

- 子进程超时处理
- 环境变量传递
- 错误日志记录

### 本章小结

- Python 脚本提供灵活自动化
- 封装 Skaffold 命令调用
- 实现健康检查和超时处理
