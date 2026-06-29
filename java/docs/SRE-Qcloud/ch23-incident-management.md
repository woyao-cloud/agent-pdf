# 第23章 事件管理

## 23.1 事件分级

### 解决的问题

不同严重程度的事件需要不同的响应速度和资源投入。标准化的事件分级确保资源合理分配。

### 核心原理

腾讯云 SRE 事件分级标准：

| 级别 | 定义 | 响应时间 | 示例 |
|------|------|---------|------|
| P0 | 核心业务完全不可用 | 15分钟 | 支付服务宕机、数据库不可用 |
| P1 | 核心功能严重受损 | 30分钟 | 核心API延迟>5s、大量交易失败 |
| P2 | 非核心功能受损 | 2小时 | 管理后台不可用、报表延迟 |
| P3 | 轻微影响或无影响 | 24小时 | 页面样式问题、非功能性bug |

### 代码/配置实现

**Python 事件管理脚本：**

```python
#!/usr/bin/env python3
"""事件管理与通知脚本"""
import requests
import json
import os
from datetime import datetime

class IncidentManager:
    def __init__(self):
        self.webhook_url = os.environ.get('WECOM_WEBHOOK_URL')
    
    def create_incident(self, severity, title, description):
        """创建事件并发送通知"""
        incident = {
            'id': f"INC-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            'severity': severity,
            'title': title,
            'description': description,
            'created_at': datetime.now().isoformat(),
            'status': 'investigating'
        }
        
        print(f"[{incident['id']}] 创建事件: {title}")
        self.notify(incident)
        return incident
    
    def notify(self, incident):
        """发送企业微信通知"""
        if not self.webhook_url:
            return
        
        color_map = {'P0': 'red', 'P1': 'orange', 'P2': 'yellow', 'P3': 'grey'}
        message = {
            'msgtype': 'markdown',
            'markdown': {
                'content': f"## 🚨 事件通知\n"
                          f"**事件ID**: {incident['id']}\n"
                          f"**级别**: {incident['severity']}\n"
                          f"**标题**: {incident['title']}\n"
                          f"**描述**: {incident['description']}\n"
                          f"**时间**: {incident['created_at']}\n"
            }
        }
        
        requests.post(self.webhook_url, json=message)

if __name__ == '__main__':
    mgr = IncidentManager()
    mgr.create_incident('P1', 'TKE集群节点异常', '生产集群3个节点NotReady')
```

### 使用场景

- 生产故障响应
- On-call 轮值
- 事件升级管理

### 潜在风险与注意事项

- 事件分级不准确导致响应过度或不足
- 通知渠道失效
- 事件疲劳

### 本章小结

- P0-P3 四级事件分级
- 不同级别不同响应时间
- 企业微信/电话/短信多渠道通知
