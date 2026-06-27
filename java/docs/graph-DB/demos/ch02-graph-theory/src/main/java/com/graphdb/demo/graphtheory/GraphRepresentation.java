package com.graphdb.demo.graphtheory;

import java.util.ArrayList;
import java.util.List;

public class GraphRepresentation {

    private static final int[][] SAMPLE_EDGES = {
        {0, 1}, {0, 2}, {1, 2}, {1, 3},
        {2, 4}, {3, 4}, {3, 5}, {4, 5}
    };
    private static final int N = 6;
    private static final int E = SAMPLE_EDGES.length;

    public static void main(String[] args) {
        System.out.println("========== 图存储结构演示 ==========");
        System.out.println("示例图：6个节点，8条无向边");
        System.out.println("边列表：");
        for (int[] e : SAMPLE_EDGES) {
            System.out.println("  " + e[0] + " -- " + e[1]);
        }
        System.out.println();

        demoAdjacencyMatrix();
        demoAdjacencyList();
        demoCSR();
    }

    private static void demoAdjacencyMatrix() {
        System.out.println("--- 邻接矩阵 (Adjacency Matrix) ---");
        boolean[][] matrix = new boolean[N][N];
        for (int[] e : SAMPLE_EDGES) {
            matrix[e[0]][e[1]] = true;
            matrix[e[1]][e[0]] = true;
        }

        System.out.print("   ");
        for (int j = 0; j < N; j++) System.out.print(" " + j);
        System.out.println();
        for (int i = 0; i < N; i++) {
            System.out.print(" " + i + " ");
            for (int j = 0; j < N; j++) {
                System.out.print(matrix[i][j] ? " 1" : " 0");
            }
            System.out.println();
        }

        long mem = estimateMemory(N * N);
        System.out.println("空间复杂度: O(V²) = O(" + N + "²)");
        System.out.println("估算内存: " + mem + " 字节 (boolean[" + N + "][" + N + "])");
        System.out.println("优点: 判断边存在 O(1), 实现简单");
        System.out.println("缺点: 稀疏图浪费空间, 遍历邻居 O(V)");
        System.out.println();
    }

    private static void demoAdjacencyList() {
        System.out.println("--- 邻接表 (Adjacency List) ---");
        List<List<Integer>> adj = new ArrayList<>(N);
        for (int i = 0; i < N; i++) adj.add(new ArrayList<>());
        for (int[] e : SAMPLE_EDGES) {
            adj.get(e[0]).add(e[1]);
            adj.get(e[1]).add(e[0]);
        }

        for (int i = 0; i < N; i++) {
            System.out.println("  " + i + " -> " + adj.get(i));
        }

        long mem = estimateMemory(N + 2 * E);
        System.out.println("空间复杂度: O(V + E) = O(" + N + " + " + (2 * E) + ")");
        System.out.println("估算内存: " + mem + " 字节 (ArrayList + Integer 对象开销)");
        System.out.println("优点: 稀疏图节省空间, 遍历邻居 O(deg(v))");
        System.out.println("缺点: 判断边存在 O(deg(v)), 对象开销大");
        System.out.println();
    }

    private static void demoCSR() {
        System.out.println("--- CSR (Compressed Sparse Row) ---");
        int[] offsets = new int[N + 1];
        for (int[] e : SAMPLE_EDGES) {
            offsets[e[0] + 1]++;
            offsets[e[1] + 1]++;
        }
        for (int i = 1; i <= N; i++) {
            offsets[i] += offsets[i - 1];
        }

        int totalEdges = offsets[N];
        int[] edges = new int[totalEdges];
        int[] tempPos = new int[N + 1];
        System.arraycopy(offsets, 0, tempPos, 0, N + 1);
        for (int[] e : SAMPLE_EDGES) {
            edges[tempPos[e[0]]++] = e[1];
            edges[tempPos[e[1]]++] = e[0];
        }

        System.out.print("  offsets[] = [");
        for (int i = 0; i <= N; i++) {
            System.out.print(offsets[i]);
            if (i < N) System.out.print(", ");
        }
        System.out.println("]");

        System.out.print("  edges[]   = [");
        for (int i = 0; i < totalEdges; i++) {
            System.out.print(edges[i]);
            if (i < totalEdges - 1) System.out.print(", ");
        }
        System.out.println("]");

        System.out.println("  节点 0 的邻居: edges[" + offsets[0] + ":" + offsets[1] + ") = "
            + neighbors(edges, offsets[0], offsets[1]));
        System.out.println("  节点 3 的邻居: edges[" + offsets[3] + ":" + offsets[4] + ") = "
            + neighbors(edges, offsets[3], offsets[4]));

        long mem = estimateMemory((N + 1) + totalEdges);
        System.out.println("空间复杂度: O(V + E) = O(" + N + " + " + totalEdges + ")");
        System.out.println("估算内存: " + mem + " 字节 (两个 int 数组, 无对象开销)");
        System.out.println("优点: 缓存友好, 无对象开销, 图数据库/计算框架标准格式");
        System.out.println("缺点: 插入/删除边代价高");
        System.out.println();
    }

    private static String neighbors(int[] edges, int start, int end) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = start; i < end; i++) {
            sb.append(edges[i]);
            if (i < end - 1) sb.append(", ");
        }
        sb.append("]");
        return sb.toString();
    }

    private static long estimateMemory(int intCount) {
        return (long) intCount * 4;
    }
}
