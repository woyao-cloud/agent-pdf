"""
Neptune Gremlin 基础操作演示
============================
演示如何连接 Amazon Neptune 并使用 Gremlin 进行图数据库的增删改查。
支持两种模式：
  1. 真实模式：连接远程 Neptune 集群
  2. 模拟模式：使用本地 in-memory TinkerGraph（无需外部服务）

用法：
  python 01_neptune_gremlin_basics.py [--endpoint <neptune-endpoint>] [--port 8182]
  
  不传 --endpoint 则自动进入模拟模式。
"""

import argparse
import sys
import json
from typing import Any, Dict, List, Optional


# ============================================================
# 模拟 Gremlin 客户端（基于 in-memory TinkerGraph）
# ============================================================

class MockVertex:
    """模拟顶点"""
    def __init__(self, id: str, label: str, properties: Dict[str, Any]):
        self.id = id
        self.label = label
        self.properties = properties

    def __repr__(self):
        return f"Vertex({self.id}, {self.label})"


class MockEdge:
    """模拟边"""
    def __init__(self, id: str, label: str, outV: str, inV: str, properties: Dict[str, Any]):
        self.id = id
        self.label = label
        self.outV = outV
        self.inV = inV
        self.properties = properties

    def __repr__(self):
        return f"Edge({self.id}, {self.label})"


class MockGraph:
    """内存图数据库模拟"""

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

    def get_edge(self, eid: str) -> Optional[MockEdge]:
        return self.edges.get(eid)

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

    def delete_vertex(self, vid: str) -> bool:
        if vid in self.vertices:
            # 删除关联边
            self.edges = {k: v for k, v in self.edges.items() if v.outV != vid and v.inV != vid}
            del self.vertices[vid]
            return True
        return False

    def delete_edge(self, eid: str) -> bool:
        if eid in self.edges:
            del self.edges[eid]
            return True
        return False

    def update_vertex(self, vid: str, **props) -> bool:
        v = self.vertices.get(vid)
        if not v:
            return False
        v.properties.update(props)
        return True


# ============================================================
# Gremlin 客户端封装
# ============================================================

