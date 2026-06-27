package com.graphdb.demo.storage;

import java.util.*;

public class CSRStore {

    private final long[] nodeIds;
    private final int[] offsets;
    private final long[] edgeTargets;
    private final String[] edgeTypes;
    private final Map<Long, Map<String, Object>> nodeProperties;
    private final Map<Long, Map<String, Object>> edgeProperties;
    private final Map<Long, Integer> nodeIdToIndex;

    public CSRStore(AdjacencyListStore.GraphStore graph) {
        Collection<AdjacencyListStore.Node> nodes = graph.getAllNodes();
        Collection<AdjacencyListStore.Edge> edges = graph.getAllEdges();

        int n = nodes.size();
        nodeIds = new long[n];
        nodeProperties = new HashMap<>();
        nodeIdToIndex = new HashMap<>(n);

        int idx = 0;
        for (AdjacencyListStore.Node node : nodes) {
            nodeIds[idx] = node.getId();
            nodeProperties.put(node.getId(), new HashMap<>(node.getProperties()));
            nodeIdToIndex.put(node.getId(), idx);
            idx++;
        }

        List<Long> sortedNodeIds = new ArrayList<>();
        for (long id : nodeIds) sortedNodeIds.add(id);
        Collections.sort(sortedNodeIds);

        offsets = new int[n + 1];
        List<Long> targetsList = new ArrayList<>();
        List<String> typesList = new ArrayList<>();
        edgeProperties = new HashMap<>();

        int edgeIdx = 0;
        for (int i = 0; i < n; i++) {
            offsets[i] = edgeIdx;
            long nodeId = sortedNodeIds.get(i);
            List<AdjacencyListStore.Edge> outEdges = graph.getNeighbors(nodeId);
            outEdges.sort(Comparator.comparingLong(AdjacencyListStore.Edge::getTargetId));

            for (AdjacencyListStore.Edge e : outEdges) {
                targetsList.add(e.getTargetId());
                typesList.add(e.getType());
                edgeProperties.put(e.getId(), new HashMap<>(e.getProperties()));
                edgeIdx++;
            }
        }
        offsets[n] = edgeIdx;

        edgeTargets = new long[targetsList.size()];
        for (int i = 0; i < targetsList.size(); i++) {
            edgeTargets[i] = targetsList.get(i);
        }
        edgeTypes = new String[typesList.size()];
        for (int i = 0; i < typesList.size(); i++) {
            edgeTypes[i] = typesList.get(i);
        }
    }

    public int getNodeCount() { return nodeIds.length; }

    public int getEdgeCount() { return edgeTargets.length; }

    public long[] getNeighbors(long nodeId) {
        Integer idx = nodeIdToIndex.get(nodeId);
        if (idx == null) return new long[0];
        int start = offsets[idx];
        int end = offsets[idx + 1];
        return Arrays.copyOfRange(edgeTargets, start, end);
    }

    public CSRNeighborIterable getNeighborIterable(long nodeId) {
        Integer idx = nodeIdToIndex.get(nodeId);
        if (idx == null) return new CSRNeighborIterable(0, 0, edgeTargets, edgeTypes);
        return new CSRNeighborIterable(offsets[idx], offsets[idx + 1], edgeTargets, edgeTypes);
    }

    public static class CSRNeighborIterable implements Iterable<CSRNeighbor> {
        private final int start;
        private final int end;
        private final long[] targets;
        private final String[] types;

        CSRNeighborIterable(int start, int end, long[] targets, String[] types) {
            this.start = start;
            this.end = end;
            this.targets = targets;
            this.types = types;
        }

        @Override
        public Iterator<CSRNeighbor> iterator() {
            return new Iterator<>() {
                private int pos = start;

                @Override
                public boolean hasNext() { return pos < end; }

                @Override
                public CSRNeighbor next() {
                    if (!hasNext()) throw new NoSuchElementException();
                    CSRNeighbor nb = new CSRNeighbor(targets[pos], types[pos]);
                    pos++;
                    return nb;
                }
            };
        }
    }

    public static class CSRNeighbor {
        private final long targetId;
        private final String edgeType;

        CSRNeighbor(long targetId, String edgeType) {
            this.targetId = targetId;
            this.edgeType = edgeType;
        }

        public long getTargetId() { return targetId; }
        public String getEdgeType() { return edgeType; }

        @Override
        public String toString() {
            return "-> " + targetId + " [" + edgeType + "]";
        }
    }

    public Map<String, Object> getNodeProperties(long nodeId) {
        return nodeProperties.get(nodeId);
    }

