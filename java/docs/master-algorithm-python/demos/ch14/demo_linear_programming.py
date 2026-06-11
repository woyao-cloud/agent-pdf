"""
demo_linear_programming.py — 线性规划演示

配合第14章"组合优化"之 14.4（线性规划基础）使用。

演示内容：
  1. scipy.optimize.linprog 求解生产计划 LP
  2. 纯 Python 手动实现单纯形法（教学用）
  3. 整数线性规划（ILP）的分支定界法
  4. 几何可视化：约束多边形与最优解
"""

import numpy as np
import matplotlib.pyplot as plt

try:
    from scipy.optimize import linprog
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


# ============================================================
# 第1节：scipy.optimize.linprog 求解 LP
# ============================================================

def demo_scipy_lp():
    """
    用 scipy 求解生产计划 LP：

    max  z = 40x1 + 30x2
    s.t. x1 +  x2 ≤ 8
         2x1 +  x2 ≤ 12
         x1, x2 ≥ 0
    """
    print("-" * 72)
    print("1. scipy.optimize.linprog 求解 LP")
    print("-" * 72)

    if not HAS_SCIPY:
        print("  scipy 未安装，跳过此演示。")
        print("  请运行: pip install scipy matplotlib")
        return

    # scipy 的 linprog 默认求解最小化问题
    # max 40x1 + 30x2 → min -40x1 - 30x2
    c = np.array([-40, -30])  # 系数取负

    # A_ub @ x ≤ b_ub
    A_ub = np.array([[1, 1],
                     [2, 1]])
    b_ub = np.array([8, 12])

    # x ≥ 0
    bounds = [(0, None), (0, None)]

    result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method='highs')

    print(f"  状态: {result.message}")
    print(f"  最优解: x1 = {result.x[0]:.4f}, x2 = {result.x[1]:.4f}")
    print(f"  最大利润: z = {-result.fun:.4f}")

    # 手动验证
    print(f"\n  验证约束:")
    print(f"    x1 + x2 = {result.x[0] + result.x[1]:.4f} ≤ 8  (原料A)")
    print(f"    2x1 + x2 = {2 * result.x[0] + result.x[1]:.4f} ≤ 12 (原料B)")

    return result.x


# ============================================================
# 第2节：手动实现单纯形法（教学简化版）
# ============================================================

class SimplexSolver:
    """
    手动实现单纯形法（教学简化版）。

    求解标准形式：
        max  c^T x
        s.t. A x ≤ b
             x ≥ 0

    通过引入松弛变量转化为等式形式：
        max  c^T x
        s.t. [A I] [x; s] = b
             x, s ≥ 0
    """

    def __init__(self, c: np.ndarray, A: np.ndarray, b: np.ndarray):
        """
        参数：
            c: 目标系数 (n,) — 注意：这是最大化问题的系数
            A: 约束矩阵 (m, n)
            b: 约束右端项 (m,)
        """
        self.m, self.n = A.shape
        self.c = np.array(c, dtype=float)
        self.A = np.array(A, dtype=float)
        self.b = np.array(b, dtype=float)

        # 构建初始单纯形表
        # 表结构：前 n 列为原始变量，后 m 列为松弛变量，最后 1 列为 RHS
        self.tableau = np.zeros((self.m + 1, self.n + self.m + 1))

        # 填充约束行
        self.tableau[:self.m, :self.n] = self.A
        self.tableau[:self.m, self.n:self.n + self.m] = np.eye(self.m)
        self.tableau[:self.m, -1] = self.b

        # 填充目标行（最后一行）
        self.tableau[-1, :self.n] = -self.c  # 因为我们要处理 max
        # 松弛变量在目标行中的系数为 0
        # RHS 为 0

        # 初始基变量：松弛变量
        self.basic_vars = list(range(self.n, self.n + self.m))

    def _pivot(self, row: int, col: int):
        """对 (row, col) 进行转轴操作"""
        # 将主元化为 1
        pivot = self.tableau[row, col]
        self.tableau[row, :] /= pivot

        # 对其他行消元
        for r in range(self.tableau.shape[0]):
            if r != row and abs(self.tableau[r, col]) > 1e-12:
                factor = self.tableau[r, col]
                self.tableau[r, :] -= factor * self.tableau[row, :]

    def solve(self, max_iter: int = 1000) -> dict:
        """
        求解 LP。

        返回：
            {'success': bool, 'x': ndarray, 'optimal_value': float, 'iterations': int}
        """
        for iteration in range(max_iter):
            # 最优性检验：检查最后一行（目标行）的 reduced cost
            # 如果所有非基变量的 reduced cost ≥ 0（对于 max 问题），则达到最优
            last_row = self.tableau[-1, :]

            # 找出最负的 reduced cost（进基变量选择——Dantzig 规则）
            enter = -1
            min_val = 0
            for j in range(self.n + self.m):
                if j not in self.basic_vars and last_row[j] < min_val - 1e-12:
                    min_val = last_row[j]
                    enter = j

            if enter == -1:
                # 已到达最优
                break

            # 最小比值法则确定离基变量
            ratios = []
            for i in range(self.m):
                if self.tableau[i, enter] > 1e-12:
                    ratios.append((self.tableau[i, -1] / self.tableau[i, enter], i))

            if not ratios:
                return {'success': False, 'message': '问题无界 (Unbounded)',
                        'x': None, 'optimal_value': None, 'iterations': iteration}

            # 选择最小比值的行
            min_ratio, leave = min(ratios, key=lambda r: r[0])

            # 转轴
            self._pivot(leave, enter)
            self.basic_vars[leave] = enter

        # 提取解
        x = np.zeros(self.n + self.m)
        for i in range(self.m):
            basic_var = self.basic_vars[i]
            x[basic_var] = self.tableau[i, -1]

        optimal_value = self.tableau[-1, -1]

        return {
            'success': True,
            'message': '最优解已找到',
            'x': x[:self.n],
            'slack': x[self.n:],
            'optimal_value': optimal_value,
            'iterations': iteration + 1
        }


