"""
04 - 知识图谱查询与推理演示
路径查询、规则推理、社区发现
"""

import networkx as nx
import matplotlib.pyplot as plt
import matplotlib
import json
from collections import defaultdict


matplotlib.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'DejaVu Sans']
matplotlib.rcParams['axes.unicode_minus'] = False


def build_sample_kg():
    G = nx.MultiDiGraph()

    entities = {
        "马云": "PERSON", "马化腾": "PERSON", "张一鸣": "PERSON",
        "李彦宏": "PERSON", "雷军": "PERSON", "任正非": "PERSON",
        "王兴": "PERSON", "张勇": "PERSON", "梁汝波": "PERSON",
        "孟晚舟": "PERSON", "曾毓群": "PERSON",
        "阿里巴巴": "ORG", "腾讯": "ORG", "字节跳动": "ORG",
        "百度": "ORG", "小米": "ORG", "华为": "ORG",
        "美团": "ORG", "宁德时代": "ORG",
        "杭州": "GPE", "深圳": "GPE", "北京": "GPE",
        "上海": "GPE", "宁德": "GPE",
    }

    for name, etype in entities.items():
        G.add_node(name, type=etype)

    relations = [
        ("马云", "founded", "阿里巴巴"),
        ("马化腾", "founded", "腾讯"),
        ("张一鸣", "founded", "字节跳动"),
        ("李彦宏", "founded", "百度"),
        ("雷军", "founded", "小米"),
        ("任正非", "founded", "华为"),
        ("王兴", "founded", "美团"),
        ("张勇", "works_at", "阿里巴巴"),
        ("梁汝波", "works_at", "字节跳动"),
        ("孟晚舟", "works_at", "华为"),
        ("曾毓群", "works_at", "宁德时代"),
        ("阿里巴巴", "located_in", "杭州"),
        ("腾讯", "located_in", "深圳"),
        ("字节跳动", "located_in", "北京"),
        ("百度", "located_in", "北京"),
        ("小米", "located_in", "北京"),
        ("华为", "located_in", "深圳"),
        ("美团", "located_in", "北京"),
        ("宁德时代", "located_in", "宁德"),
        ("阿里巴巴", "owns", "阿里云"),
        ("腾讯", "owns", "微信"),
        ("字节跳动", "owns", "抖音"),
        ("百度", "owns", "文心一言"),
        ("小米", "owns", "小米汽车"),
        ("华为", "owns", "鸿蒙OS"),
        ("宁德时代", "cooperates_with", "特斯拉"),
        ("宁德时代", "cooperates_with", "宝马"),
        ("阿里巴巴", "cooperates_with", "腾讯"),
    ]

    for subj, pred, obj in relations:
        if subj in G and obj in G:
            G.add_edge(subj, obj, relation=pred)

    return G


def path_query_find_people_working_at_founded_by(G, founder_name):
    print(f"\n{'='*70}")
    print(f"路径查询: 找出所有在 {founder_name} 创立的公司工作的人")
    print(f"{'='*70}")

    companies_founded = []
    for _, v, d in G.out_edges(founder_name, data=True):
        if d.get('relation') == 'founded':
            companies_founded.append(v)

    if not companies_founded:
        print(f"  {founder_name} 未创立任何公司")
        return []

    print(f"  {founder_name} 创立的公司: {', '.join(companies_founded)}")

    results = []
    for company in companies_founded:
        for u, _, d in G.in_edges(company, data=True):
            if d.get('relation') == 'works_at' and u != founder_name:
                results.append((u, company))
                print(f"  → {u} 在 {company} 工作")

    if not results:
        print(f"  (未找到在相关公司工作的其他人)")

    return results


def rule_based_inference(G):
    print(f"\n{'='*70}")
    print("规则推理: 如果 A works_at B 且 B located_in C, 则 A works_in C")
    print(f"{'='*70}")

    inferred_edges = []

    for person in G.nodes():
        for _, company, d1 in G.out_edges(person, data=True):
            if d1.get('relation') != 'works_at':
                continue
            for _, location, d2 in G.out_edges(company, data=True):
                if d2.get('relation') != 'located_in':
                    continue
                inferred_edges.append((person, "works_in", location))

    for subj, pred, obj in inferred_edges:
        print(f"  [推理] ({subj}, {pred}, {obj})")

    print(f"\n  共推理出 {len(inferred_edges)} 条新关系")
    return inferred_edges


