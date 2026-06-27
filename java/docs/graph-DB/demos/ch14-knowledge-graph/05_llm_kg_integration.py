"""
05 - LLM + 知识图谱集成演示
Graph RAG、自然语言转图查询、KG增强问答
"""

import networkx as nx
import json
import re


MOCK_MODE = True

MOCK_LLM_RESPONSES = {
    "plain": (
        "阿里巴巴是一家中国科技公司，由马云创立。公司业务涵盖电商、云计算、"
        "数字媒体和娱乐等领域。阿里巴巴旗下拥有淘宝、天猫、阿里云等知名品牌。"
    ),
    "kg_enhanced": (
        "根据知识图谱信息，阿里巴巴集团由马云在1999年创立于杭州。"
        "张勇担任阿里巴巴董事会主席兼CEO。阿里巴巴旗下拥有淘宝、天猫、阿里云等业务。"
        "阿里云是中国领先的云计算服务商。此外，阿里巴巴与腾讯有合作关系。"
        "从图谱关系来看，阿里巴巴位于杭州，与腾讯有合作，旗下拥有阿里云。"
    ),
    "query_translation": (
        "您的自然语言查询已翻译为图查询：\n"
        "MATCH (p:PERSON)-[:founded]->(c:ORG)-[:located_in]->(l:GPE)\n"
        "WHERE l.name = '北京'\n"
        "RETURN p.name, c.name"
    ),
}


def build_acquisition_kg():
    G = nx.MultiDiGraph()

    entities = {
        "阿里巴巴": "ORG", "腾讯": "ORG", "字节跳动": "ORG",
        "百度": "ORG", "小米": "ORG", "美团": "ORG",
        "京东": "ORG", "饿了么": "ORG", "摩拜单车": "ORG",
        "优酷": "ORG", "UC浏览器": "ORG", "高德地图": "ORG",
        "滴滴出行": "ORG", "快手": "ORG", "搜狗": "ORG",
        "中国": "GPE", "美国": "GPE",
    }

    for name, etype in entities.items():
        G.add_node(name, type=etype)

    relations = [
        ("阿里巴巴", "acquired", "饿了么"),
        ("阿里巴巴", "acquired", "优酷"),
        ("阿里巴巴", "acquired", "UC浏览器"),
        ("阿里巴巴", "acquired", "高德地图"),
        ("腾讯", "acquired", "搜狗"),
        ("腾讯", "invested_in", "京东"),
        ("腾讯", "invested_in", "美团"),
        ("腾讯", "invested_in", "滴滴出行"),
        ("腾讯", "invested_in", "快手"),
        ("小米", "invested_in", "摩拜单车"),
        ("字节跳动", "invested_in", "饿了么"),
        ("百度", "invested_in", "滴滴出行"),
        ("阿里巴巴", "located_in", "中国"),
        ("腾讯", "located_in", "中国"),
        ("字节跳动", "located_in", "中国"),
        ("百度", "located_in", "中国"),
        ("小米", "located_in", "中国"),
        ("美团", "located_in", "中国"),
        ("京东", "located_in", "中国"),
    ]

    for subj, pred, obj in relations:
        if subj in G and obj in G:
            G.add_edge(subj, obj, relation=pred)

    return G


def graph_rag_retrieve(G, query_entity, max_depth=2):
    print(f"\n{'='*70}")
    print(f"Graph RAG: 检索与 '{query_entity}' 相关的子图 (深度={max_depth})")
    print(f"{'='*70}")

    if query_entity not in G:
        print(f"  ✗ 实体 '{query_entity}' 不在知识图谱中")
        return None

    nodes = {query_entity}
    frontier = {query_entity}

    for _ in range(max_depth):
        next_frontier = set()
        for node in frontier:
            for neighbor in G.successors(node):
                if neighbor not in nodes:
                    nodes.add(neighbor)
                    next_frontier.add(neighbor)
            for neighbor in G.predecessors(node):
                if neighbor not in nodes:
                    nodes.add(neighbor)
                    next_frontier.add(neighbor)
        frontier = next_frontier

    subgraph = G.subgraph(nodes)

    print(f"  检索到 {subgraph.number_of_nodes()} 个节点, {subgraph.number_of_edges()} 条边")
    print(f"\n  子图节点:")
    for node, data in subgraph.nodes(data=True):
        print(f"    {node:10s} [{data.get('type', 'UNKNOWN')}]")

    print(f"\n  子图边:")
    for u, v, d in subgraph.edges(data=True):
        print(f"    {u:8s} --({d.get('relation', '?')})--> {v}")

    return subgraph


