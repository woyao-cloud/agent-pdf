"""
demo_bellman_ford.py — Bellman-Ford 最短路径算法演示

配合第11章"图算法 - 最短路径"之 11.2 和 11.3 使用。

演示内容：
  1. 标准 Bellman-Ford（V-1 轮松弛 + 负权环检测）
  2. 含负权边的图
  3. 含负权环的图（检测与报告）
  4. SPFA 队列优化版本
  5. Floyd-Warshall 全源最短路径
  6. 性能对比：Bellman-Ford vs SPFA
"""

import math
import random
import time
from collections import deque
from typing import Dict, List, Optional, Tuple


# ============================================================
# Bellman-Ford 标准实现
# ============================================================
def bellman_ford(vertices: List[str],
                 edges: List[Tuple[str, str, int]],
                 start: str) -> Tuple[bool, Dict[str, float], Dict[str, Optional[str]]]:
    """
    Bellman-Ford 算法 - O(VE)。

    vertices: 顶点列表
    edges: 边列表 [(u, v, weight), ...]
    start: 源点

    返回: (has_negative_cycle, dist, prev)
        has_negative_cycle: 是否存在从 start 可达的负权环
    """
    dist: Dict[str, float] = {v: math.inf for v in vertices}
    prev: Dict[str, Optional[str]] = {v: None for v in vertices}
    dist[start] = 0.0

    # V-1 轮松弛
    for i in range(len(vertices) - 1):
        updated = False
        for u, v, w in edges:
            if dist[u] != math.inf and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                prev[v] = u
                updated = True
        if not updated:
            print(f"    第 {i + 1} 轮提前收敛")
            break

    # 第 V 轮：检测负权环
    has_cycle = False
    for u, v, w in edges:
        if dist[u] != math.inf and dist[u] + w < dist[v]:
            has_cycle = True
            break

    return has_cycle, dist, prev


# ============================================================
# SPFA 队列优化实现
# ============================================================
def spfa(graph: Dict[str, List[Tuple[str, int]]],
         start: str) -> Tuple[bool, Dict[str, float], Dict[str, Optional[str]]]:
    """
    SPFA 算法 - 队列优化的 Bellman-Ford。

    平均 O(E)，最坏 O(VE)。
    用入队次数 ≥ V 来检测负权环。
    """
    dist: Dict[str, float] = {v: math.inf for v in graph}
    prev: Dict[str, Optional[str]] = {v: None for v in graph}
    in_queue: Dict[str, bool] = {v: False for v in graph}
    push_count: Dict[str, int] = {v: 0 for v in graph}

    dist[start] = 0.0
    q = deque([start])
    in_queue[start] = True
    push_count[start] = 1

    while q:
        u = q.popleft()
        in_queue[u] = False

        for v, w in graph[u]:
            if dist[u] != math.inf and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                prev[v] = u
                if not in_queue[v]:
                    q.append(v)
                    in_queue[v] = True
                    push_count[v] += 1
                    if push_count[v] >= len(graph):
                        return True, dist, prev

    return False, dist, prev


# ============================================================
# 路径重建
# ============================================================
def reconstruct_path(prev: Dict[str, Optional[str]],
                     target: str) -> List[str]:
    """回溯重建路径"""
    path: List[str] = []
    v: Optional[str] = target
    while v is not None:
        path.append(v)
        v = prev[v]
    path.reverse()
    return path


# ============================================================
# 测试用例构建器
# ============================================================
def build_no_negative_cycle() -> Tuple[List[str], List[Tuple[str, str, int]]]:
    """含负权边但无负权环的图"""
    vertices = ['A', 'B', 'C', 'D', 'E']
    edges = [
        ('A', 'B', 6),
        ('A', 'C', 7),
        ('B', 'C', 8),
        ('B', 'D', 5),
        ('B', 'E', -4),   # 负权边！
        ('C', 'B', -2),   # 负权边！
        ('D', 'C', -3),
        ('D', 'E', 9),
        ('E', 'A', 2),
        ('E', 'C', 7),
    ]
    return vertices, edges


def build_with_negative_cycle() -> Tuple[List[str], List[Tuple[str, str, int]]]:
    """含负权环的图（B→C→D→B 构成 -2 的环）"""
    vertices = ['A', 'B', 'C', 'D']
    edges = [
        ('A', 'B', 1),
        ('B', 'C', 2),
        ('C', 'D', 3),
        ('D', 'B', -6),  # B→C→D→B = 2+3+(-6) = -1 < 0，负权环！
    ]
    return vertices, edges