def demo_simplex_manual():
    """手动单纯形法演示"""
    print("\n" + "-" * 72)
    print("2. 手动实现单纯形法求解")
    print("-" * 72)

    # 生产计划问题
    # max 40x1 + 30x2
    # s.t. x1 + x2 ≤ 8
    #      2x1 + x2 ≤ 12
    #      x1, x2 ≥ 0

    c = np.array([40, 30])
    A = np.array([[1, 1],
                  [2, 1]])
    b = np.array([8, 12])

    solver = SimplexSolver(c, A, b)
    result = solver.solve()

    if result['success']:
        print(f"  状态: {result['message']}")
        print(f"  迭代次数: {result['iterations']}")
        print(f"  最优解: x1 = {result['x'][0]:.4f}, x2 = {result['x'][1]:.4f}")
        print(f"  松弛变量: s1 = {result['slack'][0]:.4f}, s2 = {result['slack'][1]:.4f}")
        print(f"  最大目标值: z = {result['optimal_value']:.4f}")
    else:
        print(f"  失败: {result.get('message', '未知错误')}")

    return result


# ============================================================
# 第3节：整数线性规划 — 分支定界法
# ============================================================

def branch_and_bound_knapsack(weights: list, values: list, capacity: int) -> dict:
    """
    分支定界法求解 0/1 背包问题（ILP）。

    max  Σ v_i · x_i
    s.t. Σ w_i · x_i ≤ C
         x_i ∈ {0, 1}

    返回：
        {'selected': list, 'total_value': int, 'total_weight': int, 'nodes_explored': int}
    """
    n = len(weights)
    # 按价值/重量比排序
    items = sorted(range(n), key=lambda i: values[i] / weights[i], reverse=True)

    best_value = 0
    best_selection = None
    nodes_explored = 0

    def _linear_relaxation(idx: int, remaining_cap: float, current_value: float) -> float:
        """计算 LP 松弛的上界（分数背包）"""
        value_ub = current_value
        cap = remaining_cap
        for i in range(idx, n):
            j = items[i]
            if weights[j] <= cap + 1e-9:
                value_ub += values[j]
                cap -= weights[j]
            else:
                value_ub += values[j] * (cap / weights[j])
                break
        return value_ub

    def _dfs(idx: int, remaining_cap: float, current_value: float, selection: list):
        """深度优先分支定界"""
        nonlocal best_value, best_selection, nodes_explored
        nodes_explored += 1

        if idx == n:
            if current_value > best_value:
                best_value = current_value
                best_selection = selection[:]
            return

        j = items[idx]

        # 计算上界
        upper_bound = _linear_relaxation(idx, remaining_cap, current_value)
        if upper_bound <= best_value + 1e-9:
            return

        # 分支 1: 选当前物品（如果容量够）
        if weights[j] <= remaining_cap + 1e-9:
            selection.append(j)
            _dfs(idx + 1, remaining_cap - weights[j], current_value + values[j], selection)
            selection.pop()

        # 分支 2: 不选当前物品
        _dfs(idx + 1, remaining_cap, current_value, selection)

    _dfs(0, capacity, 0.0, [])

    selected_weight = sum(weights[i] for i in best_selection) if best_selection else 0
    return {
        'selected': best_selection,
        'total_value': best_value,
        'total_weight': selected_weight,
        'nodes_explored': nodes_explored
    }


