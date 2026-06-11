"""
demo_max_flow.py — 最大流算法演示

配合第12章"网络流与匹配"之 12.1（最大流问题）使用。

演示内容：
  1. Ford-Fulkerson (DFS-based)
  2. Dinic (Level Graph + Blocking Flow)
  3. 输出最大流值和每条边上的流量分配
"""

from typing import List, Tuple


# ============================================================
# 图的邻接表表示（每条边使用 Edge 对象）
# ============================================================
class Edge:
    __slots__ = ("to", "rev", "cap")

    def __init__(self, to: int, rev: int, cap: int):
        self.to = to      # 目标顶点
        self.rev = rev    # 反向边在 graph[to] 中的索引
        self.cap = cap    # 残余容量


# ============================================================
# Ford-Fulkerson (DFS-based)
# ============================================================
def ford_fulkerson(graph: List[List[Edge]], s: int, t: int) -> int:
    """
    Ford-Fulkerson 算法 — DFS 找增广路径。

    参数：
      graph: 邻接表（已同时包含正向边和反向边）
      s: 源点
      t: 汇点

    返回：最大流值
    """
    n = len(graph)
    flow = 0
    INF = 10 ** 9

    def dfs(u: int, t: int, f: int, visited: List[bool]) -> int:
        """从 u 出发寻找增广路径，返回实际推送的流量"""
        if u == t:
            return f
        visited[u] = True
        for e in graph[u]:
            if not visited[e.to] and e.cap > 0:
                pushed = dfs(e.to, t, min(f, e.cap), visited)
                if pushed > 0:
                    e.cap -= pushed
                    graph[e.to][e.rev].cap += pushed
                    return pushed
        return 0

    while True:
        visited = [False] * n
        pushed = dfs(s, t, INF, visited)
        if pushed == 0:
            break
        flow += pushed

    return flow


# ============================================================
# Dinic
# ============================================================
class Dinic:
    """
    Dinic 算法 — 分层图 + 阻塞流。

    用法：
      dinic = Dinic(n)
      dinic.add_edge(u, v, cap)
      max_flow = dinic.max_flow(s, t)
    """

    def __init__(self, n: int):
        self.n = n
        self.graph: List[List[Edge]] = [[] for _ in range(n)]

    def add_edge(self, u: int, v: int, cap: int):
        """添加一条有向边 u→v，容量 cap。同时添加反向边。"""
        forward = Edge(v, len(self.graph[v]), cap)
        backward = Edge(u, len(self.graph[u]), 0)
        self.graph[u].append(forward)
        self.graph[v].append(backward)

    # ---------- BFS 分层 ----------
    def _bfs_level(self, s: int, t: int) -> List[int]:
        level = [-1] * self.n
        queue = [s]
        level[s] = 0
        for u in queue:
            for e in self.graph[u]:
                if e.cap > 0 and level[e.to] < 0:
                    level[e.to] = level[u] + 1
                    queue.append(e.to)
        return level

    # ---------- DFS 推送阻塞流 ----------
    def _dfs_blocking(self, u: int, t: int, f: int,
                       level: List[int], it: List[int]) -> int:
        if u == t:
            return f
        for i in range(it[u], len(self.graph[u])):
            it[u] = i
            e = self.graph[u][i]
            if e.cap > 0 and level[u] + 1 == level[e.to]:
                pushed = self._dfs_blocking(e.to, t, min(f, e.cap), level, it)
                if pushed > 0:
                    e.cap -= pushed
                    self.graph[e.to][e.rev].cap += pushed
                    return pushed
        return 0

    # ---------- 主过程 ----------
    def max_flow(self, s: int, t: int) -> int:
        flow = 0
        INF = 10 ** 9
        while True:
            level = self._bfs_level(s, t)
            if level[t] < 0:          # 汇点不可达
                break
            it = [0] * self.n         # 当前弧优化
            while True:
                pushed = self._dfs_blocking(s, t, INF, level, it)
                if pushed == 0:
                    break
                flow += pushed
        return flow


