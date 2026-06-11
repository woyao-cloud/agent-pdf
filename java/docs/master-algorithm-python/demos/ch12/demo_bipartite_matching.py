"""
demo_bipartite_matching.py — 二分图最大匹配演示

配合第12章"网络流与匹配"之 12.3（二分图匹配）使用。

演示内容：
  1. DFS 增广路径算法（匈牙利算法）
  2. 二分图匹配 → 最大流等价性验证
  3. 测试用例与结果可视化
"""

from typing import List, Tuple


# ============================================================
# DFS 增广路径（匈牙利算法核心）
# ============================================================
class BipartiteMatching:
    """
    二分图最大匹配 — DFS 增广路径。

    U 和 V 是两个不相交的顶点集（分别用 0..u_size-1 和 0..v_size-1 索引）。
    """

    def __init__(self, u_size: int, v_size: int):
        self.u_size = u_size
        self.v_size = v_size
        self.adj: List[List[int]] = [[] for _ in range(u_size)]
        self.match_u: List[int] = [-1] * u_size   # U 中每个顶点匹配的 V 顶点
        self.match_v: List[int] = [-1] * v_size   # V 中每个顶点匹配的 U 顶点

    def add_edge(self, u: int, v: int):
        """添加一条从 u ∈ U 到 v ∈ V 的边"""
        self.adj[u].append(v)

    def _dfs(self, u: int, visited: List[bool]) -> bool:
        """尝试为 u 寻找匹配，返回是否找到增广路径"""
        for v in self.adj[u]:
            if not visited[v]:
                visited[v] = True
                # 如果 v 未匹配，或者能为 v 的当前匹配找到新的匹配
                if self.match_v[v] == -1 or self._dfs(self.match_v[v], visited):
                    self.match_u[u] = v
                    self.match_v[v] = u
                    return True
        return False

    def max_matching(self) -> int:
        """DFS 增广路径求最大匹配"""
        matching = 0
        for u in range(self.u_size):
            visited = [False] * self.v_size
            if self._dfs(u, visited):
                matching += 1
        return matching

    def get_matching(self) -> List[Tuple[int, int]]:
        """返回匹配边列表 [(u, v), ...]"""
        return [(u, v) for u, v in enumerate(self.match_u) if v != -1]


# ============================================================
# 转换为最大流验证
# ============================================================
class Dinic:
    from typing import List as _List

    class _Edge:
        __slots__ = ("to", "rev", "cap")
        def __init__(self, to: int, rev: int, cap: int):
            self.to = to
            self.rev = rev
            self.cap = cap

    def __init__(self, n: int):
        self.n = n
        self.graph: List[Dinic._Edge] = [[] for _ in range(n)]

    def add_edge(self, u: int, v: int, cap: int):
        f = Dinic._Edge(v, len(self.graph[v]), cap)
        b = Dinic._Edge(u, len(self.graph[u]), 0)
        self.graph[u].append(f)
        self.graph[v].append(b)

    def _bfs_level(self, s: int, t: int) -> List[int]:
        level = [-1] * self.n
        q = [s]
        level[s] = 0
        for u in q:
            for e in self.graph[u]:
                if e.cap > 0 and level[e.to] < 0:
                    level[e.to] = level[u] + 1
                    q.append(e.to)
        return level

    def _dfs_block(self, u: int, t: int, f: int,
                    level: List[int], it: List[int]) -> int:
        if u == t:
            return f
        for i in range(it[u], len(self.graph[u])):
            it[u] = i
            e = self.graph[u][i]
            if e.cap > 0 and level[u] + 1 == level[e.to]:
                pushed = self._dfs_block(e.to, t, min(f, e.cap), level, it)
                if pushed > 0:
                    e.cap -= pushed
                    self.graph[e.to][e.rev].cap += pushed
                    return pushed
        return 0

    def max_flow(self, s: int, t: int) -> int:
        flow = 0
        INF = 10 ** 9
        while True:
            level = self._bfs_level(s, t)
            if level[t] < 0:
                break
            it = [0] * self.n
            while True:
                pushed = self._dfs_block(s, t, INF, level, it)
                if pushed == 0:
                    break
                flow += pushed
        return flow


def matching_via_max_flow(adj: List[List[int]], u_size: int, v_size: int) -> int:
    """
    通过最大流求二分图最大匹配（验证等价性）。

    构图：s → U (cap=1), U → V (cap=1), V → t (cap=1)
    """
    n = u_size + v_size + 2
    s = u_size + v_size
    t = s + 1
    dinic = Dinic(n)

    for u in range(u_size):
        dinic.add_edge(s, u, 1)
        for v in adj[u]:
            dinic.add_edge(u, u_size + v, 1)
    for v in range(v_size):
        dinic.add_edge(u_size + v, t, 1)

    return dinic.max_flow(s, t)


# ============================================================
# 打印
# ============================================================
def print_matching(name: str, matching: List[Tuple[int, int]], max_val: int):
    """打印匹配结果"""
    print(f"\n{name}")
    print(f"  最大匹配数: {max_val}")
    if matching:
        print(f"  匹配边: {matching}")
    else:
        print(f"  匹配边: (无)")


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("二分图最大匹配演示")
    print("=" * 72)

    test_cases = [
        # (U 大小, V 大小, 边列表, 说明)
        (3, 3, [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2)], "常规用例"),
        (3, 3, [(0, 0), (0, 1), (1, 0), (1, 2), (2, 1)], "完全可匹配"),
        (3, 2, [(0, 0), (1, 0), (2, 1)], "U > V"),
        (2, 3, [(0, 0), (0, 1), (1, 2)], "V > U"),
        (4, 3, [(0, 0), (0, 1), (1, 1), (2, 2), (3, 2)], "不平衡"),
        (3, 3, [(0, 0), (1, 1), (2, 2)], "对角匹配（唯一）"),
    ]

    for u_size, v_size, edges, desc in test_cases:
        print("-" * 72)
        print(f"用例: {desc}")
        print(f"  U={u_size}, V={v_size}, 边={edges}")

        # --- 匈牙利算法 ---
        bm = BipartiteMatching(u_size, v_size)
        for u, v in edges:
            bm.add_edge(u, v)
        match_count = bm.max_matching()
        matching_edges = bm.get_matching()

        # --- 最大流验证 ---
        adj: List[List[int]] = [[] for _ in range(u_size)]
        for u, v in edges:
            adj[u].append(v)
        flow_count = matching_via_max_flow(adj, u_size, v_size)

        print(f"  匈牙利算法: {match_count}")
        print(f"  最大流验证: {flow_count}")
        ok = "OK" if match_count == flow_count else "FAIL"
        print(f"  一致性: [{ok}]")

        if matching_edges:
            print(f"  匹配边: {matching_edges}")

    # ---- 额外：展示增广路径过程 ----
    print("=" * 72)
    print("增广路径过程演示")
    print("=" * 72)

    bm = BipartiteMatching(3, 3)
    bm.add_edge(0, 0)
    bm.add_edge(0, 1)
    bm.add_edge(1, 1)
    bm.add_edge(1, 2)
    bm.add_edge(2, 2)

    print("\n逐步匹配过程:")
    for u in range(3):
        count_before = len(bm.get_matching())
        visited = [False] * 3
        found = bm._dfs(u, visited)
        count_after = len(bm.get_matching())
        if found:
            print(f"  为 U 顶点 {u} 找到匹配 → 当前匹配: {bm.get_matching()}")
        else:
            print(f"  为 U 顶点 {u} 未找到匹配")

    print(f"\n最终最大匹配: {bm.get_matching()}")


if __name__ == "__main__":
    _test()