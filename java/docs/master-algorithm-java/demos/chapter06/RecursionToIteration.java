package masteralgo.chapter06;

import java.util.*;

/**
 * 递归 → 迭代转换演示：二叉树遍历 + 图的 DFS
 *
 * 本 Demo 展示：
 * 1. TreeNode 定义 + 构建示例二叉树
 * 2. 前序/中序/后序遍历的递归实现
 * 3. 前序/中序/后序遍历的迭代实现（使用显式 Stack）
 * 4. 对比递归与迭代的输出是否一致
 * 5. 图的 DFS：递归版 vs 迭代版（显式 Stack）
 */
public class RecursionToIteration {

    // ============================================================
    //  TreeNode 定义
    // ============================================================

    static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;

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
    //  构建示例二叉树
    //        1
    //       / \
    //      2   3
    //     / \   \
    //    4   5   6
    // ============================================================

    private static TreeNode buildSampleTree() {
        TreeNode n4 = new TreeNode(4);
        TreeNode n5 = new TreeNode(5);
        TreeNode n6 = new TreeNode(6);
        TreeNode n2 = new TreeNode(2, n4, n5);
        TreeNode n3 = new TreeNode(3, null, n6);
        return new TreeNode(1, n2, n3);
    }

    // ============================================================
    //  递归遍历
    // ============================================================

    public static void preorderRecursive(TreeNode root, List<Integer> result) {
        if (root == null) return;
        result.add(root.val);
        preorderRecursive(root.left, result);
        preorderRecursive(root.right, result);
    }

    public static void inorderRecursive(TreeNode root, List<Integer> result) {
        if (root == null) return;
        inorderRecursive(root.left, result);
        result.add(root.val);
        inorderRecursive(root.right, result);
    }

    public static void postorderRecursive(TreeNode root, List<Integer> result) {
        if (root == null) return;
        postorderRecursive(root.left, result);
        postorderRecursive(root.right, result);
        result.add(root.val);
    }

    // ============================================================
    //  迭代遍历（显式 Stack）
    // ============================================================

    /**
     * 前序遍历迭代版
     *
     * 思路：
     * 1. 根节点入栈
     * 2. 出栈 → 访问 → 先右子入栈 → 后左子入栈（栈是后进先出）
     * 3. 重复直到栈空
     */
    public static List<Integer> preorderIterative(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) return result;

        Deque<TreeNode> stack = new ArrayDeque<>();
        stack.push(root);

