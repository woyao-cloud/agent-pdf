"""
03 - 知识图谱构建演示
从文本中抽取实体和关系，构建 NetworkX 知识图谱
"""

import spacy
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib
import json
import re
from collections import Counter


matplotlib.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'DejaVu Sans']
matplotlib.rcParams['axes.unicode_minus'] = False


SAMPLE_DOCUMENT = """
阿里巴巴集团由马云在1999年创立于杭州。如今，阿里巴巴已成为全球最大的电商平台之一。
张勇担任阿里巴巴集团董事会主席兼CEO。阿里巴巴旗下拥有淘宝、天猫、阿里云等业务。
阿里云是中国领先的云计算服务商，为全球数百万企业提供服务。

腾讯控股有限公司由马化腾在1998年创立于深圳。马化腾担任腾讯董事会主席兼CEO。
腾讯在社交、游戏、金融科技等领域拥有广泛业务，旗下产品包括微信、QQ、腾讯云等。

字节跳动由张一鸣在2012年创立，总部位于北京。字节跳动旗下拥有抖音、今日头条等产品。
梁汝波担任字节跳动CEO。抖音在全球拥有超过10亿月活跃用户。

华为技术有限公司由任正非在1987年创立，总部位于深圳。华为是全球领先的ICT基础设施提供商。
孟晚舟担任华为轮值董事长。华为在5G技术领域拥有大量专利。

百度公司由李彦宏在2000年创立于北京。李彦宏担任百度董事长兼CEO。
百度在人工智能领域投入巨大，推出了文心一言大模型。

小米科技由雷军于2010年创立，总部位于北京。雷军担任小米创始人兼CEO。
小米已成长为全球前三的智能手机制造商。

美团由王兴在2010年创立，总部位于北京。王兴担任美团CEO。
美团是中国领先的生活服务电商平台。

宁德时代新能源科技股份有限公司总部位于福建宁德，是全球最大的动力电池制造商。
曾毓群担任宁德时代董事长。宁德时代与特斯拉、宝马等车企有深度合作。
"""


def load_model():
    try:
        nlp = spacy.load("zh_core_web_sm")
        print("✓ spaCy 中文模型加载成功")
        return nlp
    except OSError:
        print("✗ 未找到 zh_core_web_sm 模型，正在下载...")
        spacy.cli.download("zh_core_web_sm")
        nlp = spacy.load("zh_core_web_sm")
        print("✓ 模型下载并加载成功")
        return nlp


def extract_entities(nlp, text):
    doc = nlp(text)
    entities = {}
    for ent in doc.ents:
        if ent.text not in entities:
            entities[ent.text] = ent.label_
    return entities


def extract_relations(text):
    relations = []

    founder_patterns = [
        (r"由(.{1,6})(?:在\S+)?(?:于\S+)?(?:创立|创办|创建|成立)(?:了)?(.{2,20})", "founded"),
    ]

    works_at_patterns = [
        (r"(.{1,6})(?:担任|是|成为|出任)(.{2,20})(?:的)?(?:董事长|CEO|首席执行官|总裁|创始人|总经理|董事|轮值董事长)", "works_at"),
        (r"(.{1,6})(?:是|为)(.{2,20})(?:的)?(?:创始人|CEO|首席执行官|董事长|总裁)", "works_at"),
    ]

    located_in_patterns = [
        (r"(.{2,20})(?:总部)?(?:位于|在|坐落于)(.{2,10})", "located_in"),
    ]

    owns_patterns = [
        (r"(.{2,20})(?:旗下)?(?:拥有|推出|发布|包括)(.{2,20})", "owns"),
    ]

    cooperates_patterns = [
        (r"(.{2,20})与(.{2,20})(?:有|签署|达成|进行)", "cooperates_with"),
    ]

    all_patterns = [
        *founder_patterns, *works_at_patterns, *located_in_patterns,
        *owns_patterns, *cooperates_patterns,
    ]

    for pattern, rel_type in all_patterns:
        for match in re.finditer(pattern, text):
            subj, obj = match.group(1).strip(), match.group(2).strip()
            if subj and obj and subj != obj:
                relations.append((subj, rel_type, obj))

    return relations


def build_graph(entities, relations):
    G = nx.MultiDiGraph()

    for name, label in entities.items():
        G.add_node(name, type=label)

    for subj, pred, obj in relations:
        if subj in G and obj in G:
            G.add_edge(subj, obj, relation=pred)

    return G


