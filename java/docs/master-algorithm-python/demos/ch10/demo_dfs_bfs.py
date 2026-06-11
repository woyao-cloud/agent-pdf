"""
demo_dfs_bfs.py — 深度优先搜索与广度优先搜索

包含：
  - DFS 递归实现
  - DFS 迭代实现（显式栈）
  - DFS 遍历路径追踪（pre-order / post-order）
  - BFS 实现
  - BFS 最短路径（无权图）
  - 双向 BFS
  - 完整遍历示例与遍历顺序输出
"""

from collections import deque


# ============================================================
# 1. DFS 递归实现
# ============================================================
def dfs_recursive(graph, start):
    """DFS 递归版本，返回遍历顺序。"""
    visited = set()
    order = []

    def _dfs(v):
        visited.add(v)
        order.append(v)
        for nb in graph[v]:
            if nb not in visited:
                _dfs(nb)

    _dfs(start)
    return order


# ============================================================
# 2. DFS 迭代实现（显式栈）
# ============================================================
def dfs_iterative(graph, start):
    """DFS 迭代版本（显式栈），返回遍历顺序。"""
    visited = set()
    stack = [start]
    order = []

    while stack:
        v = stack.pop()
        if v not in visited:
            visited.add(v)
            order.append(v)
            # 逆序入栈以模拟递归的顺序
            for nb in reversed(graph[v]):
                if nb not in visited:
                    stack.append(nb)
    return order


# ============================================================
# 3. DFS 路径追踪（pre-order / post-order）
# ============================================================
def dfs_trace(graph, start):
    """返回 pre-order（进入时）和 post-order（离开时）两个序列。"""
    visited = set()
    pre = []
    post = []

    def _dfs(v):
        visited.add(v)
        pre.append(f"enter {v}")
        for nb in graph[v]:
            if nb not in visited:
                _dfs(nb)
        post.append(f"leave {v}")

    _dfs(start)
    return pre, post


# ============================================================
# 4. BFS 实现
# ============================================================
def bfs(graph, start):
    """BFS，返回遍历顺序。"""
    visited = {start}
    queue = deque([start])
    order = []

    while queue:
        v = queue.popleft()
        order.append(v)
        for nb in graph[v]:
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)
    return order


# ============================================================
# 5. BFS 最短路径（无权图）
# ============================================================
def bfs_shortest_path(graph, start, target):
    """
    返回从 start 到 target 的最短路径（无权图）。
    如果不存在路径，返回 None。
    """
    if start == target:
        return [start]

    visited = {start}
    queue = deque([[start]])

    while queue:
        path = queue.popleft()
        v = path[-1]
        for nb in graph[v]:
            if nb == target:
                return path + [nb]
            if nb not in visited:
                visited.add(nb)
                queue.append(path + [nb])
    return None


def bfs_distance_all(graph, start):
    """返回从 start 到所有可达顶点的最短距离（边数）。"""
    dist = {}
    for v in range(len(graph)):
        dist[v] = float("inf")

    dist[start] = 0
    queue = deque([start])

    while queue:
        v = queue.popleft()
        for nb in graph[v]:
            if dist[nb] == float("inf"):
                dist[nb] = dist[v] + 1
                queue.append(nb)
    return dist


# ============================================================
# 6. 双向 BFS
# ============================================================
def bidirectional_bfs(graph, start, target):
    """双向 BFS，返回最短路径（无权图）。"""
    if start == target:
        return [start]

    front_prev = {start: None}
    back_prev = {target: None}
    front_queue = deque([start])
    back_queue = deque([target])

    def _build_path(meet_node, front_prev, back_prev):
        path = []
        node = meet_node
        while node is not None:
            path.append(node)
            node = front_prev[node]
        path.reverse()
        node = back_prev[meet_node]
        while node is not None:
            path.append(node)
            node = back_prev[node]
        return path

    while front_queue and back_queue:
        for _ in range(len(front_queue)):
            v = front_queue.popleft()
            for nb in graph[v]:
                if nb not in front_prev:
                    front_prev[nb] = v
                    if nb in back_prev:
                        return _build_path(nb, front_prev, back_prev)
                    front_queue.append(nb)

        for _ in range(len(back_queue)):
            v = back_queue.popleft()
            for nb in graph[v]:
                if nb not in back_prev:
                    back_prev[nb] = v
                    if nb in front_prev:
                        return _build_path(nb, front_prev, back_prev)
                    back_queue.append(nb)

    return None


