#!/usr/bin/env python3
"""
金融风控与欺诈检测演示
使用内存图模拟 Neptune 欺诈检测查询
"""
from collections import defaultdict, deque
import random

class TransactionGraph:
    """交易网络图"""
    def __init__(self):
        self.accounts = {}
        self.transactions = []
    
    def add_account(self, aid, name, account_type, risk_score=0):
        self.accounts[aid] = {
            'id': aid, 'name': name, 'type': account_type,
            'risk_score': risk_score
        }
    
    def add_transaction(self, from_id, to_id, amount, timestamp, tx_type='transfer'):
        self.transactions.append({
            'from': from_id, 'to': to_id, 'amount': amount,
            'timestamp': timestamp, 'type': tx_type
        })
    
    def detect_cycles(self, max_length=5):
        """检测环形交易（洗钱模式）"""
        adj = defaultdict(list)
        for tx in self.transactions:
            adj[tx['from']].append(tx['to'])
        
        cycles = []
        
        def dfs(node, start, path, visited):
            if len(path) > max_length:
                return
            for neighbor in adj[node]:
                if neighbor == start and len(path) >= 2:
                    cycles.append(path + [neighbor])
                elif neighbor not in visited and neighbor > start:
                    visited.add(neighbor)
                    dfs(neighbor, start, path + [neighbor], visited)
                    visited.remove(neighbor)
        
        for node in list(adj.keys()):
            visited = {node}
            dfs(node, node, [node], visited)
        
        return cycles
    
    def detect_fan_in_out(self, threshold=3):
        """检测扇入/扇出异常模式"""
        fan_in = defaultdict(int)
        fan_out = defaultdict(int)
        
        for tx in self.transactions:
            fan_in[tx['to']] += 1
            fan_out[tx['from']] += 1
        
        anomalies = []
        for aid, count in fan_in.items():
            if count >= threshold:
                anomalies.append({
                    'account': self.accounts.get(aid, {}).get('name', aid),
                    'type': 'fan_in',
                    'count': count,
                    'description': f'短时间内收到 {count} 笔交易（资金归集）'
                })
        
        for aid, count in fan_out.items():
            if count >= threshold:
                anomalies.append({
                    'account': self.accounts.get(aid, {}).get('name', aid),
                    'type': 'fan_out',
                    'count': count,
                    'description': f'短时间内发出 {count} 笔交易（资金分散）'
                })
        
        return anomalies
    
    def propagate_risk(self, seed_account, decay=0.5, max_depth=3):
        """风险传播分析"""
        risk_scores = {}
        queue = deque([(seed_account, 1.0, 0)])
        
        while queue:
            aid, score, depth = queue.popleft()
            if depth > max_depth:
                continue
            
            if aid not in risk_scores or score > risk_scores[aid]:
                risk_scores[aid] = score
            
            for tx in self.transactions:
                if tx['from'] == aid:
                    new_score = score * decay
                    queue.append((tx['to'], new_score, depth + 1))
                if tx['to'] == aid:
                    new_score = score * decay
                    queue.append((tx['from'], new_score, depth + 1))
        
        return risk_scores

def demo_fraud_detection():
    """欺诈检测演示"""
    print("=" * 60)
    print("金融风控与欺诈检测演示")
    print("=" * 60)
    
    g = TransactionGraph()
    
    # 1. 创建账户
    print("\n--- 1. 创建账户 ---")
    accounts = [
        ('a1', 'Alice', 'personal', 10),
        ('a2', 'Bob', 'personal', 5),
        ('a3', 'Carol', 'personal', 15),
        ('a4', 'Dave', 'personal', 20),
        ('a5', 'Eve', 'personal', 8),
        ('a6', '可疑账户A', 'suspicious', 80),
        ('a7', '可疑账户B', 'suspicious', 75),
        ('a8', '可疑账户C', 'suspicious', 85),
        ('a9', '洗钱中间账户', 'mule', 90),
        ('a10', '离岸账户', 'offshore', 95),
    ]
    for data in accounts:
        g.add_account(*data)
        print(f"  {data[1]} ({data[2]}, 风险分: {data[3]})")
    
    # 2. 创建正常交易
    print("\n--- 2. 创建交易 ---")
    # 正常交易
    g.add_transaction('a1', 'a2', 1000, '2024-01-01 10:00')
    g.add_transaction('a2', 'a3', 500, '2024-01-01 11:00')
    g.add_transaction('a3', 'a1', 200, '2024-01-01 12:00')
    g.add_transaction('a4', 'a5', 300, '2024-01-01 13:00')
    
    # 可疑环形交易
    g.add_transaction('a6', 'a7', 50000, '2024-01-01 14:00')
    g.add_transaction('a7', 'a8', 50000, '2024-01-01 14:05')
    g.add_transaction('a8', 'a6', 50000, '2024-01-01 14:10')
    
    # 扇入异常（资金归集）
    g.add_transaction('a1', 'a9', 10000, '2024-01-01 15:00')
    g.add_transaction('a2', 'a9', 20000, '2024-01-01 15:01')
    g.add_transaction('a3', 'a9', 15000, '2024-01-01 15:02')
    g.add_transaction('a4', 'a9', 30000, '2024-01-01 15:03')
    g.add_transaction('a5', 'a9', 25000, '2024-01-01 15:04')
    
    # 扇出异常（资金分散）
    g.add_transaction('a9', 'a10', 40000, '2024-01-01 16:00')
    g.add_transaction('a9', 'a6', 30000, '2024-01-01 16:01')
    g.add_transaction('a9', 'a7', 20000, '2024-01-01 16:02')
    
    print("  已创建 14 笔交易")
    
    # 3. 环形交易检测
    print("\n--- 3. 环形交易检测 ---")
    cycles = g.detect_cycles()
    if cycles:
        print(f"  发现 {len(cycles)} 个交易环:")
        for cycle in cycles:
            names = [g.accounts.get(a, {}).get('name', a) for a in cycle]
            print(f"    {' -> '.join(names)}")
    else:
        print("  未发现交易环")
    
    # 4. 扇入/扇出检测
    print("\n--- 4. 异常模式检测 ---")
    anomalies = g.detect_fan_in_out(threshold=3)
    for a in anomalies:
        print(f"  [{a['type']}] {a['account']}: {a['description']}")
    
    # 5. 风险传播
    print("\n--- 5. 风险传播分析 ---")
    risk_scores = g.propagate_risk('a6', decay=0.5, max_depth=3)
    print("  从可疑账户A出发的风险传播:")
    for aid, score in sorted(risk_scores.items(), key=lambda x: -x[1]):
        account = g.accounts.get(aid, {})
        name = account.get('name', aid)
        print(f"    {name}: 风险值 {score:.2f}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_fraud_detection()
