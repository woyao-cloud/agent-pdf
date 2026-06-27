package com.graphdb.mini;

import java.util.*;

public class QueryEngine {
    private final GraphStore store;
    private final IndexManager indexManager;

    public QueryEngine(GraphStore store, IndexManager indexManager) {
        this.store = store;
        this.indexManager = indexManager;
    }

    public List<Node> findNodesByLabel(String label) {
        List<Node> result = new ArrayList<>();
        for (Node node : store.getNodes().values()) {
            if (node.hasLabel(label)) result.add(node);
        }
        return result;
    }

    public List<Node> findNodesByProperty(String label, String key, Object value) {
        Set<Long> indexed = indexManager.findNodes(label, key, value);
        if (!indexed.isEmpty()) {
            List<Node> result = new ArrayList<>();
            for (Long id : indexed) {
                Node node = store.getNode(id);
                if (node != null) result.add(node);
            }
            return result;
        }
        List<Node> result = new ArrayList<>();
        for (Node node : store.getNodes().values()) {
            if (label != null && !node.hasLabel(label)) continue;
            Object propVal = node.getProperty(key);
            if (propVal != null && propVal.equals(value)) result.add(node);
        }
        return result;
    }

    public List<Map<String, Object>> traverse(long startId, String edgeType, String direction, int maxDepth) {
        List<Map<String, Object>> result = new ArrayList<>();
        Node start = store.getNode(startId);
        if (start == null) return result;

        Set<Long> visited = new HashSet<>();
        Queue<Map<String, Object>> queue = new LinkedList<>();
        queue.add(Map.of("node", start, "depth", 0, "path", List.of(startId)));
        visited.add(startId);

        while (!queue.isEmpty()) {
            Map<String, Object> current = queue.poll();
            Node currentNode = (Node) current.get("node");
            int depth = (int) current.get("depth");
            @SuppressWarnings("unchecked")
            List<Long> path = (List<Long>) current.get("path");

            if (depth > 0) {
                Map<String, Object> entry = new HashMap<>(current);
                entry.remove("node");
                entry.put("nodeId", currentNode.getId());
                entry.put("nodeLabel", String.join(",", currentNode.getLabels()));
                entry.put("nodeName", currentNode.getProperty("name"));
                result.add(entry);
            }

            if (depth >= maxDepth) continue;

            Edge.Direction dir = direction.equals("INCOMING") ? Edge.Direction.INCOMING
                : direction.equals("BOTH") ? Edge.Direction.BOTH : Edge.Direction.OUTGOING;

            List<Node> neighbors = store.getNeighbors(currentNode.getId(), dir, edgeType);
            for (Node neighbor : neighbors) {
                if (!visited.contains(neighbor.getId())) {
                    visited.add(neighbor.getId());
                    List<Long> newPath = new ArrayList<>(path);
                    newPath.add(neighbor.getId());
                    queue.add(Map.of("node", neighbor, "depth", depth + 1, "path", newPath));
                }
            }
        }
        return result;
    }

    public List<Long> findPath(long fromId, long toId, int maxDepth) {
        if (fromId == toId) return List.of(fromId);
        Node from = store.getNode(fromId);
        Node to = store.getNode(toId);
        if (from == null || to == null) return Collections.emptyList();

        Queue<Long> queue = new LinkedList<>();
        Map<Long, Long> parent = new HashMap<>();
        Set<Long> visited = new HashSet<>();
        queue.add(fromId);
        visited.add(fromId);
        parent.put(fromId, -1L);

        while (!queue.isEmpty()) {
            long current = queue.poll();
            if (current == toId) break;
            Node currentNode = store.getNode(current);
            if (currentNode == null) continue;
            List<Node> neighbors = store.getNeighbors(current, Edge.Direction.BOTH, null);
            for (Node neighbor : neighbors) {
                if (!visited.contains(neighbor.getId())) {
                    visited.add(neighbor.getId());
                    parent.put(neighbor.getId(), current);
                    queue.add(neighbor.getId());
                }
            }
        }
        if (!parent.containsKey(toId)) return Collections.emptyList();
        List<Long> path = new LinkedList<>();
        for (long at = toId; at != -1; at = parent.get(at)) path.add(0, at);
        return path;
    }

    public void executeSimpleQuery(String query) {
        System.out.println("\n[查询] " + query);
        String upper = query.toUpperCase().trim();
        if (upper.startsWith("MATCH")) {
            if (upper.contains("WHERE")) {
                String condition = query.substring(upper.indexOf("WHERE") + 5).trim();
                String[] parts = condition.split("=");
                if (parts.length == 2) {
                    String key = parts[0].trim();
                    String val = parts[1].trim().replace("'", "");
                    List<Node> nodes = findNodesByProperty(null, key, val);
                    System.out.println("  找到 " + nodes.size() + " 个节点:");
                    for (Node n : nodes) System.out.println("    [" + n.getId() + "] " + n.getProperties());
                }
            } else {
                String label = extractLabel(query);
                if (label != null) {
                    List<Node> nodes = findNodesByLabel(label);
                    System.out.println("  找到 " + nodes.size() + " 个 " + label + " 节点");
                }
            }
        } else if (upper.startsWith("FIND PATH")) {
            System.out.println("  路径查询需要调用 findPath() 方法");
        }
    }

    private String extractLabel(String query) {
        int idx = query.indexOf(":");
        if (idx > 0) {
            int end = query.indexOf(" ", idx);
            return end > 0 ? query.substring(idx + 1, end).trim() : query.substring(idx + 1).trim();
        }
        return null;
    }
}
