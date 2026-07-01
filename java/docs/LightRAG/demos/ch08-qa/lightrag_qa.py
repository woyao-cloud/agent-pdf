#!/usr/bin/env python3
"""
LightRAG 知识库问答系统演示
"""
import json

class KnowledgeBase:
    def __init__(self):
        self.documents = []
        self.qa_pairs = []
    
    def add_document(self, title, content):
        self.documents.append({"title": title, "content": content})
        print(f"  已添加: {title}")
    
    def answer(self, question, mode="hybrid"):
        """模拟问答"""
        # 简单关键词匹配
        for doc in self.documents:
            if any(kw in question for kw in doc["title"].split()):
                return f"[{mode.upper()}] 基于「{doc['title']}」的回答:\n{doc['content'][:200]}"
        return f"[{mode.upper()}] 未找到相关信息"

def demo_qa():
    print("=" * 60)
    print("LightRAG 知识库问答系统演示")
    print("=" * 60)
    
    kb = KnowledgeBase()
    
    # 1. 构建知识库
    print("\n--- 1. 构建知识库 ---")
    kb.add_document("产品规格", "iPhone 15: A17 Pro芯片, 6.1英寸屏幕, 起售价799美元")
    kb.add_document("公司信息", "苹果公司成立于1976年, 总部在库比蒂诺, 由乔布斯创立")
    kb.add_document("技术文档", "A17 Pro采用3nm工艺, 6核CPU, 5核GPU, 性能提升20%")
    
    # 2. 问答
    print("\n--- 2. 问答演示 ---")
    questions = [
        ("iPhone 15 的芯片是什么？", "low"),
        ("苹果公司的基本信息", "high"),
        ("A17 Pro 芯片的性能如何？", "hybrid"),
    ]
    
    for question, mode in questions:
        print(f"\n[Q] ({mode}) {question}")
        answer = kb.answer(question, mode)
        print(f"[A] {answer}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == "__main__":
    demo_qa()
