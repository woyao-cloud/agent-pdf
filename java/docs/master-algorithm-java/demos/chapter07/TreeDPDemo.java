package masteralgo.chapter07;

import java.util.*;

/**
 * 树形 DP 演示
 *
 * 涵盖：
 * 1. 树的直径（Tree Diameter）—— 最长路径距离
 * 2. 最大独立集（Maximum Independent Set on Tree）—— 选不相邻节点使得权值和最大
 */
public class TreeDPDemo {

    // ============================================================
    //  树的节点定义（二叉树）
    // ============================================================

    static class TreeNode {
        int val;
        TreeNode left, right;

        TreeNode(int val) {
            this.val = val;
        }

        TreeNode(int val, TreeNode left, TreeNode right) {
            this.val = val;
            this.left = left;
            this.right = right;
        }
    }

    // ============================================================
    //  1. 树的直径（一次 DFS 求解）
    // ============================================================

    private static int diameter;

    /**
     * 计算树的直径（任意两节点间的最长距离）
     * 对每个节点，计算左子树高度 + 右子树高度，更新全局最大值
     */
    public static int treeDiameter(TreeNode root) {
        diameter = 0;
        height(root);
        return diameter;
    }

    private static int height(TreeNode node) {
        if (node == null) return 0;
        int leftH = height(node.left);
        int rightH = height(node.right);
        // 经过当前节点的最长路径 = 左高 + 右高
        diameter = Math.max(diameter, leftH + rightH);
        return Math.max(leftH, rightH) + 1;
    }

    /**
     * 树的直径——打印每个节点的左右高度
     */
    public static int treeDiameterWithPrint(TreeNode root) {
        diameter = 0;
        heightWithPrint(root, 0);
        return diameter;
    }

    private static int heightWithPrint(TreeNode node, int depth) {
        if (node == null) return 0;
        int leftH = heightWithPrint(node.left, depth + 1);
        int rightH = heightWithPrint(node.right, depth + 1);
        String indent = "  ".repeat(depth);
        System.out.println(indent + "节点 " + node.val + ": 左高=" + leftH + ", 右高=" + rightH
                + ", 经过路径=" + (leftH + rightH));
        diameter = Math.max(diameter, leftH + rightH);
        return Math.max(leftH, rightH) + 1;
    }

    // ============================================================
    //  2. 最大独立集（Maximum Independent Set on Tree）
    // ============================================================

    /**
     * 计算二叉树的最大独立集
     * dp[0] = 不选当前节点, dp[1] = 选当前节点
     */
    public static int maxIndependentSet(TreeNode root) {
        int[] result = misDfs(root);
        return Math.max(result[0], result[1]);
    }

    /**
     * 最大独立集——打印每个节点的 DP 值
     */
    public static int maxIndependentSetWithPrint(TreeNode root) {
        int[] result = misDfsWithPrint(root, 0);
        return Math.max(result[0], result[1]);
    }

    private static int[] misDfs(TreeNode node) {
        if (node == null) return new int[]{0, 0};
        int[] left = misDfs(node.left);
        int[] right = misDfs(node.right);
        // dp[0]: 不选当前节点，孩子可选可不选
        int notSelect = Math.max(left[0], left[1]) + Math.max(right[0], right[1]);
        // dp[1]: 选当前节点，两个孩子都不能选
        int select = node.val + left[0] + right[0];
        return new int[]{notSelect, select};
    }

    private static int[] misDfsWithPrint(TreeNode node, int depth) {
        if (node == null) return new int[]{0, 0};
        int[] left = misDfsWithPrint(node.left, depth + 1);
        int[] right = misDfsWithPrint(node.right, depth + 1);
        int notSelect = Math.max(left[0], left[1]) + Math.max(right[0], right[1]);
        int select = node.val + left[0] + right[0];
        String indent = "  ".repeat(depth);
        System.out.println(indent + "节点 " + node.val + ": dp[不选]=" + notSelect + ", dp[选]=" + select);
        return new int[]{notSelect, select};
    }

