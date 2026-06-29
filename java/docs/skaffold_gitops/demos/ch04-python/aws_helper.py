#!/usr/bin/env python3
"""
AWS 辅助工具示例
演示如何使用 boto3 管理 EKS 和 ECR
"""
import boto3
import json
import subprocess
import base64

class AWSHelper:
    def __init__(self, region='us-east-1'):
        self.region = region
        self.ecr_client = boto3.client('ecr', region_name=region)
        self.eks_client = boto3.client('eks', region_name=region)
    
    def list_ecr_images(self, repository_name):
        """列出 ECR 仓库中的镜像"""
        try:
            response = self.ecr_client.list_images(
                repositoryName=repository_name,
                maxResults=10
            )
            print(f"\n=== ECR 仓库: {repository_name} ===")
            for image in response['imageIds']:
                tag = image.get('imageTag', '<untagged>')
                digest = image['imageDigest'][:20]
                print(f"  {tag} ({digest}...)")
            return response['imageIds']
        except Exception as e:
            print(f"ECR 错误: {e}")
    
    def get_ecr_login_password(self):
        """获取 ECR 登录密码"""
        try:
            response = self.ecr_client.get_authorization_token()
            token = response['authorizationData'][0]['authorizationToken']
            password = base64.b64decode(token).decode().split(':')[1]
            return password
        except Exception as e:
            print(f"获取 ECR token 失败: {e}")
    
    def list_eks_clusters(self):
        """列出 EKS 集群"""
        try:
            response = self.eks_client.list_clusters()
            print(f"\n=== EKS 集群 ===")
            for cluster in response['clusters']:
                desc = self.eks_client.describe_cluster(name=cluster)
                status = desc['cluster']['status']
                version = desc['cluster']['version']
                print(f"  {cluster}: {status} (v{version})")
            return response['clusters']
        except Exception as e:
            print(f"EKS 错误: {e}")
    
    def update_kubeconfig(self, cluster_name):
        """更新 kubeconfig"""
        try:
            subprocess.run([
                'aws', 'eks', 'update-kubeconfig',
                '--name', cluster_name,
                '--region', self.region
            ], check=True)
            print(f"kubeconfig 已更新: {cluster_name}")
        except subprocess.CalledProcessError as e:
            print(f"更新 kubeconfig 失败: {e}")

if __name__ == '__main__':
    aws = AWSHelper()
    aws.list_eks_clusters()
    aws.list_ecr_images('my-app')
