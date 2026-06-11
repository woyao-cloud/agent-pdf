package masteralgo.chapter02;

/**
 * 空间复杂度分析演示器
 *
 * 演示各种空间复杂度的典型算法，并通过内存追踪
 * 直观展示额外空间消耗与输入规模的关系。
 *
 * 涵盖的复杂度：
 *   O(1)      — 常数空间：原地数组反转
 *   O(n)      — 线性空间：数组复制、递归阶乘（栈空间）
 *   O(n²)     — 平方空间：二维矩阵创建
 *   尾递归优化  — 从 O(n) 空间降到 O(1) 的演示
 *
 * @author master-algorithm-java
 */
public class SpaceComplexityAnalyzer {

    // 用于追踪内存分配的计数器
    private static long extraMemoryBytes;
    private static int recursionDepth;
    private static int maxRecursionDepth;

    // 假设引用类型占用 8 字节，基本类型占用 4 字节
    private static final int REF_SIZE = 8;
    private static final int INT_SIZE = 4;

    // ============================================================
    // O(1) 空间 — 原地数组反转
    // 只使用有限几个额外变量，不随输入规模变化
    // ============================================================
    public static void reverseInPlace(int[] arr) {
        // 重置内存计数器
        extraMemoryBytes = 0;

        // 3 个局部变量：left, right, temp
        // 每个 int 占用 4 字节，共 12 字节
        extraMemoryBytes = 3L * INT_SIZE;

        int left = 0;
        int right = arr.length - 1;

        while (left < right) {
            int temp = arr[left];
            arr[left] = arr[right];
            arr[right] = temp;
            left++;
            right--;
        }

        System.out.println("    额外空间: " + extraMemoryBytes + " 字节 (3 个 int 变量)");
        System.out.println("    空间复杂度: O(1) — 与数组长度无关");
    }

    // ============================================================
    // O(n) 空间 — 数组复制
    // 额外创建一个与原数组相同大小的新数组
    // ============================================================
    public static int[] copyArray(int[] arr) {
        extraMemoryBytes = 0;

        // 新数组占用 n * 4 字节
        long arrayMemory = (long) arr.length * INT_SIZE;
        // 数组对象头约 16 字节，length 字段 4 字节
        long arrayOverhead = 16L + INT_SIZE;
        extraMemoryBytes = arrayMemory + arrayOverhead;

        // 外加一个局部变量（引用）
        extraMemoryBytes += REF_SIZE;

        int[] copy = new int[arr.length];
        for (int i = 0; i < arr.length; i++) {
            copy[i] = arr[i];
        }

        System.out.println("    额外空间: " + extraMemoryBytes + " 字节");
        System.out.println("      - 新数组: " + arr.length + " 个 int × 4 字节 = " + arrayMemory + " 字节");
        System.out.println("      - 数组头开销: " + arrayOverhead + " 字节");
        System.out.println("      - 引用变量: " + REF_SIZE + " 字节");
        System.out.println("    空间复杂度: O(n) — 与数组长度成正比");

        return copy;
    }

    // ============================================================
    // O(n) 空间 — 递归阶乘（栈空间）
    // 递归深度为 n，调用栈消耗 O(n) 空间
    // ============================================================
    public static long factorialRecursive(int n) {
        recursionDepth = 0;
        maxRecursionDepth = 0;
        extraMemoryBytes = 0;
        return factorialHelper(n);
    }

    private static long factorialHelper(int n) {
        recursionDepth++;
        maxRecursionDepth = Math.max(maxRecursionDepth, recursionDepth);

        if (n <= 1) {
            recursionDepth--;
            return 1;
        }

        // 每个栈帧大约占 48 字节（返回地址、局部变量、参数等）
        long result = n * factorialHelper(n - 1);

        recursionDepth--;
        return result;
    }

