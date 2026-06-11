package masteralgo.chapter01;

/**
 * 算法的五大特征演示 —— 以牛顿迭代法求平方根为例
 *
 * 通过一个具体的算法实例，展示算法的五大特征：
 *   1. 输入（Input）
 *   2. 输出（Output）
 *   3. 有穷性（Finiteness）
 *   4. 确定性（Definiteness）
 *   5. 可行性（Feasibility）
 *
 * 算法：牛顿迭代法（Newton's Method）求平方根
 * 公式：x_{n+1} = (x_n + S / x_n) / 2
 * 其中 S 是要求平方根的数，x_n 是第 n 次迭代的近似值
 *
 * @author master-algorithm-java
 */
public class AlgorithmCharacteristics {

    /**
     * 牛顿迭代法求平方根 —— 一个完整的算法
     *
     * 五大特征分析：
     *
     * 1. 输入（Input）
     *    - 参数 S：要求平方根的正数
     *    - 参数 epsilon：精度控制，决定迭代何时停止
     *    - 验证：方法有明确的参数列表，接收外部数据
     *
     * 2. 输出（Output）
     *    - 返回值：S 的平方根的近似值（double 类型）
     *    - 验证：方法有明确的返回类型，返回计算结果
     *
     * 3. 有穷性（Finiteness）
     *    - 循环条件：|x_{n+1} - x_n| >= epsilon 时继续
     *    - 由于每次迭代都会让近似值更接近真实值，差值的绝对值不断减小，
     *      最终必然会在有限步后小于 epsilon，循环终止
     *    - 同时还设置了 maxIterations 作为安全阀，防止极端情况下的无限循环
     *    - 验证：任何输入都能在有限步内终止
     *
     * 4. 确定性（Definiteness）
     *    - 每一步的计算都是明确、无歧义的：
     *      "x = (x + S / x) / 2" —— 这是精确的数学表达式
     *    - 没有"取一个合适的值"这种模糊指令
     *    - 同样的输入始终得到同样的输出（满足引用透明性）
     *    - 验证：每次用相同的参数调用，结果完全相同
     *
     * 5. 可行性（Feasibility）
     *    - 所有操作都是计算机可以执行的：
     *      加法、除法、减法、比较、绝对值运算
     *    - 不需要任何"在1秒内完成10^100次计算"这种不切实际的操作
     *    - 验证：每一步都是基本算术运算，任何计算机都能执行
     *
     * @param S 要求平方根的数（必须为正数）
     * @param epsilon 精度要求（必须为正数且合理）
     * @param maxIterations 最大迭代次数，防止不收敛时无限循环
     * @return S 的平方根的近似值
     * @throws IllegalArgumentException 当输入参数不合法时
     */
    public static double sqrtNewton(double S, double epsilon, int maxIterations) {
        // 输入验证：算法的健壮性要求
        if (S < 0) {
            throw new IllegalArgumentException("输入不能为负数，但收到了: " + S);
        }
        if (epsilon <= 0 || epsilon > 1) {
            throw new IllegalArgumentException("精度必须在 (0, 1] 范围内");
        }
        if (maxIterations <= 0) {
            throw new IllegalArgumentException("最大迭代次数必须为正数");
        }
        if (S == 0) {
            return 0;  // 边界情况：0 的平方根是 0
        }

        // 初始猜测值：选择 S 本身作为起点
        // 这是一个可行的操作（特征五：可行性）
        double x = S;

        // 迭代计数器，用于演示有穷性
        int iterationCount = 0;

        // 循环条件：当相邻两次的近似值的差 >= epsilon 时继续
        // 保证有穷性（特征三：有穷性）
        // 每次迭代 x 都向真实值靠近一步，差值单调递减，
        // 因此在有限步内一定满足终止条件
        while (true) {
            // 确定性的一步（特征四：确定性）：
            // 牛顿迭代公式的精确实现
            double nextX = (x + S / x) / 2.0;

            // 检查迭代次数，防止意外无限循环
            iterationCount++;
            if (iterationCount > maxIterations) {
                // 实际开发中，这里可以抛异常或返回当前值
                // 这里选择返回当前近似值并打印警告
                System.out.println("  [警告] 达到最大迭代次数 " + maxIterations
                        + "，返回当前近似值");
                return nextX;
            }

            // 检查是否达到精度要求
            if (Math.abs(nextX - x) < epsilon) {
                break;
            }

            x = nextX;
        }

        return x;
    }

