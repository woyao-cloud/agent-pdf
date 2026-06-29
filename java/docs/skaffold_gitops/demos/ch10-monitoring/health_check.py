#!/usr/bin/env python3
"""
健康检查脚本
检查 EKS 集群和应用健康状态
"""
import subprocess
import json
import sys
import time
import requests

class HealthChecker:
    def __init__(self):
        self.results = {}
    
    def check_deployment(self, name, namespace):
        """检查 Deployment 状态"""
        result = subprocess.run([
            'kubectl', 'get', 'deployment', name,
            '-n', namespace, '-o', 'json'
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            self.results[f'deployment/{name}'] = 'ERROR'
            return False
        
        dep = json.loads(result.stdout)
        status = dep['status']
        
        ready = status.get('readyReplicas', 0)
        total = dep['spec']['replicas']
        
        if ready == total:
            self.results[f'deployment/{name}'] = 'HEALTHY'
            return True
        else:
            self.results[f'deployment/{name}'] = f'DEGRADED ({ready}/{total})'
            return False
    
    def check_service(self, name, namespace):
        """检查 Service 状态"""
        result = subprocess.run([
            'kubectl', 'get', 'service', name,
            '-n', namespace, '-o', 'json'
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            self.results[f'service/{name}'] = 'ERROR'
            return False
        
        svc = json.loads(result.stdout)
        self.results[f'service/{name}'] = 'HEALTHY'
        return True
    
    def check_http_endpoint(self, url, timeout=10):
        """检查 HTTP 端点"""
        try:
            response = requests.get(url, timeout=timeout)
            if response.status_code == 200:
                self.results[f'http/{url}'] = 'HEALTHY'
                return True
            else:
                self.results[f'http/{url}'] = f'ERROR ({response.status_code})'
                return False
        except requests.RequestException as e:
            self.results[f'http/{url}'] = f'UNREACHABLE ({e})'
            return False
    
    def check_all(self, app_name, namespace):
        """执行全部检查"""
        print(f"\n=== 健康检查: {namespace} ===")
        
        self.check_deployment(app_name, namespace)
        self.check_service(app_name, namespace)
        
        # 尝试 HTTP 健康检查
        result = subprocess.run([
            'kubectl', 'get', 'service', app_name,
            '-n', namespace, '-o', 'jsonpath={.spec.clusterIP}'
        ], capture_output=True, text=True)
        
        if result.stdout:
            self.check_http_endpoint(f"http://{result.stdout}:8080/health")
        
        # 输出结果
        print("\n检查结果:")
        all_healthy = True
        for check, status in self.results.items():
            icon = "✅" if "HEALTHY" in status else "❌"
            print(f"  {icon} {check}: {status}")
            if "HEALTHY" not in status:
                all_healthy = False
        
        return all_healthy

if __name__ == '__main__':
    checker = HealthChecker()
    app = sys.argv[1] if len(sys.argv) > 1 else 'demo-app'
    ns = sys.argv[2] if len(sys.argv) > 2 else 'demo-app-dev'
    
    healthy = checker.check_all(app, ns)
    sys.exit(0 if healthy else 1)
