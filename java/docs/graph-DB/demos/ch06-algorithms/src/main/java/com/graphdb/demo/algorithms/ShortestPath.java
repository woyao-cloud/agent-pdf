package com.graphdb.demo.algorithms;

import java.util.*;

public class ShortestPath {

    static class Node {
        int x, y;
        Node(int x, int y) { this.x = x; this.y = y; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Node n)) return false;
            return x == n.x && y == n.y;
        }

        @Override
        public int hashCode() { return Objects.hash(x, y); }

        @Override
        public String toString() { return "(" + x + "," + y + ")"; }
    }

    static class Edge {
        Node to;
        int weight;
        Edge(Node to, int weight) { this.to = to; this.weight = weight; }
    }

    static class State implements Comparable<State> {
        Node node;
        double dist;
        State(Node node, double dist) { this.node = node; this.dist = dist; }
        @Override
        public int compareTo(State o) { return Double.compare(this.dist, o.dist); }
    }

    private final Map<Node, List<Edge>> graph = new HashMap<>();

    public void addNode(Node n) {
        graph.putIfAbsent(n, new ArrayList<>());
    }

    public void addEdge(Node from, Node to, int weight) {
        graph.putIfAbsent(from, new ArrayList<>());
        graph.putIfAbsent(to, new ArrayList<>());
        graph.get(from).add(new Edge(to, weight));
        graph.get(to).add(new Edge(from, weight));
    }

    public static double manhattan(Node a, Node b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    public static double euclidean(Node a, Node b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }

    public SearchResult dijkstra(Node start, Node goal) {
        Map<Node, Double> dist = new HashMap<>();
        Map<Node, Node> prev = new HashMap<>();
        Set<Node> visited = new HashSet<>();
        PriorityQueue<State> pq = new PriorityQueue<>();

        for (Node n : graph.keySet()) dist.put(n, Double.MAX_VALUE);
        dist.put(start, 0.0);
        pq.add(new State(start, 0.0));

        while (!pq.isEmpty()) {
            State cur = pq.poll();
            if (visited.contains(cur.node)) continue;
            visited.add(cur.node);

            if (cur.node.equals(goal)) break;

            for (Edge e : graph.getOrDefault(cur.node, Collections.emptyList())) {
                double nd = dist.get(cur.node) + e.weight;
                if (nd < dist.get(e.to)) {
                    dist.put(e.to, nd);
                    prev.put(e.to, cur.node);
                    pq.add(new State(e.to, nd));
                }
            }
        }

        return new SearchResult(dist.get(goal), reconstruct(prev, goal), visited.size());
    }

    public SearchResult aStar(Node start, Node goal, boolean useEuclidean) {
        Map<Node, Double> gScore = new HashMap<>();
        Map<Node, Node> prev = new HashMap<>();
        Set<Node> visited = new HashSet<>();
        PriorityQueue<State> pq = new PriorityQueue<>();

        for (Node n : graph.keySet()) gScore.put(n, Double.MAX_VALUE);
        gScore.put(start, 0.0);
        pq.add(new State(start, useEuclidean ? euclidean(start, goal) : manhattan(start, goal)));

        while (!pq.isEmpty()) {
            State cur = pq.poll();
            if (visited.contains(cur.node)) continue;
            visited.add(cur.node);

            if (cur.node.equals(goal)) break;

            for (Edge e : graph.getOrDefault(cur.node, Collections.emptyList())) {
                double tentativeG = gScore.get(cur.node) + e.weight;
                if (tentativeG < gScore.get(e.to)) {
                    gScore.put(e.to, tentativeG);
                    prev.put(e.to, cur.node);
                    double h = useEuclidean ? euclidean(e.to, goal) : manhattan(e.to, goal);
                    pq.add(new State(e.to, tentativeG + h));
                }
            }
        }

        return new SearchResult(gScore.get(goal), reconstruct(prev, goal), visited.size());
    }

    private List<Node> reconstruct(Map<Node, Node> prev, Node goal) {
        List<Node> path = new ArrayList<>();
        Node cur = goal;
        while (cur != null) {
            path.add(cur);
            cur = prev.get(cur);
        }
        Collections.reverse(path);
        return path;
    }

    static class SearchResult {
        double distance;
        List<Node> path;
        int nodesVisited;

        SearchResult(double distance, List<Node> path, int nodesVisited) {
            this.distance = distance;
            this.path = path;
            this.nodesVisited = nodesVisited;
        }
    }

    public static void main(String[] args) {
        System.out.println("=".repeat(60));
        System.out.println("  最短路径算法演示: Dijkstra vs A*");
        System.out.println("=".repeat(60));

        ShortestPath sp = new ShortestPath();

        int rows = 6, cols = 6;
        Node[][] grid = new Node[rows][cols];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                grid[r][c] = new Node(r, c);
                sp.addNode(grid[r][c]);
            }
        }

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (r + 1 < rows) sp.addEdge(grid[r][c], grid[r + 1][c], 1);
                if (c + 1 < cols) sp.addEdge(grid[r][c], grid[r][c + 1], 1);
            }
        }

        Node start = grid[0][0];
        Node goal = grid[5][5];

        System.out.println("  网格图: " + rows + "x" + cols + ", 起点=" + start + ", 终点=" + goal);
        System.out.println();

        SearchResult dij = sp.dijkstra(start, goal);
        System.out.println("  [Dijkstra]");
        System.out.println("    最短距离: " + dij.distance);
        System.out.println("    访问节点数: " + dij.nodesVisited);
        System.out.println("    路径: " + dij.path);

        System.out.println();

        SearchResult astarM = sp.aStar(start, goal, false);
        System.out.println("  [A* (曼哈顿距离)]");
        System.out.println("    最短距离: " + astarM.distance);
        System.out.println("    访问节点数: " + astarM.nodesVisited);
        System.out.println("    路径: " + astarM.path);

        System.out.println();

        SearchResult astarE = sp.aStar(start, goal, true);
        System.out.println("  [A* (欧几里得距离)]");
        System.out.println("    最短距离: " + astarE.distance);
        System.out.println("    访问节点数: " + astarE.nodesVisited);
        System.out.println("    路径: " + astarE.path);

        System.out.println();
        System.out.println("  对比: Dijkstra访问了 " + dij.nodesVisited + " 个节点, "
                + "A*(曼哈顿)访问了 " + astarM.nodesVisited + " 个节点, "
                + "A*(欧几里得)访问了 " + astarE.nodesVisited + " 个节点");
    }
}