def shortest_path_query(G, source, target):
    print(f"\n{'='*70}")
    print(f"最短路径查询: 从 '{source}' 到 '{target}'")
    print(f"{'='*70}")

    try:
        path = nx.shortest_path(G.to_undirected(), source=source, target=target)
        print(f"  路径长度: {len(path) - 1} 步")
        print(f"  路径: ", end="")
        for i, node in enumerate(path):
            if i > 0:
                edge_data = G.get_edge_data(path[i - 1], node)
                if edge_data:
                    rel = edge_data[0].get('relation', '?')
                    print(f" --[{rel}]--> ", end="")
                else:
                    edge_data = G.get_edge_data(node, path[i - 1])
                    if edge_data:
                        rel = edge_data[0].get('relation', '?')
                        print(f" <--[{rel}]-- ", end="")
                    else:
                        print(" --[?]--> ", end="")
            print(node, end="")
        print()
        return path
    except (nx.NetworkXNoPath, nx.NodeNotFound) as e:
        print(f"  ✗ 未找到路径: {e}")
        return None


def community_detection(G):
    print(f"\n{'='*70}")
    print("社区发现 (基于连通分量)")
    print(f"{'='*70}")

    undirected = G.to_undirected()
    communities = list(nx.connected_components(undirected))

    print(f"  发现 {len(communities)} 个社区:")
    for i, community in enumerate(communities, 1):
        person_nodes = [n for n in community if G.nodes[n].get('type') == 'PERSON']
        org_nodes = [n for n in community if G.nodes[n].get('type') == 'ORG']
        gpe_nodes = [n for n in community if G.nodes[n].get('type') == 'GPE']
        print(f"\n  社区 {i} (共 {len(community)} 个节点):")
        if person_nodes:
            print(f"    人物: {', '.join(person_nodes)}")
        if org_nodes:
            print(f"    组织: {', '.join(org_nodes)}")
        if gpe_nodes:
            print(f"    地点: {', '.join(gpe_nodes)}")

    return list(communities)


def visualize_with_communities(G, communities):
    fig, ax = plt.subplots(figsize=(14, 10))

    pos = nx.spring_layout(G, k=2, iterations=50, seed=42)

    community_colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f39c12", "#9b59b6", "#2ecc71"]
    node_colors = {}
    for i, community in enumerate(communities):
        color = community_colors[i % len(community_colors)]
        for node in community:
            node_colors[node] = color

    colors = [node_colors.get(n, "#dfe6e9") for n in G.nodes()]
    nx.draw_networkx_nodes(G, pos, node_color=colors, node_size=2000, ax=ax)
    nx.draw_networkx_labels(G, pos, font_size=10, ax=ax)

    nx.draw_networkx_edges(G, pos, width=1.5, arrows=True, arrowsize=15,
                           connectionstyle='arc3,rad=0.1', ax=ax)

    ax.set_title("知识图谱社区结构", fontsize=16, fontweight='bold')
    ax.axis('off')
    plt.tight_layout()
    plt.savefig("kg_communities.png", dpi=150, bbox_inches='tight')
    print(f"\n✓ 社区结构图已保存为 kg_communities.png")
    plt.show()


def main():
    print("=" * 60)
    print("  知识图谱查询与推理演示")
    print("=" * 60)

    G = build_sample_kg()
    print(f"✓ 知识图谱加载完成: {G.number_of_nodes()} 节点, {G.number_of_edges()} 边")

    path_query_find_people_working_at_founded_by(G, "马云")
    path_query_find_people_working_at_founded_by(G, "张一鸣")

    rule_based_inference(G)

    shortest_path_query(G, "雷军", "宁德")
    shortest_path_query(G, "张一鸣", "腾讯")

    communities = community_detection(G)

    visualize_with_communities(G, communities)

    print(f"\n{'='*60}")
    print("查询与推理演示完成!")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
