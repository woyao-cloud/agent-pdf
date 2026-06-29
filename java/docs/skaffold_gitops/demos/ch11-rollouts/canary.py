#!/usr/bin/env python3
"""
金丝雀发布脚本
使用 Python 实现金丝雀部署和自动回滚
"""
import subprocess
import json
import time
import sys
import requests

class CanaryDeploy:
    def __init__(self, app_name, namespace):
        self.app_name = app_name
        self.namespace = namespace
        self.canary_replicas = 1
        self.stable_replicas = 4
    
    def deploy_canary(self, new_version):
        """部署金丝雀版本"""
        print(f"部署金丝雀版本: {new_version}")
        
        # 创建金丝雀 Deployment
        canary_yaml = f"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {self.app_name}-canary
  namespace: {self.namespace}
  labels:
    app: {self.app_name}
    track: canary
spec:
  replicas: {self.canary_replicas}
  selector:
    matchLabels:
      app: {self.app_name}
      track: canary
  template:
    metadata:
      labels:
        app: {self.app_name}
        track: canary
    spec:
      containers:
      - name: {self.app_name}
        image: {new_version}
        ports:
        - containerPort: 8080
"""
        
        with open('/tmp/canary.yaml', 'w') as f:
            f.write(canary_yaml)
        
        subprocess.run(['kubectl', 'apply', '-f', '/tmp/canary.yaml'], check=True)
        print("金丝雀 Deployment 已创建")
    
    def wait_for_canary(self, timeout=120):
        """等待金丝雀就绪"""
        print("等待金丝雀就绪...")
        start = time.time()
        while time.time() - start < timeout:
            result = subprocess.run([
                'kubectl', 'rollout', 'status',
                f'deployment/{self.app_name}-canary',
                '-n', self.namespace, '--timeout=10s'
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                print("金丝雀就绪")
                return True
            time.sleep(5)
        
        print("金丝雀就绪超时")
        return False
    
    def check_canary_health(self):
        """检查金丝雀健康状态"""
        # 获取金丝雀 Pod IP
        result = subprocess.run([
            'kubectl', 'get', 'pods',
            '-n', self.namespace,
            '-l', 'app=demo-app,track=canary',
            '-o', 'jsonpath={.items[0].status.podIP}'
        ], capture_output=True, text=True)
        
        pod_ip = result.stdout
        if not pod_ip:
            return False
        
        # 检查健康端点
        try:
            response = requests.get(
                f"http://{pod_ip}:8080/health",
                timeout=5
            )
            return response.status_code == 200
        except:
            return False
    
    def promote(self):
        """提升金丝雀为稳定版本"""
        print("提升金丝雀为稳定版本...")
        
        # 更新稳定 Deployment 的镜像
        result = subprocess.run([
            'kubectl', 'get', 'deployment', f'{self.app_name}-canary',
            '-n', self.namespace,
            '-o', 'jsonpath={.spec.template.spec.containers[0].image}'
        ], capture_output=True, text=True)
        
        new_image = result.stdout
        subprocess.run([
            'kubectl', 'set', 'image', f'deployment/{self.app_name}',
            '-n', self.namespace,
            f'{self.app_name}={new_image}'
        ], check=True)
        
        # 删除金丝雀
        subprocess.run([
            'kubectl', 'delete', 'deployment', f'{self.app_name}-canary',
            '-n', self.namespace
        ], check=True)
        
        print("金丝雀已提升为稳定版本")
    
    def rollback(self):
        """回滚金丝雀"""
        print("回滚金丝雀...")
        subprocess.run([
            'kubectl', 'delete', 'deployment', f'{self.app_name}-canary',
            '-n', self.namespace
        ], check=True)
        print("金丝雀已删除，回滚完成")

if __name__ == '__main__':
    canary = CanaryDeploy('demo-app', 'demo-app-prod')
    
    if len(sys.argv) < 2:
        print("用法: python canary.py <new-image-tag>")
        sys.exit(1)
    
    new_version = sys.argv[1]
    
    # 1. 部署金丝雀
    canary.deploy_canary(new_version)
    
    # 2. 等待就绪
    if not canary.wait_for_canary():
        canary.rollback()
        sys.exit(1)
    
    # 3. 健康检查
    if not canary.check_canary_health():
        print("金丝雀健康检查失败")
        canary.rollback()
        sys.exit(1)
    
    # 4. 等待观察（模拟）
    print("观察金丝雀 10 秒...")
    time.sleep(10)
    
    # 5. 提升
    canary.promote()
    print("金丝雀发布完成")
