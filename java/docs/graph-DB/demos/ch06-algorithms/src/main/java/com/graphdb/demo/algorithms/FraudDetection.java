package com.graphdb.demo.algorithms;

import java.util.*;

public class FraudDetection {

    static class Transaction {
        String from;
        String to;
        double amount;
        Transaction(String from, String to, double amount) {
            this.from = from; this.to = to; this.amount = amount;
        }
        @Override
        public String toString() {
            return from + " -> " + to + " ($" + String.format("%.0f", amount) + ")";
        }
    }

    private final List<Transaction> transactions = new ArrayList<>();
    private final Map<String, List<Transaction>> outEdges = new HashMap<>();
    private final Map<String, List<Transaction>> inEdges = new HashMap<>();

    public void addTransaction(String from, String to, double amount) {
        Transaction t = new Transaction(from, to, amount);
        transactions.add(t);
        outEdges.computeIfAbsent(from, k -> new ArrayList<>()).add(t);
        inEdges.computeIfAbsent(to, k -> new ArrayList<>()).add(t);
    }

    public void detectCircularTransactions() {
        System.out.println("  --- 环形交易检测 ---");
        Set<String> allAccounts = new HashSet<>();
        for (Transaction t : transactions) {
            allAccounts.add(t.from);
            allAccounts.add(t.to);
        }

        Map<String, Boolean> visited = new HashMap<>();
        Map<String, Boolean> recStack = new HashMap<>();
        List<List<String>> cycles = new ArrayList<>();

        for (String acc : allAccounts) {
            visited.put(acc, false);
            recStack.put(acc, false);
        }

        for (String acc : allAccounts) {
            if (!visited.get(acc)) {
                dfsCycle(acc, visited, recStack, new ArrayList<>(), cycles);
            }
        }

        if (cycles.isEmpty()) {
            System.out.println("    未检测到环形交易");
        } else {
            System.out.println("    发现 " + cycles.size() + " 个交易环:");
            for (List<String> cycle : cycles) {
                System.out.println("      " + String.join(" -> ", cycle));
            }
        }
    }

    private void dfsCycle(String node, Map<String, Boolean> visited,
                          Map<String, Boolean> recStack, List<String> path,
                          List<List<String>> cycles) {
        visited.put(node, true);
        recStack.put(node, true);
        path.add(node);

        for (Transaction t : outEdges.getOrDefault(node, Collections.emptyList())) {
            if (!visited.get(t.to)) {
                dfsCycle(t.to, visited, recStack, path, cycles);
            } else if (recStack.get(t.to)) {
                List<String> cycle = new ArrayList<>();
                int idx = path.indexOf(t.to);
                for (int i = idx; i < path.size(); i++) {
                    cycle.add(path.get(i));
                }
                cycle.add(t.to);
                cycles.add(cycle);
            }
        }

        path.remove(path.size() - 1);
        recStack.put(node, false);
    }

    public void detectFanInOut(int threshold) {
        System.out.println("  --- 扇入/扇出检测 (阈值=" + threshold + ") ---");

        System.out.println("  高扇入 (多对一, 疑似资金汇集):");
        boolean hasFanIn = false;
        for (Map.Entry<String, List<Transaction>> entry : inEdges.entrySet()) {
            if (entry.getValue().size() >= threshold) {
                hasFanIn = true;
                System.out.println("    " + entry.getKey() + " 接收了 " + entry.getValue().size()
                        + " 笔交易, 来自: " + entry.getValue().stream()
                        .map(t -> t.from).distinct().toList());
            }
        }
        if (!hasFanIn) System.out.println("    未检测到高扇入模式");

        System.out.println("  高扇出 (一对多, 疑似资金分散):");
        boolean hasFanOut = false;
        for (Map.Entry<String, List<Transaction>> entry : outEdges.entrySet()) {
            if (entry.getValue().size() >= threshold) {
                hasFanOut = true;
                System.out.println("    " + entry.getKey() + " 发起了 " + entry.getValue().size()
                        + " 笔交易, 去向: " + entry.getValue().stream()
                        .map(t -> t.to).distinct().toList());
            }
        }
        if (!hasFanOut) System.out.println("    未检测到高扇出模式");
    }

    public void printAllTransactions() {
        System.out.println("  交易记录:");
        for (Transaction t : transactions) {
            System.out.println("    " + t);
        }
    }

    public static void main(String[] args) {
        System.out.println("=".repeat(60));
        System.out.println("  欺诈检测算法演示");
        System.out.println("=".repeat(60));

        FraudDetection fd = new FraudDetection();

        fd.addTransaction("A", "B", 1000);
        fd.addTransaction("B", "C", 2000);
        fd.addTransaction("C", "A", 1500);
        fd.addTransaction("D", "E", 500);
        fd.addTransaction("E", "F", 800);
        fd.addTransaction("F", "D", 600);
        fd.addTransaction("X", "Y", 300);
        fd.addTransaction("Y", "Z", 400);
        fd.addTransaction("M", "N", 700);
        fd.addTransaction("N", "O", 900);
        fd.addTransaction("O", "M", 1100);

        fd.addTransaction("H", "SINK", 100);
        fd.addTransaction("I", "SINK", 200);
        fd.addTransaction("J", "SINK", 300);
        fd.addTransaction("K", "SINK", 400);
        fd.addTransaction("L", "SINK", 500);

        fd.addTransaction("SOURCE", "P", 1000);
        fd.addTransaction("SOURCE", "Q", 2000);
        fd.addTransaction("SOURCE", "R", 3000);

        fd.printAllTransactions();
        System.out.println();

        fd.detectCircularTransactions();
        System.out.println();

        fd.detectFanInOut(3);
    }
}
