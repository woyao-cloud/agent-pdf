"""
知识图谱 Q&A 系统演示
=====================
展示基于知识图谱的智能问答系统：
  1. 构建企业知识图谱（部门、员工、项目、技能）
  2. 使用 LLM 将自然语言翻译为 Gremlin 查询
  3. 在图数据库上执行查询并格式化结果
  4. 多跳推理：如"查找使用技术 X 的项目的员工"

用法：
  python 03_knowledge_graph_qa.py [--mock-llm] [--endpoint <neptune-endpoint>]
  
  --mock-llm : 使用模拟 LLM 翻译（无需 API key）
"""

import argparse
import json
import re
from typing import Any, Dict, List, Optional, Tuple


# ============================================================
# 模拟图数据库（同前）
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
            for e in self.query_edges(label=edge_label, outV=vid):
                n = self.get_vertex(e.inV)
                if n:
                    neighbors.append(n)
        else:
            for e in self.query_edges(label=edge_label, inV=vid):
                n = self.get_vertex(e.outV)
                if n:
                    neighbors.append(n)
        return neighbors


# ============================================================
# 企业知识图谱构建
# ============================================================

def build_enterprise_kg() -> MockGraph:
    """
    构建企业知识图谱：
    - 部门 (Department): 工程部、市场部、销售部、HR、财务部
    - 员工 (Employee): 带职位、级别、技能
    - 项目 (Project): 带状态、技术栈
    - 技能 (Skill): 技术名称
    """
    g = MockGraph()

    # 部门
    eng = g.add_vertex("Department", name="工程部", code="ENG", headcount=45)
    mkt = g.add_vertex("Department", name="市场部", code="MKT", headcount=12)
    sales = g.add_vertex("Department", name="销售部", code="SAL", headcount=20)
    hr = g.add_vertex("Department", name="人力资源部", code="HR", headcount=8)
    fin = g.add_vertex("Department", name="财务部", code="FIN", headcount=10)

    # 技能
    skills = {
        "python": g.add_vertex("Skill", name="Python", category="Programming"),
        "java": g.add_vertex("Skill", name="Java", category="Programming"),
        "react": g.add_vertex("Skill", name="React", category="Frontend"),
        "aws": g.add_vertex("Skill", name="AWS", category="Cloud"),
        "k8s": g.add_vertex("Skill", name="Kubernetes", category="Infrastructure"),
        "spark": g.add_vertex("Skill", name="Apache Spark", category="Big Data"),
        "tensorflow": g.add_vertex("Skill", name="TensorFlow", category="ML"),
        "docker": g.add_vertex("Skill", name="Docker", category="Infrastructure"),
        "sql": g.add_vertex("Skill", name="SQL", category="Database"),
        "nosql": g.add_vertex("Skill", name="NoSQL", category="Database"),
    }

    # 员工
    employees_data = [
        ("张三", "高级工程师", "L5", eng.id, ["python", "aws", "k8s"]),
        ("李四", "工程师", "L4", eng.id, ["java", "docker"]),
        ("王五", "技术经理", "L6", eng.id, ["python", "aws", "tensorflow"]),
        ("赵六", "工程师", "L4", eng.id, ["react", "python"]),
        ("孙七", "数据工程师", "L5", eng.id, ["spark", "sql", "python"]),
        ("周八", "市场总监", "L6", mkt.id, []),
        ("吴九", "销售经理", "L5", sales.id, []),
        ("郑十", "HR 经理", "L5", hr.id, []),
        ("陈十一", "财务经理", "L5", fin.id, ["sql"]),
        ("刘十二", "工程师", "L4", eng.id, ["java", "nosql", "k8s"]),
    ]

    employees = {}
    for name, title, level, dept_id, skill_names in employees_data:
        emp = g.add_vertex("Employee", name=name, title=title, level=level)
        employees[name] = emp
        g.add_edge("belongs_to", emp.id, dept_id)
        for sn in skill_names:
            if sn in skills:
                g.add_edge("has_skill", emp.id, skills[sn].id)

    # 项目
    projects_data = [
        ("云平台迁移", "进行中", "2024-Q1", ["aws", "k8s", "docker"]),
        ("AI 客服系统", "进行中", "2024-Q2", ["python", "tensorflow"]),
        ("数据湖建设", "规划中", "2024-Q3", ["spark", "sql"]),
        ("移动端改版", "进行中", "2024-Q1", ["react"]),
        ("内部管理系统", "已完成", "2023-Q4", ["java", "nosql"]),
    ]

    projects = {}
    for pname, status, quarter, techs in projects_data:
        proj = g.add_vertex("Project", name=pname, status=status, quarter=quarter)
        projects[pname] = proj
        for t in techs:
            if t in skills:
                g.add_edge("uses_technology", proj.id, skills[t].id)

    # 员工参与项目
    assignments = [
        ("张三", "云平台迁移", "负责人"),
        ("李四", "云平台迁移", "开发"),
        ("王五", "AI 客服系统", "负责人"),
        ("赵六", "移动端改版", "开发"),
        ("孙七", "数据湖建设", "负责人"),
        ("刘十二", "内部管理系统", "开发"),
        ("张三", "AI 客服系统", "架构师"),
    ]

    for emp_name, proj_name, role in assignments:
        if emp_name in employees and proj_name in projects:
            g.add_edge("works_on", employees[emp_name].id, projects[proj_name].id, role=role)

    print(f"[INFO] 企业知识图谱构建完成: {len(g.vertices)} 个顶点, {len(g.edges)} 条边")
    return g, employees, projects, skills


