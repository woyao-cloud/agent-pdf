package masteralgo.chapter09;

import java.util.*;

/**
 * 数独求解器——回溯算法
 *
 * 功能：
 * 1. 求解 9x9 数独（0 表示空格）
 * 2. 打印初始谜题和求解结果
 * 3. 统计回溯步数，对比不同难度谜题的搜索量
 * 4. 验证解的合法性（行、列、3x3 宫格检查）
 */
public class SudokuSolver {

    private int backtrackCount;   // 回溯总步数（尝试放置数字的次数）
    private int pruneCount;       // 剪枝次数（某个格无合法数字，需要回溯）

    public SudokuSolver() {
        this.backtrackCount = 0;
        this.pruneCount = 0;
    }

    /**
     * 求解数独
     * @param board 9x9 棋盘，0 表示空格
     * @return 是否可解
     */
    public boolean solve(int[][] board) {
        backtrackCount = 0;
        pruneCount = 0;
        return backtrack(board);
    }

    /**
     * 回溯求解——使用 MRV 启发式（选候选数最少的格子）
     */
    private boolean backtrack(int[][] board) {
        int[] next = findEmptyWithMinCandidates(board);
        if (next == null) {
            // 所有格子已填满——找到解
            return true;
        }
        int row = next[0], col = next[1];
        boolean[] candidates = getCandidates(board, row, col);

        for (int num = 1; num <= 9; num++) {
            if (candidates[num]) {
                backtrackCount++;
                board[row][col] = num; // choose
                if (backtrack(board)) {
                    return true; // explore 成功
                }
                board[row][col] = 0;  // unchoose
            }
        }
        // 所有数字都试过，无解——需要回溯
        pruneCount++;
        return false;
    }

    /**
     * 找到候选数字最少的空格（MRV 启发式）
     * @return [row, col] 或 null（全部填满）
     */
    private int[] findEmptyWithMinCandidates(int[][] board) {
        int minCandidates = 10;
        int[] result = null;
        for (int r = 0; r < 9; r++) {
            for (int c = 0; c < 9; c++) {
                if (board[r][c] == 0) {
                    int count = countCandidates(board, r, c);
                    if (count < minCandidates) {
                        minCandidates = count;
                        result = new int[]{r, c};
                        if (count == 1) return result; // 只有1个候选，直接返回
                    }
                }
            }
        }
        return result;
    }

    /**
     * 统计某个空格的候选数字个数
     */
    private int countCandidates(int[][] board, int row, int col) {
        boolean[] candidates = getCandidates(board, row, col);
        int count = 0;
        for (int i = 1; i <= 9; i++) {
            if (candidates[i]) count++;
        }
        return count;
    }

    /**
     * 获取某个空格的候选数字
     * @return boolean[10]，candidates[num]=true 表示 num 可以放入
     */
    private boolean[] getCandidates(int[][] board, int row, int col) {
        boolean[] candidates = new boolean[10];
        Arrays.fill(candidates, true);
        // 行约束
        for (int c = 0; c < 9; c++) {
            if (board[row][c] != 0) candidates[board[row][c]] = false;
        }
        // 列约束
        for (int r = 0; r < 9; r++) {
            if (board[r][col] != 0) candidates[board[r][col]] = false;
        }
        // 3x3 宫格约束
        int boxRow = (row / 3) * 3;
        int boxCol = (col / 3) * 3;
        for (int r = boxRow; r < boxRow + 3; r++) {
            for (int c = boxCol; c < boxCol + 3; c++) {
                if (board[r][c] != 0) candidates[board[r][c]] = false;
            }
        }
        return candidates;
    }

    /**
     * 验证数独解是否合法
     */
    public boolean validateSolution(int[][] board) {
        // 检查每行
        for (int r = 0; r < 9; r++) {
            boolean[] seen = new boolean[10];
            for (int c = 0; c < 9; c++) {
                int num = board[r][c];
                if (num < 1 || num > 9 || seen[num]) return false;
                seen[num] = true;
            }
        }
        // 检查每列
        for (int c = 0; c < 9; c++) {
            boolean[] seen = new boolean[10];
            for (int r = 0; r < 9; r++) {
                int num = board[r][c];
                if (num < 1 || num > 9 || seen[num]) return false;
                seen[num] = true;
            }
        }
        // 检查每个 3x3 宫格
        for (int box = 0; box < 9; box++) {
            boolean[] seen = new boolean[10];
            int boxRow = (box / 3) * 3;
            int boxCol = (box % 3) * 3;
            for (int r = boxRow; r < boxRow + 3; r++) {
                for (int c = boxCol; c < boxCol + 3; c++) {
                    int num = board[r][c];
                    if (num < 1 || num > 9 || seen[num]) return false;
                    seen[num] = true;
                }
            }
        }
        return true;
    }

