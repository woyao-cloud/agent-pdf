package com.graphdb.mini;

import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

public class TransactionManager {
    private final GraphStore store;
    private final AtomicLong txIdGen = new AtomicLong(0);
    private final ThreadLocal<TransactionContext> currentTx = new ThreadLocal<>();

    public TransactionManager(GraphStore store) {
        this.store = store;
    }

    public TransactionContext beginTransaction() {
        TransactionContext tx = new TransactionContext(txIdGen.incrementAndGet(), store);
        currentTx.set(tx);
        System.out.println("[事务] 开始事务 #" + tx.getTxId());
        return tx;
    }

    public TransactionContext getCurrentTransaction() {
        return currentTx.get();
    }

    public void commit() {
        TransactionContext tx = currentTx.get();
        if (tx == null) throw new IllegalStateException("没有活跃事务");
        tx.commit();
        currentTx.remove();
        System.out.println("[事务] 提交事务 #" + tx.getTxId());
    }

    public void rollback() {
        TransactionContext tx = currentTx.get();
        if (tx == null) throw new IllegalStateException("没有活跃事务");
        tx.rollback();
        currentTx.remove();
        System.out.println("[事务] 回滚事务 #" + tx.getTxId());
    }

    public static class TransactionContext {
        private final long txId;
        private final GraphStore store;
        private final List<Node> pendingNodes = new ArrayList<>();
        private final List<Edge> pendingEdges = new ArrayList<>();
        private final List<long[]> pendingEdgeData = new ArrayList<>();
        private final Set<Long> deletedNodes = new HashSet<>();
        private final Set<Long> deletedEdges = new HashSet<>();
        private boolean finished = false;

        TransactionContext(long txId, GraphStore store) {
            this.txId = txId;
            this.store = store;
        }

        public long getTxId() { return txId; }

        public Node createNode(String label) {
            Node node = new Node(label);
            pendingNodes.add(node);
            return node;
        }

        public Node getNode(long id) {
            if (deletedNodes.contains(id)) return null;
            for (Node n : pendingNodes) {
                if (n.getId() == id) return n;
            }
            return store.getNode(id);
        }

        public Edge createEdge(long sourceId, long targetId, String type) {
            Edge edge = new Edge(type, sourceId, targetId);
            pendingEdges.add(edge);
            pendingEdgeData.add(new long[]{sourceId, targetId});
            return edge;
        }

        public void deleteNode(long id) {
            deletedNodes.add(id);
            pendingNodes.removeIf(n -> n.getId() == id);
        }

        public void commit() {
            if (finished) throw new IllegalStateException("事务已结束");
            for (int i = 0; i < pendingNodes.size(); i++) {
                Node node = pendingNodes.get(i);
                store.addNode(node.getLabels().toArray(new String[0]));
                for (Map.Entry<String, Object> prop : node.getProperties().entrySet()) {
                    store.getNode(node.getId()).setProperty(prop.getKey(), prop.getValue());
                }
            }
            for (int i = 0; i < pendingEdges.size(); i++) {
                Edge edge = pendingEdges.get(i);
                long[] data = pendingEdgeData.get(i);
                store.addEdge(edge.getType(), data[0], data[1]);
            }
            for (long id : deletedNodes) store.removeNode(id);
            for (long id : deletedEdges) store.removeEdge(id);
            finished = true;
        }

        public void rollback() {
            pendingNodes.clear();
            pendingEdges.clear();
            pendingEdgeData.clear();
            deletedNodes.clear();
            deletedEdges.clear();
            finished = true;
        }
    }
}
