package masteralgo.chapter09;

import java.util.*;

/**
 * N皇后问题——回溯算法求解
 *
 * 功能：
 * 1. 求解 N=4 和 N=8 的 N皇后问题，打印棋盘
 * 2. 统计 N=4 到 N=10 的解的数量
 * 3. 统计剪枝次数（记录被提前终止的路径数）
 * 4. 返回所有有效棋盘配置
 */
public class NQueensSolver {

    private int pruneCount; // 剪枝计数器
    private int nodeCount;  // 搜索节点计数器

    public NQueensSolver() {
        this.pruneCount = 0;
        this.nodeCount = 0;
    }

    /**
     * 求解 N 皇后问题，返回所有解
     * @param N 棋盘大小
     * @return 所有合法棋盘配置，每个配置用字符串数组表示
     *         board[i] 是第 i 行的字符串，Q 表示皇后，. 表示空位
     */
    public List<String[]> solveNQueens(int N) {
        pruneCount = 0;
        nodeCount = 0;
        List<String[]> solutions = new ArrayList<>();
        // col[i] 表示第 i 列是否有皇后
        boolean[] col = new boolean[N];
        // diag1[r-c+N-1] 表示副对角线（\ 方向）是否有皇后
        boolean[] diag1 = new boolean[2 * N - 1];
        // diag2[r+c] 表示主对角线（/ 方向）是否有皇后
        boolean[] diag2 = new boolean[2 * N - 1];
        // queens[row] = col，表示第 row 行的皇后放在第 col 列
        int[] queens = new int[N];
        Arrays.fill(queens, -1);

        backtrack(N, 0, queens, col, diag1, diag2, solutions);
        return solutions;
    }

    /**
     * 回溯求解 N 皇后
     * @param row 当前要放置皇后的行
     */
    private void backtrack(int N, int row, int[] queens,
                           boolean[] col, boolean[] diag1, boolean[] diag2,
                           List<String[]> solutions) {
        nodeCount++;
        if (row == N) {
            // 所有行都已放置成功，记录解
            solutions.add(buildBoard(queens, N));
            return;
        }
        for (int c = 0; c < N; c++) {
            int d1 = row - c + N - 1; // 副对角线索引
            int d2 = row + c;          // 主对角线索引
            if (col[c] || diag1[d1] || diag2[d2]) {
                // 冲突——剪枝：这条路径不可能产生合法解
                pruneCount++;
                continue;
            }
            // choose：放置皇后
            queens[row] = c;
            col[c] = true;
            diag1[d1] = true;
            diag2[d2] = true;

            backtrack(N, row + 1, queens, col, diag1, diag2, solutions);

            // unchoose：移除皇后
            queens[row] = -1;
            col[c] = false;
            diag1[d1] = false;
            diag2[d2] = false;
        }
    }

    /**
     * 将皇后位置数组转换为棋盘字符串数组
     */
    private String[] buildBoard(int[] queens, int N) {
        String[] board = new String[N];
        char[] rowChars = new char[N];
        for (int r = 0; r < N; r++) {
            Arrays.fill(rowChars, '.');
            rowChars[queens[r]] = 'Q';
            board[r] = new String(rowChars);
        }
        return board;
    }

    /**
     * 打印棋盘
     */
    public void printBoard(String[] board) {
        for (String row : board) {
            System.out.println("    " + row);
        }
    }

    /**
     * 获取剪枝次数
     */
    public int getPruneCount() {
        return pruneCount;
    }

    /**
     * 获取搜索节点数
     */
    public int getNodeCount() {
        return nodeCount;
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  NQueensSolver —— N皇后问题演示");
        System.out.println("================================================\n");

        // ---------- 1. N=4 ----------
        System.out.println("----- N=4 皇后 -----");
        NQueensSolver solver4 = new NQueensSolver();
        List<String[]> solutions4 = solver4.solveNQueens(4);
        System.out.println("  解的数量: " + solutions4.size() + " (期望: 2)");
        for (int i = 0; i < solutions4.size(); i++) {
            System.out.println("  解 " + (i + 1) + ":");
            solver4.printBoard(solutions4.get(i));
        }
        System.out.println("  搜索节点数: " + solver4.getNodeCount());
        System.out.println("  剪枝次数: " + solver4.getPruneCount());
        System.out.println();

        // ---------- 2. N=8 ----------
        System.out.println("----- N=8 皇后 -----");
        NQueensSolver solver8 = new NQueensSolver();
        List<String[]> solutions8 = solver8.solveNQueens(8);
        System.out.println("  解的数量: " + solutions8.size() + " (期望: 92)");
        System.out.println("  搜索节点数: " + solver8.getNodeCount());
        System.out.println("  剪枝次数: " + solver8.getPruneCount());
        System.out.println("  前两个解:");
        for (int i = 0; i < Math.min(2, solutions8.size()); i++) {
            System.out.println("  解 " + (i + 1) + ":");
            solver8.printBoard(solutions8.get(i));
        }
        System.out.println();

        // ---------- 3. N=4 到 N=10 的统计 ----------
        System.out.println("----- N皇后解的数量统计 (N=4 ~ N=10) -----");
        System.out.printf("  %-6s %-10s %-14s %-12s%n", "N", "解的数量", "搜索节点数", "剪枝次数");
        System.out.println("  " + "-".repeat(44));
        for (int n = 4; n <= 10; n++) {
            NQueensSolver solver = new NQueensSolver();
            List<String[]> sols = solver.solveNQueens(n);
            System.out.printf("  %-6d %-10d %-14d %-12d%n",
                    n, sols.size(), solver.getNodeCount(), solver.getPruneCount());
        }
        System.out.println();

        // ---------- 4. 剪枝效率分析 ----------
        System.out.println("----- 剪枝效率分析 -----");
        for (int n : new int[]{4, 6, 8, 10}) {
            NQueensSolver solver = new NQueensSolver();
            solver.solveNQueens(n);
            long totalPossible = (long) Math.pow(n, n); // 无剪枝的暴力搜索节点数
            int actual = solver.getNodeCount();
            double pruneEfficiency = (1 - (double) actual / totalPossible) * 100;
            System.out.printf("  N=%d: 理论节点 %d, 实际节点 %d, 剪枝效率 %.6f%%%n",
                    n, totalPossible, actual, pruneEfficiency);
        }

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}