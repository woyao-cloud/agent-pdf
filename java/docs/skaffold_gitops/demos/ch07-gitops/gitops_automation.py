#!/usr/bin/env python3
"""
GitOps 自动化脚本
包含 Git 操作、Values 更新、Promotion、健康检查
"""
import os
import subprocess
import sys
import yaml
import time
from pathlib import Path
from git import Repo

class GitOpsAutomation:
    def __init__(self, repo_path='.'):
        self.repo = Repo(repo_path)
        self.app_name = 'demo-app'
    
    def update_helm_values(self, env, key, value):
        """更新 Helm values 文件"""
        values_file = Path(f'charts/{self.app_name}/values-{env}.yaml')
        if not values_file.exists():
            values_file = Path(f'charts/{self.app_name}/values.yaml')
        
        with open(values_file) as f:
            values = yaml.safe_load(f)
        
        # 更新嵌套 key (如 image.tag)
        keys = key.split('.')
        current = values
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value
        
        with open(values_file, 'w') as f:
            yaml.dump(values, f, default_flow_style=False)
        
        print(f"更新 {values_file}: {key} = {value}")
    
    def commit_and_push(self, message):
        """提交并推送变更"""
        self.repo.git.add('.')
        if self.repo.is_dirty():
            self.repo.index.commit(message)
            origin = self.repo.remotes.origin
            origin.push()
            print(f"已提交并推送: {message}")
        else:
            print("无变更需要提交")
    
    def promote(self, source_env, target_env, version):
        """执行环境 Promotion"""
        print(f"Promotion: {source_env} -> {target_env}")
        
        # 1. 更新目标环境 values
        self.update_helm_values(target_env, 'image.tag', version)
        
        # 2. 提交变更
        self.commit_and_push(
            f"Promote {self.app_name} {version} from {source_env} to {target_env}"
        )
        
        # 3. 部署到目标环境
        result = subprocess.run([
            'skaffold', 'deploy', '--profile', target_env
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"部署失败: {result.stderr}")
            return False
        
        print(f"Promotion 完成")
        return True
    
    def health_check(self, namespace, timeout=120):
        """健康检查"""
        print(f"检查 {namespace} 健康状态...")
        start = time.time()
        while time.time() - start < timeout:
            result = subprocess.run([
                'kubectl', 'rollout', 'status', f'deployment/{self.app_name}',
                '-n', namespace, '--timeout=10s'
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                print(f"{namespace} 健康")
                return True
            time.sleep(5)
        
        print(f"{namespace} 健康检查超时")
        return False

if __name__ == '__main__':
    gitops = GitOpsAutomation()
    if len(sys.argv) > 1:
        action = sys.argv[1]
        if action == 'promote':
            gitops.promote(sys.argv[2], sys.argv[3], sys.argv[4])
        elif action == 'health':
            gitops.health_check(sys.argv[2])
