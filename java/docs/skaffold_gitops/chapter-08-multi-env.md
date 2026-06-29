# 第8章 多环境管理与 Promotion

## 8.1 分支策略

### 解决的问题

多环境部署需要明确的分支策略来管理代码从开发到生产的流转过程。

### 核心原理

推荐 Trunk-Based Development 策略：

```
main ──────── dev ──────── staging ──────── prod
  │              │              │
  └── feature1 ──┘              │
  └── feature2 ─────────────────┘
```

- `main`：开发分支，自动部署到 dev 环境
- `release/x.y.z`：发布分支，部署到 staging
- `tags/vx.y.z`：标签，部署到 prod

### 代码/配置实现

**Git 分支操作：**

```bash
# 创建 feature 分支
git checkout -b feature/add-user-api
# 开发完成后合并到 main
git checkout main
git merge feature/add-user-api

# 创建 release 分支
git checkout -b release/1.2.0 main

# 创建 tag
git tag v1.2.0
git push origin v1.2.0
```

**Python 分支管理脚本：**

```python
#!/usr/bin/env python3
"""分支管理自动化脚本"""
import subprocess
import sys
from git import Repo

class BranchManager:
    def __init__(self, repo_path):
        self.repo = Repo(repo_path)
    
    def create_release_branch(self, version):
        """从 main 创建 release 分支"""
        main_branch = self.repo.heads.main
        release_branch = self.repo.create_head(f'release/{version}', main_branch.commit)
        print(f"创建 release 分支: release/{version}")
        return release_branch
    
    def create_tag(self, version):
        """创建版本标签"""
        main_branch = self.repo.heads.main
        self.repo.create_tag(f'v{version}', ref=main_branch.commit)
        print(f"创建标签: v{version}")
    
    def get_current_version(self):
        """获取当前版本号"""
        try:
            tag = self.repo.tags[-1]
            return tag.name.lstrip('v')
        except IndexError:
            return "0.0.1"

if __name__ == '__main__':
    manager = BranchManager('.')
    if len(sys.argv) > 1:
        manager.create_release_branch(sys.argv[1])
```

### 使用场景

- 多环境部署流程管理
- 版本发布管理
- 热修复流程

### 潜在风险与注意事项

- 分支策略过于复杂
- 合并冲突频繁
- 标签管理混乱

### 本章小结

- Trunk-Based Development 适合 GitOps
- Release 分支用于预发布验证
- Tag 用于生产部署

---

## 8.2 Skaffold Profiles 多环境

### 解决的问题

不同环境需要不同的配置（副本数、资源限制、环境变量），Skaffold Profiles 实现环境差异化。

### 核心原理

Skaffold Profiles 通过激活条件（环境变量、CLI 参数）选择不同的构建和部署配置。

### 代码/配置实现

**多环境 Profiles：**

```yaml
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: my-app

profiles:
# 开发环境
- name: dev
  activation:
  - env: ENV=dev
  deploy:
    helm:
      releases:
      - name: my-app
        valuesFiles:
        - charts/my-app/values.yaml
        - charts/my-app/values-dev.yaml
        namespace: my-app-dev

# 预发布环境
- name: staging
  activation:
  - env: ENV=staging
  - pullRequest:
      branches: [release/*]
  deploy:
    helm:
      releases:
      - name: my-app
        valuesFiles:
        - charts/my-app/values.yaml
        - charts/my-app/values-staging.yaml
        namespace: my-app-staging

# 生产环境
- name: prod
  activation:
  - env: ENV=prod
  - env: PRODUCTION=true
  deploy:
    helm:
      releases:
      - name: my-app
        valuesFiles:
        - charts/my-app/values.yaml
        - charts/my-app/values-prod.yaml
        namespace: my-app-prod
```

**环境 Values 文件：**

```yaml
# values-dev.yaml
replicaCount: 1
resources:
  requests:
    cpu: 100m
    memory: 128Mi
env:
  LOG_LEVEL: DEBUG
  SPRING_PROFILES_ACTIVE: dev

# values-staging.yaml
replicaCount: 2
resources:
  requests:
    cpu: 200m
    memory: 256Mi
env:
  LOG_LEVEL: INFO
  SPRING_PROFILES_ACTIVE: staging

# values-prod.yaml
replicaCount: 5
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi
env:
  LOG_LEVEL: WARN
  SPRING_PROFILES_ACTIVE: prod
```

### 使用场景

- 开发/预发布/生产环境差异化
- CI/CD 自动选择环境
- 本地开发调试

### 潜在风险与注意事项

- Profile 激活条件冲突
- 环境配置泄露
- 配置差异导致环境不一致

### 本章小结

- Profiles 通过激活条件自动选择
- 每个环境独立的 values 文件
- 环境差异化配置管理

---

## 8.3 Python Promotion Pipeline

### 解决的问题

手动 Promotion 效率低且容易出错，需要自动化 Promotion 流程。

### 核心原理

