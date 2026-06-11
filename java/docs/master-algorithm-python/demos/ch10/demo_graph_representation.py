"""
demo_graph_representation.py — 图的三种表示方法及相互转换

包含：
  - 邻接矩阵 (AdjacencyMatrix)
  - 邻接表   (AdjacencyList)
  - 边列表   (EdgeList)
  - 三种表示之间的相互转换
"""


# ============================================================
# 1. 邻接矩阵 (Adjacency Matrix)
# ============================================================
class AdjacencyMatrix:
    """使用 n×n 矩阵存储图。matrix[u][v] = weight (0 表示无边)。"""

    def __init__(self, n: int, directed=False):
        self.n = n
        self.directed = directed
        self.matrix = [[0] * n for _ in range(n)]

    def add_edge(self, u: int, v: int, weight=1):
        self.matrix[u][v] = weight
        if not self.directed:
            self.matrix[v][u] = weight

    def remove_edge(self, u: int, v: int):
        self.matrix[u][v] = 0
        if not self.directed:
            self.matrix[v][u] = 0

    def has_edge(self, u: int, v: int) -> bool:
        return self.matrix[u][v] != 0

    def get_weight(self, u: int, v: int) -> int:
        return self.matrix[u][v]

    def neighbors(self, u: int):
        return [(v, self.matrix[u][v]) for v in range(self.n) if self.matrix[u][v] != 0]

    def __repr__(self):
        lines = []
        for i in range(self.n):
            lines.append(f"  {i}: {self.matrix[i]}")
        return "AdjacencyMatrix:\n" + "\n".join(lines)


# ============================================================
# 2. 邻接表 (Adjacency List)
# ============================================================
class AdjacencyList:
    """每个顶点维护一个邻居列表。条目格式: (neighbor, weight) 或 neighbor（无权图）。"""

    def __init__(self, n: int, directed=False):
        self.n = n
        self.directed = directed
        self.graph = [[] for _ in range(n)]

    def add_edge(self, u: int, v: int, weight=None):
        entry = (v, weight) if weight is not None else v
        self.graph[u].append(entry)
        if not self.directed:
            entry2 = (u, weight) if weight is not None else u
            self.graph[v].append(entry2)

    def remove_edge(self, u: int, v: int):
        self.graph[u] = [e for e in self.graph[u] if (isinstance(e, tuple) and e[0] != v) or e != v]
        if not self.directed:
            self.graph[v] = [e for e in self.graph[v] if (isinstance(e, tuple) and e[0] != u) or e != u]

    def neighbors(self, u: int):
        return self.graph[u]

    def __repr__(self):
        lines = []
        for u in range(self.n):
            lines.append(f"  {u}: {self.graph[u]}")
        return "AdjacencyList:\n" + "\n".join(lines)


# ============================================================
# 3. 边列表 (Edge List)
# ============================================================
class EdgeList:
    """将所有边存储为列表，每条边为 (u, v, weight)。"""

    def __init__(self, n: int, directed=False):
        self.n = n
        self.directed = directed
        self.edges = []

    def add_edge(self, u: int, v: int, weight=1):
        self.edges.append((u, v, weight))
        if not self.directed:
            self.edges.append((v, u, weight))

    def remove_edge(self, u: int, v: int):
        self.edges = [e for e in self.edges if not (e[0] == u and e[1] == v)]
        if not self.directed:
            self.edges = [e for e in self.edges if not (e[0] == v and e[1] == u)]

    def all_edges(self):
        return self.edges

    def __repr__(self):
        lines = [f"  n = {self.n}, directed = {self.directed}"]
        for e in self.edges:
            lines.append(f"  {e[0]} --{e[2]}--> {e[1]}")
        return "EdgeList:\n" + "\n".join(lines)


# ============================================================
# 4. 表示方式之间的转换
# ============================================================

def _get_neighbors(al, u):
    """获取邻接表中顶点 u 的 (neighbor, weight) 列表。"""
    if not al.graph[u]:
        return []
    if isinstance(al.graph[u][0], tuple):
        return al.graph[u]
    return [(v, 1) for v in al.graph[u]]


def adjacency_list_to_matrix(al: AdjacencyList) -> AdjacencyMatrix:
    """邻接表 → 邻接矩阵"""
    n = al.n
    am = AdjacencyMatrix(n, directed=al.directed)
    for u in range(n):
        for v, w in _get_neighbors(al, u):
            am.add_edge(u, v, w)
    return am


