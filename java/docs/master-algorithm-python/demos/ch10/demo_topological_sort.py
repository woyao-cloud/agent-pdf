"""
demo_topological_sort.py — 拓扑排序与环检测

包含：
  - Kahn 算法（基于 BFS + 入度）
  - DFS 后序拓扑排序（无环检测）
  - DFS 三色标记拓扑排序（含环检测）
  - 环检测示例
"""

from collections import deque


# ============================================================
# 1. Kahn 算法（基于 BFS + 入度）
# ============================================================
def kahn_topological_sort(graph):
    """
    Kahn 算法实现拓扑排序。

    如果存在环，返回 None；否则返回拓扑序列。
    """
    n = len(graph)
    in_degree = [0] * n
    for u in range(n):
        for v in graph[u]:
            in_degree[v] += 1

    queue = deque([u for u in range(n) if in_degree[u] == 0])
    result = []

    while queue:
        u = queue.popleft()
        result.append(u)
        for v in graph[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)

    if len(result) != n:
        return None  # 存在环
    return result


# ============================================================
# 2. DFS 后序拓扑排序（无环检测）
# ============================================================
def dfs_topological_sort(graph):
    """
    DFS 后序法拓扑排序。
    不检测环 —— 如果图中有环，结果不是有效的拓扑序。
    """
    n = len(graph)
    visited = [False] * n
    result = []

    def dfs(u):
        visited[u] = True
        for v in graph[u]:
            if not visited[v]:
                dfs(v)
        result.append(u)  # 后序加入

    for i in range(n):
        if not visited[i]:
            dfs(i)

    result.reverse()  # 后序的逆序 = 拓扑序
    return result


# ============================================================
# 3. DFS 三色标记拓扑排序（含环检测）
# ============================================================
WHITE, GRAY, BLACK = 0, 1, 2


def dfs_topological_sort_with_cycle_detection(graph):
    """
    DFS 三色标记法，在拓扑排序的同时检测环。

    颜色含义：
      WHITE = 未访问
      GRAY  = 在当前 DFS 栈中（尚未返回）
      BLACK = 已处理完毕

    如果在 GRAY 节点上遇到一条边，说明存在环。
    """
    n = len(graph)
    color = [WHITE] * n
    result = []
    has_cycle = [False]

    def dfs(u):
        color[u] = GRAY
        for v in graph[u]:
            if color[v] == GRAY:
                has_cycle[0] = True  # 后向边 → 环
            if color[v] == WHITE:
                dfs(v)
        color[u] = BLACK
        result.append(u)  # 后序加入

    for i in range(n):
        if color[i] == WHITE:
            dfs(i)

    if has_cycle[0]:
        return None
    result.reverse()
    return result


# ============================================================
# 4. 环检测（不要求拓扑序，只判断是否有环）
# ============================================================
def has_cycle_dfs(graph):
    """DFS 三色标记法，仅检测是否有环。"""
    n = len(graph)
    color = [WHITE] * n

    def dfs(u):
        color[u] = GRAY
        for v in graph[u]:
            if color[v] == GRAY:
                return True
            if color[v] == WHITE and dfs(v):
                return True
        color[u] = BLACK
        return False

    for i in range(n):
        if color[i] == WHITE:
            if dfs(i):
                return True
    return False


def has_cycle_kahn(graph):
    """Kahn 算法检测环：如果无法移出所有顶点则存在环。"""
    return kahn_topological_sort(graph) is None


# ============================================================
# Demo 入口
# ============================================================
def _build_dag():
    """
    有向无环图 (DAG):
        0 → 1 → 3 → 4 → 5
        ↓         ↑
        2 ────────┘
    """
    n = 6
    graph = [[] for _ in range(n)]
    edges = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4), (4, 5)]
    for u, v in edges:
        graph[u].append(v)
    return graph, "DAG（无环）"


def _build_cyclic_graph():
    """
    有环图:
        0 → 1 → 2
        ↑       ↓
        └── 3 ←─┘
    """
    n = 4
    graph = [[] for _ in range(n)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 0)]
    for u, v in edges:
        graph[u].append(v)
    return graph, "有环图"


def _build_dag_multiple_sources():
    """
    多源 DAG（多个入度为 0 的顶点）:
        0 → 2 → 4
        1 → 3 ↗
    """
    n = 5
    graph = [[] for _ in range(n)]
    edges = [(0, 2), (1, 3), (2, 4), (3, 4)]
    for u, v in edges:
        graph[u].append(v)
    return graph, "多源 DAG"


def _run_single_test(graph, name):
    print(f"\n{'─' * 60}")
    print(f"  图: {name}")
    print(f"  边: {[(u, v) for u in range(len(graph)) for v in graph[u]]}")
    print(f"{'─' * 60}")

    # Kahn 算法
    result = kahn_topological_sort(graph)
    print(f"\n  Kahn 拓扑排序:")
    if result is None:
        print(f"    结果: [FAIL] 存在环，无法拓扑排序")
    else:
        print(f"    结果: {result}")

    # DFS 后序（无环检测）
    result_dfs = dfs_topological_sort(graph)
    print(f"\n  DFS 后序拓扑排序:")
    print(f"    结果: {result_dfs}")

    # DFS 三色标记法（含环检测）
    result_safe = dfs_topological_sort_with_cycle_detection(graph)
    print(f"\n  DFS 三色标记（含环检测）:")
    if result_safe is None:
        print(f"    结果: [FAIL] 检测到环，无法拓扑排序")
    else:
        print(f"    结果: {result_safe}")

    # 环检测
    cycle_dfs = has_cycle_dfs(graph)
    cycle_kahn = has_cycle_kahn(graph)
    print(f"\n  环检测:")
    print(f"    DFS 三色标记: {'有环 [FAIL]' if cycle_dfs else '无环 [OK]'}")
    print(f"    Kahn 算法:    {'有环 [FAIL]' if cycle_kahn else '无环 [OK]'}")

    status = "[OK]" if cycle_dfs == cycle_kahn else "[FAIL]"
    print(f"    一致性: {status}")


def _run_in_degree_visualization():
    """展示 Kahn 算法的入度变化过程。"""
    print(f"\n{'=' * 60}")
    print(f"  Kahn 算法 — 入度变化追踪")
    print(f"{'=' * 60}")

    graph, _ = _build_dag()
    n = len(graph)

    in_degree = [0] * n
    for u in range(n):
        for v in graph[u]:
            in_degree[v] += 1

    print(f"\n  初始入度: {in_degree}")

    queue = deque([u for u in range(n) if in_degree[u] == 0])
    result = []
    step = 1

    while queue:
        u = queue.popleft()
        result.append(u)
        print(f"  步骤 {step}: 弹出 {u}, 结果={result}")

        for v in graph[u]:
            in_degree[v] -= 1
            print(f"          顶点 {v} 入度 → {in_degree[v]}")
            if in_degree[v] == 0:
                queue.append(v)
                print(f"          顶点 {v} 入队")

        step += 1

    print(f"\n  最终拓扑序: {result}")
    print(f"  结果长度 = {len(result)}, n = {n}")
    print(f"  {'[OK] 拓扑排序成功' if len(result) == n else '[FAIL] 存在环'}")


if __name__ == "__main__":
    print("=" * 60)
    print("  拓扑排序与环检测")
    print("=" * 60)

    test_cases = [
        _build_dag(),
        _build_cyclic_graph(),
        _build_dag_multiple_sources(),
    ]

    for graph, name in test_cases:
        _run_single_test(graph, name)

    _run_in_degree_visualization()

    print("\n" + "=" * 60)
    print("  所有演示完成!")
    print("=" * 60)