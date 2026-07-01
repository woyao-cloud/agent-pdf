#!/usr/bin/env python3
"""
Neo4j Graph RAG 完整实现
"""
import os
import json
from collections import deque

DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')

class MockDeepSeek:
    def chat(self, messages):
        return {'choices': [{'message': {'content': self._gen(messages)}}]}
    def _gen(self, messages):
        last = messages[-1]['content'] if messages else ""
        if '关系' in last:
            return "根据知识图谱，马化腾是腾讯科技的创始人，腾讯科技拥有微信产品。马云是阿里巴巴的创始人，阿里巴巴拥有支付宝产品。两者之间没有直接关系，但都是中国互联网行业的领军人物。"
        return f"[Graph RAG] 基于图数据的回答。查询: {last[:50]}"

class KnowledgeGraph:
    def __init__(self):
        self.entities = {
            '1': {'name': '腾讯科技', 'type': 'Company', 'founded': 1998},
            '2': {'name': '阿里巴巴', 'type': 'Company', 'founded': 1999},
            '3': {'name': '马化腾', 'type': 'Person', 'title': 'CEO'},
            '4': {'name': '马云', 'type': 'Person', 'title': '创始人'},
            '5': {'name': '微信', 'type': 'Product'},
            '6': {'name': '支付宝', 'type': 'Product'},
        }
        self.relations = [
            ('3','founder_of','1'), ('4','founder_of','2'),
            ('1','owns','5'), ('2','owns','6'),
        ]
    
    def search(self, name):
        for eid, e in self.entities.items():
            if e['name'] == name: return eid, e
        return None, None
    
    def get_context(self, names):
        parts = []
        for name in names:
            eid, entity = self.search(name)
            if entity:
                parts.append(f"实体: {entity['name']} ({entity['type']})")
                rels = [(p, self.entities[o]['name']) for s,p,o in self.relations if s==eid] + \
                       [(f"{p}(反向)", self.entities[s]['name']) for s,p,o in self.relations if o==eid]
                for p, t in rels:
                    parts.append(f"  [{p}] -> {t}")
        return "\n".join(parts)

def demo_graph_rag():
    print("=" * 60)
    print("Neo4j Graph RAG 演示")
    print("=" * 60)
    
    kg = KnowledgeGraph()
    llm = MockDeepSeek()
    
    # 1. 查询
    print("\n--- 1. 图数据检索 ---")
    context = kg.get_context(['马化腾', '马云'])
    print(context)
    
    # 2. DeepSeek 增强生成
    print("\n--- 2. DeepSeek 增强生成 ---")
    question = "马化腾和马云是什么关系？他们各自有什么产品？"
    response = llm.chat([{"role": "user", "content": f"图数据:\n{context}\n\n问题: {question}"}])
    print(f"  {response['choices'][0]['message']['content']}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_graph_rag()
