package com.graphdb.mini;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.stream.Collectors;

public class GraphStore {
    private final Map<Long, Node> nodes = new ConcurrentHashMap<>();
    private final Map<Long, Edge> edges = new ConcurrentHashMap<>();
    private final ReentrantReadWriteLock rwLock = new ReentrantReadWriteLock();

    public Node addNode(String... labels) {
        Node node = new Node(labels);
        rwLock.writeLock().lock();
        try {
            nodes.put(node.getId(), node);
        } finally {
            rwLock.writeLock().unlock();
        }
        return node;
    }

    public void removeNode(long nodeId) {
        rwLock.writeLock().lock();
        try {
            Node node = nodes.get(nodeId);
            if (node == null) return;
            Set<Long> allEdgeIds = new HashSet<>();
            allEdgeIds.addAll(node.getIncomingEdges());
            allEdgeIds.addAll(node.getOutgoingEdges());
            for (long eid : allEdgeIds) {
                Edge edge = edges.get(eid);
                if (edge != null) {
                    removeEdgeRefs(edge);
                    edges.remove(eid);
                }
            }
            nodes.remove(nodeId);
        } finally {
            rwLock.writeLock().unlock();
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

    public Edge addEdge(String type, long sourceNodeId, long targetNodeId) {
        Node source = nodes.get(sourceNodeId);
        Node target = nodes.get(targetNodeId);
        if (source == null || target == null) {
            throw new IllegalArgumentException("源节点或目标节点不存在");
        }
        Edge edge = new Edge(type, sourceNodeId, targetNodeId);
        rwLock.writeLock().lock();
        try {
            edges.put(edge.getId(), edge);
            source.addOutgoingEdge(edge.getId());
            target.addIncomingEdge(edge.getId());
        } finally {
            rwLock.writeLock().unlock();
        }
        return edge;
    }

    public void removeEdge(long edgeId) {
        rwLock.writeLock().lock();
        try {
            Edge edge = edges.get(edgeId);
            if (edge == null) return;
            removeEdgeRefs(edge);
            edges.remove(edgeId);
        } finally {
            rwLock.writeLock().unlock();
        }
    }

    private void removeEdgeRefs(Edge edge) {
        Node source = nodes.get(edge.getSourceNodeId());
        Node target = nodes.get(edge.getTargetNodeId());
        if (source != null) source.removeOutgoingEdge(edge.getId());
        if (target != null) target.removeIncomingEdge(edge.getId());
    }

    public Edge getEdge(long edgeId) {
        rwLock.readLock().lock();
        try {
            return edges.get(edgeId);
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public Map<Long, Node> getNodes() {
        rwLock.readLock().lock();
        try {
            return Collections.unmodifiableMap(new HashMap<>(nodes));
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public Map<Long, Edge> getEdges() {
        rwLock.readLock().lock();
        try {
            return Collections.unmodifiableMap(new HashMap<>(edges));
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public List<Node> getNeighbors(long nodeId, Edge.Direction direction, String edgeType) {
        Node node = getNode(nodeId);
        if (node == null) return List.of();
        Set<Long> edgeIds = new HashSet<>();
        if (direction == Edge.Direction.OUTGOING || direction == Edge.Direction.BOTH) {
            edgeIds.addAll(node.getOutgoingEdges());
        }
        if (direction == Edge.Direction.INCOMING || direction == Edge.Direction.BOTH) {
            edgeIds.addAll(node.getIncomingEdges());
        }
        rwLock.readLock().lock();
        try {
            return edgeIds.stream()
                .map(edges::get)
                .filter(Objects::nonNull)
                .filter(e -> edgeType == null || e.getType().equals(edgeType))
                .map(e -> {
                    long neighborId = (direction == Edge.Direction.INCOMING)
                        ? e.getSourceNodeId() : e.getTargetNodeId();
                    if (direction == Edge.Direction.BOTH) {
                        neighborId = (e.getSourceNodeId() == nodeId)
                            ? e.getTargetNodeId() : e.getSourceNodeId();
                    }
                    return nodes.get(neighborId);
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public void acquireReadLock() { rwLock.readLock().lock(); }
    public void releaseReadLock() { rwLock.readLock().unlock(); }
    public void acquireWriteLock() { rwLock.writeLock().lock(); }
    public void releaseWriteLock() { rwLock.writeLock().unlock(); }
}
