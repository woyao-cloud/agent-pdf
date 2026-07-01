#!/usr/bin/env python3
"""
Neo4j 存储引擎理解演示
模拟 Neo4j 的节点和关系存储结构
"""
class Neo4jStore:
    """模拟 Neo4j 存储引擎"""
    def __init__(self):
        self.nodes = {}      # node_id -> Node
        self.relationships = {}  # rel_id -> Relationship
        self.next_node_id = 1
        self.next_rel_id = 1
    
    def add_node(self, labels, properties):
        """添加节点（模拟 Node Store）"""
        node_id = self.next_node_id
        self.next_node_id += 1
        self.nodes[node_id] = {
            'id': node_id,
            'labels': labels,
            'properties': properties,
            'first_rel_id': None,
            'first_prop_id': None
        }
        return node_id
    
    def add_relationship(self, from_id, to_id, rel_type, properties):
        """添加关系（模拟 Relationship Store）"""
        rel_id = self.next_rel_id
        self.next_rel_id += 1
        
        # 双向链表：每个节点维护关系链
        rel = {
            'id': rel_id,
            'from': from_id,
            'to': to_id,
            'type': rel_type,
            'properties': properties,
            'prev_rel_from': None,
            'next_rel_from': None,
            'prev_rel_to': None,
            'next_rel_to': None
        }
        self.relationships[rel_id] = rel
        return rel_id
    
    def get_node_neighbors(self, node_id, direction='BOTH'):
        """获取邻居节点（指针追逐模拟）"""
        neighbors = []
        for rel in self.relationships.values():
            if direction in ('OUTGOING', 'BOTH') and rel['from'] == node_id:
                neighbors.append((rel['to'], rel['type'], 'OUTGOING'))
            if direction in ('INCOMING', 'BOTH') and rel['to'] == node_id:
                neighbors.append((rel['from'], rel['type'], 'INCOMING'))
        return neighbors

def demo_storage():
    print("=" * 60)
    print("Neo4j 存储引擎模拟演示")
    print("=" * 60)
    
    store = Neo4jStore()
    
    # 1. 创建节点
    print("\n--- 1. 节点存储 (Node Store) ---")
    alice = store.add_node(['Person', 'User'], {'name': 'Alice', 'age': 30})
    bob = store.add_node(['Person', 'User'], {'name': 'Bob', 'age': 25})
    carol = store.add_node(['Person', 'User'], {'name': 'Carol', 'age': 35})
    print(f"  创建节点: Alice(id={alice}), Bob(id={bob}), Carol(id={carol})")
    print(f"  每个节点固定 15 字节（Neo4j Node Store 记录大小）")
    
    # 2. 创建关系
    print("\n--- 2. 关系存储 (Relationship Store) ---")
    r1 = store.add_relationship(alice, bob, 'KNOWS', {'since': 2020})
    r2 = store.add_relationship(alice, carol, 'KNOWS', {'since': 2021})
    r3 = store.add_relationship(bob, carol, 'KNOWS', {'since': 2022})
    print(f"  创建关系: Alice->Bob, Alice->Carol, Bob->Carol")
    print(f"  每个关系固定 34 字节（Neo4j Relationship Store 记录大小）")
    print(f"  关系使用双向链表存储，支持高效遍历")
    
    # 3. 指针追逐遍历
    print("\n--- 3. 指针追逐遍历 ---")
    neighbors = store.get_node_neighbors(alice, 'OUTGOING')
    print(f"  Alice 的出边邻居:")
    for nid, rtype, direction in neighbors:
        node = store.nodes[nid]
        print(f"    -> {node['properties']['name']} (通过 {rtype})")
    
    # 4. 存储统计
    print("\n--- 4. 存储统计 ---")
    total_nodes = len(store.nodes)
    total_rels = len(store.relationships)
    node_store_size = total_nodes * 15  # 15 bytes per node
    rel_store_size = total_rels * 34    # 34 bytes per relationship
    print(f"  节点数: {total_nodes}")
    print(f"  关系数: {total_rels}")
    print(f"  节点存储: ~{node_store_size} bytes")
    print(f"  关系存储: ~{rel_store_size} bytes")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_storage()