    public static void printFactorialRecursiveInfo(int n) {
        long result = factorialRecursive(n);
        // 估算总栈空间：最大递归深度 × 每帧大小
        long frameSize = 48L;  // 每个栈帧约 48 字节
        extraMemoryBytes = (long) maxRecursionDepth * frameSize;

        System.out.println("    结果: " + n + "! = " + result);
        System.out.println("    最大递归深度: " + maxRecursionDepth);
        System.out.println("    估算栈空间: " + extraMemoryBytes + " 字节 (" + maxRecursionDepth + " 帧 × ~" + frameSize + " 字节/帧)");
        System.out.println("    空间复杂度: O(n) — 递归深度为 n");
    }

    // ============================================================
    // 尾递归阶乘（演示优化可能性）
    // 理论空间 O(1)，Java 目前不做尾递归优化
    // ============================================================
    public static long factorialTailRecursive(int n) {
        recursionDepth = 0;
        maxRecursionDepth = 0;
        return factorialTailHelper(n, 1);
    }

    private static long factorialTailHelper(int n, int accumulator) {
        recursionDepth++;
        maxRecursionDepth = Math.max(maxRecursionDepth, recursionDepth);

        if (n <= 1) {
            recursionDepth--;
            return accumulator;
        }

        // 尾递归：递归调用是最后一步，结果直接返回
        long result = factorialTailHelper(n - 1, n * accumulator);

        recursionDepth--;
        return result;
    }

    public static void printFactorialTailInfo(int n) {
        long result = factorialTailRecursive(n);
        long frameSize = 48L;
        extraMemoryBytes = (long) maxRecursionDepth * frameSize;

        System.out.println("    结果: " + n + "! = " + result);
        System.out.println("    最大递归深度: " + maxRecursionDepth);
        System.out.println("    估算栈空间: " + extraMemoryBytes + " 字节");
        System.out.println("    说明: 这是尾递归形式，若 JVM 支持 TCO，");
        System.out.println("          栈空间可从 O(n) 降到 O(1)");
        System.out.println("          但目前 HotSpot JVM 不执行尾递归优化");
        System.out.println("          实际空间复杂度仍为 O(n)");
    }

