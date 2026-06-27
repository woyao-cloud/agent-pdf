package com.graphdb.demo.algorithms;

import java.util.*;

public class CommunityDetection {

    private static final int MAX_ITERATIONS = 100;

    private final Map<Integer, Set<Integer>> graph;
    private final Map<Integer, Integer> labels;

    public CommunityDetection() {
        graph = new HashMap<>();
        labels = new HashMap<>();
    }

    public void addNode(int node) {
        graph.putIfAbsent(node, new HashSet<>());
    }

    public void addEdge(int from, int to) {
        graph.putIfAbsent(from, new HashSet<>());
        graph.putIfAbsent(to, new HashSet<>());
        graph.get(from).add(to);
        graph.get(to).add(from);
    }

    public void run() {
        for (int node : graph.keySet()) {
            labels.put(node, node);
        }

        System.out.println("  初始标签: 每个节点以自身ID作为标签");

        for (int iter = 0; iter < MAX_ITERATIONS; iter++) {
            boolean changed = false;
            List<Integer> nodes = new ArrayList<>(graph.keySet());
            Collections.shuffle(nodes, new Random(42));

            for (int node : nodes) {
                Set<Integer> neighbors = graph.get(node);
                if (neighbors.isEmpty()) continue;

                Map<Integer, Integer> freq = new HashMap<>();
                for (int neighbor : neighbors) {
                    int label = labels.get(neighbor);
                    freq.put(label, freq.getOrDefault(label, 0) + 1);
                }

                int maxCount = 0;
                int bestLabel = labels.get(node);
                for (Map.Entry<Integer, Integer> entry : freq.entrySet()) {
                    if (entry.getValue() > maxCount) {
                        maxCount = entry.getValue();
                        bestLabel = entry.getKey();
                    }
                }

                if (bestLabel != labels.get(node)) {
                    labels.put(node, bestLabel);
                    changed = true;
                }
            }

            if (!changed) {
                System.out.println("  [LPA] 收敛于第 " + (iter + 1) + " 次迭代");
                return;
            }
        }
        System.out.println("  [LPA] 达到最大迭代次数 " + MAX_ITERATIONS);
    }

    public void printCommunities() {
        System.out.println("  社区检测结果:");
        Map<Integer, List<Integer>> communities = new HashMap<>();
        for (Map.Entry<Integer, Integer> entry : labels.entrySet()) {
            communities.computeIfAbsent(entry.getValue(), k -> new ArrayList<>()).add(entry.getKey());
        }

        int idx = 1;
        for (Map.Entry<Integer, List<Integer>> entry : communities.entrySet()) {
            System.out.println("    社区 " + idx + " (代表标签=" + entry.getKey() + "): "
                    + entry.getValue());
            idx++;
        }
    }

    public static void main(String[] args) {
        System.out.println("=".repeat(60));
        System.out.println("  标签传播算法 (LPA) 社区检测演示");
        System.out.println("=".repeat(60));

        CommunityDetection cd = new CommunityDetection();

        int[] nodes = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        for (int n : nodes) cd.addNode(n);

        cd.addEdge(1, 2);
        cd.addEdge(1, 3);
        cd.addEdge(2, 3);
        cd.addEdge(2, 4);
        cd.addEdge(3, 4);
        cd.addEdge(4, 5);

        cd.addEdge(6, 7);
        cd.addEdge(6, 8);
        cd.addEdge(7, 8);
        cd.addEdge(7, 9);
        cd.addEdge(8, 9);
        cd.addEdge(9, 10);

        cd.addEdge(4, 6);

        System.out.println("  图结构 (无向边):");
        for (Map.Entry<Integer, Set<Integer>> entry : cd.graph.entrySet()) {
            System.out.println("    " + entry.getKey() + " <-> " + entry.getValue());
        }
        System.out.println("  预期: 节点1-5为一个社区, 节点6-10为另一个社区, 节点4和6为桥接");
        System.out.println();

        cd.run();
        System.out.println();
        cd.printCommunities();
    }
}
