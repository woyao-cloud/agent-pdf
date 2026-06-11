package masteralgo.chapter14;

import java.util.*;

/**
 * 遗传算法求解 0-1 背包问题 演示
 *
 * 功能：
 * 1. 二进制染色体表示（1=选中，0=不选）
 * 2. 锦标赛选择 + 单点交叉 + 位翻转变异
 * 3. 跟踪每代最佳适应度
 * 4. 与精确 DP 解对比
 * 5. 参数：种群 100，代数 500，交叉率 0.8，变异率 0.05
 */
public class GeneticAlgorithmDemo {

    // ============================================================
    //  背包问题实例
    // ============================================================
    static class KnapsackInstance {
        final int n;            // 物品数量
        final int capacity;     // 背包容量
        final int[] weights;    // 每个物品的重量
        final int[] values;     // 每个物品的价值

        KnapsackInstance(int n, int capacity, int[] weights, int[] values) {
            this.n = n;
            this.capacity = capacity;
            this.weights = weights;
            this.values = values;
        }
    }

    // ============================================================
    //  精确 DP 解（0-1 背包）
    // ============================================================
    static int dpSolve(KnapsackInstance inst) {
        int[] dp = new int[inst.capacity + 1];
        for (int i = 0; i < inst.n; i++) {
            for (int w = inst.capacity; w >= inst.weights[i]; w--) {
                dp[w] = Math.max(dp[w], dp[w - inst.weights[i]] + inst.values[i]);
            }
        }
        return dp[inst.capacity];
    }

    /** DP 返回具体的选择方案 */
    static boolean[] dpSolution(KnapsackInstance inst) {
        int[] dp = new int[inst.capacity + 1];
        int[][] choice = new int[inst.n + 1][inst.capacity + 1];

        for (int i = 0; i < inst.n; i++) {
            for (int w = inst.capacity; w >= inst.weights[i]; w--) {
                if (dp[w - inst.weights[i]] + inst.values[i] > dp[w]) {
                    dp[w] = dp[w - inst.weights[i]] + inst.values[i];
                    choice[i + 1][w] = 1;
                }
            }
        }

        // 回溯
        boolean[] selected = new boolean[inst.n];
        int w = inst.capacity;
        for (int i = inst.n; i > 0; i--) {
            if (choice[i][w] == 1) {
                selected[i - 1] = true;
                w -= inst.weights[i - 1];
            }
        }
        return selected;
    }

    // ============================================================
    //  遗传算法
    // ============================================================

    static class Individual {
        boolean[] genes;  // true = 选中该物品
        int fitness;      // 适应度 = 总价值（若超重则为 0）

        Individual(int n) {
            genes = new boolean[n];
        }

        void copyFrom(Individual other) {
            System.arraycopy(other.genes, 0, this.genes, 0, this.genes.length);
            this.fitness = other.fitness;
        }
    }

    static class GeneticAlgorithm {
        private final KnapsackInstance inst;
        private final Random rng;
        private final int popSize;
        private final int maxGen;
        private final double crossoverRate;
        private final double mutationRate;
        private final int tournamentSize;

        private Individual[] population;
        private Individual bestEver;
        private double[] bestHistory; // 每代最佳适应度

        GeneticAlgorithm(KnapsackInstance inst, int popSize, int maxGen,
                         double crossoverRate, double mutationRate, long seed) {
            this.inst = inst;
            this.popSize = popSize;
            this.maxGen = maxGen;
            this.crossoverRate = crossoverRate;
            this.mutationRate = mutationRate;
            this.tournamentSize = 3;
            this.rng = new Random(seed);
            this.bestHistory = new double[maxGen];
        }

        /** 初始化种群 */
        void initPopulation() {
            population = new Individual[popSize];
            for (int i = 0; i < popSize; i++) {
                population[i] = new Individual(inst.n);
                // 每个基因以 0.5 概率为 true
                for (int j = 0; j < inst.n; j++) {
                    population[i].genes[j] = rng.nextBoolean();
                }
                population[i].fitness = evaluate(population[i]);
            }
            bestEver = new Individual(inst.n);
            bestEver.fitness = Integer.MIN_VALUE;
        }

        /** 适应度函数：总价值，超重则返回 0 */
        int evaluate(Individual ind) {
            int totalWeight = 0, totalValue = 0;
            for (int i = 0; i < inst.n; i++) {
                if (ind.genes[i]) {
                    totalWeight += inst.weights[i];
                    totalValue += inst.values[i];
                }
            }
            if (totalWeight > inst.capacity) return 0; // 不可行解
            return totalValue;
        }

        /** 锦标赛选择 */
        Individual tournamentSelect() {
            Individual best = null;
            for (int i = 0; i < tournamentSize; i++) {
                int idx = rng.nextInt(popSize);
                if (best == null || population[idx].fitness > best.fitness) {
                    best = population[idx];
                }
            }
            return best;
        }

        /** 单点交叉 */
        void crossover(Individual p1, Individual p2, Individual c1, Individual c2) {
            if (rng.nextDouble() < crossoverRate) {
                int point = rng.nextInt(inst.n - 1) + 1;
                for (int i = 0; i < inst.n; i++) {
                    if (i < point) {
                        c1.genes[i] = p1.genes[i];
                        c2.genes[i] = p2.genes[i];
                    } else {
                        c1.genes[i] = p2.genes[i];
                        c2.genes[i] = p1.genes[i];
                    }
                }
            } else {
                c1.copyFrom(p1);
                c2.copyFrom(p2);
            }
        }

