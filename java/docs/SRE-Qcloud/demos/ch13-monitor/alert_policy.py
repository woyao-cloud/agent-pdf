#!/usr/bin/env python3
"""
腾讯云监控告警策略配置脚本
"""
from tencentcloud.common import credential
from tencentcloud.monitor.v20180724 import monitor_client, models
import os

class MonitorManager:
    def __init__(self):
        secret_id = os.environ.get('TENCENTCLOUD_SECRET_ID')
        secret_key = os.environ.get('TENCENTCLOUD_SECRET_KEY')
        self.cred = credential.Credential(secret_id, secret_key)
        self.client = monitor_client.MonitorClient(self.cred, "ap-guangzhou")
    
    def create_cpu_alert(self, instance_id):
        """创建 CPU 告警策略"""
        print(f"创建 CPU 告警策略 (实例: {instance_id})")
        print("  指标: CPU 利用率")
        print("  条件: > 80% 持续 5 分钟")
        print("  通知: 企业微信 + 短信")
        print("  [模拟] 告警策略已创建")
    
    def create_memory_alert(self, instance_id):
        """创建内存告警策略"""
        print(f"创建内存告警策略 (实例: {instance_id})")
        print("  指标: 内存利用率")
        print("  条件: > 85% 持续 5 分钟")
        print("  通知: 企业微信")
        print("  [模拟] 告警策略已创建")
    
    def list_alerts(self):
        """列出告警策略"""
        print("\n当前告警策略:")
        alerts = [
            ("CPU > 80%", "5分钟", "P1"),
            ("内存 > 85%", "5分钟", "P1"),
            ("磁盘 > 90%", "10分钟", "P2"),
            ("CLB 5xx > 1%", "5分钟", "P1"),
        ]
        for name, duration, severity in alerts:
            print(f"  [{severity}] {name} ({duration})")

if __name__ == '__main__':
    mm = MonitorManager()
    mm.create_cpu_alert("ins-xxxxx")
    mm.list_alerts()
