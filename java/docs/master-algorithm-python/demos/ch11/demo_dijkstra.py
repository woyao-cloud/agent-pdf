"""
demo_dijkstra.py — Dijkstra 最短路径算法演示

配合第11章"图算法 - 最短路径"之 11.1 使用。

演示内容：
  1. 标准 Dijkstra（二叉堆 + 惰性删除）
  2. 路径重建（前驱数组回溯）
  3. 多重测试用例（简单图、链式图、稠密图、无向图）
  4. 性能对比：Dijkstra vs 朴素 BFS（无权图）
"""

import heapq
import math
import time
from typing import Dict, List, Optional, Tuple


# ============================================================
# Dijkstra 实现
# ============================================================
def dijkstra(graph: Dict[str, List[Tuple[str, int]]],
             start: str) -> Tuple[Dict[str, float], Dict[str, Optional[str]]]:
    """
    Dijkstra 算法 - 二叉堆 + 惰性删除。

    graph: 邻接表 {u: [(v, weight), ...]}
    start: 源点

    返回: (dist, prev)
        dist[v] = start → v 的最短距离
        prev[v] = 最短路径中 v 的前驱顶点
    """
    dist: Dict[str, float] = {v: math.inf for v in graph}
    prev: Dict[str, Optional[str]] = {v: None for v in graph}
    dist[start] = 0

    pq: List[Tuple[float, str]] = [(0.0, start)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))

    return dist, prev


def reconstruct_path(prev: Dict[str, Optional[str]],
                     target: str) -> List[str]:
    """从 prev 回溯重建路径"""
    path: List[str] = []
    v: Optional[str] = target
    while v is not None:
        path.append(v)
        v = prev[v]
    path.reverse()
    return path


# ============================================================
# 多源 Dijkstra
# ============================================================
def multi_source_dijkstra(graph: Dict[str, List[Tuple[str, int]]],
                           sources: List[str]) -> Tuple[Dict[str, float],
                                                        Dict[str, Optional[str]]]:
    """
    多源 Dijkstra：所有源点初始距离设为 0 同时入队。

    常用于：求每个点到最近源点的最短距离（如消防站选址）。
    """
    dist: Dict[str, float] = {v: math.inf for v in graph}
    prev: Dict[str, Optional[str]] = {v: None for v in graph}
    pq: List[Tuple[float, str]] = []

    for s in sources:
        dist[s] = 0.0
        heapq.heappush(pq, (0.0, s))

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))

    return dist, prev


# ============================================================
# 测试用例构建器
# ============================================================
def build_test_graph_simple() -> Dict[str, List[Tuple[str, int]]]:
    """简单有向图"""
    return {
        'A': [('B', 2), ('C', 1)],
        'B': [('D', 3), ('E', 1)],
        'C': [('E', 4)],
        'D': [('F', 1)],
        'E': [('F', 2)],
        'F': [],
    }


def build_test_graph_chain() -> Dict[str, List[Tuple[str, int]]]:
    """链式图（顺序传播，测试多轮松弛）"""
    g: Dict[str, List[Tuple[str, int]]] = {}
    for i in range(6):
        node = chr(ord('A') + i)
        g[node] = []
    for i in range(5):
        u = chr(ord('A') + i)
        v = chr(ord('A') + i + 1)
        g[u].append((v, i + 1))
    return g


def build_test_graph_dense() -> Dict[str, List[Tuple[str, int]]]:
    """稠密完全图（顶点数 6，每对顶点之间都有边）"""
    labels = ['A', 'B', 'C', 'D', 'E', 'F']
    g: Dict[str, List[Tuple[str, int]]] = {v: [] for v in labels}
    import random
    random.seed(42)
    for i, u in enumerate(labels):
        for j, v in enumerate(labels):
            if i != j:
                w = random.randint(1, 20)
                g[u].append((v, w))
    return g


def build_test_graph_undirected() -> Dict[str, List[Tuple[str, int]]]:
    """无向图（双向边）"""
    edges = [
        ('A', 'B', 4), ('A', 'C', 2), ('B', 'C', 1),
        ('B', 'D', 5), ('C', 'D', 8), ('C', 'E', 10),
        ('D', 'E', 2), ('D', 'F', 6), ('E', 'F', 3),
    ]
    g: Dict[str, List[Tuple[str, int]]] = {}
    for u, v, w in edges:
        g.setdefault(u, []).append((v, w))
        g.setdefault(v, []).append((u, w))
    # 确保所有顶点存在
    for v in ['A', 'B', 'C', 'D', 'E', 'F']:
        g.setdefault(v, [])
    return g


# ============================================================
# 打印辅助
# ============================================================
def print_result(start: str, dist: Dict[str, float],
                 prev: Dict[str, Optional[str]]):
    """格式化打印最短路径结果"""
    print(f"\n起点: {start}")
    print(f"{'目标':>6} | {'距离':>8} | {'路径':<20}")
    print("-" * 42)
    for target in sorted(dist.keys()):
        d = dist[target]
        if math.isinf(d):
            print(f"{target:>6} | {'∞':>8} | {'不可达':<20}")
        else:
            path = " → ".join(reconstruct_path(prev, target))
            print(f"{target:>6} | {d:>8.1f} | {path:<20}")


