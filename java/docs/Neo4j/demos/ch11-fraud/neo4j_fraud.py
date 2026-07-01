#!/usr/bin/env python3
"""
Neo4j 金融风控与欺诈检测演示
"""
from collections import defaultdict, deque

class FraudGraph:
    def __init__(self):
        self.accounts = {}
        self.transactions = []
    
    def add_account(self, aid, name, risk=0):
        self.accounts[aid] = {'id': aid, 'name': name, 'risk': risk}
    
    def add_transaction(self, from_id, to_id, amount):
        self.transactions.append({'from': from_id, 'to': to_id, 'amount': amount})
    
    def detect_cycles(self):
        """检测环形交易"""
        adj = defaultdict(list)
        for t in self.transactions:
            adj[t['from']].append(t['to'])
        
        cycles = []
        def dfs(node, start, path, visited):
            for neighbor in adj[node]:
                if neighbor == start and len(path) >= 2:
                    cycles.append(path + [neighbor])
                elif neighbor not in visited and neighbor > start:
                    visited.add(neighbor)
                    dfs(neighbor, start, path + [neighbor], visited)
                    visited.remove(neighbor)
        
        for node in list(adj.keys()):
            dfs(node, node, [node], {node})
        return cycles

def demo_fraud():
    print("=" * 60)
    print("Neo4j 金融风控演示")
    print("=" * 60)
    
    g = FraudGraph()
    
    # 1. 创建账户
    print("\n--- 1. 创建账户 ---")
    for aid, name, risk in [('a1','Alice',10),('a2','Bob',5),('a3','Carol',15),('a4','可疑A',80),('a5','可疑B',75),('a6','可疑C',85)]:
        g.add_account(aid, name, risk)
        print(f"  {name} (风险: {risk})")
    
    # 2. 创建交易
    print("\n--- 2. 创建交易 ---")
    for f, t, amt in [('a1','a2',1000),('a2','a3',500),('a4','a5',50000),('a5','a6',50000),('a6','a4',50000)]:
        g.add_transaction(f, t, amt)
        print(f"  {g.accounts[f]['name']} -> {g.accounts[t]['name']}: ¥{amt}")
    
    # 3. 环形检测
    print("\n--- 3. 环形交易检测 ---")
    cycles = g.detect_cycles()
    if cycles:
        for cycle in cycles:
            names = ' -> '.join([g.accounts[a]['name'] for a in cycle])
            print(f"  ⚠️ 发现交易环: {names}")
    else:
        print("  未发现交易环")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_fraud()
