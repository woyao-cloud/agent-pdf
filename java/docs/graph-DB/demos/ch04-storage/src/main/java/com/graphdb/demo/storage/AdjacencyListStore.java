package com.graphdb.demo.storage;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.concurrent.atomic.AtomicLong;

public class AdjacencyListStore {

    public static class Node {
        private final long id;
        private final Map<String, Object> properties;

        public Node(long id) {
            this.id = id;
            this.properties = new HashMap<>();
        }

        public Node(long id, Map<String, Object> properties) {
            this.id = id;
            this.properties = new HashMap<>(properties);
        }

        public long getId() { return id; }

        public Map<String, Object> getProperties() { return Collections.unmodifiableMap(properties); }

        public void setProperty(String key, Object value) { properties.put(key, value); }

        public Object getProperty(String key) { return properties.get(key); }

        @Override
        public String toString() {
            return "Node{id=" + id + ", properties=" + properties + "}";
        }
    }

    public static class Edge {
        private final long id;
        private final long sourceId;
        private final long targetId;
        private final String type;
        private final Map<String, Object> properties;

        public Edge(long id, long sourceId, long targetId, String type) {
            this.id = id;
            this.sourceId = sourceId;
            this.targetId = targetId;
            this.type = type;
            this.properties = new HashMap<>();
        }

        public Edge(long id, long sourceId, long targetId, String type, Map<String, Object> properties) {
            this.id = id;
            this.sourceId = sourceId;
            this.targetId = targetId;
            this.type = type;
            this.properties = new HashMap<>(properties);
        }

        public long getId() { return id; }
        public long getSourceId() { return sourceId; }
        public long getTargetId() { return targetId; }
        public String getType() { return type; }
        public Map<String, Object> getProperties() { return Collections.unmodifiableMap(properties); }

        public void setProperty(String key, Object value) { properties.put(key, value); }
        public Object getProperty(String key) { return properties.get(key); }

        public boolean isOutgoingFrom(long nodeId) { return sourceId == nodeId; }
        public boolean isIncomingTo(long nodeId) { return targetId == nodeId; }

        @Override
        public String toString() {
            return "Edge{id=" + id + ", " + sourceId + " -[" + type + "]-> " + targetId + ", props=" + properties + "}";
        }
    }

    public static class GraphStore {
        private final Map<Long, Node> nodes = new ConcurrentHashMap<>();
        private final Map<Long, Edge> edges = new ConcurrentHashMap<>();
        private final Map<Long, List<Edge>> outEdges = new ConcurrentHashMap<>();
        private final Map<Long, List<Edge>> inEdges = new ConcurrentHashMap<>();
        private final ReentrantReadWriteLock rwLock = new ReentrantReadWriteLock();
        private final AtomicLong nodeIdSeq = new AtomicLong(1);
        private final AtomicLong edgeIdSeq = new AtomicLong(1);

        public Node addNode(Map<String, Object> properties) {
            rwLock.writeLock().lock();
            try {
                long id = nodeIdSeq.getAndIncrement();
                Node node = new Node(id, properties);
                nodes.put(id, node);
                outEdges.put(id, Collections.synchronizedList(new ArrayList<>()));
                inEdges.put(id, Collections.synchronizedList(new ArrayList<>()));
                return node;
            } finally {
                rwLock.writeLock().unlock();
            }
        }

        public Node addNodeWithId(long id, Map<String, Object> properties) {
            rwLock.writeLock().lock();
            try {
                Node node = new Node(id, properties);
                nodes.put(id, node);
                outEdges.put(id, Collections.synchronizedList(new ArrayList<>()));
                inEdges.put(id, Collections.synchronizedList(new ArrayList<>()));
                if (id >= nodeIdSeq.get()) {
                    nodeIdSeq.set(id + 1);
                }
                return node;
            } finally {
                rwLock.writeLock().unlock();
            }
        }

        public Node addNode() {
            return addNode(new HashMap<>());
        }

        public Edge addEdge(long sourceId, long targetId, String type) {
            return addEdge(sourceId, targetId, type, new HashMap<>());
        }

        public Edge addEdge(long sourceId, long targetId, String type, Map<String, Object> properties) {
            rwLock.writeLock().lock();
            try {
                if (!nodes.containsKey(sourceId)) {
                    throw new IllegalArgumentException("源节点 " + sourceId + " 不存在");
                }
                if (!nodes.containsKey(targetId)) {
                    throw new IllegalArgumentException("目标节点 " + targetId + " 不存在");
                }
                long id = edgeIdSeq.getAndIncrement();
                Edge edge = new Edge(id, sourceId, targetId, type, properties);
                edges.put(id, edge);
                outEdges.get(sourceId).add(edge);
                inEdges.get(targetId).add(edge);
                return edge;
            } finally {
                rwLock.writeLock().unlock();
            }
        }

        public List<Edge> getNeighbors(long nodeId) {
            rwLock.readLock().lock();
            try {
                List<Edge> result = new ArrayList<>();
                List<Edge> out = outEdges.get(nodeId);
                if (out != null) {
                    result.addAll(out);
                }
                return result;
            } finally {
                rwLock.readLock().unlock();
            }
        }

        public List<Edge> getIncomingNeighbors(long nodeId) {
            rwLock.readLock().lock();
            try {
                List<Edge> result = new ArrayList<>();
                List<Edge> in = inEdges.get(nodeId);
                if (in != null) {
                    result.addAll(in);
                }
                return result;
            } finally {
                rwLock.readLock().unlock();
            }
        }