def print_table(title: str, data: List[Tuple[str, ...]], headers: List[str]):
    """通用表格打印"""
    print(f"\n{title}")
    sep = " | ".join(h.center(12) for h in headers)
    print(sep)
    print("-" * len(sep))
    for row in data:
        print(" | ".join(str(item).center(12) for item in row))


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("Dijkstra 最短路径算法演示")
    print("=" * 72)

    # ---- 1. 简单有向图 ----
    print("\n" + "=" * 72)
    print("1. 简单有向图")
    print("=" * 72)
    g1 = build_test_graph_simple()
    dist, prev = dijkstra(g1, 'A')
    print_result('A', dist, prev)
    # 验证已知路径
    assert dist['F'] == 5.0, f"Expected dist[F]=5, got {dist['F']}"
    assert " → ".join(reconstruct_path(prev, 'F')) == "A → B → E → F"

    # ---- 2. 链式图 ----
    print("\n" + "=" * 72)
    print("2. 链式图（每步只有一条路径可选）")
    print("=" * 72)
    g2 = build_test_graph_chain()
    dist2, prev2 = dijkstra(g2, 'A')
    print_result('A', dist2, prev2)

    # ---- 3. 稠密图 ----
    print("\n" + "=" * 72)
    print("3. 稠密完全图（顶点间全连接）")
    print("=" * 72)
    g3 = build_test_graph_dense()
    dist3, prev3 = dijkstra(g3, 'A')
    print_result('A', dist3, prev3)

    # ---- 4. 无向图 ----
    print("\n" + "=" * 72)
    print("4. 无向图（双向边权对称）")
    print("=" * 72)
    g4 = build_test_graph_undirected()
    dist4, prev4 = dijkstra(g4, 'A')
    print_result('A', dist4, prev4)

    # ---- 5. 路径重建展示 ----
    print("\n" + "=" * 72)
    print("5. 路径重建详细展示")
    print("=" * 72)
    test_cases = [('A', 'F'), ('A', 'E'), ('A', 'D')]
    for src, tgt in test_cases:
        d, p = dijkstra(g4, src)
        path = " → ".join(reconstruct_path(p, tgt))
        print(f"  {src} → {tgt}: 距离={d[tgt]:.0f}, 路径={path}")

    # ---- 6. 多源 Dijkstra ----
    print("\n" + "=" * 72)
    print("6. 多源 Dijkstra（源点 A, C）")
    print("=" * 72)
    dist_ms, _ = multi_source_dijkstra(g4, ['A', 'C'])
    rows = [(v, f"{dist4[v]:.0f}", f"{dist_ms[v]:.0f}")
            for v in sorted(dist_ms.keys())]
    print_table("距离对比：单源(A) vs 多源(A,C)",
                rows, ["顶点", "单源", "多源"])

    # ---- 7. 性能对比（Dijkstra vs 朴素 BFS） ----
    print("\n" + "=" * 72)
    print("7. 性能对比：Dijkstra 在不同规模图中的运行时间")
    print("=" * 72)

    sizes = [100, 500, 1000]
    for n in sizes:
        # 构建稀疏随机图
        import random
        random.seed(0)
        labels = [str(i) for i in range(n)]
        g: Dict[str, List[Tuple[str, int]]] = {v: [] for v in labels}
        for i in range(n):
            for _ in range(3):  # 每个顶点 3 条出边
                j = random.randint(0, n - 1)
                if i != j:
                    w = random.randint(1, 10)
                    g[labels[i]].append((labels[j], w))

        start_t = time.perf_counter()
        dijkstra(g, '0')
        elapsed = time.perf_counter() - start_t
        print(f"  V={n:>5}: {elapsed:.4f} 秒")

    # ---- 8. 验证正确性 ----
    print("\n" + "=" * 72)
    print("8. 正确性验证")
    print("=" * 72)

    # 简单图：手动计算验证
    # A→B=2, A→C=1, B→E=1 → A→B→E=3, B→D=5, E→F=2 → A→B→E→F=5
    # C→E=4 → A→C→E=5 (比 3 大)
    assert dist['A'] == 0.0
    assert dist['B'] == 2.0
    assert dist['C'] == 1.0
    assert dist['D'] == 5.0
    assert dist['E'] == 3.0
    assert dist['F'] == 5.0
    print("  [OK] 简单图所有距离验证通过")

    # 无向图
    # A→C=2, A→B=4, C→B=1 → A→C→B=3 < A→B=4
    assert dist4['B'] == 3.0, f"Expected 3, got {dist4['B']}"
    print("  [OK] 无向图最短路径验证通过（A→B 应为 3 而非 4）")

    # 链式图
    assert dist2['F'] == 15.0  # 1+2+3+4+5 = 15
    print("  [OK] 链式图验证通过")

    print("\n" + "=" * 72)
    print("全部测试通过！")
    print("=" * 72)


if __name__ == "__main__":
    _test()