#!/usr/bin/env python3
"""
LightRAG 双级检索演示
演示低层、高层和混合三种检索模式
"""
import os

class MockLightRAG:
    def __init__(self):
        self.graph = {
            "entities": {
                "苹果公司": {"type": "公司", "relations": ["发布了", "总部位于"]},
                "iPhone 15": {"type": "产品", "relations": ["搭载了", "起售价"]},
                "A17 Pro": {"type": "芯片", "relations": ["搭载于"]},
                "史蒂夫·乔布斯": {"type": "人物", "relations": ["创立了"]},
                "华为": {"type": "公司", "relations": ["成立于", "总部位于"]},
            },
            "relations": [
                ("苹果公司", "发布了", "iPhone 15"),
                ("iPhone 15", "搭载了", "A17 Pro"),
                ("史蒂夫·乔布斯", "创立了", "苹果公司"),
                ("苹果公司", "总部位于", "库比蒂诺"),
                ("华为", "成立于", "1987年"),
            ]
        }
    
    def query_low(self, question):
        """低层检索 - 精确事实"""
        for entity, data in self.graph["entities"].items():
            if entity in question:
                rels = [r for r in self.graph["relations"] if r[0] == entity or r[2] == entity]
                facts = [f"{r[0]} {r[1]} {r[2]}" for r in rels]
                return f"【低层检索】关于「{entity}」的事实:\n" + "\n".join(facts)
        return "未找到相关实体"
    
    def query_high(self, question):
        """高层检索 - 全局概览"""
        summary = "【高层检索】文档集全局概览:\n"
        summary += f"- 共 {len(self.graph['entities'])} 个实体\n"
        summary += f"- 共 {len(self.graph['relations'])} 条关系\n"
        types = {}
        for e, d in self.graph["entities"].items():
            t = d["type"]
            types[t] = types.get(t, 0) + 1
        for t, c in types.items():
            summary += f"- {t}: {c} 个\n"
        return summary
    
    def query_hybrid(self, question):
        """混合检索"""
        low = self.query_low(question)
        high = self.query_high(question)
        return f"{low}\n\n{high}"

def demo_retrieval():
    print("=" * 60)
    print("LightRAG 双级检索演示")
    print("=" * 60)
    
    rag = MockLightRAG()
    
    # 1. 低层检索
    print("\n--- 1. 低层检索（精确事实）---")
    queries_low = [
        "iPhone 15 搭载了什么芯片？",
        "苹果公司的创始人是谁？",
    ]
    for q in queries_low:
        print(f"\n[查询] {q}")
        print(rag.query_low(q))
    
    # 2. 高层检索
    print("\n--- 2. 高层检索（全局概览）---")
    print(rag.query_high("文档集包含哪些内容？"))
    
    # 3. 混合检索
    print("\n--- 3. 混合检索（综合）---")
    print(rag.query_hybrid("苹果公司和华为的关系"))
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == "__main__":
    demo_retrieval()
