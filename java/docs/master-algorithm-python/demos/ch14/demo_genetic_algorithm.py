"""
demo_genetic_algorithm.py — 遗传算法函数极值优化

配合第14章"组合优化"之 14.3.2（遗传算法）使用。

演示内容：
  1. 二进制编码的遗传算法
  2. 求解函数 f(x) = x·sin(10π·x) + 1 在 [-1, 2] 上的最大值
  3. 可视化逐代进化过程和最终结果
"""

import math
import random
import matplotlib.pyplot as plt


# ============================================================
# 目标函数
# ============================================================

def objective_function(x: float) -> float:
    """
    目标函数：f(x) = x * sin(10π * x) + 1
    定义域：[-1, 2]
    最大值约为 2.85（x ≈ 1.85 附近）
    """
    return x * math.sin(10 * math.pi * x) + 1.0


# ============================================================
# 遗传算法核心组件
# ============================================================

class GeneticAlgorithm:
    """
    遗传算法求解函数最大值。

    编码方式：二进制编码（20 bit），映射到 [-1, 2]
    选择方式：锦标赛选择（Tournament Selection）
    交叉方式：单点交叉（Single-Point Crossover）
    变异方式：位翻转（Bit Flip Mutation）
    """

    # 编码参数
    X_MIN = -1.0
    X_MAX = 2.0
    BITS = 20  # 编码精度 ≈ (3) / 2^20 ≈ 2.86e-6

    def __init__(
        self,
        pop_size: int = 100,
        crossover_rate: float = 0.8,
        mutation_rate: float = 0.05,
        tournament_size: int = 3,
        elitism: int = 2,
        max_generations: int = 100,
        random_seed: int = 42
    ):
        self.pop_size = pop_size
        self.crossover_rate = crossover_rate
        self.mutation_rate = mutation_rate
        self.tournament_size = tournament_size
        self.elitism = elitism
        self.max_generations = max_generations

        random.seed(random_seed)

        # 记录进化历史
        self.history_best = []
        self.history_avg = []
        self.history_best_solution = None

    # ---- 编解码 ----

    def _decode(self, chromosome: str) -> float:
        """将二进制串解码为 [-1, 2] 之间的实数"""
        val = int(chromosome, 2)
        return self.X_MIN + (self.X_MAX - self.X_MIN) * val / (2 ** self.BITS - 1)

    def _encode(self, x: float) -> str:
        """将实数编码为二进制串"""
        ratio = (x - self.X_MIN) / (self.X_MAX - self.X_MIN)
        val = int(ratio * (2 ** self.BITS - 1))
        return format(val, f'0{self.BITS}b')

    def _random_chromosome(self) -> str:
        """生成随机个体"""
        return ''.join(random.choice('01') for _ in range(self.BITS))

    # ---- 适应度 ----

    def _fitness(self, chromosome: str) -> float:
        """适应度函数 = 目标函数值"""
        x = self._decode(chromosome)
        return objective_function(x)

    # ---- 选择 ----

    def _tournament_select(self, population: list) -> str:
        """锦标赛选择：随机挑 k 个，返回最好的"""
        candidates = random.sample(population, self.tournament_size)
        candidates.sort(key=lambda c: self._fitness(c), reverse=True)
        return candidates[0]

    # ---- 交叉 ----

    def _crossover(self, parent1: str, parent2: str) -> tuple:
        """单点交叉"""
        if random.random() < self.crossover_rate:
            point = random.randint(1, self.BITS - 1)
            child1 = parent1[:point] + parent2[point:]
            child2 = parent2[:point] + parent1[point:]
            return child1, child2
        return parent1, parent2

    # ---- 变异 ----

    def _mutate(self, chromosome: str) -> str:
        """位翻转变异"""
        chars = list(chromosome)
        for i in range(len(chars)):
            if random.random() < self.mutation_rate:
                chars[i] = '1' if chars[i] == '0' else '0'
        return ''.join(chars)

    # ---- 主循环 ----

    def run(self) -> tuple:
        """
        运行遗传算法。

        返回：
            (best_x, best_fitness, history_best, history_avg)
        """
        # 初始化种群
        population = [self._random_chromosome() for _ in range(self.pop_size)]

        for gen in range(self.max_generations):
            # 评估适应度
            fitnesses = [self._fitness(c) for c in population]
            best_idx = max(range(len(population)), key=lambda i: fitnesses[i])
            best_fitness = fitnesses[best_idx]
            avg_fitness = sum(fitnesses) / len(fitnesses)
            best_chromosome = population[best_idx]

            self.history_best.append(best_fitness)
            self.history_avg.append(avg_fitness)
            if not self.history_best_solution or best_fitness > self.history_best_solution[1]:
                self.history_best_solution = (self._decode(best_chromosome), best_fitness)

            # 精英保留
            sorted_pop = sorted(population, key=lambda c: self._fitness(c), reverse=True)
            new_population = sorted_pop[:self.elitism]

            # 生成子代
            while len(new_population) < self.pop_size:
                p1 = self._tournament_select(population)
                p2 = self._tournament_select(population)
                c1, c2 = self._crossover(p1, p2)
                c1 = self._mutate(c1)
                c2 = self._mutate(c2)
                new_population.append(c1)
                if len(new_population) < self.pop_size:
                    new_population.append(c2)

            population = new_population

        best_x, best_f = self.history_best_solution
        return best_x, best_f, self.history_best, self.history_avg

    def print_report(self):
        """打印进化报告"""
        print(f"{'Generation':>10} {'Best':>12} {'Avg':>12}")
        print(f"{'-' * 36}")
        for i in range(0, len(self.history_best), max(1, len(self.history_best) // 10)):
            print(f"{i:>10} {self.history_best[i]:>12.6f} {self.history_avg[i]:>12.6f}")
        print(f"{len(self.history_best) - 1:>10} {self.history_best[-1]:>12.6f} {self.history_avg[-1]:>12.6f}")
        print()


# ============================================================
# 可视化
# ============================================================

def plot_function():
    """绘制目标函数"""
    xs = [i / 500.0 * 3 - 1 for i in range(501)]
    ys = [objective_function(x) for x in xs]

    plt.figure(figsize=(10, 8))

    plt.subplot(2, 2, 1)
    plt.plot(xs, ys, 'b-', linewidth=1.5, label="f(x) = x·sin(10π·x) + 1")
    plt.title("Objective Function")
    plt.xlabel("x")
    plt.ylabel("f(x)")
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend()

    return xs, ys


def plot_convergence(ga: GeneticAlgorithm):
    """绘制收敛曲线"""
    plt.subplot(2, 2, 2)
    gens = list(range(len(ga.history_best)))
    plt.plot(gens, ga.history_best, 'g-', linewidth=1.5, label="Best")
    plt.plot(gens, ga.history_avg, 'orange', linewidth=1.0, alpha=0.7, label="Average")
    plt.title("Convergence")
    plt.xlabel("Generation")
    plt.ylabel("Fitness")
    plt.legend()
    plt.grid(True, linestyle='--', alpha=0.6)


def plot_final_result(ga: GeneticAlgorithm, xs: list, ys: list):
    """绘制最终结果"""
    best_x, best_f = ga.history_best_solution

    plt.subplot(2, 2, 3)
    plt.plot(xs, ys, 'b-', linewidth=1.5)
    plt.scatter([best_x], [best_f], c='red', s=100, zorder=5,
                label=f"Best: x={best_x:.6f}, f={best_f:.6f}")
    plt.title("Best Solution Found")
    plt.xlabel("x")
    plt.ylabel("f(x)")
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend()


def plot_population_diversity(ga: GeneticAlgorithm):
    """绘制种群多样性（每代最佳 x 的变化）"""
    plt.subplot(2, 2, 4)
    plt.text(0.1, 0.6, f"Population Size: {ga.pop_size}",
             transform=plt.gca().transAxes, fontsize=12)
    plt.text(0.1, 0.5, f"Crossover Rate: {ga.crossover_rate}",
             transform=plt.gca().transAxes, fontsize=12)
    plt.text(0.1, 0.4, f"Mutation Rate: {ga.mutation_rate}",
             transform=plt.gca().transAxes, fontsize=12)
    plt.text(0.1, 0.3, f"Tournament Size: {ga.tournament_size}",
             transform=plt.gca().transAxes, fontsize=12)
    plt.text(0.1, 0.2, f"Elitism: {ga.elitism}",
             transform=plt.gca().transAxes, fontsize=12)
    plt.text(0.1, 0.1, f"Generations: {ga.max_generations}",
             transform=plt.gca().transAxes, fontsize=12)
    plt.axis("off")
    plt.title("GA Parameters")


# ============================================================
# 测试
# ============================================================

def _test():
    print("=" * 72)
    print("遗传算法函数极值优化演示")
    print("=" * 72)
    print(f"\n目标函数: f(x) = x * sin(10π * x) + 1")
    print(f"定义域: [-1, 2]")
    print()

    # ---- 运行遗传算法 ----
    print("运行遗传算法...")
    print(f"{'':>10} {'Best':>12} {'Avg':>12}")
    print(f"{'-' * 36}")

    ga = GeneticAlgorithm(
        pop_size=100,
        crossover_rate=0.8,
        mutation_rate=0.05,
        tournament_size=3,
        elitism=2,
        max_generations=100,
        random_seed=42
    )

    best_x, best_f, hist_best, hist_avg = ga.run()
    ga.print_report()

    # ---- 结果分析 ----
    print("-" * 72)
    print("结果分析")
    print("-" * 72)
    print(f"最优解 x: {best_x:.6f}")
    print(f"最大函数值: {best_f:.6f}")

    # 暴力搜索验证（用于小规模参考）
    print(f"\n暴力搜索参考（均匀取 10000 点）:")
    xs_ref = [-1.0 + i * 3.0 / 9999 for i in range(10000)]
    best_ref = max((x, objective_function(x)) for x in xs_ref)
    print(f"  暴力搜索 x = {best_ref[0]:.6f}, f(x) = {best_ref[1]:.6f}")
    diff = abs(best_f - best_ref[1])
    print(f"  GA vs 暴力搜索 差异: {diff:.6f}")
    print(f"  相对误差: {diff / best_ref[1] * 100:.4f}%")

    # ---- 不同参数对比 ----
    print("\n" + "-" * 72)
    print("参数对比实验")
    print("-" * 72)

    configs = [
        ("基础版本", 100, 0.8, 0.05),
        ("高变异率", 100, 0.8, 0.20),
        ("低交叉率", 100, 0.3, 0.05),
        ("小种群", 20, 0.8, 0.05),
    ]

    for label, pop, cr, mr in configs:
        ga2 = GeneticAlgorithm(
            pop_size=pop, crossover_rate=cr, mutation_rate=mr,
            max_generations=100, random_seed=42
        )
        x, f_val, _, _ = ga2.run()
        print(f"  {label:<12} best x={x:.6f}, f(x)={f_val:.6f}")

    # ---- 绘图 ----
    xs, ys = plot_function()
    plot_convergence(ga)
    plot_final_result(ga, xs, ys)
    plot_population_diversity(ga)

    plt.suptitle("Genetic Algorithm — Function Optimization", fontsize=14)
    plt.tight_layout()
    plt.savefig("genetic_algorithm_demo.png", dpi=150)
    plt.show()


if __name__ == "__main__":
    _test()