# ============================================================
# 自然语言 → Gremlin 翻译
# ============================================================

class MockNL2Gremlin:
    """模拟自然语言到 Gremlin 的翻译"""

    def translate(self, question: str) -> str:
        q = question.lower()

        if "部门" in q and "员工" in q:
            return self._query_employees_in_department(question)
        if "技能" in q and "员工" in q:
            return self._query_employees_with_skill(question)
        if "项目" in q and "技术" in q:
            return self._query_projects_with_technology(question)
        if "员工" in q and "项目" in q:
            return self._query_employees_on_project(question)
        if "多跳" in q or "使用" in q:
            return self._query_multi_hop(question)
        return "g.V().limit(10)"

    def _query_employees_in_department(self, question: str) -> str:
        return (
            "g.V().hasLabel('Department').has('name','工程部')"
            ".in('belongs_to').hasLabel('Employee')"
            ".values('name','title','level')"
        )

    def _query_employees_with_skill(self, question: str) -> str:
        return (
            "g.V().hasLabel('Skill').has('name','Python')"
            ".in('has_skill').hasLabel('Employee')"
            ".values('name','title')"
        )

    def _query_projects_with_technology(self, question: str) -> str:
        return (
            "g.V().hasLabel('Skill').has('name','Kubernetes')"
            ".in('uses_technology').hasLabel('Project')"
            ".values('name','status')"
        )

    def _query_employees_on_project(self, question: str) -> str:
        return (
            "g.V().hasLabel('Project').has('name','云平台迁移')"
            ".in('works_on').hasLabel('Employee')"
            ".values('name','role')"
        )

    def _query_multi_hop(self, question: str) -> str:
        return (
            "g.V().hasLabel('Skill').has('name','Python')"
            ".in('uses_technology').hasLabel('Project')"
            ".in('works_on').hasLabel('Employee')"
            ".dedup().values('name','title')"
        )


class RealNL2Gremlin:
    """使用 LLM 将自然语言翻译为 Gremlin 查询"""

    def __init__(self, provider: str = "openai"):
        self.provider = provider
        if provider == "openai":
            self._init_openai()
        else:
            self._init_anthropic()

    def _init_openai(self):
        import os
        from openai import OpenAI
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = "gpt-4o-mini"

    def _init_anthropic(self):
        import os
        import anthropic
        self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model = "claude-3-haiku-20240307"

    def translate(self, question: str) -> str:
        prompt = f"""你是一个 Gremlin 查询生成器。请将以下自然语言问题转换为 Gremlin 查询。

图结构：
- 顶点标签: Department, Employee, Project, Skill
- 边标签: belongs_to (Employee->Department), has_skill (Employee->Skill), 
           works_on (Employee->Project), uses_technology (Project->Skill)
- 属性: Employee(name, title, level), Department(name, code), 
         Project(name, status, quarter), Skill(name, category)

问题: {question}

请只返回 Gremlin 查询语句，不要额外解释。"""

        if self.provider == "openai":
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
            )
            return resp.choices[0].message.content.strip()
        else:
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.content[0].text.strip()


# ============================================================
# Gremlin 查询执行器（模拟）
# ============================================================

