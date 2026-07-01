#!/usr/bin/env python3
"""
Neo4j 索引与查询优化演示
"""
class IndexDemo:
    def __init__(self):
        self.data = []
    
    def add_data(self):
        self.data = [
            {'name': 'Alice', 'age': 30, 'city': 'Beijing'},
            {'name': 'Bob', 'age': 25, 'city': 'Shanghai'},
            {'name': 'Carol', 'age': 35, 'city': 'Beijing'},
            {'name': 'Dave', 'age': 28, 'city': 'Shenzhen'},
            {'name': 'Eve', 'age': 32, 'city': 'Shanghai'},
        ]
    
    def query_without_index(self, key, value):
        """无索引查询（全表扫描）"""
        print(f"  [无索引] 查询 {key}={value}")
        results = [d for d in self.data if d.get(key) == value]
        print(f"  扫描 {len(self.data)} 条记录，找到 {len(results)} 条")
        return results
    
    def query_with_index(self, key, value):
        """有索引查询（哈希查找）"""
        print(f"  [有索引] 查询 {key}={value}")
        # 模拟 B-tree 索引
        index = {d[key]: d for d in self.data}
        result = index.get(value)
        print(f"  直接定位，找到 1 条")
        return result

def demo_index():
    print("=" * 60)
    print("Neo4j 索引与查询优化演示")
    print("=" * 60)
    
    demo = IndexDemo()
    demo.add_data()
    
    # 1. 无索引 vs 有索引
    print("\n--- 1. 无索引 vs 有索引 ---")
    demo.query_without_index('name', 'Alice')
    demo.query_with_index('name', 'Alice')
    
    # 2. 索引类型
    print("\n--- 2. Neo4j 索引类型 ---")
    print("  B-tree 索引: 精确匹配、范围查询、排序")
    print("  全文索引: 全文搜索、模糊匹配")
    print("  复合索引: 多字段组合查询")
    
    # 3. 创建索引的 Cypher
    print("\n--- 3. 创建索引的 Cypher ---")
    print("  CREATE INDEX FOR (u:User) ON (u.name)")
    print("  CREATE INDEX FOR (u:User) ON (u.city, u.age)")
    print("  CREATE FULLTEXT INDEX FOR (u:User) ON EACH [u.name]")
    
    # 4. 查询分析
    print("\n--- 4. 查询分析 (PROFILE/EXPLAIN) ---")
    print("  PROFILE MATCH (u:User {name: 'Alice'}) RETURN u")
    print("  EXPLAIN MATCH (u:User)-[:KNOWS]->(f) RETURN f")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_index()
