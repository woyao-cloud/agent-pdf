"""
demo_tree_dp.py — 树形 DP 演示

配合第7章"动态规划"之 7.5（树形 DP）使用。

演示内容：
  1. 二叉树最大路径和（Binary Tree Maximum Path Sum）
  2. 打家劫舍 III（House Robber III）— 树上不相邻节点最大和
  3. 递归树形 DP 过程可视化
"""

from typing import Optional, Tuple


class TreeNode:
    """二叉树节点"""
    def __init__(self, val: int = 0, left: Optional['TreeNode'] = None, right: Optional['TreeNode'] = None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val})"


# ============================================================
# 辅助函数：构建示例树
# ============================================================

def build_tree_1() -> TreeNode:
    r"""
          -10
         /    \
        9      20
              /  \
            15    7

    最大路径和：42（15 → 20 → 7）
    """
    return TreeNode(-10,
        TreeNode(9),
        TreeNode(20,
            TreeNode(15),
            TreeNode(7)
        )
    )


def build_tree_2() -> TreeNode:
    r"""
          3
         / \
        4   5
       / \   \
      1   3   1

    打家劫舍 III 示例。
    最大偷窃：9（选 3 + 1 + 3 + 1 或 4 + 5）
    """
    return TreeNode(3,
        TreeNode(4,
            TreeNode(1),
            TreeNode(3)
        ),
        TreeNode(5,
            None,
            TreeNode(1)
        )
    )


def build_tree_3() -> TreeNode:
    r"""
           1
          / \
         2   3
        / \   \
       4   5   6
          /
         7

    用于展示树形 DP 递归过程。
    """
    return TreeNode(1,
        TreeNode(2,
            TreeNode(4),
            TreeNode(5,
                TreeNode(7),
                None
            )
        ),
        TreeNode(3,
            None,
            TreeNode(6)
        )
    )


# ============================================================
# 1. 二叉树最大路径和
# ============================================================
def max_path_sum(root: TreeNode) -> int:
    """
    二叉树最大路径和（LeetCode 124）。

    路径可以从任意节点开始，到任意节点结束，沿着父子连接。
    路径和 = 路径上所有节点值的总和。

    状态定义（后序遍历）：
      对每个节点，计算"经过该节点并向下方延伸的最大单边路径和"：
        single = node.val + max(0, left_single, right_single)

      全局最大值 = max(全局, node.val + max(0, left_single) + max(0, right_single))

    返回：最大路径和
    """
    max_sum = float("-inf")

    def _dfs(node: Optional[TreeNode]) -> int:
        nonlocal max_sum
        if not node:
            return 0

        # 后序遍历：先处理子树
        left_gain = max(0, _dfs(node.left))   # 左子树最大贡献（负则丢弃）
        right_gain = max(0, _dfs(node.right)) # 右子树最大贡献

        # 经过当前节点的路径和（左右合并）
        current_path = node.val + left_gain + right_gain
        max_sum = max(max_sum, current_path)

        # 返回当前节点作为"路径端点"时的最大贡献值
        return node.val + max(left_gain, right_gain)

    _dfs(root)
    return max_sum


def max_path_sum_detailed(root: TreeNode) -> int:
    """
    带详细过程输出的最大路径和。
    """
    max_sum = float("-inf")
    call_depth = [0]

    def _dfs(node: Optional[TreeNode]) -> int:
        nonlocal max_sum
        if not node:
            indent = "  " * call_depth[0]
            print(f"{indent}→ None, 返回 0")
            return 0

        indent = "  " * call_depth[0]
        print(f"{indent}→ 节点 {node.val}:")

        call_depth[0] += 1
        left_gain = max(0, _dfs(node.left))
        right_gain = max(0, _dfs(node.right))
        call_depth[0] -= 1

        current_path = node.val + left_gain + right_gain
        max_sum = max(max_sum, current_path)

        single_gain = node.val + max(left_gain, right_gain)

        print(f"{indent}  左贡献={left_gain}, 右贡献={right_gain}")
        print(f"{indent}  路径过该节点={node.val}+{left_gain}+{right_gain}={current_path}")
        print(f"{indent}  单边最大贡献={single_gain}")
        print(f"{indent}  ← 返回 {single_gain}")

        return single_gain

    print("后序遍历过程：")
    _dfs(root)
    return max_sum


# ============================================================
# 2. 打家劫舍 III（House Robber III）
# ============================================================
def house_robber_iii(root: TreeNode) -> int:
    """
    打家劫舍 III（LeetCode 337）。

    规则：不能偷相邻的两个节点（父子关系）。

    状态：每个节点返回 (rob, not_rob)
      rob = node.val + left.not_rob + right.not_rob
      not_rob = max(left.rob, left.not_rob) + max(right.rob, right.not_rob)

    返回：最大偷窃金额
    """
    def _dfs(node: Optional[TreeNode]) -> Tuple[int, int]:
        """返回 (偷当前节点, 不偷当前节点)"""
        if not node:
            return (0, 0)

        left = _dfs(node.left)
        right = _dfs(node.right)

        # 偷当前节点：左右子节点都不能偷
        rob = node.val + left[1] + right[1]

        # 不偷当前节点：左右子节点可偷可不偷（取各自最大值）
        not_rob = max(left) + max(right)

        return (rob, not_rob)

    return max(_dfs(root))


