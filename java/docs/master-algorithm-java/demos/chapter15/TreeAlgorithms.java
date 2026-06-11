package masteralgo.chapter15;

import java.util.*;

/**
 * 面试高频树算法题演示
 *
 * 包含：最大深度、验证 BST、层序遍历、最近公共祖先、序列化/反序列化
 */
public class TreeAlgorithms {

    // ============================================================
    //  TreeNode
    // ============================================================
    static class TreeNode {
        int val;
        TreeNode left, right;
        TreeNode(int val) { this.val = val; }
        TreeNode(int val, TreeNode left, TreeNode right) {
            this.val = val;
            this.left = left;
            this.right = right;
        }
    }

    // ============================================================
    //  1. 二叉树的最大深度
    // ============================================================
    static int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }

    // ============================================================
    //  2. 验证二叉搜索树（范围约束法）
    // ============================================================
    static boolean isValidBST(TreeNode root) {
        return isValidBST(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }

    private static boolean isValidBST(TreeNode root, long min, long max) {
        if (root == null) return true;
        if (root.val <= min || root.val >= max) return false;
        return isValidBST(root.left, min, root.val)
            && isValidBST(root.right, root.val, max);
    }

    // ============================================================
    //  3. 层序遍历
    // ============================================================
    static List<List<Integer>> levelOrder(TreeNode root) {
        List<List<Integer>> result = new ArrayList<>();
        if (root == null) return result;
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        while (!queue.isEmpty()) {
            int size = queue.size();
            List<Integer> level = new ArrayList<>();
            for (int i = 0; i < size; i++) {
                TreeNode node = queue.poll();
                level.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
            result.add(level);
        }
        return result;
    }

    // ============================================================
    //  4. 最近公共祖先
    // ============================================================
    static TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        if (root == null || root == p || root == q) return root;
        TreeNode left = lowestCommonAncestor(root.left, p, q);
        TreeNode right = lowestCommonAncestor(root.right, p, q);
        if (left != null && right != null) return root;
        return left != null ? left : right;
    }

    // ============================================================
    //  5. 序列化与反序列化（前序遍历）
    // ============================================================
    static String serialize(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        serializeHelper(root, sb);
        return sb.toString();
    }

    private static void serializeHelper(TreeNode root, StringBuilder sb) {
        if (root == null) {
            sb.append("null,");
            return;
        }
        sb.append(root.val).append(",");
        serializeHelper(root.left, sb);
        serializeHelper(root.right, sb);
    }

    static TreeNode deserialize(String data) {
        Queue<String> queue = new LinkedList<>(Arrays.asList(data.split(",")));
        return deserializeHelper(queue);
    }

    private static TreeNode deserializeHelper(Queue<String> queue) {
        String val = queue.poll();
        if (val == null || val.equals("null")) return null;
        TreeNode root = new TreeNode(Integer.parseInt(val));
        root.left = deserializeHelper(queue);
        root.right = deserializeHelper(queue);
        return root;
    }

    // ============================================================
    //  辅助方法：构建树
    // ============================================================
    static TreeNode buildTree(Integer... vals) {
        if (vals.length == 0 || vals[0] == null) return null;
        TreeNode root = new TreeNode(vals[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        int i = 1;
        while (!queue.isEmpty() && i < vals.length) {
            TreeNode node = queue.poll();
            if (vals[i] != null) {
                node.left = new TreeNode(vals[i]);
                queue.offer(node.left);
            }
            i++;
            if (i < vals.length && vals[i] != null) {
                node.right = new TreeNode(vals[i]);
                queue.offer(node.right);
            }
            i++;
        }
        return root;
    }

    // ============================================================
    //  主方法测试
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  树算法题演示");
        System.out.println("==========================================");

        // ---------- 构建测试树 ----------
        //       5
        //      / \
        //     3   8
        //    / \   \
        //   2   4   10
        TreeNode root = new TreeNode(5,
            new TreeNode(3, new TreeNode(2), new TreeNode(4)),
            new TreeNode(8, null, new TreeNode(10))
        );

        // ---------- 最大深度 ----------
        System.out.println("\n--- 最大深度 ---");
        int depth = maxDepth(root);
        System.out.println("  树的深度: " + depth);
        assert depth == 3 : "深度应为 3";

        // ---------- 验证 BST ----------
        System.out.println("\n--- 验证 BST ---");
        System.out.println("  有效 BST: " + isValidBST(root));
        assert isValidBST(root) : "当前树是有效 BST";

        TreeNode invalidRoot = new TreeNode(5,
            new TreeNode(6),  // 6 > 5，但位于左子树 → 无效
            new TreeNode(8)
        );
        System.out.println("  无效 BST: " + isValidBST(invalidRoot));
        assert !isValidBST(invalidRoot) : "此树不是有效 BST";

        // ---------- 层序遍历 ----------
        System.out.println("\n--- 层序遍历 ---");
        List<List<Integer>> levels = levelOrder(root);
        System.out.println("  层次: " + levels);
        assert levels.equals(Arrays.asList(
            Arrays.asList(5),
            Arrays.asList(3, 8),
            Arrays.asList(2, 4, 10)
        )) : "层序结果不正确";

        // ---------- 最近公共祖先 ----------
        System.out.println("\n--- 最近公共祖先 ---");
        TreeNode p = root.left.left;  // 2
        TreeNode q = root.left.right; // 4
        TreeNode lca = lowestCommonAncestor(root, p, q);
        System.out.println("  LCA(2, 4) = " + lca.val);
        assert lca.val == 3 : "LCA(2,4) 应为 3";

        TreeNode p2 = root.left.left; // 2
        TreeNode q2 = root.right;     // 8
        TreeNode lca2 = lowestCommonAncestor(root, p2, q2);
        System.out.println("  LCA(2, 8) = " + lca2.val);
        assert lca2.val == 5 : "LCA(2,8) 应为 5";

        // ---------- 序列化与反序列化 ----------
        System.out.println("\n--- 序列化与反序列化 ---");
        String serialized = serialize(root);
        System.out.println("  序列化: " + serialized);
        TreeNode deserialized = deserialize(serialized);
        String reSerialized = serialize(deserialized);
        System.out.println("  反序列化后再序列化: " + reSerialized);
        assert serialized.equals(reSerialized) : "序列化/反序列化应保持一致性";

        // ---------- 空树测试 ----------
        System.out.println("\n--- 边界测试 ---");
        System.out.println("  空树深度: " + maxDepth(null));
        assert maxDepth(null) == 0;
        System.out.println("  空树有效BST: " + isValidBST(null));
        assert isValidBST(null);
        System.out.println("  空树层序: " + levelOrder(null));
        assert levelOrder(null).isEmpty();
        System.out.println("  空树序列化: " + serialize(null));
        assert serialize(null).equals("null,");

        System.out.println("\n==========================================");
        System.out.println("  所有测试通过");
        System.out.println("==========================================");
    }
}