#!/usr/bin/env python3
"""
Neptune 基础连接与操作演示
支持两种模式：
1. 真实 Neptune 连接（设置 NEPTUNE_ENDPOINT 环境变量）
2. 模拟模式（使用内存图，无需 Neptune）
"""
import os
import json
import sys

# 尝试导入 Gremlin Python
try:
    from gremlin_python.driver import client, serializer
    from gremlin_python.process.anonymous_traversal import traversal
    from gremlin_python.driver.driver_remote_connection import DriverRemoteConnection
    HAS_GREMLIN = True
except ImportError:
    HAS_GREMLIN = False
    print("[INFO] gremlinpython 未安装，使用模拟模式")
    print("[INFO] 安装: pip install gremlinpython")

class MockNeptune:
    """模拟 Neptune 客户端，无需真实连接"""
    def __init__(self):
        self.vertices = {}
        self.edges = []
        self.next_id = 1
    
    def add_vertex(self, label, **props):
        vid = str(self.next_id)
        self.next_id += 1
        self.vertices[vid] = {
            'id': vid,
            'label': label,
            'properties': props
        }
        return vid
    
    def add_edge(self, from_id, to_id, label, **props):
        eid = str(self.next_id)
        self.next_id += 1
        self.edges.append({
            'id': eid,
            'from': from_id,
            'to': to_id,
            'label': label,
            'properties': props
        })
        return eid
    
    def get_vertex(self, vid):
        return self.vertices.get(vid)
    
    def query(self, qtype, **params):
        """模拟简单查询"""
        if qtype == 'get_by_label':
            return [v for v in self.vertices.values() if v['label'] == params.get('label')]
        elif qtype == 'get_by_property':
            return [v for v in self.vertices.values() 
                    if v['properties'].get(params.get('key')) == params.get('value')]
        elif qtype == 'get_neighbors':
            vid = params.get('vid')
            direction = params.get('direction', 'out')
            results = []
            for e in self.edges:
                if direction == 'out' and e['from'] == vid:
                    results.append(self.vertices.get(e['to']))
                elif direction == 'in' and e['to'] == vid:
                    results.append(self.vertices.get(e['from']))
            return [r for r in results if r]
        return []

def demo_basic_operations():
    """演示 Neptune 基本操作"""
    print("=" * 60)
    print("Neptune 基础操作演示")
    print("=" * 60)
    
    # 检查环境变量
    endpoint = os.environ.get('NEPTUNE_ENDPOINT')
    
    if endpoint and HAS_GREMLIN:
        print(f"\n[模式] 连接到 Neptune: {endpoint}")
        # 真实连接代码
        cluster_endpoint = f"wss://{endpoint}:8182/gremlin"
        conn = DriverRemoteConnection(cluster_endpoint, 'g')
        g = traversal().withRemote(conn)
        
        # 添加顶点
        print("\n--- 创建节点 ---")
        alice = g.addV('person').property('name', 'Alice').property('age', 30).next()
        bob = g.addV('person').property('name', 'Bob').property('age', 25).next()
        print(f"  创建 Alice: {alice}")
        print(f"  创建 Bob: {bob}")
        
        # 添加边
        print("\n--- 创建关系 ---")
        edge = g.V(alice).addE('knows').to(g.V(bob)).next()
        print(f"  创建关系: Alice -> knows -> Bob")
        
        # 查询
        print("\n--- 查询 ---")
        result = g.V().has('person', 'name', 'Alice').out('knows').values('name').toList()
        print(f"  Alice 认识的人: {result}")
        
        conn.close()
    else:
        print("\n[模式] 使用模拟 Neptune（内存图）")
        mock = MockNeptune()
        
        # 添加顶点
        print("\n--- 创建节点 ---")
        alice = mock.add_vertex('person', name='Alice', age=30, city='Beijing')
        bob = mock.add_vertex('person', name='Bob', age=25, city='Shanghai')
        carol = mock.add_vertex('person', name='Carol', age=35, city='Beijing')
        print(f"  创建 Alice: id={alice}")
        print(f"  创建 Bob: id={bob}")
        print(f"  创建 Carol: id={carol}")
        
        # 添加边
        print("\n--- 创建关系 ---")
        mock.add_edge(alice, bob, 'knows', since=2020)
        mock.add_edge(alice, carol, 'knows', since=2021)
        mock.add_edge(bob, carol, 'knows', since=2022)
        print("  Alice -> knows -> Bob")
        print("  Alice -> knows -> Carol")
        print("  Bob -> knows -> Carol")
        
        # 查询
        print("\n--- 查询 ---")
        people = mock.query('get_by_label', label='person')
        print(f"  所有 person 节点: {len(people)} 个")
        for p in people:
            print(f"    [{p['id']}] {p['properties']['name']} ({p['properties']['city']})")
        
        alice_neighbors = mock.query('get_neighbors', vid=alice, direction='out')
        print(f"\n  Alice 认识的人: {[n['properties']['name'] for n in alice_neighbors]}")
        
        beijing_people = mock.query('get_by_property', key='city', value='Beijing')
        print(f"  北京的用户: {[p['properties']['name'] for p in beijing_people]}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_basic_operations()
