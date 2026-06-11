"""
demo_floyd_warshall.py — Floyd-Warshall 全源最短路径算法演示

配合第11章"图算法 - 最短路径"之 11.4 使用。

演示内容：
  1. 标准 Floyd-Warshall（三维 DP → 二维原地更新）
  2. 路径重建（next 矩阵追踪中间顶点）
  3. 负权环检测
  4. DP 过程可视化（引入每个中间顶点后的矩阵变化）
  5. 传递闭包（Transitive Closure）变体
  6. 性能基准测试
"""

import math
import random
import time
from typing import Dict, List, Optional, Tuple


# ============================================================
# Floyd-Warshall 实现
# ============================================================
def floyd_warshall(vertices: List[str],
                   edges: List[Tuple[str, str, int]]
                   ) -> Tuple[List[List[float]], List[List[Optional[int]]], bool]:
    """
    Floyd-Warshall 算法 - O(V³)。

    vertices: 顶点列表
    edges: 边列表 [(u, v, weight), ...]

    返回: (dist, next, has_negative_cycle)
        dist[i][j] = 顶点 i 到 j 的最短距离
        next[i][j] = i 到 j 路径上的下一个顶点索引（用于路径重建）
    """
    n = len(vertices)
    idx = {v: i for i, v in enumerate(vertices)}

    INF = math.inf
    dist = [[INF] * n for _ in range(n)]
    nxt = [[-1] * n for _ in range(n)]

    for i in range(n):
        dist[i][i] = 0.0

    for u, v, w in edges:
        i, j = idx[u], idx[v]
        if w < dist[i][j]:
            dist[i][j] = float(w)
            nxt[i][j] = j

    for k in range(n):
        for i in range(n):
            if dist[i][k] == INF:
                continue
            for j in range(n):
                if dist[k][j] == INF:
                    continue
                nd = dist[i][k] + dist[k][j]
                if nd < dist[i][j]:
                    dist[i][j] = nd
                    nxt[i][j] = nxt[i][k]

    has_negative_cycle = any(dist[i][i] < 0 for i in range(n))

    return dist, nxt, has_negative_cycle


# ============================================================
# 路径重建
# ============================================================
def reconstruct_path(nxt: List[List[Optional[int]]],
                     start: int, target: int,
                     vertices: List[str]) -> List[str]:
    """从 next 矩阵重建路径"""
    if start == target:
        return [vertices[start]]
    if nxt[start][target] == -1:
        return []  # 不可达
    path = [vertices[start]]
    while start != target:
        start = nxt[start][target]
        if start == -1:
            return []
        path.append(vertices[start])
    return path


# ============================================================
# 传递闭包（Transitive Closure）
# ============================================================
def transitive_closure(vertices: List[str],
                       edges: List[Tuple[str, str, int]]) -> List[List[bool]]:
    """
    传递闭包：计算图中任意两点之间是否存在路径（不论权值）。

    使用 Floyd-Warshall 的思想，将 min(+) 替换为 OR(AND)。
    reachable[i][j] = True 如果 i 到 j 存在路径。
    """
    n = len(vertices)
    idx = {v: i for i, v in enumerate(vertices)}
    reachable = [[False] * n for _ in range(n)]

    for i in range(n):
        reachable[i][i] = True

    for u, v, _ in edges:
        i, j = idx[u], idx[v]
        reachable[i][j] = True

    for k in range(n):
        for i in range(n):
            if reachable[i][k]:
                row_k = reachable[k]
                row_i = reachable[i]
                for j in range(n):
                    if row_k[j]:
                        row_i[j] = True

    return reachable


# ============================================================
# DP 过程可视化（逐步打印矩阵）
# ============================================================
def print_matrix(step: int, k: Optional[str], vertices: List[str],
                 dist: List[List[float]]):
    """打印当前距离矩阵"""
    n = len(vertices)
    label = f"k={k}" if k is not None else "初始"
    print(f"\n  step {step}: {label}")

    # 表头
    header = "      " + "".join(f"{v:>8}" for v in vertices)
    print(f"  {header}")

    for i in range(n):
        row = f"  {vertices[i]:>4} "
        for j in range(n):
            val = dist[i][j]
            if math.isinf(val):
                row += "     ∞ "
            else:
                row += f"{val:>8.0f}"
        print(row)


# ============================================================
# 测试用例构建器
# ============================================================
def build_test_graph() -> Tuple[List[str], List[Tuple[str, str, int]]]:
    """标准测试图"""
    vertices = ['A', 'B', 'C', 'D']
    edges = [
        ('A', 'B', 3),
        ('A', 'C', 8),
        ('A', 'D', -4),
        ('B', 'C', 1),
        ('B', 'D', 7),
        ('C', 'A', 4),
        ('D', 'C', 2),
        ('D', 'B', 5),
    ]
    return vertices, edges