def visualize_graph(G):
    fig, ax = plt.subplots(figsize=(16, 12))

    pos = nx.spring_layout(G, k=2, iterations=50, seed=42)

    node_types = nx.get_node_attributes(G, 'type')
    type_colors = {
        "PERSON": "#ff6b6b",
        "ORG": "#4ecdc4",
        "GPE": "#45b7d1",
        "DATE": "#96ceb4",
        "PRODUCT": "#ffeaa7",
        "UNKNOWN": "#dfe6e9",
    }

    for node_type, color in type_colors.items():
        nodes = [n for n in G.nodes() if node_types.get(n) == node_type]
        if nodes:
            nx.draw_networkx_nodes(G, pos, nodelist=nodes, node_color=color,
                                   node_size=2000, label=node_type, ax=ax)

    nx.draw_networkx_labels(G, pos, font_size=10, font_family='sans-serif', ax=ax)

    edge_colors = []
    for _, _, d in G.edges(data=True):
        rel = d.get('relation', '')
        if rel == 'founded':
            edge_colors.append('#e74c3c')
        elif rel == 'works_at':
            edge_colors.append('#3498db')
        elif rel == 'located_in':
            edge_colors.append('#2ecc71')
        elif rel == 'owns':
            edge_colors.append('#f39c12')
        elif rel == 'cooperates_with':
            edge_colors.append('#9b59b6')
        else:
            edge_colors.append('#95a5a6')

    nx.draw_networkx_edges(G, pos, edge_color=edge_colors, width=1.5,
                           arrows=True, arrowsize=15, connectionstyle='arc3,rad=0.1', ax=ax)

    edge_labels = {(u, v): d['relation'] for u, v, d in G.edges(data=True)}
    nx.draw_networkx_edge_labels(G, pos, edge_labels=edge_labels, font_size=8, ax=ax)

    ax.set_title("知识图谱可视化", fontsize=16, fontweight='bold')
    ax.legend(loc='upper right', fontsize=10)
    ax.axis('off')
    plt.tight_layout()
    plt.savefig("knowledge_graph.png", dpi=150, bbox_inches='tight')
    print("✓ 知识图谱已保存为 knowledge_graph.png")
    plt.show()


def export_to_json(G, filepath="knowledge_graph.json"):
    nodes = []
    for node, data in G.nodes(data=True):
        nodes.append({
            "id": node,
            "type": data.get("type", "UNKNOWN"),
            "label": node,
        })

    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "relation": data.get("relation", "related_to"),
            "label": data.get("relation", "related_to"),
        })

    graph_data = {
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "description": "从中文科技新闻构建的知识图谱",
        }
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(graph_data, f, ensure_ascii=False, indent=2)
    print(f"✓ 知识图谱已导出为 {filepath}")
    return graph_data


def print_graph_stats(G):
    print(f"\n{'='*60}")
    print("知识图谱统计")
    print(f"{'='*60}")
    print(f"  节点总数: {G.number_of_nodes()}")
    print(f"  边总数:   {G.number_of_edges()}")
    print(f"  密度:     {nx.density(G):.4f}")

    node_types = Counter(d.get('type', 'UNKNOWN') for _, d in G.nodes(data=True))
    print(f"\n  节点类型分布:")
    for ntype, count in node_types.most_common():
        print(f"    {ntype:10s}: {count}")

    edge_relations = Counter(d.get('relation', 'unknown') for _, _, d in G.edges(data=True))
    print(f"\n  关系类型分布:")
    for rel, count in edge_relations.most_common():
        print(f"    {rel:15s}: {count}")

    print(f"\n  节点列表:")
    for node, data in G.nodes(data=True):
        print(f"    {node:12s} [{data.get('type', 'UNKNOWN')}]")

    print(f"\n  边列表:")
    for u, v, data in G.edges(data=True):
        print(f"    {u:8s} --({data.get('relation', '?')})--> {v}")


def main():
    print("=" * 60)
    print("  知识图谱构建演示")
    print("=" * 60)

    nlp = load_model()

    print(f"\n{'='*60}")
    print("步骤 1: 实体抽取")
    print(f"{'='*60}")
    entities = extract_entities(nlp, SAMPLE_DOCUMENT)
    for name, label in entities.items():
        print(f"  [{label:8s}] {name}")

    print(f"\n{'='*60}")
    print("步骤 2: 关系抽取")
    print(f"{'='*60}")
    relations = extract_relations(SAMPLE_DOCUMENT)
    for subj, pred, obj in relations:
        print(f"  ({subj}, {pred}, {obj})")

    print(f"\n{'='*60}")
    print("步骤 3: 构建知识图谱")
    print(f"{'='*60}")
    G = build_graph(entities, relations)
    print_graph_stats(G)

    print(f"\n{'='*60}")
    print("步骤 4: 可视化")
    print(f"{'='*60}")
    visualize_graph(G)

    print(f"\n{'='*60}")
    print("步骤 5: 导出为 JSON")
    print(f"{'='*60}")
    export_to_json(G)

    print(f"\n{'='*60}")
    print("知识图谱构建完成!")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
