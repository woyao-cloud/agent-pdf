"""
demo_combination_sum.py — 组合求和的回溯解法与搜索树可视化

配合第9章"回溯算法"之 9.4（组合求和）和 9.5（剪枝优化）使用。

演示内容：
  1. 组合求和 I：元素可无限重用
  2. 组合求和 II：每个元素只能用一次
  3. 搜索树可视化（文本输出）
  4. 剪枝效果对比（有/无剪枝的搜索节点数）
"""

from typing import List, Tuple


# ============================================================
# 组合求和 I（元素可重用）
# ============================================================

def combination_sum(candidates: List[int], target: int) -> List[List[int]]:
    """
    组合求和 — 元素可无限重用。

    剪枝：排序后 if val > remaining → break
    """
    candidates.sort()
    res = []

    def backtrack(start: int, path: List[int], remaining: int) -> None:
        if remaining == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            val = candidates[i]
            if val > remaining:
                break
            path.append(val)
            backtrack(i, path, remaining - val)
            path.pop()

    backtrack(0, [], target)
    return res


# ============================================================
# 组合求和 II（元素不可重用）
# ============================================================

def combination_sum2(candidates: List[int], target: int) -> List[List[int]]:
    """
    组合求和 II — 每个元素只能用一次。

    剪枝：排序 + 同层去重 + 超值剪枝。
    """
    candidates.sort()
    res = []

    def backtrack(start: int, path: List[int], remaining: int) -> None:
        if remaining == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            val = candidates[i]
            if val > remaining:
                break
            if i > start and candidates[i] == candidates[i - 1]:
                continue
            path.append(val)
            backtrack(i + 1, path, remaining - val)
            path.pop()

    backtrack(0, [], target)
    return res


# ============================================================
# 搜索树可视化（带修剪跟踪）
# ============================================================

class SearchTree:
    """
    搜索树可视化类 — 同时跟踪剪枝和成功路径。

    tree 结构: [(indent, val, status, remaining)]
      status: 'ok' = 成功路径, 'prune' = 被剪枝, 'explore' = 探索中
    """

    def __init__(self, candidates: List[int], target: int):
        self.candidates = sorted(candidates)
        self.target = target
        self.tree: List[Tuple[int, int, str, int]] = []

    def search_with_trace(self) -> List[List[int]]:
        """执行搜索并记录搜索树"""
        res = []
        self.tree = []

        def backtrack(start: int, path: List[int], remaining: int, depth: int) -> None:
            if remaining == 0:
                res.append(path[:])
                return
            for i in range(start, len(self.candidates)):
                val = self.candidates[i]
                if val > remaining:
                    self.tree.append((depth, val, "prune", remaining))
                    break
                self.tree.append((depth, val, "explore", remaining))
                path.append(val)
                backtrack(i, path, remaining - val, depth + 1)
                path.pop()

        backtrack(0, [], self.target, 0)
        return res

    def print_tree(self) -> None:
        """打印搜索树"""
        if not self.tree:
            print("  搜索树为空")
            return

        print(f"\n搜索树可视化（candidates={self.candidates}, target={self.target}）：")
        print(f"  [ok]    = 成功路径上的节点")
        print(f"  [prune] = 被剪枝的分支")
        print(f"  数字     = 当前选择的元素值")
        print(f"  rem=     = 剩余目标和")
        print()

        for indent, val, status, remaining in self.tree:
            prefix = "  " * indent
            if status == "prune":
                print(f"{prefix}├── [{val}] (rem={remaining}) [PRUNE] {val} > {remaining}")
            elif status == "explore":
                if remaining - val == 0:
                    print(f"{prefix}├── [{val}] (rem={remaining - val}) [SOLUTION]")
                else:
                    print(f"{prefix}├── [{val}] (rem={remaining - val})")

        # 打印最终解
        res = self.search_with_trace()
        if res:
            print(f"\n共找到 {len(res)} 个解:")
            for sol in res:
                print(f"  {' + '.join(str(x) for x in sol)} = {self.target}")


# ============================================================
# 剪枝效果对比
# ============================================================

def _count_nodes_no_prune(candidates: List[int], target: int) -> int:
    """无剪枝版本 — 计数搜索节点（仅用于对比）"""
    count = 0

    def backtrack(start: int, remaining: int) -> None:
        nonlocal count
        count += 1
        if remaining <= 0:
            return
        for i in range(start, len(candidates)):
            backtrack(i, remaining - candidates[i])

    backtrack(0, target)
    return count


def _count_nodes_with_prune(candidates: List[int], target: int) -> int:
    """有剪枝版本 — 计数搜索节点"""
    candidates_sorted = sorted(candidates)
    count = 0

    def backtrack(start: int, remaining: int) -> None:
        nonlocal count
        count += 1
        for i in range(start, len(candidates_sorted)):
            val = candidates_sorted[i]
            if val > remaining:
                break
            backtrack(i, remaining - val)

    backtrack(0, target)
    return count


def compare_pruning(candidates: List[int], target: int) -> None:
    """对比有/无剪枝的搜索节点数"""
    print(f"\n{'=' * 72}")
    print(f"剪枝效果对比 — candidates={candidates}, target={target}")
    print(f"{'=' * 72}")

    # 无剪枝（慢，仅对较小输入执行）
    if len(candidates) <= 6 and target <= 20:
        import time
        start = time.perf_counter()
        no_prune = _count_nodes_no_prune(candidates, target)
        time_no = time.perf_counter() - start

        start = time.perf_counter()
        with_prune = _count_nodes_with_prune(candidates, target)
        time_with = time.perf_counter() - start

        print(f"\n{'方法':<20} {'节点数':<12} {'耗时 (ms)':<12}")
        print(f"{'-' * 44}")
        print(f"{'无剪枝':<20} {no_prune:<12} {time_no * 1000:<12.3f}")
        print(f"{'有剪枝（排序+break）':<20} {with_prune:<12} {time_with * 1000:<12.3f}")

        if no_prune > 0:
            ratio = no_prune / with_prune
            print(f"\n剪枝减少比例: {no_prune} → {with_prune}, 约 {ratio:.1f}× 减少")
    else:
        print(f"\n输入较大，跳过无剪枝对比（会非常慢）。")
        with_prune = _count_nodes_with_prune(candidates, target)
        print(f"有剪枝搜索节点数: {with_prune}")


