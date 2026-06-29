#!/usr/bin/env python3
"""
Kubernetes Python 客户端示例
演示如何使用 kubernetes-client 管理 EKS 资源
"""
from kubernetes import client, config
from kubernetes.client.rest import ApiException
import time

class K8sManager:
    def __init__(self):
        """初始化 K8s 客户端"""
        try:
            config.load_incluster_config()
            print("[INFO] 使用集群内配置")
        except:
            config.load_kube_config()
            print("[INFO] 使用 kubeconfig 配置")
        
        self.apps_v1 = client.AppsV1Api()
        self.core_v1 = client.CoreV1Api()
    
    def list_deployments(self, namespace='default'):
        """列出命名空间下的所有 Deployment"""
        try:
            deployments = self.apps_v1.list_namespaced_deployment(namespace)
            print(f"\n=== {namespace} 命名空间的 Deployment ===")
            for dep in deployments.items:
                ready = dep.status.ready_replicas or 0
                total = dep.spec.replicas
                print(f"  {dep.metadata.name}: {ready}/{total} 就绪")
            return deployments
        except ApiException as e:
            print(f"API 错误: {e}")
    
    def get_deployment_status(self, name, namespace='default'):
        """获取 Deployment 状态"""
        try:
            dep = self.apps_v1.read_namespaced_deployment(name, namespace)
            status = dep.status
            print(f"\n=== {name} 状态 ===")
            print(f"  期望副本: {dep.spec.replicas}")
            print(f"  当前副本: {status.replicas}")
            print(f"  就绪副本: {status.ready_replicas}")
            print(f"  可用副本: {status.available_replicas}")
            print(f"  更新副本: {status.updated_replicas}")
            return status
        except ApiException as e:
            print(f"API 错误: {e}")
    
    def wait_for_rollout(self, name, namespace='default', timeout=300):
        """等待 Deployment 完成滚动更新"""
        print(f"\n等待 {name} 滚动更新完成...")
        start = time.time()
        while time.time() - start < timeout:
            dep = self.apps_v1.read_namespaced_deployment(name, namespace)
            if (dep.status.updated_replicas == dep.spec.replicas and
                dep.status.ready_replicas == dep.spec.replicas):
                print("  滚动更新完成")
                return True
            time.sleep(5)
        print("  滚动更新超时")
        return False
    
    def list_pods(self, namespace='default', label_selector=''):
        """列出 Pod"""
        try:
            pods = self.core_v1.list_namespaced_pod(
                namespace, label_selector=label_selector
            )
            print(f"\n=== {namespace} 的 Pod ===")
            for pod in pods.items:
                status = pod.status.phase
                print(f"  {pod.metadata.name}: {status}")
            return pods
        except ApiException as e:
            print(f"API 错误: {e}")

if __name__ == '__main__':
    mgr = K8sManager()
    mgr.list_deployments('default')
    mgr.list_pods('default')
