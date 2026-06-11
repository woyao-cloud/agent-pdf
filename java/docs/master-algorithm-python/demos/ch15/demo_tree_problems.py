"""
demo_tree_problems.py — 树高频面试算法题

配合第15章"面试高频算法题"之 15.2（树）使用。

演示内容：
  1. 二叉树遍历（前/中/后/层序）
  2. 最大深度
  3. 验证 BST
  4. 最近公共祖先（LCA）
  5. 序列化与反序列化
"""

from typing import Optional, List


# ============================================================
# 二叉树节点定义
# ============================================================

class TreeNode:
    def __init__(self, val: int = 0, left: 'TreeNode' = None, right: 'TreeNode' = None):
        self.val = val
        self.left = left
        self.right = right


def build_tree(vals: list[Optional[int]]) -> Optional[TreeNode]:
    if not vals or vals[0] is None:
        return None
    root = TreeNode(vals[0])
    queue = [root]
    i = 1
    while queue and i < len(vals):
        node = queue.pop(0)
        if vals[i] is not None:
            node.left = TreeNode(vals[i])
            queue.append(node.left)
        i += 1
        if i < len(vals) and vals[i] is not None:
            node.right = TreeNode(vals[i])
            queue.append(node.right)
        i += 1
    return root


# ============================================================
# 1. 二叉树遍历
# ============================================================

def preorder_traversal(root: TreeNode) -> List[int]:
    result = []
    def dfs(node: TreeNode):
        if not node:
            return
        result.append(node.val)
        dfs(node.left)
        dfs(node.right)
    dfs(root)
    return result


def inorder_traversal(root: TreeNode) -> List[int]:
    result, stack = [], []
    curr = root
    while curr or stack:
        while curr:
            stack.append(curr)
            curr = curr.left
        curr = stack.pop()
        result.append(curr.val)
        curr = curr.right
    return result


def postorder_traversal(root: TreeNode) -> List[int]:
    result = []
    def dfs(node: TreeNode):
        if not node:
            return
        dfs(node.left)
        dfs(node.right)
        result.append(node.val)
    dfs(root)
    return result


def level_order(root: TreeNode) -> List[List[int]]:
    if not root:
        return []
    result, queue = [], [root]
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.pop(0)
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level)
    return result


# ============================================================
# 2. 最大深度
# ============================================================

def max_depth(root: TreeNode) -> int:
    if not root:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))


# ============================================================
# 3. 验证 BST
# ============================================================

def is_valid_bst(root: TreeNode) -> bool:
    def validate(node: TreeNode, low: float, high: float) -> bool:
        if not node:
            return True
        if node.val <= low or node.val >= high:
            return False
        return validate(node.left, low, node.val) and validate(node.right, node.val, high)
    return validate(root, float('-inf'), float('inf'))


# ============================================================
# 4. 最近公共祖先
# ============================================================

def lowest_common_ancestor(root: TreeNode, p: TreeNode, q: TreeNode) -> TreeNode:
    if not root or root == p or root == q:
        return root
    left = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)
    if left and right:
        return root
    return left or right


# ============================================================
# 5. 序列化与反序列化
# ============================================================

def serialize(root: TreeNode) -> str:
    def dfs(node: TreeNode):
        if not node:
            vals.append('null')
            return
        vals.append(str(node.val))
        dfs(node.left)
        dfs(node.right)
    vals = []
    dfs(root)
    return ','.join(vals)


def deserialize(data: str) -> TreeNode:
    def dfs() -> TreeNode:
        val = next(vals)
        if val == 'null':
            return None
        node = TreeNode(int(val))
        node.left = dfs()
        node.right = dfs()
        return node
    vals = iter(data.split(','))
    return dfs()


# ============================================================
# 测试
# ============================================================

def _test():
    print("=" * 60)
    print("  树算法题演示")
    print("=" * 60)

    root = build_tree([3, 9, 20, None, None, 15, 7])

    # ---- 1. 遍历 ----
    print("\n" + "-" * 60)
    print("  [1] 二叉树遍历")
    print(f"    前序: {preorder_traversal(root)}")
    print(f"    中序: {inorder_traversal(root)}")
    print(f"    后序: {postorder_traversal(root)}")
    print(f"    层序: {level_order(root)}")

    # ---- 2. 最大深度 ----
    print("\n" + "-" * 60)
    print("  [2] 最大深度")
    print(f"    max_depth = {max_depth(root)}")

    # ---- 3. 验证 BST ----
    print("\n" + "-" * 60)
    print("  [3] 验证 BST")
    bst_valid = build_tree([2, 1, 3])
    print(f"    有效 BST: {is_valid_bst(bst_valid)}")
    bst_invalid = build_tree([5, 1, 4, None, None, 3, 6])
    print(f"    无效 BST: {is_valid_bst(bst_invalid)}")

    # ---- 4. LCA ----
    print("\n" + "-" * 60)
    print("  [4] 最近公共祖先 (LCA)")
    lca_root = build_tree([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4])
    p = lca_root.left
    q = lca_root.right
    lca = lowest_common_ancestor(lca_root, p, q)
    print(f"    LCA(5, 1) = {lca.val}")
    p2 = lca_root.left.left
    q2 = lca_root.left.right.right
    lca2 = lowest_common_ancestor(lca_root, p2, q2)
    print(f"    LCA(6, 4) = {lca2.val}")

    # ---- 5. 序列化/反序列化 ----
    print("\n" + "-" * 60)
    print("  [5] 序列化与反序列化")
    s = serialize(root)
    print(f"    序列化: {s}")
    new_root = deserialize(s)
    s2 = serialize(new_root)
    print(f"    反序列化后再序列化: {s2}")
    print(f"    一致性检查: {s == s2}")

    print("\n" + "=" * 60)
    print("  演示完成!")
    print("=" * 60)


if __name__ == '__main__':
    _test()