class GremlinClient:
    """统一的 Gremlin 客户端接口，支持真实和模拟模式"""

    def __init__(self, endpoint: Optional[str] = None, port: int = 8182):
        self.endpoint = endpoint
        self.port = port
        self.mock = MockGraph()
        self._mode = "mock"

        if endpoint:
            self._init_real_client()
        else:
            print("[INFO] 未指定 Neptune 端点，使用模拟模式（in-memory TinkerGraph）")

    def _init_real_client(self):
        """初始化真实 Neptune 连接"""
        try:
            from gremlin_python.driver import client as gremlin_client
            from gremlin_python.driver.serializer import GraphSONSerializersV3d0
            self._real_client = gremlin_client.Client(
                f"wss://{self.endpoint}:{self.port}/gremlin",
                "g",
                message_serializer=GraphSONSerializersV3d0()
            )
            self._mode = "real"
            print(f"[INFO] 已连接到 Neptune: {self.endpoint}:{self.port}")
        except Exception as e:
            print(f"[WARN] 无法连接到 Neptune ({e})，回退到模拟模式")
            self._mode = "mock"

    def submit(self, query: str, bindings: Optional[Dict[str, Any]] = None) -> List[Any]:
        """提交 Gremlin 查询"""
        if self._mode == "real":
            return self._real_client.submit(query, bindings).all().result()
        return self._execute_mock(query, bindings or {})

    def close(self):
        if self._mode == "real":
            self._real_client.close()

    # ---- 模拟模式下的 Gremlin 查询解析 ----

    def _execute_mock(self, query: str, bindings: Dict[str, Any]) -> List[Any]:
        """解析并执行简化的 Gremlin 查询（模拟模式）"""
        q = query.strip()

        # 替换绑定变量
        for k, v in bindings.items():
            q = q.replace(k, repr(v) if isinstance(v, str) else str(v))

        # addV / addVertex
        if q.upper().startswith("G.ADDV") or q.upper().startswith("G.ADD_VERTEX"):
            return self._mock_add_vertex(q)

        # addE / addEdge
        if q.upper().startswith("G.ADDE") or q.upper().startswith("G.ADD_EDGE"):
            return self._mock_add_edge(q)

        # V() 查询
        if q.upper().startswith("G.V()") or q.upper().startswith("G.V("):
            return self._mock_query_vertices(q)

        # E() 查询
        if q.upper().startswith("G.E()") or q.upper().startswith("G.E("):
            return self._mock_query_edges(q)

        # 更新
        if "PROPERTY(" in q.upper() or ".PROPERTY(" in q.upper():
            return self._mock_update(q)

        # 删除
        if "DROP()" in q.upper():
            return self._mock_delete(q)

        return [f"[模拟] 未识别的查询: {q}"]

    def _mock_add_vertex(self, q: str) -> List[MockVertex]:
        """模拟 addV"""
        import re
        label_match = re.search(r"addV\('([^']+)'\)|addV\("([^"]+)"\)", q, re.IGNORECASE)
        label = label_match.group(1) or label_match.group(2) if label_match else "vertex"

        props = {}
        prop_matches = re.findall(r"property\('([^']+)','([^']+)'\)", q, re.IGNORECASE)
        for k, v in prop_matches:
            props[k] = v

        v = self.mock.add_vertex(label, **props)
        print(f"  [模拟] 创建顶点: {v}")
        return [v]

    def _mock_add_edge(self, q: str) -> List[MockEdge]:
        """模拟 addE"""
        import re
        label_match = re.search(r"addE\('([^']+)'\)|addE\("([^"]+)"\)", q, re.IGNORECASE)
        label = label_match.group(1) or label_match.group(2) if label_match else "edge"

        from_match = re.search(r"from\('([^']+)'\)", q)
        to_match = re.search(r"to\('([^']+)'\)", q)
        outV = from_match.group(1) if from_match else "v0"
        inV = to_match.group(1) if to_match else "v1"

        props = {}
        prop_matches = re.findall(r"property\('([^']+)','([^']+)'\)", q, re.IGNORECASE)
        for k, v in prop_matches:
            props[k] = v

        e = self.mock.add_edge(label, outV, inV, **props)
        print(f"  [模拟] 创建边: {e}")
        return [e]

    def _mock_query_vertices(self, q: str) -> List[MockVertex]:
        """模拟 V() 查询"""
        import re
        # V('id')
        id_match = re.search(r"V\('([^']+)'\)", q)
        if id_match:
            v = self.mock.get_vertex(id_match.group(1))
            return [v] if v else []

        # .hasLabel('xxx')
        label = None
        label_match = re.search(r"hasLabel\('([^']+)'\)", q)
        if label_match:
            label = label_match.group(1)

        # .has('key', 'value')
        filters = {}
        has_matches = re.findall(r"has\('([^']+)','([^']+)'\)", q)
        for k, v in has_matches:
            filters[k] = v

        results = self.mock.query_vertices(label, **filters)

        # .values('key')
        if ".values(" in q:
            val_match = re.search(r"values\('([^']+)'\)", q)
            if val_match:
                key = val_match.group(1)
                return [v.properties.get(key) for v in results if key in v.properties]

        # .out('label') / .in('label')
        if ".out(" in q:
            edge_label = None
            edge_match = re.search(r"\.out\('([^']+)'\)", q)
            if edge_match:
                edge_label = edge_match.group(1)
            neighbors = []
            for v in results:
                edges = self.mock.query_edges(label=edge_label, outV=v.id)
                for e in edges:
                    n = self.mock.get_vertex(e.inV)
                    if n:
                        neighbors.append(n)
            return neighbors

        if ".in(" in q:
            edge_label = None
            edge_match = re.search(r"\.in\('([^']+)'\)", q)
            if edge_match:
                edge_label = edge_match.group(1)
            neighbors = []
            for v in results:
                edges = self.mock.query_edges(label=edge_label, inV=v.id)
                for e in edges:
                    n = self.mock.get_vertex(e.outV)
                    if n:
                        neighbors.append(n)
            return neighbors

        return results

    def _mock_query_edges(self, q: str) -> List[MockEdge]:
        """模拟 E() 查询"""
        import re
        label = None
        label_match = re.search(r"hasLabel\('([^']+)'\)", q)
        if label_match:
            label = label_match.group(1)
        return self.mock.query_edges(label=label)

    def _mock_update(self, q: str) -> List[bool]:
        """模拟 property() 更新"""
        import re
        vid_match = re.search(r"V\('([^']+)'\)", q)
        if not vid_match:
            return [False]
        vid = vid_match.group(1)
        prop_matches = re.findall(r"property\('([^']+)','([^']+)'\)", q)
        props = {k: v for k, v in prop_matches}
        return [self.mock.update_vertex(vid, **props)]

    def _mock_delete(self, q: str) -> List[bool]:
        """模拟 drop() 删除"""
        import re
        vid_match = re.search(r"V\('([^']+)'\)", q)
        if vid_match:
            return [self.mock.delete_vertex(vid_match.group(1))]
        eid_match = re.search(r"E\('([^']+)'\)", q)
        if eid_match:
            return [self.mock.delete_edge(eid_match.group(1))]
        return [False]


# ============================================================
# 演示函数
# ============================================================

def print_separator(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def print_result(label: str, data: Any):
    """格式化打印结果"""
    print(f"\n--- {label} ---")
    if isinstance(data, list):
        if not data:
            print("  (空)")
        for i, item in enumerate(data):
            if isinstance(item, (MockVertex, MockEdge)):
                print(f"  [{i}] {item}")
                if hasattr(item, 'properties') and item.properties:
                    for k, v in item.properties.items():
                        print(f"       .{k} = {v}")
            else:
                print(f"  [{i}] {item}")
    else:
        print(f"  {data}")


def demo_basic_crud(client: GremlinClient):
    """演示基本的增删改查操作"""
    print_separator("1. 基本 CRUD 操作")

    # 创建顶点
    print("\n>> 创建人员顶点")
    v1 = client.submit("g.addV('person').property('name','Alice').property('age',30)")
    v2 = client.submit("g.addV('person').property('name','Bob').property('age',25)")
    v3 = client.submit("g.addV('person').property('name','Charlie').property('age',35)")
    v4 = client.submit("g.addV('company').property('name','Acme Corp').property('industry','Tech')")

    # 创建边
    print("\n>> 创建关系边")
    client.submit(f"g.addE('works_for').from('{v1[0].id}').to('{v4[0].id}').property('since',2020)")
    client.submit(f"g.addE('knows').from('{v1[0].id}').to('{v2[0].id}').property('since',2018)")
    client.submit(f"g.addE('knows').from('{v2[0].id}').to('{v3[0].id}').property('since',2019)")

    # 查询所有 person
    print("\n>> 查询所有 person 顶点")
    people = client.submit("g.V().hasLabel('person')")
    print_result("所有人员", people)

    # 按属性过滤
    print("\n>> 按名称过滤: name = 'Alice'")
    alice = client.submit("g.V().hasLabel('person').has('name','Alice')")
    print_result("Alice", alice)

    # 查询值
    print("\n>> 查询所有人员姓名")
    names = client.submit("g.V().hasLabel('person').values('name')")
    print_result("姓名列表", names)

    # 遍历边
    print("\n>> 查询 Alice 认识的人")
    known = client.submit(f"g.V('{v1[0].id}').out('knows')")
    print_result("Alice 认识的人", known)

    print("\n>> 查询为 Acme Corp 工作的人")
    workers = client.submit(f"g.V('{v4[0].id}').in('works_for')")
    print_result("Acme Corp 员工", workers)

    # 更新
    print("\n>> 更新 Alice 的年龄为 31")
    client.submit(f"g.V('{v1[0].id}').property('age',31)")
    updated = client.submit(f"g.V('{v1[0].id}').values('age')")
    print_result("Alice 更新后年龄", updated)

    # 删除
    print("\n>> 删除 Charlie 顶点")
    client.submit(f"g.V('{v3[0].id}').drop()")
    remaining = client.submit("g.V().hasLabel('person')")
    print_result("删除后剩余人员", remaining)


def demo_path_query(client: GremlinClient):
    """演示路径查询"""
    print_separator("2. 路径查询")

    # 构建一个简单的社交网络
    alice = client.submit("g.addV('person').property('name','Alice')")[0]
    bob = client.submit("g.addV('person').property('name','Bob')")[0]
    carol = client.submit("g.addV('person').property('name','Carol')")[0]
    dave = client.submit("g.addV('person').property('name','Dave')")[0]

    client.submit(f"g.addE('knows').from('{alice.id}').to('{bob.id}')")
    client.submit(f"g.addE('knows').from('{bob.id}').to('{carol.id}')")
    client.submit(f"g.addE('knows').from('{carol.id}').to('{dave.id}')")
    client.submit(f"g.addE('knows').from('{alice.id}').to('{dave.id}')")

    # 查询 Alice 认识的人认识的人（2度关系）
    print("\n>> Alice 的 2 度关系（朋友的朋友）")
    friends_of_friends = client.submit(f"g.V('{alice.id}').out('knows').out('knows')")
    print_result("Alice 的朋友的朋友", friends_of_friends)

    # 查询路径
    print("\n>> 从 Alice 到 Dave 的所有路径")
    path1 = client.submit(f"g.V('{alice.id}').out('knows').has('name','Dave')")
    print_result("Alice -> Dave (直接)", path1)

    path2 = client.submit(f"g.V('{alice.id}').out('knows').out('knows').has('name','Dave')")
    print_result("Alice -> ... -> Dave (间接)", path2)


def demo_filtering(client: GremlinClient):
    """演示高级过滤"""
    print_separator("3. 高级过滤")

    # 创建带数值属性的顶点
    for name, age in [("Eve", 28), ("Frank", 32), ("Grace", 22), ("Heidi", 40)]:
        client.submit(f"g.addV('person').property('name','{name}').property('age',{age})")

    # 按数值范围过滤（模拟模式下用名称模拟）
    print("\n>> 年龄过滤（模拟模式仅演示概念）")
    all_people = client.submit("g.V().hasLabel('person').values('name')")
    print_result("所有人员", all_people)


def main():
    parser = argparse.ArgumentParser(description="Neptune Gremlin 基础操作演示")
    parser.add_argument("--endpoint", type=str, default=None,
                        help="Neptune 集群端点（不指定则使用模拟模式）")
    parser.add_argument("--port", type=int, default=8182,
                        help="Neptune 端口（默认 8182）")
    args = parser.parse_args()

    client = GremlinClient(endpoint=args.endpoint, port=args.port)

    try:
        demo_basic_crud(client)
        demo_path_query(client)
        demo_filtering(client)
    finally:
        client.close()

    print("\n" + "="*60)
    print("  演示完成！")
    print("="*60)


if __name__ == "__main__":
    main()
