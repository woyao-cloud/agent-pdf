#!/usr/bin/env python3
"""
AWS Secrets Manager 集成示例
演示如何使用 Python 管理密钥
"""
import boto3
import json
import base64
from botocore.exceptions import ClientError

class SecretsManager:
    def __init__(self, region='us-east-1'):
        self.client = boto3.client('secretsmanager', region_name=region)
    
    def get_secret(self, secret_name):
        """获取密钥"""
        try:
            response = self.client.get_secret_value(SecretId=secret_name)
            if 'SecretString' in response:
                return json.loads(response['SecretString'])
            else:
                return json.loads(base64.b64decode(response['SecretBinary']))
        except ClientError as e:
            print(f"获取密钥失败: {e}")
            return None
    
    def create_secret(self, name, secret_dict):
        """创建密钥"""
        try:
            self.client.create_secret(
                Name=name,
                SecretString=json.dumps(secret_dict),
                Tags=[{'Key': 'ManagedBy', 'Value': 'GitOps'}]
            )
            print(f"密钥已创建: {name}")
        except ClientError as e:
            print(f"创建密钥失败: {e}")
    
    def update_secret(self, name, secret_dict):
        """更新密钥"""
        try:
            self.client.put_secret_value(
                SecretId=name,
                SecretString=json.dumps(secret_dict)
            )
            print(f"密钥已更新: {name}")
        except ClientError as e:
            print(f"更新密钥失败: {e}")
    
    def rotate_secret(self, name):
        """轮转密钥（生成新密码）"""
        import secrets
        import string
        
        new_password = ''.join(secrets.choice(
            string.ascii_letters + string.digits + '!@#$%'
        ) for _ in range(32))
        
        secret = self.get_secret(name) or {}
        secret['password'] = new_password
        secret['rotated_at'] = __import__('datetime').datetime.now().isoformat()
        
        self.update_secret(name, secret)
        print(f"密钥已轮转: {name}")
        return new_password
    
    def list_secrets(self):
        """列出所有密钥"""
        try:
            response = self.client.list_secrets(MaxResults=20)
            print("\n=== Secrets Manager 密钥列表 ===")
            for secret in response['SecretList']:
                print(f"  {secret['Name']} (最后变更: {secret['LastChangedDate']})")
        except ClientError as e:
            print(f"列出密钥失败: {e}")

if __name__ == '__main__':
    sm = SecretsManager()
    sm.list_secrets()
