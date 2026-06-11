package masteralgo.chapter17;

import java.util.Random;

/**
 * 缓存友好算法演示
 *
 * 功能：
 * 1. 行优先 vs 列优先遍历（展示缓存行效果）
 * 2. 朴素矩阵乘法 vs 分块（tiled）矩阵乘法
 * 3. 测量并输出各方案耗时
 */
public class CacheFriendlyDemo {

    // ============================================================
    //  1. 行优先 vs 列优先遍历
    // ============================================================

    /**
     * 按行遍历（cache-friendly）：外层 i，内层 j
     * 内存访问模式：matrix[0][0], matrix[0][1], ..., matrix[0][n-1], matrix[1][0], ...
     */
    static long rowMajorSum(int[][] matrix) {
        int n = matrix.length;
        long sum = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                sum += matrix[i][j];
            }
        }
        return sum;
    }

    /**
     * 按列遍历（cache-unfriendly）：外层 j，内层 i
     * 内存访问模式：matrix[0][0], matrix[1][0], ..., matrix[n-1][0], matrix[0][1], ...
     * 每次跨行跳转，不命中缓存行
     */
    static long columnMajorSum(int[][] matrix) {
        int n = matrix.length;
        long sum = 0;
        for (int j = 0; j < n; j++) {
            for (int i = 0; i < n; i++) {
                sum += matrix[i][j];
            }
        }
        return sum;
    }

    // ============================================================
    //  2. 矩阵乘法：朴素 vs 分块
    // ============================================================

    /** 朴素 O(n³) 矩阵乘法 */
    static int[][] naiveMultiply(int[][] A, int[][] B) {
        int n = A.length;
        int[][] C = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                int sum = 0;
                for (int k = 0; k < n; k++) {
                    sum += A[i][k] * B[k][j];
                }
                C[i][j] = sum;
            }
        }
        return C;
    }

    /** 分块（tiled）矩阵乘法 */
    static int[][] tiledMultiply(int[][] A, int[][] B, int blockSize) {
        int n = A.length;
        int[][] C = new int[n][n];
        for (int ii = 0; ii < n; ii += blockSize) {
            for (int jj = 0; jj < n; jj += blockSize) {
                for (int kk = 0; kk < n; kk += blockSize) {
                    // 计算小块 [ii..ii+B) × [kk..kk+B) × [jj..jj+B)
                    for (int i = ii; i < Math.min(ii + blockSize, n); i++) {
                        for (int k = kk; k < Math.min(kk + blockSize, n); k++) {
                            int aik = A[i][k];
                            for (int j = jj; j < Math.min(jj + blockSize, n); j++) {
                                C[i][j] += aik * B[k][j];
                            }
                        }
                    }
                }
            }
        }
        return C;
    }

    // 验证两个矩阵相等
    static boolean matricesEqual(int[][] A, int[][] B) {
        int n = A.length;
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (A[i][j] != B[i][j]) return false;
        return true;
    }

    // ============================================================
    //  3. 主测试入口
    // ============================================================

    public static void main(String[] args) {
        System.out.println("=== 缓存友好性测试 ===\n");

        // 测试 1: 行优先 vs 列优先
        System.out.println("--- 测试1: 矩阵遍历顺序 ---");
        int N1 = 4096; // 约 64MB（4096×4096×4 字节）
        System.out.printf("矩阵大小: %d × %d\n", N1, N1);
        int[][] mat = new int[N1][N1];
        Random rnd = new Random(42);
        for (int i = 0; i < N1; i++)
            for (int j = 0; j < N1; j++)
                mat[i][j] = rnd.nextInt(100);

        // 行优先
        long t0 = System.nanoTime();
        long sumRow = rowMajorSum(mat);
        long t1 = System.nanoTime();

        // 列优先
        long t2 = System.nanoTime();
        long sumCol = columnMajorSum(mat);
        long t3 = System.nanoTime();

        System.out.printf("  行优先: %.2f ms\n", (t1 - t0) / 1e6);
        System.out.printf("  列优先: %.2f ms\n", (t3 - t2) / 1e6);
        System.out.printf("  加速比: %.2fx\n", (double)(t3 - t2) / (t1 - t0));
        assert sumRow == sumCol : "遍历结果不一致";
        System.out.println("  ✓ 结果正确\n");

        // 测试 2: 矩阵乘法（较小的矩阵以避免时间过长）
        System.out.println("--- 测试2: 矩阵乘法（朴素 vs 分块）---");
        int N2 = 512;
        System.out.printf("矩阵大小: %d × %d\n", N2, N2);
        int[][] A = new int[N2][N2];
        int[][] B = new int[N2][N2];
        for (int i = 0; i < N2; i++) {
            for (int j = 0; j < N2; j++) {
                A[i][j] = rnd.nextInt(10);
                B[i][j] = rnd.nextInt(10);
            }
        }

        // 预热 JIT
        naiveMultiply(A, B);
        tiledMultiply(A, B, 32);

        // 朴素乘法
        long t4 = System.nanoTime();
        int[][] C1 = naiveMultiply(A, B);
        long t5 = System.nanoTime();

        // 分块乘法（不同块大小）
        int[] blockSizes = {16, 32, 64, 128};
        for (int b : blockSizes) {
            long t6 = System.nanoTime();
            int[][] C2 = tiledMultiply(A, B, b);
            long t7 = System.nanoTime();
            boolean eq = matricesEqual(C1, C2);
            System.out.printf("  分块(b=%3d): %.2f ms (正确: %s)\n",
                b, (t7 - t6) / 1e6, eq);
            assert eq : "分块乘法结果不一致";
        }
        System.out.printf("  朴素乘法:  %.2f ms\n", (t5 - t4) / 1e6);
        System.out.println("  ✓ 所有结果正确");

        // 测试 3: 较大矩阵的分块乘法
        System.out.println("\n--- 测试3: 更大矩阵的分块对比 ---");
        int N3 = 1024;
        System.out.printf("矩阵大小: %d × %d\n", N3, N3);
        A = new int[N3][N3];
        B = new int[N3][N3];
        for (int i = 0; i < N3; i++) {
            for (int j = 0; j < N3; j++) {
                A[i][j] = rnd.nextInt(10);
                B[i][j] = rnd.nextInt(10);
            }
        }

        long t8 = System.nanoTime();
        C1 = naiveMultiply(A, B);
        long t9 = System.nanoTime();

        long t10 = System.nanoTime();
        int[][] C3 = tiledMultiply(A, B, 64);
        long t11 = System.nanoTime();

        System.out.printf("  朴素:  %.2f ms\n", (t9 - t8) / 1e6);
        System.out.printf("  分块(b=64): %.2f ms\n", (t11 - t10) / 1e6);
        System.out.printf("  加速比: %.2fx\n", (double)(t9 - t8) / (t11 - t10));
        assert matricesEqual(C1, C3) : "大矩阵乘法结果不一致";
        System.out.println("  ✓ 结果正确");
    }
}