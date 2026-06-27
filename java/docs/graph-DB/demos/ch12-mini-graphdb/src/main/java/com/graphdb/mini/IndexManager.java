package com.graphdb.mini;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class IndexManager {
    private final Map<String, Map<String, Map<Object, Set<Long>>>> hashIndex = new ConcurrentHashMap<>();
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    public void addIndex(String label, String propertyKey) {
        hashIndex.computeIfAbsent(label, k -> new ConcurrentHashMap<>())
                .computeIfAbsent(propertyKey, k -> new ConcurrentHashMap<>());
        System.out.println("[索引] 创建索引: " + label + "." + propertyKey);
    }

    public void indexNode(Node node) {
        for (String label : node.getLabels()) {
            Map<String, Map<Object, Set<Long>>> labelIndex = hashIndex.get(label);
            if (labelIndex == null) continue;
            for (Map.Entry<String, Object> prop : node.getProperties().entrySet()) {
                Map<Object, Set<Long>> propIndex = labelIndex.get(prop.getKey());
                if (propIndex != null) {
                    propIndex.computeIfAbsent(prop.getValue(), k -> ConcurrentHashMap.newKeySet())
                            .add(node.getId());
                }
            }
        }
    }

    public void removeNodeFromIndex(Node node) {
        for (String label : node.getLabels()) {
            Map<String, Map<Object, Set<Long>>> labelIndex = hashIndex.get(label);
            if (labelIndex == null) continue;
            for (Map.Entry<String, Object> prop : node.getProperties().entrySet()) {
                Map<Object, Set<Long>> propIndex = labelIndex.get(prop.getKey());
                if (propIndex != null) {
                    Set<Long> ids = propIndex.get(prop.getValue());
                    if (ids != null) ids.remove(node.getId());
                }
            }
        }
    }

    public Set<Long> findNodes(String label, String propertyKey, Object value) {
        lock.readLock().lock();
        try {
            Map<String, Map<Object, Set<Long>>> labelIndex = hashIndex.get(label);
            if (labelIndex == null) return Collections.emptySet();
            Map<Object, Set<Long>> propIndex = labelIndex.get(propertyKey);
            if (propIndex == null) return Collections.emptySet();
            Set<Long> result = propIndex.get(value);
            return result != null ? result : Collections.emptySet();
        } finally {
            lock.readLock().unlock();
        }
    }

    public void printIndexStats() {
        System.out.println("\n=== 索引统计 ===");
        for (Map.Entry<String, Map<String, Map<Object, Set<Long>>>> labelEntry : hashIndex.entrySet()) {
            for (Map.Entry<String, Map<Object, Set<Long>>> propEntry : labelEntry.getValue().entrySet()) {
                int totalEntries = propEntry.getValue().values().stream().mapToInt(Set::size).sum();
                System.out.println("  " + labelEntry.getKey() + "." + propEntry.getKey() + " -> " + totalEntries + " 条索引");
            }
        }
    }
}