# ============================================================
# 构建图工具
# ============================================================
def build_sample_graph() -> Tuple[List[List[Edge]], int, int]:
    """
    示例图：
      s ──10──→ a ── 9──→ t
      │         ↑
      │         │
      5         15
      ↓         │
      b ── 8──→ c ── 6──→ t
      │                   ↑
      └──────3────────────┘
    """
    n = 6
    graph: List[List[Edge]] = [[] for _ in range(n)]
    # 索引: s=0, a=1, b=2, c=3, d=4, t=5  此图简化版: s=0, a=1, b=2, c=3, t=4

    # 使用 5 个顶点的简单版本
    n2 = 5
    graph2: List[List[Edge]] = [[] for _ in range(n2)]

    def add(u, v, cap):
        forward = Edge(v, len(graph2[v]), cap)
        backward = Edge(u, len(graph2[u]), 0)
        graph2[u].append(forward)
        graph2[v].append(backward)

    # s=0, a=1, b=2, t=3
    add(0, 1, 10)   # s → a
    add(0, 2, 5)    # s → b
    add(1, 2, 15)   # a → b
    add(1, 3, 9)    # a → t
    add(2, 3, 8)    # b → t

    fill = [[0] * n2 for _ in range(n2)]
    for u in range(n2):
        for e in graph2[u]:
            fill[u][e.to] += e.cap  # 只看原始正向容量

    return graph2, 0, 3


# ============================================================
# 打印流量分配
# ============================================================
def print_flow(graph: List[List[Edge]], original_caps: List[Tuple[int, int, int]],
               label: str):
    """打印每条边上的流量（原始容量 - 残余容量 = 已用流量）"""
    print(f"\n{label}")
    print(f"{'边':<12} {'容量':<8} {'流量':<8}")
    print("-" * 32)
    for u, v, cap in original_caps:
        # 在残余网络中找正向边
        for e in graph[u]:
            if e.to == v:
                flow = cap - e.cap
                print(f"{u}→{v:<8} {cap:<8} {flow:<8}")
                break


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("最大流算法演示")
    print("=" * 72)

    # ---- 测试用例 ----
    graph, s, t = build_sample_graph()
    n = len(graph)

    # 保存原始容量
    original_caps = []
    for u in range(n):
        for e in graph[u]:
            if graph[e.to][e.rev].cap == 0:  # 反向边容量为 0 → 这是正向边
                original_caps.append((u, e.to, e.cap + graph[e.to][e.rev].cap))

    # ---- 1. Ford-Fulkerson ----
    print("-" * 72)
    print("1. Ford-Fulkerson (DFS)")
    print("-" * 72)

    # 拷贝图
    def clone_graph(g: List[List[Edge]]) -> List[List[Edge]]:
        ng = [[] for _ in range(len(g))]
        for u in range(len(g)):
            for e in g[u]:
                ng[u].append(Edge(e.to, e.rev, e.cap))
        return ng

    g_ff = clone_graph(graph)
    ff_flow = ford_fulkerson(g_ff, s, t)
    print(f"最大流值: {ff_flow}")
    print_flow(g_ff, original_caps, "Ford-Fulkerson 流量分配:")

    # ---- 2. Dinic ----
    print("-" * 72)
    print("2. Dinic")
    print("-" * 72)

    dinic = Dinic(n)
    for u, v, cap in original_caps:
        dinic.add_edge(u, v, cap)
    dinic_flow = dinic.max_flow(s, t)
    print(f"最大流值: {dinic_flow}")

    # ---- 3. 结果对比 ----
    print("-" * 72)
    print("3. 结果对比")
    print("-" * 72)
    status = "OK" if ff_flow == dinic_flow else "FAIL"
    print(f"Ford-Fulkerson: {ff_flow},  Dinic: {dinic_flow},  一致? {status}")

    # ---- 4. Dinic 附加用例 ----
    print("-" * 72)
    print("4. Dinic 额外用例")
    print("-" * 72)

    extra_graphs = [
        # (n, edges, s, t, expected)
        (4, [(0, 1, 3), (0, 2, 3), (1, 2, 2), (1, 3, 2), (2, 3, 3)], 0, 3, 5),
        (4, [(0, 1, 10), (0, 2, 10), (1, 3, 10), (2, 3, 10)], 0, 3, 20),
        (2, [(0, 1, 100)], 0, 1, 100),
    ]

    for i, (n_v, edges, s2, t2, expected) in enumerate(extra_graphs):
        d = Dinic(n_v)
        for u, v, cap in edges:
            d.add_edge(u, v, cap)
        flow = d.max_flow(s2, t2)
        ok = "OK" if flow == expected else f"FAIL (got {flow})"
        print(f"  用例 {i + 1}: 最大流 = {flow}, 期望 = {expected}  [{ok}]")


if __name__ == "__main__":
    _test()