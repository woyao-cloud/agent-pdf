#!/usr/bin/env python3
"""
LightRAG 增量更新演示
演示在不重建索引的情况下添加新文档
"""
import copy

class IncrementalGraph:
    def __init__(self):
        self.entities = {}
        self.relations = []
        self.version = 0
    
    def add_document(self, text):
        self.version += 1
        print(f"\n[增量更新 v{self.version}] 添加文档...")
        
        # 模拟实体提取
        new_entities = self._extract_entities(text)
        for entity in new_entities:
            name = entity["name"]
            if name in self.entities:
                print(f"  实体已存在: {name}（合并信息）")
                self.entities[name]["mentions"] += 1
            else:
                self.entities[name] = entity
                print(f"  新增实体: {name} ({entity['type']})")
        
        print(f"  当前实体数: {len(self.entities)}")
        print(f"  当前关系数: {len(self.relations)}")
    
    def _extract_entities(self, text):
        entities = []
        import re
        companies = re.findall(r'([\u4e00-\u9fff]+公司|Apple|Microsoft|Google|华为|腾讯|阿里巴巴)', text)
        for c in set(companies):
            entities.append({"name": c, "type": "组织", "mentions": 1})
        products = re.findall(r'(iPhone\s*\d+|iPad|Mac|Windows|Android|微信|支付宝|鸿蒙)', text)
        for p in set(products):
            entities.append({"name": p, "type": "产品", "mentions": 1})
        return entities
    
    def get_stats(self):
        return {
            "version": self.version,
            "entities": len(self.entities),
            "relations": len(self.relations),
        }

def demo_incremental():
    print("=" * 60)
    print("LightRAG 增量更新演示")
    print("=" * 60)
    
    graph = IncrementalGraph()
    
    # 1. 初始索引
    print("\n--- 1. 初始索引构建 ---")
    graph.add_document("苹果公司发布了 iPhone 15。")
    print(f"  状态: {graph.get_stats()}")
    
    # 2. 增量添加
    print("\n--- 2. 增量添加新文档 ---")
    graph.add_document("iPhone 15 搭载了 A17 Pro 芯片。")
    print(f"  状态: {graph.get_stats()}")
    
    # 3. 添加包含已有实体的文档
    print("\n--- 3. 添加包含已有实体的文档 ---")
    graph.add_document("苹果公司也发布了新款 iPad。")
    print(f"  状态: {graph.get_stats()}")
    
    # 4. 添加新领域的文档
    print("\n--- 4. 添加新领域文档 ---")
    graph.add_document("华为发布了鸿蒙操作系统。")
    print(f"  状态: {graph.get_stats()}")
    
    print("\n" + "=" * 60)
    print("增量更新演示完成！")
    print(f"最终状态: {graph.get_stats()}")
    print("=" * 60)

if __name__ == "__main__":
    demo_incremental()