def build_sparse_large() -> Dict[str, List[Tuple[str, int]]]:
    """稀疏大图（用于性能对比）"""
    n = 200
    random.seed(42)
    labels = [str(i) for i in range(n)]
    graph: Dict[str, List[Tuple[str, int]]] = {v: [] for v in labels}
    for i in range(n):
        for _ in range(2):
            j = random.randint(0, n - 1)
            if i != j:
                w = random.randint(-5, 10)
                graph[labels[i]].append((labels[j], w))
    return graph


# ============================================================
# 图转换工具
# ============================================================
def graph_to_edges(graph: Dict[str, List[Tuple[str, int]]]) -> List[Tuple[str, str, int]]:
    """邻接表 → 边列表"""
    edges = []
    for u, neighbors in graph.items():
        for v, w in neighbors:
            edges.append((u, v, w))
    return edges


# ============================================================
# 打印辅助
# ============================================================
def print_result(title: str, start: str, has_cycle: bool,
                 dist: Dict[str, float], prev: Dict[str, Optional[str]]):
    """格式化打印结果"""
    print(f"\n{title}")
    if has_cycle:
        print("  [!] 检测到从源点可达的负权环！")
        print("  最短距离无意义（可在环中无限缩短）。")
        return

    print(f"  起点: {start}")
    print(f"  {'目标':>6} | {'距离':>8} | {'路径':<20}")
    print("  " + "-" * 40)
    for target in sorted(dist.keys()):
        d = dist[target]
        if math.isinf(d):
            print(f"  {target:>6} | {'∞':>8} | {'不可达':<20}")
        else:
            path = " → ".join(reconstruct_path(prev, target))
            print(f"  {target:>6} | {d:>8.1f} | {path:<20}")


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("Bellman-Ford & SPFA 最短路径算法演示")
    print("=" * 72)

    # ============================================================
    # 1. Bellman-Ford：无负权环
    # ============================================================
    print("\n" + "=" * 72)
    print("1. Bellman-Ford — 含负权边但无负权环")
    print("=" * 72)

    v1, e1 = build_no_negative_cycle()
    has_cycle, dist, prev = bellman_ford(v1, e1, 'A')
    print_result("Bellman-Ford 结果", 'A', has_cycle, dist, prev)

    # 验证已知最佳路径
    # A→C=7, A→B→E=-4+6=2, A→B→C→B→E: ... 实际上：
    # A→B=6, A→C=7
    # 第一次松弛：dist[B]=6, dist[C]=7
    # 第二次松弛：A→B→E=2, A→C→B=5 (所以 dist[B] 被更新为 5)
    # 第三次松弛：A→C→B→E=1 (dist[E]=1)
    # ... 最终 A→E 应为 1
    assert not has_cycle, "不应检测到负权环"
    assert dist['E'] == 1.0, f"Expected dist[E]=1, got {dist['E']}"
    print("\n  [OK] 负权边正确处理，E 的最短路径通过 C→B→E")

    # ============================================================
    # 2. Bellman-Ford：含负权环
    # ============================================================
    print("\n" + "=" * 72)
    print("2. Bellman-Ford — 负权环检测")
    print("=" * 72)

    v2, e2 = build_with_negative_cycle()
    has_cycle2, dist2, prev2 = bellman_ford(v2, e2, 'A')
    print_result("Bellman-Ford 结果", 'A', has_cycle2, dist2, prev2)
    assert has_cycle2, "应检测到负权环"
    print("\n  [OK] 负权环正确检出")

    # ============================================================
    # 3. SPFA 测试
    # ============================================================
    print("\n" + "=" * 72)
    print("3. SPFA 算法 — 队列优化版")
    print("=" * 72)

    # 将边列表转为邻接表
    graph1: Dict[str, List[Tuple[str, int]]] = {v: [] for v in v1}
    for u, v, w in e1:
        graph1[u].append((v, w))

    has_cycle_spfa, dist_spfa, prev_spfa = spfa(graph1, 'A')
    print_result("SPFA 结果", 'A', has_cycle_spfa, dist_spfa, prev_spfa)

    # 验证 SPFA 结果与 Bellman-Ford 一致
    for v in v1:
        assert dist_spfa[v] == dist[v], f"SPFA vs BF 不一致 at {v}"
    print("\n  [OK] SPFA 结果与 Bellman-Ford 一致")

    # ============================================================
    # 4. SPFA 负权环检测
    # ============================================================
    print("\n" + "=" * 72)
    print("4. SPFA — 负权环检测")
    print("=" * 72)

    graph2: Dict[str, List[Tuple[str, int]]] = {v: [] for v in v2}
    for u, v, w in e2:
        graph2[u].append((v, w))

    has_cycle_spfa2, _, _ = spfa(graph2, 'A')
    assert has_cycle_spfa2, "SPFA 应检测到负权环"
    print("\n  [OK] SPFA 负权环检测通过")

    # ============================================================
    # 5. 性能对比：Bellman-Ford vs SPFA
    # ============================================================
    print("\n" + "=" * 72)
    print("5. 性能对比：Bellman-Ford vs SPFA")
    print("=" * 72)

    graph_large = build_sparse_large()
    vertices_large = list(graph_large.keys())
    edges_large = graph_to_edges(graph_large)

    # Bellman-Ford
    t0 = time.perf_counter()
    bellman_ford(vertices_large, edges_large, '0')
    t_bf = time.perf_counter() - t0

    # SPFA
    t0 = time.perf_counter()
    spfa(graph_large, '0')
    t_spfa = time.perf_counter() - t0

    v_cnt = len(vertices_large)
    e_cnt = len(edges_large)
    print(f"\n  图规模: V={v_cnt}, E={e_cnt}")
    print(f"  Bellman-Ford: {t_bf:.4f}s")
    print(f"  SPFA:         {t_spfa:.4f}s")
    print(f"  加速比:       {t_bf / t_spfa:.2f}x")

    # ============================================================
    # 6. 松弛过程可视化
    # ============================================================
    print("\n" + "=" * 72)
    print("6. Bellman-Ford 松弛过程可视化（小图）")
    print("=" * 72)

    tiny_v = ['S', 'A', 'B', 'T']
    tiny_e = [
        ('S', 'A', 3),
        ('S', 'B', 5),
        ('A', 'B', 2),
        ('A', 'T', 7),
        ('B', 'T', 1),
    ]

    dist_viz: Dict[str, float] = {v: math.inf for v in tiny_v}
    dist_viz['S'] = 0.0

    for rnd in range(1, len(tiny_v)):
        updated = False
        print(f"\n  第 {rnd} 轮松弛:")
        for u, v, w in tiny_e:
            if dist_viz[u] != math.inf and dist_viz[u] + w < dist_viz[v]:
                old = dist_viz[v]
                dist_viz[v] = dist_viz[u] + w
                print(f"    {u}→{v}: {old} → {dist_viz[v]} (通过 {u}, 边权 {w})")
                updated = True
        if not updated:
            print("    无更新, 提前收敛")
            break

    print(f"\n  最终距离: {dict(dist_viz)}")
    # S→B: S→A→B = 5 (直接 5, 间接 3+2=5), S→T: S→A→B→T = 6 (或 5+1=6)
    assert dist_viz['S'] == 0.0
    assert dist_viz['A'] == 3.0
    assert dist_viz['B'] == 5.0
    assert dist_viz['T'] == 6.0
    print("  [OK] 松弛过程可视化验证通过")

    # ============================================================
    # 7. 正确性验证
    # ============================================================
    print("\n" + "=" * 72)
    print("7. 正确性验证")
    print("=" * 72)

    # 无负权环图：两个算法结果一致
    for algo_name, d in [("Bellman-Ford", dist), ("SPFA", dist_spfa)]:
        assert d['E'] == 1.0, f"{algo_name}: E 应 = 1.0, 实际 = {d['E']}"
        print(f"  [OK] {algo_name}: E 最短距离 = 1.0")

    # 负权环图：两个算法都正确检测
    assert has_cycle2 and has_cycle_spfa2
    print("  [OK] 负权环检测：Bellman-Ford 和 SPFA 均正确检出")

    # 无负权环的图：SPFA 不应误报
    assert not has_cycle_spfa
    print("  [OK] SPFA 无负权环误报")

    print("\n" + "=" * 72)
    print("全部测试通过！")
    print("=" * 72)


if __name__ == "__main__":
    _test()