    /**
     * 重载版本：使用默认参数，更方便调用
     * 同样满足算法的五个特征
     */
    public static double sqrtNewton(double S) {
        return sqrtNewton(S, 1e-10, 100);
    }

    /**
     * 验证程序：展示算法的五大特征
     */
    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("  算法的五大特征演示：牛顿迭代法求平方根");
        System.out.println("============================================\n");

        // ----------------------------------------------------------
        // 特征一 & 二：输入和输出
        // ----------------------------------------------------------
        System.out.println("【特征一&二】输入（Input）和输出（Output）");
        System.out.println("  输入：方法参数——要求平方根的数 S，精度 epsilon，最大迭代次数");
        System.out.println("  输出：方法返回值——S 的平方根的近似值");
        System.out.println();

        double S = 42.0;
        double result = sqrtNewton(S);
        System.out.println("  调用: sqrtNewton(" + S + ")");
        System.out.println("  输出: " + result);
        System.out.println("  验证: Math.sqrt(" + S + ") = " + Math.sqrt(S));
        System.out.println("  误差: " + Math.abs(result - Math.sqrt(S)));
        System.out.println();

        // ----------------------------------------------------------
        // 特征三：有穷性
        // ----------------------------------------------------------
        System.out.println("【特征三】有穷性（Finiteness）");
        System.out.println("  算法保证在有限步内终止：");
        System.out.println("    - 每次迭代，近似值都向真实值收敛");
        System.out.println("    - 相邻两次迭代的差值单调递减");
        System.out.println("    - 当差值 < epsilon 时终止");

        // 用不同的精度来演示不同迭代次数
        System.out.println("\n  不同精度下的迭代表现：");
        printIterations(100, 1e-1);
        printIterations(100, 1e-5);
        printIterations(100, 1e-10);
        System.out.println();

        // ----------------------------------------------------------
        // 特征四：确定性
        // ----------------------------------------------------------
        System.out.println("【特征四】确定性（Definiteness）");
        System.out.println("  同样的输入始终产生同样的输出：");
        double resultA = sqrtNewton(16, 1e-10, 100);
        double resultB = sqrtNewton(16, 1e-10, 100);
        System.out.println("  第一次调用 sqrtNewton(16) = " + resultA);
        System.out.println("  第二次调用 sqrtNewton(16) = " + resultB);
        System.out.println("  两次结果相同: " + (resultA == resultB ? "✔ 是" : "✘ 否"));
        System.out.println("  （注意：浮点数计算总是确定性的；这里不存在随机性）");
        System.out.println();

        // ----------------------------------------------------------
        // 特征五：可行性
        // ----------------------------------------------------------
        System.out.println("【特征五】可行性（Feasibility）");
        System.out.println("  算法中的所有操作都是计算机可以执行的基本操作：");
        System.out.println("    - 算术运算: +, -, *, /");
        System.out.println("    - 比较运算: <, >, ==");
        System.out.println("    - 赋值运算: =");
        System.out.println("    - 函数调用: Math.abs()");
        System.out.println("  这些操作在任意现代计算机上都可以高效执行。");
        System.out.println();

        // ----------------------------------------------------------
        // 综合演示：多种输入的输出结果
        // ----------------------------------------------------------
        System.out.println("============================================");
        System.out.println("  综合演示：常用数的平方根");
        System.out.println("============================================");
        double[] testValues = {0, 1, 2, 4, 9, 16, 25, 100, 0.25, 0.01};
        System.out.printf("  %-10s %-20s %-20s %-15s%n", "输入(S)", "牛顿法结果", "Math.sqrt()", "误差");
        System.out.println("  " + "-".repeat(70));
        for (double v : testValues) {
            double r = sqrtNewton(v);
            double exact = Math.sqrt(v);
            System.out.printf("  %-10.4f %-20.15f %-20.15f %-15e%n",
                    v, r, exact, Math.abs(r - exact));
        }
    }

    /**
     * 打印指定精度下的迭代信息
     */
    private static void printIterations(double S, double epsilon) {
        double x = S;
        int count = 0;
        int maxIter = 100;

        while (true) {
            double nextX = (x + S / x) / 2.0;
            count++;
            if (Math.abs(nextX - x) < epsilon || count >= maxIter) {
                break;
            }
            x = nextX;
        }

        System.out.printf("  S=%.0f, epsilon=%.0e → 迭代 %d 次, 结果=%.10f%n",
                S, epsilon, count, x);
    }
}