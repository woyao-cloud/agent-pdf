package masteralgo.chapter02;

/**
 * 时间复杂度分析演示器
 *
 * 演示各种时间复杂度的典型算法，并统计操作次数。
 * 通过对比不同输入规模（n=10, 100, 1000）下的操作次数，
 * 直观验证理论复杂度与实际操作数的关系。
 *
 * 涵盖的复杂度：
 *   O(1)     — 常数时间
 *   O(log n) — 对数时间（二分查找）
 *   O(n)     — 线性时间（线性查找、数组求和）
 *   O(n log n) — 线性对数时间（归并排序模拟）
 *   O(n²)    — 平方时间（冒泡排序、嵌套循环）
 *   O(2ⁿ)    — 指数时间（朴素斐波那契）
 *
 * @author master-algorithm-java
 */
public class TimeComplexityAnalyzer {

    private static int operationCount;

    // ============================================================
    // O(1) — 常数时间：数组访问
    // ============================================================
    public static int constantTimeAccess(int[] arr, int index) {
        operationCount = 1;  // 一次数组访问
        return arr[index];
    }

    // ============================================================
    // O(log n) — 对数时间：二分查找
    // ============================================================
    public static int binarySearchOperations(int n) {
        operationCount = 0;
        int left = 0, right = n - 1;
        // 模拟二分查找过程，统计操作次数
        while (left <= right) {
            operationCount++;
            int mid = left + (right - left) / 2;
            // 假设目标在 mid 处，直接返回
            // 但为了演示最坏情况，我们假设目标不存在，走完完整流程
            if (mid == left && mid == right) {
                break;
            }
            // 模拟查找右半部分，制造最坏情况
            left = mid + 1;
        }
        return operationCount;
    }

    // ============================================================
    // O(n) — 线性时间：线性查找
    // ============================================================
    public static int linearSearchOperations(int n) {
        operationCount = 0;
        // 模拟线性查找（最坏情况：目标不存在或最后一个）
        for (int i = 0; i < n; i++) {
            operationCount++;  // 一次比较
        }
        return operationCount;
    }

    // ============================================================
    // O(n) — 线性时间：数组求和
    // ============================================================
    public static int sumArrayOperations(int n) {
        operationCount = 0;
        int sum = 0;
        for (int i = 0; i < n; i++) {
            operationCount++;  // 一次加法
            sum += i;
        }
        return operationCount;
    }

    // ============================================================
    // O(n log n) — 线性对数时间：归并排序模拟
    // 模拟归并排序的分解与合并过程，统计比较操作次数
    // ============================================================
    public static int mergeSortOperations(int n) {
        operationCount = 0;
        simulateMergeSort(0, n - 1);
        return operationCount;
    }

    private static void simulateMergeSort(int left, int right) {
        if (left >= right) return;

        int mid = left + (right - left) / 2;

        // 分解：递归处理左右两半
        simulateMergeSort(left, mid);
        simulateMergeSort(mid + 1, right);

        // 合并：合并两个有序子数组需要 O(n) 次比较
        int n = right - left + 1;
        operationCount += n;  // 合并过程的比较/移动操作
    }

