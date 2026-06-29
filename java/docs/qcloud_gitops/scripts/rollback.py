#!/usr/bin/env python3
"""回滚脚本"""
import sys
import subprocess

def rollback_deployment(namespace, app_name="user-service", revision=None):
    print(f"回滚 Deployment: {app_name} ({namespace})")
    
    if revision:
        cmd = ["kubectl", "rollout", "undo", f"deployment/{app_name}",
               "-n", namespace, f"--to-revision={revision}"]
    else:
        cmd = ["kubectl", "rollout", "undo", f"deployment/{app_name}", "-n", namespace]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  ✅ 回滚成功")
        return True
    else:
        print(f"  ❌ 回滚失败: {result.stderr}")
        return False

def list_revisions(namespace, app_name="user-service"):
    result = subprocess.run(
        ["kubectl", "rollout", "history", f"deployment/{app_name}", "-n", namespace],
        capture_output=True, text=True
    )
    print(f"部署历史:\n{result.stdout}")

if __name__ == "__main__":
    env = sys.argv[1] if len(sys.argv) > 1 else "dev"
    revision = sys.argv[2] if len(sys.argv) > 2 else None
    ns = f"tke-gitops-{env}"
    
    list_revisions(ns)
    rollback_deployment(ns, revision=revision)
