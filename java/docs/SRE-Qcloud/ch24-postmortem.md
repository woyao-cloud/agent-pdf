# 第24章 事后复盘 (Postmortem)

## 24.1 无指责复盘文化

### 解决的问题

故障发生后，团队需要从失败中学习而不是互相指责。无指责复盘文化鼓励坦诚交流，找到系统性的根因和改进措施。

### 核心原理

**无指责复盘的核心原则：**
1. 故障是系统问题，不是人的问题
2. 假设所有人都是善意的
3. 关注"为什么"而不是"谁"
4. 每个故障都是改进的机会

### 代码/配置实现

**Postmortem 模板：**

```markdown
# 事后复盘报告

## 基本信息
- **事件ID**: INC-20240101-001
- **日期**: 2024-01-01
- **持续时间**: 45分钟
- **影响范围**: 订单服务不可用，影响用户约1000人
- **严重级别**: P1

## 时间线
| 时间 | 事件 |
|------|------|
| 14:00 | 告警：订单服务延迟 > 5s |
| 14:05 | On-call 工程师确认事件 |
| 14:10 | 发现 TDSQL 连接数耗尽 |
| 14:15 | 紧急扩容连接池 |
| 14:30 | 服务恢复 |
| 14:45 | 确认所有指标恢复正常 |

## 根因分析 (5 Whys)
1. 为什么订单服务延迟高？→ 数据库查询慢
2. 为什么数据库查询慢？→ 连接池耗尽，请求排队
3. 为什么连接池耗尽？→ 慢查询占用连接不释放
4. 为什么有慢查询？→ 新上线的查询未加索引
5. 为什么未加索引？→ 代码审查未覆盖性能检查

## 改进措施
| 措施 | 负责人 | 截止日期 | 状态 |
|------|--------|---------|------|
| 添加数据库索引 | 张三 | 2024-01-05 | ✅ |
| 增加连接池监控告警 | 李四 | 2024-01-03 | ✅ |
| 代码审查增加SQL审查项 | 王五 | 2024-01-10 | ⏳ |
| 建立慢查询自动告警 | 李四 | 2024-01-07 | ⏳ |
```

**Python Action Items 追踪脚本：**

```python
#!/usr/bin/env python3
"""Action Items 追踪脚本"""
import json
from datetime import datetime, timedelta

class ActionTracker:
    def __init__(self):
        self.items = []
    
    def add_item(self, action, owner, due_date):
        self.items.append({
            'id': len(self.items) + 1,
            'action': action,
            'owner': owner,
            'due_date': due_date,
            'status': 'open',
            'created_at': datetime.now().isoformat()
        })
        print(f"添加 Action Item: {action}")
    
    def complete(self, item_id):
        for item in self.items:
            if item['id'] == item_id:
                item['status'] = 'completed'
                item['completed_at'] = datetime.now().isoformat()
                print(f"完成: {item['action']}")
    
    def check_overdue(self):
        today = datetime.now()
        overdue = [i for i in self.items 
                  if i['status'] == 'open' 
                  and datetime.fromisoformat(i['due_date']) < today]
        if overdue:
            print(f"有 {len(overdue)} 个逾期 Action Item:")
            for item in overdue:
                print(f"  [{item['id']}] {item['action']} - {item['owner']}")

if __name__ == '__main__':
    tracker = ActionTracker()
    tracker.add_item('添加数据库索引', '张三', '2024-01-05')
    tracker.add_item('增加连接池监控', '李四', '2024-01-03')
    tracker.check_overdue()
```

### 使用场景

- 故障复盘会议
- 改进措施追踪
- 团队学习与成长

### 潜在风险与注意事项

- 复盘变成追责会
- Action Items 无人跟进
- 改进措施流于形式

### 本章小结

- 无指责复盘关注系统问题
- 5 Whys 分析法找到根因
- Action Items 需要闭环追踪