    // ============================================================
    // O(n²) — 平方时间：冒泡排序
    // ============================================================
    public static int bubbleSortOperations(int n) {
        operationCount = 0;
        // 模拟冒泡排序
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - 1 - i; j++) {
                operationCount++;  // 一次比较（可能加一次交换）
            }
        }
        return operationCount;
    }

    // ============================================================
    // O(n²) — 平方时间：嵌套循环
    // ============================================================
    public static int nestedLoopOperations(int n) {
        operationCount = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                operationCount++;  // 一次操作
            }
        }
        return operationCount;
    }

    // ============================================================
    // O(2ⁿ) — 指数时间：朴素斐波那契
    // 返回计算 fib(n) 需要的函数调用次数
    // ============================================================
    public static int fibonacciCallCount(int n) {
        operationCount = 0;
        fib(n);
        return operationCount;
    }

    private static int fib(int n) {
        operationCount++;  // 每次调用计数
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
    }

    // ============================================================
    // 主程序：运行所有复杂度测试并打印对比表格
    // ============================================================
    public static void main(String[] args) {
        System.out.println("============================================================");
        System.out.println("  时间复杂度对比分析");
        System.out.println("============================================================");
        System.out.println();
        System.out.println("  以下表格统计了各算法在不同输入规模下的操作次数。");
        System.out.println("  数据验证了理论复杂度与实际操作数的关系。");
        System.out.println();

        // 定义测试的输入规模
        int[] sizes = {10, 100, 1000};

        // 表头
        System.out.printf("  %-20s %-8s %-8s %-10s %-15s%n",
                "算法", "n=10", "n=100", "n=1000", "理论复杂度");
        System.out.println("  " + "-".repeat(70));

        // 对每个输入规模运行所有测试
        for (int n : sizes) {
            // O(1): 常数时间
            int[] dummy = new int[n];
            constantTimeAccess(dummy, 0);
            int o1Ops = operationCount;

            // O(log n): 二分查找
            int logNOps = binarySearchOperations(n);

            // O(n): 线性查找
            int nOpsLinear = linearSearchOperations(n);

            // O(n): 数组求和
            int nOpsSum = sumArrayOperations(n);

            // O(n log n): 归并排序模拟
            int nLogNOps = (n <= 1000) ? mergeSortOperations(n) : -1;

            // O(n²): 冒泡排序
            int n2OpsBubble = bubbleSortOperations(n);

            // O(n²): 嵌套循环
            int n2OpsNested = nestedLoopOperations(n);

            // O(2ⁿ): 斐波那契（n=10 时 ≈ 177 次调用，n=100 时不可计算！）
            int expOps = (n <= 10) ? fibonacciCallCount(n) : -1;

            // 打印该规模下的结果
            if (n == sizes[0]) {
                // 第一次迭代，打印完整表格
                System.out.printf("  %-20s %,8d %,8d %,10d %-15s%n",
                        "数组访问 O(1)", o1Ops, o1Ops, o1Ops, "O(1)");
                System.out.printf("  %-20s %,8d %,8d %,10d %-15s%n",
                        "二分查找 O(log n)", logNOps,
                        binarySearchOperations(100),
                        binarySearchOperations(1000), "O(log n)");
                System.out.printf("  %-20s %,8d %,8d %,10d %-15s%n",
                        "线性查找 O(n)", nOpsLinear,
                        linearSearchOperations(100),
                        linearSearchOperations(1000), "O(n)");
                System.out.printf("  %-20s %,8d %,8d %,10d %-15s%n",
                        "数组求和 O(n)", nOpsSum,
                        sumArrayOperations(100),
                        sumArrayOperations(1000), "O(n)");
                System.out.printf("  %-20s %,8d %,8d %,10d %-15s%n",
                        "归并排序模拟 O(n log n)", nLogNOps,
                        mergeSortOperations(100),
                        mergeSortOperations(1000), "O(n log n)");
                System.out.printf("  %-20s %,8d %,8d %,10d %-15s%n",
                        "冒泡排序 O(n²)", n2OpsBubble,
                        bubbleSortOperations(100),
                        bubbleSortOperations(1000), "O(n²)");
                System.out.printf("  %-20s %,8d %,8d %,10d %-15s%n",
                        "嵌套循环 O(n²)", n2OpsNested,
                        nestedLoopOperations(100),
                        nestedLoopOperations(1000), "O(n²)");
                System.out.printf("  %-20s %,8d %8s %10s %-15s%n",
                        "斐波那契 O(2ⁿ)", expOps, "N/A", "N/A", "O(2ⁿ)");
            }
        }

        System.out.println();
        System.out.println("  ─── 分析 ───");
        System.out.println("  • O(1):  操作数恒定，与 n 无关");
        System.out.println("  • O(log n): n 增长 100 倍，操作数只增长约 2-3 倍");
        System.out.println("  • O(n):  操作数与 n 成正比增长");
        System.out.println("  • O(n log n): 略快于线性增长");
        System.out.println("  • O(n²): n 增长 100 倍，操作数增长约 10,000 倍");
        System.out.println("  • O(2ⁿ): n=10 已产生大量调用，n 再大即不可计算");

        System.out.println();
        System.out.println("============================================================");
        System.out.println("  规模增长对操作数的影响因子");
        System.out.println("============================================================");
        System.out.println();
        System.out.printf("  %-20s %-15s %-15s%n", "复杂度", "10→100 增长倍数", "100→1000 增长倍数");
        System.out.println("  " + "-".repeat(55));
        System.out.printf("  %-20s %-15.1f %-15.1f%n", "O(1)", 1.0, 1.0);
        System.out.printf("  %-20s %-15.1f %-15.1f%n", "O(log n)",
                (double) binarySearchOperations(100) / binarySearchOperations(10),
                (double) binarySearchOperations(1000) / binarySearchOperations(100));
        System.out.printf("  %-20s %-15.1f %-15.1f%n", "O(n)",
                (double) linearSearchOperations(100) / linearSearchOperations(10),
                (double) linearSearchOperations(1000) / linearSearchOperations(100));
        System.out.printf("  %-20s %-15.1f %-15.1f%n", "O(n log n)",
                (double) mergeSortOperations(100) / mergeSortOperations(10),
                (double) mergeSortOperations(1000) / mergeSortOperations(100));
        System.out.printf("  %-20s %-15.1f %-15.1f%n", "O(n²)",
                (double) bubbleSortOperations(100) / bubbleSortOperations(10),
                (double) bubbleSortOperations(1000) / bubbleSortOperations(100));
    }
}