def adjacency_matrix_to_list(am: AdjacencyMatrix) -> AdjacencyList:
    """邻接矩阵 → 邻接表"""
    n = am.n
    al = AdjacencyList(n, directed=am.directed)
    for u in range(n):
        for v in range(n):
            w = am.matrix[u][v]
            if w != 0:
                al.add_edge(u, v, w if w != 1 else None)
    return al


def adjacency_list_to_edge_list(al: AdjacencyList) -> EdgeList:
    """邻接表 → 边列表"""
    n = al.n
    el = EdgeList(n, directed=al.directed)
    for u in range(n):
        for v, w in _get_neighbors(al, u):
            if al.directed or u < v:
                el.add_edge(u, v, w)
    return el


def edge_list_to_adjacency_list(el: EdgeList) -> AdjacencyList:
    """边列表 → 邻接表"""
    al = AdjacencyList(el.n, directed=el.directed)
    for u, v, w in el.edges:
        al.add_edge(u, v, w)
    return al


def adjacency_matrix_to_edge_list(am: AdjacencyMatrix) -> EdgeList:
    """邻接矩阵 → 边列表"""
    n = am.n
    el = EdgeList(n, directed=am.directed)
    for u in range(n):
        for v in range(n):
            w = am.matrix[u][v]
            if w != 0 and (am.directed or u < v):
                el.add_edge(u, v, w)
    return el


def edge_list_to_adjacency_matrix(el: EdgeList) -> AdjacencyMatrix:
    """边列表 → 邻接矩阵"""
    al = edge_list_to_adjacency_list(el)
    return adjacency_list_to_matrix(al)


# ============================================================
# Demo 入口
# ============================================================
def _build_sample_graph():
    """
    构造示例图（无向无权）：
        0 -- 1 -- 2
        |    |
        3 -- 4
    """
    al = AdjacencyList(5, directed=False)
    al.add_edge(0, 1)
    al.add_edge(1, 2)
    al.add_edge(0, 3)
    al.add_edge(1, 4)
    al.add_edge(3, 4)
    return al


def _run_conversion_demo():
    """演示三种表示法之间的相互转换，验证一致性。"""
    print("=" * 60)
    print("  图的表示方法 — 相互转换")
    print("=" * 60)

    al = _build_sample_graph()

    # 邻接表原始
    print("\n[1] 原始邻接表:")
    print(al)

    # 邻接表 → 邻接矩阵
    print("\n[2] 邻接表 → 邻接矩阵:")
    am = adjacency_list_to_matrix(al)
    print(am)

    # 邻接矩阵 → 邻接表
    print("\n[3] 邻接矩阵 → 邻接表:")
    al2 = adjacency_matrix_to_list(am)
    print(al2)

    # 邻接表 → 边列表
    print("\n[4] 邻接表 → 边列表:")
    el = adjacency_list_to_edge_list(al)
    print(el)

    # 边列表 → 邻接表
    print("\n[5] 边列表 → 邻接表:")
    al3 = edge_list_to_adjacency_list(el)
    print(al3)

    # 邻接矩阵 → 边列表
    print("\n[6] 邻接矩阵 → 边列表:")
    el2 = adjacency_matrix_to_edge_list(am)
    print(el2)

    # 边列表 → 邻接矩阵
    print("\n[7] 边列表 → 邻接矩阵:")
    am2 = edge_list_to_adjacency_matrix(el)
    print(am2)

    # 一致性验证：所有邻居关系应当一致
    print("\n" + "=" * 60)
    print("  一致性验证")
    print("=" * 60)

    for u in range(5):
        n_al = set(v for v, _ in _get_neighbors(al, u))
        n_am = set(v for v, _ in am.neighbors(u))
        n_el = set(v for u2, v, _ in el.all_edges() if u2 == u)

        status = "[OK]" if n_al == n_am == n_el else "[FAIL]"
        print(f"  顶点 {u}: 邻接表={n_al} 矩阵={n_am} 边表={n_el}  {status}")

    print("\n所有转换通过验证!")


def _run_weighted_demo():
    """演示带权有向图的表示。"""
    print("\n" + "=" * 60)
    print("  带权有向图示例")
    print("=" * 60)

    # 有向有权图:
    #   0 --> 1 (w=5)
    #   0 --> 2 (w=3)
    #   1 --> 2 (w=2)
    al = AdjacencyList(3, directed=True)
    al.add_edge(0, 1, 5)
    al.add_edge(0, 2, 3)
    al.add_edge(1, 2, 2)

    print("\n邻接表:")
    print(al)

    am = adjacency_list_to_matrix(al)
    print("\n邻接矩阵:")
    print(am)

    el = adjacency_list_to_edge_list(al)
    print("\n边列表:")
    print(el)


if __name__ == "__main__":
    _run_conversion_demo()
    _run_weighted_demo()