class MockGremlinExecutor:
    """在模拟图上执行 Gremlin 查询"""

    def __init__(self, graph: MockGraph):
        self.graph = graph

    def execute(self, query: str) -> List[Any]:
        q = query.strip()
        results = []

        # 解析 .values(...)
        val_match = re.search(r"values\(([^)]+)\)", q)
        value_keys = []
        if val_match:
            raw = val_match.group(1)
            value_keys = [v.strip().strip("'\"") for v in raw.split(",")]

        # 解析 .hasLabel('xxx')
        label_match = re.search(r"hasLabel\('([^']+)'\)", q)
        label = label_match.group(1) if label_match else None

        # 解析 .has('key','value')
        filters = {}
        for m in re.finditer(r"has\('([^']+)','([^']+)'\)", q):
            filters[m.group(1)] = m.group(2)

        # 解析 .in('xxx') / .out('xxx') 链
        steps = re.findall(r"(\.in|\.out)\('([^']+)'\)", q)

        # 从 V() 开始
        if "V()" in q or "V(" in q:
            candidates = self.graph.query_vertices(label=label, **filters)
        else:
            candidates = list(self.graph.vertices.values())
            if label:
                candidates = [v for v in candidates if v.label == label]
            for k, v in filters.items():
                candidates = [c for c in candidates if c.properties.get(k) == v]

        # 执行遍历步骤
        current = candidates
        for direction, edge_label in steps:
            next_set = []
            for v in current:
                if direction == ".out":
                    for e in self.graph.query_edges(label=edge_label, outV=v.id):
                        n = self.graph.get_vertex(e.inV)
                        if n:
                            next_set.append(n)
                else:
                    for e in self.graph.query_edges(label=edge_label, inV=v.id):
                        n = self.graph.get_vertex(e.outV)
                        if n:
                            next_set.append(n)
            current = next_set

        # 去重
        seen = set()
        deduped = []
        for v in current:
            if v.id not in seen:
                seen.add(v.id)
                deduped.append(v)
        current = deduped

        # 提取值
        if value_keys:
            for v in current:
                row = tuple(v.properties.get(k, "") for k in value_keys)
                results.append(row)
        else:
            results = current

        return results


# ============================================================
# 结果格式化
# ============================================================

def format_results(results: List[Any], question: str) -> str:
    """将查询结果格式化为可读文本"""
    if not results:
        return "未找到匹配结果。"

    lines = [f"查询结果（共 {len(results)} 条）:"]
    lines.append("")

    if isinstance(results[0], tuple):
        # 多值结果
        for i, row in enumerate(results):
            lines.append(f"  [{i+1}] {' | '.join(str(v) for v in row)}")
    elif isinstance(results[0], MockVertex):
        for i, v in enumerate(results):
            props = ", ".join(f"{k}={v}" for k, v in v.properties.items())
            lines.append(f"  [{i+1}] {v.label}: {props}")
    else:
        for i, r in enumerate(results):
            lines.append(f"  [{i+1}] {r}")

    return "\n".join(lines)


# ============================================================
# 主演示
# ============================================================

def run_demo(mock_llm: bool = True):
    print("=" * 60)
    print("  知识图谱 Q&A 系统演示")
    print("=" * 60)

    # 1. 构建企业知识图谱
    print("\n[步骤 1] 构建企业知识图谱...")
    graph, employees, projects, skills = build_enterprise_kg()

    # 2. 初始化翻译器和执行器
    print("\n[步骤 2] 初始化 NL→Gremlin 翻译器和查询执行器...")
    if mock_llm:
        translator = MockNL2Gremlin()
        print("  [INFO] 使用模拟 NL→Gremlin 翻译")
    else:
        translator = RealNL2Gremlin(provider="openai")
        print("  [INFO] 使用 OpenAI GPT 进行 NL→Gremlin 翻译")

    executor = MockGremlinExecutor(graph)

    # 3. 测试问题
    questions = [
        "工程部有哪些员工？",
        "拥有 Python 技能的员工有哪些？",
        "使用 Kubernetes 的项目有哪些？",
        "参与云平台迁移项目的员工有哪些？",
        "【多跳推理】使用 Python 技术的项目的员工有哪些？",
    ]

    for i, question in enumerate(questions):
        print(f"\n{'='*50}")
        print(f"[问题 {i+1}] {question}")
        print(f"{'='*50}")

        # 翻译
        print("\n>> 翻译为 Gremlin 查询:")
        gremlin_query = translator.translate(question)
        print(f"  {gremlin_query}")

        # 执行
        print("\n>> 执行查询...")
        results = executor.execute(gremlin_query)

        # 格式化
        print("\n>> 结果:")
        print(format_results(results, question))

    # 4. 多跳推理详解
    print("\n" + "=" * 50)
    print("  多跳推理详解")
    print("=" * 50)
    print("""
多跳推理示例：查找"使用 Python 技术的项目的员工"

查询路径（3跳）:
  Skill(Python) --uses_technology--> Project --works_on--> Employee

第1跳: 找到 Python 技能顶点
第2跳: 找到使用 Python 的项目（AI 客服系统、数据湖建设等）
第3跳: 找到参与这些项目的员工（王五、孙七、张三）

优势：传统 SQL 需要多次 JOIN，Gremlin 一次遍历即可完成。
    """)

    print("=" * 60)
    print("  演示完成！")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="知识图谱 Q&A 系统演示")
    parser.add_argument("--mock-llm", action="store_true", default=True,
                        help="使用模拟 LLM 翻译（无需 API key）")
    parser.add_argument("--endpoint", type=str, default=None,
                        help="Neptune 端点（不指定则使用模拟图数据库）")
    args = parser.parse_args()

    run_demo(mock_llm=args.mock_llm)


if __name__ == "__main__":
    main()