    // ============================================================
    // O(n²) 空间 — 二维矩阵创建
    // 创建 n × n 的矩阵，消耗 n² 个元素的空间
    // ============================================================
    public static int[][] createMatrix(int n) {
        extraMemoryBytes = 0;

        // 主数组：n 个引用
        long mainArray = (long) n * REF_SIZE + 16L + INT_SIZE;
        // 每行：n 个 int
        long rowsMemory = (long) n * ((long) n * INT_SIZE + 16L + INT_SIZE);
        extraMemoryBytes = mainArray + rowsMemory;

        // 外加局部变量
        extraMemoryBytes += REF_SIZE;  // matrix 引用

        int[][] matrix = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                matrix[i][j] = i + j;
            }
        }

        System.out.println("    额外空间: " + extraMemoryBytes + " 字节");
        System.out.println("      - 主数组（" + n + " 个引用）: " + mainArray + " 字节");
        System.out.println("      - 子数组（" + n + " × " + n + " = " + (n * n) + " 个 int）: " + rowsMemory + " 字节");
        System.out.println("    空间复杂度: O(n²) — 与 n² 成正比");

        return matrix;
    }

    // ============================================================
    // 迭代阶乘（O(1) 空间对比）
    // 用于对比递归版本的 O(n) 空间消耗
    // ============================================================
    public static long factorialIterative(int n) {
        extraMemoryBytes = 4L * INT_SIZE;  // 3 个局部变量: i, n, result
        long result = 1;
        for (int i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    public static void printFactorialIterativeInfo(int n) {
        long result = factorialIterative(n);
        System.out.println("    结果: " + n + "! = " + result);
        System.out.println("    额外空间: " + extraMemoryBytes + " 字节 (固定几个局部变量)");
        System.out.println("    空间复杂度: O(1) — 与 n 无关");
    }

    // ============================================================
    // 主程序：运行所有空间复杂度演示
    // ============================================================
    public static void main(String[] args) {
        System.out.println("============================================================");
        System.out.println("  空间复杂度对比分析");
        System.out.println("============================================================");
        System.out.println();

        // ----------------------------------------------------------
        // 1. O(1) 空间：原地数组反转
        // ----------------------------------------------------------
        System.out.println("【1】O(1) 空间 — 原地数组反转");
        System.out.println("----------------------------------------");
        int[] array1 = {1, 2, 3, 4, 5, 6, 7, 8};
        System.out.println("  输入: n = " + array1.length);
        reverseInPlace(array1);
        System.out.print("  反转结果: ");
        for (int v : array1) System.out.print(v + " ");
        System.out.println("\n");

        // ----------------------------------------------------------
        // 2. O(n) 空间：数组复制
        // ----------------------------------------------------------
        System.out.println("【2】O(n) 空间 — 数组复制");
        System.out.println("----------------------------------------");
        int[] array2 = new int[100];
        for (int i = 0; i < array2.length; i++) array2[i] = i;
        System.out.println("  输入: n = " + array2.length);
        copyArray(array2);
        System.out.println();

        // ----------------------------------------------------------
        // 3. O(n) 空间：递归阶乘（栈空间）
        // ----------------------------------------------------------
        System.out.println("【3】O(n) 空间 — 递归阶乘（栈空间）");
        System.out.println("----------------------------------------");
        printFactorialRecursiveInfo(10);
        System.out.println();

        // ----------------------------------------------------------
        // 4. 尾递归 & 迭代对比
        // ----------------------------------------------------------
        System.out.println("【4】空间优化对比：n = 10");
        System.out.println("----------------------------------------");
        System.out.println("  a) 普通递归");
        printFactorialRecursiveInfo(10);
        System.out.println();
        System.out.println("  b) 尾递归（形式上可优化，Java 未实现 TCO）");
        printFactorialTailInfo(10);
        System.out.println();
        System.out.println("  c) 迭代版本（推荐做法）");
        printFactorialIterativeInfo(10);
        System.out.println();

        // ----------------------------------------------------------
        // 5. O(n²) 空间：二维矩阵
        // ----------------------------------------------------------
        System.out.println("【5】O(n²) 空间 — 二维矩阵");
        System.out.println("----------------------------------------");
        for (int n : new int[]{3, 10, 100}) {
            System.out.println("  n = " + n + ":");
            createMatrix(n);
            System.out.println();
        }

        // ----------------------------------------------------------
        // 综合对比表
        // ----------------------------------------------------------
        System.out.println("============================================================");
        System.out.println("  空间复杂度综合对比表");
        System.out.println("============================================================");
        System.out.println();
        System.out.printf("  %-25s %-12s %-12s %-25s%n",
                "算法", "空间复杂度", "是否原地", "说明");
        System.out.println("  " + "-".repeat(75));
        System.out.printf("  %-25s %-12s %-12s %-25s%n",
                "原地数组反转", "O(1)", "是", "仅用 3 个临时变量");
        System.out.printf("  %-25s %-12s %-12s %-25s%n",
                "数组复制", "O(n)", "否", "复制了原数组的所有元素");
        System.out.printf("  %-25s %-12s %-12s %-25s%n",
                "递归阶乘", "O(n)", "否", "调用栈深度为 n");
        System.out.printf("  %-25s %-12s %-12s %-25s%n",
                "迭代阶乘", "O(1)", "是", "固定几个局部变量");
        System.out.printf("  %-25s %-12s %-12s %-25s%n",
                "二维矩阵", "O(n²)", "否", "n × n 个元素");
        System.out.println();
        System.out.println("  ─── 关键结论 ───");
        System.out.println("  • 递归虽简洁，但会消耗 O(深度) 的栈空间");
        System.out.println("  • 能用迭代解决的问题，优先用迭代");
        System.out.println("  • 尾递归在支持 TCO 的语言中是很好的折中方案");
    }
}