        while (!stack.isEmpty()) {
            TreeNode node = stack.pop();
            result.add(node.val);

            // 先压右子，再压左子——这样出栈时左子先出
            if (node.right != null) stack.push(node.right);
            if (node.left != null) stack.push(node.left);
        }
        return result;
    }

    /**
     * 中序遍历迭代版
     *
     * 思路：
     * 1. 从根节点出发，不断将左子节点入栈
     * 2. 当左子为空时，出栈访问节点
     * 3. 将指针移到右子树，重复上述过程
     */
    public static List<Integer> inorderIterative(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) return result;

        Deque<TreeNode> stack = new ArrayDeque<>();
        TreeNode curr = root;

        while (curr != null || !stack.isEmpty()) {
            // 一路向左，将所有左子节点入栈
            while (curr != null) {
                stack.push(curr);
                curr = curr.left;
            }
            // 出栈访问
            curr = stack.pop();
            result.add(curr.val);
            // 转向右子树
            curr = curr.right;
        }
        return result;
    }

    /**
     * 后序遍历迭代版
     *
     * 思路（双栈法）：
     * 前序是"根-左-右"，后序是"左-右-根"
     * 修改前序为"根-右-左"，然后反转结果得到"左-右-根"
     */
    public static List<Integer> postorderIterative(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) return result;

        Deque<TreeNode> stack = new ArrayDeque<>();
        stack.push(root);

        while (!stack.isEmpty()) {
            TreeNode node = stack.pop();
            result.add(node.val);

            // 和前序相反：先压左子，再压右子
            if (node.left != null) stack.push(node.left);
            if (node.right != null) stack.push(node.right);
        }

        // 反转结果
        Collections.reverse(result);
        return result;
    }

    // ============================================================
    //  图的 DFS：递归版 vs 迭代版
    // ============================================================

    /**
     * DFS 递归版
     *
     * @param graph 邻接表表示的图
     * @param visited 访问标记数组
     * @param v 当前顶点
     * @param result 遍历结果
     */
    public static void dfsRecursive(List<List<Integer>> graph, boolean[] visited,
                                    int v, List<Integer> result) {
        visited[v] = true;
        result.add(v);
        for (int neighbor : graph.get(v)) {
            if (!visited[neighbor]) {
                dfsRecursive(graph, visited, neighbor, result);
            }
        }
    }

    /**
     * DFS 迭代版（显式 Stack）
     *
     * @param graph 邻接表表示的图
     * @param start 起始顶点
     * @return 遍历结果
     */
    public static List<Integer> dfsIterative(List<List<Integer>> graph, int start) {
        List<Integer> result = new ArrayList<>();
        boolean[] visited = new boolean[graph.size()];
        Deque<Integer> stack = new ArrayDeque<>();

        stack.push(start);

        while (!stack.isEmpty()) {
            int v = stack.pop();
            if (!visited[v]) {
                visited[v] = true;
                result.add(v);
                // 逆序压栈，保持与递归版相同的访问顺序
                List<Integer> neighbors = graph.get(v);
                for (int i = neighbors.size() - 1; i >= 0; i--) {
                    int neighbor = neighbors.get(i);
                    if (!visited[neighbor]) {
                        stack.push(neighbor);
                    }
                }
            }
        }
        return result;
    }

    // ============================================================
    //  主方法
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  RecursionToIteration —— 递归转迭代演示");
        System.out.println("================================================\n");

        // ---------- 二叉树遍历 ----------
        System.out.println("----- 二叉树遍历对比 -----");

        TreeNode root = buildSampleTree();
        System.out.println("  树结构:");
        System.out.println("        1");
        System.out.println("       / \\");
        System.out.println("      2   3");
        System.out.println("     / \\   \\");
        System.out.println("    4   5   6\n");

        // 前序
        List<Integer> preR = new ArrayList<>();
        preorderRecursive(root, preR);
        List<Integer> preI = preorderIterative(root);
        System.out.printf("  前序 递归: %s%n", preR);
        System.out.printf("  前序 迭代: %s%n", preI);
        System.out.printf("  匹配: %s%n%n", preR.equals(preI) ? "✓" : "✗");

        // 中序
        List<Integer> inR = new ArrayList<>();
        inorderRecursive(root, inR);
        List<Integer> inI = inorderIterative(root);
        System.out.printf("  中序 递归: %s%n", inR);
        System.out.printf("  中序 迭代: %s%n", inI);
        System.out.printf("  匹配: %s%n%n", inR.equals(inI) ? "✓" : "✗");

        // 后序
        List<Integer> postR = new ArrayList<>();
        postorderRecursive(root, postR);
        List<Integer> postI = postorderIterative(root);
        System.out.printf("  后序 递归: %s%n", postR);
        System.out.printf("  后序 迭代: %s%n", postI);
        System.out.printf("  匹配: %s%n%n", postR.equals(postI) ? "✓" : "✗");

        // ---------- 图的 DFS ----------
        System.out.println("----- 图的 DFS: 递归 vs 迭代 -----");

        // 构建图（邻接表）
        //     0 — 1 — 3
        //     |   |
        //     2 — 4
        int n = 5;
        List<List<Integer>> graph = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            graph.add(new ArrayList<>());
        }
        graph.get(0).add(1);
        graph.get(0).add(2);
        graph.get(1).add(0);
        graph.get(1).add(3);
        graph.get(1).add(4);
        graph.get(2).add(0);
        graph.get(2).add(4);
        graph.get(3).add(1);
        graph.get(4).add(1);
        graph.get(4).add(2);

        System.out.println("  图结构（邻接表）:");
        for (int i = 0; i < n; i++) {
            System.out.println("    " + i + " → " + graph.get(i));
        }
        System.out.println();

        // DFS 递归
        List<Integer> dfsR = new ArrayList<>();
        boolean[] visited = new boolean[n];
        dfsRecursive(graph, visited, 0, dfsR);
        System.out.printf("  DFS 递归: %s%n", dfsR);

        // DFS 迭代
        List<Integer> dfsI = dfsIterative(graph, 0);
        System.out.printf("  DFS 迭代: %s%n", dfsI);

        // 注意：递归和迭代的 DFS 访问顺序可能不同，取决于压栈顺序
        System.out.println("  注: 递归与迭代的访问顺序可能略有不同（取决于邻居遍历顺序）");

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}