package masteralgo.chapter17;

import java.util.Random;

/**
 * 前缀和与差分数组演示
 *
 * 功能：
 * 1. 一维前缀和 O(1) 区间和查询
 * 2. 二维前缀和 O(1) 子矩阵和查询
 * 3. 与暴力法对比随机查询的性能
 * 4. 差分数组实现区间增量更新
 */
public class PrefixSumDemo {

    // ============================================================
    //  1. 一维前缀和
    // ============================================================

    static int[] buildPrefixSum(int[] arr) {
        int n = arr.length;
        int[] pref = new int[n + 1];
        for (int i = 0; i < n; i++) {
            pref[i + 1] = pref[i] + arr[i];
        }
        return pref;
    }

    /** 一维区间求和 O(1) */
    static int rangeSum(int[] pref, int l, int r) {
        return pref[r + 1] - pref[l];
    }

    /** 一维区间求和暴力 O(n) */
    static int rangeSumBrute(int[] arr, int l, int r) {
        int s = 0;
        for (int i = l; i <= r; i++) s += arr[i];
        return s;
    }

    // ============================================================
    //  2. 二维前缀和
    // ============================================================

    static int[][] buildPrefixSum2D(int[][] mat) {
        int m = mat.length, n = mat[0].length;
        int[][] pref = new int[m + 1][n + 1];
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                pref[i + 1][j + 1] = mat[i][j]
                    + pref[i][j + 1] + pref[i + 1][j] - pref[i][j];
            }
        }
        return pref;
    }

    /**
     * 二维子矩阵求和 O(1)
     * (r1,c1) 左上角, (r2,c2) 右下角 (含)
     */
    static int submatrixSum(int[][] pref, int r1, int c1, int r2, int c2) {
        return pref[r2 + 1][c2 + 1]
            - pref[r1][c2 + 1] - pref[r2 + 1][c1]
            + pref[r1][c1];
    }

    static int submatrixSumBrute(int[][] mat, int r1, int c1, int r2, int c2) {
        int s = 0;
        for (int i = r1; i <= r2; i++)
            for (int j = c1; j <= c2; j++)
                s += mat[i][j];
        return s;
    }

    // ============================================================
    //  3. 差分数组（区间增量更新）
    // ============================================================

    /**
     * 对 arr[l..r] 每个元素加 val
     * 多次更新后统一求结果数组
     */
    static int[] rangeAdd(int[] arr, int[][] updates) {
        int n = arr.length;
        int[] diff = new int[n + 1]; // 差分数组
        for (int[] u : updates) {
            int l = u[0], r = u[1], val = u[2];
            diff[l] += val;
            diff[r + 1] -= val;
        }
        int[] res = arr.clone();
        int cur = 0;
        for (int i = 0; i < n; i++) {
            cur += diff[i];
            res[i] += cur;
        }
        return res;
    }

    // ============================================================
    //  4. 测试与验证
    // ============================================================

    public static void main(String[] args) {
        System.out.println("=== 一维前缀和测试 ===");
        test1D();

        System.out.println("\n=== 二维前缀和测试 ===");
        test2D();

        System.out.println("\n=== 差分数组测试 ===");
        testDiff();

        System.out.println("\n=== 性能对比（一维） ===");
        perfTest1D();
    }

    static void test1D() {
        int[] arr = {1, 3, 5, 7, 9, 11};
        int[] pref = buildPrefixSum(arr);
        // 区间 [1, 3] = 3+5+7 = 15
        int q = rangeSum(pref, 1, 3);
        int qb = rangeSumBrute(arr, 1, 3);
        System.out.println("arr[1..3] = " + q + " (brute: " + qb + ")");
        assert q == 15 && qb == 15 : "一维前缀和错误";
        System.out.println("  ✓ 结果正确");
    }

    static void test2D() {
        int[][] mat = {
            {1, 2, 3},
            {4, 5, 6},
            {7, 8, 9}
        };
        int[][] pref = buildPrefixSum2D(mat);
        // 子矩阵 (0,0)-(1,1) = 1+2+4+5 = 12
        int q = submatrixSum(pref, 0, 0, 1, 1);
        int qb = submatrixSumBrute(mat, 0, 0, 1, 1);
        System.out.println("mat[0..1][0..1] = " + q + " (brute: " + qb + ")");
        assert q == 12 && qb == 12 : "二维前缀和错误";
        System.out.println("  ✓ 结果正确");
    }

    static void testDiff() {
        int[] arr = {0, 0, 0, 0, 0};
        // [0,2] +3, [1,4] -1, [3,4] +5
        int[][] updates = {{0, 2, 3}, {1, 4, -1}, {3, 4, 5}};
        int[] res = rangeAdd(arr, updates);
        // 期望: [3, 2, 2, 4, 4]
        int[] expected = {3, 2, 2, 4, 4};
        boolean ok = true;
        for (int i = 0; i < res.length; i++) {
            if (res[i] != expected[i]) { ok = false; break; }
        }
        System.out.print("差分结果: ");
        java.util.Arrays.stream(res).forEach(v -> System.out.print(v + " "));
        System.out.println();
        assert ok : "差分数组错误";
        System.out.println("  ✓ 结果正确");
    }

    static void perfTest1D() {
        Random rnd = new Random(42);
        int N = 100_000;
        int Q = 50_000;
        int[] arr = rnd.ints(N, 0, 1000).toArray();
        int[] pref = buildPrefixSum(arr);

        // 生成随机查询
        int[][] queries = new int[Q][2];
        for (int i = 0; i < Q; i++) {
            int l = rnd.nextInt(N);
            int r = l + rnd.nextInt(N - l);
            queries[i][0] = l;
            queries[i][1] = r;
        }

        // 前缀和 O(1)
        long t0 = System.nanoTime();
        long sum1 = 0;
        for (int[] q : queries) sum1 += rangeSum(pref, q[0], q[1]);
        long t1 = System.nanoTime();

        // 暴力 O(n)
        long sum2 = 0;
        for (int[] q : queries) sum2 += rangeSumBrute(arr, q[0], q[1]);
        long t2 = System.nanoTime();

        System.out.printf("%d 次查询：前缀和 %.2f ms, 暴力 %.2f ms\n",
            Q, (t1 - t0) / 1e6, (t2 - t1) / 1e6);
        System.out.println("  总和一致: " + (sum1 == sum2));
        assert sum1 == sum2 : "性能测试结果不一致";
    }
}