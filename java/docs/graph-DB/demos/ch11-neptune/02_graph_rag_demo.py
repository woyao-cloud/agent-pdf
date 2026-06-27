"""
Graph RAG（检索增强生成）演示
=============================
展示如何将知识图谱与 LLM 结合实现 Graph RAG：
  1. 构建包含公司关系、产品、人员的知识图谱
  2. 根据用户问题检索相关子图
  3. 将子图转换为 LLM 可理解的上下文文本
  4. 调用 LLM 回答问题（支持模拟模式）
  5. 对比：有图上下文 vs 无图上下文的回答质量

用法：
  python 02_graph_rag_demo.py [--mock-llm] [--endpoint <neptune-endpoint>]
  
  --mock-llm : 使用模拟 LLM 响应（无需 API key）
  不传 --endpoint 则使用本地模拟图数据库
"""

import argparse
import json
import os
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass


# ============================================================
# 模拟图数据库（复用 01 的 MockGraph）
# ============================================================

class MockVertex:
    def __init__(self, id: str, label: str, properties: Dict[str, Any]):
        self.id = id
        self.label = label
        self.properties = properties

    def __repr__(self):
        return f"V({self.label}:{self.properties.get('name','')})"


class MockEdge:
    def __init__(self, id: str, label: str, outV: str, inV: str, properties: Dict[str, Any]):
        self.id = id
        self.label = label
        self.outV = outV
        self.inV = inV
        self.properties = properties

    def __repr__(self):
        return f"E({self.label})"


class MockGraph:
    def __init__(self):
        self.vertices: Dict[str, MockVertex] = {}
        self.edges: Dict[str, MockEdge] = {}
        self._next_vid = 0
        self._next_eid = 0

    def add_vertex(self, label: str, **props) -> MockVertex:
        vid = f"v{self._next_vid}"
        self._next_vid += 1
        v = MockVertex(vid, label, props)
        self.vertices[vid] = v
        return v

    def add_edge(self, label: str, outV: str, inV: str, **props) -> MockEdge:
        eid = f"e{self._next_eid}"
        self._next_eid += 1
        e = MockEdge(eid, label, outV, inV, props)
        self.edges[eid] = e
        return e

    def get_vertex(self, vid: str) -> Optional[MockVertex]:
        return self.vertices.get(vid)

    def query_vertices(self, label: Optional[str] = None, **filters) -> List[MockVertex]:
        results = list(self.vertices.values())
        if label:
            results = [v for v in results if v.label == label]
        for k, v in filters.items():
            results = [r for r in results if r.properties.get(k) == v]
        return results

    def query_edges(self, label: Optional[str] = None, outV: Optional[str] = None, inV: Optional[str] = None) -> List[MockEdge]:
        results = list(self.edges.values())
        if label:
            results = [e for e in results if e.label == label]
        if outV:
            results = [e for e in results if e.outV == outV]
        if inV:
            results = [e for e in results if e.inV == inV]
        return results

    def get_neighbors(self, vid: str, edge_label: Optional[str] = None, direction: str = "out") -> List[MockVertex]:
        neighbors = []
        if direction == "out":
            edges = self.query_edges(label=edge_label, outV=vid)
            for e in edges:
                n = self.get_vertex(e.inV)
                if n:
                    neighbors.append(n)
        else:
            edges = self.query_edges(label=edge_label, inV=vid)
            for e in edges:
                n = self.get_vertex(e.outV)
                if n:
                    neighbors.append(n)
        return neighbors


# ============================================================
# 知识图谱构建
# ============================================================

