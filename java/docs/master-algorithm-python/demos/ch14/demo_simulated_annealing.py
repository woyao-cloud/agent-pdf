"""
demo_simulated_annealing.py — 模拟退火求解 TSP

配合第14章"组合优化"之 14.3.1（模拟退火）使用。

演示内容：
  1. 随机生成城市坐标
  2. 模拟退火求解 TSP（2-opt 邻域交换）
  3. 可视化收敛曲线和最终路径
"""

import math
import random
import matplotlib.pyplot as plt


# ============================================================
# TSP 工具函数
# ============================================================

def euclidean_dist(a: tuple, b: tuple) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def total_distance(tour: list, cities: list) -> float:
    """计算一个巡回的总距离（包括回到起点）"""
    dist = 0.0
    for i in range(len(tour) - 1):
        dist += euclidean_dist(cities[tour[i]], cities[tour[i + 1]])
    dist += euclidean_dist(cities[tour[-1]], cities[tour[0]])
    return dist


def random_tour(n: int) -> list:
    """生成随机巡回"""
    tour = list(range(n))
    random.shuffle(tour)
    return tour


def two_opt_swap(tour: list, i: int, j: int) -> list:
    """2-opt 交换：反转 tour[i:j+1] 之间的子路径"""
    new_tour = tour[:]
    new_tour[i:j + 1] = reversed(tour[i:j + 1])
    return new_tour


# ============================================================
# 模拟退火求解 TSP
# ============================================================

def simulated_annealing_tsp(
    cities: list,
    initial_temp: float = 10000.0,
    cooling_rate: float = 0.995,
    min_temp: float = 1e-8,
    iterations_per_temp: int = 100,
    random_seed: int = 42
) -> tuple:
    """
    模拟退火求解 TSP。

    参数：
        cities: 城市坐标列表 [(x1,y1), (x2,y2), ...]
        initial_temp: 初始温度
        cooling_rate: 降温速率 α
        min_temp: 终止温度
        iterations_per_temp: 每个温度下的迭代次数
        random_seed: 随机种子

    返回：
        (best_tour, best_distance, history)
        history 为每轮迭代的最佳距离记录
    """
    random.seed(random_seed)
    n = len(cities)

    current_tour = random_tour(n)
    current_dist = total_distance(current_tour, cities)

    best_tour = current_tour[:]
    best_dist = current_dist

    temp = initial_temp
    history = [best_dist]

    while temp > min_temp:
        for _ in range(iterations_per_temp):
            # 随机选择 2-opt 交换位置
            i = random.randint(0, n - 3)
            j = random.randint(i + 1, n - 1)

            new_tour = two_opt_swap(current_tour, i, j)
            new_dist = total_distance(new_tour, cities)

            delta = new_dist - current_dist

            if delta < 0:
                # 更好的解，直接接受
                current_tour = new_tour
                current_dist = new_dist
                if current_dist < best_dist:
                    best_tour = current_tour[:]
                    best_dist = current_dist
            else:
                # 更差的解，以概率接受
                acceptance_prob = math.exp(-delta / temp)
                if random.random() < acceptance_prob:
                    current_tour = new_tour
                    current_dist = new_dist

        temp *= cooling_rate
        history.append(best_dist)

    return best_tour, best_dist, history


# ============================================================
# 可视化
# ============================================================

def plot_tsp(cities: list, tour: list, title: str = "TSP Tour"):
    """绘制 TSP 路径"""
    xs = [cities[tour[i]][0] for i in range(len(tour))]
    ys = [cities[tour[i]][1] for i in range(len(tour))]
    xs.append(cities[tour[0]][0])
    ys.append(cities[tour[0]][1])

    plt.figure(figsize=(8, 4))

    plt.subplot(1, 2, 1)
    plt.plot(xs, ys, 'b-o', markersize=6)
    plt.scatter(xs[0], ys[0], c='red', s=80, zorder=5, label="Start")
    for i, (x, y) in enumerate(cities):
        plt.text(x + 0.3, y + 0.3, str(i), fontsize=10)
    plt.title(title)
    plt.xlabel("x")
    plt.ylabel("y")
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.axis("equal")
    plt.legend()

    plt.tight_layout()
    plt.savefig("tsp_simulated_annealing.png", dpi=150)
    plt.show()


def plot_convergence(history: list):
    """绘制收敛曲线"""
    plt.figure(figsize=(6, 4))
    plt.plot(history, 'b-', linewidth=1.5)
    plt.title("Simulated Annealing — Convergence")
    plt.xlabel("Iteration (×100)")
    plt.ylabel("Best Distance")
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.tight_layout()
    plt.savefig("tsp_convergence.png", dpi=150)
    plt.show()


# ============================================================
# 测试
# ============================================================

def _test():
    print("=" * 72)
    print("模拟退火求解 TSP 演示")
    print("=" * 72)

    # ---- 生成随机城市 ----
    random.seed(42)
    n_cities = 20
    cities = [(random.uniform(0, 100), random.uniform(0, 100))
              for _ in range(n_cities)]

    print(f"\n城市数量: {n_cities}")
    print(f"城市坐标（前5个）: {cities[:5]}")

    # ---- 贪心构造初始解（作为基准） ----
    print("\n" + "-" * 72)
    print("基准：贪心最近邻法构造初始解")
    print("-" * 72)

    start = 0
    greedy_tour = [start]
    unvisited = set(range(1, n_cities))
    current = start
    while unvisited:
        next_city = min(unvisited, key=lambda c: euclidean_dist(cities[current], cities[c]))
        greedy_tour.append(next_city)
        unvisited.remove(next_city)
        current = next_city
    greedy_dist = total_distance(greedy_tour, cities)
    print(f"  贪心巡回距离: {greedy_dist:.2f}")

    # ---- 模拟退火 ----
    print("\n" + "-" * 72)
    print("模拟退火求解")
    print("-" * 72)

    configs = [
        ("α=0.95", 10000, 0.95, 100),
        ("α=0.98", 10000, 0.98, 100),
        ("α=0.99", 10000, 0.99, 100),
    ]

    results = []
    for label, init_t, alpha, iters in configs:
        tour, dist, history = simulated_annealing_tsp(
            cities, initial_temp=init_t, cooling_rate=alpha,
            min_temp=1e-6, iterations_per_temp=iters, random_seed=42
        )
        results.append((label, dist, history))
        improvement = (greedy_dist - dist) / greedy_dist * 100
        print(f"  {label:<12} 解: {dist:.2f}  (比贪心改进 {improvement:+.1f}%)")

    # ---- 最终结果 ----
    best_idx = min(range(len(results)), key=lambda i: results[i][1])
    best_label, best_dist, best_history = results[best_idx]
    best_tour, _, _ = simulated_annealing_tsp(
        cities, initial_temp=10000, cooling_rate=0.99,
        min_temp=1e-6, iterations_per_temp=100, random_seed=42
    )

    print(f"\n{'=' * 72}")
    print(f"最佳配置: {best_label}, 距离: {best_dist:.2f}")
    print(f"最佳巡回: {best_tour}")
    print(f"巡回路径: ", end="")
    for i in range(len(best_tour)):
        print(f"{best_tour[i]} → ", end="")
    print(f"{best_tour[0]}")

    # ---- 收敛曲线（最佳配置） ----
    plot_convergence(best_history)

    # ---- 最终路径 ----
    plot_tsp(cities, best_tour, title=f"TSP — Simulated Annealing (Distance: {best_dist:.2f})")


if __name__ == "__main__":
    _test()