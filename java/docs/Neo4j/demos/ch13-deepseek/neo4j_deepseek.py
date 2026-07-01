#!/usr/bin/env python3
"""
Neo4j + DeepSeek 集成演示
支持模拟模式（无需 API key）
"""
import os
import json

DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')

class MockDeepSeek:
    def chat(self, messages):
        return {'choices': [{'message': {'content': f"[模拟 DeepSeek] 基于图数据的分析结果"}}]}

class Neo4jGraph:
    def __init__(self):
        self.entities = {
            '1': {'name': '腾讯科技', 'type': 'Company'},
            '2': {'name': '阿里巴巴', 'type': 'Company'},
            '3': {'name': '马化腾', 'type': 'Person'},
            '4': {'name': '马云', 'type': 'Person'},
            '5': {'name': '微信', 'type': 'Product'},
            '6': {'name': '支付宝', 'type': 'Product'},
        }
        self.relations = [
            ('3','founder_of','1'), ('4','founder_of','2'),
            ('1','owns','5'), ('2','owns','6'),
        ]
    
    def query_entity(self, name):
        for eid, e in self.entities.items():
            if e['name'] == name:
                return eid, e
        return None, None
    
    def get_relations(self, eid):
        results = []
        for s, p, o in self.relations:
            if s == eid:
                results.append((p, self.entities[o]['name']))
            if o == eid:
                results.append((f"{p}(反向)", self.entities[s]['name']))
        return results

def demo_deepseek():
    print("=" * 60)
    print("Neo4j + DeepSeek 集成演示")
    print("=" * 60)
    
    graph = Neo4jGraph()
    llm = None if DEEPSEEK_API_KEY else MockDeepSeek()
    mode = "真实" if DEEPSEEK_API_KEY else "模拟"
    print(f"\n[模式] {mode} DeepSeek")
    
    # 1. 图查询
    print("\n--- 1. 图数据查询 ---")
    eid, entity = graph.query_entity('马化腾')
    if entity:
        print(f"  实体: {entity['name']} ({entity['type']})")
        rels = graph.get_relations(eid)
        for p, t in rels:
            print(f"  关系: {p} -> {t}")
    
    # 2. Graph RAG
    print("\n--- 2. Graph RAG 示例 ---")
    question = "马化腾和马云各自创办了什么公司？"
    context = "腾讯科技由马化腾创立，拥有微信。阿里巴巴由马云创立，拥有支付宝。"
    
    if llm:
        response = llm.chat([{"role": "user", "content": f"图数据: {context}\n问题: {question}"}])
        print(f"  DeepSeek: {response['choices'][0]['message']['content']}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_deepseek()
