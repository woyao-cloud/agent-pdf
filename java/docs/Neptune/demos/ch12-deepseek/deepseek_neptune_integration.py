#!/usr/bin/env python3
"""
Neptune + DeepSeek 集成演示
展示如何将 Neptune 图数据与 DeepSeek LLM 结合
支持模拟模式（无需 DeepSeek API key）
"""
import os
import json
from typing import List, Dict, Optional

# DeepSeek API 配置
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

class MockDeepSeek:
    """模拟 DeepSeek 响应（无需 API key）"""
    def chat(self, messages, **kwargs):
        last_msg = messages[-1]['content'] if messages else ""
        return {
            'choices': [{
                'message': {
                    'content': f"[模拟 DeepSeek 响应] 基于图数据上下文分析:\n\n"
                              f"您的问题涉及图数据库中的关系数据。根据提供的图结构信息，"
                              f"我可以分析实体之间的关联关系、路径和模式。\n\n"
                              f"原始查询: {last_msg[:100]}..."
                }
            }]
        }

class NeptuneGraph:
    """模拟 Neptune 图数据"""
    def __init__(self):
        self.data = self._build_sample_graph()
    
    def _build_sample_graph(self):
        return {
            'vertices': {
                '1': {'label': 'Company', 'name': '腾讯科技', 'industry': '互联网'},
                '2': {'label': 'Company', 'name': '阿里巴巴', 'industry': '互联网'},
                '3': {'label': 'Person', 'name': '马化腾', 'title': 'CEO'},
                '4': {'label': 'Person', 'name': '马云', 'title': '创始人'},
                '5': {'label': 'Product', 'name': '微信', 'category': '社交'},
                '6': {'label': 'Product', 'name': '支付宝', 'category': '金融'},
            },
            'edges': [
                {'from': '3', 'to': '1', 'label': 'founder_of'},
                {'from': '4', 'to': '2', 'label': 'founder_of'},
                {'from': '1', 'to': '5', 'label': 'owns'},
                {'from': '2', 'to': '6', 'label': 'owns'},
                {'from': '3', 'to': '4', 'label': 'knows'},
            ]
        }
    
    def query(self, qtype, **params):
        """执行图查询"""
        if qtype == 'get_entity':
            eid = params.get('id')
            return self.data['vertices'].get(eid)
        elif qtype == 'search_entity':
            name = params.get('name', '')
            for v in self.data['vertices'].values():
                if v.get('name') == name:
                    return v
            return None
        elif qtype == 'get_relations':
            eid = params.get('id')
            results = []
            for e in self.data['edges']:
                if e['from'] == eid:
                    target = self.data['vertices'].get(e['to'])
                    results.append({'relation': e['label'], 'target': target})
                if e['to'] == eid:
                    source = self.data['vertices'].get(e['from'])
                    results.append({'relation': f"{e['label']}(反向)", 'target': source})
            return results
        elif qtype == 'find_path':
            start = params.get('from')
            end = params.get('to')
            # 简化 BFS
            return [start, '3', '4', end]  # 模拟路径
        return []

def graph_to_context(graph: NeptuneGraph, entities: List[str]) -> str:
    """将图数据转换为 LLM 可理解的上下文"""
    context_parts = []
    
    for entity_name in entities:
        entity = graph.query('search_entity', name=entity_name)
        if entity:
            context_parts.append(f"实体: {entity['name']} ({entity['label']})")
            context_parts.append(f"  属性: {json.dumps({k:v for k,v in entity.items() if k not in ['label']}, ensure_ascii=False)}")
            
            relations = graph.query('get_relations', id=list(graph.data['vertices'].keys())[list(graph.data['vertices'].values()).index(entity)])
            # 重新查找
            for vid, v in graph.data['vertices'].items():
                if v['name'] == entity_name:
                    relations = graph.query('get_relations', id=vid)
                    if relations:
                        context_parts.append("  关系:")
                        for r in relations:
                            if r['target']:
                                context_parts.append(f"    - [{r['relation']}] -> {r['target']['name']}")
                    break
    
    return "\n".join(context_parts)

def demo_deepseek_integration():
    """Neptune + DeepSeek 集成演示"""
    print("=" * 60)
    print("Neptune + DeepSeek 集成演示")
    print("=" * 60)
    
    # 初始化
    graph = NeptuneGraph()
    
    if DEEPSEEK_API_KEY:
        print("\n[模式] 使用真实 DeepSeek API")
        import requests
        llm = None  # 使用 requests 直接调用
    else:
        print("\n[模式] 使用模拟 DeepSeek（无需 API key）")
        llm = MockDeepSeek()
    
    # 1. 图数据查询
    print("\n--- 1. 图数据查询 ---")
    print("\n查询: 马化腾的信息")
    ma = graph.query('search_entity', name='马化腾')
    if ma:
        print(f"  名称: {ma['name']}")
        print(f"  类型: {ma['label']}")
        print(f"  职位: {ma.get('title', 'N/A')}")
    
    print("\n查询: 马化腾的关系")
    relations = graph.query('get_relations', id='3')
    for r in relations:
        if r['target']:
            print(f"  {r['relation']} -> {r['target']['name']} ({r['target']['label']})")
    
    # 2. Graph RAG 示例
    print("\n--- 2. Graph RAG 示例 ---")
    question = "马化腾和马云是什么关系？他们各自创办了哪些公司？"
    print(f"\n问题: {question}")
    
    # 检索图数据
    context = graph_to_context(graph, ['马化腾', '马云'])
    print(f"\n图数据上下文:\n{context}")
    
    # 调用 DeepSeek
    messages = [
        {"role": "system", "content": "你是一个图数据库分析助手。基于提供的图数据上下文回答用户问题。"},
        {"role": "user", "content": f"图数据上下文:\n{context}\n\n问题: {question}"}
    ]
    
    if llm:
        response = llm.chat(messages)
        print(f"\nDeepSeek 回答:\n{response['choices'][0]['message']['content']}")
    
    # 3. 多跳推理
    print("\n--- 3. 多跳推理 ---")
    question2 = "腾讯科技拥有哪些产品？这些产品之间有什么关系？"
    print(f"\n问题: {question2}")
    
    context2 = graph_to_context(graph, ['腾讯科技', '微信'])
    print(f"\n图数据上下文:\n{context2}")
    
    messages2 = [
        {"role": "system", "content": "你是一个图数据库分析助手。"},
        {"role": "user", "content": f"图数据上下文:\n{context2}\n\n问题: {question2}"}
    ]
    
    if llm:
        response2 = llm.chat(messages2)
        print(f"\nDeepSeek 回答:\n{response2['choices'][0]['message']['content']}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_deepseek_integration()
