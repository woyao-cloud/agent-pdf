#!/usr/bin/env python3
"""
LightRAG 图索引构建演示
演示完整的索引构建流程：文本分块 → 实体提取 → 关系提取 → 图构建
支持模拟模式（无需 API key）
"""
import os
import json

# 尝试导入 LightRAG
try:
    from lightrag import LightRAG
    from lightrag.llm import gpt_4o_mini_complete
    HAS_LIGHTRAG = True
except ImportError:
    HAS_LIGHTRAG = False
    print("[INFO] lightrag-hku 未安装，使用模拟模式")
    print("[INFO] 安装: pip install lightrag-hku")

class MockLightRAG:
    """模拟 LightRAG（无需 API key）"""
    def __init__(self):
        self.documents = []
        self.graph = {"entities": {}, "relations": []}
    
    def insert(self, text):
        self.documents.append(text)
        # 模拟实体提取
        entities = self._extract_entities(text)
        for entity in entities:
            name = entity["name"]
            if name not in self.graph["entities"]:
                self.graph["entities"][name] = entity
        print(f"[索引] 已处理文档 #{len(self.documents)}")
    
    def _extract_entities(self, text):
        entities = []
        # 简单规则提取（演示用）
        import re
        # 提取公司名
        companies = re.findall(r'([\u4e00-\u9fff]+公司|Apple|Microsoft|Google|华为|腾讯|阿里巴巴)', text)
        for c in companies:
            entities.append({"name": c, "type": "组织", "description": f"公司: {c}"})
        # 提取人名
        people = re.findall(r'([\u4e00-\u9fff]{2,4}(?:·[\u4e00-\u9fff]{2,4})?)', text)
        # 提取产品名
        products = re.findall(r'(iPhone\s*\d+|iPad|Mac|Windows|Android|微信|支付宝)', text)
        for p in products:
            entities.append({"name": p, "type": "产品", "description": f"产品: {p}"})
        return entities
    
    def query(self, question, mode="hybrid"):
        context = f"基于 {len(self.documents)} 篇文档的知识图谱"
        return f"[模拟 LightRAG {mode}检索] 问题: {question}\n{context}"

def demo_indexing():
    print("=" * 60)
    print("LightRAG 图索引构建演示")
    print("=" * 60)
    
    if HAS_LIGHTRAG:
        print("\n[模式] 使用真实 LightRAG")
        rag = LightRAG(working_dir="./lightrag_cache", llm_func=gpt_4o_mini_complete)
    else:
        print("\n[模式] 使用模拟 LightRAG")
        rag = MockLightRAG()
    
    # 1. 插入文档
    print("\n--- 1. 插入文档 ---")
    docs = [
        "苹果公司由史蒂夫·乔布斯在1976年创立，总部位于加州库比蒂诺。",
        "2023年，苹果发布了iPhone 15系列，搭载了A17 Pro芯片。",
        "iPhone 15 Pro Max起售价1199美元，配备钛金属外壳。",
        "华为是一家中国科技公司，成立于1987年，总部位于深圳。",
        "华为的麒麟芯片与苹果的A系列芯片是竞争对手。",
    ]
    
    for i, doc in enumerate(docs, 1):
        print(f"  文档{i}: {doc[:50]}...")
        rag.insert(doc)
    
    # 2. 查询验证
    print("\n--- 2. 查询验证 ---")
    queries = [
        ("iPhone 15 用什么芯片？", "low"),
        ("苹果公司有哪些产品？", "high"),
        ("华为和苹果是什么关系？", "hybrid"),
    ]
    
    for question, mode in queries:
        print(f"\n[查询] ({mode}) {question}")
        answer = rag.query(question, mode=mode)
        print(f"[回答] {answer}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == "__main__":
    demo_indexing()
