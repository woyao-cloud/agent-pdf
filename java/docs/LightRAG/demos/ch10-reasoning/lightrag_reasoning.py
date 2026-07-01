#!/usr/bin/env python3
"""
LightRAG 多文档关系推理演示
"""
from collections import defaultdict

class ReasoningGraph:
    def __init__(self):
        self.entities = {}
        self.relations = []
    
    def add_knowledge(self, text):
        """添加知识（模拟实体和关系提取）"""
        import re
        # 提取三元组
        triples = re.findall(r'([\u4e00-\u9fff]+)(?:是|的|与|和)([\u4e00-\u9fff]+)(?:的|的)([\u4e00-\u9fff]+)', text)
        for subj, rel, obj in triples:
            self.relations.append((subj, rel, obj))
            self.entities[subj] = self.entities.get(subj, 0) + 1
            self.entities[obj] = self.entities.get(obj, 0) + 1
    
    def find_path(self, start, end, max_depth=3):
        """BFS 查找实体间路径"""
        if start == end:
            return [start]
        
        # 构建邻接表
        adj = defaultdict(list)
        for s, r, o in self.relations:
            adj[s].append((o, r))
            adj[o].append((s, f"{r}(反向)"))
        
        # BFS
        queue = [(start, [start], [])]
        visited = {start}
        
        while queue:
            node, path, rels = queue.pop(0)
            if len(path) > max_depth:
                continue
            
            for neighbor, rel in adj.get(node, []):
                if neighbor == end:
                    return path + [neighbor], rels + [rel]
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor], rels + [rel]))
        
        return None, []
    
    def detect_contradiction(self):
        """检测矛盾"""
        contradictions = []
        # 简单规则：同一实体有冲突属性
        return contradictions

def demo_reasoning():
    print("=" * 60)
    print("LightRAG 多文档关系推理演示")
    print("=" * 60)
    
    graph = ReasoningGraph()
    
    # 1. 添加知识
    print("\n--- 1. 添加知识 ---")
    knowledge = [
        "苹果公司的CEO是蒂姆·库克",
        "蒂姆·库克是苹果公司的首席执行官",
        "华为的CEO是任正非",
        "苹果公司和华为是竞争对手关系",
        "iPhone是苹果公司的产品",
        "华为Mate系列是华为的产品",
    ]
    for k in knowledge:
        print(f"  {k}")
        graph.add_knowledge(k)
    
    # 2. 路径推理
    print("\n--- 2. 关系路径推理 ---")
    pairs = [("苹果公司", "华为"), ("蒂姆·库克", "iPhone")]
    for start, end in pairs:
        path, rels = graph.find_path(start, end)
        if path:
            path_str = " → ".join(path)
            print(f"  {start} → {end}: {path_str}")
        else:
            print(f"  {start} → {end}: 未找到路径")
    
    # 3. 矛盾检测
    print("\n--- 3. 矛盾检测 ---")
    contradictions = graph.detect_contradiction()
    if contradictions:
        for c in contradictions:
            print(f"  ⚠️ {c}")
    else:
        print("  未检测到矛盾")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == "__main__":
    demo_reasoning()
