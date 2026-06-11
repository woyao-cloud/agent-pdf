package masteralgo.chapter14;

import java.util.*;

/**
 * 模拟退火求解 TSP 演示
 *
 * 功能：
 * 1. 随机生成 20 个城市的坐标
 * 2. 使用模拟退火优化 TSP 路线（指数退火 + Metropolis 准则）
 * 3. 每 N 轮打印当前最佳距离
 * 4. 显示初始随机路线 vs SA 优化后的路线总距离
 * 5. 支持多次运行（不同随机种子）
 */
public class SimulatedAnnealing {

    private final int cityCount;
    private final double[][] cities;  // [城市索引][x, y]
    private final double[][] dist;    // 距离矩阵
    private final Random rng;

    public SimulatedAnnealing(int cityCount, long seed) {
        this.cityCount = cityCount;
        this.rng = new Random(seed);
        this.cities = new double[cityCount][2];
        this.dist = new double[cityCount][cityCount];

        // 在 [0, 100) x [0, 100) 范围内随机生成城市坐标
        for (int i = 0; i < cityCount; i++) {
            cities[i][0] = rng.nextDouble() * 100;
            cities[i][1] = rng.nextDouble() * 100;
        }

        // 计算欧氏距离矩阵
        for (int i = 0; i < cityCount; i++) {
            for (int j = 0; j < cityCount; j++) {
                double dx = cities[i][0] - cities[j][0];
                double dy = cities[i][1] - cities[j][1];
                dist[i][j] = Math.sqrt(dx * dx + dy * dy);
            }
        }
    }

    /** 计算一条路径的总距离 */
    double pathLength(int[] path) {
        double len = 0;
        for (int i = 0; i < path.length - 1; i++) {
            len += dist[path[i]][path[i + 1]];
        }
        len += dist[path[path.length - 1]][path[0]]; // 回到起点
        return len;
    }

    /** 生成随机初始路径 */
    int[] randomPath() {
        int[] path = new int[cityCount];
        for (int i = 0; i < cityCount; i++) path[i] = i;
        // Fisher-Yates 洗牌
        for (int i = cityCount - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);
            int tmp = path[i]; path[i] = path[j]; path[j] = tmp;
        }
        return path;
    }

    /** 生成邻域解：随机交换两个城市的位置（2-opt swap） */
    int[] neighbor(int[] path) {
        int[] newPath = path.clone();
        int i = rng.nextInt(cityCount);
        int j = rng.nextInt(cityCount);
        while (j == i) j = rng.nextInt(cityCount);
        // 反转 i 到 j 之间的子路径（2-opt 操作）
        int left = Math.min(i, j);
        int right = Math.max(i, j);
        while (left < right) {
            int tmp = newPath[left];
            newPath[left] = newPath[right];
            newPath[right] = tmp;
            left++;
            right--;
        }
        return newPath;
    }

    /**
     * 模拟退火主算法
     * @param initialTemp 初始温度
     * @param coolingRate 冷却率（指数退火）
     * @param maxIter 最大迭代次数
     * @param printInterval 每多少轮打印一次进度
     * @return 最终路径
     */
    int[] solve(double initialTemp, double coolingRate, int maxIter, int printInterval) {
        int[] current = randomPath();
        double currentLen = pathLength(current);
        int[] best = current.clone();
        double bestLen = currentLen;
        double temp = initialTemp;

        System.out.printf("  初始随机路径距离: %.2f%n", currentLen);

        for (int iter = 1; iter <= maxIter; iter++) {
            int[] next = neighbor(current);
            double nextLen = pathLength(next);
            double delta = nextLen - currentLen;

            // Metropolis 准则
            if (delta < 0 || rng.nextDouble() < Math.exp(-delta / temp)) {
                current = next;
                currentLen = nextLen;
                if (currentLen < bestLen) {
                    best = current.clone();
                    bestLen = currentLen;
                }
            }

            // 指数退火
            temp *= coolingRate;

            // 打印进度
            if (iter % printInterval == 0) {
                System.out.printf("  迭代 %6d / %d, T=%.4f, 当前=%.2f, 最佳=%.2f%n",
                    iter, maxIter, temp, currentLen, bestLen);
            }
        }

        System.out.printf("  SA优化后路径距离: %.2f%n", bestLen);
        return best;
    }

    /**
     * 使用不同的随机种子多次运行，展示稳定性
     */
    static void multipleRuns(int cityCount, int runs, double initialTemp,
                             double coolingRate, int maxIter) {
        System.out.println("  --- 多次运行统计 ---");
        double[] results = new double[runs];
        for (int r = 0; r < runs; r++) {
            SimulatedAnnealing sa = new SimulatedAnnealing(cityCount, r * 9999 + 42);
            sa.solve(initialTemp, coolingRate, maxIter, maxIter); // 不打印中间结果
            // 再次运行以获取最终距离
            // 这里为了统计方便，重新算初始距离和执行SA
        }
        // 重新精确统计
        for (int r = 0; r < runs; r++) {
            SimulatedAnnealing sa = new SimulatedAnnealing(cityCount, r * 9999 + 42);
            int[] path = sa.solve(initialTemp, coolingRate, maxIter, maxIter);
            results[r] = sa.pathLength(path);
        }
        double avg = 0, min = Double.MAX_VALUE, max = Double.MIN_VALUE;
        for (double v : results) {
            avg += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        avg /= runs;
        System.out.printf("  运行 %d 次统计: 平均=%.2f, 最小=%.2f, 最大=%.2f%n",
            runs, avg, min, max);
    }

    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  模拟退火求解 TSP 演示");
        System.out.println("==========================================");
        System.out.println();

        int cityCount = 20;
        double initialTemp = 1000;
        double coolingRate = 0.995;
        int maxIter = 20000;
        int printInterval = 2000;

        System.out.println("参数设置:");
        System.out.printf("  城市数量: %d%n", cityCount);
        System.out.printf("  初始温度: %.1f%n", initialTemp);
        System.out.printf("  冷却速率: %.4f (指数退火)%n", coolingRate);
        System.out.printf("  最大迭代: %d%n%n", maxIter);

        // 单次运行（带详细日志）
        System.out.println("--- 单次运行 ---");
        SimulatedAnnealing sa = new SimulatedAnnealing(cityCount, 2024);
        int[] bestPath = sa.solve(initialTemp, coolingRate, maxIter, printInterval);

        System.out.println();
        System.out.printf("  最佳路径: %s%n", Arrays.toString(bestPath));
        System.out.println();

        // 多次运行统计稳定性
        System.out.println("--- 多次运行统计（展示稳定性）---");
        multipleRuns(cityCount, 10, initialTemp, coolingRate, maxIter);

        System.out.println();
        System.out.println("==========================================");
        System.out.println("  演示完毕");
        System.out.println("==========================================");
    }
}