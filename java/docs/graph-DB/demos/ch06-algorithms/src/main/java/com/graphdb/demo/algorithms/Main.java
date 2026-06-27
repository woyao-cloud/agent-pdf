package com.graphdb.demo.algorithms;

public class Main {
    public static void main(String[] args) {
        System.out.println();
        System.out.println("╔" + "═".repeat(58) + "╗");
        System.out.println("║          图算法演示系统 (Graph Algorithm Demos)          ║");
        System.out.println("╚" + "═".repeat(58) + "╝");
        System.out.println();

        System.out.println("=".repeat(60));
        System.out.println("  第1部分: PageRank 算法");
        System.out.println("=".repeat(60));
        PageRank.main(args);
        System.out.println();

        System.out.println("=".repeat(60));
        System.out.println("  第2部分: 社区检测 (标签传播算法 LPA)");
        System.out.println("=".repeat(60));
        CommunityDetection.main(args);
        System.out.println();

        System.out.println("=".repeat(60));
        System.out.println("  第3部分: 最短路径 (Dijkstra vs A*)");
        System.out.println("=".repeat(60));
        ShortestPath.main(args);
        System.out.println();

        System.out.println("=".repeat(60));
        System.out.println("  第4部分: 欺诈检测");
        System.out.println("=".repeat(60));
        FraudDetection.main(args);
        System.out.println();

        System.out.println("=".repeat(60));
        System.out.println("  所有算法演示完成!");
        System.out.println("=".repeat(60));
    }
}