def build_disconnected_graph() -> Tuple[List[str], List[Tuple[str, str, int]]]:
    """不连通图"""
    vertices = ['A', 'B', 'C', 'D', 'E']
    edges = [
        ('A', 'B', 2),
        ('C', 'D', 3),
    ]
    return vertices, edges


def build_random_dense(n: int, seed: int = 0) -> Tuple[List[str], List[Tuple[str, str, int]]]:
    """随机稠密有向图"""
    random.seed(seed)
    vertices = [str(i) for i in range(n)]
    edges = []
    for i in range(n):
        for j in range(n):
            if i != j and random.random() < 0.4:
                w = random.randint(1, 20)
                edges.append((vertices[i], vertices[j], w))
    return vertices, edges


# ============================================================
# 打印辅助
# ============================================================
def print_dist_matrix(vertices: List[str], dist: List[List[float]]):
    """格式化打印距离矩阵"""
    n = len(vertices)
    width = 8
    print(f"\n{'':>{width}}", end="")
    for v in vertices:
        print(f"{v:>{width}}", end="")
    print()
    for i in range(n):
        print(f"{vertices[i]:>{width}}", end="")
        for j in range(n):
            d = dist[i][j]
            if math.isinf(d):
                print(f"{'∞':>{width}}", end="")
            elif d == 0:
                print(f"{'0':>{width}}", end="")
            else:
                print(f"{d:>{width}.0f}", end="")
        print()


