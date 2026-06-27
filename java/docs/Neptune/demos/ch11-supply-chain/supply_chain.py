#!/usr/bin/env python3
"""
供应链分析与网络拓扑演示
使用内存图模拟 Neptune 供应链查询
"""
from collections import defaultdict, deque
import json

class SupplyChain:
    """供应链网络"""
    def __init__(self):
        self.nodes = {}
        self.edges = []
    
    def add_node(self, nid, ntype, name, **props):
        self.nodes[nid] = {'id': nid, 'type': ntype, 'name': name, 'properties': props}
    
    def add_edge(self, from_id, to_id, label, **props):
        self.edges.append({'from': from_id, 'to': to_id, 'label': label, 'properties': props})
    
    def get_upstream(self, nid, max_depth=5):
        """获取上游供应商（递归）"""
        upstream = defaultdict(list)
        visited = {nid}
        queue = deque([(nid, 0)])
        
        while queue:
            current, depth = queue.popleft()
            if depth >= max_depth:
                continue
            for e in self.edges:
                if e['to'] == current and e['from'] not in visited:
                    visited.add(e['from'])
                    upstream[depth + 1].append({
                        'node': self.nodes.get(e['from']),
                        'edge': e
                    })
                    queue.append((e['from'], depth + 1))
        
        return upstream
    
    def get_downstream(self, nid, max_depth=5):
        """获取下游客户（递归）"""
        downstream = defaultdict(list)
        visited = {nid}
        queue = deque([(nid, 0)])
        
        while queue:
            current, depth = queue.popleft()
            if depth >= max_depth:
                continue
            for e in self.edges:
                if e['from'] == current and e['to'] not in visited:
                    visited.add(e['to'])
                    downstream[depth + 1].append({
                        'node': self.nodes.get(e['to']),
                        'edge': e
                    })
                    queue.append((e['to'], depth + 1))
        
        return downstream
    
    def find_alternative_paths(self, start_id, end_id, max_paths=3):
        """查找替代路径（Yen's algorithm 简化版）"""
        paths = []
        
        def bfs_shortest(avoid_edges=None):
            avoid_edges = avoid_edges or set()
            queue = deque([(start_id, [start_id])])
            visited = {start_id}
            
            while queue:
                node, path = queue.popleft()
                for e in self.edges:
                    if e['from'] == node:
                        edge_key = (e['from'], e['to'])
                        if edge_key in avoid_edges:
                            continue
                        if e['to'] not in visited:
                            new_path = path + [e['to']]
                            if e['to'] == end_id:
                                return new_path
                            visited.add(e['to'])
                            queue.append((e['to'], new_path))
            return None
        
        # 找第一条路径
        first_path = bfs_shortest()
        if not first_path:
            return []
        paths.append(first_path)
        
        # 找替代路径（移除已用边）
        for i in range(1, max_paths):
            avoid = set()
            for j in range(len(paths[i-1]) - 1):
                avoid.add((paths[i-1][j], paths[i-1][j+1]))
            
            alt_path = bfs_shortest(avoid)
            if alt_path:
                paths.append(alt_path)
            else:
                break
        
        return paths
    
    def calculate_betweenness(self):
        """计算介数中心性（简化版）"""
        betweenness = defaultdict(float)
        
        nodes = list(self.nodes.keys())
        for s in nodes:
            for t in nodes:
                if s >= t:
                    continue
                path = self.find_alternative_paths(s, t, max_paths=1)
                if path:
                    for node in path[0][1:-1]:
                        betweenness[node] += 1
        
        return betweenness