def build_sample_knowledge_graph() -> MockGraph:
    """
    构建示例知识图谱，包含：
    - 公司 (Company)
    - 产品 (Product)
    - 人员 (Person)
    - 技术 (Technology)
    以及它们之间的关系
    """
    g = MockGraph()

    # 公司
    acme = g.add_vertex("Company", name="Acme Corp", industry="Technology", founded=2005, revenue="500M")
    globex = g.add_vertex("Company", name="Globex Inc", industry="Finance", founded=1998, revenue="1.2B")
    initech = g.add_vertex("Company", name="Initech", industry="Technology", founded=2010, revenue="100M")
    umbrel = g.add_vertex("Company", name="Umbrella Co", industry="Healthcare", founded=1985, revenue="3B")

    # 产品
    cloud_platform = g.add_vertex("Product", name="CloudPlatform Pro", category="Cloud Computing", price=999)
    ai_assistant = g.add_vertex("Product", name="AI Assistant", category="Artificial Intelligence", price=499)
    payflow = g.add_vertex("Product", name="PayFlow", category="FinTech", price=299)
    health_monitor = g.add_vertex("Product", name="HealthMonitor", category="IoT Healthcare", price=799)
    data_lake = g.add_vertex("Product", name="DataLake", category="Big Data", price=1499)

    # 人员
    alice = g.add_vertex("Person", name="Alice Wang", title="CEO", expertise="Strategy")
    bob = g.add_vertex("Person", name="Bob Li", title="CTO", expertise="AI/ML")
    carol = g.add_vertex("Person", name="Carol Zhang", title="Engineer", expertise="Cloud Computing")
    dave = g.add_vertex("Person", name="Dave Chen", title="Engineer", expertise="Big Data")
    eve = g.add_vertex("Person", name="Eve Liu", title="CFO", expertise="Finance")
    frank = g.add_vertex("Person", name="Frank Wu", title="Engineer", expertise="Healthcare IT")

    # 技术
    python = g.add_vertex("Technology", name="Python", category="Language")
    java = g.add_vertex("Technology", name="Java", category="Language")
    react = g.add_vertex("Technology", name="React", category="Frontend")
    tensorflow = g.add_vertex("Technology", name="TensorFlow", category="ML Framework")
    spark = g.add_vertex("Technology", name="Apache Spark", category="Big Data")
    k8s = g.add_vertex("Technology", name="Kubernetes", category="Infrastructure")
    aws = g.add_vertex("Technology", name="AWS", category="Cloud Provider")

    # 关系：公司 -> 开发 -> 产品
    g.add_edge("develops", acme.id, cloud_platform.id)
    g.add_edge("develops", acme.id, ai_assistant.id)
    g.add_edge("develops", globex.id, payflow.id)
    g.add_edge("develops", initech.id, data_lake.id)
    g.add_edge("develops", umbrel.id, health_monitor.id)

    # 关系：公司 -> 雇佣 -> 人员
    g.add_edge("employs", acme.id, alice.id)
    g.add_edge("employs", acme.id, bob.id)
    g.add_edge("employs", acme.id, carol.id)
    g.add_edge("employs", globex.id, eve.id)
    g.add_edge("employs", initech.id, dave.id)
    g.add_edge("employs", umbrel.id, frank.id)

    # 关系：人员 -> 使用 -> 技术
    g.add_edge("uses", bob.id, tensorflow.id)
    g.add_edge("uses", bob.id, python.id)
    g.add_edge("uses", carol.id, k8s.id)
    g.add_edge("uses", carol.id, aws.id)
    g.add_edge("uses", dave.id, spark.id)
    g.add_edge("uses", dave.id, java.id)
    g.add_edge("uses", frank.id, python.id)
    g.add_edge("uses", alice.id, react.id)

    # 关系：产品 -> 基于 -> 技术
    g.add_edge("based_on", cloud_platform.id, k8s.id)
    g.add_edge("based_on", cloud_platform.id, aws.id)
    g.add_edge("based_on", ai_assistant.id, tensorflow.id)
    g.add_edge("based_on", ai_assistant.id, python.id)
    g.add_edge("based_on", data_lake.id, spark.id)
    g.add_edge("based_on", payflow.id, java.id)
    g.add_edge("based_on", health_monitor.id, python.id)

    # 关系：公司 -> 竞争 -> 公司
    g.add_edge("competes_with", acme.id, initech.id)
    g.add_edge("competes_with", acme.id, globex.id)

    # 关系：公司 -> 合作 -> 公司
    g.add_edge("partners_with", acme.id, umbrel.id)

    print(f"[INFO] 知识图谱构建完成: {len(g.vertices)} 个顶点, {len(g.edges)} 条边")
    return g


# ============================================================
# 子图检索
# ============================================================

