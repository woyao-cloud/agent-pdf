#!/usr/bin/env python3
"""
多环境 Promotion 脚本
支持自动和手动 Promotion
"""
import os
import sys
import subprocess
import json
import time
from pathlib import Path

class EnvironmentPromoter:
    def __init__(self, app_name='demo-app'):
        self.app_name = app_name
        self.environments = ['dev', 'staging', 'prod']
    
    def check_health(self, env):
        """检查环境健康"""
        namespace = f'{self.app_name}-{env}'
        result = subprocess.run([
            'kubectl', 'rollout', 'status',
            f'deployment/{self.app_name}',
            '-n', namespace, '--timeout=30s'
        ], capture_output=True, text=True)
        return result.returncode == 0
    
    def deploy(self, env, version):
        """部署到指定环境"""
        print(f"部署 {self.app_name} {version} 到 {env}")
        result = subprocess.run([
            'skaffold', 'deploy', '--profile', env,
            '--images', f'{self.app_name}={version}'
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"部署失败: {result.stderr}")
            return False
        
        # 等待就绪
        if not self.check_health(env):
            print(f"健康检查失败，执行回滚")
            self.rollback(env)
            return False
        
        return True
    
    def rollback(self, env):
        """回滚部署"""
        namespace = f'{self.app_name}-{env}'
        result = subprocess.run([
            'kubectl', 'rollout', 'undo',
            f'deployment/{self.app_name}',
            '-n', namespace
        ], capture_output=True, text=True)
        print(f"回滚结果: {result.stdout}")
    
    def promote_chain(self, version, auto_approve=False):
        """执行 Promotion 链"""
        for env in self.environments:
            if env == 'prod' and not auto_approve:
                print(f"需要审批才能部署到 {env}")
                approval = input(f"确认部署到 {env}? (y/n): ")
                if approval.lower() != 'y':
                    print("Promotion 已取消")
                    return False
            
            if not self.deploy(env, version):
                print(f"部署到 {env} 失败")
                return False
            
            print(f"部署到 {env} 成功")
        
        print("Promotion 链完成")
        return True

if __name__ == '__main__':
    promoter = EnvironmentPromoter()
    if len(sys.argv) > 1:
        version = sys.argv[1]
        auto = '--auto' in sys.argv
        promoter.promote_chain(version, auto)
    else:
        print("用法: python promote.py <version> [--auto]")