def format_subgraph_as_context(subgraph):
    if subgraph is None:
        return ""

    lines = ["以下是从知识图谱中检索到的相关信息："]
    for u, v, d in subgraph.edges(data=True):
        rel = d.get('relation', 'related_to')
        if rel == 'acquired':
            lines.append(f"- {u} 收购了 {v}")
        elif rel == 'invested_in':
            lines.append(f"- {u} 投资了 {v}")
        elif rel == 'located_in':
            lines.append(f"- {u} 位于 {v}")
        else:
            lines.append(f"- {u} 与 {v} 的关系为 {rel}")

    return "\n".join(lines)


def llm_answer(question, context=None):
    if MOCK_MODE:
        if context:
            return MOCK_LLM_RESPONSES["kg_enhanced"]
        else:
            return MOCK_LLM_RESPONSES["plain"]

    try:
        from openai import OpenAI
        client = OpenAI()

        messages = []
        if context:
            messages.append({"role": "system", "content": f"你是一个知识图谱问答助手。请基于以下知识图谱信息回答问题。\n\n{context}"})
        else:
            messages.append({"role": "system", "content": "你是一个知识问答助手。"})

        messages.append({"role": "user", "content": question})

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=0.3,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"[LLM 调用失败: {e}]"


def nl_to_graph_query(nl_query):
    print(f"\n{'='*70}")
    print(f"自然语言 → 图查询翻译")
    print(f"{'='*70}")
    print(f"  自然语言查询: \"{nl_query}\"")

    if MOCK_MODE:
        print(f"\n  {MOCK_LLM_RESPONSES['query_translation']}")
        return MOCK_LLM_RESPONSES['query_translation']

    try:
        from openai import OpenAI
        client = OpenAI()
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "将自然语言查询翻译为图数据库查询语句 (Cypher 风格)。"
                 "知识图谱包含 PERSON, ORG, GPE 节点类型和 founded, works_at, located_in, acquired, invested_in 等关系。"},
                {"role": "user", "content": nl_query},
            ],
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"[翻译失败: {e}]"


def compare_answers(question, kg_context):
    print(f"\n{'='*70}")
    print("KG 增强问答 vs 普通问答 对比")
    print(f"{'='*70}")
    print(f"  问题: \"{question}\"")

    print(f"\n  --- 普通 LLM 回答 (无 KG 上下文) ---")
    plain_answer = llm_answer(question, context=None)
    print(f"  {plain_answer}")

    print(f"\n  --- KG 增强回答 (有 KG 上下文) ---")
    kg_answer = llm_answer(question, context=kg_context)
    print(f"  {kg_answer}")

    print(f"\n  {'='*50}")
    print(f"  对比总结:")
    print(f"  - 普通回答: 基于训练数据中的通用知识")
    print(f"  - KG增强回答: 基于结构化知识图谱，更精确、可追溯")
    print(f"  - KG 回答的优势: 可验证、可更新、可解释")
    print(f"  {'='*50}")


def main():
    print("=" * 60)
    print("  LLM + 知识图谱集成演示")
    print("=" * 60)

    if MOCK_MODE:
        print("  [模拟模式] 未检测到 OpenAI API Key，使用模拟响应")
    else:
        print("  [真实模式] 将调用 OpenAI API")

    G = build_acquisition_kg()
    print(f"✓ 企业收购关系知识图谱已构建: {G.number_of_nodes()} 节点, {G.number_of_edges()} 边")

    subgraph = graph_rag_retrieve(G, "阿里巴巴", max_depth=2)

    context = format_subgraph_as_context(subgraph)
    print(f"\n{'='*70}")
    print("格式化的 KG 上下文:")
    print(f"{'='*70}")
    print(context)

    compare_answers("请介绍阿里巴巴公司及其业务布局", context)

    nl_to_graph_query("哪些创始人创立的公司位于北京？")

    print(f"\n{'='*70}")
    print("知识图谱导出")
    print(f"{'='*70}")
    graph_data = {
        "nodes": [{"id": n, "type": d.get("type")} for n, d in G.nodes(data=True)],
        "edges": [{"source": u, "target": v, "relation": d.get("relation")}
                  for u, v, d in G.edges(data=True)],
    }
    with open("acquisition_kg.json", "w", encoding="utf-8") as f:
        json.dump(graph_data, f, ensure_ascii=False, indent=2)
    print("✓ 知识图谱已导出为 acquisition_kg.json")

    print(f"\n{'='*60}")
    print("LLM + KG 集成演示完成!")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