    // ============================================================
    //  构建测试用的二叉树
    // ============================================================

    /**
     * 构建一棵测试树：
     *         1
     *       /   \
     *      2     3
     *     / \   / \
     *    4   5 6   7
     *   /
     *  8
     */
    private static TreeNode buildSampleTree() {
        TreeNode n8 = new TreeNode(8);
        TreeNode n4 = new TreeNode(4, n8, null);
        TreeNode n5 = new TreeNode(5);
        TreeNode n6 = new TreeNode(6);
        TreeNode n7 = new TreeNode(7);
        TreeNode n2 = new TreeNode(2, n4, n5);
        TreeNode n3 = new TreeNode(3, n6, n7);
        return new TreeNode(1, n2, n3);
    }

    /**
     * 构建最大独立集测试树（带权值）：
     *        10
     *       /  \
     *      5    8
     *     / \    \
     *    3   2    6
     */
    private static TreeNode buildMisTree() {
        TreeNode n3 = new TreeNode(3);
        TreeNode n2 = new TreeNode(2);
        TreeNode n6 = new TreeNode(6);
        TreeNode n5 = new TreeNode(5, n3, n2);
        TreeNode n8 = new TreeNode(8, null, n6);
        return new TreeNode(10, n5, n8);
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  TreeDPDemo —— 树形 DP 演示");
        System.out.println("================================================\n");

        // ---------- 1. 树的直径 ----------
        System.out.println("----- 1. 树的直径 -----");
        TreeNode tree = buildSampleTree();
        System.out.println(" 树结构:");
        System.out.println("          1");
        System.out.println("        /   \\");
        System.out.println("       2     3");
        System.out.println("      / \\   / \\");
        System.out.println("     4   5 6   7");
        System.out.println("    /");
        System.out.println("   8");
        System.out.println("  树的直径: " + treeDiameter(tree) + " (期望=5: 8→4→2→1→3 或 8→4→2→1→7)");

        System.out.println("\n  各节点高度与经过路径:");
        TreeNode tree2 = buildSampleTree();
        treeDiameterWithPrint(tree2);

        // ---------- 2. 最大独立集 ----------
        System.out.println("\n----- 2. 最大独立集 -----");
        TreeNode misTree = buildMisTree();
        System.out.println(" 树结构（节点值 = 权值）:");
        System.out.println("         10");
        System.out.println("        /  \\");
        System.out.println("       5    8");
        System.out.println("      / \\    \\");
        System.out.println("     3   2    6");
        System.out.println("  最大独立集大小: " + maxIndependentSet(misTree) + " (期望=24: 10+3+2+6=21 或 5+8+...=?)");
        System.out.println("  解释: 选 10(不选5,8) + 选3,2(不选) + 选6 = 10+3+2+6=21");
        System.out.println("  或: 不选10, 选5,8 → 5+8=13 + 子节点都不选=0 = 13");
        System.out.println("  最优: 10+3+2+6=21");

        System.out.println("\n  各节点 DP 值:");
        TreeNode misTree2 = buildMisTree();
        maxIndependentSetWithPrint(misTree2);

        // 简单树测试（三节点线形树）
        System.out.println("\n----- 3. 额外测试 -----");
        TreeNode linear = new TreeNode(1,
                new TreeNode(2,
                        new TreeNode(3), null), null);
        System.out.println("  线形树: 1→2→3");
        System.out.println("  直径: " + treeDiameter(linear) + " (期望=2: 3→2→1)");
        System.out.println("  最大独立集: " + maxIndependentSet(linear) + " (期望=4: 1+3=4)");

        // 单节点树
        TreeNode single = new TreeNode(5);
        System.out.println("  单节点树");
        System.out.println("  直径: " + treeDiameter(single) + " (期望=0)");
        System.out.println("  最大独立集: " + maxIndependentSet(single) + " (期望=5)");

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}