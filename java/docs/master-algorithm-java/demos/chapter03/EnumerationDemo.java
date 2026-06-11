package masteralgo.chapter03;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 枚举法演示 —— 旅行商问题（TSP）的暴力求解
 *
 * 问题描述：
 *   给定 N 个城市和城市之间的距离矩阵，找出一条经过所有城市恰好一次
 *  （哈密顿回路）并返回出发城市的最短路径。
 *
 * 枚举法思路：
 *   1. 固定出发城市（设为城市 0）
 *   2. 枚举剩余 N-1 个城市的所有排列
 *   3. 对每个排列计算总路程
 *   4. 取总路程最小的排列
 *
 * 时间复杂度：O(N!)，因为需要枚举 (N-1)! 种排列
 *   对于 N=10，(N-1)! = 362880 ≈ 3.6 × 10⁵，尚可接受
 *   对于 N=12，(N-1)! = 39916800 ≈ 4 × 10⁷，已经吃力
 *   对于 N=20，约 1.2 × 10¹⁷，完全不可行
 *
 * 这也是为什么说"枚举法只适用于 N ≤ 10"的经典问题。
 *
 * @author master-algorithm-java
 */
public class EnumerationDemo {

    /**
     * 用暴力枚举法求解 TSP
     *
     * @param dist 距离矩阵，dist[i][j] 表示城市 i 到城市 j 的距离
     * @return 包含最短路径信息的 Result 对象
     */
    public static TspResult solveTSP(int[][] dist) {
        int n = dist.length;
        if (n <= 1) {
            return new TspResult(0, new int[]{0}, 0);
        }

        // 城市编号：0, 1, 2, ..., n-1
        // 固定城市 0 为起点和终点，枚举其余城市的排列
        Integer[] cities = new Integer[n - 1];
        for (int i = 0; i < n - 1; i++) {
            cities[i] = i + 1;
        }

        int minDistance = Integer.MAX_VALUE;
        int[] bestPath = null;
        long permutationsChecked = 0;

        // 生成所有排列并逐一检查
        List<Integer[]> allPerms = new ArrayList<>();
        permute(cities, 0, allPerms);

        for (Integer[] perm : allPerms) {
            permutationsChecked++;

            // 计算当前排列的总路程：0 → perm[0] → perm[1] → ... → perm[n-2] → 0
            int totalDist = 0;
            int current = 0; // 从城市 0 出发

            for (int city : perm) {
                totalDist += dist[current][city];
                current = city;
            }
            totalDist += dist[current][0]; // 返回城市 0

            // 更新最短路径
            if (totalDist < minDistance) {
                minDistance = totalDist;
                bestPath = new int[n + 1];
                bestPath[0] = 0;
                for (int i = 0; i < perm.length; i++) {
                    bestPath[i + 1] = perm[i];
                }
                bestPath[n] = 0; // 回到起点
            }
        }

        return new TspResult(minDistance, bestPath, permutationsChecked);
    }

    /**
     * 生成数组的所有排列（递归回溯）
     */
    private static void permute(Integer[] arr, int start, List<Integer[]> result) {
        if (start == arr.length - 1) {
            result.add(arr.clone());
            return;
        }

        for (int i = start; i < arr.length; i++) {
            swap(arr, start, i);
            permute(arr, start + 1, result);
            swap(arr, start, i); // 回溯
        }
    }

    private static void swap(Integer[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }

    /**
     * TSP 结果封装
     */
    public static class TspResult {
        public final int minDistance;
        public final int[] path;
        public final long permutationsChecked;

        public TspResult(int minDistance, int[] path, long permutationsChecked) {
            this.minDistance = minDistance;
            this.path = path;
            this.permutationsChecked = permutationsChecked;
        }
    }

    /**
     * 打印路径
     */
    private static String formatPath(int[] path) {
        if (path == null) return "无";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < path.length; i++) {
            if (i > 0) sb.append(" → ");
            sb.append(path[i]);
        }
        return sb.toString();
    }

    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("  枚举法演示：旅行商问题（TSP）暴力求解");
        System.out.println("============================================\n");

        // ----------------------------------------------------------
        // 用例一：4 个城市的 TSP
        // ----------------------------------------------------------
        System.out.println("【用例一】4 个城市（n=4，枚举 3! = 6 种排列）");

