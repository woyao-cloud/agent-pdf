#!/usr/bin/env python3
"""
LightRAG 向量检索与混合搜索演示
"""
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

class SimpleVectorStore:
    def __init__(self):
        self.documents = []
        self.embeddings = []
    
    def add_document(self, text, embedding=None):
        self.documents.append(text)
        if embedding is None:
            embedding = np.random.rand(384)  # 模拟嵌入
        self.embeddings.append(embedding)
    
    def search(self, query_embedding, k=3):
        similarities = cosine_similarity([query_embedding], self.embeddings)[0]
        top_k = np.argsort(similarities)[-k:][::-1]
        results = []
        for idx in top_k:
            results.append({
                "document": self.documents[idx],
                "score": similarities[idx]
            })
        return results

def demo_vector_search():
    print("=" * 60)
    print("LightRAG 向量检索与混合搜索演示")
    print("=" * 60)
    
    store = SimpleVectorStore()
    
    # 1. 添加文档
    print("\n--- 1. 添加文档 ---")
    docs = [
        "苹果公司发布了 iPhone 15",
        "iPhone 15 搭载了 A17 Pro 芯片",
        "华为发布了 Mate 60 系列",
        "Mate 60 搭载了麒麟 9000S 芯片",
        "特斯拉发布了新款 Model 3",
    ]
    for doc in docs:
        store.add_document(doc)
        print(f"  已添加: {doc}")
    
    # 2. 向量检索
    print("\n--- 2. 向量检索 ---")
    query = "苹果手机芯片"
    query_emb = np.random.rand(384)
    results = store.search(query_emb, k=3)
    
    print(f"  查询: {query}")
    for r in results:
        print(f"  [{r['score']:.4f}] {r['document']}")
    
    # 3. 混合搜索（图 + 向量）
    print("\n--- 3. 混合搜索（图 + 向量）---")
    print("  图检索: 找到「苹果公司」实体，关联「iPhone 15」「A17 Pro」")
    print("  向量检索: 找到语义相似的文档")
    print("  融合结果: 综合图结构和向量相似度")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == "__main__":
    demo_vector_search()