        public List<Edge> getEdgesByType(long nodeId, String type) {
            rwLock.readLock().lock();
            try {
                List<Edge> result = new ArrayList<>();
                List<Edge> out = outEdges.get(nodeId);
                if (out != null) {
                    for (Edge e : out) {
                        if (e.getType().equals(type)) {
                            result.add(e);
                        }
                    }
                }
                return result;
            } finally {
                rwLock.readLock().unlock();
            }
        }

        public Node getNode(long nodeId) {
            rwLock.readLock().lock();
            try {
                return nodes.get(nodeId);
            } finally {
                rwLock.readLock().unlock();
            }
        }

        public int getNodeCount() {
            rwLock.readLock().lock();
            try {
                return nodes.size();
            } finally {
                rwLock.readLock().unlock();
            }
        }

        public int getEdgeCount() {
            rwLock.readLock().lock();
            try {
                return edges.size();
            } finally {
                rwLock.readLock().unlock();
            }
        }

        public Collection<Node> getAllNodes() {
            rwLock.readLock().lock();
            try {
                return new ArrayList<>(nodes.values());
            } finally {
                rwLock.readLock().unlock();
            }
        }

        public Collection<Edge> getAllEdges() {
            rwLock.readLock().lock();
            try {
                return new ArrayList<>(edges.values());
            } finally {
                rwLock.readLock().unlock();
            }
        }
    }

    public static void main(String[] args) {
        System.out.println("========== 邻接表图存储引擎演示 ==========");
        System.out.println();

        GraphStore graph = new GraphStore();

        System.out.println("--- 创建社交图谱节点 ---");
        Node alice = graph.addNode(Map.of("name", "Alice", "age", 30, "city", "北京"));
        Node bob = graph.addNode(Map.of("name", "Bob", "age", 25, "city", "上海"));
        Node carol = graph.addNode(Map.of("name", "Carol", "age", 35, "city", "深圳"));
        Node dave = graph.addNode(Map.of("name", "Dave", "age", 28, "city", "北京"));
        Node eve = graph.addNode(Map.of("name", "Eve", "age", 32, "city", "杭州"));

        System.out.println("已创建 " + graph.getNodeCount() + " 个节点");
        for (Node n : graph.getAllNodes()) {
            System.out.println("  " + n);
        }
        System.out.println();

        System.out.println("--- 创建社交关系边 ---");
        graph.addEdge(alice.getId(), bob.getId(), "FOLLOWS", Map.of("since", "2023-01"));
        graph.addEdge(alice.getId(), carol.getId(), "FOLLOWS", Map.of("since", "2023-03"));
        graph.addEdge(bob.getId(), alice.getId(), "FOLLOWS", Map.of("since", "2023-02"));
        graph.addEdge(bob.getId(), dave.getId(), "FOLLOWS", Map.of("since", "2024-06"));
        graph.addEdge(carol.getId(), eve.getId(), "FOLLOWS", Map.of("since", "2024-01"));
        graph.addEdge(dave.getId(), alice.getId(), "FOLLOWS", Map.of("since", "2024-08"));
        graph.addEdge(eve.getId(), alice.getId(), "FOLLOWS", Map.of("since", "2024-04"));
        graph.addEdge(alice.getId(), dave.getId(), "BLOCKED", Map.of("reason", "spam"));

        System.out.println("已创建 " + graph.getEdgeCount() + " 条边");
        for (Edge e : graph.getAllEdges()) {
            System.out.println("  " + e);
        }
        System.out.println();

        System.out.println("--- 查询: Alice 的出边邻居 (关注的人) ---");
        List<Edge> aliceOut = graph.getNeighbors(alice.getId());
        for (Edge e : aliceOut) {
            Node target = graph.getNode(e.getTargetId());
            System.out.println("  Alice -[" + e.getType() + "]-> " + target.getProperty("name")
                    + " (since=" + e.getProperty("since") + ")");
        }
        System.out.println();

        System.out.println("--- 查询: Alice 的入边邻居 (关注 Alice 的人) ---");
        List<Edge> aliceIn = graph.getIncomingNeighbors(alice.getId());
        for (Edge e : aliceIn) {
            Node source = graph.getNode(e.getSourceId());
            System.out.println("  " + source.getProperty("name") + " -[" + e.getType() + "]-> Alice"
                    + " (since=" + e.getProperty("since") + ")");
        }
        System.out.println();

        System.out.println("--- 查询: Alice 的 FOLLOWS 类型边 ---");
        List<Edge> follows = graph.getEdgesByType(alice.getId(), "FOLLOWS");
        System.out.println("  Alice 有 " + follows.size() + " 条 FOLLOWS 出边");
        for (Edge e : follows) {
            Node target = graph.getNode(e.getTargetId());
            System.out.println("    -> " + target.getProperty("name"));
        }
        System.out.println();

        System.out.println("--- 内存结构说明 ---");
        System.out.println("  邻接表使用 ConcurrentHashMap 存储:");
        System.out.println("    nodes:    节点ID -> Node 对象");
        System.out.println("    edges:    边ID   -> Edge 对象");
        System.out.println("    outEdges: 节点ID -> 出边列表");
        System.out.println("    inEdges:  节点ID -> 入边列表");
        System.out.println("  每个节点维护独立的出边/入边列表，查询邻居 O(degree)");
        System.out.println("  使用 ReadWriteLock 保证线程安全");
        System.out.println();

        System.out.println("========== 邻接表演示结束 ==========");
    }
}