# ============================================================
# Demo 入口
# ============================================================
def _build_sample_graph():
    """
    无向图：
        0 -- 1 -- 2 -- 3
        |    |
        4 -- 5
    """
    n = 6
    graph = [[] for _ in range(n)]
    edges = [(0, 1), (1, 2), (2, 3), (0, 4), (1, 5), (4, 5)]
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    return graph


def _build_dag_graph():
    """有向无环图（用于对比演示）。"""
    n = 6
    graph = [[] for _ in range(n)]
    edges = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4), (4, 5)]
    for u, v in edges:
        graph[u].append(v)
    return graph


def _run_dfs_demo(graph):
    print("=" * 56)
    print("  DFS 深度优先搜索")
    print("=" * 56)

    print("\n[1] DFS 递归遍历:")
    order_rec = dfs_recursive(graph, 0)
    print(f"    遍历顺序: {order_rec}")

    print("\n[2] DFS 迭代遍历:")
    order_it = dfs_iterative(graph, 0)
    print(f"    遍历顺序: {order_it}")

    print("\n[3] DFS 路径追踪 (pre-order / post-order):")
    pre, post = dfs_trace(graph, 0)
    for p in pre:
        print(f"    {p}")
    for p in post:
        print(f"    {p}")

    match = "[OK]" if order_rec == order_it else "[DIFF]（顺序不同但都是有效 DFS）"
    print(f"\n    递归 vs 迭代顺序一致: {match}")


def _run_bfs_demo(graph):
    print("\n" + "=" * 56)
    print("  BFS 广度优先搜索")
    print("=" * 56)

    print("\n[1] BFS 遍历:")
    order = bfs(graph, 0)
    print(f"    遍历顺序: {order}")

    print("\n[2] BFS 最短距离（从顶点 0 到所有顶点）:")
    dist = bfs_distance_all(graph, 0)
    for v, d in dist.items():
        status = f"距离 = {int(d)}" if d != float("inf") else "不可达"
        print(f"    0 → {v}: {status}")

    print("\n[3] BFS 最短路径（从 0 到 3）:")
    path = bfs_shortest_path(graph, 0, 3)
    print(f"    路径: {path} (长度 = {len(path) - 1})")

    print("\n[4] 双向 BFS（从 0 到 3）:")
    bi_path = bidirectional_bfs(graph, 0, 3)
    print(f"    路径: {bi_path} (长度 = {len(bi_path) - 1})")


def _run_dag_demo(dag):
    print("\n" + "=" * 56)
    print("  DAG 上的 DFS 与 BFS")
    print("=" * 56)

    print("\n[1] DAG DFS 递归遍历（从 0 开始）:")
    order = dfs_recursive(dag, 0)
    print(f"    遍历顺序: {order}")

    print("\n[2] DAG BFS 遍历（从 0 开始）:")
    order = bfs(dag, 0)
    print(f"    遍历顺序: {order}")

    print("\n[3] DAG BFS 最短路径（从 0 到 5）:")
    path = bfs_shortest_path(dag, 0, 5)
    print(f"    路径: {path} (长度 = {len(path) - 1})")


def _run_bfs_vs_dfs_comparison(graph):
    print("\n" + "=" * 56)
    print("  BFS vs DFS 对比")
    print("=" * 56)

    bfs_order = bfs(graph, 0)
    dfs_order = dfs_recursive(graph, 0)

    print(f"    图结构:   0 -- 1 -- 2 -- 3")
    print(f"               |    |")
    print(f"               4 -- 5")
    print()
    print(f"    BFS: {bfs_order}  (按层)")
    print(f"    DFS: {dfs_order}  (沿路径先深入)")


if __name__ == "__main__":
    graph = _build_sample_graph()
    dag = _build_dag_graph()

    _run_dfs_demo(graph)
    _run_bfs_demo(graph)
    _run_dag_demo(dag)
    _run_bfs_vs_dfs_comparison(graph)

    print("\n" + "=" * 56)
    print("  所有演示完成!")
    print("=" * 56)