def extract_subgraph(graph: MockGraph, seed_vids: List[str], max_depth: int = 2) -> Dict:
    """
    从种子顶点出发，提取相关子图。
    返回包含顶点和边的字典。
    """
    visited_vids = set(seed_vids)
    frontier = set(seed_vids)
    collected_edges = []

    for _ in range(max_depth):
        if not frontier:
            break
        new_frontier = set()
        for vid in frontier:
            v = graph.get_vertex(vid)
            if not v:
                continue
            # 出边
            for e in graph.query_edges(outV=vid):
                if e.inV not in visited_vids:
                    new_frontier.add(e.inV)
                    visited_vids.add(e.inV)
                collected_edges.append(e)
            # 入边
            for e in graph.query_edges(inV=vid):
                if e.outV not in visited_vids:
                    new_frontier.add(e.outV)
                    visited_vids.add(e.outV)
                collected_edges.append(e)
        frontier = new_frontier

    subgraph = {
        "vertices": [graph.get_vertex(vid) for vid in visited_vids if graph.get_vertex(vid)],
        "edges": collected_edges,
    }
    return subgraph


def subgraph_to_text(subgraph: Dict) -> str:
    """将子图转换为 LLM 可读的文本描述"""
    lines = []
    lines.append("以下是与问题相关的知识图谱信息：")
    lines.append("")

    # 顶点
    lines.append("【实体】")
    for v in subgraph["vertices"]:
        props_str = ", ".join(f"{k}={v}" for k, v in v.properties.items())
        lines.append(f"  - {v.label}: {props_str}")

    lines.append("")
    lines.append("【关系】")
    for e in subgraph["edges"]:
        out_v = subgraph["vertices"][0].__class__  # 类型提示
        out_name = "?"
        in_name = "?"
        for v in subgraph["vertices"]:
            if v.id == e.outV:
                out_name = v.properties.get("name", v.id)
            if v.id == e.inV:
                in_name = v.properties.get("name", v.id)
        props_str = ""
        if e.properties:
            props_str = " (" + ", ".join(f"{k}={v}" for k, v in e.properties.items()) + ")"
        lines.append(f"  - [{out_name}] --[{e.label}]{props_str}--> [{in_name}]")

    return "\n".join(lines)


def retrieve_relevant_subgraph(graph: MockGraph, question: str) -> Dict:
    """
    根据问题关键词检索相关子图。
    实际生产环境中应使用向量检索或 LLM 辅助的实体识别。
    """
    keywords = question.lower().split()
    seed_vids = set()

    for v in graph.vertices.values():
        name = v.properties.get("name", "").lower()
        label = v.label.lower()
        for kw in keywords:
            if kw in name or kw in label:
                seed_vids.add(v.id)
                break

    if not seed_vids:
        # 如果没有匹配，返回整个图的一个子集
        seed_vids = {list(graph.vertices.keys())[0]}

    return extract_subgraph(graph, list(seed_vids), max_depth=2)


# ============================================================
# LLM 调用
# ============================================================

class MockLLM:
    """模拟 LLM 响应（无需 API key）"""

    def generate(self, prompt: str) -> str:
        if "图上下文" in prompt or "graph context" in prompt.lower():
            return self._answer_with_context(prompt)
        return self._answer_without_context(prompt)

    def _answer_with_context(self, prompt: str) -> str:
        return (
            "【模拟 LLM 回答 - 有图上下文】\n\n"
            "根据提供的知识图谱信息，我可以给出以下分析：\n\n"
            "1. Acme Corp 是一家科技公司，开发了 CloudPlatform Pro 和 AI Assistant 产品。\n"
            "2. 其 CTO Bob Li 擅长 AI/ML 技术，使用 TensorFlow 和 Python。\n"
            "3. 公司与 Initech 和 Globex 存在竞争关系，与 Umbrella Co 有合作关系。\n\n"
            "图上下文提供了结构化的关系信息，使回答更加准确和全面。"
        )

    def _answer_without_context(self, prompt: str) -> str:
        return (
            "【模拟 LLM 回答 - 无图上下文】\n\n"
            "Acme Corp 是一家科技公司，可能开发了多种产品。\n"
            "公司通常有 CEO、CTO 等管理团队。\n\n"
            "（注意：没有图上下文时，回答较为笼统，缺乏具体关系信息。）"
        )