def demo_integer_lp():
    """整数线性规划演示"""
    print("\n" + "-" * 72)
    print("3. 整数线性规划 — 分支定界法求解 0/1 背包")
    print("-" * 72)

    weights = [2, 3, 4, 5, 9]
    values = [3, 4, 5, 8, 10]
    capacity = 15

    print(f"\n  物品列表 (重量, 价值):")
    for i, (w, v) in enumerate(zip(weights, values)):
        print(f"    物品 {i}: w={w}, v={v}")

    result = branch_and_bound_knapsack(weights, values, capacity)

    print(f"\n  容量: {capacity}")
    print(f"  选中物品: {result['selected']}")
    print(f"  总价值: {result['total_value']}")
    print(f"  总重量: {result['total_weight']}")
    print(f"  探索节点数: {result['nodes_explored']}")

    # 暴力搜索对比
    print(f"\n  暴力搜索验证:")
    best_val = 0
    best_sel = None
    from itertools import combinations
    for r in range(len(weights) + 1):
        for combo in combinations(range(len(weights)), r):
            tw = sum(weights[i] for i in combo)
            if tw <= capacity:
                tv = sum(values[i] for i in combo)
                if tv > best_val:
                    best_val = tv
                    best_sel = list(combo)
    print(f"    暴力搜索最优: {best_sel}, 价值={best_val}")
    print(f"    分支定界结果一致: {result['total_value'] == best_val}")
    print(f"    分支定界探索了 {result['nodes_explored']} 个节点 (暴力搜索需要检查 {2 ** len(weights)} 个组合)")

    return result


# ============================================================
# 第4节：几何可视化
# ============================================================

def plot_lp_geometry():
    """绘制 LP 可行域与最优解"""
    print("\n" + "-" * 72)
    print("4. LP 几何可视化")
    print("-" * 72)

    # 约束边界
    # x1 + x2 ≤ 8 → x2 = 8 - x1
    # 2x1 + x2 ≤ 12 → x2 = 12 - 2x1
    # x1 ≥ 0, x2 ≥ 0

    x1 = np.linspace(0, 10, 200)

    plt.figure(figsize=(10, 6))

    # 绘制约束线
    plt.plot(x1, 8 - x1, 'b-', linewidth=2, label=r'$x_1 + x_2 \leq 8$')
    plt.plot(x1, 12 - 2 * x1, 'r-', linewidth=2, label=r'$2x_1 + x_2 \leq 12$')
    plt.axhline(y=0, color='gray', linestyle='-', alpha=0.5)
    plt.axvline(x=0, color='gray', linestyle='-', alpha=0.5)

    # 填充可行域
    x_feas = np.linspace(0, 6, 200)
    y1 = 8 - x_feas
    y2 = 12 - 2 * x_feas
    y_upper = np.minimum(y1, y2)
    plt.fill_between(x_feas, 0, y_upper, where=(y_upper >= 0),
                     alpha=0.3, color='green', label='Feasible Region')

    # 标记顶点
    vertices = [(0, 0), (0, 8), (4, 4), (6, 0)]
    vertex_labels = ['(0,0)', '(0,8)', '(4,4)', '(6,0)']
    x_verts = [v[0] for v in vertices]
    y_verts = [v[1] for v in vertices]
    plt.scatter(x_verts, y_verts, c='black', s=60, zorder=5)
    for i, label in enumerate(vertex_labels):
        plt.text(x_verts[i] + 0.2, y_verts[i] + 0.2, label, fontsize=10)

    # 标记最优解
    plt.scatter([4], [4], c='red', s=200, marker='*', zorder=10, label='Optimal (4, 4)')

    # 绘制目标函数等值线
    def plot_objective_contour(c1, c2, z):
        if abs(c2) > 1e-9:
            x_vals = np.linspace(0, 8, 10)
            y_vals = (z - c1 * x_vals) / c2
            plt.plot(x_vals, y_vals, 'g--', alpha=0.5, linewidth=1)

    plot_objective_contour(40, 30, 120)
    plot_objective_contour(40, 30, 160)
    plot_objective_contour(40, 30, 200)
    plot_objective_contour(40, 30, 280)

    plt.text(5.5, 1.5, 'z = 200', fontsize=9, color='green')
    plt.text(6.2, 2.5, 'z = 120', fontsize=9, color='green')

    plt.xlim(-0.5, 10)
    plt.ylim(-0.5, 10)
    plt.xlabel(r'$x_1$ (产品 P1)')
    plt.ylabel(r'$x_2$ (产品 P2)')
    plt.title('LP Geometric Interpretation — Feasible Region & Optimal Solution')
    plt.grid(True, linestyle='--', alpha=0.4)
    plt.legend(loc='upper right')
    plt.tight_layout()
    plt.savefig("lp_geometry.png", dpi=150)
    plt.show()
    print("  可视化已保存至 lp_geometry.png")


# ============================================================
# 测试
# ============================================================

def _test():
    print("=" * 72)
    print("线性规划演示")
    print("=" * 72)
    print()

    # 1. scipy 求解
    demo_scipy_lp()

    # 2. 手动单纯形法
    demo_simplex_manual()

    # 3. 整数线性规划
    demo_integer_lp()

    # 4. 几何可视化
    plot_lp_geometry()


if __name__ == "__main__":
    _test()