Promotion Pipeline 流程：
1. 验证源环境健康
2. 更新目标环境配置
3. 部署到目标环境
4. 验证目标环境健康
5. 失败时自动回滚

### 代码/配置实现

**Promotion 脚本：**

```python
#!/usr/bin/env python3
"""环境 Promotion 自动化脚本"""
import subprocess
import sys
import json
import time
from pathlib import Path

class PromotionPipeline:
    def __init__(self, app_name, source_env, target_env):
        self.app_name = app_name
        self.source_env = source_env
        self.target_env = target_env
        self.rollback_version = None
    
    def check_environment_health(self, env):
        """检查环境健康状态"""
        print(f"检查 {env} 环境健康状态...")
        result = subprocess.run([
            'kubectl', 'rollout', 'status', f'deployment/{self.app_name}',
            '-n', f'{self.app_name}-{env}', '--timeout=60s'
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"{env} 环境不健康: {result.stderr}")
        print(f"  {env} 环境健康")
        return True
    
    def update_values_file(self, version):
        """更新目标环境 values 文件"""
        values_file = Path(f'charts/{self.app_name}/values-{self.target_env}.yaml')
        content = values_file.read_text()
        
        # 更新镜像版本
        new_content = content.replace(
            f'image.tag: latest',
            f'image.tag: {version}'
        )
        values_file.write_text(new_content)
        print(f"  更新 {self.target_env} values 文件: image.tag -> {version}")
    
    def deploy_to_environment(self, env, version):
        """部署到指定环境"""
        print(f"部署到 {env} 环境...")
        result = subprocess.run([
            'skaffold', 'deploy', '--profile', env,
            '--images', f'{self.app_name}={version}'
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"部署到 {env} 失败: {result.stderr}")
        print(f"  部署到 {env} 成功")
    
    def promote(self, version):
        """执行 Promotion"""
        try:
            # 1. 检查源环境
            self.check_environment_health(self.source_env)
            
            # 2. 更新配置
            self.update_values_file(version)
            
            # 3. 部署到目标环境
            self.deploy_to_environment(self.target_env, version)
            
            # 4. 验证目标环境
            self.check_environment_health(self.target_env)
            
            print(f"Promotion 完成: {self.source_env} -> {self.target_env}")
            
        except Exception as e:
            print(f"Promotion 失败: {e}")
            sys.exit(1)

if __name__ == '__main__':
    pipeline = PromotionPipeline('my-app', 'staging', 'prod')
    pipeline.promote('v1.2.0')
```

### 使用场景

- 自动 Promotion dev -> staging -> prod
- CI/CD 流水线集成
- 版本发布管理

### 潜在风险与注意事项

- Promotion 失败需要自动回滚
- 环境间依赖关系
- 数据库迁移兼容性

### 本章小结

- Python 脚本实现自动化 Promotion
- 部署前验证源环境健康
- 失败时自动回滚

---

## 8.4 自动与手动 Promotion

### 解决的问题

不同环境需要不同的 Promotion 策略：开发环境自动 Promotion，生产环境需要审批。

### 核心原理

- 开发环境：代码合并到 main 后自动部署
- 预发布环境：Release 分支创建后自动部署
- 生产环境：Tag 创建后触发，需要审批

### 代码/配置实现

**自动 Promotion 脚本：**

```python
#!/usr/bin/env python3
"""自动 Promotion 脚本（CI 调用）"""
import os
import subprocess
from git import Repo

def auto_promote():
    """根据 Git 事件自动 Promotion"""
    repo = Repo('.')
    branch = repo.active_branch.name
    commit_sha = repo.head.commit.hexsha[:8]
    
    if branch == 'main':
        # 自动部署到 dev
        print(f"检测到 main 分支更新: {commit_sha}")
        subprocess.run([
            'skaffold', 'deploy', '--profile', 'dev',
            '--images', f'my-app={commit_sha}'
        ], check=True)
        
    elif branch.startswith('release/'):
        # 自动部署到 staging
        version = branch.split('/')[1]
        print(f"检测到 release 分支: {version}")
        subprocess.run([
            'skaffold', 'deploy', '--profile', 'staging',
            '--images', f'my-app={version}'
        ], check=True)
        
    elif repo.tag:
        # 生产部署（需要环境变量 APPROVED=true）
        if os.environ.get('APPROVED') == 'true':
            tag = repo.tags[-1].name
            print(f"检测到标签: {tag}")
            subprocess.run([
                'skaffold', 'deploy', '--profile', 'prod',
                '--images', f'my-app={tag}'
            ], check=True)
        else:
            print("生产部署需要审批，跳过")

if __name__ == '__main__':
    auto_promote()
```

### 使用场景

- CI/CD 自动 Promotion
- 生产环境审批流程
- 版本发布自动化

### 潜在风险与注意事项

- 自动部署可能引入不稳定
- 审批流程延迟
- 回滚策略需要配套

### 本章小结

- 开发环境自动 Promotion
- 生产环境需要审批
- 根据 Git 事件触发不同策略