    public long estimateMemoryBytes() {
        long total = 0;
        total += nodeIds.length * 8L;
        total += offsets.length * 4L;
        total += edgeTargets.length * 8L;
        total += edgeTypes.length * 40L;
        for (Map.Entry<Long, Map<String, Object>> e : nodeProperties.entrySet()) {
            total += 8 + 48;
            for (Map.Entry<String, Object> p : e.getValue().entrySet()) {
                total += p.getKey().length() * 2L + 8;
            }
        }
        return total;
    }

    public void printCSRStructure() {
        System.out.println("CSR 结构:");
        System.out.println("  节点数: " + getNodeCount() + ", 边数: " + getEdgeCount());
        System.out.println();
        System.out.println("  offset 数组 (每个节点的出边在 edges 数组中的起始位置):");
        System.out.print("    [");
        for (int i = 0; i < offsets.length; i++) {
            if (i > 0) System.out.print(", ");
            System.out.printf("%2d", offsets[i]);
        }
        System.out.println("]");
        System.out.println();
        System.out.println("  edges 数组 (按节点排序的邻居目标ID):");
        System.out.print("    [");
        for (int i = 0; i < edgeTargets.length; i++) {
            if (i > 0) System.out.print(", ");
            System.out.printf("%2d", edgeTargets[i]);
        }
        System.out.println("]");
        System.out.println();
        System.out.println("  edgeTypes 数组 (对应的边类型):");
        System.out.print("    [");
        for (int i = 0; i < edgeTypes.length; i++) {
            if (i > 0) System.out.print(", ");
            System.out.printf("%-8s", edgeTypes[i]);
        }
        System.out.println("]");
        System.out.println();
    }

    public static void main(String[] args) {
        System.out.println("========== CSR (压缩稀疏行) 存储引擎演示 ==========");
        System.out.println();

        AdjacencyListStore.GraphStore graph = new AdjacencyListStore.GraphStore();

        long n1 = graph.addNode(Map.of("name", "A")).getId();
        long n2 = graph.addNode(Map.of("name", "B")).getId();
        long n3 = graph.addNode(Map.of("name", "C")).getId();
        long n4 = graph.addNode(Map.of("name", "D")).getId();
        long n5 = graph.addNode(Map.of("name", "E")).getId();

        graph.addEdge(n1, n2, "KNOWS");
        graph.addEdge(n1, n3, "KNOWS");
        graph.addEdge(n1, n4, "LIKES");
        graph.addEdge(n2, n1, "KNOWS");
        graph.addEdge(n2, n5, "KNOWS");
        graph.addEdge(n3, n1, "KNOWS");
        graph.addEdge(n4, n1, "LIKES");
        graph.addEdge(n5, n2, "FOLLOWS");

        System.out.println("--- 从邻接表构建 CSR ---");
        CSRStore csr = new CSRStore(graph);
        csr.printCSRStructure();

        System.out.println("--- CSR 邻居遍历 ---");
        for (int i = 0; i < csr.getNodeCount(); i++) {
            long nodeId = csr.nodeIds[i];
            String name = (String) csr.getNodeProperties(nodeId).get("name");
            System.out.println("  节点 " + name + " (ID=" + nodeId + ") 的出边:");
            for (CSRNeighbor nb : csr.getNeighborIterable(nodeId)) {
                System.out.println("    -> ID=" + nb.getTargetId() + " [" + nb.getEdgeType() + "]");
            }
            System.out.println();
        }

        System.out.println("--- 内存占用估算 ---");
        long csrBytes = csr.estimateMemoryBytes();
        System.out.println("  CSR 结构估算内存: " + csrBytes + " 字节 (" + String.format("%.2f", csrBytes / 1024.0) + " KB)");
        System.out.println();

        System.out.println("--- 邻接表 vs CSR 对比 ---");
        System.out.println("  特性          | 邻接表 (Adjacency List)     | CSR");
        System.out.println("  -------------+----------------------------+---------------------");
        System.out.println("  邻居查询      | O(degree) 直接遍历列表     | O(degree) 数组连续访问");
        System.out.println("  缓存局部性    | 差 (链表/ArrayList 分散)    | 优 (连续内存, CPU缓存友好)");
        System.out.println("  内存开销      | 高 (每条边存对象头+引用)   | 低 (纯数组, 无对象开销)");
        System.out.println("  动态增删边    | O(1) 直接操作列表          | 需重建整个结构");
        System.out.println("  适合场景      | 频繁更新的动态图           | 静态/只读分析型负载");
        System.out.println();

        System.out.println("========== CSR 演示结束 ==========");
    }
}
