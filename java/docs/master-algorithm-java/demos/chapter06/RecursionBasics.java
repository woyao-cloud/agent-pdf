package masteralgo.chapter06;

/**
 * 递归基础：阶乘、斐波那契、汉诺塔、栈溢出演示
 *
 * 本 Demo 覆盖：
 * 1. 阶乘的递归与迭代实现，对比调用次数
 * 2. 斐波那契的三种实现（朴素递归、记忆化、迭代），展示指数爆炸
 * 3. 故意触发 StackOverflowError 并优雅处理
 * 4. 汉诺塔问题的递归解法与步数统计
 */
public class RecursionBasics {

    // ============================================================
    //  1. 阶乘：递归 vs 迭代
    // ============================================================

    private static int factorialCallCount = 0;

    /** 递归阶乘 */
    public static long factorialRecursive(int n) {
        factorialCallCount++;
        if (n <= 1) return 1;
        return n * factorialRecursive(n - 1);
    }

    /** 迭代阶乘 */
    public static long factorialIterative(int n) {
        long result = 1;
        for (int i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    // ============================================================
    //  2. 斐波那契：三种实现 + 调用次数统计
    // ============================================================

    private static int fibNaiveCallCount = 0;
    private static int fibMemoCallCount = 0;

    /** 朴素递归（指数爆炸） */
    public static long fibNaive(int n) {
        fibNaiveCallCount++;
        if (n <= 1) return n;
        return fibNaive(n - 1) + fibNaive(n - 2);
    }

    /** 记忆化递归 */
    public static long fibMemoized(int n, long[] memo) {
        fibMemoCallCount++;
        if (n <= 1) return n;
        if (memo[n] != 0) return memo[n];
        memo[n] = fibMemoized(n - 1, memo) + fibMemoized(n - 2, memo);
        return memo[n];
    }

    /** 迭代（最优解） */
    public static long fibIterative(int n) {
        if (n <= 1) return n;
        long a = 0, b = 1;
        for (int i = 2; i <= n; i++) {
            long c = a + b;
            a = b;
            b = c;
        }
        return b;
    }

    // ============================================================
    //  3. 栈溢出演示
    // ============================================================

    /** 故意触发栈溢出的深递归 */
    public static void deepRecursion(int depth) {
        if (depth % 10000 == 0) {
            System.out.println("  当前递归深度: " + depth);
        }
        deepRecursion(depth + 1);
    }

    /** 安全测试栈溢出——逐步增加深度直到溢出 */
    public static void testStackOverflow() {
        System.out.println("\n----- 测试栈溢出 -----");
        System.out.println("  尝试深度 100000 的递归...");
        try {
            deepRecursion(0);
        } catch (StackOverflowError e) {
            System.out.println("  [捕获] StackOverflowError 在约 10000 层递归时触发！");
            System.out.println("  原因: JVM 默认栈空间 (约 1MB) 被耗尽");
            System.out.println("  提示: 可用 -Xss 参数增加栈大小，但不推荐依赖深度递归");
        }
    }

    // ============================================================
    //  4. 汉诺塔
    // ============================================================

    private static int hanoiMoveCount = 0;

    /** 汉诺塔递归解法 */
    public static void hanoi(int n, char from, char to, char aux) {
        if (n == 1) {
            hanoiMoveCount++;
            System.out.println("    移动圆盘 1: " + from + " → " + to);
            return;
        }
        hanoi(n - 1, from, aux, to);
        hanoiMoveCount++;
        System.out.println("    移动圆盘 " + n + ": " + from + " → " + to);
        hanoi(n - 1, aux, to, from);
    }

    // ============================================================
    //  主方法
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  RecursionBasics —— 递归基础演示");
        System.out.println("================================================\n");

        // ---------- 1. 阶乘对比 ----------
        System.out.println("----- 1. 阶乘: 递归 vs 迭代 -----");
        for (int n : new int[]{5, 10, 20}) {
            factorialCallCount = 0;
            long fr = factorialRecursive(n);
            long fi = factorialIterative(n);
            System.out.printf("  n=%d → 递归=%d, 迭代=%d, 递归调用次数=%d%n",
                    n, fr, fi, factorialCallCount);
        }

        // ---------- 2. 斐波那契调用次数对比 ----------
        System.out.println("\n----- 2. 斐波那契: 三种实现对比 -----");
        System.out.printf("  %-6s %-20s %-20s %-20s%n",
                "n", "朴素递归(调用次数)", "记忆化(调用次数)", "迭代结果");
        System.out.println("  " + "-".repeat(70));

        for (int n : new int[]{10, 20, 30, 40}) {
            fibNaiveCallCount = 0;
            fibMemoCallCount = 0;

            long start = System.nanoTime();
            long naiveResult = fibNaive(n);
            long naiveTime = System.nanoTime() - start;

            long[] memo = new long[n + 1];
            start = System.nanoTime();
            long memoResult = fibMemoized(n, memo);
            long memoTime = System.nanoTime() - start;

            long iterResult = fibIterative(n);

            System.out.printf("  n=%-4d 朴素=%-12d(%-6dms) 记忆化=%-12d(%-6dms) 迭代=%d%n",
                    n,
                    fibNaiveCallCount, naiveTime / 1_000_000,
                    fibMemoCallCount, memoTime / 1_000_000,
                    iterResult);
        }

        // 特别展示指数爆炸：n=50 时朴素递归不可行
        System.out.println("\n  n=50 朴素递归: 调用次数约 2.5e10，实际无法完成");
        long[] memo50 = new long[51];
        long start = System.nanoTime();
        long fib50 = fibMemoized(50, memo50);
        long memo50Time = System.nanoTime() - start;
        System.out.printf("  n=50 记忆化: 结果=%d, 调用次数=%d, 耗时=%.3fms%n",
                fib50, fibMemoCallCount, memo50Time / 1_000_000.0);
        System.out.printf("  n=50 迭代:   结果=%d%n", fibIterative(50));

        // ---------- 3. 栈溢出演示 ----------
        testStackOverflow();

        // ---------- 4. 汉诺塔 ----------
        System.out.println("\n----- 4. 汉诺塔 (n=3) -----");
        hanoiMoveCount = 0;
        hanoi(3, 'A', 'C', 'B');
        System.out.printf("  总移动步数: %d (应为 2^3-1 = %d)%n", hanoiMoveCount, (1 << 3) - 1);

        System.out.println("\n  汉诺塔 n=5:");
        hanoiMoveCount = 0;
        hanoi(5, 'A', 'C', 'B');
        System.out.printf("  总移动步数: %d (应为 2^5-1 = %d)%n", hanoiMoveCount, (1 << 5) - 1);

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}