        int[][] dist4 = {
            {0, 10, 15, 20},
            {10, 0, 35, 25},
            {15, 35, 0, 30},
            {20, 25, 30, 0}
        };

        System.out.println("  距离矩阵:");
        printMatrix(dist4);

        TspResult result4 = solveTSP(dist4);
        System.out.println("  检查的排列数: " + result4.permutationsChecked);
        System.out.println("  最短路径: " + formatPath(result4.path));
        System.out.println("  最短距离: " + result4.minDistance);
        System.out.println();

        // ----------------------------------------------------------
        // 用例二：5 个城市的 TSP
        // ----------------------------------------------------------
        System.out.println("【用例二】5 个城市（n=5，枚举 4! = 24 种排列）");

        int[][] dist5 = {
            {0, 12, 8, 25, 18},
            {12, 0, 20, 15, 30},
            {8, 20, 0, 10, 22},
            {25, 15, 10, 0, 28},
            {18, 30, 22, 28, 0}
        };

        System.out.println("  距离矩阵:");
        printMatrix(dist5);

        TspResult result5 = solveTSP(dist5);
        System.out.println("  检查的排列数: " + result5.permutationsChecked);
        System.out.println("  最短路径: " + formatPath(result5.path));
        System.out.println("  最短距离: " + result5.minDistance);
        System.out.println();

        // ----------------------------------------------------------
        // 演示三：枚举量随城市数量的增长趋势
        // ----------------------------------------------------------
        System.out.println("【演示三】枚举量随城市数量的增长");
        System.out.println("  " + "-".repeat(50));
        System.out.println("  " + String.format("%-10s %-15s %-15s", "城市数n", "排列数 (n-1)!", "可行性"));
        System.out.println("  " + "-".repeat(50));
        long[] factorial = {1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600};
        for (int n = 3; n <= 12; n++) {
            long perms = factorial[n - 1];
            String feasible;
            if (n <= 8) {
                feasible = "✔ 轻松";
            } else if (n <= 10) {
                feasible = "⚡ 吃力";
            } else {
                feasible = "✘ 不可行";
            }
            System.out.printf("  %-10d %-15d %-15s%n", n, perms, feasible);
        }
        System.out.println("  " + "-".repeat(50));
        System.out.println("  说明：当 n=10 时需检查约 36 万种排列，勉强可行；");
        System.out.println("        n=12 时约 4000 万，已不实用；n=20 时约 1.2×10¹⁷，完全不可行。");
        System.out.println("  这就是为什么枚举法只适用于 n ≤ 10 的小规模问题。");
        System.out.println();

        // ----------------------------------------------------------
        // 演示四：随机生成小规模 TSP 实例
        // ----------------------------------------------------------
        System.out.println("【演示四】n=8 的随机 TSP 实例");
        System.out.println("  生成一个 8 城市随机距离矩阵...");

        java.util.Random rand = new java.util.Random(123);
        int n8 = 8;
        int[][] dist8 = new int[n8][n8];
        for (int i = 0; i < n8; i++) {
            for (int j = 0; j < n8; j++) {
                if (i == j) {
                    dist8[i][j] = 0;
                } else if (j > i) {
                    int d = rand.nextInt(50) + 10; // 10~59 的随机距离
                    dist8[i][j] = d;
                    dist8[j][i] = d;
                }
            }
        }

        long startTime = System.currentTimeMillis();
        TspResult result8 = solveTSP(dist8);
        long endTime = System.currentTimeMillis();

        System.out.println("  检查的排列数: " + result8.permutationsChecked);
        System.out.println("  最短距离: " + result8.minDistance);
        System.out.println("  最短路径: " + formatPath(result8.path));
        System.out.println("  耗时: " + (endTime - startTime) + " ms");
        System.out.println("  注：n=8 只检查 7! = 5040 种排列，非常快。");
        System.out.println("      但 n=20 时需要检查 19! ≈ 1.2×10¹⁷，即使每秒检查 10⁸ 种，");
        System.out.println("      也需要约 38 年。");
    }

    /**
     * 打印距离矩阵
     */
    private static void printMatrix(int[][] matrix) {
        for (int[] row : matrix) {
            System.out.print("    [");
            for (int j = 0; j < row.length; j++) {
                if (j > 0) System.out.print(", ");
                System.out.printf("%2d", row[j]);
            }
            System.out.println("]");
        }
    }
}