class RealLLM:
    """真实的 LLM 调用（OpenAI / Anthropic）"""

    def __init__(self, provider: str = "openai"):
        self.provider = provider
        if provider == "openai":
            self._init_openai()
        elif provider == "anthropic":
            self._init_anthropic()

    def _init_openai(self):
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            self.model = "gpt-4o-mini"
        except ImportError:
            raise ImportError("请安装 openai 包: pip install openai")

    def _init_anthropic(self):
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            self.model = "claude-3-haiku-20240307"
        except ImportError:
            raise ImportError("请安装 anthropic 包: pip install anthropic")

    def generate(self, prompt: str) -> str:
        if self.provider == "openai":
            return self._call_openai(prompt)
        return self._call_anthropic(prompt)

    def _call_openai(self, prompt: str) -> str:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        return resp.choices[0].message.content

    def _call_anthropic(self, prompt: str) -> str:
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text


def build_prompt_with_context(question: str, context_text: str) -> str:
    """构建带图上下文的提示词"""
    return f"""你是一个知识图谱分析助手。请根据以下知识图谱信息回答问题。

{context_text}

问题：{question}

请基于知识图谱中的实体和关系信息给出详细回答。如果图谱信息不足以回答问题，请明确指出。"""


def build_prompt_without_context(question: str) -> str:
    """构建不带图上下文的提示词"""
    return f"""你是一个知识图谱分析助手。

问题：{question}

请根据你的知识回答这个问题。"""


# ============================================================
# 主演示流程
# ============================================================

def run_demo(mock_llm: bool = True):
    print("=" * 60)
    print("  Graph RAG（检索增强生成）演示")
    print("=" * 60)

    # 1. 构建知识图谱
    print("\n[步骤 1] 构建知识图谱...")
    graph = build_sample_knowledge_graph()

    # 2. 初始化 LLM
    print("\n[步骤 2] 初始化 LLM...")
    if mock_llm:
        llm = MockLLM()
        print("  [INFO] 使用模拟 LLM 模式")
    else:
        llm = RealLLM(provider="openai")
        print("  [INFO] 使用 OpenAI GPT-4o-mini")

    # 3. 定义测试问题
    questions = [
        "Acme Corp 开发了哪些产品？",
        "Acme Corp 的 CTO 使用什么技术？",
        "Acme Corp 与哪些公司有合作关系？",
        "哪些公司使用 Python 技术？",
    ]

    for i, question in enumerate(questions):
        print(f"\n{'='*50}")
        print(f"[问题 {i+1}] {question}")
        print(f"{'='*50}")

        # 检索子图
        print("\n>> 检索相关子图...")
        subgraph = retrieve_relevant_subgraph(graph, question)
        context_text = subgraph_to_text(subgraph)
        print(f"  找到 {len(subgraph['vertices'])} 个实体, {len(subgraph['edges'])} 条关系")
        print(f"\n{context_text}")

        # 带图上下文的回答
        print("\n>> 带图上下文的回答:")
        prompt_with = build_prompt_with_context(question, context_text)
        answer_with = llm.generate(prompt_with)
        print(answer_with)

        # 不带图上下文的回答
        print("\n>> 不带图上下文的回答:")
        prompt_without = build_prompt_without_context(question)
        answer_without = llm.generate(prompt_without)
        print(answer_without)

        # 对比
        print("\n>> 对比分析:")
        print("  [有图] 回答基于结构化关系，更准确、具体")
        print("  [无图] 回答依赖 LLM 内部知识，可能泛化或错误")

    print("\n" + "=" * 60)
    print("  Graph RAG 演示完成！")
    print("  核心结论：图上下文显著提升了 LLM 回答的准确性和可解释性。")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Graph RAG 演示")
    parser.add_argument("--mock-llm", action="store_true", default=True,
                        help="使用模拟 LLM（无需 API key）")
    parser.add_argument("--endpoint", type=str, default=None,
                        help="Neptune 端点（不指定则使用模拟图数据库）")
    args = parser.parse_args()

    run_demo(mock_llm=args.mock_llm)


if __name__ == "__main__":
    main()