def house_robber_iii_detailed(root: TreeNode) -> int:
    """
    带详细过程输出的打家劫舍 III。
    """
    call_depth = [0]

    def _dfs(node: Optional[TreeNode]) -> Tuple[int, int]:
        if not node:
            indent = "  " * call_depth[0]
            print(f"{indent}→ None → (rob=0, not_rob=0)")
            return (0, 0)

        indent = "  " * call_depth[0]
        print(f"{indent}→ 节点 {node.val}:")

        call_depth[0] += 1
        left_rob, left_not = _dfs(node.left)
        right_rob, right_not = _dfs(node.right)
        call_depth[0] -= 1

        rob = node.val + left_not + right_not
        not_rob = max(left_rob, left_not) + max(right_rob, right_not)

        print(f"{indent}  左子: (rob={left_rob}, not={left_not})  →  max={max(left_rob, left_not)}")
        print(f"{indent}  右子: (rob={right_rob}, not={right_not})  →  max={max(right_rob, right_not)}")
        print(f"{indent}  偷={node.val}+{left_not}+{right_not}={rob}")
        print(f"{indent}  不偷={max(left_rob, left_not)}+{max(right_rob, right_not)}={not_rob}")
        print(f"{indent}  ← ({rob}, {not_rob})")

        return (rob, not_rob)

    print("后序遍历过程：")
    rob, not_rob = _dfs(root)
    result = max(rob, not_rob)
    print(f"\n结果: rob={rob}, not_rob={not_rob}, max={result}")
    return result


# ============================================================
# 3. 树形 DP 通用框架展示
# ============================================================
def tree_dp_framework(root: TreeNode) -> int:
    """
    通用树形 DP 骨架（用于教学展示）。

    递归过程：
      ① base case：空节点 → 返回基础值
      ② 递归计算左右子树
      ③ 合并结果：当前节点值 + 左右子树结果
      ④ 返回当前层的结果
    """

    def _postorder(node: Optional[TreeNode], depth: int = 0) -> int:
        indent = "  " * depth
        if not node:
            print(f"{indent}空节点 → 返回 0")
            return 0

        print(f"{indent}进入节点 {node.val}")
        print(f"{indent}├─ 计算左子树...")
        left = _postorder(node.left, depth + 1)
        print(f"{indent}├─ 左子树结果: {left}")
        print(f"{indent}├─ 计算右子树...")
        right = _postorder(node.right, depth + 1)
        print(f"{indent}├─ 右子树结果: {right}")

        # 核心合并逻辑（此处为求和，实际使用时替换为问题特定逻辑）
        result = node.val + left + right

        print(f"{indent}└─ 节点{node.val}: 合并={node.val}+{left}+{right}={result} ← 返回")
        return result

    print("树形 DP 通用框架（后序遍历）：")
    return _postorder(root)


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("树形 DP 演示")
    print("=" * 72)

    # ---- 1. 最大路径和 ----
    print("-" * 72)
    print("1. 二叉树最大路径和 (Binary Tree Maximum Path Sum)")
    print("-" * 72)

    tree1 = build_tree_1()
    print(f"\n树结构：")
    print(f"      -10")
    print(f"     /    \\")
    print(f"    9      20")
    print(f"          /  \\")
    print(f"        15    7")
    print()

    result1 = max_path_sum_detailed(tree1)
    print(f"\n最大路径和: {result1}（期望: 42 = 15→20→7）")

    # ---- 2. 打家劫舍 III ----
    print("-" * 72)
    print("2. 打家劫舍 III (House Robber III)")
    print("-" * 72)

    tree2 = build_tree_2()
    print(f"\n树结构：")
    print(f"        3")
    print(f"       / \\")
    print(f"      4   5")
    print(f"     / \\   \\")
    print(f"    1   3   1")
    print()

    result2 = house_robber_iii_detailed(tree2)
    print(f"最大偷窃金额: {result2}")

    # ---- 3. 树形 DP 通用框架 ----
    print("-" * 72)
    print("3. 树形 DP 通用框架（节点值求和，演示递归过程）")
    print("-" * 72)

    tree3 = build_tree_3()
    print(f"\n树结构：")
    print(f"        1")
    print(f"       / \\")
    print(f"      2   3")
    print(f"     / \\   \\")
    print(f"    4   5   6")
    print(f"       /")
    print(f"      7")
    print()

    total = tree_dp_framework(tree3)
    print(f"\n节点值总和: {total}（期望: 1+2+3+4+5+6+7 = 28）")

    # ---- 4. 边界测试 ----
    print("-" * 72)
    print("4. 边界测试")
    print("-" * 72)

    # 单节点
    single = TreeNode(5)
    print(f"单节点 (5):")
    print(f"  最大路径和: {max_path_sum(single)}")
    print(f"  打家劫舍: {house_robber_iii(single)}")

    # 空树
    print(f"空树:")
    print(f"  最大路径和: {max_path_sum(None)}")
    print(f"  打家劫舍: {house_robber_iii(None)}")

    # 全负树
    neg_tree = TreeNode(-5,
        TreeNode(-2),
        TreeNode(-3,
            TreeNode(-1),
            None
        )
    )
    print(f"全负树:")
    print(f"  最大路径和: {max_path_sum(neg_tree)}（期望: -1 = 绝对值最大的负节点）")


if __name__ == "__main__":
    _test()