#!/usr/bin/env python3
"""
知识图谱构建与查询演示
使用内存图模拟 Neptune 知识图谱
"""
import json
from collections import defaultdict

class KnowledgeGraph:
    """知识图谱"""
    def __init__(self):
        self.entities = {}
        self.relations = []
    
    def add_entity(self, eid, etype, name, **props):
        self.entities[eid] = {
            'id': eid, 'type': etype, 'name': name, 'properties': props
        }
    
    def add_relation(self, subj, pred, obj, **props):
        self.relations.append({
            'subject': subj, 'predicate': pred, 'object': obj,
            'properties': props
        })
    
    def query_by_type(self, etype):
        return [e for e in self.entities.values() if e['type'] == etype]
    
    def query_relations(self, subj=None, pred=None, obj=None):
        results = []
        for r in self.relations:
            if subj and r['subject'] != subj: continue
            if pred and r['predicate'] != pred: continue
            if obj and r['object'] != obj: continue
            results.append(r)
        return results
    
    def get_neighbors(self, eid, max_depth=2):
        """获取指定深度的邻居"""
        visited = {eid}
        current = {eid}
        neighbors_by_depth = defaultdict(list)
        
        for depth in range(1, max_depth + 1):
            next_level = set()
            for node in current:
                for r in self.relations:
                    if r['subject'] == node and r['object'] not in visited:
                        next_level.add(r['object'])
                        neighbors_by_depth[depth].append({
                            'entity': self.entities.get(r['object']),
                            'relation': r['predicate'],
                            'depth': depth
                        })
                    if r['object'] == node and r['subject'] not in visited:
                        next_level.add(r['subject'])
                        neighbors_by_depth[depth].append({
                            'entity': self.entities.get(r['subject']),
                            'relation': r['predicate'],
                            'depth': depth
                        })
            visited.update(next_level)
            current = next_level
        
        return neighbors_by_depth
    
    def find_path(self, start_id, end_id, max_depth=5):
        """BFS 查找最短路径"""
        if start_id == end_id:
            return [start_id]
        
        queue = [[start_id]]
        visited = {start_id}
        
        while queue:
            path = queue.pop(0)
            node = path[-1]
            
            for r in self.relations:
                neighbors = []
                if r['subject'] == node:
                    neighbors.append(r['object'])
                if r['object'] == node:
                    neighbors.append(r['subject'])
                
                for neighbor in neighbors:
                    if neighbor == end_id:
                        return path + [neighbor]
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(path + [neighbor])
        
        return None

def demo_knowledge_graph():
    """知识图谱演示"""
    print("=" * 60)
    print("知识图谱构建与查询演示")
    print("=" * 60)
    
    kg = KnowledgeGraph()
    
    # 1. 构建企业知识图谱
    print("\n--- 1. 构建企业知识图谱 ---")
    
    # 公司
    kg.add_entity('comp:1', 'Company', '腾讯科技', founded=1998, hq='深圳', industry='互联网')
    kg.add_entity('comp:2', 'Company', '阿里巴巴', founded=1999, hq='杭州', industry='互联网')
    kg.add_entity('comp:3', 'Company', '字节跳动', founded=2012, hq='北京', industry='互联网')
    
    # 人物
    kg.add_entity('person:1', 'Person', '马化腾', title='CEO', birth=1971)
    kg.add_entity('person:2', 'Person', '张小龙', title='高级副总裁', birth=1969)
    kg.add_entity('person:3', 'Person', '马云', title='创始人', birth=1964)
    kg.add_entity('person:4', 'Person', '张一鸣', title='CEO', birth=1983)
    
    # 产品
    kg.add_entity('prod:1', 'Product', '微信', launch=2011, category='社交')
    kg.add_entity('prod:2', 'Product', 'QQ', launch=1999, category='社交')
    kg.add_entity('prod:3', 'Product', '支付宝', launch=2004, category='金融')
    kg.add_entity('prod:4', 'Product', '抖音', launch=2016, category='短视频')
    
    # 关系
    relations = [
        ('person:1', 'founder_of', 'comp:1'),
        ('person:2', 'works_at', 'comp:1'),
        ('person:3', 'founder_of', 'comp:2'),
        ('person:4', 'founder_of', 'comp:3'),
        ('comp:1', 'owns', 'prod:1'),
        ('comp:1', 'owns', 'prod:2'),
        ('comp:2', 'owns', 'prod:3'),
        ('comp:3', 'owns', 'prod:4'),
        ('person:1', 'invests_in', 'comp:3'),
        ('prod:1', 'competes_with', 'prod:4'),
        ('prod:3', 'competes_with', 'prod:1'),
    ]
    
    for s, p, o in relations:
        kg.add_relation(s, p, o)
    
    print("  已添加实体和关系:")
    for e in kg.entities.values():
        print(f"    [{e['type']}] {e['name']}")
    
    # 2. 查询
    print("\n--- 2. 查询所有公司 ---")
    companies = kg.query_by_type('Company')
    for c in companies:
        print(f"  {c['name']} ({c['properties']['hq']}, {c['properties']['industry']})")
    
    print("\n--- 3. 查询腾讯的产品 ---")
    tencent_products = kg.query_relations(subj='comp:1', pred='owns')
    for r in tencent_products:
        product = kg.entities[r['object']]
        print(f"  {product['name']} ({product['properties']['category']})")
    
    print("\n--- 4. 查询马化腾的关系 ---")
    ponyma_relations = kg.query_relations(subj='person:1')
    for r in ponyma_relations:
        target = kg.entities[r['object']]
        print(f"  {r['predicate']} -> {target['name']} ({target['type']})")
    
    print("\n--- 5. 多跳查询 ---")
    neighbors = kg.get_neighbors('person:1', max_depth=2)
    for depth, nodes in neighbors.items():
        print(f"  深度 {depth}:")
        for n in nodes:
            if n['entity']:
                print(f"    [{n['relation']}] {n['entity']['name']} ({n['entity']['type']})")
    
    print("\n--- 6. 最短路径 ---")
    path = kg.find_path('person:1', 'prod:4')
    if path:
        print("  马化腾 -> 抖音 的路径:")
        for i, eid in enumerate(path):
            entity = kg.entities[eid]
            arrow = " -> " if i < len(path) - 1 else ""
            print(f"    {entity['name']}{arrow}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_knowledge_graph()
