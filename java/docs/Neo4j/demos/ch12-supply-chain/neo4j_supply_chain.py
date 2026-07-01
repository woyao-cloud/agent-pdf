#!/usr/bin/env python3
"""
Neo4j 供应链分析演示
"""
from collections import defaultdict, deque

class SupplyChain:
    def __init__(self):
        self.nodes = {}
        self.edges = []
    
    def add_node(self, nid, ntype, name, **props):
        self.nodes[nid] = {'id': nid, 'type': ntype, 'name': name, **props}
    
    def add_edge(self, from_id, to_id, label, **props):
        self.edges.append({'from': from_id, 'to': to_id, 'label': label, **props})
    
    def get_upstream(self, nid, max_depth=3):
        """获取上游供应商"""
        upstream = defaultdict(list)
        visited = {nid}
        queue = deque([(nid, 0)])
        while queue:
            current, depth = queue.popleft()
            if depth >= max_depth: continue
            for e in self.edges:
                if e['to'] == current and e['from'] not in visited:
                    visited.add(e['from'])
                    upstream[depth+1].append(self.nodes.get(e['from']))
                    queue.append((e['from'], depth+1))
        return upstream

def demo_supply_chain():
    print("=" * 60)
    print("Neo4j 供应链分析演示")
    print("=" * 60)
    
    sc = SupplyChain()
    
    # 1. 构建供应链
    print("\n--- 1. 构建供应链 ---")
    for nid, ntype, name, loc in [
        ('raw:1','RawMaterial','芯片供应商A','台湾'),('raw:2','RawMaterial','芯片供应商B','韩国'),
        ('mfg:1','Manufacturer','富士康','深圳'),('mfg:2','Manufacturer','比亚迪','深圳'),
        ('brand:1','Brand','苹果','美国'),('brand:2','Brand','华为','中国'),
    ]:
        sc.add_node(nid, ntype, name, location=loc)
        print(f"  [{ntype}] {name} ({loc})")
    
    for f, t in [('raw:1','mfg:1'),('raw:2','mfg:1'),('mfg:1','brand:1'),('mfg:2','brand:2')]:
        sc.add_edge(f, t, 'supplies')
    
    # 2. 上游分析
    print("\n--- 2. 上游供应商分析 (苹果) ---")
    upstream = sc.get_upstream('brand:1')
    for depth, nodes in sorted(upstream.items()):
        for n in nodes:
            if n: print(f"  第{depth}级: {n['name']} ({n['type']})")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_supply_chain()
