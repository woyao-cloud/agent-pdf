#!/usr/bin/env python3
"""
Graph RAG (图增强检索增强生成) 完整实现
将 Neptune 图数据与 DeepSeek 结合实现智能问答
支持模拟模式（无需 API key）
"""
import os
import json
from typing import List, Dict, Optional
from collections import defaultdict, deque

# DeepSeek 配置
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

class MockDeepSeek:
    """模拟 DeepSeek"""
    def chat(self, messages, **kwargs):
        return {
            'choices': [{
                'message': {
                    'content': self._generate_response(messages)
                }
            }]
        }
    
    def _generate_response(self, messages):
        last = messages[-1]['content'] if messages else ""
        if '路径' in last or '关系' in last:
            return "根据图数据，实体之间存在以下关系路径：[实体A] -> [关系X] -> [实体B] -> [关系Y] -> [实体C]。这条路径表明它们通过中间实体建立了间接联系。"
        elif '总结' in last or '分析' in last:
            return "基于图数据的综合分析：该知识图谱包含多个实体类型（公司、人物、产品），它们之间通过 founder_of、owns、knows 等关系连接。核心实体是腾讯科技和阿里巴巴，它们各自拥有核心产品并存在竞争关系。"
        else:
            return f"[Graph RAG 响应] 基于图数据上下文的回答。查询内容: {last[:80]}..."

class KnowledgeGraph:
    """知识图谱"""
    def __init__(self):
        self.entities = {}
        self.relations = []
        self._build_sample_graph()
    
    def _build_sample_graph(self):
        entities = [
            ('comp:1', 'Company', '腾讯科技', {'founded': 1998, 'hq': '深圳', 'employees': 100000}),
            ('comp:2', 'Company', '阿里巴巴', {'founded': 1999, 'hq': '杭州', 'employees': 250000}),
            ('comp:3', 'Company', '字节跳动', {'founded': 2012, 'hq': '北京', 'employees': 150000}),
            ('person:1', 'Person', '马化腾', {'title': 'CEO', 'birth': 1971}),
            ('person:2', 'Person', '张小龙', {'title': '高级副总裁', 'birth': 1969}),
            ('person:3', 'Person', '马云', {'title': '创始人', 'birth': 1964}),
            ('person:4', 'Person', '张一鸣', {'title': 'CEO', 'birth': 1983}),
            ('prod:1', 'Product', '微信', {'launch': 2011, 'users': '13亿', 'category': '社交'}),
            ('prod:2', 'Product', 'QQ', {'launch': 1999, 'users': '6亿', 'category': '社交'}),
            ('prod:3', 'Product', '支付宝', {'launch': 2004, 'users': '10亿', 'category': '金融'}),
            ('prod:4', 'Product', '抖音', {'launch': 2016, 'users': '8亿', 'category': '短视频'}),
        ]
        for eid, etype, name, props in entities:
            self.entities[eid] = {'id': eid, 'type': etype, 'name': name, **props}
        
        relations = [
            ('person:1', 'founder_of', 'comp:1'),
            ('person:2', 'works_at', 'comp:1'),
            ('person:3', 'founder_of', 'comp:2'),
            ('person:4', 'founder_of', 'comp:3'),
            ('comp:1', 'owns', 'prod:1'),
            ('comp:1', 'owns', 'prod:2'),
            ('comp:2', 'owns', 'prod:3'),
            ('comp:3', 'owns', 'prod:4'),
            ('person:1', 'invests_in', 'comp:3'),
            ('prod:1', 'competes_with', 'prod:4'),
            ('comp:1', 'competes_with', 'comp:2'),
        ]
        for s, p, o in relations:
            self.relations.append({'subject': s, 'predicate': p, 'object': o})
    
    def search_entity(self, name: str) -> Optional[Dict]:
        for e in self.entities.values():
            if e['name'] == name:
                return e
        return None
    
    def get_entity_relations(self, eid: str) -> List[Dict]:
        results = []
        for r in self.relations:
            if r['subject'] == eid:
                target = self.entities.get(r['object'])
                if target:
                    results.append({'relation': r['predicate'], 'target': target['name'], 'target_type': target['type']})
            if r['object'] == eid:
                source = self.entities.get(r['subject'])
                if source:
                    results.append({'relation': f"{r['predicate']}(反向)", 'target': source['name'], 'target_type': source['type']})
        return results
    
    def find_path(self, start_name: str, end_name: str, max_depth: int = 5) -> Optional[List[str]]:
        start = self.search_entity(start_name)
        end = self.search_entity(end_name)
        if not start or not end:
            return None
        
        queue = deque([(start['id'], [start['name']])])
        visited = {start['id']}
        
        while queue:
            node_id, path = queue.popleft()
            if len(path) > max_depth:
                continue
            
            for r in self.relations:
                neighbors = []
                if r['subject'] == node_id:
                    neighbors.append(r['object'])
                if r['object'] == node_id:
                    neighbors.append(r['subject'])
                
                for nid in neighbors:
                    if nid == end['id']:
                        return path + [self.entities[nid]['name']]
                    if nid not in visited:
                        visited.add(nid)
                        queue.append((nid, path + [self.entities[nid]['name']]))
        
        return None
    
    def get_subgraph_context(self, entity_names: List[str], depth: int = 1) -> str:
        """获取子图上下文文本"""
        context_parts = []
        processed = set()
        
        for name in entity_names:
            entity = self.search_entity(name)
            if not entity or entity['id'] in processed:
                continue
            processed.add(entity['id'])
            
            # 实体信息
            props = {k: v for k, v in entity.items() if k not in ['id', 'type', 'name']}
            context_parts.append(f"实体: {entity['name']} (类型: {entity['type']})")
            if props:
                context_parts.append(f"  属性: {json.dumps(props, ensure_ascii=False)}")
            
            # 关系信息
            relations = self.get_entity_relations(entity['id'])
            if relations:
                context_parts.append("  关系:")
                for r in relations:
                    context_parts.append(f"    - [{r['relation']}] -> {r['target']} ({r['target_type']})")
            
            context_parts.append("")
        
        return "\n".join(context_parts)