    /**
     * 打印数独棋盘
     */
    public void printBoard(int[][] board) {
        for (int r = 0; r < 9; r++) {
            if (r % 3 == 0) {
                System.out.println("    +-------+-------+-------+");
            }
            System.out.print("    | ");
            for (int c = 0; c < 9; c++) {
                if (board[r][c] == 0) {
                    System.out.print(". ");
                } else {
                    System.out.print(board[r][c] + " ");
                }
                if ((c + 1) % 3 == 0) {
                    System.out.print("| ");
                }
            }
            System.out.println();
        }
        System.out.println("    +-------+-------+-------+");
    }

    /**
     * 深拷贝二维数组
     */
    private int[][] copyBoard(int[][] board) {
        int[][] copy = new int[9][9];
        for (int i = 0; i < 9; i++) {
            copy[i] = board[i].clone();
        }
        return copy;
    }

    /**
     * 获取回溯步数
     */
    public int getBacktrackCount() {
        return backtrackCount;
    }

    /**
     * 获取剪枝次数
     */
    public int getPruneCount() {
        return pruneCount;
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  SudokuSolver —— 数独求解器演示");
        System.out.println("================================================\n");

        // ---------- 谜题 1：中等难度 ----------
        // 来源：经典数独
        int[][] puzzle1 = {
            {5, 3, 0,  0, 7, 0,  0, 0, 0},
            {6, 0, 0,  1, 9, 5,  0, 0, 0},
            {0, 9, 8,  0, 0, 0,  0, 6, 0},

            {8, 0, 0,  0, 6, 0,  0, 0, 3},
            {4, 0, 0,  8, 0, 3,  0, 0, 1},
            {7, 0, 0,  0, 2, 0,  0, 0, 6},

            {0, 6, 0,  0, 0, 0,  2, 8, 0},
            {0, 0, 0,  4, 1, 9,  0, 0, 5},
            {0, 0, 0,  0, 8, 0,  0, 7, 9}
        };

        System.out.println("----- 谜题 1：中等难度 -----");
        SudokuSolver solver1 = new SudokuSolver();
        System.out.println("  初始谜题:");
        solver1.printBoard(puzzle1);

        int[][] board1 = solver1.copyBoard(puzzle1);
        long start = System.nanoTime();
        boolean solved1 = solver1.solve(board1);
        long elapsed1 = System.nanoTime() - start;

        if (solved1) {
            System.out.println("  求解结果:");
            solver1.printBoard(board1);
            System.out.println("  验证合法性: " + solver1.validateSolution(board1));
            System.out.println("  回溯步数: " + solver1.getBacktrackCount());
            System.out.println("  剪枝次数: " + solver1.getPruneCount());
            System.out.printf("  耗时: %.3f ms%n", elapsed1 / 1_000_000.0);
        } else {
            System.out.println("  无解！");
        }
        System.out.println();

        // ---------- 谜题 2：困难难度 ----------
        // 来源：世界最难数独（算出来的唯一解）
        int[][] puzzle2 = {
            {8, 0, 0,  0, 0, 0,  0, 0, 0},
            {0, 0, 3,  6, 0, 0,  0, 0, 0},
            {0, 7, 0,  0, 9, 0,  2, 0, 0},

            {0, 5, 0,  0, 0, 7,  0, 0, 0},
            {0, 0, 0,  0, 4, 5,  7, 0, 0},
            {0, 0, 0,  1, 0, 0,  0, 3, 0},

            {0, 0, 1,  0, 0, 0,  0, 6, 8},
            {0, 0, 8,  5, 0, 0,  0, 1, 0},
            {0, 9, 0,  0, 0, 0,  4, 0, 0}
        };

        System.out.println("----- 谜题 2：困难难度 -----");
        SudokuSolver solver2 = new SudokuSolver();
        System.out.println("  初始谜题:");
        solver2.printBoard(puzzle2);

        int[][] board2 = solver2.copyBoard(puzzle2);
        start = System.nanoTime();
        boolean solved2 = solver2.solve(board2);
        long elapsed2 = System.nanoTime() - start;

        if (solved2) {
            System.out.println("  求解结果:");
            solver2.printBoard(board2);
            System.out.println("  验证合法性: " + solver2.validateSolution(board2));
            System.out.println("  回溯步数: " + solver2.getBacktrackCount());
            System.out.println("  剪枝次数: " + solver2.getPruneCount());
            System.out.printf("  耗时: %.3f ms%n", elapsed2 / 1_000_000.0);
        } else {
            System.out.println("  无解！");
        }
        System.out.println();

        // ---------- 难度对比 ----------
        System.out.println("----- 难度对比 -----");
        System.out.printf("  %-20s %-15s %-15s %-12s%n",
                "谜题", "回溯步数", "剪枝次数", "耗时(ms)");
        System.out.println("  " + "-".repeat(62));
        System.out.printf("  %-20s %-15d %-15d %-12.3f%n",
                "中等难度", solver1.getBacktrackCount(),
                solver1.getPruneCount(), elapsed1 / 1_000_000.0);
        System.out.printf("  %-20s %-15d %-15d %-12.3f%n",
                "困难难度", solver2.getBacktrackCount(),
                solver2.getPruneCount(), elapsed2 / 1_000_000.0);

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}