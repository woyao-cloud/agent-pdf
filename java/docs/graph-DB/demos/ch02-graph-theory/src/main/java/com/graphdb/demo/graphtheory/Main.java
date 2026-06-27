package com.graphdb.demo.graphtheory;

public class Main {
    public static void main(String[] args) {
        System.out.println("========================================");
        System.out.println("  图论基础算法演示 (Graph Theory Demos)");
        System.out.println("========================================");
        System.out.println();

        GraphRepresentation.main(args);

        System.out.println("========================================");
        System.out.println();

        GraphTraversal.main(args);

        System.out.println("========================================");
        System.out.println();

        ShortestPath.main(args);

        System.out.println("========================================");
        System.out.println("  所有演示完成");
        System.out.println("========================================");
    }
}
