#!/usr/bin/env python3
"""
Neo4j 知识图谱构建演示
"""
from collections import defaultdict, deque

class KnowledgeGraph:
    def __init__(self):
        self.entities = {}
        self.relations = []
    
    def add_entity(self, eid, etype, name, **props):
        self.entities[eid] = {'id': eid, 'type': etype, 'name': name, **props}
    
    def add_relation(self, subj, pred, obj):
        self.relations.append({'subject': subj, 'predicate': pred, 'object': obj})
    
    def find_path(self, start, end, max_depth=5):
        """BFS 查找最短路径"""
        if start == end:
            return [start]
        queue = deque([(start, [start])])
        visited = {start}
        while queue:
            node, path = queue.popleft()
            if len(path) > max_depth:
                continue
            for r in self.relations:
                for nid in ([r['object']] if r['subject'] == node else [r['subject']] if r['object'] == node else []):
                    if nid == end:
                        return path + [nid]
                    if nid not in visited:
                        visited.add(nid)
                        queue.append((nid, path + [nid]))
        return None

def demo_kg():
    print("=" * 60)
    print("Neo4j 知识图谱构建演示")
    print("=" * 60)
    
    kg = KnowledgeGraph()
    
    # 1. 构建企业知识图谱
    print("\n--- 1. 构建企业知识图谱 ---")
    entities = [
        ('comp:1', 'Company', '腾讯科技', hq='深圳', founded=1998),
        ('comp:2', 'Company', '阿里巴巴', hq='杭州', founded=1999),
        ('person:1', 'Person', '马化腾', title='CEO'),
        ('person:2', 'Person', '马云', title='创始人'),
        ('prod:1', 'Product', '微信', category='社交'),
        ('prod:2', 'Product', '支付宝', category='金融'),
    ]
    for eid, etype, name, **props in entities:
        kg.add_entity(eid, etype, name, **props)
        print(f"  [{etype}] {name}")
    
    relations = [
        ('person:1', 'founder_of', 'comp:1'),
        ('person:2', 'founder_of', 'comp:2'),
        ('comp:1', 'owns', 'prod:1'),
        ('comp:2', 'owns', 'prod:2'),
    ]
    for s, p, o in relations:
        kg.add_relation(s, p, o)
    
    # 2. 查询
    print("\n--- 2. 查询路径 ---")
    path = kg.find_path('person:1', 'prod:2')
    if path:
        names = ' -> '.join([kg.entities[n]['name'] for n in path])
        print(f"  马化腾 -> 支付宝: {names}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_kg()