        /** 位翻转变异 */
        void mutate(Individual ind) {
            for (int i = 0; i < inst.n; i++) {
                if (rng.nextDouble() < mutationRate) {
                    ind.genes[i] = !ind.genes[i];
                }
            }
        }

        /** 运行遗传算法 */
        Individual run() {
            initPopulation();

            for (int gen = 0; gen < maxGen; gen++) {
                Individual[] newPop = new Individual[popSize];

                // 精英保留：保留最优个体
                Individual elite = population[0];
                for (Individual ind : population) {
                    if (ind.fitness > elite.fitness) elite = ind;
                }

                // 更新全局最佳
                if (elite.fitness > bestEver.fitness) {
                    bestEver.copyFrom(elite);
                }
                bestHistory[gen] = bestEver.fitness;

                // 生成新种群
                int idx = 0;
                // 精英直接进入下一代
                newPop[idx++] = elite;

                while (idx < popSize) {
                    Individual p1 = tournamentSelect();
                    Individual p2 = tournamentSelect();
                    Individual c1 = new Individual(inst.n);
                    Individual c2 = new Individual(inst.n);
                    crossover(p1, p2, c1, c2);
                    mutate(c1);
                    mutate(c2);
                    c1.fitness = evaluate(c1);
                    c2.fitness = evaluate(c2);
                    newPop[idx++] = c1;
                    if (idx < popSize) newPop[idx++] = c2;
                }

                population = newPop;
            }

            return bestEver;
        }

        double[] getBestHistory() { return bestHistory; }
    }

    // ============================================================
    //  主方法
    // ============================================================

    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  遗传算法求解 0-1 背包问题");
        System.out.println("==========================================");
        System.out.println();

        // 构建背包实例：20 个物品
        int n = 20;
        int[] weights = {
            12, 8, 15, 20, 5, 18, 10, 25, 14, 9,
            7, 22, 16, 11, 30, 6, 13, 19, 24, 4
        };
        int[] values = {
            45, 30, 55, 70, 18, 60, 38, 85, 50, 32,
            25, 75, 58, 40, 95, 22, 48, 65, 80, 15
        };
        int capacity = 80;

        KnapsackInstance inst = new KnapsackInstance(n, capacity, weights, values);

        System.out.println("背包实例:");
        System.out.printf("  物品数量: %d%n", n);
        System.out.printf("  背包容量: %d%n", capacity);
        System.out.println("  物品 (重量, 价值):");
        for (int i = 0; i < n; i++) {
            System.out.printf("    %2d: (%2d, %2d)%n", i, weights[i], values[i]);
        }

        // ---------- 精确 DP 解 ----------
        System.out.println();
        System.out.println("--- 精确 DP 解 ---");
        int dpOpt = dpSolve(inst);
        boolean[] dpSel = dpSolution(inst);
        System.out.printf("  最优总价值: %d%n", dpOpt);
        System.out.print("  选中物品: ");
        int dpWeight = 0;
        for (int i = 0; i < n; i++) {
            if (dpSel[i]) {
                System.out.printf("%d ", i);
                dpWeight += weights[i];
            }
        }
        System.out.printf("(总重量 %d)%n", dpWeight);

        // ---------- 遗传算法 ----------
        System.out.println();
        System.out.println("--- 遗传算法 ---");
        int popSize = 100;
        int maxGen = 500;
        double crossoverRate = 0.8;
        double mutationRate = 0.05;

        System.out.printf("  种群大小: %d%n", popSize);
        System.out.printf("  进化代数: %d%n", maxGen);
        System.out.printf("  交叉率: %.2f%n", crossoverRate);
        System.out.printf("  变异率: %.2f%n", mutationRate);

        GeneticAlgorithm ga = new GeneticAlgorithm(
            inst, popSize, maxGen, crossoverRate, mutationRate, 42);
        Individual best = ga.run();
        double[] history = ga.getBestHistory();

        System.out.println();
        System.out.println("  每代最佳适应度（部分）:");
        int[] checkpoints = {0, 10, 50, 100, 200, 300, 400, 499};
        for (int g : checkpoints) {
            System.out.printf("    第 %3d 代: %d%n", g + 1, (int) history[g]);
        }

        System.out.println();
        System.out.printf("  GA 最佳总价值: %d%n", best.fitness);
        System.out.print("  选中物品: ");
        int gaWeight = 0;
        for (int i = 0; i < n; i++) {
            if (best.genes[i]) {
                System.out.printf("%d ", i);
                gaWeight += weights[i];
            }
        }
        System.out.printf("(总重量 %d)%n", gaWeight);

        System.out.println();
        System.out.printf("  DP 最优值: %d, GA 最优值: %d%n", dpOpt, best.fitness);
        System.out.printf("  GA 与最优解差距: %d (%.2f%% 最优)%n",
            dpOpt - best.fitness,
            (double) best.fitness / dpOpt * 100);

        System.out.println();
        System.out.println("==========================================");
        System.out.println("  演示完毕");
        System.out.println("==========================================");
    }
}