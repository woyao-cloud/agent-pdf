package com.graphdb.demo.algorithms;

import java.util.*;

public class PageRank {

    private static final double DAMPING_FACTOR = 0.85;
    private static final double EPSILON = 1e-6;
    private static final int MAX_ITERATIONS = 100;

    private final Map<String, Set<String>> graph;
    private final Map<String, Double> ranks;

    public PageRank() {
        graph = new HashMap<>();
        ranks = new LinkedHashMap<>();
    }

    public void addPage(String page) {
        graph.putIfAbsent(page, new HashSet<>());
    }

    public void addLink(String from, String to) {
        graph.putIfAbsent(from, new HashSet<>());
        graph.putIfAbsent(to, new HashSet<>());
        graph.get(from).add(to);
    }

    public void compute() {
        int n = graph.size();
        if (n == 0) return;

        double initialRank = 1.0 / n;
        for (String page : graph.keySet()) {
            ranks.put(page, initialRank);
        }

        for (int iter = 0; iter < MAX_ITERATIONS; iter++) {
            Map<String, Double> newRanks = new HashMap<>();
            double danglingSum = 0.0;

            for (String page : graph.keySet()) {
                if (graph.get(page).isEmpty()) {
                    danglingSum += ranks.get(page);
                }
            }

            double maxDiff = 0.0;

            for (String page : graph.keySet()) {
                double sum = 0.0;
                for (String other : graph.keySet()) {
                    Set<String> outLinks = graph.get(other);
                    if (outLinks.contains(page)) {
                        sum += ranks.get(other) / outLinks.size();
                    }
                }

                double newRank = (1 - DAMPING_FACTOR) / n
                        + DAMPING_FACTOR * (sum + danglingSum / n);

                newRanks.put(page, newRank);
                maxDiff = Math.max(maxDiff, Math.abs(newRank - ranks.get(page)));
            }

            ranks.putAll(newRanks);

            if (maxDiff < EPSILON) {
                System.out.println("  [PageRank] 收敛于第 " + (iter + 1) + " 次迭代");
                return;
            }
        }
        System.out.println("  [PageRank] 达到最大迭代次数 " + MAX_ITERATIONS);
    }

    public void printRanks() {
        System.out.println("  PageRank 排名结果:");
        List<Map.Entry<String, Double>> sorted = new ArrayList<>(ranks.entrySet());
        sorted.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

        int rank = 1;
        for (Map.Entry<String, Double> entry : sorted) {
            System.out.printf("    %d. %s : %.6f%n", rank++, entry.getKey(), entry.getValue());
        }
    }

    public static void main(String[] args) {
        System.out.println("=".repeat(60));
        System.out.println("  PageRank 算法演示");
        System.out.println("=".repeat(60));

        PageRank pr = new PageRank();

        pr.addPage("A");
        pr.addPage("B");
        pr.addPage("C");
        pr.addPage("D");
        pr.addPage("E");
        pr.addPage("F");

        pr.addLink("A", "B");
        pr.addLink("A", "C");
        pr.addLink("A", "D");
        pr.addLink("B", "A");
        pr.addLink("B", "D");
        pr.addLink("C", "B");
        pr.addLink("C", "E");
        pr.addLink("D", "C");
        pr.addLink("D", "F");
        pr.addLink("E", "D");
        pr.addLink("E", "F");
        pr.addLink("F", "A");
        pr.addLink("F", "E");

        System.out.println("  网页链接结构:");
        for (String page : pr.graph.keySet()) {
            System.out.println("    " + page + " -> " + pr.graph.get(page));
        }
        System.out.println();

        pr.compute();
        System.out.println();
        pr.printRanks();
    }
}
