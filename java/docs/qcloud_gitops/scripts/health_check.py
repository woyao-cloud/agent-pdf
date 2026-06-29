#!/usr/bin/env python3
"""健康检查脚本"""
import sys
import subprocess
import requests
import time

def check_deployment(namespace, app_name="user-service", timeout=120):
    print(f"检查 Deployment: {app_name} ({namespace})")
    start = time.time()
    while time.time() - start < timeout:
        result = subprocess.run(
            ["kubectl", "rollout", "status", f"deployment/{app_name}",
             "-n", namespace, "--timeout=10s"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print("  ✅ Deployment 就绪")
            return True
        time.sleep(5)
    print("  ❌ Deployment 超时")
    return False

def check_service_endpoint(namespace, app_name="user-service"):
    result = subprocess.run(
        ["kubectl", "get", "svc", app_name, "-n", namespace,
         "-o", "jsonpath={.spec.clusterIP}"],
        capture_output=True, text=True
    )
    if result.stdout:
        print(f"  ✅ Service IP: {result.stdout}")
        return True
    print("  ❌ Service 未就绪")
    return False

def check_http_health(namespace, app_name="user-service"):
    result = subprocess.run(
        ["kubectl", "get", "pods", "-n", namespace,
         "-l", f"app.kubernetes.io/name={app_name}",
         "-o", "jsonpath={.items[0].status.podIP}"],
        capture_output=True, text=True
    )
    if result.stdout:
        pod_ip = result.stdout
        try:
            resp = requests.get(f"http://{pod_ip}:8080/health", timeout=5)
            if resp.status_code == 200:
                print(f"  ✅ HTTP 健康检查通过: {resp.json()}")
                return True
        except Exception as e:
            print(f"  ❌ HTTP 健康检查失败: {e}")
    return False

if __name__ == "__main__":
    env = sys.argv[1] if len(sys.argv) > 1 else "dev"
    ns = f"tke-gitops-{env}"
    
    print(f"\n健康检查: {ns}")
    d = check_deployment(ns)
    s = check_service_endpoint(ns)
    h = check_http_health(ns)
    
    if all([d, s, h]):
        print("\n✅ 全部检查通过")
        sys.exit(0)
    else:
        print("\n❌ 部分检查失败")
        sys.exit(1)