def print_dist_matrix_colored(vertices: List[str], dist: List[List[float]]):
    """打印距离矩阵（对角线标出 INF 和负值）"""
    n = len(vertices)
    print()
    header = "      " + "".join(f"{v:>6}" for v in vertices)
    print(f"  {header}")
    for i in range(n):
        row = f"  {vertices[i]:>4} "
        for j in range(n):
            d = dist[i][j]
            if math.isinf(d):
                row += "    ∞"
            elif d < 0:
                row += f"  {d:>4.0f}"  # 负值
            else:
                row += f"{d:>6.0f}"
        print(row)


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("Floyd-Warshall 全源最短路径算法演示")
    print("=" * 72)

    # ============================================================
    # 1. 标准测试
    # ============================================================
    print("\n" + "=" * 72)
    print("1. 标准测试图（含负权边，无负权环）")
    print("=" * 72)

    v1, e1 = build_test_graph()
    dist1, nxt1, has_cycle1 = floyd_warshall(v1, e1)

    print("\n  输入图:")
    print(f"  顶点: {v1}")
    for u, v, w in e1:
        print(f"    {u} → {v} (w={w})")

    print(f"\n  有负权环: {has_cycle1}")

    print("\n  距离矩阵:")
    print_dist_matrix_colored(v1, dist1)

    # 验证关键最短路径
    idx = {v: i for i, v in enumerate(v1)}
    # A→B = -4+5=1 (via D) vs direct 3
    assert dist1[idx['A']][idx['B']] == 1.0, f"A→B: expected 1, got {dist1[idx['A']][idx['B']]}"
    # A→C = -4+2=-2 (via D) vs direct 8
    assert dist1[idx['A']][idx['C']] == -2.0, f"A→C: expected -2, got {dist1[idx['A']][idx['C']]}"
    # A→D = -4 (direct)
    assert dist1[idx['A']][idx['D']] == -4.0, f"A→D: expected -4, got {dist1[idx['A']][idx['D']]}"
    # B→A = 1+4=5 (via C)
    assert dist1[idx['B']][idx['A']] == 5.0, f"B→A: expected 5, got {dist1[idx['B']][idx['A']]}"
    # B→D = 1+4+(-4)=1 (via C→A→D) vs direct 7
    assert dist1[idx['B']][idx['D']] == 1.0, f"B→D: expected 1, got {dist1[idx['B']][idx['D']]}"
    # 无负权环（对角线均为0）
    assert all(dist1[i][i] == 0 for i in range(len(v1)))
    print("\n  [OK] 所有关键最短路径验证通过")

    # ============================================================
    # 2. 路径重建
    # ============================================================
    print("\n" + "=" * 72)
    print("2. 路径重建")
    print("=" * 72)

    pairs = [('A', 'C'), ('D', 'A'), ('A', 'B'), ('B', 'D')]
    for s, t in pairs:
        si, tj = idx[s], idx[t]
        d = dist1[si][tj]
        path = reconstruct_path(nxt1, si, tj, v1)
        if path:
            path_str = " → ".join(path)
            print(f"  {s} → {t}: 距离={d:+.0f}, 路径={path_str}")
        else:
            print(f"  {s} → {t}: 不可达")

    # ============================================================
    # 3. DP 过程可视化
    # ============================================================
    print("\n" + "=" * 72)
    print("3. DP 过程可视化（逐步引入中间顶点）")
    print("=" * 72)

    n_small = len(v1)
    INF = math.inf
    dist_step = [[INF] * n_small for _ in range(n_small)]
    for i in range(n_small):
        dist_step[i][i] = 0
    for u, v, w in e1:
        i, j = idx[u], idx[v]
        if w < dist_step[i][j]:
            dist_step[i][j] = float(w)

    print_matrix(0, None, v1, dist_step)

    for k in range(n_small):
        for i in range(n_small):
            if dist_step[i][k] == INF:
                continue
            for j in range(n_small):
                if dist_step[k][j] == INF:
                    continue
                nd = dist_step[i][k] + dist_step[k][j]
                if nd < dist_step[i][j]:
                    dist_step[i][j] = nd
        print_matrix(k + 1, v1[k], v1, dist_step)

    # ============================================================
    # 4. 不连通图
    # ============================================================
    print("\n" + "=" * 72)
    print("4. 不连通图")
    print("=" * 72)

    v2, e2 = build_disconnected_graph()
    dist2, nxt2, has_cycle2 = floyd_warshall(v2, e2)
    print(f"  顶点: {v2}, 边: {e2}")
    print(f"  有负权环: {has_cycle2}")
    print("\n  距离矩阵:")
    print_dist_matrix_colored(v2, dist2)

    assert not has_cycle2
    assert math.isinf(dist2[0][2])  # A→C 不可达
    assert dist2[0][1] == 2.0  # A→B = 2
    print("\n  [OK] 不连通图正确处理")

    # ============================================================
    # 5. 负权环检测
    # ============================================================
    print("\n" + "=" * 72)
    print("5. 负权环检测")
    print("=" * 72)

    cycle_vertices = ['A', 'B', 'C']
    cycle_edges = [
        ('A', 'B', 1),
        ('B', 'C', 1),
        ('C', 'A', -3),  # A→B→C→A = 1+1-3 = -1 < 0
    ]
    _, _, has_cycle3 = floyd_warshall(cycle_vertices, cycle_edges)
    print(f"  负权环 A→B→C→A (总权 -1): {has_cycle3}")
    assert has_cycle3
    print("  [OK] 负权环正确检出")

    # ============================================================
    # 6. 传递闭包
    # ============================================================
    print("\n" + "=" * 72)
    print("6. 传递闭包（Transitive Closure）")
    print("=" * 72)

    tc = transitive_closure(v1, e1)
    print("\n  可达性矩阵:")
    print(f"      " + "".join(f"{v:>6}" for v in v1))
    for i, v in enumerate(v1):
        row = f"  {v:>4} "
        for j in range(len(v1)):
            row += f"{'  T  ' if tc[i][j] else '  .  '}"
        print(row)

    # A 可达所有顶点
    assert all(tc[0][j] for j in range(len(v1)))
    print("\n  [OK] 传递闭包正确")

    # ============================================================
    # 7. 性能基准
    # ============================================================
    print("\n" + "=" * 72)
    print("7. 性能基准测试")
    print("=" * 72)

    for n in [50, 100, 150]:
        v, e = build_random_dense(n, seed=0)
        t0 = time.perf_counter()
        floyd_warshall(v, e)
        elapsed = time.perf_counter() - t0
        print(f"  V={n:>3}: {elapsed:.4f}s (E={len(e):>5})")

    # ============================================================
    # 8. 正确性验证
    # ============================================================
    print("\n" + "=" * 72)
    print("8. 正确性验证")
    print("=" * 72)

    # 三角不等式：dist[i][j] ≤ dist[i][k] + dist[k][j]
    n = len(v1)
    all_triangle = all(
        dist1[i][j] <= dist1[i][k] + dist1[k][j] + 1e-9
        for i in range(n) for j in range(n) for k in range(n)
        if not math.isinf(dist1[i][j])
    )
    print(f"  三角不等式验证: {'[OK] 通过' if all_triangle else '[FAIL] 失败'}")

    # 自反性：dist[i][i] = 0
    all_reflex = all(dist1[i][i] == 0 for i in range(n))
    print(f"  自反性验证: {'[OK] 通过' if all_reflex else '[FAIL] 失败'}")

    # 与 Djikstra 单源结果对比（非负权边部分）
    v_small, e_small = ['A', 'B', 'C'], [('A', 'B', 2), ('B', 'C', 3), ('A', 'C', 6)]
    d_fw, _, _ = floyd_warshall(v_small, e_small)

    # 手动计算：A→C 最短应为 A→B→C = 5
    assert d_fw[0][2] == 5.0, f"Expected A→C = 5, got {d_fw[0][2]}"
    print(f"  Floyd-Warshall vs 手动计算: [OK] 通过")

    print("\n" + "=" * 72)
    print("全部测试通过！")
    print("=" * 72)


if __name__ == "__main__":
    _test()