class GraphRAG:
    """Graph RAG 系统"""
    def __init__(self):
        self.kg = KnowledgeGraph()
        if DEEPSEEK_API_KEY:
            self.llm = None  # 真实 API
        else:
            self.llm = MockDeepSeek()
    
    def retrieve(self, question: str) -> Dict:
        """检索阶段：从知识图谱中提取相关上下文"""
        # 简单实体识别（实际应用中应使用 NER）
        entities_found = []
        for e in self.kg.entities.values():
            if e['name'] in question:
                entities_found.append(e['name'])
        
        if not entities_found:
            return {'context': '未找到相关实体', 'entities': []}
        
        # 获取子图上下文
        context = self.kg.get_subgraph_context(entities_found, depth=1)
        
        # 查找实体间路径
        paths = []
        for i in range(len(entities_found)):
            for j in range(i + 1, len(entities_found)):
                path = self.kg.find_path(entities_found[i], entities_found[j])
                if path:
                    paths.append(path)
        
        if paths:
            context += "\n实体间路径:\n"
            for path in paths:
                context += f"  {' -> '.join(path)}\n"
        
        return {'context': context, 'entities': entities_found, 'paths': paths}
    
    def augment(self, question: str, retrieval: Dict) -> str:
        """增强阶段：构建提示"""
        system_prompt = """你是一个基于知识图谱的智能问答助手。使用提供的图数据上下文回答用户问题。
如果图数据中有相关信息，请基于事实回答。如果信息不足，请明确说明。
回答时引用具体的实体和关系。"""
        
        user_prompt = f"""图数据上下文:
{retrieval['context']}

问题: {question}

请基于以上图数据回答。"""
        
        return system_prompt, user_prompt
    
    def generate(self, system_prompt: str, user_prompt: str) -> str:
        """生成阶段：调用 DeepSeek"""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        if self.llm:
            response = self.llm.chat(messages)
            return response['choices'][0]['message']['content']
        else:
            # 真实 API 调用
            import requests
            response = requests.post(
                DEEPSEEK_API_URL,
                headers={
                    'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'deepseek-chat',
                    'messages': messages,
                    'temperature': 0.3
                }
            )
            return response.json()['choices'][0]['message']['content']
    
    def answer(self, question: str) -> Dict:
        """完整问答流程"""
        print(f"\n[检索] 从知识图谱中检索...")
        retrieval = self.retrieve(question)
        print(f"  找到实体: {retrieval['entities']}")
        
        print(f"[增强] 构建提示...")
        system_prompt, user_prompt = self.augment(question, retrieval)
        
        print(f"[生成] 调用 DeepSeek...")
        answer = self.generate(system_prompt, user_prompt)
        
        return {
            'question': question,
            'entities_found': retrieval['entities'],
            'context': retrieval['context'],
            'answer': answer
        }

def demo_graph_rag():
    """Graph RAG 完整演示"""
    print("=" * 60)
    print("Graph RAG 完整演示")
    print("=" * 60)
    
    rag = GraphRAG()
    
    # 1. 单实体查询
    print("\n--- 1. 单实体查询 ---")
    result = rag.answer("马化腾是谁？他创办了什么公司？")
    print(f"\n问题: {result['question']}")
    print(f"找到实体: {result['entities_found']}")
    print(f"回答: {result['answer']}")
    
    # 2. 多实体关系查询
    print("\n--- 2. 多实体关系查询 ---")
    result2 = rag.answer("腾讯科技和阿里巴巴是什么关系？它们各自有哪些产品？")
    print(f"\n问题: {result2['question']}")
    print(f"找到实体: {result2['entities_found']}")
    print(f"回答: {result2['answer']}")
    
    # 3. 路径查询
    print("\n--- 3. 路径查询 ---")
    result3 = rag.answer("马化腾和张一鸣之间有什么关系路径？")
    print(f"\n问题: {result3['question']}")
    print(f"找到实体: {result3['entities_found']}")
    print(f"回答: {result3['answer']}")
    
    # 4. 综合分析
    print("\n--- 4. 综合分析 ---")
    result4 = rag.answer("总结这个知识图谱中的主要实体和关系")
    print(f"\n问题: {result4['question']}")
    print(f"找到实体: {result4['entities_found']}")
    print(f"回答: {result4['answer']}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_graph_rag()
