#!/usr/bin/env python3
"""
GitOps 主部署脚本
流程：更新 Helm values → 提交 Git → Skaffold 部署 → 健康检查 → 回滚
"""
import os
import sys
import subprocess
import yaml
import time
from pathlib import Path

class GitOpsDeployer:
    def __init__(self, environment="dev"):
        self.environment = environment
        self.namespace = f"tke-gitops-{environment}"
        self.skaffold_config = f"skaffold/skaffold-{environment}.yaml"
        self.values_file = f"charts/user-service/values-{environment}.yaml"
        self.app_name = "user-service"
    
    def update_image_tag(self, new_tag):
        """更新 Helm values 中的镜像 Tag"""
        values_path = Path(self.values_file)
        with open(values_path) as f:
            values = yaml.safe_load(f)
        
        old_tag = values.get("image", {}).get("tag", "latest")
        values.setdefault("image", {})["tag"] = new_tag
        
        with open(values_path, "w") as f:
            yaml.dump(values, f, default_flow_style=False)
        
        print(f"[GitOps] 镜像 Tag: {old_tag} -> {new_tag}")
        return True
    
    def git_commit_and_push(self, new_tag):
        """提交并推送 Git 变更"""
        try:
            subprocess.run(["git", "add", self.values_file], check=True, capture_output=True)
            subprocess.run(
                ["git", "commit", "-m", f"chore: update {self.app_name} image tag to {new_tag} [{self.environment}]"],
                check=True, capture_output=True
            )
            subprocess.run(["git", "push"], check=True, capture_output=True)
            print(f"[GitOps] 已提交并推送: {new_tag}")
            return True
        except subprocess.CalledProcessError as e:
            print(f"[GitOps] Git 操作失败: {e.stderr.decode()}")
            return False
    
    def skaffold_deploy(self):
        """调用 Skaffold 部署"""
        print(f"[GitOps] Skaffold 部署到 {self.environment}...")
        result = subprocess.run(
            ["skaffold", "deploy", "--config", self.skaffold_config],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"[GitOps] 部署失败: {result.stderr}")
            return False
        print(f"[GitOps] 部署成功")
        return True
    
    def health_check(self, timeout=120):
        """健康检查"""
        print(f"[GitOps] 健康检查 ({self.namespace})...")
        start = time.time()
        while time.time() - start < timeout:
            result = subprocess.run(
                ["kubectl", "rollout", "status", f"deployment/{self.app_name}",
                 "-n", self.namespace, "--timeout=10s"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                print(f"[GitOps] 健康检查通过")
                return True
            time.sleep(5)
        print(f"[GitOps] 健康检查超时")
        return False
    
    def deploy(self, new_tag):
        """完整部署流程"""
        print(f"\n{'='*50}")
        print(f"GitOps 部署: {self.environment} 环境")
        print(f"镜像版本: {new_tag}")
        print(f"{'='*50}\n")
        
        self.update_image_tag(new_tag)
        if not self.git_commit_and_push(new_tag):
            print("[GitOps] Git 操作失败，终止部署")
            return False
        
        if not self.skaffold_deploy():
            print("[GitOps] Skaffold 部署失败")
            self.rollback()
            return False
        
        if not self.health_check():
            print("[GitOps] 健康检查失败，执行回滚")
            self.rollback()
            return False
        
        print(f"\n[GitOps] ✅ 部署完成: {self.environment}/{new_tag}")
        return True
    
    def rollback(self):
        """回滚部署"""
        print(f"\n[GitOps] 执行回滚...")
        subprocess.run(
            ["kubectl", "rollout", "undo", f"deployment/{self.app_name}", "-n", self.namespace],
            capture_output=True
        )
        print(f"[GitOps] 回滚完成")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python gitops_deploy.py <dev|prod> <image-tag>")
        sys.exit(1)
    
    env = sys.argv[1]
    tag = sys.argv[2]
    deployer = GitOpsDeployer(env)
    success = deployer.deploy(tag)
    sys.exit(0 if success else 1)