def demo_supply_chain():
    """供应链分析演示"""
    print("=" * 60)
    print("供应链分析演示")
    print("=" * 60)
    
    sc = SupplyChain()
    
    # 1. 构建供应链网络
    print("\n--- 1. 构建供应链网络 ---")
    
    # 原材料供应商
    sc.add_node('raw:1', 'RawMaterial', '芯片供应商A', location='台湾', capacity='high')
    sc.add_node('raw:2', 'RawMaterial', '芯片供应商B', location='韩国', capacity='medium')
    sc.add_node('raw:3', 'RawMaterial', '屏幕供应商', location='韩国', capacity='high')
    sc.add_node('raw:4', 'RawMaterial', '电池供应商', location='中国', capacity='high')
    
    # 制造商
    sc.add_node('mfg:1', 'Manufacturer', '富士康', location='深圳', capacity='high')
    sc.add_node('mfg:2', 'Manufacturer', '比亚迪', location='深圳', capacity='medium')
    
    # 品牌商
    sc.add_node('brand:1', 'Brand', '苹果', location='美国', market='global')
    sc.add_node('brand:2', 'Brand', '华为', location='中国', market='global')
    sc.add_node('brand:3', 'Brand', '小米', location='中国', market='global')
    
    # 物流商
    sc.add_node('log:1', 'Logistics', '顺丰', location='中国', coverage='domestic')
    sc.add_node('log:2', 'Logistics', 'DHL', location='德国', coverage='global')
    
    # 零售商
    sc.add_node('ret:1', 'Retailer', '京东', location='中国', channel='online')
    sc.add_node('ret:2', 'Retailer', '天猫', location='中国', channel='online')
    
    # 供应链关系
    edges = [
        ('raw:1', 'mfg:1', 'supplies', {'material': '芯片', 'lead_time': 30}),
        ('raw:2', 'mfg:1', 'supplies', {'material': '芯片', 'lead_time': 45}),
        ('raw:3', 'mfg:1', 'supplies', {'material': '屏幕', 'lead_time': 20}),
        ('raw:4', 'mfg:1', 'supplies', {'material': '电池', 'lead_time': 15}),
        ('raw:1', 'mfg:2', 'supplies', {'material': '芯片', 'lead_time': 30}),
        ('raw:3', 'mfg:2', 'supplies', {'material': '屏幕', 'lead_time': 20}),
        ('mfg:1', 'brand:1', 'manufactures', {'product': 'iPhone', 'cost': 500}),
        ('mfg:1', 'brand:2', 'manufactures', {'product': 'Mate', 'cost': 400}),
        ('mfg:2', 'brand:3', 'manufactures', {'product': 'Mi', 'cost': 300}),
        ('brand:1', 'log:2', 'uses', {'mode': 'air'}),
        ('brand:2', 'log:1', 'uses', {'mode': 'land'}),
        ('brand:3', 'log:1', 'uses', {'mode': 'land'}),
        ('log:2', 'ret:1', 'delivers', {'region': 'global'}),
        ('log:1', 'ret:1', 'delivers', {'region': 'domestic'}),
        ('log:1', 'ret:2', 'delivers', {'region': 'domestic'}),
    ]
    
    for f, t, l, props in edges:
        sc.add_edge(f, t, l, **props)
    
    for n in sc.nodes.values():
        print(f"  [{n['type']}] {n['name']} ({n['properties'].get('location','')})")
    
    # 2. 上游分析
    print("\n--- 2. 上游供应商分析 (苹果) ---")
    upstream = sc.get_upstream('brand:1')
    for depth, nodes in sorted(upstream.items()):
        print(f"  第{depth}级供应商:")
        for n in nodes:
            node = n['node']
            if node:
                print(f"    {node['name']} ({node['type']})")
    
    # 3. 下游分析
    print("\n--- 3. 下游客户分析 (芯片供应商A) ---")
    downstream = sc.get_downstream('raw:1')
    for depth, nodes in sorted(downstream.items()):
        print(f"  第{depth}级客户:")
        for n in nodes:
            node = n['node']
            if node:
                print(f"    {node['name']} ({node['type']})")
    
    # 4. 替代路径
    print("\n--- 4. 替代路径分析 ---")
    paths = sc.find_alternative_paths('raw:1', 'ret:1')
    print(f"  芯片供应商A -> 京东 的路径:")
    for i, path in enumerate(paths, 1):
        names = [sc.nodes[n]['name'] for n in path]
        print(f"    路径{i}: {' -> '.join(names)}")
    
    # 5. 瓶颈分析
    print("\n--- 5. 瓶颈分析 (介数中心性) ---")
    betweenness = sc.calculate_betweenness()
    ranked = sorted(betweenness.items(), key=lambda x: -x[1])
    print("  关键节点排名:")
    for nid, score in ranked[:5]:
        node = sc.nodes[nid]
        print(f"    {node['name']} ({node['type']}): 介数 {score}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_supply_chain()
