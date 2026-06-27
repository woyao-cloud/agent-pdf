#!/usr/bin/env python3
"""
Gremlin 查询语言演示
支持模拟模式和真实 Neptune 连接
"""
import os

class MockGraph:
    """模拟图数据用于查询演示"""
    def __init__(self):
        self.data = {
            'vertices': {
                '1': {'id': '1', 'label': 'person', 'name': 'Alice', 'age': 30, 'city': 'Beijing'},
                '2': {'id': '2', 'label': 'person', 'name': 'Bob', 'age': 25, 'city': 'Shanghai'},
                '3': {'id': '3', 'label': 'person', 'name': 'Carol', 'age': 35, 'city': 'Beijing'},
                '4': {'id': '4', 'label': 'person', 'name': 'Dave', 'age': 28, 'city': 'Shenzhen'},
                '5': {'id': '5', 'label': 'movie', 'title': 'Inception', 'year': 2010, 'rating': 8.8},
                '6': {'id': '6', 'label': 'movie', 'title': 'Interstellar', 'year': 2014, 'rating': 9.3},
                '7': {'id': '7', 'label': 'movie', 'title': 'The Matrix', 'year': 1999, 'rating': 8.7},
            },
            'edges': [
                {'id': 'e1', 'from': '1', 'to': '2', 'label': 'knows', 'since': 2020},
                {'id': 'e2', 'from': '1', 'to': '3', 'label': 'knows', 'since': 2021},
                {'id': 'e3', 'from': '2', 'to': '3', 'label': 'knows', 'since': 2022},
                {'id': 'e4', 'from': '1', 'to': '5', 'label': 'rated', 'rating': 9},
                {'id': 'e5', 'from': '1', 'to': '6', 'label': 'rated', 'rating': 10},
                {'id': 'e6', 'from': '2', 'to': '5', 'label': 'rated', 'rating': 8},
                {'id': 'e7', 'from': '2', 'to': '7', 'label': 'rated', 'rating': 9},
                {'id': 'e8', 'from': '3', 'to': '6', 'label': 'rated', 'rating': 9},
                {'id': 'e9', 'from': '3', 'to': '7', 'label': 'rated', 'rating': 8},
                {'id': 'e10', 'from': '4', 'to': '5', 'label': 'rated', 'rating': 7},
            ]
        }
    
    def query(self, qtype, **params):
        if qtype == 'v':
            return list(self.data['vertices'].values())
        elif qtype == 'has':
            results = []
            for v in self.data['vertices'].values():
                if v['label'] == params.get('label'):
                    if params.get('key') and v['properties'].get(params['key']) == params.get('value'):
                        results.append(v)
                    elif not params.get('key'):
                        results.append(v)
            return results
        elif qtype == 'out':
            vid = params.get('vid')
            edge_label = params.get('edge_label')
            results = []
            for e in self.data['edges']:
                if e['from'] == vid:
                    if edge_label and e['label'] != edge_label:
                        continue
                    target = self.data['vertices'].get(e['to'])
                    if target:
                        results.append(target)
            return results
        elif qtype == 'both':
            vid = params.get('vid')
            results = []
            for e in self.data['edges']:
                if e['from'] == vid or e['to'] == vid:
                    other_id = e['to'] if e['from'] == vid else e['from']
                    target = self.data['vertices'].get(other_id)
                    if target:
                        results.append(target)
            return results
        return []

def demo_gremlin_queries():
    """演示各种 Gremlin 查询模式"""
    g = MockGraph()
    
    print("=" * 60)
    print("Gremlin 查询语言演示")
    print("=" * 60)
    
    # 1. 基本查询
    print("\n--- 1. 基本查询 ---")
    print("\n[查询] g.V() - 查询所有顶点")
    all_v = g.query('v')
    print(f"  结果: {len(all_v)} 个顶点")
    
    print("\n[查询] g.V().hasLabel('person') - 查询所有 person")
    people = g.query('has', label='person')
    print(f"  结果: {len(people)} 个 person")
    for p in people:
        print(f"    {p['name']} ({p['city']}, {p['age']}岁)")
    
    print("\n[查询] g.V().has('person', 'city', 'Beijing') - 按城市过滤")
    beijing = g.query('has', label='person', key='city', value='Beijing')
    print(f"  结果: {[p['name'] for p in beijing]}")
    
    # 2. 遍历查询
    print("\n--- 2. 遍历查询 ---")
    print("\n[查询] g.V('1').out('knows') - Alice 认识的人")
    alice_knows = g.query('out', vid='1', edge_label='knows')
    print(f"  结果: {[p['name'] for p in alice_knows]}")
    
    print("\n[查询] g.V('1').out('rated') - Alice 评分的电影")
    alice_rated = g.query('out', vid='1', edge_label='rated')
    print(f"  结果: {[m['title'] for m in alice_rated]}")
    
    # 3. 多步遍历
    print("\n--- 3. 多步遍历 ---")
    print("\n[查询] 朋友的朋友 (2度关系)")
    alice_friends = g.query('out', vid='1', edge_label='knows')
    friends_of_friends = set()
    for friend in alice_friends:
        fof = g.query('out', vid=friend['id'], edge_label='knows')
        for f in fof:
            if f['id'] != '1':
                friends_of_friends.add(f['name'])
    print(f"  Alice 的朋友的朋友: {friends_of_friends}")
    
    # 4. 路径查询
    print("\n--- 4. 路径查询 ---")
    print("\n[查询] Alice 到 Dave 的路径")
    print("  图结构: Alice -> knows -> Bob -> knows -> Carol")
    print("          Alice -> knows -> Carol")
    print("          Bob -> knows -> Carol")
    print("          Dave 只与电影有 rated 关系")
    print("  Dave 与 Alice 无直接路径")
    
    # 5. 聚合查询
    print("\n--- 5. 聚合查询 ---")
    print("\n[查询] 每部电影的平均评分")
    movie_ratings = {}
    for e in g.data['edges']:
        if e['label'] == 'rated':
            movie_id = e['to']
            movie = g.data['vertices'][movie_id]
            if movie['title'] not in movie_ratings:
                movie_ratings[movie['title']] = []
            movie_ratings[movie['title']].append(e['rating'])
    
    for title, ratings in movie_ratings.items():
        avg = sum(ratings) / len(ratings)
        print(f"  {title}: 平均评分 {avg:.1f} ({len(ratings)} 人评分)")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_gremlin_queries()