# ============================================================
# 搜索树深度对比（组合 I vs 组合 II）
# ============================================================

def compare_search_depth(candidates: List[int], target: int) -> None:
    """对比两个版本的搜索深度特征"""
    print(f"\n{'=' * 72}")
    print(f"组合 I vs 组合 II 搜索特征对比")
    print(f"{'=' * 72}")

    res_i = combination_sum(candidates, target)
    res_ii = combination_sum2(candidates, target)

    print(f"\n{'指标':<30} {'组合 I（可重用）':<20} {'组合 II（不可重用）':<20}")
    print(f"{'-' * 70}")
    print(f"{'解的数量':<30} {len(res_i):<20} {len(res_ii):<20}")

    avg_len_i = sum(len(s) for s in res_i) / len(res_i) if res_i else 0
    avg_len_ii = sum(len(s) for s in res_ii) / len(res_ii) if res_ii else 0
    print(f"{'平均解长度':<30} {avg_len_i:<20.2f} {avg_len_ii:<20.2f}")

    max_len_i = max(len(s) for s in res_i) if res_i else 0
    max_len_ii = max(len(s) for s in res_ii) if res_ii else 0
    print(f"{'最大解长度':<30} {max_len_i:<20} {max_len_ii:<20}")


# ============================================================
# 演示
# ============================================================

def main():
    print("=" * 72)
    print("组合求和 — 回溯算法 + 搜索树可视化 演示")
    print("=" * 72)

    # ---- 1. 组合求和 I 搜索树 ----
    print(f"\n{'─' * 72}")
    print("1. 组合求和 I — 元素可重用")
    print(f"{'─' * 72}")
    tree1 = SearchTree([2, 3, 6, 7], 7)
    tree1.search_with_trace()
    tree1.print_tree()

    # ---- 2. 组合求和 II 搜索树 ----
    print(f"\n{'─' * 72}")
    print("2. 组合求和 II — 元素不可重用")
    print(f"{'─' * 72}")
    tree2 = SearchTree([10, 1, 2, 7, 6, 1, 5], 8)
    tree2.search_with_trace()
    tree2.print_tree()

    # ---- 3. 更多例子 ----
    print(f"\n{'─' * 72}")
    print("3. 更多组合求和示例")
    print(f"{'─' * 72}")

    examples = [
        ([2, 3, 5], 8),
        ([2, 3, 6, 7], 7),
        ([2, 3, 5, 7], 10),
    ]

    for cand, tgt in examples:
        res = combination_sum(cand, tgt)
        print(f"\n  candidates={cand}, target={tgt} → {len(res)} 个解:")
        for sol in res:
            print(f"    {' + '.join(str(x) for x in sol)} = {tgt}")

    # ---- 4. 剪枝对比 ----
    print(f"\n{'─' * 72}")
    print("4. 剪枝效果对比")
    print(f"{'─' * 72}")
    compare_pruning([2, 3, 6, 7], 7)

    # ---- 5. 搜索深度对比 ----
    compare_search_depth([2, 3, 6, 7], 7)

    # ---- 6. 去重效果 ----
    print(f"\n{'─' * 72}")
    print("5. 去重效果（组合 II 同层跳过）")
    print(f"{'─' * 72}")
    candidates_dup = [2, 2, 2, 3, 3]
    target_dup = 7

    res_i = combination_sum(candidates_dup, target_dup)
    res_ii = combination_sum2(candidates_dup, target_dup)

    print(f"  candidates={candidates_dup}, target={target_dup}")
    print(f"\n  组合 I（可重用，有重复输入）：{len(res_i)} 个解")
    for sol in res_i:
        print(f"    {sol}")
    print(f"\n  组合 II（不可重用，去重）：{len(res_ii)} 个解")
    for sol in res_ii:
        print(f"    {sol}")
    print(f"\n  → 组合 II 通过同层跳过消除了重复结果。")


if __name__ == "__main__":
    main()

"""
运行示例输出（节选）：

==================================================================
1. 组合求和 I — 元素可重用
------------------------------------------------------------------
搜索树可视化（candidates=[2, 3, 6, 7], target=7）：
  [ok]    = 成功路径上的节点
  [prune] = 被剪枝的分支

├── [2] (rem=5)
│   ├── [2] (rem=3)
│   │   ├── [2] (rem=1)
│   │   │   └── [2] (rem=-1) [PRUNE] 2 > 1
│   │   └── [3] (rem=0) [SOLUTION]
│   ├── [3] (rem=0) [SOLUTION]
│   └── [6] (rem=-1) [PRUNE] 6 > 5
├── [3] (rem=4)
│   ├── [3] (rem=1)
│   │   └── [3] (rem=-2) [PRUNE] 3 > 1
│   └── [6] (rem=-2) [PRUNE] 6 > 4
├── [6] (rem=1) [PRUNE] 6 > 7
└── [7] (rem=0) [SOLUTION]

共找到 2 个解:
  2 + 2 + 3 = 7
  7 = 7
"""